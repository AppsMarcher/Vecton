begin;
-- Fluxo BP no padrão DRE: rascunhos editáveis e somente um fechamento definitivo.
alter table public.bp_import_batches add column if not exists load_mode text not null default 'complete' check(load_mode in ('complete'));
create table if not exists public.bp_import_drafts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 reference_year integer not null check(reference_year between 2000 and 2200), reference_month integer not null check(reference_month between 1 and 12),
 source_type text not null check(source_type in ('actual','planned')), scenario_id uuid references public.forecast_scenarios(id) on delete restrict,
 file_name text not null check(length(btrim(file_name)) between 1 and 255),
 load_mode text not null check(load_mode in ('complete')), input_rows jsonb not null check(jsonb_typeof(input_rows)='array'),
 plan_snapshot jsonb not null, revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid not null,
 check((source_type='actual' and scenario_id is null) or(source_type='planned' and scenario_id is not null))
);
alter table public.bp_import_drafts enable row level security;
revoke all on public.bp_import_drafts from anon;
revoke insert,update,delete,truncate,references,trigger on public.bp_import_drafts from authenticated;
grant select on public.bp_import_drafts to authenticated;
drop policy if exists "admins read BP drafts" on public.bp_import_drafts;
create policy "admins read BP drafts" on public.bp_import_drafts for select to authenticated using(public.can_manage_bp_plan(organization_id));
create index if not exists bp_draft_scope on public.bp_import_drafts(organization_id,reference_year,source_type,updated_at desc,id);

create or replace function public.bp_apply_import(
 p_org uuid,p_branch uuid,p_year integer,p_month integer,p_source text,p_scenario uuid,p_file text,p_rows jsonb,p_plan jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
 snapshot jsonb; expected_plan jsonb; received_plan jsonb; canonical_rows jsonb;
 account_count integer; submitted_count integer; new_id uuid;
begin
 if auth.uid() is null or not public.can_manage_bp_plan(p_org) then raise exception 'Acesso restrito aos administradores'; end if;
 if p_branch is not null then raise exception 'A carga BP é consolidada Marcher, sem seleção de filial'; end if;
 if p_year is null or p_year not between 2000 and 2200 or p_month is null or p_month not between 1 and 12 then raise exception 'Competência inválida'; end if;
 if p_source is null or p_source not in ('actual','planned') then raise exception 'Fonte inválida'; end if;
 if (p_source='actual' and p_scenario is not null) or (p_source='planned' and p_scenario is null) then raise exception 'Destino inválido'; end if;
 if p_file is null or length(btrim(p_file)) not between 1 and 255 then raise exception 'Nome do arquivo inválido'; end if;
 if p_scenario is not null then
  perform 1 from public.forecast_scenarios where id=p_scenario and organization_id=p_org and reference_year=p_year for share;
  if not found then raise exception 'Cenário de outro ano ou organização'; end if;
 end if;
 if jsonb_typeof(p_plan) is distinct from 'array' or jsonb_array_length(p_plan)>10000 then raise exception 'Plano BP inválido'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)=0 or jsonb_array_length(p_rows)>10000 then raise exception 'Carga vazia ou acima de 10.000 contas'; end if;

 -- A leitura do cadastro não pode concorrer com remoções ou alterações de contas.
 lock table public.bp_plan_nodes in share mode;
 -- Mesmo lock do editor do plano: serializa substituições de saldo.
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,300));
 select jsonb_agg(to_jsonb(n) order by n.sort_order,n.id),
  jsonb_agg(jsonb_build_object('id',n.id,'account_code',n.account_code,'name',n.name,
   'node_class',n.node_class,'parent_id',n.parent_id,'group_key',n.group_key,'active',n.active,'sort_order',n.sort_order) order by n.id)
 into snapshot,expected_plan from public.bp_plan_nodes n where n.organization_id=p_org;
 select jsonb_agg(jsonb_build_object('id',n.id,'account_code',n.account_code,'name',n.name,
   'node_class',n.node_class,'parent_id',n.parent_id,'group_key',n.group_key,'active',n.active,'sort_order',n.sort_order) order by n.id)
 into received_plan from jsonb_to_recordset(p_plan) n(id uuid,account_code text,name text,node_class text,parent_id uuid,group_key text,active boolean,sort_order integer);
 if expected_plan is null or expected_plan is distinct from received_plan then
  raise exception 'O Plano BP mudou. Atualize a tela e valide novamente';
 end if;
 select count(*) into account_count from public.bp_plan_nodes where organization_id=p_org and active and node_class='Analitica';
 select count(distinct r.account_id) into submitted_count from jsonb_to_recordset(p_rows) r(account_id uuid,amount numeric);
 if submitted_count<>account_count or jsonb_array_length(p_rows)<>account_count then raise exception 'Informe todas as contas analíticas ativas, sem duplicidades'; end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) r(account_id uuid,amount numeric)
  left join public.bp_plan_nodes n on n.id=r.account_id and n.organization_id=p_org
  where n.id is null or n.node_class<>'Analitica' or not n.active or nullif(btrim(n.group_key),'') is null
   or r.amount is null or r.amount::text in ('NaN','Infinity','-Infinity') or abs(r.amount)>=1e13 or r.amount<>round(r.amount,2)) then
  raise exception 'Conta ou saldo inválido';
 end if;
 select jsonb_agg(jsonb_build_object('account_id',r.account_id,'amount',r.amount) order by r.account_id)
 into canonical_rows from jsonb_to_recordset(p_rows) r(account_id uuid,amount numeric);

 -- Substituição definitiva: só permanece o último lote deste destino.
 delete from public.bp_import_batches where organization_id=p_org
  and reference_year=p_year and reference_month=p_month and source_type=p_source
  and scenario_id is not distinct from p_scenario;
 insert into public.bp_import_batches(organization_id,reference_year,reference_month,source_type,scenario_id,file_name,plan_snapshot,rows,applied_by)
 values(p_org,p_year,p_month,p_source,p_scenario,btrim(p_file),snapshot,canonical_rows,auth.uid()) returning id into new_id;
 delete from public.bp_import_drafts where organization_id=p_org and reference_year=p_year and reference_month=p_month
  and source_type=p_source and scenario_id is not distinct from p_scenario;
 return new_id;
