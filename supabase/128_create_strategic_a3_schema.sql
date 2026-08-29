begin;

-- ============================================================================
-- Módulo A3 - Gestão Estratégica — schema completo (Etapa 2).
-- Isolado de RPS Gestão: nenhuma tabela, permissão, snapshot ou bucket
-- compartilhado (decisão #1/#22 da especificação). Prefixo strategic_ em
-- tudo. Hierarquia A3 mãe/filho por autorreferência (parent_id), sem tabela
-- separada. RPCs de gravação/fechamento ficam pra migration 129 — aqui é só
-- estrutura + RLS.
--
-- Regra de acesso (decisão #15/10.2): só super_admin, admin e o perfil
-- 'gestao_estrategica' (migration 127) enxergam ou escrevem QUALQUER coisa
-- neste módulo — diferente do resto do Vecton (que separa leitura ampla via
-- is_org_member de escrita via is_org_editor), aqui não existe leitura ampla
-- temporária: "módulo invisível e sem acesso às tabelas" pra quem não tem um
-- dos 3 perfis. Por isso toda policy usa can_manage_strategic_a3(), nunca
-- is_org_member() sozinho.
-- ============================================================================

-- Helper: consulta o perfil real (primário OU adicional) direto na tabela,
-- SECURITY DEFINER pra não recursar no RLS de user_profiles — mesmo padrão
-- de get_my_access_role (migration 019). Não usa get_my_access_role() porque
-- aquela só devolve o access_role primário; aqui uma pessoa pode ter
-- 'gestao_estrategica' como perfil ADICIONAL (mesmo padrão de rps_gestao —
-- ver migration 109), então precisa checar os dois.
create or replace function public.can_manage_strategic_a3(target_organization_id uuid)
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
      and (
        up.access_role in ('super_admin', 'admin', 'gestao_estrategica')
        or 'gestao_estrategica' = any(up.additional_access_roles)
      )
  );
$$;

grant execute on function public.can_manage_strategic_a3(uuid) to authenticated;

-- ============================================================================
-- 1. strategic_cycles — ciclo estratégico anual
-- ============================================================================
create table if not exists public.strategic_cycles (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  year            integer     not null check (year between 2000 and 2200),
  name            text        not null,
  start_date      date,
  end_date        date,
  status          text        not null default 'active' check (status in ('draft', 'active', 'closed')),
  created_by      uuid        references auth.users(id) on delete set null default auth.uid(),
  updated_by      uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, year)
);

drop trigger if exists trg_strategic_cycles_updated_at on public.strategic_cycles;
create trigger trg_strategic_cycles_updated_at
before update on public.strategic_cycles
for each row execute function public.set_updated_at();

alter table public.strategic_cycles enable row level security;
drop policy if exists "strategic managers all on strategic_cycles" on public.strategic_cycles;
create policy "strategic managers all on strategic_cycles"
on public.strategic_cycles for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

-- ============================================================================
-- 2. strategic_north_goals — itens do Norte Verdadeiro
-- organization_id direto (o descritivo não listava, mas todo o resto do
-- schema tem — mantém RLS simples e consistente sem depender de join).
-- ============================================================================
create table if not exists public.strategic_north_goals (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  cycle_id        uuid        not null references public.strategic_cycles(id) on delete cascade,
  code            text,
  title           text        not null,
  description     text,
  target_label    text,
  display_order   integer     not null default 0,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_strategic_north_goals_cycle on public.strategic_north_goals (cycle_id, display_order);

drop trigger if exists trg_strategic_north_goals_updated_at on public.strategic_north_goals;
create trigger trg_strategic_north_goals_updated_at
before update on public.strategic_north_goals
for each row execute function public.set_updated_at();

alter table public.strategic_north_goals enable row level security;
drop policy if exists "strategic managers all on strategic_north_goals" on public.strategic_north_goals;
create policy "strategic managers all on strategic_north_goals"
on public.strategic_north_goals for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

-- ============================================================================
-- 3. strategic_a3 — cadastro dos A3 (mãe/filho por parent_id autorreferente)
-- ============================================================================
create table if not exists public.strategic_a3 (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  cycle_id        uuid        not null references public.strategic_cycles(id) on delete cascade,
  parent_id       uuid        references public.strategic_a3(id) on delete set null,
  code            text        not null,
  name            text        not null,
  objective       text,
  color           text,
  display_order   integer     not null default 0,
  is_active       boolean     not null default true,
  created_by      uuid        references auth.users(id) on delete set null default auth.uid(),
  updated_by      uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, cycle_id, code)
);

