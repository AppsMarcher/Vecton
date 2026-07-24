begin;

-- Modelo comum dos relatorios comerciais. Os relatorios financeiros em
-- custom_reports permanecem independentes.
create table if not exists public.comercial_report_definitions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  slug              text not null,
  nome              text not null,
  descricao         text not null default '',
  status            text not null default 'draft'
                    check (status in ('draft', 'active', 'closed')),
  report_kind       text not null default 'custom'
                    check (report_kind in ('custom', 'bateu_levou', 'final_ano')),
  modalidade        text not null
                    check (modalidade in ('monthly', 'annual_ytd')),
  data_inicio       date,
  data_fim          date,
  display_order     integer not null default 0,
  current_version   integer not null default 0,
  created_by        uuid references auth.users(id) on delete set null,
  updated_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (data_fim is null or data_inicio is null or data_fim >= data_inicio),
  unique (organization_id, slug)
);

create table if not exists public.comercial_report_versions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  report_id         uuid not null references public.comercial_report_definitions(id) on delete restrict,
  version_number    integer not null check (version_number > 0),
  config            jsonb not null,
  config_hash       text not null,
  change_reason     text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (report_id, version_number),
  check (jsonb_typeof(config) = 'object')
);

create table if not exists public.comercial_report_version_participants (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  report_version_id uuid not null references public.comercial_report_versions(id) on delete cascade,
  cod_vendedor      text not null,
  selection_type    text not null check (selection_type in ('general', 'partial', 'individual')),
  list_version      integer not null default 1,
  sort_order        integer not null default 0,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (report_version_id, cod_vendedor)
);

create table if not exists public.comercial_report_audit (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  report_id         uuid not null references public.comercial_report_definitions(id) on delete restrict,
  action            text not null,
  field_name        text,
  old_value         jsonb,
  new_value         jsonb,
  old_version       integer,
  new_version       integer,
  changed_by        uuid references auth.users(id) on delete set null,
  changed_at        timestamptz not null default now()
);

create table if not exists public.comercial_report_runs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  report_id         uuid not null references public.comercial_report_definitions(id) on delete restrict,
  report_version_id uuid not null references public.comercial_report_versions(id) on delete restrict,
  reference_year    integer not null,
  reference_month   integer not null check (reference_month between 1 and 12),
  scenario_id       uuid,
  effective_start   date not null,
  effective_end     date not null,
  parameters        jsonb not null default '{}'::jsonb,
  compliance        jsonb not null default '{}'::jsonb,
  result_snapshot   jsonb,
  result_hash       text,
  auditable         boolean not null default true,
  audit_message     text,
  run_status        text not null default 'computed'
                    check (run_status in ('computed', 'official', 'invalid')),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_comercial_report_definitions_catalog
  on public.comercial_report_definitions
  (organization_id, status, display_order, nome);
create index if not exists idx_comercial_report_versions_current
  on public.comercial_report_versions (report_id, version_number desc);
create index if not exists idx_comercial_report_participants_lookup
  on public.comercial_report_version_participants
  (report_version_id, cod_vendedor);
create index if not exists idx_comercial_report_audit_lookup
  on public.comercial_report_audit (report_id, changed_at desc);
create index if not exists idx_comercial_report_runs_lookup
  on public.comercial_report_runs
  (report_id, reference_year, reference_month, created_at desc);

drop trigger if exists trg_comercial_report_definitions_updated_at
  on public.comercial_report_definitions;
create trigger trg_comercial_report_definitions_updated_at
before update on public.comercial_report_definitions
for each row execute function public.set_updated_at();

create or replace function public.can_manage_comercial_reports(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.organization_id = target_organization_id
      and up.user_id = auth.uid()
      and up.access_role in ('admin', 'super_admin')
  );
$$;

grant execute on function public.can_manage_comercial_reports(uuid) to authenticated;

