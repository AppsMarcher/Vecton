begin;

-- Mesmo padrao de 029_delete_actuals_batch_unapplies.sql: "Excluir lote" deve
-- desfazer a aplicacao (remover os lancamentos oficiais gerados por esse lote
-- em budget_ledger_entries) e so entao excluir o lote, numa unica transacao.
-- Antes disso, excluir um lote de planejado ja aplicado no Budget falhava com
-- violacao de FK (budget_ledger_entries.batch_id e "on delete restrict").
--
-- Lotes aplicados a um cenario de Forecast (forecast_ledger_entries) nao tem
-- essa trava — a tabela nem guarda batch_id — entao o delete abaixo de
-- budget_ledger_entries e um no-op nesse caso e a exclusao do lote segue normal.
create or replace function public.delete_budget_import_batch(target_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '0'
as $$
declare
  batch_rec public.budget_import_batches%rowtype;
begin
  select *
    into batch_rec
  from public.budget_import_batches
  where id = target_batch_id;

  if not found then
    raise exception 'Lote de importacao nao encontrado';
  end if;

  if not public.is_org_editor(batch_rec.organization_id) then
    raise exception 'Usuario sem permissao para excluir este lote';
  end if;

  delete from public.budget_ledger_entries l
  where l.batch_id = target_batch_id;

  perform public.refresh_budget_monthly_account_totals(
    batch_rec.organization_id,
    batch_rec.reference_year,
    batch_rec.reference_month
  );

  delete from public.budget_import_batches
  where id = target_batch_id;
end;
$$;

grant execute on function public.delete_budget_import_batch(uuid) to authenticated;

commit;
