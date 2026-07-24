-- Diagnostico (nao e migration): total da Meta (planejado) gravada no
-- cenario Budget (scenario_id nulo) em 2026, em R$.

-- 1) Total geral do ano.
select
  sum(m.valor) as meta_budget_total_2026,
  count(*) as linhas
from public.comercial_planejado_ledger_entries m
where m.scenario_id is null
  and m.reference_year = 2026;

-- 2) Quebra por mes, pra ver onde tem e onde falta.
select
  m.reference_month,
  count(*) as linhas,
  sum(m.valor) as meta_total
from public.comercial_planejado_ledger_entries m
where m.scenario_id is null
  and m.reference_year = 2026
group by m.reference_month
order by m.reference_month;

-- 3) Quebra por mes + tipo de produto, pra confirmar especificamente onde
--    Maquinas esta faltando (o que estavamos investigando).
select
  m.reference_month,
  t.nome as tipo_produto,
  count(*) as linhas,
  sum(m.valor) as meta_total
from public.comercial_planejado_ledger_entries m
join public.comercial_produtos p on p.id = m.produto_id
join public.comercial_tipos t on t.id = p.tipo_id
where m.scenario_id is null
  and m.reference_year = 2026
group by m.reference_month, t.nome
order by m.reference_month, t.nome;