create index if not exists idx_strategic_a3_parent on public.strategic_a3 (parent_id);
create index if not exists idx_strategic_a3_cycle on public.strategic_a3 (cycle_id, display_order);

drop trigger if exists trg_strategic_a3_updated_at on public.strategic_a3;
create trigger trg_strategic_a3_updated_at
before update on public.strategic_a3
for each row execute function public.set_updated_at();

alter table public.strategic_a3 enable row level security;
drop policy if exists "strategic managers all on strategic_a3" on public.strategic_a3;
create policy "strategic managers all on strategic_a3"
on public.strategic_a3 for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

-- ============================================================================
-- 4. strategic_a3_owners — responsáveis do A3 (N:N, decisão #8)
-- ============================================================================
create table if not exists public.strategic_a3_owners (
  a3_id      uuid        not null references public.strategic_a3(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  owner_type text        not null default 'owner' check (owner_type in ('owner', 'co_owner', 'contributor')),
  created_at timestamptz not null default now(),
  primary key (a3_id, user_id)
);

alter table public.strategic_a3_owners enable row level security;
drop policy if exists "strategic managers all on strategic_a3_owners" on public.strategic_a3_owners;
create policy "strategic managers all on strategic_a3_owners"
on public.strategic_a3_owners for all
using (exists (
  select 1 from public.strategic_a3 a
  where a.id = strategic_a3_owners.a3_id and public.can_manage_strategic_a3(a.organization_id)
))
with check (exists (
  select 1 from public.strategic_a3 a
  where a.id = strategic_a3_owners.a3_id and public.can_manage_strategic_a3(a.organization_id)
));

-- ============================================================================
-- 5. strategic_kpis — catálogo canônico (não pertence a 1 A3 só)
-- ============================================================================
create table if not exists public.strategic_kpis (
  id                   uuid        primary key default gen_random_uuid(),
  organization_id      uuid        not null references public.organizations(id) on delete cascade,
  cycle_id             uuid        not null references public.strategic_cycles(id) on delete cascade,
  primary_a3_id        uuid        not null references public.strategic_a3(id) on delete restrict,
  code                 text        not null,
  name                 text        not null,
  description          text,
  unit                 text,
  decimal_places       integer     not null default 0,
  entry_mode           text        not null check (entry_mode in ('direct', 'drivers', 'breakdown', 'computed')),
  monthly_calculation  text        not null check (monthly_calculation in (
                         'direct', 'sum_drivers', 'average_drivers', 'ratio', 'percentage_ratio',
                         'forecast_accuracy', 'mix_accuracy', 'weighted_average'
                       )),
  accumulation_method  text        not null check (accumulation_method in (
                         'sum', 'average', 'last_closed', 'ratio_of_sums', 'weighted_average', 'none'
                       )),
  comparison_mode      text        not null check (comparison_mode in (
                         'higher', 'lower', 'range', 'exact', 'exact_with_tolerance'
                       )),
  formula_config       jsonb       not null default '{}'::jsonb,
  is_active            boolean     not null default true,
  display_order        integer     not null default 0,
  created_by           uuid        references auth.users(id) on delete set null default auth.uid(),
  updated_by           uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organization_id, cycle_id, code)
);

create index if not exists idx_strategic_kpis_primary_a3 on public.strategic_kpis (primary_a3_id);
create index if not exists idx_strategic_kpis_cycle on public.strategic_kpis (cycle_id, display_order);

drop trigger if exists trg_strategic_kpis_updated_at on public.strategic_kpis;
create trigger trg_strategic_kpis_updated_at
before update on public.strategic_kpis
for each row execute function public.set_updated_at();

alter table public.strategic_kpis enable row level security;
drop policy if exists "strategic managers all on strategic_kpis" on public.strategic_kpis;
create policy "strategic managers all on strategic_kpis"
on public.strategic_kpis for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

-- ============================================================================
-- 6. strategic_a3_kpis — em quais A3 cada KPI aparece (dedup real, decisão #6.6)
-- ============================================================================
create table if not exists public.strategic_a3_kpis (
  a3_id             uuid    not null references public.strategic_a3(id) on delete cascade,
  kpi_id            uuid    not null references public.strategic_kpis(id) on delete cascade,
  relationship_type text    not null default 'primary' check (relationship_type in ('primary', 'linked')),
  display_order     integer not null default 0,
  is_featured       boolean not null default false,
  primary key (a3_id, kpi_id)
);

create index if not exists idx_strategic_a3_kpis_kpi on public.strategic_a3_kpis (kpi_id);

alter table public.strategic_a3_kpis enable row level security;
drop policy if exists "strategic managers all on strategic_a3_kpis" on public.strategic_a3_kpis;
create policy "strategic managers all on strategic_a3_kpis"
on public.strategic_a3_kpis for all
using (exists (
  select 1 from public.strategic_a3 a
  where a.id = strategic_a3_kpis.a3_id and public.can_manage_strategic_a3(a.organization_id)
))
with check (exists (
  select 1 from public.strategic_a3 a
  where a.id = strategic_a3_kpis.a3_id and public.can_manage_strategic_a3(a.organization_id)
));

-- ============================================================================
-- 7. strategic_kpi_owners — responsáveis do indicador (N:N, decisão #8)
-- ============================================================================
create table if not exists public.strategic_kpi_owners (
  kpi_id     uuid        not null references public.strategic_kpis(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  owner_type text        not null default 'owner' check (owner_type in ('owner', 'co_owner', 'contributor')),
  created_at timestamptz not null default now(),
  primary key (kpi_id, user_id)
);

alter table public.strategic_kpi_owners enable row level security;
drop policy if exists "strategic managers all on strategic_kpi_owners" on public.strategic_kpi_owners;
create policy "strategic managers all on strategic_kpi_owners"
on public.strategic_kpi_owners for all
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_owners.kpi_id and public.can_manage_strategic_a3(k.organization_id)
))
with check (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_owners.kpi_id and public.can_manage_strategic_a3(k.organization_id)
));

-- ============================================================================
-- 8. strategic_kpi_drivers — variáveis do cálculo (só entry_mode='drivers';
-- KPIs 'breakdown' usam strategic_kpi_breakdown_rows direto, sem driver aqui)
-- ============================================================================
create table if not exists public.strategic_kpi_drivers (
  id            uuid    primary key default gen_random_uuid(),
  kpi_id        uuid    not null references public.strategic_kpis(id) on delete cascade,
  code          text    not null,
  name          text    not null,
  unit          text,
  driver_role   text    not null check (driver_role in ('value', 'numerator', 'denominator', 'weight', 'planned', 'actual')),
  display_order integer not null default 0,
  is_required   boolean not null default true,
  unique (kpi_id, code)
);

create index if not exists idx_strategic_kpi_drivers_kpi on public.strategic_kpi_drivers (kpi_id, display_order);

alter table public.strategic_kpi_drivers enable row level security;
drop policy if exists "strategic managers all on strategic_kpi_drivers" on public.strategic_kpi_drivers;
create policy "strategic managers all on strategic_kpi_drivers"
on public.strategic_kpi_drivers for all
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_drivers.kpi_id and public.can_manage_strategic_a3(k.organization_id)
))
with check (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_drivers.kpi_id and public.can_manage_strategic_a3(k.organization_id)
));

