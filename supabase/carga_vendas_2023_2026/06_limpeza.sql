-- 06: depois de conferir (05) e validar no sistema, remove o staging. Os backups (_bkp_*) ficam ate voce decidir apagar.
drop table if exists public.stg_carga_vendas_2023_2026;
-- Quando tiver certeza:
-- drop table if exists public._bkp_realizado_ledger_20261013;
-- drop table if exists public._bkp_realizado_batches_20261013;
