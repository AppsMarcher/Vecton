-- ETAPA 4 — finalizacao. Cole o arquivo INTEIRO e rode.
-- Remove a tabela auxiliar de staging e mostra o tamanho atual de cada
-- tabela (pra comparar com o antes: banco tinha 2597 MB no total).

drop table if exists public._cargas_superadas_cleanup;

select
  relname as tabela,
  pg_size_pretty(pg_total_relation_size(relid)) as tamanho,
  n_live_tup as linhas_vivas,
  n_dead_tup as linhas_mortas
from pg_stat_user_tables
where schemaname = 'public'
order by pg_total_relation_size(relid) desc
limit 15;
