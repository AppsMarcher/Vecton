-- Versao final: sem procedure, sem COMMIT manual (o SQL Editor do Supabase
-- ja embrulha cada execucao num BEGIN/COMMIT proprio -- foi por isso que o
-- 192 deu "invalid transaction termination": nao da pra commitar dentro de
-- uma transacao que o proprio editor ja controla).
--
-- COMO RODAR:
--   1) Rode a ETAPA 0 uma vez (staging).
--   2) Para cada DELETE das etapas 1-4: clique "Run" repetidas vezes no
--      MESMO comando ate o resultado mostrar "0 rows affected" (ou a
--      contagem parar de cair no SELECT de conferencia). Cada clique apaga
--      no maximo 5000 linhas e ja fica salvo (commit automatico do editor),
--      entao se a conexao cair no meio, so continue clicando -- nada se
--      perde nem duplica.
--   3) Os deletes de *_import_batches (1e/2e/3e/4e) sao pequenos (no
--      maximo 165 linhas), um clique resolve.

-- =============================================================================
-- ETAPA 0 — staging com os lotes superados
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
-- ETAPA 1 — actuals (clique repetidas vezes em cada delete ate dar 0 linhas)
-- =============================================================================
-- 1a
delete from public.actuals_ledger_audit
where ctid in (
  select ctid from public.actuals_ledger_audit
  where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals')
  limit 5000
);

-- 1b
delete from public.actuals_import_row_audit
where ctid in (
  select ctid from public.actuals_import_row_audit
  where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals')
  limit 5000
);

-- 1c
delete from public.actuals_import_batch_audit
where ctid in (
  select ctid from public.actuals_import_batch_audit
  where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals')
  limit 5000
);

-- 1d — lotes em si (poucas linhas; cascata apaga as import_rows sozinha)
delete from public.actuals_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');


-- =============================================================================
-- ETAPA 2 — budget
-- =============================================================================
-- 2a
delete from public.budget_ledger_audit
where ctid in (
  select ctid from public.budget_ledger_audit
  where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget')
  limit 5000
);

-- 2b
delete from public.budget_import_row_audit
where ctid in (
  select ctid from public.budget_import_row_audit
  where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget')
  limit 5000
);

-- 2c
delete from public.budget_import_batch_audit
where ctid in (
  select ctid from public.budget_import_batch_audit
  where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget')
  limit 5000
);

-- 2d
delete from public.budget_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');


-- =============================================================================
-- ETAPA 3 — comercial realizado
-- =============================================================================
-- 3a
delete from public.comercial_realizado_ledger_audit
where ctid in (
  select ctid from public.comercial_realizado_ledger_audit
  where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado')
  limit 5000
);

-- 3b
delete from public.comercial_realizado_row_audit
where ctid in (
  select ctid from public.comercial_realizado_row_audit
  where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado')
  limit 5000
);

-- 3c
delete from public.comercial_realizado_batch_audit
where ctid in (
  select ctid from public.comercial_realizado_batch_audit
  where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado')
  limit 5000
);

-- 3d
delete from public.comercial_realizado_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');


-- =============================================================================
-- ETAPA 4 — comercial planejado (volumes pequenos, provavelmente 1 clique basta)
-- =============================================================================
-- 4a
delete from public.comercial_planejado_ledger_audit
where ctid in (
  select ctid from public.comercial_planejado_ledger_audit
  where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado')
  limit 5000
);

-- 4b
delete from public.comercial_planejado_row_audit
where ctid in (
  select ctid from public.comercial_planejado_row_audit
  where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado')
  limit 5000
);

-- 4c
delete from public.comercial_planejado_batch_audit
where ctid in (
  select ctid from public.comercial_planejado_batch_audit
  where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado')
  limit 5000
);

-- 4d
delete from public.comercial_planejado_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');


-- =============================================================================
-- ETAPA X (rode a qualquer momento) — conferencia de quanto ainda falta
-- =============================================================================
select
  (select count(*) from public.actuals_ledger_audit where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals')) as actuals_ledger_audit_restante,
  (select count(*) from public.actuals_import_row_audit where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals')) as actuals_row_audit_restante,
  (select count(*) from public.actuals_import_batch_audit where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals')) as actuals_batch_audit_restante,
  (select count(*) from public.budget_ledger_audit where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget')) as budget_ledger_audit_restante,
  (select count(*) from public.budget_import_row_audit where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget')) as budget_row_audit_restante,
  (select count(*) from public.budget_import_batch_audit where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget')) as budget_batch_audit_restante;


-- =============================================================================
-- ETAPA 5 — limpeza da staging e conferencia final de tamanho
-- =============================================================================
drop table if exists public._cargas_superadas_cleanup;

select
  relname as tabela,
  pg_size_pretty(pg_total_relation_size(relid)) as tamanho,
  n_live_tup as linhas_vivas
from pg_stat_user_tables
where schemaname = 'public'
order by pg_total_relation_size(relid) desc
limit 15;

-- ETAPA 6 (opcional, fora do horario de pico) — devolve espaco ao disco:
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
