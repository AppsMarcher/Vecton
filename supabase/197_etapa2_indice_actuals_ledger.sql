-- ETAPA 2a da limpeza de cargas sobrepostas.
-- Cole o arquivo INTEIRO no SQL Editor e rode.
-- Cria indice na maior tabela de auditoria (actuals_ledger_audit, ~431MB).
-- E' o teste mais pesado -- se passar, as outras tabelas grandes devem
-- passar tranquilo. Nao apaga nada, so cria um indice novo.

create index if not exists idx_actuals_ledger_audit_batch
  on public.actuals_ledger_audit (batch_id);

select 'indice criado com sucesso' as status;
