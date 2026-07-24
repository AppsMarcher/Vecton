begin;

-- ── forecast_scenarios ───────────────────────────────────────────────────────
-- Um cenário representa um Forecast composto por meses realizados (≤ cutoff_month)
-- + meses replanejados (> cutoff_month) carregados em forecast_ledger_entries.
create table if not exists public.forecast_scenarios (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  color            text not null default '#6366f1',
  icon             text not null default '📊',
  reference_year   integer not null,
  cutoff_month     integer not null check (cutoff_month between 0 and 12),
  sort_order       integer not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── forecast_ledger_entries ──────────────────────────────────────────────────
-- Hard-copy dos lançamentos para cada cenário (meses > cutoff_month).
-- Mesma estrutura do budget_ledger_entries, sem FK para batch (cópia direta).
create table if not exists public.forecast_ledger_entries (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  scenario_id          uuid not null references public.forecast_scenarios(id) on delete cascade,
  reference_year       integer not null,
  reference_month      integer not null check (reference_month between 1 and 12),
  account_number       text not null,
  cost_center_id       uuid references public.cost_centers(id) on delete restrict,
  cost_center_number   text,
  amount               numeric(18, 2) not null default 0,
  entry_date           date,
  history              text
);

-- ── Índices ──────────────────────────────────────────────────────────────────
create index if not exists idx_forecast_scenarios_org_year
  on public.forecast_scenarios (organization_id, reference_year, sort_order);

create index if not exists idx_forecast_ledger_org_scenario_period_id
  on public.forecast_ledger_entries (organization_id, scenario_id, reference_year, reference_month, id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.forecast_scenarios       enable row level security;
alter table public.forecast_ledger_entries  enable row level security;

-- forecast_scenarios: membro da org lê; admin escreve
create policy "forecast_scenarios_select"
  on public.forecast_scenarios for select
  using (public.is_org_member(organization_id));

create policy "forecast_scenarios_insert"
  on public.forecast_scenarios for insert
  with check (public.is_org_member(organization_id));

create policy "forecast_scenarios_update"
  on public.forecast_scenarios for update
  using (public.is_org_member(organization_id));

create policy "forecast_scenarios_delete"
  on public.forecast_scenarios for delete
  using (public.is_org_member(organization_id));

-- forecast_ledger_entries: membro da org lê; admin escreve
create policy "forecast_ledger_select"
  on public.forecast_ledger_entries for select
  using (public.is_org_member(organization_id));

create policy "forecast_ledger_insert"
  on public.forecast_ledger_entries for insert
  with check (public.is_org_member(organization_id));

create policy "forecast_ledger_update"
  on public.forecast_ledger_entries for update
  using (public.is_org_member(organization_id));

create policy "forecast_ledger_delete"
  on public.forecast_ledger_entries for delete
  using (public.is_org_member(organization_id));

commit;
