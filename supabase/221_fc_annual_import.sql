begin;

create function public.can_read_fc(target_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_org_member(target_org) and exists (
    select 1 from public.user_profiles p where p.organization_id = target_org and p.user_id = auth.uid()
      and p.is_active and (p.access_role in ('admin','super_admin','manager')
        or p.additional_access_roles && array['admin','super_admin','manager']::text[]
        or 'cashFlow' = any(p.extra_report_ids))
  );
$$;
revoke all on function public.can_read_fc(uuid) from public;
grant execute on function public.can_read_fc(uuid) to authenticated;

-- Uma posição anual aplicada por empresa. Arquivo e auditoria pertencem ao
-- lote: o DELETE do lote substituído elimina ambos na mesma transação.
create table public.fc_import_batches (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference_year integer not null check (reference_year between 2000 and 2100),
  file_name text not null check (length(file_name) between 1 and 255),
  file_size integer not null check (file_size between 1 and 20971520),
  opening_balance numeric(20,4) not null,
  scenarios text[] not null check (array_ndims(scenarios)=1 and array_length(scenarios,1)=12 and array_position(scenarios,null) is null and scenarios <@ array['Real','Fcst','Bud']::text[]),
  quantities numeric[] not null check (array_ndims(quantities)=1 and array_length(quantities,1)=12 and array_position(quantities,null) is null),
  plan_snapshot jsonb not null,
  created_by uuid not null references auth.users(id),
  applied_at timestamptz not null default now(),
  unique (organization_id, reference_year),
  unique (organization_id,id)
);
create table public.fc_import_values (
  batch_id uuid not null,
  organization_id uuid not null,
  account_id uuid not null,
  amounts numeric(20,4)[] not null check (array_ndims(amounts)=1 and array_length(amounts,1)=12 and array_position(amounts,null) is null),
  primary key (batch_id,account_id),
  foreign key (organization_id,batch_id) references public.fc_import_batches(organization_id,id) on delete cascade,
  foreign key (organization_id,account_id) references public.fc_plan_nodes(organization_id,id)
);
create index fc_import_values_account_idx on public.fc_import_values(organization_id,account_id);
create table public.fc_import_files (
  batch_id uuid primary key references public.fc_import_batches(id) on delete cascade,
  organization_id uuid not null,
  content bytea not null,
  foreign key (organization_id,batch_id) references public.fc_import_batches(organization_id,id) on delete cascade
);
create table public.fc_import_events (
  batch_id uuid primary key references public.fc_import_batches(id) on delete cascade,
  organization_id uuid not null,
  actor_id uuid not null references auth.users(id),
  occurred_at timestamptz not null default now(),
  event text not null default 'annual_import_applied',
  foreign key (organization_id,batch_id) references public.fc_import_batches(organization_id,id) on delete cascade
);
alter table public.fc_import_batches enable row level security;
alter table public.fc_import_values enable row level security;
alter table public.fc_import_files enable row level security;
alter table public.fc_import_events enable row level security;
grant select on public.fc_import_batches, public.fc_import_values, public.fc_import_events to authenticated;
create policy "read FC batches" on public.fc_import_batches for select to authenticated using (public.can_read_fc(organization_id));
create policy "read FC values" on public.fc_import_values for select to authenticated using (public.can_read_fc(organization_id));
create policy "read FC events" on public.fc_import_events for select to authenticated using (public.can_manage_fc_plan(organization_id));
-- Nenhuma escrita direta nem leitura pública do arquivo: apenas RPC autorizada.

create function public.fc_import_context(target_org uuid, target_year integer)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare plan jsonb; version text; batch jsonb;
begin
  if not public.can_manage_fc_plan(target_org) then raise exception 'Sem permissão para carregar Fluxo de Caixa.'; end if;
  select coalesce(jsonb_agg(to_jsonb(n) order by n.id),'[]'::jsonb),
    md5(string_agg(n.id::text || ':' || n.updated_at::text,',' order by n.id))
    into plan, version from public.fc_plan_nodes n where n.organization_id=target_org;
  select to_jsonb(b) - 'plan_snapshot' into batch from public.fc_import_batches b
    where organization_id=target_org and reference_year=target_year;
  return jsonb_build_object('plan',plan,'plan_version',version,'batch',batch,
    'today',(now() at time zone 'America/Sao_Paulo')::date);
end;
$$;

create function public.apply_fc_annual_import(target_org uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  year_number integer := (payload->>'year')::integer;
  new_id uuid := (payload->>'id')::uuid;
  prior_id uuid;
  current_version text;
  plan jsonb;
  kinds text[];
  quantities numeric[];
  amounts numeric[];
  item jsonb;
  account public.fc_plan_nodes;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  analytic_count integer;
  first_net numeric := 0;
  opening numeric;
  bytes bytea;
begin
  if not public.can_manage_fc_plan(target_org) then raise exception 'Sem permissão para carregar Fluxo de Caixa.'; end if;
  if year_number is null or year_number not between 2000 and 2100 or new_id is null then raise exception 'Ano ou identificador inválido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_org::text || ':' || year_number::text,221));
  -- Retry da mesma solicitação não duplica nem remove a carga já aplicada.
  if exists(select 1 from public.fc_import_batches where id=new_id and organization_id=target_org and reference_year=year_number) then
    return jsonb_build_object('id',new_id,'year',year_number,'applied',true);
  end if;
  select id into prior_id from public.fc_import_batches where organization_id=target_org and reference_year=year_number;
  if prior_id is distinct from (payload->>'expected_batch_id')::uuid then
    raise exception 'A carga anual mudou durante a validação. Atualize e valide novamente.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_org::text,219));
  perform 1 from public.fc_plan_nodes where organization_id=target_org for share;
  select jsonb_agg(to_jsonb(n) order by n.id), md5(string_agg(n.id::text || ':' || n.updated_at::text,',' order by n.id))
    into plan,current_version from public.fc_plan_nodes n where n.organization_id=target_org;
  if current_version is null or current_version is distinct from payload->>'plan_version' then
    raise exception 'O Plano de Contas FC mudou. Valide o arquivo novamente.';
  end if;
  if (select count(*) from public.fc_plan_nodes where organization_id=target_org and node_class='Sintetica'
      and seed_key in ('operacional','entradas','saidas','investimentos','financeiro')) <> 5 then
    raise exception 'O plano deve conter os grupos base do Fluxo de Caixa.';
  end if;
  -- Todas as analíticas precisam pertencer a um dos três fluxos consolidados.
  if exists (select 1 from public.fc_plan_nodes where organization_id=target_org
      and seed_key in ('operacional','investimentos','financeiro') and parent_id is not null)
    or exists (select 1 from public.fc_plan_nodes n where n.organization_id=target_org
      and n.seed_key in ('entradas','saidas') and n.parent_id is distinct from
        (select id from public.fc_plan_nodes where organization_id=target_org and seed_key='operacional')) then
    raise exception 'Mantenha os fluxos como raízes e Entradas/Saídas vinculadas ao Operacional.';
  end if;
  if exists (
    with recursive branch as (
      select id from public.fc_plan_nodes where organization_id=target_org and seed_key in ('operacional','investimentos','financeiro')
      union select n.id from public.fc_plan_nodes n join branch b on n.parent_id=b.id where n.organization_id=target_org
    ) select 1 from public.fc_plan_nodes n where n.organization_id=target_org and n.node_class='Analitica' and not exists(select 1 from branch b where b.id=n.id)
  ) then raise exception 'Existe conta analítica fora dos grupos do Fluxo de Caixa.'; end if;
  if jsonb_typeof(payload->'scenarios') is distinct from 'array' or jsonb_array_length(payload->'scenarios')<>12
     or jsonb_typeof(payload->'quantities') is distinct from 'array' or jsonb_array_length(payload->'quantities')<>12 then
    raise exception 'A carga deve conter os 12 meses do ano.';
  end if;
  select array_agg(value order by ord) into kinds from jsonb_array_elements_text(payload->'scenarios') with ordinality t(value,ord);
  if array_position(kinds,null) is not null or not kinds <@ array['Real','Fcst','Bud']::text[] then raise exception 'Classificação Real/Fcst/Bud inválida.'; end if;
  for i in 1..12 loop
    if kinds[i]='Real' and make_date(year_number,i,1)>date_trunc('month',today)::date then raise exception 'Competência futura não pode ser Real: %/%.',i,year_number; end if;
  end loop;
  select array_agg(value::numeric order by ord) into quantities from jsonb_array_elements_text(payload->'quantities') with ordinality t(value,ord);
  if exists(select 1 from unnest(quantities) v where v is null or v::text in ('NaN','Infinity','-Infinity') or v<0 or trunc(v)<>v) then raise exception 'Quantidade de máquinas inválida.'; end if;
  select count(*) into analytic_count from public.fc_plan_nodes where organization_id=target_org and node_class='Analitica';
  if analytic_count=0 or jsonb_typeof(payload->'entries') is distinct from 'array' or jsonb_array_length(payload->'entries')<>analytic_count then
    raise exception 'Informe todas as contas analíticas do plano, inclusive as zeradas.';
  end if;
  if (select count(distinct value->>'account_id') from jsonb_array_elements(payload->'entries'))<>analytic_count then raise exception 'Conta analítica duplicada.'; end if;
  for item in select value from jsonb_array_elements(payload->'entries') loop
    select * into account from public.fc_plan_nodes where organization_id=target_org and id=(item->>'account_id')::uuid and node_class='Analitica';
    if not found then raise exception 'Conta inválida ou de outra empresa.'; end if;
    if jsonb_typeof(item->'amounts') is distinct from 'array' or jsonb_array_length(item->'amounts')<>12 then raise exception 'Conta sem os 12 meses: %.',account.name; end if;
    select array_agg(value::numeric order by ord) into amounts from jsonb_array_elements_text(item->'amounts') with ordinality t(value,ord);
    if exists(select 1 from unnest(amounts) v where v is null or v::text in ('NaN','Infinity','-Infinity') or abs(v)>=1e16) then raise exception 'Valor inválido na conta %.',account.name; end if;
    if not account.active and exists(select 1 from unnest(amounts) v where v<>0) then raise exception 'Conta inativa com valores: %.',account.name; end if;
    first_net := first_net + round(amounts[1],4);
  end loop;
  opening := case when payload->>'opening_mode'='explicit' then (payload->>'opening_value')::numeric
    when payload->>'opening_mode'='closing_january' then (payload->>'opening_value')::numeric-first_net else null end;
  if opening is null or opening::text in ('NaN','Infinity','-Infinity') or abs(opening)>=1e16 then raise exception 'Saldo inicial inválido.'; end if;
  if length(payload->>'file_base64')>27962028 then raise exception 'Arquivo maior que 20 MB.'; end if;
  bytes := decode(payload->>'file_base64','base64');
  if bytes is null or octet_length(bytes) not between 1 and 20971520 or octet_length(bytes) is distinct from (payload->>'file_size')::integer
      or coalesce(payload->>'file_name','') !~* '\.xlsx?$' then raise exception 'Arquivo Excel inválido.'; end if;
  -- Só a partir daqui altera dados. Qualquer falha reverte inclusive a exclusão.
  delete from public.fc_import_batches where id=prior_id;
  insert into public.fc_import_batches(id,organization_id,reference_year,file_name,file_size,opening_balance,scenarios,quantities,plan_snapshot,created_by)
    values(new_id,target_org,year_number,payload->>'file_name',octet_length(bytes),opening,kinds,quantities,plan,auth.uid());
  insert into public.fc_import_values(batch_id,organization_id,account_id,amounts)
    select new_id,target_org,(e.value->>'account_id')::uuid,
      array(select v.value::numeric from jsonb_array_elements_text(e.value->'amounts') with ordinality v(value,ord) order by ord)
    from jsonb_array_elements(payload->'entries') e;
  insert into public.fc_import_files values(new_id,target_org,bytes);
  insert into public.fc_import_events(batch_id,organization_id,actor_id) values(new_id,target_org,auth.uid());
  return jsonb_build_object('id',new_id,'year',year_number,'applied',true);
end;
$$;
revoke all on function public.fc_import_context(uuid,integer) from public;
revoke all on function public.apply_fc_annual_import(uuid,jsonb) from public;
grant execute on function public.fc_import_context(uuid,integer) to authenticated;
grant execute on function public.apply_fc_annual_import(uuid,jsonb) to authenticated;
commit;
