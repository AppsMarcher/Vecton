-- CAPEX participativo: parâmetros privados, itens por CC e publicação isolada.
begin;
alter table public.planning_forms add column form_type text not null default 'opex'
 check(form_type in ('opex','capex'));
create unique index planning_one_capex on public.planning_forms(scenario_id) where form_type='capex';

create table public.planning_capex_types (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 150),
 annual_rate numeric(7,4) not null check(annual_rate>0 and annual_rate<=100),
 nature text not null check(nature in ('depreciation','amortization')),
 active boolean not null default true, row_version integer not null default 1,
 unique(scenario_id,id),unique(scenario_id,name)
);
create table public.planning_capex_items (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
 form_id uuid not null references public.planning_forms(id) on delete cascade,
 cost_center_id uuid not null references public.cost_centers(id),
 type_id uuid not null,
 description text not null check(length(trim(description)) between 1 and 250),
 row_version integer not null default 1,created_at timestamptz not null default clock_timestamp(),
 foreign key(scenario_id,type_id) references public.planning_capex_types(scenario_id,id) on delete restrict
);
create index planning_capex_items_form_cc on public.planning_capex_items(form_id,cost_center_id);
create table public.planning_capex_values (
 item_id uuid not null references public.planning_capex_items(id) on delete cascade,
 reference_month integer not null check(reference_month between 1 and 12),
 amount numeric(18,2) not null check(amount>=0),row_version integer not null default 1,
 primary key(item_id,reference_month)
);
-- No direct table route may expose a rate or bypass locks/validation.
do $$declare t text;begin
 foreach t in array array['planning_capex_types','planning_capex_items','planning_capex_values'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;

-- Existing inactive CCs remain accessible under the same profile rules.
create function public.planning_capex_cc_scope(p_org uuid) returns setof uuid
language sql stable security definer set search_path=public as $$
 select c.id from public.cost_centers c where c.organization_id=p_org and public.is_org_member(p_org)
 and (c.active or exists(select 1 from public.planning_capex_items i where i.cost_center_id=c.id))
 and (public.planning_is_admin(p_org) or exists(select 1 from public.user_profiles u
 where u.organization_id=p_org and u.user_id=auth.uid() and u.is_active
 and (u.access_role::text in ('manager','analyst') or coalesce(u.additional_access_roles::text[],'{}') && array['manager','analyst'])
 and (nullif(trim(u.management),'')=trim(c.cost_center_management)
 or trim(c.cost_center_management)=any(coalesce(u.extra_managements,'{}'))
 or c.id::text=any(coalesce(u.extra_cc_ids::text[],'{}')))));
$$;

create or replace function public.planning_form_mode(p_form uuid) returns text
language sql stable security definer set search_path=public as $$
 select case when public.planning_is_admin(f.organization_id) then 'write'
 when f.status='released' and (case when f.form_type='capex'
 then exists(select 1 from public.planning_capex_cc_scope(f.organization_id))
 else exists(select 1 from public.planning_cc_scope(f.organization_id)) end)
 then (select a.access_mode from public.planning_form_access a where a.form_id=f.id and a.user_id=auth.uid()) end
 from public.planning_forms f where f.id=p_form and public.is_org_member(f.organization_id);
$$;

create function public.planning_capex_audit() returns trigger
language plpgsql security definer set search_path=public as $$
declare r jsonb; sid uuid; org uuid;begin
 r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_table_name='planning_capex_values' then
   select scenario_id,organization_id into sid,org from public.planning_capex_items where id=(r->>'item_id')::uuid;
 else sid:=(r->>'scenario_id')::uuid;org:=(r->>'organization_id')::uuid;end if;
 if sid is not null then
 insert into public.planning_audit_log(organization_id,scenario_id,actor,action,details)
 values(org,sid,auth.uid(),'capex_'||lower(tg_op),jsonb_build_object('table',tg_table_name,
 'old',case when tg_op<>'INSERT' then to_jsonb(old) end,'new',case when tg_op<>'DELETE' then to_jsonb(new) end));
 end if;return null;
end $$;
create trigger capex_types_audit after insert or update or delete on public.planning_capex_types for each row execute function public.planning_capex_audit();
create trigger capex_items_audit after insert or update or delete on public.planning_capex_items for each row execute function public.planning_capex_audit();
create trigger capex_values_audit after insert or update or delete on public.planning_capex_values for each row execute function public.planning_capex_audit();

-- Internal calculator. The caller must validate form, scope and draft cells.
-- Round AFTER grouping by CC/account/month, never per asset.
create function public.planning_capex_calculate(p_form uuid,p_cc uuid[] default null,p_cells jsonb default '[]')
returns table(cost_center_id uuid,account_number text,reference_month integer,amount numeric)
language sql stable security definer set search_path=public as $$
 with drafts as (select x.line_id item_id,x.month reference_month,x.amount::numeric amount
 from jsonb_to_recordset(p_cells) x(line_id uuid,month integer,amount text)),
 vals as (select v.item_id,v.reference_month,v.amount from public.planning_capex_values v
 where not exists(select 1 from drafts d where d.item_id=v.item_id and d.reference_month=v.reference_month)
 union all select * from drafts)
 select i.cost_center_id,
 case when c.cost_center_type in ('MOD','MOI') then case when t.nature='depreciation' then '4110220601' else '4110220602' end
 else case when t.nature='depreciation' then '42301001' else '42301002' end end,
 dest.reference_month,round(sum(v.amount*t.annual_rate/100/12),2)
 from public.planning_capex_items i join public.planning_forms f on f.id=i.form_id
 join public.planning_capex_types t on t.id=i.type_id and t.scenario_id=i.scenario_id
 join public.cost_centers c on c.id=i.cost_center_id and c.organization_id=i.organization_id
 join vals v on v.item_id=i.id
 join public.planning_scenario_months src on src.scenario_id=i.scenario_id and src.reference_month=v.reference_month and src.source_type='forms'
 join public.planning_scenario_months dest on dest.scenario_id=i.scenario_id and dest.reference_month>v.reference_month and dest.source_type='forms'
 where i.form_id=p_form and f.form_type='capex' and (p_cc is null or i.cost_center_id=any(p_cc))
 and c.cost_center_type in ('MOD','MOI','ADM','COM','ENG')
 group by i.cost_center_id,2,dest.reference_month;
$$;

create function public.planning_capex_read(p_org uuid,p_form uuid,p_cc_ids uuid[],p_cells jsonb default '[]') returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare f public.planning_forms;begin
 select * into f from public.planning_forms where id=p_form and organization_id=p_org and form_type='capex';
 if not found or public.planning_form_mode(p_form) is null then raise exception 'Sem acesso ao formulário';end if;
 if p_cc_ids is null or cardinality(p_cc_ids)>100 or exists(select 1 from unnest(p_cc_ids) c where c is null or c not in(select public.planning_capex_cc_scope(p_org))) then raise exception 'Centro de custo fora do escopo';end if;
 if jsonb_typeof(p_cells) is distinct from 'array' or jsonb_array_length(p_cells)>5000 then raise exception 'Lote inválido';end if;
 if exists(select 1 from jsonb_to_recordset(p_cells) x(line_id uuid,cost_center_id uuid,month integer,amount text)
 where x.month is null or x.month not between 1 and 12 or x.amount is null or x.amount !~ '^[0-9]+(\.[0-9]{1,2})?$'
 or not exists(select 1 from public.planning_capex_items i where i.id=x.line_id and i.form_id=p_form and i.cost_center_id=x.cost_center_id and i.cost_center_id=any(p_cc_ids))
 or not exists(select 1 from public.planning_scenario_months m where m.scenario_id=f.scenario_id and m.reference_month=x.month and m.source_type='forms'))
 or exists(select 1 from jsonb_array_elements(p_cells) x group by x->>'line_id',x->>'month' having count(*)>1) then raise exception 'Célula inválida ou fora do escopo';end if;
 return jsonb_build_object('revision',f.revision,
 'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at,i.id),'[]') from public.planning_capex_items i where i.form_id=p_form and i.cost_center_id=any(p_cc_ids)),
 'entries',(select coalesce(jsonb_agg(jsonb_build_object('line_id',i.id,'cost_center_id',i.cost_center_id,'reference_month',v.reference_month,'amount',v.amount,'row_version',v.row_version)),'[]') from public.planning_capex_values v join public.planning_capex_items i on i.id=v.item_id where i.form_id=p_form and i.cost_center_id=any(p_cc_ids)),
 'depreciation',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.planning_capex_calculate(p_form,p_cc_ids,p_cells) d));
