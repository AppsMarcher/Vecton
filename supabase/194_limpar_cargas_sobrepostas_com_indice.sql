-- Versao com indice temporario em batch_id para as tabelas *_ledger_audit e
-- *_row_audit, que hoje SO tem indice em ledger_entry_id / batch_row_id.
-- Sem indice em batch_id, todo DELETE ... WHERE batch_id IN (...) precisa
-- varrer a tabela inteira (300-450MB) -- e cada rodada sem VACUUM entre
-- elas fica mais lenta ainda (tuplas mortas acumulando). Com o indice, vira
-- um lookup de ~70 UUIDs, bem mais rapido que qualquer timeout do painel.
--
-- COMO RODAR: um bloco de cada vez, na ordem. Comece pela ETAPA 1 (tabela
-- pequena) pra validar que CREATE INDEX funciona no editor sem estourar.
-- Se funcionar, siga para as tabelas maiores.

-- =============================================================================
-- ETAPA 0 — staging com os lotes superados (igual as versoes anteriores)
-- =============================================================================
create table if not exists public._cargas_superadas_cleanup (
  familia  text not null,
  batch_id uuid not null
);

truncate table public._cargas_superadas_cleanup;

insert into public._cargas_superadas_cleanup (familia, batch_id)
select 'actuals', r.batch_id
from public.actuals_import_rows r
left join public.actuals_ledger_entries l on l.batch_row_id = r.id
group by r.batch_id having count(l.id) = 0;

insert into public._cargas_superadas_cleanup (familia, batch_id)
select 'budget', r.batch_id
from public.budget_import_rows r
left join public.budget_ledger_entries l on l.batch_row_id = r.id
group by r.batch_id having count(l.id) = 0;

insert into public._cargas_superadas_cleanup (familia, batch_id)
select 'comercial_realizado', r.batch_id
from public.comercial_realizado_import_rows r
left join public.comercial_realizado_ledger_entries l on l.batch_row_id = r.id
group by r.batch_id having count(l.id) = 0;

insert into public._cargas_superadas_cleanup (familia, batch_id)
select 'comercial_planejado', r.batch_id
from public.comercial_planejado_import_rows r
left join public.comercial_planejado_ledger_entries l on l.batch_row_id = r.id
group by r.batch_id having count(l.id) = 0;

create index if not exists idx_cargas_superadas_cleanup
  on public._cargas_superadas_cleanup (familia, batch_id);

select familia, count(*) from public._cargas_superadas_cleanup group by familia;


-- =============================================================================
-- ETAPA 1 — indice na MENOR tabela primeiro, so pra validar (11MB, ~9k linhas)
-- =============================================================================
create index if not exists idx_comercial_planejado_ledger_audit_batch
  on public.comercial_planejado_ledger_audit (batch_id);

-- se a de cima funcionar, essa tambem deve funcionar sem problema:
create index if not exists idx_comercial_planejado_row_audit_batch
  on public.comercial_planejado_row_audit (batch_id);


-- =============================================================================
-- ETAPA 2 — indices nas tabelas maiores (uma de cada vez!)
-- Se alguma travar, use "create index concurrently" no lugar de "create
-- index" (nao trava a tabela, mas demora mais) -- so nao pode rodar junto
-- com outro comando no mesmo clique.
-- =============================================================================
create index if not exists idx_actuals_ledger_audit_batch
  on public.actuals_ledger_audit (batch_id);

-- 2b
create index if not exists idx_actuals_row_audit_batch
  on public.actuals_import_row_audit (batch_id);

-- 2c
create index if not exists idx_budget_ledger_audit_batch
  on public.budget_ledger_audit (batch_id);

-- 2d
create index if not exists idx_budget_row_audit_batch
  on public.budget_import_row_audit (batch_id);

-- 2e
create index if not exists idx_comercial_realizado_ledger_audit_batch
  on public.comercial_realizado_ledger_audit (batch_id);

-- 2f
create index if not exists idx_comercial_realizado_row_audit_batch
  on public.comercial_realizado_row_audit (batch_id);


-- =============================================================================
-- ETAPA 3 — agora os deletes, ja devem ser rapidos (index scan, nao seq scan)
-- =============================================================================
-- actuals
delete from public.actuals_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

-- 3b
delete from public.actuals_import_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

-- 3c (essa ja tinha indice desde o inicio)
delete from public.actuals_import_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

-- 3d
delete from public.actuals_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

-- budget
delete from public.budget_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');

-- 3f
delete from public.budget_import_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');

-- 3g
delete from public.budget_import_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');

-- 3h
delete from public.budget_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');

-- comercial realizado
delete from public.comercial_realizado_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');

-- 3j
delete from public.comercial_realizado_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');

-- 3k
delete from public.comercial_realizado_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');

-- 3l
delete from public.comercial_realizado_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');

-- comercial planejado
delete from public.comercial_planejado_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');

-- 3n
delete from public.comercial_planejado_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');

-- 3o
delete from public.comercial_planejado_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');

-- 3p
delete from public.comercial_planejado_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');


-- =============================================================================
-- ETAPA 4 — limpeza final: staging, indices temporarios, conferencia
-- =============================================================================
drop table if exists public._cargas_superadas_cleanup;

-- os indices sao pequenos (uns 10-15MB cada) e podem ser uteis no futuro
-- pra consultar auditoria por lote -- pode manter. Se preferir remover:
-- drop index if exists public.idx_actuals_ledger_audit_batch;
-- drop index if exists public.idx_actuals_row_audit_batch;
-- drop index if exists public.idx_budget_ledger_audit_batch;
-- drop index if exists public.idx_budget_row_audit_batch;
-- drop index if exists public.idx_comercial_realizado_ledger_audit_batch;
-- drop index if exists public.idx_comercial_realizado_row_audit_batch;
-- drop index if exists public.idx_comercial_planejado_ledger_audit_batch;
-- drop index if exists public.idx_comercial_planejado_row_audit_batch;

select
  relname as tabela,
  pg_size_pretty(pg_total_relation_size(relid)) as tamanho,
  n_live_tup as linhas_vivas
from pg_stat_user_tables
where schemaname = 'public'
order by pg_total_relation_size(relid) desc
limit 15;

-- ETAPA 5 (opcional, fora do horario de pico) — devolve espaco ao disco:
-- vacuum (full, analyze) public.actuals_ledger_audit;
-- vacuum (full, analyze) public.actuals_import_row_audit;
-- vacuum (full, analyze) public.actuals_import_batch_audit;
-- vacuum (full, analyze) public.budget_ledger_audit;
-- vacuum (full, analyze) public.budget_import_row_audit;
-- vacuum (full, analyze) public.budget_import_batch_audit;
-- vacuum (full, analyze) public.comercial_realizado_ledger_audit;
-- vacuum (full, analyze) public.comercial_realizado_row_audit;
-- vacuum (full, analyze) public.comercial_realizado_batch_audit;
-- vacuum (full, analyze) public.comercial_planejado_ledger_audit;
-- vacuum (full, analyze) public.comercial_planejado_row_audit;
-- vacuum (full, analyze) public.comercial_planejado_batch_audit;
