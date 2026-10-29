-- FAT: premissas (FAT/un e MP/un) do histórico dos 2 últimos meses fechados com venda do modelo no território.
-- Sem 2 meses no território, vale a média Marcher (region_key 'marcher'). Peças: MP ÷ FAT (region_key 'PECAS').
-- O ajuste do admin (adj_*) nunca é apagado ao recalcular.
begin;
create function public.planning_fat_calc_premises(p_org uuid,p_scenario uuid,p_asof date default current_date) returns jsonb
language plpgsql security definer set search_path=public as $$
declare cur integer:=extract(year from p_asof)::integer*100+extract(month from p_asof)::integer;
 lo integer:=(extract(year from p_asof)::integer-2)*100+extract(month from p_asof)::integer;
 n integer;pend integer;win integer[];
begin
 create temporary table fat_prem_new(region_key text,model_key text,fat_unit numeric,mp_unit numeric,origin text,window_months integer[]) on commit drop;
 insert into fat_prem_new
 with hist as (
   select m.model_key,r.rk,le.reference_year*100+le.reference_month ym,sum(le.quantidade) q,sum(le.valor) f,sum(coalesce(le.mp,0)) p
   from (select x.model_key,x.fat_driven,x.scenario_id,unnest(x.product_ids) produto_id from public.planning_fat_models x where x.scenario_id=p_scenario) m
   join public.comercial_realizado_ledger_entries le on le.organization_id=p_org and le.origem='FAT' and le.produto_id=m.produto_id
     and le.reference_year*100+le.reference_month>=lo and le.reference_year*100+le.reference_month<cur
   cross join lateral (select le.territorio_id::text rk where le.territorio_id is not null union all select 'marcher') r
   where m.scenario_id=p_scenario and not m.fat_driven group by 1,2,3 having sum(le.quantidade)>0),
 ranked as (select h.*,row_number() over(partition by model_key,rk order by ym desc) rn from hist h)
 select rk,model_key,sum(f)/sum(q),sum(p)/sum(q),case when rk='marcher' then 'marcher' else 'local' end,array_agg(ym order by ym desc)
 from ranked where rn<=2 group by model_key,rk having count(*)=2
 union all
 select 'PECAS','PECAS',1,sum(p)/sum(f),'local',array_agg(ym order by ym desc) from (
   select le.reference_year*100+le.reference_month ym,sum(le.valor) f,sum(coalesce(le.mp,0)) p,
   row_number() over(order by le.reference_year*100+le.reference_month desc) rn
   from (select x.model_key,x.fat_driven,x.scenario_id,unnest(x.product_ids) produto_id from public.planning_fat_models x where x.scenario_id=p_scenario) m join public.comercial_realizado_ledger_entries le on le.organization_id=p_org and le.origem='FAT' and le.produto_id=m.produto_id
   and le.reference_year*100+le.reference_month>=lo and le.reference_year*100+le.reference_month<cur
   where m.scenario_id=p_scenario and m.fat_driven group by 1 having sum(le.valor)>0) z
 where rn<=2 having count(*)=2;
 perform set_config('vecton.planning_write',p_scenario::text,true);
 delete from public.planning_fat_premises d where d.scenario_id=p_scenario and d.adj_fat is null and d.adj_mp is null
   and not exists(select 1 from fat_prem_new x where x.region_key=d.region_key and x.model_key=d.model_key);
 insert into public.planning_fat_premises(organization_id,scenario_id,region_key,model_key,fat_unit,mp_unit,origin,window_months)
 select p_org,p_scenario,region_key,model_key,fat_unit,mp_unit,origin,window_months from fat_prem_new
 on conflict(scenario_id,region_key,model_key) do update set fat_unit=excluded.fat_unit,mp_unit=excluded.mp_unit,origin=excluded.origin,
   window_months=excluded.window_months,calculated_at=clock_timestamp(),row_version=planning_fat_premises.row_version+1;
 get diagnostics n=row_count;
 select count(*) into pend from public.planning_fat_models m where m.scenario_id=p_scenario and not m.fat_driven
   and not exists(select 1 from fat_prem_new x where x.region_key='marcher' and x.model_key=m.model_key);
 select array_agg(ym order by ym desc) into win from (select distinct le.reference_year*100+le.reference_month ym
   from public.comercial_realizado_ledger_entries le join (select unnest(x.product_ids) produto_id from public.planning_fat_models x where x.scenario_id=p_scenario) m on m.produto_id=le.produto_id
   where le.organization_id=p_org and le.origem='FAT' and le.reference_year*100+le.reference_month>=lo and le.reference_year*100+le.reference_month<cur
   order by ym desc limit 2) w;
 insert into public.planning_fat_premise_runs(organization_id,scenario_id,user_id,window_months,rows_written) values(p_org,p_scenario,auth.uid(),coalesce(win,'{}'),n);
 drop table fat_prem_new;
 return jsonb_build_object('rows',n,'pending',pend,'window_months',to_jsonb(coalesce(win,'{}')));
end $$;
revoke all on function public.planning_fat_calc_premises(uuid,uuid,date) from public,anon,authenticated;
commit;
