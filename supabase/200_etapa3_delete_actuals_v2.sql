-- ETAPA 3a (v2) — use este no lugar do 199.
-- Cole o arquivo INTEIRO no SQL Editor e rode.
--
-- O 199 estava travando porque apagar os lotes dispara triggers por LINHA
-- (recalculo de estatisticas + auditoria) para cada uma das ~131 mil linhas
-- orfas -- alem de lento, a propria limpeza ficava recriando registros na
-- tabela de auditoria que estamos tentando esvaziar. Aqui desabilito esses
-- 3 triggers, faco a limpeza, e reabilito no final -- tudo na mesma
-- transacao (se der erro no meio, nada fica desabilitado por engano).

alter table public.actuals_import_batches disable trigger trg_audit_actuals_import_batch;
alter table public.actuals_import_rows disable trigger trg_after_actuals_import_row_change;
alter table public.actuals_import_rows disable trigger trg_audit_actuals_import_row;

delete from public.actuals_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

delete from public.actuals_import_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

delete from public.actuals_import_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

delete from public.actuals_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

alter table public.actuals_import_batches enable trigger trg_audit_actuals_import_batch;
alter table public.actuals_import_rows enable trigger trg_after_actuals_import_row_change;
alter table public.actuals_import_rows enable trigger trg_audit_actuals_import_row;

select 'actuals limpo com sucesso' as status;
