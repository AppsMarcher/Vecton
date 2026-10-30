-- O FAT e o Painel de Vendas sao sempre iguais.
-- Carga -> FAT ja existia (323). Agora FAT -> Painel: todo volume salvo (ou apagado) no formulario FAT ajusta a meta do Painel.
-- A meta do Painel e o razao da carga (comercial_planejado_ledger_entries), que e por produto; o FAT e por modelo. Entao:
--   · se a carga ja tinha o modelo na regiao/mes: o novo total e repartido entre os produtos na mesma proporcao (inteiros; a diferenca vai no maior);
--   · se nao tinha: nasce uma linha no lote manual "Ajustes do formulário FAT" do cenario, no produto principal do modelo (menor codigo);
--   · volume zero (ou celula apagada) tira o modelo daquela regiao/mes da meta.
-- Tudo passa pelas linhas de importacao (validacao, atribuicao vigente, valor e %MB do cenario), nunca direto no razao.
-- Carga completa por cima continua substituindo os meses do arquivo (e as edicoes do FAT nesses meses).
begin;

-- O lote manual dos ajustes do FAT nao dispara notificacao de "carga aplicada".
do $$declare def text;patched text;
begin
 if exists(select 1 from pg_proc where proname='notify_batch_applied' and pronamespace='public'::regnamespace) then
  def:=pg_get_functiondef('public.notify_batch_applied'::regproc);
  patched:=replace(def,'if new.status is distinct from ''applied'' then','if new.status is distinct from ''applied'' or new.notes is not distinct from ''Ajustes do formulário FAT'' then');
  if patched=def then raise exception 'notify_batch_applied mudou: ajuste o patch da 328';end if;
  execute patched;
 end if;
end $$;

-- Aplica no razao da carga o total de um modelo numa regiao e mes (p_total = volume do FAT; Pecas: valor em R$).
create or replace function public.comercial_planejado_aplicar_fat(p_org uuid,p_scenario uuid,p_region text,p_model text,p_month integer,p_total numeric) returns void
language plpgsql security definer set search_path=public as $$
declare sc public.forecast_scenarios;m public.planning_fat_models;terr uuid;dig integer;cur numeric;t numeric;bid uuid;nrow integer;cod text;tname text;
 e record;newv numeric;shares numeric;isfirst boolean:=true;
begin
 select * into sc from public.forecast_scenarios where id=p_scenario;
 if not found then return;end if;
 select * into m from public.planning_fat_models x where x.scenario_id=p_scenario and x.model_key=p_model;
 if not found then return;end if;
 terr:=case when p_region='PECAS' then null else p_region::uuid end;
 dig:=case when m.fat_driven then 2 else 0 end;
 t:=round(greatest(coalesce(p_total,0),0),dig);
 select coalesce(sum(case when m.fat_driven then l.valor else l.quantidade end),0) into cur from public.comercial_planejado_ledger_entries l
  where l.organization_id=p_org and l.scenario_id=p_scenario and l.reference_year=sc.reference_year and l.reference_month=p_month
    and l.produto_id=any(m.product_ids) and (m.fat_driven or l.territorio_id is not distinct from terr);
 if round(cur,dig)=t then return;end if;

 if t=0 then
   -- some da meta: primeiro o razao (a FK da linha e restritiva), depois a linha de importacao
   for e in select l.id,l.batch_row_id from public.comercial_planejado_ledger_entries l
     where l.organization_id=p_org and l.scenario_id=p_scenario and l.reference_year=sc.reference_year and l.reference_month=p_month
       and l.produto_id=any(m.product_ids) and (m.fat_driven or l.territorio_id is not distinct from terr) loop
     delete from public.comercial_planejado_ledger_entries where id=e.id;
     delete from public.comercial_planejado_import_rows where id=e.batch_row_id;
   end loop;
   return;
 end if;

 if cur>0 then
   -- soma das partes arredondadas: a diferenca para o total vai no maior
   select coalesce(sum(round(case when m.fat_driven then l.valor else l.quantidade end*t/cur,dig)),0) into shares from public.comercial_planejado_ledger_entries l
     where l.organization_id=p_org and l.scenario_id=p_scenario and l.reference_year=sc.reference_year and l.reference_month=p_month
       and l.produto_id=any(m.product_ids) and (m.fat_driven or l.territorio_id is not distinct from terr)
       and (case when m.fat_driven then l.valor else l.quantidade end)>0;
   for e in select l.id,l.batch_row_id,l.quantidade,l.valor,r.valor row_valor from public.comercial_planejado_ledger_entries l
     join public.comercial_planejado_import_rows r on r.id=l.batch_row_id
     where l.organization_id=p_org and l.scenario_id=p_scenario and l.reference_year=sc.reference_year and l.reference_month=p_month
       and l.produto_id=any(m.product_ids) and (m.fat_driven or l.territorio_id is not distinct from terr)
       and (case when m.fat_driven then l.valor else l.quantidade end)>0
     order by (case when m.fat_driven then l.valor else l.quantidade end) desc,l.id loop
     newv:=round(case when m.fat_driven then e.valor else e.quantidade end*t/cur,dig);
     if isfirst then newv:=newv+(t-shares);isfirst:=false;end if;
     if newv<=0 then
       delete from public.comercial_planejado_ledger_entries where id=e.id;
       delete from public.comercial_planejado_import_rows where id=e.batch_row_id;
     elsif m.fat_driven then
       update public.comercial_planejado_import_rows set valor=newv where id=e.batch_row_id;
     else
       update public.comercial_planejado_import_rows set quantidade=newv,valor=case when e.row_valor is null then null else round(e.row_valor*newv/e.quantidade,2) end where id=e.batch_row_id;
     end if;
   end loop;
   return;
 end if;

 -- a carga nao tinha esse modelo na regiao/mes: linha nova no lote manual dos ajustes do FAT
 select b.id into bid from public.comercial_planejado_import_batches b
  where b.organization_id=p_org and b.scenario_id=p_scenario and b.source_type='manual' and b.notes='Ajustes do formulário FAT' and b.reference_year=sc.reference_year limit 1;
 if bid is null then
   insert into public.comercial_planejado_import_batches(organization_id,scenario_id,reference_year,reference_month,load_mode,source_type,status,notes,uploaded_by,applied_by,applied_at)
   values(p_org,p_scenario,sc.reference_year,1,'additional','manual','applied','Ajustes do formulário FAT',auth.uid(),auth.uid(),now()) returning id into bid;
 end if;
 select p.codigo into cod from public.comercial_produtos p where p.id=any(m.product_ids) order by p.codigo limit 1;
 select tr.nome into tname from public.comercial_territorios tr where tr.id=terr;
 select coalesce(max(r.row_number),0)+1 into nrow from public.comercial_planejado_import_rows r where r.batch_id=bid;
 begin
   insert into public.comercial_planejado_import_rows(batch_id,row_number,reference_month,cod_produto,cod_territorio,quantidade,valor)
   values(bid,nrow,p_month,cod,tname,case when m.fat_driven then 0 else t end,case when m.fat_driven then t end);
 exception when others then
   raise exception 'Não foi possível refletir o volume de % no Painel de Vendas (mês %): %',p_model,p_month,sqlerrm;
 end;