end $$;

create function public.planning_capex_write(p_org uuid,p_action text,p_scenario uuid,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.forecast_scenarios;f public.planning_forms;i public.planning_capex_items;t public.planning_capex_types;
 fid uuid;tid uuid;iid uuid;cc uuid;cells jsonb;conflicts jsonb;rid uuid;started timestamptz;err text;affected int:=0;skipped int:=0;
begin
 if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização';end if;
 select * into s from public.forecast_scenarios where id=p_scenario and organization_id=p_org and planning_version=1 for update;
 if not found then raise exception 'Cenário inválido';end if;
 if s.status='locked' or s.lock_at<=clock_timestamp() then raise exception 'Cenário bloqueado';end if;
 perform set_config('vecton.planning_write',s.id::text,true);
 if p_action in ('save_type','delete_type') then
   if not public.planning_is_admin(p_org) then raise exception 'Apenas administradores configuram parâmetros';end if;
   tid:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
   select * into t from public.planning_capex_types where id=tid;
   if t.id is not null and (t.scenario_id<>s.id or t.organization_id<>p_org) then raise exception 'Tipo inválido';end if;
   if t.id is not null and (p_payload->>'version')::int is distinct from t.row_version then raise exception 'Parâmetros mudaram; reabra a tela';end if;
   if p_action='delete_type' then
     if exists(select 1 from public.planning_capex_items where type_id=tid) then raise exception 'Tipo em uso: desative em vez de excluir';end if;
     delete from public.planning_capex_types where id=tid and scenario_id=s.id;
   else
     insert into public.planning_capex_types(id,organization_id,scenario_id,name,annual_rate,nature,active)
     values(tid,p_org,s.id,trim(p_payload->>'name'),(p_payload->>'annual_rate')::numeric,p_payload->>'nature',coalesce((p_payload->>'active')::boolean,true))
     on conflict(id) do update set name=excluded.name,annual_rate=excluded.annual_rate,nature=excluded.nature,active=excluded.active,row_version=planning_capex_types.row_version+1;
   end if;
   return jsonb_build_object('ok',true,'id',tid);
 end if;
 fid:=(p_payload->>'form_id')::uuid;
 select * into f from public.planning_forms where id=fid and scenario_id=s.id and organization_id=p_org and form_type='capex';
 if not found or public.planning_form_mode(fid) is distinct from 'write' then raise exception 'Sem permissão de lançamento';end if;
 if p_action<>'project' and (p_payload->>'form_revision')::int is distinct from f.revision then raise exception 'A estrutura ou os acessos mudaram; reabra o formulário';end if;
 if p_action in ('save_item','duplicate_item','delete_item') then
   iid:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
   select * into i from public.planning_capex_items where id=iid;
   if i.id is not null then
     if i.form_id<>fid or i.cost_center_id not in(select public.planning_capex_cc_scope(p_org)) then raise exception 'Item fora do escopo';end if;
     if (p_payload->>'version')::int is distinct from i.row_version then raise exception 'Item mudou; reabra o formulário';end if;
   elsif p_action<>'save_item' then raise exception 'Item inválido';end if;
   if p_action='delete_item' then
     delete from public.planning_capex_values where item_id=iid;
     delete from public.planning_capex_items where id=iid;
   elsif p_action='duplicate_item' then
     if not exists(select 1 from public.cost_centers where id=i.cost_center_id and active) or not exists(select 1 from public.planning_capex_types where id=i.type_id and active) then raise exception 'CC ou tipo inativo';end if;
     iid:=gen_random_uuid();
     insert into public.planning_capex_items(id,organization_id,scenario_id,form_id,cost_center_id,type_id,description) values(iid,p_org,s.id,fid,i.cost_center_id,i.type_id,i.description);
     insert into public.planning_capex_values(item_id,reference_month,amount) select iid,v.reference_month,v.amount from public.planning_capex_values v join public.planning_scenario_months m on m.scenario_id=s.id and m.reference_month=v.reference_month and m.source_type='forms' where v.item_id=i.id;
   else
     cc:=(p_payload->>'cost_center_id')::uuid;tid:=(p_payload->>'type_id')::uuid;
     if cc is null or cc not in(select public.planning_capex_cc_scope(p_org)) or (i.id is not null and cc<>i.cost_center_id) then raise exception 'Centro de custo fora do escopo';end if;
     if i.id is null and not exists(select 1 from public.cost_centers where id=cc and active) then raise exception 'CC inativo';end if;
     if not exists(select 1 from public.planning_capex_types where id=tid and scenario_id=s.id and active) then raise exception 'Selecione um tipo ativo';end if;
     insert into public.planning_capex_items(id,organization_id,scenario_id,form_id,cost_center_id,type_id,description) values(iid,p_org,s.id,fid,cc,tid,trim(p_payload->>'description'))
     on conflict(id) do update set description=excluded.description,type_id=excluded.type_id,row_version=planning_capex_items.row_version+1;
   end if;
   update public.planning_forms set revision=revision+1 where id=fid;
 elsif p_action='save_values' then
   cells:=p_payload->'cells';
   if jsonb_typeof(cells) is distinct from 'array' or jsonb_array_length(cells)>5000 then raise exception 'Lote inválido; máximo 5000 células';end if;
   if exists(select 1 from jsonb_array_elements(cells) x group by x->>'line_id',x->>'month' having count(*)>1) then raise exception 'Célula repetida no lote';end if;
   if exists(select 1 from jsonb_to_recordset(cells) x(line_id uuid,cost_center_id uuid,month int,amount text,version int)
   where x.amount is null or x.amount !~ '^[0-9]+(\.[0-9]{1,2})?$' or x.month is null or x.version is null
   or not exists(select 1 from public.planning_capex_items ci join public.planning_capex_types ct on ct.id=ci.type_id and ct.active where ci.id=x.line_id and ci.form_id=fid and ci.cost_center_id=x.cost_center_id and ci.cost_center_id in(select public.planning_capex_cc_scope(p_org)))
   or not exists(select 1 from public.planning_scenario_months m where m.scenario_id=s.id and m.reference_month=x.month and m.source_type='forms')) then raise exception 'Célula inválida ou fora do escopo; verifique tipo ativo e mês';end if;
   select coalesce(jsonb_agg(jsonb_build_object('line_id',x.line_id,'month',x.month,'amount',x.amount,'current_amount',v.amount,'current_version',coalesce(v.row_version,0))),'[]') into conflicts
   from jsonb_to_recordset(cells) x(line_id uuid,month int,amount text,version int)
   left join public.planning_capex_values v on v.item_id=x.line_id and v.reference_month=x.month where coalesce(v.row_version,0)<>x.version;
   if jsonb_array_length(conflicts)>0 then return jsonb_build_object('ok',false,'conflicts',conflicts);end if;
   insert into public.planning_capex_values(item_id,reference_month,amount)
   select x.line_id,x.month,x.amount::numeric from jsonb_to_recordset(cells) x(line_id uuid,month int,amount text)
   on conflict(item_id,reference_month) do update set amount=excluded.amount,row_version=planning_capex_values.row_version+1;
 elsif p_action='project' then
   if f.status<>'released' then raise exception 'Libere o formulário antes de integrar';end if;
   rid:=gen_random_uuid();started:=clock_timestamp();
   begin
     select count(*) into skipped from public.planning_capex_items ci join public.cost_centers c on c.id=ci.cost_center_id where ci.form_id=fid and (c.cost_center_type is null or c.cost_center_type not in ('MOD','MOI','ADM','COM','ENG'));
     delete from public.forecast_ledger_entries l using public.planning_forms pf where l.scenario_id=s.id and l.planning_form_id=pf.id and pf.form_type='capex';
     insert into public.forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount,history,planning_form_id)
     select p_org,s.id,s.reference_year,d.reference_month,d.account_number,d.cost_center_id,c.cost_center_number,d.amount,'CAPEX: '||f.code,fid
     from public.planning_capex_calculate(fid) d join public.cost_centers c on c.id=d.cost_center_id where d.amount<>0;
     get diagnostics affected=row_count;
   exception when others then err:=sqlerrm;affected:=0;
   end;
   insert into public.planning_runs(id,organization_id,scenario_id,initiated_form_id,status,started_by,started_at,rows_written,error,details)
   values(rid,p_org,s.id,fid,case when err is null then 'ok' else 'error' end,auth.uid(),started,affected,err,jsonb_build_object('form_type','capex','skipped_items',skipped));
   insert into public.planning_audit_log(organization_id,scenario_id,actor,action,details) values(p_org,s.id,auth.uid(),'capex_project',jsonb_build_object('run_id',rid,'rows_written',affected,'error',err,'skipped_items',skipped));
   return jsonb_build_object('ok',err is null,'rows_written',affected,'error',err,'skipped_items',skipped);
 else raise exception 'Operação CAPEX desconhecida';end if;
 return jsonb_build_object('ok',true,'id',iid);
