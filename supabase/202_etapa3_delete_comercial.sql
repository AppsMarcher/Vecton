-- ETAPA 3c/3d — comercial_realizado (72 lotes) e comercial_planejado (7 lotes).
-- Cole o arquivo INTEIRO no SQL Editor e rode.

-- comercial_realizado
alter table public.comercial_realizado_import_batches disable trigger trg_audit_comercial_realizado_batch;
alter table public.comercial_realizado_import_rows disable trigger trg_after_comercial_realizado_row_change;
alter table public.comercial_realizado_import_rows disable trigger trg_audit_comercial_realizado_row;

delete from public.comercial_realizado_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');

delete from public.comercial_realizado_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');

delete from public.comercial_realizado_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');

delete from public.comercial_realizado_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');

alter table public.comercial_realizado_import_batches enable trigger trg_audit_comercial_realizado_batch;
alter table public.comercial_realizado_import_rows enable trigger trg_after_comercial_realizado_row_change;
alter table public.comercial_realizado_import_rows enable trigger trg_audit_comercial_realizado_row;

-- comercial_planejado
alter table public.comercial_planejado_import_batches disable trigger trg_audit_comercial_planejado_batch;
alter table public.comercial_planejado_import_rows disable trigger trg_after_comercial_planejado_row_change;
alter table public.comercial_planejado_import_rows disable trigger trg_audit_comercial_planejado_row;

delete from public.comercial_planejado_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');

delete from public.comercial_planejado_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');

delete from public.comercial_planejado_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');

delete from public.comercial_planejado_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');

alter table public.comercial_planejado_import_batches enable trigger trg_audit_comercial_planejado_batch;
alter table public.comercial_planejado_import_rows enable trigger trg_after_comercial_planejado_row_change;
alter table public.comercial_planejado_import_rows enable trigger trg_audit_comercial_planejado_row;

select 'comercial limpo com sucesso' as status;
