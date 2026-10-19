-- Planejamento participativo. Aplicar em homologação antes do frontend.
-- Dados digitados são independentes do ledger publicado. Todas as mutações
-- compartilham o lock do cenário e passam pela RPC planning_write.
begin;

alter table public.forecast_scenarios
  add column if not exists planning_version integer not null default 0,
  add column if not exists kind text not null default 'imported' check (kind in ('imported','built')),
  add column if not exists status text not null default 'open' check (status in ('open','locked')),
  add column if not exists lock_at timestamptz;
alter table public.forecast_scenarios add constraint planning_scenario_kind_version
 check(planning_version in(0,1) and (planning_version<>0 or kind='imported'));

create table public.planning_scenario_months (
  scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  reference_month integer not null check(reference_month between 1 and 12),
  source_type text not null check(source_type in ('forms','real','scenario')),
  source_year integer,
  source_scenario_id uuid references public.forecast_scenarios(id) on delete restrict,
  primary key(scenario_id,reference_month),
  check((source_type='forms' and source_year is null and source_scenario_id is null)
    or (source_type='real' and source_year is not null and source_year between 2000 and 2200 and source_scenario_id is null)
    or (source_type='scenario' and source_scenario_id is not null and source_year is null))
);
create table public.planning_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
  code text not null check(length(trim(code)) between 1 and 50),
  name text not null check(length(trim(name)) between 1 and 150),
  status text not null default 'draft' check(status in ('draft','released')),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  unique(scenario_id,code)
);
create table public.planning_form_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  form_id uuid not null references public.planning_forms(id) on delete cascade,
  seq integer not null check(seq>0),
  description text not null check(length(trim(description)) between 1 and 250),
  origin text not null check(origin in ('input','formula','label')),
  formula_name text,
  formula_text text,
  account_id uuid references public.accounts(id),
  group_name text not null default '',
  style jsonb not null default '{}',
  unique(form_id,seq), unique(form_id,formula_name),
  check((origin='input' and account_id is not null and formula_name is not null and formula_text is null)
    or (origin='formula' and account_id is null and formula_name is not null and formula_text is not null)
    or (origin='label' and account_id is null and formula_name is null and formula_text is null)),
  check(formula_name is null or formula_name ~ '^[A-Za-z0-9_]+$')
);
create table public.planning_form_access (
  organization_id uuid not null references public.organizations(id),
  form_id uuid not null references public.planning_forms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_mode text not null check(access_mode in ('read','write')),
  primary key(form_id,user_id)
);
create table public.planning_entries (
  organization_id uuid not null references public.organizations(id),
  form_id uuid not null references public.planning_forms(id) on delete cascade,
  line_id uuid not null references public.planning_form_lines(id) on delete restrict,
  cost_center_id uuid not null references public.cost_centers(id) on delete restrict,
  reference_month integer not null check(reference_month between 1 and 12),
  amount numeric(18,2) not null,
  row_version integer not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(line_id,cost_center_id,reference_month)
);
create index planning_entries_form_cc on public.planning_entries(form_id,cost_center_id);
create table public.planning_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
  initiated_form_id uuid references public.planning_forms(id) on delete set null,
  status text not null check(status in ('ok','error')),
  started_by uuid references auth.users(id),
  started_at timestamptz not null,
  finished_at timestamptz not null default clock_timestamp(),
  rows_written integer not null default 0,
  error text,
  details jsonb not null default '{}'
);
create index planning_runs_scenario_time on public.planning_runs(scenario_id,started_at desc);
create table public.planning_entry_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  scenario_id uuid not null,
  form_id uuid not null,
  line_id uuid not null,
  cost_center_id uuid not null,
  reference_month integer not null,
  old_amount numeric(18,2),new_amount numeric(18,2),
  actor uuid, action text not null, at timestamptz not null default clock_timestamp()
);
create table public.planning_audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  scenario_id uuid not null,
  actor uuid,action text not null,
  details jsonb not null default '{}',at timestamptz not null default clock_timestamp()
);
alter table public.forecast_ledger_entries add column if not exists planning_form_id uuid
  references public.planning_forms(id) on delete restrict;
