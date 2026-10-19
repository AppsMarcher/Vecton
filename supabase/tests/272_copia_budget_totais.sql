-- Verificação da migration 272. Somente leitura. Rodar DEPOIS de aplicar a 271 e a 272.

-- A) Diferenças de totais conta × mês: Budget antigo x cenário "Budget {ano}"
--    (tabela de totais do cenário). Esperado: 0 linhas.
with antigo as (
  select organization_id, reference_year, reference_month, account_number,
         sum(amount) as total
    from public.budget_ledger_entries
   group by 1, 2, 3, 4
),
novo as (
  select t.organization_id, t.reference_year, t.reference_month, t.account_number,
         t.total_amount as total
    from public.forecast_monthly_account_totals t
    join public.forecast_scenarios s on s.id = t.scenario_id
   where s.name = 'Budget ' || t.reference_year
)
select coalesce(a.organization_id, n.organization_id) as organization_id,
       coalesce(a.reference_year, n.reference_year) as reference_year,
       coalesce(a.reference_month, n.reference_month) as reference_month,
       coalesce(a.account_number, n.account_number) as account_number,
       a.total as total_antigo,
       n.total as total_novo
  from antigo a
  full join novo n
    on n.organization_id = a.organization_id
   and n.reference_year = a.reference_year
   and n.reference_month = a.reference_month
   and n.account_number = a.account_number
 where coalesce(a.total, 0) <> coalesce(n.total, 0);

-- B) Contagem e soma por ano: antigo x ledger do cenário. Esperado: valores iguais nos dois lados.
select 'antigo' as origem, reference_year, count(*) as linhas, sum(amount) as total
  from public.budget_ledger_entries
 group by reference_year
union all
select 'cenario', f.reference_year, count(*), sum(f.amount)
  from public.forecast_ledger_entries f
  join public.forecast_scenarios s on s.id = f.scenario_id
 where s.name = 'Budget ' || f.reference_year
 group by f.reference_year
order by reference_year, origem;

-- C) Idempotência: após rodar a 272 uma segunda vez, B deve ficar idêntico
--    (sem dobrar as linhas) e este número deve ser 1 cenário por ano de Budget.
select reference_year, count(*) as cenarios_budget
  from public.forecast_scenarios
 where name = 'Budget ' || reference_year
 group by reference_year;
