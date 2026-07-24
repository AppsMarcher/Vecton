begin;

create table if not exists public.actuals_monthly_account_totals (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference_year integer not null,
  reference_month integer not null check (reference_month between 1 and 12),
  account_id uuid references public.accounts(id) on delete set null,
  account_number text not null,
  total_amount numeric(18, 2) not null default 0,
  entry_count integer not null default 0,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, reference_year, reference_month, account_number)
);

create index if not exists idx_actuals_monthly_account_totals_org_year
  on public.actuals_monthly_account_totals (organization_id, reference_year, reference_month);

create index if not exists idx_actuals_monthly_account_totals_account
  on public.actuals_monthly_account_totals (organization_id, account_number, reference_year, reference_month);

drop trigger if exists trg_actuals_monthly_account_totals_updated_at on public.actuals_monthly_account_totals;
create trigger trg_actuals_monthly_account_totals_updated_at
before update on public.actuals_monthly_account_totals
for each row
execute function public.set_updated_at();

create or replace function public.refresh_actuals_monthly_account_totals(
  target_organization_id uuid,
  target_reference_year integer,
  target_reference_month integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.actuals_monthly_account_totals
  where organization_id = target_organization_id
    and reference_year = target_reference_year
    and reference_month = target_reference_month;

  insert into public.actuals_monthly_account_totals (
    organization_id,
    reference_year,
    reference_month,
    account_id,
    account_number,
    total_amount,
    entry_count,
    refreshed_at
  )
  select
    l.organization_id,
    l.reference_year,
    l.reference_month,
    (array_agg(l.account_id order by l.account_id) filter (where l.account_id is not null))[1] as account_id,
    l.account_number,
    coalesce(sum(l.amount), 0)::numeric(18, 2) as total_amount,
    count(*)::integer as entry_count,
    now()
  from public.actuals_ledger_entries l
  where l.organization_id = target_organization_id
    and l.reference_year = target_reference_year
    and l.reference_month = target_reference_month
  group by
    l.organization_id,
    l.reference_year,
    l.reference_month,
    l.account_number;
end;
$$;

grant execute on function public.refresh_actuals_monthly_account_totals(uuid, integer, integer) to authenticated;

create or replace function public.apply_actuals_import_batch(target_batch_id uuid)
returns public.actuals_import_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_rec public.actuals_import_batches%rowtype;
begin
  select *
    into batch_rec
  from public.actuals_import_batches
  where id = target_batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  if not public.is_org_editor(batch_rec.organization_id) then
    raise exception 'Usuario sem permissao para aplicar este lote';
  end if;

  if not exists (
    select 1
    from public.actuals_import_rows r
    where r.batch_id = target_batch_id
  ) then
    raise exception 'O lote nao possui linhas para aplicacao';
  end if;

  if exists (
    select 1
    from public.actuals_import_rows r
    where r.batch_id = target_batch_id
      and r.validation_status = 'error'
  ) then
    raise exception 'Corrija todas as linhas com erro antes de aplicar o lote';
  end if;

  if batch_rec.load_mode = 'complete' then
    delete from public.actuals_ledger_entries l
    where l.organization_id = batch_rec.organization_id
      and l.reference_year = batch_rec.reference_year
      and l.reference_month = batch_rec.reference_month;
  else
    delete from public.actuals_ledger_entries l
    where l.batch_id = target_batch_id;
  end if;

  insert into public.actuals_ledger_entries (
    organization_id,
    batch_id,
    batch_row_id,
    reference_year,
    reference_month,
    entry_date,
    branch_id,
    account_id,
    cost_center_id,
    branch_code,
    account_number,
    cost_center_number,
    history,
    lot_code,
    amount,
    source_type,
    created_by,
    updated_by
  )
  select
    batch_rec.organization_id,
    r.batch_id,
    r.id,
    batch_rec.reference_year,
    batch_rec.reference_month,
    r.entry_date,
    r.branch_id,
    r.account_id,
    r.cost_center_id,
    r.branch_code,
    r.account_number,
    r.cost_center_number,
    r.history,
    r.lot_code,
    r.amount,
    batch_rec.source_type,
    auth.uid(),
    auth.uid()
  from public.actuals_import_rows r
  where r.batch_id = target_batch_id
    and r.validation_status = 'valid'
  on conflict (batch_row_id) do update
    set entry_date = excluded.entry_date,
        branch_id = excluded.branch_id,
        account_id = excluded.account_id,
        cost_center_id = excluded.cost_center_id,
        branch_code = excluded.branch_code,
        account_number = excluded.account_number,
        cost_center_number = excluded.cost_center_number,
        history = excluded.history,
        lot_code = excluded.lot_code,
        amount = excluded.amount,
        source_type = excluded.source_type,
        updated_by = auth.uid(),
        updated_at = now();

  perform public.refresh_actuals_monthly_account_totals(
    batch_rec.organization_id,
    batch_rec.reference_year,
    batch_rec.reference_month
  );

  update public.actuals_import_batches
     set status = 'applied',
         applied_by = auth.uid(),
         applied_at = now(),
         updated_at = now()
   where id = target_batch_id
   returning *
    into batch_rec;

  return batch_rec;
end;
$$;

grant execute on function public.apply_actuals_import_batch(uuid) to authenticated;

alter table public.actuals_monthly_account_totals enable row level security;

drop policy if exists "members can read actuals monthly account totals" on public.actuals_monthly_account_totals;
create policy "members can read actuals monthly account totals"
on public.actuals_monthly_account_totals
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage actuals monthly account totals" on public.actuals_monthly_account_totals;
create policy "editors can manage actuals monthly account totals"
on public.actuals_monthly_account_totals
for all
using (public.is_org_editor(organization_id))
with check (public.is_org_editor(organization_id));

insert into public.actuals_monthly_account_totals (
  organization_id,
  reference_year,
  reference_month,
  account_id,
  account_number,
  total_amount,
  entry_count,
  refreshed_at
)
select
  l.organization_id,
  l.reference_year,
  l.reference_month,
  (array_agg(l.account_id order by l.account_id) filter (where l.account_id is not null))[1] as account_id,
  l.account_number,
  coalesce(sum(l.amount), 0)::numeric(18, 2) as total_amount,
  count(*)::integer as entry_count,
  now()
from public.actuals_ledger_entries l
group by
  l.organization_id,
  l.reference_year,
  l.reference_month,
  l.account_number
on conflict (organization_id, reference_year, reference_month, account_number) do update
  set account_id = excluded.account_id,
      total_amount = excluded.total_amount,
      entry_count = excluded.entry_count,
      refreshed_at = excluded.refreshed_at,
      updated_at = now();

commit;