create index if not exists forecast_planning_form on public.forecast_ledger_entries(scenario_id,planning_form_id) where planning_form_id is not null;

create function public.planning_is_admin(p_org uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_org_member(p_org) and exists(select 1 from public.user_profiles u
 where u.organization_id=p_org and u.user_id=auth.uid() and u.is_active
 and (u.access_role::text in ('admin','super_admin')
 or coalesce(u.additional_access_roles::text[],'{}') && array['admin','super_admin']));
$$;
create function public.planning_cc_scope(p_org uuid) returns setof uuid
language sql stable security definer set search_path=public as $$
 select c.id from public.cost_centers c
 where c.organization_id=p_org and public.is_org_member(p_org) and c.active and (
 public.planning_is_admin(p_org) or exists(select 1 from public.user_profiles u
 where u.organization_id=p_org and u.user_id=auth.uid() and u.is_active
 and (u.access_role::text in ('manager','analyst') or coalesce(u.additional_access_roles::text[],'{}') && array['manager','analyst'])
 and (nullif(trim(u.management),'')=trim(c.cost_center_management)
 or trim(c.cost_center_management)=any(coalesce(u.extra_managements,'{}'))
 or c.id::text=any(coalesce(u.extra_cc_ids::text[],'{}')))));
$$;
create function public.planning_form_mode(p_form uuid) returns text
language sql stable security definer set search_path=public as $$
 select case when public.planning_is_admin(f.organization_id) then 'write'
 when f.status='released' and exists(select 1 from public.planning_cc_scope(f.organization_id))
 then (select a.access_mode from public.planning_form_access a where a.form_id=f.id and a.user_id=auth.uid()) end
 from public.planning_forms f where f.id=p_form and public.is_org_member(f.organization_id);
$$;
create function public.planning_can_view(p_scenario uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.forecast_scenarios s where s.id=p_scenario
 and public.is_org_member(s.organization_id) and (s.planning_version=0 or public.planning_is_admin(s.organization_id)
 or exists(select 1 from public.planning_forms f where f.scenario_id=s.id and public.planning_form_mode(f.id) is not null)));
$$;

-- New tables have no client write grants or policies, even if defaults grant DML.
do $$declare t text; begin
 foreach t in array array['planning_scenario_months','planning_forms','planning_form_lines','planning_form_access','planning_entries','planning_runs','planning_entry_audit','planning_audit_log'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy planning_months_read on public.planning_scenario_months for select using(public.planning_can_view(scenario_id));
create policy planning_forms_read on public.planning_forms for select using(public.planning_form_mode(id) is not null);
create policy planning_lines_read on public.planning_form_lines for select using(public.planning_form_mode(form_id) is not null);
create policy planning_access_read on public.planning_form_access for select using(public.planning_is_admin(organization_id) or (user_id=auth.uid() and public.planning_form_mode(form_id) is not null));
create policy planning_entries_read on public.planning_entries for select using(public.planning_form_mode(form_id) is not null and cost_center_id in(select public.planning_cc_scope(organization_id)));
create policy planning_runs_read on public.planning_runs for select using(public.planning_can_view(scenario_id));
create policy planning_entry_audit_read on public.planning_entry_audit for select using(public.planning_is_admin(organization_id));
create policy planning_audit_read on public.planning_audit_log for select using(public.planning_is_admin(organization_id));

-- Deny legacy direct loads/deletes/updates into built scenarios, including moves
-- of a ledger row from a built scenario into an imported one.
create function public.planning_guard_forecast() returns trigger language plpgsql set search_path=public as $$
declare sid uuid; managed boolean; begin
 if tg_table_name='forecast_scenarios' then
   if tg_op='UPDATE' and (old.kind<>new.kind or old.planning_version<>new.planning_version) then
     raise exception 'O tipo do cenário não pode mudar após a criação';
   end if;
   sid:=case when tg_op='DELETE' then old.id else new.id end;
   managed:=case when tg_op='INSERT' then new.planning_version>0 when tg_op='DELETE' then old.planning_version>0 else old.planning_version>0 or new.planning_version>0 end;
 else
   sid:=case when tg_op='DELETE' then old.scenario_id else new.scenario_id end;
   select exists(select 1 from public.forecast_scenarios where id=sid and planning_version>0) into managed;
   if tg_op='UPDATE' and old.scenario_id<>new.scenario_id and exists(select 1 from public.forecast_scenarios where id=old.scenario_id and planning_version>0) then managed:=true; end if;
 end if;
 if managed and (current_user in ('authenticated','anon') or current_setting('vecton.planning_write',true) is distinct from sid::text) then
   raise exception 'Cenário de planejamento: utilize as operações autorizadas do módulo';
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger planning_guard_scenario before insert or update or delete on public.forecast_scenarios for each row execute function public.planning_guard_forecast();
create trigger planning_guard_ledger before insert or update or delete on public.forecast_ledger_entries for each row execute function public.planning_guard_forecast();
create trigger planning_guard_totals before insert or update or delete on public.forecast_monthly_account_totals for each row execute function public.planning_guard_forecast();

-- A proteção de user_profiles foi separada na migration 281.

create function public.planning_audit_entry() returns trigger language plpgsql security definer set search_path=public as $$
declare r public.planning_entries; sid uuid; begin
 if tg_op='DELETE' then r:=old; else r:=new; end if;
 select scenario_id into sid from public.planning_forms where id=r.form_id;
 insert into public.planning_entry_audit(organization_id,scenario_id,form_id,line_id,cost_center_id,reference_month,old_amount,new_amount,actor,action)
 values(r.organization_id,sid,r.form_id,r.line_id,r.cost_center_id,r.reference_month,
 case when tg_op<>'INSERT' then old.amount end,case when tg_op<>'DELETE' then new.amount end,auth.uid(),tg_op);
 return null;
end $$;
create trigger planning_audit_entry after insert or update or delete on public.planning_entries for each row execute function public.planning_audit_entry();

-- Syntactic validation and graph validation only; formulas never publish ledger.
create function public.planning_validate_form(p_form uuid) returns void language plpgsql set search_path=public as $$
declare l record; token text; tokens text[]; pos integer; depth integer; need_operand boolean; dep text; begin
 for l in select * from public.planning_form_lines where form_id=p_form and origin='formula' loop
   if length(l.formula_text)>4000 then raise exception 'Fórmula muito longa'; end if;
   tokens:=array(select m[1] from regexp_matches(l.formula_text, '(<[A-Za-z0-9_]+>|[0-9]+(?:\.[0-9]+)?|[()+*/-])','g') m);
   if coalesce(array_to_string(tokens,''),'')<>regexp_replace(l.formula_text,'\s','','g') or cardinality(tokens)=0 then raise exception 'Sintaxe de fórmula inválida'; end if;
   depth:=0;need_operand:=true;
   foreach token in array tokens loop
     if token='(' then if not need_operand then raise exception 'Operador ausente'; end if; depth:=depth+1;
     elsif token=')' then if need_operand or depth=0 then raise exception 'Parênteses inválidos'; end if; depth:=depth-1;need_operand:=false;
     elsif token in ('+','-','*','/') then if need_operand and token in ('*','/') then raise exception 'Operando ausente'; end if; need_operand:=true;
     else
       if not need_operand then raise exception 'Operador ausente'; end if; need_operand:=false;
       if left(token,1)='<' then dep:=substr(token,2,length(token)-2);
         if not exists(select 1 from public.planning_form_lines where form_id=p_form and formula_name=dep and origin<>'label') then raise exception 'Referência inexistente: %',dep; end if;
       end if;
     end if;
   end loop;
   if depth<>0 or need_operand then raise exception 'Expressão incompleta'; end if;
 end loop;
 if exists(with recursive edges as (
   select fl.id src,d.id dst from public.planning_form_lines fl
   cross join lateral regexp_matches(fl.formula_text,'<([A-Za-z0-9_]+)>','g') m
   join public.planning_form_lines d on d.form_id=fl.form_id and d.formula_name=m[1]
   where fl.form_id=p_form and fl.origin='formula'
 ), walk as (select src,dst from edges union
 select w.src,e.dst from walk w join edges e on e.src=w.dst)
 select 1 from walk where src=dst) then raise exception 'Referência circular na fórmula'; end if;
end $$;

create function public.planning_clone_form(p_org uuid,p_target uuid,p_source uuid,p_options jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare src public.planning_forms; fid uuid; l record; lid uuid; begin
 select * into src from public.planning_forms where id=p_source and organization_id=p_org;
 if not found then raise exception 'Formulário de origem inválido'; end if;
 perform 1 from public.forecast_scenarios where id=src.scenario_id for share;
 fid:=gen_random_uuid();
 insert into public.planning_forms(id,organization_id,scenario_id,code,name,status)
 values(fid,p_org,p_target,coalesce(nullif(trim(p_options->>'code'),''),src.code),coalesce(nullif(trim(p_options->>'name'),''),src.name),coalesce(p_options->>'status','draft'));
 for l in select * from public.planning_form_lines where form_id=src.id order by seq loop
   lid:=gen_random_uuid();
   insert into public.planning_form_lines(id,organization_id,form_id,seq,description,origin,formula_name,formula_text,account_id,group_name,style)
   values(lid,p_org,fid,l.seq,l.description,l.origin,l.formula_name,l.formula_text,l.account_id,l.group_name,l.style);
   if coalesce((p_options->>'copy_values')::boolean,false) then
     insert into public.planning_entries(organization_id,form_id,line_id,cost_center_id,reference_month,amount,updated_by)
     select p_org,fid,lid,e.cost_center_id,e.reference_month,e.amount,auth.uid() from public.planning_entries e
     join public.planning_scenario_months m on m.scenario_id=p_target and m.reference_month=e.reference_month and m.source_type='forms' where e.line_id=l.id;
   end if;
 end loop;
 if coalesce((p_options->>'copy_access')::boolean,false) then
   insert into public.planning_form_access select p_org,fid,user_id,access_mode from public.planning_form_access where form_id=src.id;
 end if;
 return fid;
end $$;
revoke all on function public.planning_clone_form(uuid,uuid,uuid,jsonb) from public,anon,authenticated;

create function public.planning_context(p_org uuid,p_scenario uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb; begin
 if not public.is_org_member(p_org) then raise exception 'Sem acesso à organização'; end if;
 if p_scenario is not null and not public.planning_can_view(p_scenario) then raise exception 'Sem acesso ao cenário'; end if;
 if p_scenario is not null and not exists(select 1 from public.forecast_scenarios where id=p_scenario and organization_id=p_org) then raise exception 'Cenário inválido'; end if;
 result:=jsonb_build_object('version',1,'is_admin',public.planning_is_admin(p_org),'user_id',auth.uid(),
 'scenarios',(select coalesce(jsonb_agg(to_jsonb(s) order by reference_year desc,name),'[]') from public.forecast_scenarios s where organization_id=p_org and public.planning_can_view(s.id)),
 'cost_centers',(select coalesce(jsonb_agg(to_jsonb(c) order by cost_center_number),'[]') from public.cost_centers c where c.id in(select public.planning_cc_scope(p_org))),
 'accounts',(select coalesce(jsonb_agg(to_jsonb(a) order by account_number),'[]') from public.accounts a where organization_id=p_org and active and exists(select 1 from public.dre_plan_nodes d where d.account_id=a.id and d.organization_id=p_org and d.active and d.node_class='Analitica')),
 'users',case when public.planning_is_admin(p_org) then (select coalesce(jsonb_agg(jsonb_build_object('user_id',u.user_id,'full_name',u.full_name,'management',u.management) order by full_name),'[]') from public.user_profiles u where u.organization_id=p_org and u.is_active) else '[]'::jsonb end,
 'forms',(select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('access_mode',public.planning_form_mode(f.id)) order by code),'[]') from public.planning_forms f where organization_id=p_org and (p_scenario is null or scenario_id=p_scenario) and public.planning_form_mode(f.id) is not null),
 'months',(select coalesce(jsonb_agg(to_jsonb(m) order by reference_month),'[]') from public.planning_scenario_months m where scenario_id=p_scenario),
 'lines',(select coalesce(jsonb_agg(to_jsonb(l) order by seq),'[]') from public.planning_form_lines l join public.planning_forms f on f.id=l.form_id where f.scenario_id=p_scenario and public.planning_form_mode(f.id) is not null),
 'access',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.planning_form_access a join public.planning_forms f on f.id=a.form_id where f.scenario_id=p_scenario and public.planning_is_admin(p_org)),
 'runs',(select coalesce(jsonb_agg(to_jsonb(r) order by started_at desc),'[]') from (select * from public.planning_runs where scenario_id=p_scenario order by started_at desc limit 30) r));
 return result;
end $$;

-- A form is paged by one or more scoped CCs, not by the size of the scenario.
create function public.planning_read_form(p_org uuid,p_form uuid,p_cc_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare f public.planning_forms; begin
 select * into f from public.planning_forms where id=p_form and organization_id=p_org;
 if not found or public.planning_form_mode(p_form) is null then raise exception 'Sem acesso ao formulário'; end if;
 if cardinality(p_cc_ids)>100 or exists(select 1 from unnest(p_cc_ids) c where c not in(select public.planning_cc_scope(p_org))) then raise exception 'Centro de custo fora do escopo'; end if;
 return jsonb_build_object('entries',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.planning_entries e where e.form_id=p_form and e.cost_center_id=any(p_cc_ids)),
 'copied',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select l.account_number,l.cost_center_id,l.reference_month,sum(l.amount) amount from public.forecast_ledger_entries l
 join public.planning_scenario_months m on m.scenario_id=l.scenario_id and m.reference_month=l.reference_month and m.source_type<>'forms'
 where l.scenario_id=f.scenario_id and l.cost_center_id=any(p_cc_ids) group by l.account_number,l.cost_center_id,l.reference_month) x));
