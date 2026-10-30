-- Meta do Painel de Vendas acompanha o cenario de planejamento.
-- O valor (R$) e o %MB das linhas da carga que vieram em branco sao assumidos do cenario (326), mas ficavam congelados na hora de aplicar o lote.
-- Agora, sempre que as premissas (FAT/un, MP/un, ajustes) ou os impostos do cenario mudam, o razao da carga e recalculado.
-- Linhas que a carga trouxe com valor e %MB preenchidos nao sao tocadas.
begin;

create or replace function public.comercial_planejado_recalcular_cenario(p_scenario uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 perform set_config('vecton.planejado_recalc','1',true);
 with calc as (
   select l.id,coalesce(d.valor,0) valor,d.mb_pct,l.valor old_valor,l.mb_pct old_mb
     from public.comercial_planejado_ledger_entries l
     join public.comercial_planejado_import_rows r on r.id=l.batch_row_id
    cross join lateral public.comercial_planejado_assumir_cenario(l.organization_id,l.scenario_id,l.produto_id,l.territorio_id,l.quantidade,r.valor,r.mb_pct) d
    where l.scenario_id=p_scenario and (r.valor is null or r.mb_pct is null))
 update public.comercial_planejado_ledger_entries l set valor=c.valor,mb_pct=c.mb_pct
   from calc c where c.id=l.id and (c.old_valor is distinct from c.valor or c.old_mb is distinct from c.mb_pct);
 get diagnostics n=row_count;
 perform set_config('vecton.planejado_recalc','0',true);
 return n;
end $$;
revoke all on function public.comercial_planejado_recalcular_cenario(uuid) from public,anon,authenticated;

create or replace function public.planning_fat_recalc_planejado() returns trigger
language plpgsql security definer set search_path=public as $$
declare r record;
begin
 if tg_op='DELETE' then
   for r in select distinct scenario_id from old_rows loop perform public.comercial_planejado_recalcular_cenario(r.scenario_id);end loop;
 else
   for r in select distinct scenario_id from new_rows loop perform public.comercial_planejado_recalcular_cenario(r.scenario_id);end loop;
 end if;
 return null;
end $$;
revoke all on function public.planning_fat_recalc_planejado() from public,anon,authenticated;

-- A espelhagem ledger -> volumes do FAT (323) nao precisa rodar quando so o preco mudou.
create or replace function public.planning_fat_sync_planned() returns trigger
language plpgsql security definer set search_path=public as $$
declare r record;
begin
 if coalesce(current_setting('vecton.planejado_recalc',true),'0')='1' then return null;end if;
 for r in select distinct organization_id,scenario_id,reference_year,reference_month from new_rows where scenario_id is not null loop
   perform public.planning_fat_sync_planned_month(r.organization_id,r.scenario_id,r.reference_year,r.reference_month);
 end loop;
 return null;
end $$;

do $$declare t text;begin
 foreach t in array array['planning_fat_premises','planning_fat_taxes'] loop
  execute format('drop trigger if exists %I on public.%I','recalc_planejado_ins_'||t,t);execute format('drop trigger if exists %I on public.%I','recalc_planejado_upd_'||t,t);execute format('drop trigger if exists %I on public.%I','recalc_planejado_del_'||t,t);
  execute format('create trigger %I after insert on public.%I referencing new table as new_rows for each statement execute function public.planning_fat_recalc_planejado()','recalc_planejado_ins_'||t,t);
  execute format('create trigger %I after update on public.%I referencing new table as new_rows for each statement execute function public.planning_fat_recalc_planejado()','recalc_planejado_upd_'||t,t);
  execute format('create trigger %I after delete on public.%I referencing old table as old_rows for each statement execute function public.planning_fat_recalc_planejado()','recalc_planejado_del_'||t,t);
 end loop;
end $$;

commit;
