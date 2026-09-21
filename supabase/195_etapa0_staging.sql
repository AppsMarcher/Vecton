-- ETAPA 0 da limpeza de cargas sobrepostas.
-- Cole o arquivo INTEIRO no SQL Editor do Supabase e clique em Run.
-- Isso so cria uma tabelinha auxiliar com a lista dos lotes de importacao
-- que ja foram substituidos por recargas mais novas -- nao apaga nada
-- ainda.
--
-- Resultado esperado no final: uma tabela com 4 linhas, tipo:
--   actuals               | 17
--   budget                | 69
--   comercial_realizado   | 72
--   comercial_planejado   | 7

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
