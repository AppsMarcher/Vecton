-- ETAPA 2b da limpeza de cargas sobrepostas.
-- Cole o arquivo INTEIRO no SQL Editor e rode.
-- Cria indice batch_id nas 5 tabelas de auditoria restantes, todas menores
-- que a que voce acabou de rodar com sucesso. Nao apaga nada.

create index if not exists idx_actuals_row_audit_batch
  on public.actuals_import_row_audit (batch_id);

create index if not exists idx_budget_ledger_audit_batch
  on public.budget_ledger_audit (batch_id);

create index if not exists idx_budget_row_audit_batch
  on public.budget_import_row_audit (batch_id);

create index if not exists idx_comercial_realizado_ledger_audit_batch
  on public.comercial_realizado_ledger_audit (batch_id);

create index if not exists idx_comercial_realizado_row_audit_batch
  on public.comercial_realizado_row_audit (batch_id);

select 'indices criados com sucesso' as status;
