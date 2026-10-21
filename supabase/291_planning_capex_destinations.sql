-- CAPEX: contas de destino da depreciação/amortização editáveis por tipo de centro de custo.
-- Sem linha gravada, vale o padrão anterior (MOD/MOI produção; ADM/COM/ENG administrativo).
begin;
create table public.planning_capex_destinations (
 organization_id uuid not null references public.organizations(id),
 scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
 cc_type text not null check(cc_type in ('MOD','MOI','ADM','COM','ENG')),
 depreciation_account text not null check(length(trim(depreciation_account)) between 1 and 40),
 amortization_account text not null check(length(trim(amortization_account)) between 1 and 40),
 row_version integer not null default 1,
 primary key(scenario_id,cc_type)
);
alter table public.planning_capex_destinations enable row level security;
revoke all on public.planning_capex_destinations from public,anon,authenticated;

create trigger capex_destinations_audit after insert or update or delete on public.planning_capex_destinations for each row execute function public.planning_capex_audit();

-- Destinos vigentes do cenário (padrão + sobrescritas), sempre com os cinco tipos.
create function public.planning_capex_destinations(p_scenario uuid)
returns table(cc_type text,depreciation_account text,amortization_account text,row_version integer)
language sql stable security definer set search_path=public as $$
 select t.cc_type,coalesce(d.depreciation_account,t.dep),coalesce(d.amortization_account,t.amo),coalesce(d.row_version,0)
 from (values ('MOD','4110220601','4110220602'),('MOI','4110220601','4110220602'),
 ('ADM','42301001','42301002'),('COM','42301001','42301002'),('ENG','42301001','42301002')) t(cc_type,dep,amo)
 left join public.planning_capex_destinations d on d.scenario_id=p_scenario and d.cc_type=t.cc_type;
$$;

-- Mesmo cálculo da 290, agora lendo as contas de destino do cenário.
create or replace function public.planning_capex_calculate(p_form uuid,p_cc uuid[] default null,p_cells jsonb default '[]')
returns table(cost_center_id uuid,account_number text,reference_month integer,amount numeric)
language sql stable security definer set search_path=public as $$
 with drafts as (select x.line_id item_id,x.month reference_month,x.amount::numeric amount
 from jsonb_to_recordset(p_cells) x(line_id uuid,month integer,amount text)),
 vals as (select v.item_id,v.reference_month,v.amount from public.planning_capex_values v
 where not exists(select 1 from drafts d where d.item_id=v.item_id and d.reference_month=v.reference_month)
 union all select * from drafts)
 select i.cost_center_id,
 case when t.nature='depreciation' then g.depreciation_account else g.amortization_account end,
 dest.reference_month,round(sum(v.amount*t.annual_rate/100/12),2)
 from public.planning_capex_items i join public.planning_forms f on f.id=i.form_id
 join public.planning_capex_types t on t.id=i.type_id and t.scenario_id=i.scenario_id
 join public.cost_centers c on c.id=i.cost_center_id and c.organization_id=i.organization_id
 join public.planning_capex_destinations(i.scenario_id) g on g.cc_type=c.cost_center_type
 join vals v on v.item_id=i.id
 join public.planning_scenario_months src on src.scenario_id=i.scenario_id and src.reference_month=v.reference_month and src.source_type='forms'
 join public.planning_scenario_months dest on dest.scenario_id=i.scenario_id and dest.reference_month>v.reference_month and dest.source_type='forms'
 where i.form_id=p_form and f.form_type='capex' and (p_cc is null or i.cost_center_id=any(p_cc))
 and c.cost_center_type in ('MOD','MOI','ADM','COM','ENG')
 group by i.cost_center_id,2,dest.reference_month;
$$;