-- Validacao fechada: impede enums ou estruturas desconhecidas antes que cheguem
-- ao motor. Regras adicionais continuam validadas na funcao de salvamento.
create or replace function public.comercial_report_config_is_valid(p_config jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then return false; end if;
  if coalesce((p_config->>'schema_version')::integer, 0) <> 1 then return false; end if;

  v := p_config->>'primary_metric';
  -- A margem chega pronta por movimento em mb_pct. Nesta primeira versao ela
  -- aparece no detalhamento, mas nao e recalculada nem agregada como metrica
  -- principal. Isso evita transformar percentual em faturamento por engano.
  if v is null or v not in ('quantity', 'revenue') then return false; end if;

  v := p_config->>'evaluation';
  if v is null or v not in ('target_reached', 'highest_attainment', 'highest_overachievement',
               'rank_quantity', 'rank_revenue') then return false; end if;

  if jsonb_typeof(coalesce(p_config->'origins', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'cargos', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'selected_codes', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'product_types', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'cultures', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'product_type_ids', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'culture_ids', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'complementary_metrics', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'charts', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'conditions', '{}'::jsonb)) <> 'object' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'ranking', '{}'::jsonb)) <> 'object' then return false; end if;
  if jsonb_typeof(coalesce(p_config->'award', '{}'::jsonb)) <> 'object' then return false; end if;
  perform x::uuid
  from jsonb_array_elements_text(coalesce(p_config->'product_type_ids', '[]'::jsonb)) x;
  perform x::uuid
  from jsonb_array_elements_text(coalesce(p_config->'culture_ids', '[]'::jsonb)) x;

  if exists (
    select 1 from jsonb_array_elements_text(coalesce(p_config->'origins', '[]'::jsonb)) x
    where x not in ('FAT', 'CART')
  ) then return false; end if;
  if exists (
    select 1 from jsonb_array_elements_text(coalesce(p_config->'cargos', '[]'::jsonb)) x
    where x not in (
      'Gerente Comercial', 'Coordenador Sul', 'Coordenador Norte',
      'Coordenador Oeste', 'Coordenador Pecuária', 'Especialista Exportação',
      'Representante Comercial', 'Vendedor'
    )
  ) then return false; end if;
  if exists (
    select 1 from jsonb_array_elements_text(coalesce(p_config->'complementary_metrics', '[]'::jsonb)) x
    where x not in ('quantity', 'revenue')
  ) then return false; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_config->'charts', '[]'::jsonb)) chart
    where jsonb_typeof(chart) <> 'object'
       or chart->>'type' is null
       or chart->>'type' not in (
         'ranking_bar', 'target_vs_actual', 'time_line', 'product_distribution',
         'culture_distribution', 'eligibility'
       )
  ) then return false; end if;

  v := coalesce(p_config->'conditions'->>'zero_target_policy', 'null');
  if v not in ('null', 'real_is_100') then return false; end if;

  v := coalesce(p_config->>'selection_type', 'general');
  if v not in ('general', 'partial', 'individual') then return false; end if;
  if v = 'general' and jsonb_array_length(coalesce(p_config->'selected_codes', '[]'::jsonb)) <> 0 then return false; end if;
  if v = 'individual' and jsonb_array_length(coalesce(p_config->'selected_codes', '[]'::jsonb)) <> 1 then return false; end if;
  if v = 'partial' and jsonb_array_length(coalesce(p_config->'selected_codes', '[]'::jsonb)) < 2 then return false; end if;

  return true;
exception when others then
  return false;
end;
$$;

