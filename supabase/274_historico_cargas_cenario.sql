-- 274: Histórico simplificado de cargas por cenário.
-- Uma linha por carga aplicada (sem guardar as linhas do arquivo), para não
-- inflar o banco. Substitui o histórico de lotes do Budget antigo.

begin;

create table if not exists public.scenario_load_log (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  scenario_id       uuid not null references public.forecast_scenarios(id) on delete cascade,
  reference_year    integer not null,
  reference_month   integer not null check (reference_month between 1 and 12),
  load_mode         text not null check (load_mode in ('complete', 'additional')),
  source_file_name  text,
  row_count         integer not null default 0,
  loaded_by         uuid references auth.users(id) on delete set null,
  loaded_at         timestamptz not null default now()
);

create index if not exists idx_scenario_load_log_scenario
  on public.scenario_load_log (organization_id, scenario_id, loaded_at desc);

alter table public.scenario_load_log enable row level security;

create policy "scenario_load_log_select"
  on public.scenario_load_log for select
  using (public.is_org_member(organization_id));

create policy "scenario_load_log_insert"
  on public.scenario_load_log for insert
  with check (public.is_org_member(organization_id));

commit;
