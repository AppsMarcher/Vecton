-- ETAPA 3b — familia budget (orcamento do DRE), 69 lotes superados.
-- Cole o arquivo INTEIRO no SQL Editor e rode.

alter table public.budget_import_batches disable trigger trg_audit_budget_import_batch;
alter table public.budget_import_rows disable trigger trg_after_budget_import_row_change;
alter table public.budget_import_rows disable trigger trg_audit_budget_import_row;

delete from public.budget_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');

delete from public.budget_import_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');

delete from public.budget_import_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');

delete from public.budget_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');

alter table public.budget_import_batches enable trigger trg_audit_budget_import_batch;
alter table public.budget_import_rows enable trigger trg_after_budget_import_row_change;
alter table public.budget_import_rows enable trigger trg_audit_budget_import_row;

select 'budget limpo com sucesso' as status;
