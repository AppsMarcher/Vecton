-- Versao "por etapas" do 065, para rodar no SQL Editor do Supabase sem
-- estourar o timeout do proxy (o script original juntava tudo numa
-- transacao so e varria ~2GB de tabelas de auditoria de uma vez).
--
-- COMO RODAR: selecione UM bloco (-- ETAPA N) de cada vez no SQL Editor e
-- clique em "Run". Espere terminar antes de ir pro proximo. Nao precisa
-- rodar tudo de uma sentada; a tabela de staging fica salva entre as
-- etapas.

-- =============================================================================
-- ETAPA 0 — materializa os lotes superados numa tabela de staging (rapido:
-- so varre as *_import_rows, que sao pequenas, nao as tabelas de auditoria).
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

-- confira antes de seguir: deve mostrar 17 / 69 / 72 / 7
select familia, count(*) from public._cargas_superadas_cleanup group by familia;


-- =============================================================================
-- ETAPA 1 — actuals: 3 deletes de auditoria, cada um sozinho
-- =============================================================================
delete from public.actuals_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

-- ETAPA 1b
delete from public.actuals_import_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

-- ETAPA 1c
delete from public.actuals_import_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');

-- ETAPA 1d — apaga os lotes (cascata apaga as actuals_import_rows sozinha)
delete from public.actuals_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');


-- =============================================================================
-- ETAPA 2 — budget
-- =============================================================================
delete from public.budget_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');

-- ETAPA 2b
delete from public.budget_import_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');

-- ETAPA 2c
delete from public.budget_import_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');

-- ETAPA 2d
delete from public.budget_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');


-- =============================================================================
-- ETAPA 3 — comercial realizado
-- =============================================================================
delete from public.comercial_realizado_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');

-- ETAPA 3b
delete from public.comercial_realizado_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');

-- ETAPA 3c
delete from public.comercial_realizado_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');

-- ETAPA 3d
delete from public.comercial_realizado_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');


-- =============================================================================
-- ETAPA 4 — comercial planejado
-- =============================================================================
delete from public.comercial_planejado_ledger_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');

-- ETAPA 4b
delete from public.comercial_planejado_row_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');

-- ETAPA 4c
delete from public.comercial_planejado_batch_audit
where batch_id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');

-- ETAPA 4d
delete from public.comercial_planejado_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');


-- =============================================================================
-- ETAPA 5 — limpeza da staging e conferencia final
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

-- =============================================================================
-- ETAPA 6 (opcional, fora do horario de pico — trava a tabela por instantes)
-- devolve o espaco em disco ao SO. Rode uma tabela de cada vez se travar.
-- =============================================================================
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
