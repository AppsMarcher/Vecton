begin;

-- Índice para o drilldown do DRE Societário Planejado.
-- O fetch busca por (organization_id, reference_year, reference_month) ordenando
-- por id com paginação. Sem o id no índice, o Postgres ordena em memória a cada
-- página (offset profundo → O(n²) → 90-120s). Com o id como última coluna do
-- índice, a leitura já vem ordenada e a paginação fica rápida — espelha o que o
-- realizado (actuals_ledger_entries) já tem com entry_date.
create index if not exists idx_budget_ledger_org_period_id
  on public.budget_ledger_entries (organization_id, reference_year, reference_month, id);

commit;