end $$;
revoke all on function public.comercial_planejado_aplicar_fat(uuid,uuid,text,text,integer,numeric) from public,anon,authenticated;

-- FAT -> Painel: volume salvo/apagado no formulario ajusta a meta. As travas evitam o eco com a espelhagem carga -> FAT (323).
create or replace function public.planning_fat_volumes_to_planejado() returns trigger
language plpgsql security definer set search_path=public as $$
declare r record;
begin
 if coalesce(current_setting('vecton.planejado_forward',true),'0')='1' or coalesce(current_setting('vecton.planejado_reverse',true),'0')='1' then return null;end if;
 perform set_config('vecton.planejado_reverse','1',true);
 if tg_op='DELETE' then
   for r in select o.organization_id,o.scenario_id,o.region_key,o.model_key,o.reference_month,0::numeric amount from old_rows o loop
     perform public.comercial_planejado_aplicar_fat(r.organization_id,r.scenario_id,r.region_key,r.model_key,r.reference_month,r.amount);
   end loop;
 else
   for r in select n.organization_id,n.scenario_id,n.region_key,n.model_key,n.reference_month,n.amount from new_rows n loop
     perform public.comercial_planejado_aplicar_fat(r.organization_id,r.scenario_id,r.region_key,r.model_key,r.reference_month,r.amount);
   end loop;
 end if;
 perform set_config('vecton.planejado_reverse','0',true);
 return null;
exception when others then
 perform set_config('vecton.planejado_reverse','0',true);
 raise;
end $$;
revoke all on function public.planning_fat_volumes_to_planejado() from public,anon,authenticated;

drop trigger if exists planning_fat_volumes_planejado_ins on public.planning_fat_volumes;
drop trigger if exists planning_fat_volumes_planejado_upd on public.planning_fat_volumes;
drop trigger if exists planning_fat_volumes_planejado_del on public.planning_fat_volumes;
create trigger planning_fat_volumes_planejado_ins after insert on public.planning_fat_volumes referencing new table as new_rows for each statement execute function public.planning_fat_volumes_to_planejado();
create trigger planning_fat_volumes_planejado_upd after update on public.planning_fat_volumes referencing new table as new_rows for each statement execute function public.planning_fat_volumes_to_planejado();
create trigger planning_fat_volumes_planejado_del after delete on public.planning_fat_volumes referencing old table as old_rows for each statement execute function public.planning_fat_volumes_to_planejado();

-- Carga -> FAT (323): marca que o movimento veio da carga (a trava acima) e nao roda quando o ajuste veio do FAT ou so o preco mudou.
create or replace function public.planning_fat_sync_planned() returns trigger
language plpgsql security definer set search_path=public as $$
declare r record;
begin
 if coalesce(current_setting('vecton.planejado_recalc',true),'0')='1' or coalesce(current_setting('vecton.planejado_reverse',true),'0')='1' then return null;end if;
 perform set_config('vecton.planejado_forward','1',true);
 for r in select distinct organization_id,scenario_id,reference_year,reference_month from new_rows where scenario_id is not null loop
   perform public.planning_fat_sync_planned_month(r.organization_id,r.scenario_id,r.reference_year,r.reference_month);
 end loop;
 perform set_config('vecton.planejado_forward','0',true);
 return null;
exception when others then
 perform set_config('vecton.planejado_forward','0',true);
 raise;
end $$;

commit;
