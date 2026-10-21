-- CAPEX: plano de contas DRE (árvore) entregue só ao administrador, para escolher as contas de destino.
begin;
create or replace function public.planning_context(p_org uuid,p_scenario uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;begin
 result:=public.planning_context_before_capex(p_org,p_scenario);
 return result||jsonb_build_object('capex_enabled',true,
 'capex_types',(select coalesce(jsonb_agg(case when public.planning_is_admin(p_org) then to_jsonb(t) else jsonb_build_object('id',t.id,'name',t.name,'active',t.active) end order by t.name),'[]') from public.planning_capex_types t where t.scenario_id=p_scenario and (public.planning_is_admin(p_org) or exists(select 1 from public.planning_forms f where f.scenario_id=p_scenario and f.form_type='capex' and public.planning_form_mode(f.id) is not null))),
 'capex_cost_centers',(select coalesce(jsonb_agg(to_jsonb(c) order by c.cost_center_number),'[]') from public.cost_centers c where c.id in(select public.planning_capex_cc_scope(p_org))),
 'capex_destinations',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.planning_capex_destinations(p_scenario) d where p_scenario is not null and public.is_org_member(p_org)),
 'capex_account_tree',(select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'parent',n.parent_node_id,'code',n.node_code,'name',n.node_name,'class',n.node_class,'account_number',a.account_number,'sort',n.sort_order) order by n.sort_order,n.node_code),'[]')
  from public.dre_plan_nodes n left join public.accounts a on a.id=n.account_id
  where public.planning_is_admin(p_org) and n.organization_id=p_org and n.active));
end $$;
revoke all on function public.planning_context(uuid,uuid) from public,anon;
grant execute on function public.planning_context(uuid,uuid) to authenticated;
commit;