-- ============================================================================
-- 9. strategic_scenarios — cenários de meta
-- ============================================================================
create table if not exists public.strategic_scenarios (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  cycle_id        uuid        not null references public.strategic_cycles(id) on delete cascade,
  name            text        not null,
  scenario_type   text        not null default 'original' check (scenario_type in ('original', 'revised', 'forecast')),
  effective_from  date,
  is_current      boolean     not null default false,
  created_by      uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- só 1 cenário vigente por ciclo+organização
create unique index if not exists uq_strategic_scenarios_current
  on public.strategic_scenarios (organization_id, cycle_id)
  where is_current;

drop trigger if exists trg_strategic_scenarios_updated_at on public.strategic_scenarios;
create trigger trg_strategic_scenarios_updated_at
before update on public.strategic_scenarios
for each row execute function public.set_updated_at();

alter table public.strategic_scenarios enable row level security;
drop policy if exists "strategic managers all on strategic_scenarios" on public.strategic_scenarios;
create policy "strategic managers all on strategic_scenarios"
on public.strategic_scenarios for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

-- ============================================================================
-- 10. strategic_kpi_targets — metas mensais por cenário
-- ============================================================================
create table if not exists public.strategic_kpi_targets (
  id           uuid        primary key default gen_random_uuid(),
  kpi_id       uuid        not null references public.strategic_kpis(id) on delete cascade,
  scenario_id  uuid        not null references public.strategic_scenarios(id) on delete cascade,
  year         integer     not null check (year between 2000 and 2200),
  month        integer     not null check (month between 1 and 12),
  target_value numeric,
  target_min   numeric,
  target_max   numeric,
  tolerance    numeric,
  created_by   uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (kpi_id, scenario_id, year, month)
);

create index if not exists idx_strategic_kpi_targets_lookup on public.strategic_kpi_targets (kpi_id, year, month);

drop trigger if exists trg_strategic_kpi_targets_updated_at on public.strategic_kpi_targets;
create trigger trg_strategic_kpi_targets_updated_at
before update on public.strategic_kpi_targets
for each row execute function public.set_updated_at();

alter table public.strategic_kpi_targets enable row level security;
drop policy if exists "strategic managers all on strategic_kpi_targets" on public.strategic_kpi_targets;
create policy "strategic managers all on strategic_kpi_targets"
on public.strategic_kpi_targets for all
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_targets.kpi_id and public.can_manage_strategic_a3(k.organization_id)
))
with check (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_targets.kpi_id and public.can_manage_strategic_a3(k.organization_id)
));

