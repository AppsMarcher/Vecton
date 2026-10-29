-- Carga de vendas planejadas (arquivo) alimenta os volumes do formulário FAT do mesmo cenário.
-- Ao aplicar um lote na tela de Carga de Planejado com destino a um cenário de planejamento (ex.: Budget 2027)
-- que tenha formulário FAT, cada (território × modelo × mês) do arquivo vira volume do FAT:
--   · modelo = o do FAT que contém o produto (nome reduzido); quantidade somada dos códigos do modelo, arredondada;
--   · Peças (modelo guiado pelo FAT, região PECAS) = soma do valor, pois lá se digita o FAT em R$;
--   · só meses com fonte "formulário"; território precisa ser uma região vigente do FAT; o resto é ignorado e registrado na auditoria.
-- Para cada mês tocado pelo lote, o FAT passa a espelhar o planejado carregado (células fora do arquivo, no mês, são removidas).
-- Meses que não estão no lote e edições posteriores no formulário não são alterados.
begin;

create function public.planning_fat_sync_planned_month(p_org uuid,p_scenario uuid,p_year integer,p_month integer) returns void
language plpgsql security definer set search_path=public as $$
declare sc public.forecast_scenarios;f public.planning_forms;cj jsonb;cells integer;total integer;matched integer;
begin
 select * into sc from public.forecast_scenarios where id=p_scenario and organization_id=p_org and planning_version=1;
 if not found or sc.reference_year<>p_year then return;end if;
 select * into f from public.planning_forms where scenario_id=p_scenario and organization_id=p_org and form_type='fat';
 if not found then return;end if;
 if not exists(select 1 from public.planning_scenario_months where scenario_id=p_scenario and reference_month=p_month and source_type='forms') then return;end if;
 perform set_config('vecton.planning_write',p_scenario::text,true);
 select coalesce(jsonb_agg(jsonb_build_object('region_key',x.region_key,'model_key',x.model_key,'amount',x.amount)),'[]') into cj from (
  select case when m.fat_driven then 'PECAS' else l.territorio_id::text end region_key,m.model_key,
   greatest(0,case when m.fat_driven then round(sum(l.valor),2) else round(sum(l.quantidade)) end) amount
  from public.comercial_planejado_ledger_entries l
  join public.planning_fat_models m on m.scenario_id=p_scenario and l.produto_id=any(m.product_ids)
  where l.organization_id=p_org and l.scenario_id=p_scenario and l.reference_year=p_year and l.reference_month=p_month
   and (m.fat_driven or l.territorio_id is not null)
  group by 1,2,m.fat_driven) x
  where x.region_key in(select r.region_key from public.planning_fat_regions(p_org) r);
 delete from public.planning_fat_volumes v where v.form_id=f.id and v.reference_month=p_month
  and not exists(select 1 from jsonb_to_recordset(cj) c(region_key text,model_key text,amount numeric) where c.region_key=v.region_key and c.model_key=v.model_key);
 insert into public.planning_fat_volumes(organization_id,scenario_id,form_id,region_key,model_key,reference_month,amount)
  select p_org,p_scenario,f.id,c.region_key,c.model_key,p_month,c.amount from jsonb_to_recordset(cj) c(region_key text,model_key text,amount numeric)
 on conflict(form_id,region_key,model_key,reference_month) do update set amount=excluded.amount,row_version=planning_fat_volumes.row_version+1
  where planning_fat_volumes.amount is distinct from excluded.amount;
 cells:=jsonb_array_length(cj);
 select count(*) into total from public.comercial_planejado_ledger_entries where organization_id=p_org and scenario_id=p_scenario and reference_year=p_year and reference_month=p_month;
 select count(*) into matched from public.comercial_planejado_ledger_entries l join public.planning_fat_models m on m.scenario_id=p_scenario and l.produto_id=any(m.product_ids)
  where l.organization_id=p_org and l.scenario_id=p_scenario and l.reference_year=p_year and l.reference_month=p_month;
 insert into public.planning_audit_log(organization_id,scenario_id,actor,action,details)
  values(p_org,p_scenario,auth.uid(),'fat_planned_sync',jsonb_build_object('form_id',f.id,'month',p_month,'cells',cells,'ledger_rows',total,'rows_without_model',total-matched));
end $$;

create function public.planning_fat_sync_planned() returns trigger
language plpgsql security definer set search_path=public as $$
declare r record;
begin
 for r in select distinct organization_id,scenario_id,reference_year,reference_month from new_rows where scenario_id is not null loop
   perform public.planning_fat_sync_planned_month(r.organization_id,r.scenario_id,r.reference_year,r.reference_month);
 end loop;
 return null;
end $$;

create trigger planning_fat_sync_planned_ins after insert on public.comercial_planejado_ledger_entries
 referencing new table as new_rows for each statement execute function public.planning_fat_sync_planned();
create trigger planning_fat_sync_planned_upd after update on public.comercial_planejado_ledger_entries
 referencing new table as new_rows for each statement execute function public.planning_fat_sync_planned();

revoke all on function public.planning_fat_sync_planned_month(uuid,uuid,integer,integer),public.planning_fat_sync_planned() from public,anon,authenticated;

commit;
