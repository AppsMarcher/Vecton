-- ETAPA 3a da limpeza de cargas sobrepostas.
-- Cole o arquivo INTEIRO no SQL Editor e rode.
-- Apaga a auditoria e os lotes da familia "actuals" (contabil realizado)
-- que ja foram substituidos por recargas mais novas. Com os indices
-- criados nas etapas anteriores, isso deve ser rapido (~17 lotes).

delete from public.actuals_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

delete from public.actuals_import_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

delete from public.actuals_import_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

delete from public.actuals_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

select 'actuals limpo com sucesso' as status;