end $$;

-- Helper only called inside the authenticated scenario-creation transaction.
create function public.planning_capex_inherit(p_org uuid,p_target uuid,p_source uuid) returns void
language sql security definer set search_path=public as $$
 insert into public.planning_capex_types(organization_id,scenario_id,name,annual_rate,nature,active)
 select p_org,p_target,name,annual_rate,nature,active from public.planning_capex_types where scenario_id=p_source and organization_id=p_org
 on conflict(scenario_id,name) do nothing;
$$;

-- Context wrapper retains the existing permission checks, exposing only id/name/active
-- to non-admins. There is no SELECT grant on the parameter table.
alter function public.planning_context(uuid,uuid) rename to planning_context_before_capex;
revoke all on function public.planning_context_before_capex(uuid,uuid) from public,anon,authenticated;
create function public.planning_context(p_org uuid,p_scenario uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;begin
 result:=public.planning_context_before_capex(p_org,p_scenario);
 return result||jsonb_build_object('capex_enabled',true,
 'capex_types',(select coalesce(jsonb_agg(case when public.planning_is_admin(p_org) then to_jsonb(t) else jsonb_build_object('id',t.id,'name',t.name,'active',t.active) end order by t.name),'[]') from public.planning_capex_types t where t.scenario_id=p_scenario and (public.planning_is_admin(p_org) or exists(select 1 from public.planning_forms f where f.scenario_id=p_scenario and f.form_type='capex' and public.planning_form_mode(f.id) is not null))),
 'capex_cost_centers',(select coalesce(jsonb_agg(to_jsonb(c) order by c.cost_center_number),'[]') from public.cost_centers c where c.id in(select public.planning_capex_cc_scope(p_org))));
end $$;

-- Cloning CAPEX remaps scenario-specific parameter ids; no ledger is copied.
alter function public.planning_clone_form(uuid,uuid,uuid,jsonb) rename to planning_clone_form_before_capex;
revoke all on function public.planning_clone_form_before_capex(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
create function public.planning_clone_form(p_org uuid,p_target uuid,p_source uuid,p_options jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare src public.planning_forms;fid uuid;l record;lid uuid;begin
 select * into src from public.planning_forms where id=p_source and organization_id=p_org;
 if not found then raise exception 'Formulário de origem inválido';end if;
 if src.form_type<>'capex' then return public.planning_clone_form_before_capex(p_org,p_target,p_source,p_options);end if;
 perform 1 from public.forecast_scenarios where id=src.scenario_id for share;
 perform public.planning_capex_inherit(p_org,p_target,src.scenario_id);
 insert into public.planning_forms(organization_id,scenario_id,code,name,status,form_type) values(p_org,p_target,'CPX',src.name,coalesce(p_options->>'status','draft'),'capex') returning id into fid;
 for l in select * from public.planning_capex_items where form_id=src.id order by created_at loop
   lid:=gen_random_uuid();
   insert into public.planning_capex_items(id,organization_id,scenario_id,form_id,cost_center_id,type_id,description)
   select lid,p_org,p_target,fid,l.cost_center_id,t.id,l.description from public.planning_capex_types t join public.planning_capex_types st on st.id=l.type_id where t.scenario_id=p_target and t.name=st.name;
   if coalesce((p_options->>'copy_values')::boolean,false) then
     insert into public.planning_capex_values(item_id,reference_month,amount) select lid,v.reference_month,v.amount from public.planning_capex_values v join public.planning_scenario_months m on m.scenario_id=p_target and m.reference_month=v.reference_month and m.source_type='forms' where v.item_id=l.id;
   end if;
 end loop;
 if coalesce((p_options->>'copy_access')::boolean,false) then insert into public.planning_form_access select p_org,fid,user_id,access_mode from public.planning_form_access where form_id=src.id;end if;
 return fid;
end $$;

-- New CPX form for existing scenarios (draft, no access assigned).
insert into public.planning_forms(organization_id,scenario_id,code,name,form_type)
select organization_id,id,'CPX','CAPEX · Investimentos','capex' from public.forecast_scenarios s
where planning_version=1 and not exists(select 1 from public.planning_forms f where f.scenario_id=s.id and f.code='CPX');

revoke all on function public.planning_capex_cc_scope(uuid),public.planning_capex_audit(),public.planning_capex_calculate(uuid,uuid[],jsonb),public.planning_capex_inherit(uuid,uuid,uuid),public.planning_clone_form(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.planning_capex_read(uuid,uuid,uuid[],jsonb),public.planning_capex_write(uuid,text,uuid,jsonb),public.planning_context(uuid,uuid) from public,anon;
grant execute on function public.planning_capex_read(uuid,uuid,uuid[],jsonb),public.planning_capex_write(uuid,text,uuid,jsonb),public.planning_context(uuid,uuid) to authenticated;

-- planning_write is appended below with OPEX/CAPEX isolation and creation hooks.

create or replace function public.planning_write(p_org uuid,p_action text,p_scenario uuid default null,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.forecast_scenarios; f public.planning_forms; oldline public.planning_form_lines;
 sid uuid:=p_scenario; fid uuid; lid uuid; source_id uuid; src_year integer; m jsonb; item jsonb; cell jsonb;
 mo integer; nm text; yr integer; affected integer:=0; actual_version integer; conflicts jsonb:='[]';
 started timestamptz; run_id uuid; err text; old_setting text; new_line jsonb; rowkey text;
begin
 if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização'; end if;
 if p_action='create' then
   if not public.planning_is_admin(p_org) then raise exception 'Apenas administradores criam cenários'; end if;
   yr:=(p_payload->>'year')::integer;nm:=trim(p_payload->>'name');
   if yr not between 2000 and 2200 or coalesce(length(nm),0) not between 1 and 80 then raise exception 'Nome e ano inválidos'; end if;
   if right(nm,length(yr::text))<>yr::text then nm:=nm||' '||yr; end if;
   if jsonb_typeof(p_payload->'months') is distinct from 'array' then raise exception 'Defina exatamente 12 meses'; end if;
   if jsonb_array_length(p_payload->'months')<>12 then raise exception 'Defina exatamente 12 meses'; end if;
   sid:=gen_random_uuid(); perform set_config('vecton.planning_write',sid::text,true);
   insert into public.forecast_scenarios(id,organization_id,name,color,icon,reference_year,cutoff_month,created_by,planning_version,kind)
   values(sid,p_org,nm,coalesce(p_payload->>'color','#4f7cff'),coalesce(nullif(p_payload->>'icon',''),'vp-icon-cost'),yr,0,auth.uid(),1,
    case when exists(select 1 from jsonb_array_elements(p_payload->'months') x where x->>'type'='forms') then 'built' else 'imported' end);
   -- Explicit base wins; otherwise inherit the latest planning scenario in this org.
   source_id:=nullif(p_payload->>'base_scenario_id','')::uuid;
   if source_id is null then select id into source_id from public.forecast_scenarios where organization_id=p_org and planning_version=1 and id<>sid order by created_at desc,id limit 1;end if;
   if source_id is not null and not exists(select 1 from public.forecast_scenarios where id=source_id and organization_id=p_org) then raise exception 'Cenário base inválido';end if;
   perform public.planning_capex_inherit(p_org,sid,source_id);
   mo:=0;
   for m in select * from jsonb_array_elements(p_payload->'months') loop
     mo:=mo+1;source_id:=null;src_year:=null;
     if m->>'type'='real' then src_year:=(m->>'year')::integer;
     elsif m->>'type'='scenario' then
       source_id:=(m->>'scenario_id')::uuid;
       select reference_year into src_year from public.forecast_scenarios where id=source_id and organization_id=p_org for share;
       if not found then raise exception 'Cenário de origem inválido'; end if;
     elsif m->>'type'<>'forms' then raise exception 'Fonte inválida'; end if;
     insert into public.planning_scenario_months values(sid,p_org,mo,m->>'type',case when m->>'type'='real' then src_year end,source_id);
     if m->>'type'='real' then
       insert into public.forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount,history)
       select p_org,sid,yr,mo,account_number,cost_center_id,cost_center_number,amount,'Snapshot Real '||src_year from public.actuals_ledger_entries where organization_id=p_org and reference_year=src_year and reference_month=mo;
     elsif m->>'type'='scenario' then
       insert into public.forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount,history)
       select p_org,sid,yr,mo,account_number,cost_center_id,cost_center_number,amount,'Snapshot cenário '||source_id from public.forecast_ledger_entries where organization_id=p_org and scenario_id=source_id and reference_year=src_year and reference_month=mo;
     end if;
   end loop;
   update public.forecast_scenarios set cutoff_month=coalesce((select min(reference_month)-1 from public.planning_scenario_months where scenario_id=sid and source_type<>'real'),12) where id=sid;
   for item in select * from jsonb_array_elements(coalesce(p_payload->'forms','[]')) loop
     if item->>'source_form_id' is not null then fid:=public.planning_clone_form(p_org,sid,(item->>'source_form_id')::uuid,item);
     else
       fid:=gen_random_uuid();insert into public.planning_forms(id,organization_id,scenario_id,code,name) values(fid,p_org,sid,trim(item->>'code'),trim(item->>'name'));
     end if;
     if item ? 'access' then
       delete from public.planning_form_access where form_id=fid;
       for cell in select * from jsonb_array_elements(item->'access') loop
         if not exists(select 1 from public.user_profiles where organization_id=p_org and user_id=(cell->>'user_id')::uuid and is_active) then raise exception 'Pessoa inválida'; end if;
         insert into public.planning_form_access values(p_org,fid,(cell->>'user_id')::uuid,cell->>'access_mode');
       end loop;
     end if;
   end loop;
   if not exists(select 1 from public.planning_forms where scenario_id=sid and form_type='capex') then
     insert into public.planning_forms(organization_id,scenario_id,code,name,form_type) values(p_org,sid,'CPX','CAPEX · Investimentos','capex');
   end if;
   insert into public.planning_audit_log(organization_id,scenario_id,actor,action) values(p_org,sid,auth.uid(),'created');
   return jsonb_build_object('id',sid);
 end if;
 select * into s from public.forecast_scenarios where id=sid and organization_id=p_org for update;
 if not found or (s.planning_version<>1 and p_action<>'favorite') then raise exception 'Cenário de planejamento inválido'; end if;
 perform set_config('vecton.planning_write',sid::text,true);
 if p_action='lock' then
   if not public.planning_is_admin(p_org) then raise exception 'Sem permissão'; end if;
   update public.forecast_scenarios set status=case when (p_payload->>'locked')::boolean then 'locked' else 'open' end,lock_at=nullif(p_payload->>'lock_at','')::timestamptz where id=sid;
 elsif p_action<>'favorite' and (s.status='locked' or s.lock_at<=clock_timestamp()) then raise exception 'Cenário bloqueado';
 elsif p_action='favorite' then
   if not public.planning_is_admin(p_org) then raise exception 'Sem permissão'; end if;
   -- Global favorite can include other managed scenarios, so authorize each row.
   old_setting:=current_setting('vecton.planning_write',true);
   for item in select to_jsonb(x) from public.forecast_scenarios x where organization_id=p_org and is_default loop
     perform set_config('vecton.planning_write',item->>'id',true);
     update public.forecast_scenarios set is_default=false where id=(item->>'id')::uuid;
   end loop;
   perform set_config('vecton.planning_write',old_setting,true);
   update public.forecast_scenarios set is_default=coalesce((p_payload->>'enabled')::boolean,true) where id=sid;
 elsif p_action='delete_scenario' then
   if not public.planning_is_admin(p_org) or p_payload->>'confirmation' is distinct from 'REMOVER' then raise exception 'Remoção exige administrador e confirmação'; end if;
   if exists(select 1 from public.planning_scenario_months where source_scenario_id=sid and scenario_id<>sid) then raise exception 'Este cenário é fonte de outro cenário e não pode ser removido'; end if;
   delete from public.forecast_ledger_entries where scenario_id=sid;
   delete from public.planning_entries where form_id in(select id from public.planning_forms where scenario_id=sid);
   delete from public.planning_forms where scenario_id=sid;
   delete from public.forecast_scenarios where id=sid;
 elsif p_action in ('save_form','copy_form') then
   if not public.planning_is_admin(p_org) then raise exception 'Sem permissão'; end if;
   if p_action='copy_form' then fid:=public.planning_clone_form(p_org,sid,(p_payload->>'source_form_id')::uuid,p_payload||'{"copy_values":false,"copy_access":false,"status":"draft"}'::jsonb);
   else
     fid:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
     if exists(select 1 from public.planning_forms where id=fid and (organization_id<>p_org or scenario_id<>sid)) then raise exception 'Formulário inválido'; end if;
     if upper(trim(p_payload->>'code'))='CPX' and not exists(select 1 from public.planning_forms where id=fid and form_type='capex') then raise exception 'Código CPX reservado ao CAPEX';end if;
     if exists(select 1 from public.planning_forms where id=fid and form_type='capex') and p_payload->>'code' is distinct from 'CPX' then raise exception 'CAPEX usa código CPX';end if;
     if p_payload->>'status'='released' and not exists(select 1 from public.planning_forms where id=fid and form_type='capex') and not exists(select 1 from public.planning_form_lines where form_id=fid and origin='input') then raise exception 'Adicione linhas digitadas antes de liberar'; end if;
     insert into public.planning_forms(id,organization_id,scenario_id,code,name,status) values(fid,p_org,sid,trim(p_payload->>'code'),trim(p_payload->>'name'),coalesce(p_payload->>'status','draft'))
     on conflict(id) do update set code=excluded.code,name=excluded.name,status=excluded.status,revision=planning_forms.revision+1;
   end if;
 else
   fid:=(p_payload->>'form_id')::uuid;
   select * into f from public.planning_forms where id=fid and scenario_id=sid and organization_id=p_org;
   if not found then raise exception 'Formulário inválido'; end if;
   if f.form_type='capex' and p_action not in ('save_access') then raise exception 'Use as operações autorizadas do CAPEX';end if;
   if p_action='save_entries' then
     if public.planning_form_mode(fid) is distinct from 'write' then raise exception 'Sem permissão de lançamento'; end if;
     if (p_payload->>'form_revision')::integer is distinct from f.revision then raise exception 'A estrutura ou os acessos do formulário mudaram; reabra o formulário antes de salvar'; end if;
     if jsonb_typeof(p_payload->'cells') is distinct from 'array' then raise exception 'Lote inválido; máximo 5000 células'; end if;
     if jsonb_array_length(p_payload->'cells')>5000 then raise exception 'Lote inválido; máximo 5000 células'; end if;
     if exists(select 1 from jsonb_array_elements(p_payload->'cells') x group by x->>'line_id',x->>'cost_center_id',x->>'month' having count(*)>1) then raise exception 'Célula repetida no lote'; end if;
     -- Lote validado e gravado em comandos únicos (sem consulta por célula).
     if exists(select 1 from jsonb_to_recordset(p_payload->'cells') as x(line_id uuid,cost_center_id uuid,month integer,amount text,version integer)
       where x.line_id is null or x.cost_center_id is null or x.month is null
       or x.amount is null or x.amount !~ '^-?[0-9]+(\.[0-9]{1,2})?$'
       or not exists(select 1 from public.planning_form_lines l where l.id=x.line_id and l.form_id=fid and l.origin='input')
       or x.cost_center_id not in(select public.planning_cc_scope(p_org))
       or not exists(select 1 from public.planning_scenario_months mm where mm.scenario_id=sid and mm.reference_month=x.month and mm.source_type='forms')) then
       raise exception 'Célula inválida ou fora do escopo';
     end if;
     select coalesce(jsonb_agg(jsonb_build_object('line_id',x.line_id,'cost_center_id',x.cost_center_id,'month',x.month,'amount',x.amount::numeric,'version',x.version,
         'current_version',coalesce(e.row_version,0),'current_amount',e.amount)),'[]') into conflicts
       from jsonb_to_recordset(p_payload->'cells') as x(line_id uuid,cost_center_id uuid,month integer,amount text,version integer)
       left join public.planning_entries e on e.line_id=x.line_id and e.cost_center_id=x.cost_center_id and e.reference_month=x.month
       where coalesce(e.row_version,0)<>coalesce(x.version,-1);
     if jsonb_array_length(conflicts)>0 then return jsonb_build_object('ok',false,'conflicts',conflicts); end if;
     insert into public.planning_entries(organization_id,form_id,line_id,cost_center_id,reference_month,amount,updated_by)
       select p_org,fid,x.line_id,x.cost_center_id,x.month,x.amount::numeric,auth.uid()
       from jsonb_to_recordset(p_payload->'cells') as x(line_id uuid,cost_center_id uuid,month integer,amount text,version integer)
     on conflict(line_id,cost_center_id,reference_month) do update set amount=excluded.amount,row_version=planning_entries.row_version+1,updated_by=auth.uid(),updated_at=clock_timestamp();
   elsif p_action='project' then
     if public.planning_form_mode(fid) is distinct from 'write' then raise exception 'Sem permissão para integrar'; end if;
     started:=clock_timestamp();run_id:=gen_random_uuid();
     begin
       delete from public.forecast_ledger_entries where scenario_id=sid and planning_form_id in(select id from public.planning_forms where scenario_id=sid and form_type='opex');
       insert into public.forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount,history,planning_form_id)
       select p_org,sid,s.reference_year,e.reference_month,a.account_number,c.id,c.cost_center_number,sum(e.amount),'Planejamento: '||pf.code,pf.id
       from public.planning_entries e join public.planning_forms pf on pf.id=e.form_id join public.planning_form_lines l on l.id=e.line_id
       join public.accounts a on a.id=l.account_id join public.cost_centers c on c.id=e.cost_center_id
       join public.planning_scenario_months m on m.scenario_id=sid and m.reference_month=e.reference_month and m.source_type='forms'
       where pf.scenario_id=sid and pf.form_type='opex' and pf.status='released' and e.organization_id=p_org and l.origin='input'
       group by e.reference_month,a.account_number,c.id,c.cost_center_number,pf.id,pf.code having sum(e.amount)<>0;
       get diagnostics affected=row_count;
     exception when others then err:=sqlerrm;
     end;
     insert into public.planning_runs(id,organization_id,scenario_id,initiated_form_id,status,started_by,started_at,rows_written,error)
     values(run_id,p_org,sid,fid,case when err is null then 'ok' else 'error' end,auth.uid(),started,case when err is null then affected else 0 end,err);
     return jsonb_build_object('ok',err is null,'run_id',run_id,'rows_written',affected,'error',err);
   else
     if not public.planning_is_admin(p_org) then raise exception 'Apenas administradores configuram formulários'; end if;
     if p_action='save_access' then
       if jsonb_typeof(p_payload->'access') is distinct from 'array' then raise exception 'Lista de acessos inválida'; end if;
       delete from public.planning_form_access where form_id=fid;
       for item in select * from jsonb_array_elements(p_payload->'access') loop
         if not exists(select 1 from public.user_profiles where organization_id=p_org and user_id=(item->>'user_id')::uuid and is_active) then raise exception 'Pessoa inválida'; end if;
         insert into public.planning_form_access values(p_org,fid,(item->>'user_id')::uuid,item->>'access_mode');
       end loop;
     elsif p_action='import_accounts' then
       affected:=coalesce((select max(seq) from public.planning_form_lines where form_id=fid),0);
       for source_id in select distinct x::uuid from jsonb_array_elements_text(p_payload->'account_ids') x loop
         if not exists(select 1 from public.accounts a join public.dre_plan_nodes d on d.account_id=a.id and d.organization_id=a.organization_id where a.id=source_id and a.organization_id=p_org and a.active and d.active and d.node_class='Analitica') then raise exception 'Conta DRE inválida'; end if;
         if not exists(select 1 from public.planning_form_lines where form_id=fid and account_id=source_id) then
           affected:=affected+1;
           insert into public.planning_form_lines(organization_id,form_id,seq,description,origin,formula_name,account_id)
           select p_org,fid,affected,account_name,'input','CTA_'||replace(id::text,'-',''),id from public.accounts where id=source_id;
         end if;
       end loop;
     elsif p_action='clear_entries' then
       if p_payload->>'confirmation' is distinct from 'APAGAR' then raise exception 'Confirmação obrigatória'; end if;
       -- Keep zero-valued cells (and increment versions) to prevent ABA conflicts.
       update public.planning_entries set amount=0,row_version=row_version+1,updated_at=clock_timestamp(),updated_by=auth.uid() where form_id=fid;
     elsif p_action in ('save_line','delete_line') then
       lid:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
       select * into oldline from public.planning_form_lines where id=lid;
       if found and oldline.form_id<>fid then raise exception 'Linha inválida'; end if;
       if oldline.id is not null and exists(select 1 from public.planning_entries where form_id=fid) then
         if p_action='delete_line' or oldline.origin is distinct from p_payload->>'origin'
         or oldline.account_id is distinct from nullif(p_payload->>'account_id','')::uuid
         or oldline.formula_name is distinct from nullif(p_payload->>'formula_name','')
         or oldline.formula_text is distinct from nullif(p_payload->>'formula_text','')
         or oldline.seq is distinct from (p_payload->>'seq')::int then raise exception 'Estrutura bloqueada: já existem valores salvos'; end if;
       end if;
       -- Mudar a sequência renumera as fórmulas que a referenciam (as referências são <seq>).
       -- A sequência nova precisa estar livre; trocar duas linhas exige passar por um número livre.
       if p_action='save_line' and oldline.id is not null and oldline.seq is distinct from (p_payload->>'seq')::int then
         if exists(select 1 from public.planning_form_lines where form_id=fid and seq=(p_payload->>'seq')::int and id<>lid) then
           raise exception 'A sequência % já está em uso por outra linha', (p_payload->>'seq')::int;
         end if;
         if oldline.origin<>'label' then
           update public.planning_form_lines set formula_text=replace(formula_text,'<'||oldline.seq||'>','<'||(p_payload->>'seq')||'>')
           where form_id=fid and origin='formula' and id<>lid and formula_text like '%<'||oldline.seq||'>%';
         end if;
       end if;
       if p_action='delete_line' then delete from public.planning_form_lines where id=lid and form_id=fid;
       else
         if p_payload->>'origin'='input' and not exists(select 1 from public.accounts a join public.dre_plan_nodes d on d.account_id=a.id and d.organization_id=a.organization_id where a.id=(p_payload->>'account_id')::uuid and a.organization_id=p_org and a.active and d.active and d.node_class='Analitica') then raise exception 'Selecione conta DRE analítica ativa'; end if;
         insert into public.planning_form_lines(id,organization_id,form_id,seq,description,origin,formula_name,formula_text,account_id,group_name,style)
         values(lid,p_org,fid,(p_payload->>'seq')::int,trim(p_payload->>'description'),p_payload->>'origin',nullif(p_payload->>'formula_name',''),nullif(p_payload->>'formula_text',''),nullif(p_payload->>'account_id','')::uuid,coalesce(p_payload->>'group_name',''),coalesce(p_payload->'style','{}'))
         on conflict(id) do update set seq=excluded.seq,description=excluded.description,origin=excluded.origin,formula_name=excluded.formula_name,formula_text=excluded.formula_text,account_id=excluded.account_id,group_name=excluded.group_name,style=excluded.style;
       end if;
       perform public.planning_validate_form(fid);
     else raise exception 'Operação desconhecida'; end if;
     update public.planning_forms set revision=revision+1 where id=fid;
   end if;
 end if;
 insert into public.planning_audit_log(organization_id,scenario_id,actor,action,details) values(p_org,sid,auth.uid(),p_action,jsonb_build_object('form_id',fid));
 return jsonb_build_object('ok',true,'id',coalesce(lid,fid,sid));
end $$;

commit;
