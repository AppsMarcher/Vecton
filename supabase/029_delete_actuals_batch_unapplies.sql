begin;

-- "Excluir lote" deve desfazer a aplicacao (remover os lancamentos oficiais
-- gerados por esse lote) e so entao excluir o lote, numa unica transacao.
-- Antes disso, excluir um lote ja aplicado falhava com violacao de FK
-- (actuals_ledger_entries.batch_id e "on delete restrict").
create or replace function public.delete_actuals_import_batch(target_batch_id uuid)
returns void
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
    raise exception 'Usuario sem permissao para excluir este lote';
  end if;

  delete from public.actuals_ledger_entries l
  where l.batch_id = target_batch_id;

  perform public.refresh_actuals_monthly_account_totals(
    batch_rec.organization_id,
    batch_rec.reference_year,
    batch_rec.reference_month
  );

  delete from public.actuals_import_batches
  where id = target_batch_id;
end;
$$;

grant execute on function public.delete_actuals_import_batch(uuid) to authenticated;

commit;