end $$;

create function public.planning_write(p_org uuid,p_action text,p_scenario uuid default null,p_payload jsonb default '{}') returns jsonb
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
   insert into public.forecast_scenarios(id,organization_id,name,color,reference_year,cutoff_month,created_by,planning_version,kind)
   values(sid,p_org,nm,coalesce(p_payload->>'color','#4f7cff'),yr,0,auth.uid(),1,
    case when exists(select 1 from jsonb_array_elements(p_payload->'months') x where x->>'type'='forms') then 'built' else 'imported' end);
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
   insert into public.planning_audit_log(organization_id,scenario_id,actor,action) values(p_org,sid,auth.uid(),'created');
   return jsonb_build_object('id',sid);
 end if;
 select * into s from public.forecast_scenarios where id=sid and organization_id=p_org for update;
 if not found or (s.planning_version<>1 and p_action<>'favorite') then raise exception 'Cenário de planejamento inválido'; end if;
 perform set_config('vecton.planning_write',sid::text,true);
 if p_action='lock' then
   if not public.planning_is_admin(p_org) then raise exception 'Sem permissão'; end if;
   update public.forecast_scenarios set status=case when (p_payload->>'locked')::boolean then 'locked' else 'open' end,lock_at=nullif(p_payload->>'lock_at','')::timestamptz where id=sid;
 elsif s.status='locked' or s.lock_at<=clock_timestamp() then raise exception 'Cenário bloqueado';
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
     if p_payload->>'status'='released' and not exists(select 1 from public.planning_form_lines where form_id=fid and origin='input') then raise exception 'Adicione linhas digitadas antes de liberar'; end if;
     insert into public.planning_forms(id,organization_id,scenario_id,code,name,status) values(fid,p_org,sid,trim(p_payload->>'code'),trim(p_payload->>'name'),coalesce(p_payload->>'status','draft'))
     on conflict(id) do update set code=excluded.code,name=excluded.name,status=excluded.status,revision=planning_forms.revision+1;
   end if;
 else
   fid:=(p_payload->>'form_id')::uuid;
   select * into f from public.planning_forms where id=fid and scenario_id=sid and organization_id=p_org;
   if not found then raise exception 'Formulário inválido'; end if;
   if p_action='save_entries' then
     if public.planning_form_mode(fid) is distinct from 'write' then raise exception 'Sem permissão de lançamento'; end if;
     if (p_payload->>'form_revision')::integer is distinct from f.revision then raise exception 'A estrutura ou os acessos do formulário mudaram; reabra o formulário antes de salvar'; end if;
     if jsonb_typeof(p_payload->'cells') is distinct from 'array' then raise exception 'Lote inválido; máximo 5000 células'; end if;
     if jsonb_array_length(p_payload->'cells')>5000 then raise exception 'Lote inválido; máximo 5000 células'; end if;
     if exists(select 1 from jsonb_array_elements(p_payload->'cells') x group by x->>'line_id',x->>'cost_center_id',x->>'month' having count(*)>1) then raise exception 'Célula repetida no lote'; end if;
     for cell in select * from jsonb_array_elements(p_payload->'cells') loop
       if not exists(select 1 from public.planning_form_lines where id=(cell->>'line_id')::uuid and form_id=fid and origin='input')
       or not exists(select 1 from public.planning_cc_scope(p_org) c where c=(cell->>'cost_center_id')::uuid)
       or not exists(select 1 from public.planning_scenario_months where scenario_id=sid and reference_month=(cell->>'month')::int and source_type='forms')
       or cell->>'amount' is null or cell->>'amount' !~ '^-?[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Célula inválida ou fora do escopo'; end if;
       select row_version into actual_version from public.planning_entries where line_id=(cell->>'line_id')::uuid and cost_center_id=(cell->>'cost_center_id')::uuid and reference_month=(cell->>'month')::int;
       if coalesce(actual_version,0)<>coalesce((cell->>'version')::int,-1) then conflicts:=conflicts||jsonb_build_array(cell||jsonb_build_object('current_version',coalesce(actual_version,0),'current_amount',(select amount from public.planning_entries where line_id=(cell->>'line_id')::uuid and cost_center_id=(cell->>'cost_center_id')::uuid and reference_month=(cell->>'month')::int))); end if;
     end loop;
     if jsonb_array_length(conflicts)>0 then return jsonb_build_object('ok',false,'conflicts',conflicts); end if;
     for cell in select * from jsonb_array_elements(p_payload->'cells') loop
       insert into public.planning_entries(organization_id,form_id,line_id,cost_center_id,reference_month,amount,updated_by)
       values(p_org,fid,(cell->>'line_id')::uuid,(cell->>'cost_center_id')::uuid,(cell->>'month')::int,(cell->>'amount')::numeric,auth.uid())
       on conflict(line_id,cost_center_id,reference_month) do update set amount=excluded.amount,row_version=planning_entries.row_version+1,updated_by=auth.uid(),updated_at=clock_timestamp();
     end loop;
   elsif p_action='project' then
     if public.planning_form_mode(fid) is distinct from 'write' then raise exception 'Sem permissão para integrar'; end if;
     started:=clock_timestamp();run_id:=gen_random_uuid();
     begin
       delete from public.forecast_ledger_entries where scenario_id=sid and planning_form_id is not null;
       insert into public.forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount,history,planning_form_id)
       select p_org,sid,s.reference_year,e.reference_month,a.account_number,c.id,c.cost_center_number,sum(e.amount),'Planejamento: '||pf.code,pf.id
       from public.planning_entries e join public.planning_forms pf on pf.id=e.form_id join public.planning_form_lines l on l.id=e.line_id
       join public.accounts a on a.id=l.account_id join public.cost_centers c on c.id=e.cost_center_id
       join public.planning_scenario_months m on m.scenario_id=sid and m.reference_month=e.reference_month and m.source_type='forms'
       where pf.scenario_id=sid and e.organization_id=p_org and l.origin='input'
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

revoke all on function public.planning_write(uuid,text,uuid,jsonb),public.planning_context(uuid,uuid),public.planning_read_form(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.planning_write(uuid,text,uuid,jsonb),public.planning_context(uuid,uuid),public.planning_read_form(uuid,uuid,uuid[]) to authenticated;
revoke all on function public.planning_validate_form(uuid) from public,anon,authenticated;
revoke all on function public.planning_is_admin(uuid),public.planning_cc_scope(uuid),public.planning_form_mode(uuid),public.planning_can_view(uuid) from public,anon;
grant execute on function public.planning_is_admin(uuid),public.planning_cc_scope(uuid),public.planning_form_mode(uuid),public.planning_can_view(uuid) to authenticated;
commit;