create function public.planning_capex_destination_save(p_org uuid,p_scenario uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.forecast_scenarios;ty text:=p_payload->>'cc_type';dep text:=trim(p_payload->>'depreciation_account');amo text:=trim(p_payload->>'amortization_account');cur integer;acct text;
begin
 if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização';end if;
 if not public.planning_is_admin(p_org) then raise exception 'Apenas administradores configuram parâmetros';end if;
 select * into s from public.forecast_scenarios where id=p_scenario and organization_id=p_org and planning_version=1 for update;
 if not found then raise exception 'Cenário inválido';end if;
 if s.status='locked' or s.lock_at<=clock_timestamp() then raise exception 'Cenário bloqueado';end if;
 if ty is null or ty not in ('MOD','MOI','ADM','COM','ENG') then raise exception 'Tipo de centro de custo inválido';end if;
 if coalesce(dep,'')='' or coalesce(amo,'')='' then raise exception 'Informe as contas de depreciação e amortização';end if;
 if dep=amo then raise exception 'Depreciação e amortização precisam de contas diferentes';end if;
 foreach acct in array array[dep,amo] loop
   if not exists(select 1 from public.accounts a join public.dre_plan_nodes d on d.account_id=a.id and d.organization_id=a.organization_id
     where a.organization_id=p_org and a.account_number=acct and a.active and d.active and d.node_class='Analitica') then raise exception 'Conta % não encontrada no plano DRE (analítica ativa)',acct;end if;
 end loop;
 select row_version into cur from public.planning_capex_destinations(p_scenario) where cc_type=ty;
 if (p_payload->>'version')::int is distinct from cur then raise exception 'Parâmetros mudaram; reabra a tela';end if;
 insert into public.planning_capex_destinations(organization_id,scenario_id,cc_type,depreciation_account,amortization_account)
 values(p_org,p_scenario,ty,dep,amo)
 on conflict(scenario_id,cc_type) do update set depreciation_account=excluded.depreciation_account,amortization_account=excluded.amortization_account,row_version=planning_capex_destinations.row_version+1;
 return jsonb_build_object('ok',true);
end $$;

-- Cenário novo ou copiado herda também as contas de destino.
create or replace function public.planning_capex_inherit(p_org uuid,p_target uuid,p_source uuid) returns void
language sql security definer set search_path=public as $$
 insert into public.planning_capex_types(organization_id,scenario_id,name,annual_rate,nature,active)
 select p_org,p_target,name,annual_rate,nature,active from public.planning_capex_types where scenario_id=p_source and organization_id=p_org
 on conflict(scenario_id,name) do nothing;
 insert into public.planning_capex_destinations(organization_id,scenario_id,cc_type,depreciation_account,amortization_account)
 select p_org,p_target,cc_type,depreciation_account,amortization_account from public.planning_capex_destinations where scenario_id=p_source and organization_id=p_org
 on conflict(scenario_id,cc_type) do nothing;
$$;

create or replace function public.planning_context(p_org uuid,p_scenario uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;begin
 result:=public.planning_context_before_capex(p_org,p_scenario);
 return result||jsonb_build_object('capex_enabled',true,
 'capex_types',(select coalesce(jsonb_agg(case when public.planning_is_admin(p_org) then to_jsonb(t) else jsonb_build_object('id',t.id,'name',t.name,'active',t.active) end order by t.name),'[]') from public.planning_capex_types t where t.scenario_id=p_scenario and (public.planning_is_admin(p_org) or exists(select 1 from public.planning_forms f where f.scenario_id=p_scenario and f.form_type='capex' and public.planning_form_mode(f.id) is not null))),
 'capex_cost_centers',(select coalesce(jsonb_agg(to_jsonb(c) order by c.cost_center_number),'[]') from public.cost_centers c where c.id in(select public.planning_capex_cc_scope(p_org))),
 'capex_destinations',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.planning_capex_destinations(p_scenario) d where p_scenario is not null and public.is_org_member(p_org)));
end $$;

revoke all on function public.planning_capex_destinations(uuid),public.planning_capex_calculate(uuid,uuid[],jsonb),public.planning_capex_inherit(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.planning_capex_destination_save(uuid,uuid,jsonb),public.planning_context(uuid,uuid) from public,anon;
grant execute on function public.planning_capex_destination_save(uuid,uuid,jsonb),public.planning_context(uuid,uuid) to authenticated;
commit;
