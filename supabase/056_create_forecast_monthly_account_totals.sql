-- 056: Totais mensais por conta para cenários de forecast.
-- Espelha actuals_monthly_account_totals (013) / budget_monthly_account_totals (016):
-- os DREs Soc/Ger/DFs só precisam de conta × mês, então os relatórios (fonte e
-- comparativo) leem esta tabela-resumo em vez do ledger completo do cenário.
-- Diferença do padrão do realizado: como o forecast_ledger_entries é escrito
-- direto pelo cliente (upsert em blocos na carga, cópia de meses, futuro editor
-- de DRE), a manutenção é por trigger de statement — não há RPC único de apply
-- para pendurar o refresh.

begin;

create table if not exists public.forecast_monthly_account_totals (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scenario_id uuid not null references public.forecast_scenarios(id) on delete cascade,
  reference_year integer not null,
  reference_month integer not null check (reference_month between 1 and 12),
  account_number text not null,
  total_amount numeric(18, 2) not null default 0,
  entry_count integer not null default 0,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, scenario_id, reference_year, reference_month, account_number)
);

create index if not exists idx_forecast_monthly_totals_org_scenario_year
  on public.forecast_monthly_account_totals (organization_id, scenario_id, reference_year, reference_month);

drop trigger if exists trg_forecast_monthly_totals_updated_at on public.forecast_monthly_account_totals;
create trigger trg_forecast_monthly_totals_updated_at
before update on public.forecast_monthly_account_totals
for each row
execute function public.set_updated_at();

-- Recalcula o resumo de um mês de um cenário a partir do ledger.
create or replace function public.refresh_forecast_monthly_account_totals(
  target_organization_id uuid,
  target_scenario_id uuid,
  target_reference_year integer,
  target_reference_month integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.forecast_monthly_account_totals
  where organization_id = target_organization_id
    and scenario_id = target_scenario_id
    and reference_year = target_reference_year
    and reference_month = target_reference_month;

  insert into public.forecast_monthly_account_totals (
    organization_id,
    scenario_id,
    reference_year,
    reference_month,
    account_number,
    total_amount,
    entry_count,
    refreshed_at
  )
  select
    l.organization_id,
    l.scenario_id,
    l.reference_year,
    l.reference_month,
    l.account_number,
    coalesce(sum(l.amount), 0)::numeric(18, 2) as total_amount,
    count(*)::integer as entry_count,
    now()
  from public.forecast_ledger_entries l
  where l.organization_id = target_organization_id
    and l.scenario_id = target_scenario_id
    and l.reference_year = target_reference_year
    and l.reference_month = target_reference_month
  group by
    l.organization_id,
    l.scenario_id,
    l.reference_year,
    l.reference_month,
    l.account_number;
end;
$$;

grant execute on function public.refresh_forecast_monthly_account_totals(uuid, uuid, integer, integer) to authenticated;

-- Triggers de statement: um refresh por (org, cenário, ano, mês) afetado no
-- statement — a carga em blocos de 2000 dispara 1 refresh por bloco, não por linha.
create or replace function public.tg_refresh_forecast_monthly_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_forecast_monthly_account_totals(
    g.organization_id, g.scenario_id, g.reference_year, g.reference_month
  )
  from (
    select distinct organization_id, scenario_id, reference_year, reference_month
    from changed_rows
  ) g;
  return null;
end;
$$;

create or replace function public.tg_refresh_forecast_monthly_totals_upd()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_forecast_monthly_account_totals(
    g.organization_id, g.scenario_id, g.reference_year, g.reference_month
  )
  from (
    select distinct organization_id, scenario_id, reference_year, reference_month from old_rows
    union
    select distinct organization_id, scenario_id, reference_year, reference_month from new_rows
  ) g;
  return null;
end;
$$;

drop trigger if exists trg_forecast_ledger_totals_ins on public.forecast_ledger_entries;
create trigger trg_forecast_ledger_totals_ins
after insert on public.forecast_ledger_entries
referencing new table as changed_rows
for each statement
execute function public.tg_refresh_forecast_monthly_totals();

drop trigger if exists trg_forecast_ledger_totals_del on public.forecast_ledger_entries;
create trigger trg_forecast_ledger_totals_del
after delete on public.forecast_ledger_entries
referencing old table as changed_rows
for each statement
execute function public.tg_refresh_forecast_monthly_totals();

drop trigger if exists trg_forecast_ledger_totals_upd on public.forecast_ledger_entries;
create trigger trg_forecast_ledger_totals_upd
after update on public.forecast_ledger_entries
referencing old table as old_rows new table as new_rows
for each statement
execute function public.tg_refresh_forecast_monthly_totals_upd();

alter table public.forecast_monthly_account_totals enable row level security;

drop policy if exists "members can read forecast monthly account totals" on public.forecast_monthly_account_totals;
create policy "members can read forecast monthly account totals"
on public.forecast_monthly_account_totals
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage forecast monthly account totals" on public.forecast_monthly_account_totals;
create policy "editors can manage forecast monthly account totals"
on public.forecast_monthly_account_totals
for all
using (public.is_org_editor(organization_id))
with check (public.is_org_editor(organization_id));

-- Backfill dos cenários já existentes.
insert into public.forecast_monthly_account_totals (
  organization_id,
  scenario_id,
  reference_year,
  reference_month,
  account_number,
  total_amount,
  entry_count,
  refreshed_at
)
select
  l.organization_id,
  l.scenario_id,
  l.reference_year,
  l.reference_month,
  l.account_number,
  coalesce(sum(l.amount), 0)::numeric(18, 2) as total_amount,
  count(*)::integer as entry_count,
  now()
from public.forecast_ledger_entries l
group by
  l.organization_id,
  l.scenario_id,
  l.reference_year,
  l.reference_month,
  l.account_number
on conflict (organization_id, scenario_id, reference_year, reference_month, account_number) do update
  set total_amount = excluded.total_amount,
      entry_count = excluded.entry_count,
      refreshed_at = excluded.refreshed_at,
      updated_at = now();

commit;