end $$;
revoke all on function public.bp_apply_import(uuid,uuid,integer,integer,text,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.bp_apply_import(uuid,uuid,integer,integer,text,uuid,text,jsonb,jsonb) to authenticated;

create or replace function public.bp_save_draft(p_org uuid,p_id uuid,p_revision integer,p_year integer,p_month integer,p_source text,p_scenario uuid,p_file text,p_rows jsonb,p_plan jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if auth.uid() is null or not public.can_manage_bp_plan(p_org) then raise exception 'Acesso restrito aos administradores'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,300));
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>10000 or pg_column_size(p_rows)>4000000 then raise exception 'Rascunho inválido'; end if;
 if jsonb_typeof(p_plan) is distinct from 'array' or jsonb_array_length(p_plan)>10000 then raise exception 'Plano BP inválido'; end if;
 if p_source='planned' and not exists(select 1 from forecast_scenarios where id=p_scenario and organization_id=p_org and reference_year=p_year) then raise exception 'Cenário de outro ano ou organização'; end if;
 if p_id is null then
  insert into bp_import_drafts(organization_id,reference_year,reference_month,source_type,scenario_id,file_name,load_mode,input_rows,plan_snapshot,created_by)
  values(p_org,p_year,p_month,p_source,p_scenario,p_file,'complete',p_rows,p_plan,auth.uid()) returning id into result;
 else
  update bp_import_drafts set input_rows=p_rows,plan_snapshot=p_plan,revision=revision+1,updated_at=now()
  where id=p_id and organization_id=p_org and revision=p_revision
   and reference_year=p_year and reference_month=p_month and source_type=p_source and scenario_id is not distinct from p_scenario
  returning id into result;
  if result is null then raise exception 'O lote mudou. Atualize a tela'; end if;
 end if;
 return result;
end $$;
revoke all on function public.bp_save_draft(uuid,uuid,integer,integer,integer,text,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.bp_save_draft(uuid,uuid,integer,integer,integer,text,uuid,text,jsonb,jsonb) to authenticated;

create or replace function public.bp_apply_draft(p_org uuid,p_id uuid,p_revision integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare draft public.bp_import_drafts; result uuid;
begin
 if auth.uid() is null or not public.can_manage_bp_plan(p_org) then raise exception 'Acesso restrito aos administradores'; end if;
 lock table public.bp_plan_nodes in share mode;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,300));
 select * into draft from bp_import_drafts where id=p_id and organization_id=p_org and revision=p_revision for update;
 if not found then raise exception 'O lote mudou. Atualize a tela'; end if;
 result:=public.bp_apply_import(p_org,null,draft.reference_year,draft.reference_month,draft.source_type,draft.scenario_id,draft.file_name,draft.input_rows,draft.plan_snapshot);
 return result;
end $$;
revoke all on function public.bp_apply_draft(uuid,uuid,integer) from public,anon;
grant execute on function public.bp_apply_draft(uuid,uuid,integer) to authenticated;

create or replace function public.bp_delete_batch(p_org uuid,p_id uuid,p_draft boolean,p_revision integer default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.can_manage_bp_plan(p_org) then raise exception 'Acesso restrito aos administradores'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,300));
 if p_draft then
  delete from bp_import_drafts where organization_id=p_org and id=p_id and revision=p_revision;
 else
  delete from bp_import_batches where organization_id=p_org and id=p_id;
 end if;
 if not found then raise exception 'O lote mudou. Atualize a tela'; end if;
end $$;
revoke all on function public.bp_delete_batch(uuid,uuid,boolean,integer) from public,anon;
grant execute on function public.bp_delete_batch(uuid,uuid,boolean,integer) to authenticated;

-- Remove apenas versões já marcadas como substituídas pelo fluxo anterior.
delete from public.bp_import_batches where superseded_at is not null;
notify pgrst, 'reload schema';
commit;
