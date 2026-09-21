-- Versao "em lotes pequenos" do 191, pra reduzir a duracao de cada request
-- individual e permitir retomar do ponto onde parou se a conexao cair no
-- meio (o Failed to fetch do painel derrubou ate a Etapa 0, que ja era leve
-- -- entao pode ser so instabilidade da conexao com o painel, mas isso aqui
-- nao tem contraindicacao: e estritamente mais seguro que o 191).
--
-- COMO RODAR: um bloco (-- ETAPA N) de cada vez. Se um CALL falhar/cair no
-- meio, so rode o MESMO CALL de novo -- ele retoma sozinho, nao duplica
-- nem perde o que ja foi apagado (cada chunk de 5000 linhas comita antes
-- de pegar o proximo).

-- =============================================================================
-- ETAPA 0 — staging com os lotes superados (igual ao 191)
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
-- ETAPA 0b — procedure generica de delete em lotes com commit incremental
-- =============================================================================

create or replace procedure public._cleanup_delete_by_batch(
  target_table text,
  batch_col text,
  target_familia text,
  chunk_size int default 5000
)
language plpgsql
as $$
declare
  deleted_count int;
  total_deleted int := 0;
begin
  loop
    execute format(
      'delete from public.%I
       where ctid in (
         select ctid from public.%I
         where %I in (select batch_id from public._cargas_superadas_cleanup where familia = %L)
         limit %s
       )',
      target_table, target_table, batch_col, target_familia, chunk_size
    );
    get diagnostics deleted_count = row_count;
    total_deleted := total_deleted + deleted_count;
    commit;
    raise notice '% / %: % linhas apagadas neste lote (% no total ate agora)',
      target_table, target_familia, deleted_count, total_deleted;
    exit when deleted_count = 0;
  end loop;
end;
$$;


-- =============================================================================
-- ETAPA 1 — actuals (rode cada CALL em separado; reexecute se cair no meio)
-- =============================================================================
call public._cleanup_delete_by_batch('actuals_ledger_audit', 'batch_id', 'actuals');
-- ETAPA 1b
call public._cleanup_delete_by_batch('actuals_import_row_audit', 'batch_id', 'actuals');
-- ETAPA 1c
call public._cleanup_delete_by_batch('actuals_import_batch_audit', 'batch_id', 'actuals');
-- ETAPA 1d — lotes em si (poucas linhas, sem necessidade de chunk; cascata apaga as rows)
delete from public.actuals_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'actuals');


-- =============================================================================
-- ETAPA 2 — budget
-- =============================================================================
call public._cleanup_delete_by_batch('budget_ledger_audit', 'batch_id', 'budget');
-- ETAPA 2b
call public._cleanup_delete_by_batch('budget_import_row_audit', 'batch_id', 'budget');
-- ETAPA 2c
call public._cleanup_delete_by_batch('budget_import_batch_audit', 'batch_id', 'budget');
-- ETAPA 2d
delete from public.budget_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'budget');


-- =============================================================================
-- ETAPA 3 — comercial realizado
-- =============================================================================
call public._cleanup_delete_by_batch('comercial_realizado_ledger_audit', 'batch_id', 'comercial_realizado');
-- ETAPA 3b
call public._cleanup_delete_by_batch('comercial_realizado_row_audit', 'batch_id', 'comercial_realizado');
-- ETAPA 3c
call public._cleanup_delete_by_batch('comercial_realizado_batch_audit', 'batch_id', 'comercial_realizado');
-- ETAPA 3d
delete from public.comercial_realizado_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_realizado');


-- =============================================================================
-- ETAPA 4 — comercial planejado
-- =============================================================================
call public._cleanup_delete_by_batch('comercial_planejado_ledger_audit', 'batch_id', 'comercial_planejado');
-- ETAPA 4b
call public._cleanup_delete_by_batch('comercial_planejado_row_audit', 'batch_id', 'comercial_planejado');
-- ETAPA 4c
call public._cleanup_delete_by_batch('comercial_planejado_batch_audit', 'batch_id', 'comercial_planejado');
-- ETAPA 4d
delete from public.comercial_planejado_import_batches
where id in (select batch_id from public._cargas_superadas_cleanup where familia = 'comercial_planejado');


-- =============================================================================
-- ETAPA 5 — limpeza e conferencia final
-- =============================================================================
drop procedure if exists public._cleanup_delete_by_batch(text, text, text, int);
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
