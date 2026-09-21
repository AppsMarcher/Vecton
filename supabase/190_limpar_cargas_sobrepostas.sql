begin;

-- Limpeza de lotes de importacao totalmente substituidos por recargas
-- 'complete' mais recentes do mesmo periodo (organization_id, reference_year,
-- reference_month), incluindo a trilha de auditoria vinculada a eles.
--
-- Um lote e considerado "superado" quando NENHUMA de suas linhas
-- (*_import_rows) ainda tem correspondente em *_ledger_entries: ou seja,
-- o ledger vivo hoje nao depende mais desse lote.
--
-- A auditoria dos lotes ainda vigentes (o ultimo 'complete' aplicado em cada
-- periodo, e qualquer lote 'additional' cujas linhas ainda estao no ledger)
-- e preservada.

-- ---------------------------------------------------------------------------
-- 1) Actuals (contabil realizado)
-- ---------------------------------------------------------------------------
with superseded as (
  select r.batch_id
  from public.actuals_import_rows r
  left join public.actuals_ledger_entries l on l.batch_row_id = r.id
  group by r.batch_id having count(l.id) = 0
),
del_ledger_audit as (
  delete from public.actuals_ledger_audit where batch_id in (select batch_id from superseded) returning 1
),
del_row_audit as (
  delete from public.actuals_import_row_audit where batch_id in (select batch_id from superseded) returning 1
),
del_batch_audit as (
  delete from public.actuals_import_batch_audit where batch_id in (select batch_id from superseded) returning 1
),
del_batches as (
  delete from public.actuals_import_batches where id in (select batch_id from superseded) returning 1
)
select
  'actuals' as familia,
  (select count(*) from del_ledger_audit) as ledger_audit_deletadas,
  (select count(*) from del_row_audit) as row_audit_deletadas,
  (select count(*) from del_batch_audit) as batch_audit_deletadas,
  (select count(*) from del_batches) as lotes_deletados;

-- ---------------------------------------------------------------------------
-- 2) Budget (orcamento do DRE)
-- ---------------------------------------------------------------------------
with superseded as (
  select r.batch_id
  from public.budget_import_rows r
  left join public.budget_ledger_entries l on l.batch_row_id = r.id
  group by r.batch_id having count(l.id) = 0
),
del_ledger_audit as (
  delete from public.budget_ledger_audit where batch_id in (select batch_id from superseded) returning 1
),
del_row_audit as (
  delete from public.budget_import_row_audit where batch_id in (select batch_id from superseded) returning 1
),
del_batch_audit as (
  delete from public.budget_import_batch_audit where batch_id in (select batch_id from superseded) returning 1
),
del_batches as (
  delete from public.budget_import_batches where id in (select batch_id from superseded) returning 1
)
select
  'budget' as familia,
  (select count(*) from del_ledger_audit) as ledger_audit_deletadas,
  (select count(*) from del_row_audit) as row_audit_deletadas,
  (select count(*) from del_batch_audit) as batch_audit_deletadas,
  (select count(*) from del_batches) as lotes_deletados;

-- ---------------------------------------------------------------------------
-- 3) Comercial realizado (vendas FAT/CART)
-- ---------------------------------------------------------------------------
with superseded as (
  select r.batch_id
  from public.comercial_realizado_import_rows r
  left join public.comercial_realizado_ledger_entries l on l.batch_row_id = r.id
  group by r.batch_id having count(l.id) = 0
),
del_ledger_audit as (
  delete from public.comercial_realizado_ledger_audit where batch_id in (select batch_id from superseded) returning 1
),
del_row_audit as (
  delete from public.comercial_realizado_row_audit where batch_id in (select batch_id from superseded) returning 1
),
del_batch_audit as (
  delete from public.comercial_realizado_batch_audit where batch_id in (select batch_id from superseded) returning 1
),
del_batches as (
  delete from public.comercial_realizado_import_batches where id in (select batch_id from superseded) returning 1
)
select
  'comercial_realizado' as familia,
  (select count(*) from del_ledger_audit) as ledger_audit_deletadas,
  (select count(*) from del_row_audit) as row_audit_deletadas,
  (select count(*) from del_batch_audit) as batch_audit_deletadas,
  (select count(*) from del_batches) as lotes_deletados;

-- ---------------------------------------------------------------------------
-- 4) Comercial planejado (vendas meta/forecast)
-- ---------------------------------------------------------------------------
with superseded as (
  select r.batch_id
  from public.comercial_planejado_import_rows r
  left join public.comercial_planejado_ledger_entries l on l.batch_row_id = r.id
  group by r.batch_id having count(l.id) = 0
),
del_ledger_audit as (
  delete from public.comercial_planejado_ledger_audit where batch_id in (select batch_id from superseded) returning 1
),
del_row_audit as (
  delete from public.comercial_planejado_row_audit where batch_id in (select batch_id from superseded) returning 1
),
del_batch_audit as (
  delete from public.comercial_planejado_batch_audit where batch_id in (select batch_id from superseded) returning 1
),
del_batches as (
  delete from public.comercial_planejado_import_batches where id in (select batch_id from superseded) returning 1
)
select
  'comercial_planejado' as familia,
  (select count(*) from del_ledger_audit) as ledger_audit_deletadas,
  (select count(*) from del_row_audit) as row_audit_deletadas,
  (select count(*) from del_batch_audit) as batch_audit_deletadas,
  (select count(*) from del_batches) as lotes_deletados;

commit;

-- Depois de rodar, recomenda-se (fora de horario de pico, trava a tabela por
-- instantes):
--   vacuum (full, analyze) public.actuals_ledger_audit, public.actuals_import_row_audit, public.actuals_import_batch_audit;
--   vacuum (full, analyze) public.budget_ledger_audit, public.budget_import_row_audit, public.budget_import_batch_audit;
--   vacuum (full, analyze) public.comercial_realizado_ledger_audit, public.comercial_realizado_row_audit, public.comercial_realizado_batch_audit;
--   vacuum (full, analyze) public.comercial_planejado_ledger_audit, public.comercial_planejado_row_audit, public.comercial_planejado_batch_audit;
-- para o Postgres devolver o espaco em disco ao SO (um VACUUM comum so marca
-- o espaco como reutilizavel, nao encolhe o arquivo).