-- ============================================================================
-- 11. strategic_a3_periods — abertura/fechamento por A3 + mês
-- ============================================================================
create table if not exists public.strategic_a3_periods (
  id            uuid        primary key default gen_random_uuid(),
  organization_id uuid      not null references public.organizations(id) on delete cascade,
  cycle_id      uuid        not null references public.strategic_cycles(id) on delete cascade,
  a3_id         uuid        not null references public.strategic_a3(id) on delete cascade,
  year          integer     not null check (year between 2000 and 2200),
  month         integer     not null check (month between 1 and 12),
  status        text        not null default 'open' check (status in ('open', 'closed')),
  closed_at     timestamptz,
  closed_by     uuid        references auth.users(id) on delete set null,
  reopened_at   timestamptz,
  reopened_by   uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (a3_id, year, month)
);

create index if not exists idx_strategic_a3_periods_lookup on public.strategic_a3_periods (organization_id, year, month);

drop trigger if exists trg_strategic_a3_periods_updated_at on public.strategic_a3_periods;
create trigger trg_strategic_a3_periods_updated_at
before update on public.strategic_a3_periods
for each row execute function public.set_updated_at();

alter table public.strategic_a3_periods enable row level security;
drop policy if exists "strategic managers all on strategic_a3_periods" on public.strategic_a3_periods;
create policy "strategic managers all on strategic_a3_periods"
on public.strategic_a3_periods for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