-- Todo salvamento cria uma nova versao imutavel. Relatorio encerrado nao pode
-- ser alterado silenciosamente.
create or replace function public.comercial_report_save(
  p_report_id uuid,
  p_definition jsonb,
  p_config jsonb,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.comercial_report_definitions%rowtype;
  v_org uuid;
  v_old_version integer := 0;
  v_new_version integer;
  v_version_id uuid;
  v_code text;
  v_order integer := 0;
  v_selection_type text;
  v_old_config jsonb;
  v_old_definition jsonb;
begin
  if not public.comercial_report_config_is_valid(p_config) then
    raise exception 'Configuracao de relatorio comercial invalida';
  end if;

  if p_report_id is not null then
    select * into v_report
    from public.comercial_report_definitions
    where id = p_report_id;
    if not found then raise exception 'Relatorio comercial nao encontrado'; end if;
    if v_report.status = 'closed' then
      raise exception 'Relatorio encerrado nao pode ser alterado; duplique para criar uma nova campanha';
    end if;
    v_org := v_report.organization_id;
    v_old_version := v_report.current_version;
    v_old_definition := jsonb_build_object(
      'nome', v_report.nome,
      'descricao', v_report.descricao,
      'status', v_report.status,
      'report_kind', v_report.report_kind,
      'modalidade', v_report.modalidade,
      'data_inicio', v_report.data_inicio,
      'data_fim', v_report.data_fim,
      'display_order', v_report.display_order
    );
    select config into v_old_config
    from public.comercial_report_versions
    where report_id = p_report_id and version_number = v_old_version;
  else
    v_org := nullif(p_definition->>'organization_id', '')::uuid;
  end if;

  if v_org is null or not public.can_manage_comercial_reports(v_org) then
    raise exception 'Usuario sem permissao para gerenciar relatorios comerciais';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_config->'product_type_ids', '[]'::jsonb)) x
    left join public.comercial_tipos t
      on t.id = x::uuid and t.organization_id = v_org
    where t.id is null
  ) then
    raise exception 'Grupo de produto invalido para esta organizacao';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_config->'culture_ids', '[]'::jsonb)) x
    left join public.comercial_culturas c
      on c.id = x::uuid and c.organization_id = v_org
    where c.id is null
  ) then
    raise exception 'Cultura invalida para esta organizacao';
  end if;

  if coalesce(btrim(p_definition->>'nome'), '') = '' then
    raise exception 'Nome do relatorio e obrigatorio';
  end if;
  if coalesce(p_definition->>'status', 'draft') not in ('draft', 'active', 'closed') then
    raise exception 'Status do relatorio invalido';
  end if;
  if coalesce(p_definition->>'modalidade', '') not in ('monthly', 'annual_ytd') then
    raise exception 'Modalidade do relatorio invalida';
  end if;

  if p_report_id is null then
    insert into public.comercial_report_definitions (
      organization_id, slug, nome, descricao, status, report_kind, modalidade,
      data_inicio, data_fim, display_order, created_by, updated_by
    ) values (
      v_org,
      coalesce(nullif(btrim(p_definition->>'slug'), ''), 'custom-' || gen_random_uuid()::text),
      btrim(p_definition->>'nome'),
      coalesce(p_definition->>'descricao', ''),
      coalesce(p_definition->>'status', 'draft'),
      coalesce(p_definition->>'report_kind', 'custom'),
      p_definition->>'modalidade',
      nullif(p_definition->>'data_inicio', '')::date,
      nullif(p_definition->>'data_fim', '')::date,
      coalesce((p_definition->>'display_order')::integer, 0),
      auth.uid(), auth.uid()
    ) returning * into v_report;
    p_report_id := v_report.id;

    insert into public.report_section_items (
      organization_id, section_id, report_id, sort_order
    )
    select v_org, s.id, 'comercialRelatorio_' || p_report_id::text,
           coalesce((p_definition->>'display_order')::integer, 0)
    from public.report_sections s
    where s.organization_id = v_org and lower(s.name) = 'comercial'
    order by s.sort_order
    limit 1
    on conflict (organization_id, report_id) do nothing;
  else
    update public.comercial_report_definitions
    set nome = btrim(p_definition->>'nome'),
        descricao = coalesce(p_definition->>'descricao', ''),
        status = coalesce(p_definition->>'status', status),
        modalidade = p_definition->>'modalidade',
        data_inicio = nullif(p_definition->>'data_inicio', '')::date,
        data_fim = nullif(p_definition->>'data_fim', '')::date,
        display_order = coalesce((p_definition->>'display_order')::integer, display_order),
        updated_by = auth.uid()
    where id = p_report_id
    returning * into v_report;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_new_version
  from public.comercial_report_versions
  where report_id = p_report_id;

  insert into public.comercial_report_versions (
    organization_id, report_id, version_number, config, config_hash,
    change_reason, created_by
  ) values (
    v_org, p_report_id, v_new_version, p_config, md5(p_config::text),
    nullif(btrim(p_change_reason), ''), auth.uid()
  ) returning id into v_version_id;

  v_selection_type := coalesce(p_config->>'selection_type', 'general');
  for v_code in
    select jsonb_array_elements_text(coalesce(p_config->'selected_codes', '[]'::jsonb))
  loop
    insert into public.comercial_report_version_participants (
      organization_id, report_version_id, cod_vendedor, selection_type,
      list_version, sort_order, created_by
    ) values (
      v_org, v_version_id, v_code, v_selection_type,
      coalesce((p_config->>'participant_list_version')::integer, 1), v_order, auth.uid()
    );
    v_order := v_order + 1;
  end loop;

  update public.comercial_report_definitions
  set current_version = v_new_version,
      updated_by = auth.uid()
  where id = p_report_id;

  insert into public.comercial_report_audit (
    organization_id, report_id, action, field_name, old_value, new_value,
    old_version, new_version, changed_by
  ) values (
    v_org, p_report_id,
    case when v_old_version = 0 then 'create' else 'new_version' end,
    'config', v_old_config, p_config, nullif(v_old_version, 0), v_new_version, auth.uid()
  );

  insert into public.comercial_report_audit (
    organization_id, report_id, action, field_name, old_value, new_value,
    old_version, new_version, changed_by
  ) values (
    v_org, p_report_id,
    case when v_old_version = 0 then 'create' else 'new_version' end,
    'definition', v_old_definition,
    jsonb_build_object(
      'nome', v_report.nome,
      'descricao', v_report.descricao,
      'status', v_report.status,
      'report_kind', v_report.report_kind,
      'modalidade', v_report.modalidade,
      'data_inicio', v_report.data_inicio,
      'data_fim', v_report.data_fim,
      'display_order', v_report.display_order
    ),
    nullif(v_old_version, 0), v_new_version, auth.uid()
  );

  return p_report_id;
