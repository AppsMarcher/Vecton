-- Relatório Capex Meta (ajuste de escopo): passa a usar o mesmo escopo de leitura do DRE e do OPEX.
-- Substitui a função da 297. Leitura dos investimentos salvos no formulário CAPEX do cenário, já com a
-- depreciação/amortização calculada. A taxa de depreciação nunca sai daqui (só valores calculados).
-- Escopo: o mesmo do DRE e do OPEX (forecast_read_scope): administrador vê tudo; os demais perfis, só os
-- centros de custo da própria gestão e as concessões extras.
begin;
create or replace function public.planning_capex_report(p_org uuid,p_scenario uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare s public.forecast_scenarios;f public.planning_forms;cc_ids uuid[];
begin
 if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização';end if;
 select * into s from public.forecast_scenarios where id=p_scenario and organization_id=p_org and planning_version=1;
 if not found then raise exception 'Cenário inválido';end if;
 select * into f from public.planning_forms where scenario_id=s.id and organization_id=p_org and form_type='capex';
 -- Mesmo escopo de leitura do DRE e do OPEX (forecast_read_scope): administrador vê todos os centros de custo;
 -- os demais, só os da gestão do perfil e as concessões extras (gestões e centros de custo).
 select coalesce(array_agg(q.id),'{}'::uuid[]) into cc_ids from (
   select c.id from public.cost_centers c where c.organization_id=p_org and public.planning_is_admin(p_org)
   union
   select r.cost_center_id from public.forecast_read_scope() r where r.organization_id=p_org and not public.planning_is_admin(p_org)) q;

 return jsonb_build_object(
  'scenario',jsonb_build_object('id',s.id,'name',s.name,'year',s.reference_year),
  'months',(select coalesce(jsonb_agg(jsonb_build_object('month',m.reference_month,'source',m.source_type) order by m.reference_month),'[]')
            from public.planning_scenario_months m where m.scenario_id=s.id),
  'destinations',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.planning_capex_destinations(s.id) d),
  'items',case when f.id is null then '[]'::jsonb else (
   select coalesce(jsonb_agg(jsonb_build_object(
     'id',i.id,'name',i.description,'type',t.name,'nature',t.nature,
     'cc_number',c.cost_center_number,'cc_name',c.cost_center_name,'management',c.cost_center_management,'cc_type',c.cost_center_type,
     'account',(select case when t.nature='depreciation' then g.depreciation_account else g.amortization_account end
                from public.planning_capex_destinations(s.id) g where g.cc_type=c.cost_center_type),
     'user',(select coalesce(nullif(trim(p.full_name),''),p.email)
             from public.planning_audit_log a join public.user_profiles p on p.user_id=a.actor and p.organization_id=p_org
             where a.scenario_id=s.id and a.action like 'capex\_%'
               and ((a.details->>'table'='planning_capex_items' and a.details->'new'->>'id'=i.id::text)
                 or (a.details->>'table'='planning_capex_values' and a.details->'new'->>'item_id'=i.id::text))
             order by a.at desc limit 1),
     'values',(select jsonb_agg(coalesce(v.amount,0) order by mm.n)
               from generate_series(1,12) mm(n)
               left join public.planning_capex_values v on v.item_id=i.id and v.reference_month=mm.n
                 and exists(select 1 from public.planning_scenario_months sm where sm.scenario_id=s.id and sm.reference_month=mm.n and sm.source_type='forms')),
     'dep',(select jsonb_agg(case when exists(select 1 from public.planning_scenario_months sm where sm.scenario_id=s.id and sm.reference_month=mm.n and sm.source_type='forms')
               then round((select coalesce(sum(v.amount),0) from public.planning_capex_values v
                           join public.planning_scenario_months sm on sm.scenario_id=s.id and sm.reference_month=v.reference_month and sm.source_type='forms'
                           where v.item_id=i.id and v.reference_month<mm.n)*t.annual_rate/100/12,4)
               else 0 end order by mm.n)
            from generate_series(1,12) mm(n))
   ) order by c.cost_center_management,c.cost_center_number,i.created_at,i.id),'[]'::jsonb)
   from public.planning_capex_items i
   join public.planning_capex_types t on t.id=i.type_id and t.scenario_id=i.scenario_id
   join public.cost_centers c on c.id=i.cost_center_id and c.organization_id=i.organization_id
   where i.form_id=f.id and i.cost_center_id=any(cc_ids)) end,
  'depreciation',case when f.id is null then '[]'::jsonb else (
   select coalesce(jsonb_agg(jsonb_build_object(
     'cc_number',c.cost_center_number,'management',c.cost_center_management,'cc_type',c.cost_center_type,
     'account',d.account_number,'month',d.reference_month,'amount',d.amount,
     'nature',case when d.account_number=g.depreciation_account then 'depreciation' else 'amortization' end)),'[]'::jsonb)
   from public.planning_capex_calculate(f.id,cc_ids) d
   join public.cost_centers c on c.id=d.cost_center_id
   left join public.planning_capex_destinations(s.id) g on g.cc_type=c.cost_center_type)end);
end $$;
revoke all on function public.planning_capex_report(uuid,uuid) from public,anon;
grant execute on function public.planning_capex_report(uuid,uuid) to authenticated;
commit;
