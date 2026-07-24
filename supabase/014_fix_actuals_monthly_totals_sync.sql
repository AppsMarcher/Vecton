begin;

create or replace function public.after_actuals_import_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_batch_id uuid;
  batch_rec public.actuals_import_batches%rowtype;
begin
  target_batch_id := coalesce(new.batch_id, old.batch_id);

  perform public.refresh_actuals_import_batch_stats(target_batch_id);

  select *
    into batch_rec
  from public.actuals_import_batches
  where id = target_batch_id;

  if batch_rec.status = 'applied' then
    if tg_op = 'DELETE' then
      delete from public.actuals_ledger_entries
      where batch_row_id = old.id;
    elsif coalesce(new.validation_status, 'error') = 'valid' then
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
      values (
        batch_rec.organization_id,
        new.batch_id,
        new.id,
        batch_rec.reference_year,
        batch_rec.reference_month,
        new.entry_date,
        new.branch_id,
        new.account_id,
        new.cost_center_id,
        new.branch_code,
        new.account_number,
        new.cost_center_number,
        new.history,
        new.lot_code,
        new.amount,
        batch_rec.source_type,
        auth.uid(),
        auth.uid()
      )
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
    else
      delete from public.actuals_ledger_entries
      where batch_row_id = new.id;
    end if;

    perform public.refresh_actuals_monthly_account_totals(
      batch_rec.organization_id,
      batch_rec.reference_year,
      batch_rec.reference_month
    );
  end if;

  return null;
end;
$$;

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

delete from public.actuals_monthly_account_totals t
where not exists (
  select 1
  from public.actuals_ledger_entries l
  where l.organization_id = t.organization_id
    and l.reference_year = t.reference_year
    and l.reference_month = t.reference_month
    and l.account_number = t.account_number
);

commit;
