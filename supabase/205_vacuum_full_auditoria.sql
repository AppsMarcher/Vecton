-- VACUUM FULL nas tabelas de auditoria, pra devolver o espaco em disco
-- liberado pela limpeza (195-204) de verdade.
--
-- IMPORTANTE: cada VACUUM FULL trava a tabela por completo (leitura E
-- escrita) enquanto roda. Faca isso fora do horario de uso do sistema.
--
-- VACUUM nao pode rodar dentro de transacao. Se o SQL Editor reclamar
-- "VACUUM cannot run inside a transaction block" ao colar tudo junto, rode
-- cada linha em separado (selecione so ela, Run, espera, proxima linha).

vacuum (full, analyze) public.actuals_import_row_audit;
vacuum (full, analyze) public.actuals_ledger_audit;
vacuum (full, analyze) public.actuals_import_batch_audit;
vacuum (full, analyze) public.budget_import_batch_audit;
vacuum (full, analyze) public.budget_import_row_audit;
vacuum (full, analyze) public.comercial_realizado_ledger_audit;
vacuum (full, analyze) public.budget_ledger_audit;
vacuum (full, analyze) public.comercial_realizado_row_audit;
vacuum (full, analyze) public.comercial_realizado_batch_audit;
vacuum (full, analyze) public.comercial_planejado_ledger_audit;
vacuum (full, analyze) public.comercial_planejado_batch_audit;
vacuum (full, analyze) public.comercial_planejado_row_audit;

-- conferencia final: compare com os tamanhos de antes (452/414/412/225/202/
-- 153/116/85/72/11MB/8312kB/6528kB)
select
  relname as tabela,
  pg_size_pretty(pg_total_relation_size(relid)) as tamanho_depois
from pg_stat_user_tables
where schemaname = 'public'
  and relname like '%_audit'
order by pg_total_relation_size(relid) desc;
