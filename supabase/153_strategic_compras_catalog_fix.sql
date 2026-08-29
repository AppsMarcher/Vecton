begin;

-- ============================================================================
-- Fix (usuário, 2026-08-29): fecha o lote Supply Chain/filhos.
--
-- 1) payment_term_days ("Prazo de Pagamento", genérico) muda de dono —
--    era primary de Supply Chain (raiz), passa a ser primary de Compras.
--    Confirmado com o usuário: é DIFERENTE de supplier_a_payment_term
--    ("Prazo Médio de Pagamento — Fornecedores A", já primary de Compras)
--    — os dois coexistem, um é geral (todos os fornecedores), o outro só
--    a curva A. Com isso + a 152 (stockout_hours), o Consolidado de
--    Supply Chain (raiz) fica só com CPV + Giro de Estoque, como pedido.
--
-- 2) Cria "% Saving / Receita Líquida" (raw_material_saving_pct) — não
--    existia no catálogo. Confirmado com o usuário: entry_mode='direct'
--    (digitado manualmente todo mês, mesmo padrão do R$ Saving Fornecedores
--    que já é direct), accumulation_method='average' (mesmo padrão dos
--    outros KPIs percentuais de Compras, ex.: overprice_index_pct),
--    comparison_mode='higher' (mais saving % é melhor).
--
-- 3) Reordena Compras conforme a lista do usuário: Saving Matéria-Prima(1),
--    % Saving/Receita Líquida(2), Paradas por Falta de Material — linked,
--    dono real Estoques(3), Prazo de Pagamento(4), IQF Fornecedores A(5),
--    IQF Geral(6), % Compras Emergenciais(7); os 4 não citados (Prazo
--    Fornecedores A, % Contrato Curva A, % Índice de Sobrepreço, % Índice
--    de Sobrepreço sobre Total) mantêm a ordem relativa que já tinham,
--    empurrados pro final (8-11).
-- ============================================================================

-- --- payment_term_days: Supply Chain -> Compras -------------------------------
update public.strategic_kpis k
set primary_a3_id = a3.id
from public.strategic_a3 a3
where a3.code = 'compras' and k.code = 'payment_term_days';

delete from public.strategic_a3_kpis ak
using public.strategic_a3 a3, public.strategic_kpis k
where ak.a3_id = a3.id and ak.kpi_id = k.id
  and a3.code = 'supply_chain' and k.code = 'payment_term_days';

insert into public.strategic_a3_kpis (a3_id, kpi_id, relationship_type)
select a3.id, k.id, 'primary'
from public.strategic_a3 a3, public.strategic_kpis k
where a3.code = 'compras' and k.code = 'payment_term_days'
  and not exists (
    select 1 from public.strategic_a3_kpis link where link.a3_id = a3.id and link.kpi_id = k.id
  );

-- --- Novo KPI: % Saving / Receita Líquida -------------------------------------
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
target_cycle as (
  select c.id, c.organization_id
  from public.strategic_cycles c, target_org o
  where c.organization_id = o.id and c.year = 2026
  limit 1
),
compras_area as (
  select a.id from public.strategic_a3 a, target_cycle tc
  where a.cycle_id = tc.id and a.code = 'compras'
  limit 1
)
insert into public.strategic_kpis (
  organization_id, cycle_id, primary_a3_id, code, name, unit, decimal_places,
  entry_mode, monthly_calculation, accumulation_method, comparison_mode, formula_config, is_active, display_order
)
select tc.organization_id, tc.id, ca.id,
  'raw_material_saving_pct', '% Saving / Receita Líquida', 'percent', 1,
  'direct', 'direct', 'average', 'higher', '{}'::jsonb, true, 2
from target_cycle tc
join compras_area ca on true
where not exists (
  select 1 from public.strategic_kpis k where k.cycle_id = tc.id and k.code = 'raw_material_saving_pct'
);

insert into public.strategic_a3_kpis (a3_id, kpi_id, relationship_type, display_order)
select k.primary_a3_id, k.id, 'primary', k.display_order
from public.strategic_kpis k
where k.code = 'raw_material_saving_pct'
  and not exists (
    select 1 from public.strategic_a3_kpis link where link.a3_id = k.primary_a3_id and link.kpi_id = k.id
  );

-- --- Reordena Compras ----------------------------------------------------------
update public.strategic_kpis set display_order = 1 where code = 'raw_material_saving';
update public.strategic_kpis set display_order = 2 where code = 'raw_material_saving_pct';
update public.strategic_kpis set display_order = 4 where code = 'payment_term_days';
update public.strategic_kpis set display_order = 5 where code = 'supplier_a_iqf';
update public.strategic_kpis set display_order = 6 where code = 'general_iqf';
update public.strategic_kpis set display_order = 7 where code = 'emergency_purchases_pct';
update public.strategic_kpis set display_order = 8 where code = 'supplier_a_payment_term';
update public.strategic_kpis set display_order = 9 where code = 'curve_a_contract_pct';
update public.strategic_kpis set display_order = 10 where code = 'overprice_index_pct';
update public.strategic_kpis set display_order = 11 where code = 'overprice_of_total_purchases_pct';

update public.strategic_a3_kpis ak
set display_order = k.display_order
from public.strategic_kpis k
where ak.kpi_id = k.id and ak.relationship_type = 'primary'
  and k.code in ('raw_material_saving', 'raw_material_saving_pct', 'payment_term_days',
                 'supplier_a_iqf', 'general_iqf', 'emergency_purchases_pct',
                 'supplier_a_payment_term', 'curve_a_contract_pct', 'overprice_index_pct',
                 'overprice_of_total_purchases_pct');

-- stockout_hours (linked em Compras, migration 152) — posição 3, entre o
-- novo KPI e o Prazo de Pagamento.
update public.strategic_a3_kpis ak
set display_order = 3
from public.strategic_a3 a3, public.strategic_kpis k
where ak.a3_id = a3.id and ak.kpi_id = k.id
  and ak.relationship_type = 'linked' and a3.code = 'compras' and k.code = 'stockout_hours';

commit;