-- ============================================================================
-- 12. strategic_kpi_records — registro mensal do indicador
-- result_value é calculado pelo servidor (RPC, migration 129) quando o KPI
-- não é 'direct'; version sustenta compare-and-swap (mesmo padrão de
-- rps_snapshots.version, migration 102). Sem tabela de auditoria de cada
-- alteração (decisão #20).
-- ============================================================================
create table if not exists public.strategic_kpi_records (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations(id) on delete cascade,
  kpi_id              uuid        not null references public.strategic_kpis(id) on delete cascade,
  year                integer     not null check (year between 2000 and 2200),
  month               integer     not null check (month between 1 and 12),
  target_id           uuid        references public.strategic_kpi_targets(id) on delete set null,
  scenario_id         uuid        references public.strategic_scenarios(id) on delete set null,
  result_value        numeric,
  calculation_version integer     not null default 1,
  completion_status   text        not null default 'empty' check (completion_status in ('empty', 'partial', 'complete')),
  version             bigint      not null default 1 check (version >= 1),
  updated_by          uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (kpi_id, year, month)
);

create index if not exists idx_strategic_kpi_records_lookup on public.strategic_kpi_records (organization_id, year, month);

drop trigger if exists trg_strategic_kpi_records_updated_at on public.strategic_kpi_records;
create trigger trg_strategic_kpi_records_updated_at
before update on public.strategic_kpi_records
for each row execute function public.set_updated_at();

alter table public.strategic_kpi_records enable row level security;
drop policy if exists "strategic managers all on strategic_kpi_records" on public.strategic_kpi_records;
create policy "strategic managers all on strategic_kpi_records"
on public.strategic_kpi_records for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

-- ============================================================================
-- 13. strategic_kpi_record_inputs — valores dos direcionadores (entry_mode='drivers')
-- ============================================================================
create table if not exists public.strategic_kpi_record_inputs (
  id            uuid        primary key default gen_random_uuid(),
  record_id     uuid        not null references public.strategic_kpi_records(id) on delete cascade,
  driver_id     uuid        not null references public.strategic_kpi_drivers(id) on delete cascade,
  numeric_value numeric,
  text_value    text,
  updated_by    uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (record_id, driver_id)
);

drop trigger if exists trg_strategic_kpi_record_inputs_updated_at on public.strategic_kpi_record_inputs;
create trigger trg_strategic_kpi_record_inputs_updated_at
before update on public.strategic_kpi_record_inputs
for each row execute function public.set_updated_at();

alter table public.strategic_kpi_record_inputs enable row level security;
drop policy if exists "strategic managers all on strategic_kpi_record_inputs" on public.strategic_kpi_record_inputs;
create policy "strategic managers all on strategic_kpi_record_inputs"
on public.strategic_kpi_record_inputs for all
using (exists (
  select 1 from public.strategic_kpi_records r
  where r.id = strategic_kpi_record_inputs.record_id and public.can_manage_strategic_a3(r.organization_id)
))
with check (exists (
  select 1 from public.strategic_kpi_records r
  where r.id = strategic_kpi_record_inputs.record_id and public.can_manage_strategic_a3(r.organization_id)
));

-- ============================================================================
-- 14. strategic_kpi_breakdown_rows — composição por produto/região/etapa
-- (entry_mode='breakdown'; também usada pro MIX do Comercial e pelos
-- roadmaps do Marketing/Engenharia — decisão de reconciliação #4)
-- ============================================================================
create table if not exists public.strategic_kpi_breakdown_rows (
  id              uuid        primary key default gen_random_uuid(),
  record_id       uuid        not null references public.strategic_kpi_records(id) on delete cascade,
  dimension_key   text        not null,
  dimension_label text,
  planned_value   numeric,
  actual_value    numeric,
  weight_value    numeric,
  display_order   integer     not null default 0,
  metadata        jsonb       not null default '{}'::jsonb,
  unique (record_id, dimension_key)
);

create index if not exists idx_strategic_kpi_breakdown_rows_record on public.strategic_kpi_breakdown_rows (record_id, display_order);

alter table public.strategic_kpi_breakdown_rows enable row level security;
drop policy if exists "strategic managers all on strategic_kpi_breakdown_rows" on public.strategic_kpi_breakdown_rows;
create policy "strategic managers all on strategic_kpi_breakdown_rows"
on public.strategic_kpi_breakdown_rows for all
using (exists (
  select 1 from public.strategic_kpi_records r
  where r.id = strategic_kpi_breakdown_rows.record_id and public.can_manage_strategic_a3(r.organization_id)
))
with check (exists (
  select 1 from public.strategic_kpi_records r
  where r.id = strategic_kpi_breakdown_rows.record_id and public.can_manage_strategic_a3(r.organization_id)
));

-- ============================================================================
-- 15. strategic_kpi_benchmarks — referência anual (2023-2025)
-- ============================================================================
create table if not exists public.strategic_kpi_benchmarks (
  id             uuid    primary key default gen_random_uuid(),
  kpi_id         uuid    not null references public.strategic_kpis(id) on delete cascade,
  reference_year integer not null check (reference_year between 2000 and 2200),
  reference_type text    not null default 'actual' check (reference_type in ('actual', 'target')),
  value          numeric,
  label          text,
  unique (kpi_id, reference_year, reference_type)
);

alter table public.strategic_kpi_benchmarks enable row level security;
drop policy if exists "strategic managers all on strategic_kpi_benchmarks" on public.strategic_kpi_benchmarks;
create policy "strategic managers all on strategic_kpi_benchmarks"
on public.strategic_kpi_benchmarks for all
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_benchmarks.kpi_id and public.can_manage_strategic_a3(k.organization_id)
))
with check (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_benchmarks.kpi_id and public.can_manage_strategic_a3(k.organization_id)
));

