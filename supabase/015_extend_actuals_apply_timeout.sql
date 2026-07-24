begin;

create index if not exists idx_actuals_ledger_batch_id
  on public.actuals_ledger_entries (batch_id);

create or replace function public.apply_actuals_import_batch(target_batch_id uuid)
returns public.actuals_import_batches
language plpgsql
security definer
set search_path = public
set statement_timeout = '0'
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

commit;
