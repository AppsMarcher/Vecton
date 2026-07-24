begin;

-- Mesma correção do 022 (budget), agora para as demais tabelas que paginam
-- ordenando por id sob filtro (organization_id, reference_year, reference_month).
-- Sem o id no índice, o Postgres ordena em memória a cada página (offset
-- profundo → lentidão). Com o id como última coluna, a leitura já vem ordenada.

-- actuals_ledger_entries: usada pelo gasto operacional do dashboard
-- (fetchActualsLedgerWithCcForYear) e pelo OPEX por gestão
-- (fetchActualsLedgerForManagementYear), ambas com order=id.asc.
-- (O índice existente idx_actuals_ledger_org_period termina em entry_date,
--  então só cobre as queries que ordenam por entry_date — como o drilldown.)
create index if not exists idx_actuals_ledger_org_period_id
  on public.actuals_ledger_entries (organization_id, reference_year, reference_month, id);

-- headcount_entries: fetchHeadcountRealForYear / fetchHeadcountBudgetForYear,
-- também order=id.asc.
create index if not exists idx_headcount_entries_org_period_id
  on public.headcount_entries (organization_id, reference_year, reference_month, id);

commit;