-- ============================================================================
-- 16. strategic_period_analyses — cabeçalho da análise mensal do A3
-- ============================================================================
create table if not exists public.strategic_period_analyses (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  a3_id           uuid        not null references public.strategic_a3(id) on delete cascade,
  year            integer     not null check (year between 2000 and 2200),
  month           integer     not null check (month between 1 and 12),
  summary         text,
  updated_by      uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (a3_id, year, month)
);

drop trigger if exists trg_strategic_period_analyses_updated_at on public.strategic_period_analyses;
create trigger trg_strategic_period_analyses_updated_at
before update on public.strategic_period_analyses
for each row execute function public.set_updated_at();

alter table public.strategic_period_analyses enable row level security;
drop policy if exists "strategic managers all on strategic_period_analyses" on public.strategic_period_analyses;
create policy "strategic managers all on strategic_period_analyses"
on public.strategic_period_analyses for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

-- ============================================================================
-- 17. strategic_analysis_items — causas e contramedidas estruturadas
-- (decisão #23 — nunca texto livre "Causas:"/"Ações:" num campo só)
-- ============================================================================
create table if not exists public.strategic_analysis_items (
  id            uuid        primary key default gen_random_uuid(),
  analysis_id   uuid        not null references public.strategic_period_analyses(id) on delete cascade,
  item_type     text        not null check (item_type in ('cause', 'countermeasure')),
  description   text        not null,
  impact_level  text,
  display_order integer     not null default 0,
  created_by    uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_strategic_analysis_items_analysis on public.strategic_analysis_items (analysis_id, display_order);

drop trigger if exists trg_strategic_analysis_items_updated_at on public.strategic_analysis_items;
create trigger trg_strategic_analysis_items_updated_at
before update on public.strategic_analysis_items
for each row execute function public.set_updated_at();

alter table public.strategic_analysis_items enable row level security;
drop policy if exists "strategic managers all on strategic_analysis_items" on public.strategic_analysis_items;
create policy "strategic managers all on strategic_analysis_items"
on public.strategic_analysis_items for all
using (exists (
  select 1 from public.strategic_period_analyses pa
  where pa.id = strategic_analysis_items.analysis_id and public.can_manage_strategic_a3(pa.organization_id)
))
with check (exists (
  select 1 from public.strategic_period_analyses pa
  where pa.id = strategic_analysis_items.analysis_id and public.can_manage_strategic_a3(pa.organization_id)
));

-- ============================================================================
-- 18. strategic_analysis_item_kpis — causa/contramedida ↔ KPIs (N:N)
-- ============================================================================
create table if not exists public.strategic_analysis_item_kpis (
  analysis_item_id uuid not null references public.strategic_analysis_items(id) on delete cascade,
  kpi_id           uuid not null references public.strategic_kpis(id) on delete cascade,
  primary key (analysis_item_id, kpi_id)
);

alter table public.strategic_analysis_item_kpis enable row level security;
drop policy if exists "strategic managers all on strategic_analysis_item_kpis" on public.strategic_analysis_item_kpis;
create policy "strategic managers all on strategic_analysis_item_kpis"
on public.strategic_analysis_item_kpis for all
using (exists (
  select 1 from public.strategic_analysis_items ai
  join public.strategic_period_analyses pa on pa.id = ai.analysis_id
  where ai.id = strategic_analysis_item_kpis.analysis_item_id and public.can_manage_strategic_a3(pa.organization_id)
))
with check (exists (
  select 1 from public.strategic_analysis_items ai
  join public.strategic_period_analyses pa on pa.id = ai.analysis_id
  where ai.id = strategic_analysis_item_kpis.analysis_item_id and public.can_manage_strategic_a3(pa.organization_id)
));

-- ============================================================================
-- 19. strategic_actions — plano de ações
-- responsável/prazo/prioridade/progresso recomendados, não obrigatórios
-- (decisão #24); pode ligar a vários A3/KPI (decisão #25, #8).
-- ============================================================================
create table if not exists public.strategic_actions (
  id                       uuid        primary key default gen_random_uuid(),
  organization_id          uuid        not null references public.organizations(id) on delete cascade,
  cycle_id                 uuid        not null references public.strategic_cycles(id) on delete cascade,
  source_analysis_item_id  uuid        references public.strategic_analysis_items(id) on delete set null,
  title                    text        not null,
  description              text,
  status                   text        not null default 'not_started' check (status in (
                             'not_started', 'in_progress', 'on_hold', 'done', 'cancelled'
                           )),
  priority                 text,
  due_date                 date,
  progress                 numeric     check (progress is null or (progress >= 0 and progress <= 100)),
  completed_at             timestamptz,
  created_by               uuid        references auth.users(id) on delete set null default auth.uid(),
  updated_by               uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_strategic_actions_cycle on public.strategic_actions (cycle_id, status);
create index if not exists idx_strategic_actions_due on public.strategic_actions (due_date) where status not in ('done', 'cancelled');

drop trigger if exists trg_strategic_actions_updated_at on public.strategic_actions;
create trigger trg_strategic_actions_updated_at
before update on public.strategic_actions
for each row execute function public.set_updated_at();

alter table public.strategic_actions enable row level security;
drop policy if exists "strategic managers all on strategic_actions" on public.strategic_actions;
create policy "strategic managers all on strategic_actions"
on public.strategic_actions for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

-- ============================================================================
-- 20/21/22. Junções da ação: A3 (N:N), KPIs (N:N), responsáveis (N:N)
-- ============================================================================
create table if not exists public.strategic_action_a3 (
  action_id uuid not null references public.strategic_actions(id) on delete cascade,
  a3_id     uuid not null references public.strategic_a3(id) on delete cascade,
  primary key (action_id, a3_id)
);

create table if not exists public.strategic_action_kpis (
  action_id uuid not null references public.strategic_actions(id) on delete cascade,
  kpi_id    uuid not null references public.strategic_kpis(id) on delete cascade,
  primary key (action_id, kpi_id)
);

create table if not exists public.strategic_action_owners (
  action_id  uuid        not null references public.strategic_actions(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  owner_type text        not null default 'owner' check (owner_type in ('owner', 'co_owner', 'contributor')),
  created_at timestamptz not null default now(),
  primary key (action_id, user_id)
);

alter table public.strategic_action_a3 enable row level security;
drop policy if exists "strategic managers all on strategic_action_a3" on public.strategic_action_a3;
create policy "strategic managers all on strategic_action_a3"
on public.strategic_action_a3 for all
using (exists (
  select 1 from public.strategic_actions ac
  where ac.id = strategic_action_a3.action_id and public.can_manage_strategic_a3(ac.organization_id)
))
with check (exists (
  select 1 from public.strategic_actions ac
  where ac.id = strategic_action_a3.action_id and public.can_manage_strategic_a3(ac.organization_id)
));

alter table public.strategic_action_kpis enable row level security;
drop policy if exists "strategic managers all on strategic_action_kpis" on public.strategic_action_kpis;
create policy "strategic managers all on strategic_action_kpis"
on public.strategic_action_kpis for all
using (exists (
  select 1 from public.strategic_actions ac
  where ac.id = strategic_action_kpis.action_id and public.can_manage_strategic_a3(ac.organization_id)
))
with check (exists (
  select 1 from public.strategic_actions ac
  where ac.id = strategic_action_kpis.action_id and public.can_manage_strategic_a3(ac.organization_id)
));

alter table public.strategic_action_owners enable row level security;
drop policy if exists "strategic managers all on strategic_action_owners" on public.strategic_action_owners;
create policy "strategic managers all on strategic_action_owners"
on public.strategic_action_owners for all
using (exists (
  select 1 from public.strategic_actions ac
  where ac.id = strategic_action_owners.action_id and public.can_manage_strategic_a3(ac.organization_id)
))
with check (exists (
  select 1 from public.strategic_actions ac
  where ac.id = strategic_action_owners.action_id and public.can_manage_strategic_a3(ac.organization_id)
));

-- ============================================================================
-- 23. strategic_attachments — metadados de anexo (arquivo em si no Storage,
-- migration 130); exatamente 1 das 3 referências preenchida.
-- ============================================================================
create table if not exists public.strategic_attachments (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  kpi_record_id    uuid        references public.strategic_kpi_records(id) on delete cascade,
  analysis_item_id uuid        references public.strategic_analysis_items(id) on delete cascade,
  action_id        uuid        references public.strategic_actions(id) on delete cascade,
  storage_path     text        not null,
  file_name        text        not null,
  mime_type        text,
  file_size        bigint,
  created_by       uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  constraint strategic_attachments_single_owner check (
    (case when kpi_record_id is not null then 1 else 0 end)
    + (case when analysis_item_id is not null then 1 else 0 end)
    + (case when action_id is not null then 1 else 0 end) = 1
  )
);

create index if not exists idx_strategic_attachments_kpi_record on public.strategic_attachments (kpi_record_id);
create index if not exists idx_strategic_attachments_analysis_item on public.strategic_attachments (analysis_item_id);
create index if not exists idx_strategic_attachments_action on public.strategic_attachments (action_id);

alter table public.strategic_attachments enable row level security;
drop policy if exists "strategic managers all on strategic_attachments" on public.strategic_attachments;
create policy "strategic managers all on strategic_attachments"
on public.strategic_attachments for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

-- ============================================================================
-- 24. strategic_comments — comentários em resultados/análises/ações
-- ============================================================================
create table if not exists public.strategic_comments (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  kpi_record_id    uuid        references public.strategic_kpi_records(id) on delete cascade,
  analysis_item_id uuid        references public.strategic_analysis_items(id) on delete cascade,
  action_id        uuid        references public.strategic_actions(id) on delete cascade,
  body             text        not null,
  created_by       uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint strategic_comments_single_owner check (
    (case when kpi_record_id is not null then 1 else 0 end)
    + (case when analysis_item_id is not null then 1 else 0 end)
    + (case when action_id is not null then 1 else 0 end) = 1
  )
);

create index if not exists idx_strategic_comments_kpi_record on public.strategic_comments (kpi_record_id);
create index if not exists idx_strategic_comments_analysis_item on public.strategic_comments (analysis_item_id);
create index if not exists idx_strategic_comments_action on public.strategic_comments (action_id);

drop trigger if exists trg_strategic_comments_updated_at on public.strategic_comments;
create trigger trg_strategic_comments_updated_at
before update on public.strategic_comments
for each row execute function public.set_updated_at();

alter table public.strategic_comments enable row level security;
drop policy if exists "strategic managers all on strategic_comments" on public.strategic_comments;
create policy "strategic managers all on strategic_comments"
on public.strategic_comments for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

commit;
