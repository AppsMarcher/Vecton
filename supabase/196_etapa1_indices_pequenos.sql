-- ETAPA 1 da limpeza de cargas sobrepostas.
-- Cole o arquivo INTEIRO no SQL Editor e rode.
-- So cria 2 indices novos nas tabelas menores (11MB e 6MB), pra testar que
-- o CREATE INDEX funciona sem travar antes de fazer o mesmo nas tabelas
-- grandes. Nao apaga nada.

create index if not exists idx_comercial_planejado_ledger_audit_batch
  on public.comercial_planejado_ledger_audit (batch_id);

create index if not exists idx_comercial_planejado_row_audit_batch
  on public.comercial_planejado_row_audit (batch_id);

select 'indices criados com sucesso' as status;
