-- 00: copia de seguranca ANTES da carga (ledger + lotes atuais). Rode uma vez.
-- Nao ha rollback automatico depois do commit dos passos 04; estas tabelas permitem restaurar.
begin;
create table public._bkp_realizado_ledger_20261013 as select * from public.comercial_realizado_ledger_entries;
create table public._bkp_realizado_batches_20261013 as select * from public.comercial_realizado_import_batches;
alter table public._bkp_realizado_ledger_20261013 enable row level security;
alter table public._bkp_realizado_batches_20261013 enable row level security;
select (select count(*) from public._bkp_realizado_ledger_20261013) as ledger_linhas,
       (select count(*) from public._bkp_realizado_batches_20261013) as lotes;
commit;