end;
$$;

grant execute on function public.comercial_report_save(uuid, jsonb, jsonb, text)
  to authenticated;

create or replace function public.comercial_report_delete_draft(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.comercial_report_definitions%rowtype;
begin
  select * into v_report
  from public.comercial_report_definitions
  where id = p_report_id;
  if not found then return; end if;
  if not public.can_manage_comercial_reports(v_report.organization_id) then
    raise exception 'Usuario sem permissao para excluir relatorios comerciais';
  end if;
  if v_report.status <> 'draft' then
    raise exception 'Somente rascunhos podem ser excluidos';
  end if;
  if exists (select 1 from public.comercial_report_runs where report_id = p_report_id) then
    raise exception 'Relatorio com resultados nao pode ser excluido';
  end if;

  delete from public.report_section_items
  where organization_id = v_report.organization_id
    and report_id = 'comercialRelatorio_' || p_report_id::text;
  delete from public.comercial_report_audit where report_id = p_report_id;
  delete from public.comercial_report_versions where report_id = p_report_id;
  delete from public.comercial_report_definitions where id = p_report_id;
end;
$$;

grant execute on function public.comercial_report_delete_draft(uuid)
  to authenticated;

alter table public.comercial_report_definitions enable row level security;
alter table public.comercial_report_versions enable row level security;
alter table public.comercial_report_version_participants enable row level security;
alter table public.comercial_report_audit enable row level security;
alter table public.comercial_report_runs enable row level security;

create policy "members read comercial report definitions"
  on public.comercial_report_definitions for select
  using (public.is_org_member(organization_id));
create policy "members read comercial report versions"
  on public.comercial_report_versions for select
  using (public.is_org_member(organization_id));
create policy "members read comercial report participants"
  on public.comercial_report_version_participants for select
  using (public.is_org_member(organization_id));
create policy "members read comercial report audit"
  on public.comercial_report_audit for select
  using (public.is_org_member(organization_id));
create policy "members read comercial report runs"
  on public.comercial_report_runs for select
  using (public.is_org_member(organization_id));

-- Presets versionados. Os cards antigos continuam ativos durante a comparacao.
with orgs as (
  select id from public.organizations
), inserted as (
  insert into public.comercial_report_definitions (
    organization_id, slug, nome, descricao, status, report_kind, modalidade,
    data_inicio, data_fim, display_order, current_version
  )
  select id, 'bateu-levou', 'Bateu, Levou',
         'Campanha mensal por quantidade, separada por cultura.',
         'active', 'bateu_levou', 'monthly', null, null, 2, 1
  from orgs
  on conflict (organization_id, slug) do nothing
  returning id, organization_id
)
insert into public.comercial_report_versions (
  organization_id, report_id, version_number, config, config_hash,
  change_reason
)
select
  d.organization_id,
  d.id,
  1,
  cfg.config,
  md5(cfg.config::text),
  'Migracao inicial da campanha legada'
from public.comercial_report_definitions d
cross join lateral (
  select jsonb_build_object(
    'schema_version', 1,
    'origins', jsonb_build_array('FAT'),
    'cargos', jsonb_build_array('Representante Comercial'),
    'active_only', true,
    'include_historical', false,
    'selection_type', 'general',
    'selected_codes', '[]'::jsonb,
    'participant_list_version', 1,
    'product_type_ids', coalesce((select jsonb_agg(t.id::text) from public.comercial_tipos t where t.organization_id = d.organization_id and t.nome = 'Máquinas'), '[]'::jsonb),
    'culture_ids', coalesce((select jsonb_agg(c.id::text) from public.comercial_culturas c where c.organization_id = d.organization_id and c.nome in ('Grãos', 'Pecuária')), '[]'::jsonb),
    'product_types', '[]'::jsonb,
    'cultures', '[]'::jsonb,
    'primary_metric', 'quantity',
    'complementary_metrics', '[]'::jsonb,
    'evaluation', 'target_reached',
    'conditions', jsonb_build_object(
      'minimum_quantity', 2,
      'minimum_attainment_pct', 100,
      'requires_target', false,
      'zero_target_policy', 'real_is_100'
    ),
    'ranking', jsonb_build_object(
      'enabled', true,
      'metric', 'attainment_pct',
      'direction', 'desc',
      'tie_breaker', 'quantity'
    ),
    'award', jsonb_build_object('enabled', true, 'rule', 'conditions_met'),
    'groupings', jsonb_build_array('culture'),
    'scenario_mode', 'runtime',
    'charts', jsonb_build_array(
      jsonb_build_object('type', 'ranking_bar', 'metric', 'quantity', 'grouping', 'seller', 'top_n', 10, 'series', 'absolute'),
      jsonb_build_object('type', 'target_vs_actual', 'metric', 'quantity', 'grouping', 'seller', 'top_n', 10, 'series', 'absolute')
    )
  ) as config
) cfg
where d.slug = 'bateu-levou'
  and not exists (
    select 1 from public.comercial_report_versions v
    where v.report_id = d.id and v.version_number = 1
  );

with orgs as (
  select id from public.organizations
)
insert into public.comercial_report_definitions (
  organization_id, slug, nome, descricao, status, report_kind, modalidade,
  data_inicio, data_fim, display_order, current_version
)
select id, 'final-ano-2026', 'Meta de Final de Ano',
       'Campanha anual: maior superação acumulada de realizado versus Budget.',
       'active', 'final_ano', 'annual_ytd', date '2026-01-01', date '2026-12-31', 3, 1
from orgs
on conflict (organization_id, slug) do nothing;

insert into public.comercial_report_versions (
  organization_id, report_id, version_number, config, config_hash,
  change_reason
)
select
  d.organization_id,
  d.id,
  1,
  cfg.config,
  md5(cfg.config::text),
  'Migracao inicial da campanha legada'
from public.comercial_report_definitions d
cross join lateral (
  select jsonb_build_object(
    'schema_version', 1,
    'origins', jsonb_build_array('FAT'),
    'cargos', jsonb_build_array('Representante Comercial', 'Vendedor'),
    'active_only', true,
    'include_historical', false,
    'selection_type', 'partial',
    'selected_codes', coalesce((
      select jsonb_agg(v.codigo order by v.codigo)
      from public.comercial_vendedores v
      where v.organization_id = d.organization_id
        and v.codigo <> '000633'
        and v.cargo in ('Representante Comercial', 'Vendedor')
    ), '[]'::jsonb),
    'participant_list_version', 1,
    'product_types', '[]'::jsonb,
    'cultures', '[]'::jsonb,
    'product_type_ids', '[]'::jsonb,
    'culture_ids', '[]'::jsonb,
    'primary_metric', 'revenue',
    'complementary_metrics', '[]'::jsonb,
    'evaluation', 'highest_overachievement',
    'conditions', jsonb_build_object('requires_target', true),
    'ranking', jsonb_build_object(
      'enabled', true,
      'metric', 'overachievement_pct',
      'direction', 'desc',
      'tie_breaker', 'revenue'
    ),
    'award', jsonb_build_object(
      'enabled', true,
      'rule', 'rank_1_at_close',
      'close_year', 2026,
      'close_month', 12
    ),
    'groupings', '[]'::jsonb,
    'scenario_mode', 'runtime',
    'default_scenario', 'budget',
    'charts', jsonb_build_array(
      jsonb_build_object('type', 'ranking_bar', 'metric', 'overachievement_pct', 'grouping', 'seller', 'top_n', 10, 'series', 'ytd'),
      jsonb_build_object('type', 'time_line', 'metric', 'revenue', 'grouping', 'month', 'top_n', 12, 'series', 'ytd')
    )
  ) as config
) cfg
where d.slug = 'final-ano-2026'
  and not exists (
    select 1 from public.comercial_report_versions v
    where v.report_id = d.id and v.version_number = 1
  );

update public.comercial_report_definitions d
set current_version = x.max_version
from (
  select report_id, max(version_number) as max_version
  from public.comercial_report_versions
  group by report_id
) x
where x.report_id = d.id
  and d.current_version <> x.max_version;

insert into public.comercial_report_version_participants (
  organization_id, report_version_id, cod_vendedor, selection_type,
  list_version, sort_order
)
select v.organization_id, v.id, p.code,
       coalesce(v.config->>'selection_type', 'general'),
       coalesce((v.config->>'participant_list_version')::integer, 1),
       p.ord::integer - 1
from public.comercial_report_versions v
join public.comercial_report_definitions d on d.id = v.report_id
cross join lateral jsonb_array_elements_text(
  coalesce(v.config->'selected_codes', '[]'::jsonb)
) with ordinality p(code, ord)
where d.slug in ('bateu-levou', 'final-ano-2026')
on conflict (report_version_id, cod_vendedor) do nothing;

insert into public.report_section_items (
  organization_id, section_id, report_id, sort_order
)
select d.organization_id, s.id, 'comercialRelatorio_' || d.id::text,
       d.display_order
from public.comercial_report_definitions d
join lateral (
  select rs.id
  from public.report_sections rs
  where rs.organization_id = d.organization_id
    and lower(rs.name) = 'comercial'
  order by rs.sort_order
  limit 1
) s on true
where d.slug in ('bateu-levou', 'final-ano-2026')
on conflict (organization_id, report_id) do nothing;

commit;
