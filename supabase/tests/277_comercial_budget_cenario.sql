-- Verificação da migration 277. Somente leitura.

-- A) ANTES de aplicar (guarde o resultado): meta por cenário e mês de 2026.
select coalesce(s.name, '(Budget: scenario_id nulo)') as cenario, le.reference_month, count(*) as linhas, sum(le.valor) as total
  from public.comercial_planejado_ledger_entries le
  left join public.forecast_scenarios s on s.id = le.scenario_id
 where le.reference_year = 2026
 group by 1, 2
 order by 1, 2;

-- B) DEPOIS de aplicar: não pode sobrar Budget com scenario_id nulo. Esperado: 0 e 0.
select count(*) as ledger_sem_cenario from public.comercial_planejado_ledger_entries where scenario_id is null;
select count(*) as lotes_sem_cenario from public.comercial_planejado_import_batches where scenario_id is null;

-- C) DEPOIS: o "Budget 2026" tem as mesmas 658 linhas que o antigo scenario_id nulo,
--    e o Fcst 5+7 2026 continua com 595. O total por mês deve bater com o resultado de A.
select s.name as cenario, count(*) as linhas, sum(le.valor) as total
  from public.comercial_planejado_ledger_entries le
  join public.forecast_scenarios s on s.id = le.scenario_id
 where le.reference_year = 2026
 group by 1
 order by 1;
