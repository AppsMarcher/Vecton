-- Seed do catálogo A3 - Gestão Estratégica, ciclo 2026.
-- Espelha tools/strategic-a3-catalog-2026.json linha a linha — qualquer
-- KPI novo/alterado deve entrar nos dois lugares.
--
-- NÃO inclui os dados históricos da planilha (Realizado 2023-2025 completo,
-- resultados mensais de 2026) — isso é a Etapa 6 (tools/import-strategic-2026.mjs,
-- com --dry-run obrigatório antes de aplicar). Só semeei os 2 benchmarks que
-- já extraí com confiança da planilha (Faturamento e Volume do Comercial).
--
-- 6 KPIs de forecast/mix entram com is_active=false (fórmula pendente,
-- decisão de não inventar — ver especificação §5/§12) e 2 de prazo de
-- pagamento com nota de direção a confirmar (comparison_mode='higher' por
-- default, revisar com Compras/Supply Chain).
begin;

with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
)
insert into public.strategic_cycles (organization_id, year, name, status)
select o.id, 2026, 'Ciclo 2026', 'active'
from target_org o
where not exists (
  select 1 from public.strategic_cycles c where c.organization_id = o.id and c.year = 2026
);

-- ============================================================================
-- Norte Verdadeiro
-- ============================================================================
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
target_cycle as (
  select c.id, c.organization_id
  from public.strategic_cycles c, target_org o
  where c.organization_id = o.id and c.year = 2026
  limit 1
),
seed_rows (code, title, target_label, display_order) as (
  values
    ('net_revenue',      'Receita Líquida',       'R$ 200 milhões',                                       1),
    ('livestock_revenue','Pecuária',               'R$ 40 milhões',                                        2),
    ('export_revenue',   'Exportação',             'R$ 10 milhões',                                        3),
    ('ebitda_target',    'EBITDA',                 'Superior a 20%',                                       4),
    ('career_growth',    'Trilha de Carreira',     'Oportunidade de crescimento de carreira para todos',   5),
    ('factory_scale',    'Capacidade Fabril',      'Fábrica adequada ao tamanho do mercado',                6)
)
insert into public.strategic_north_goals (organization_id, cycle_id, code, title, target_label, display_order)
select tc.organization_id, tc.id, s.code, s.title, s.target_label, s.display_order
from seed_rows s, target_cycle tc
where not exists (
  select 1 from public.strategic_north_goals g
  where g.cycle_id = tc.id and g.code = s.code
);

-- ============================================================================
-- A3 mães (parent_id null)
-- ============================================================================
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
target_cycle as (
  select c.id, c.organization_id
  from public.strategic_cycles c, target_org o
  where c.organization_id = o.id and c.year = 2026
  limit 1
),
-- Nomes já refletem as decisões obrigatórias #6/renomeação: "produto" era
-- "A3 PEP" na planilha, "areas_tecnicas" era "A3 Formação Área Técnica".
-- objective fica null por ora — a planilha original não tinha um texto de
-- objetivo por A3, só os indicadores; preencher depois com os donos de área.
seed_rows (code, name, color, display_order) as (
  values
    ('ebitda',         'EBITDA',         '#4f7cff', 1),
    ('comercial',      'Comercial',      '#14b8a6', 2),
    ('supply_chain',   'Supply Chain',   '#f59e0b', 3),
    ('fabril',         'Fabril',         '#8b5cf6', 4),
    ('produto',        'Produto',        '#f472b6', 5),
    ('areas_tecnicas', 'Áreas Técnicas', '#6366f1', 6),
    ('engenharia',     'Engenharia',     '#4f7cff', 7),
    ('marketing',      'Marketing',      '#fb923c', 8),
    ('pessoas',        'Pessoas',        '#a78bfa', 9)
)
insert into public.strategic_a3 (organization_id, cycle_id, parent_id, code, name, color, display_order)
select tc.organization_id, tc.id, null, s.code, s.name, s.color, s.display_order
from seed_rows s, target_cycle tc
where not exists (
  select 1 from public.strategic_a3 a where a.cycle_id = tc.id and a.code = s.code
);

-- ============================================================================
-- A3 filhos (parent_id resolvido pelo code da mãe)
-- ============================================================================
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
target_cycle as (
  select c.id, c.organization_id
  from public.strategic_cycles c, target_org o
  where c.organization_id = o.id and c.year = 2026
  limit 1
),
seed_rows (code, name, parent_code, display_order) as (
  values
    ('exportacao', 'Exportação', 'comercial',    1),
    ('pecuaria',   'Pecuária',   'comercial',    2),
    ('pecas',      'Peças',      'comercial',    3),
    ('estoques',   'Estoques',   'supply_chain', 1),
    ('compras',    'Compras',    'supply_chain', 2)
)
insert into public.strategic_a3 (organization_id, cycle_id, parent_id, code, name, color, display_order)
select tc.organization_id, tc.id, parent.id, s.code, s.name, parent.color, s.display_order
from seed_rows s
join target_cycle tc on true
join public.strategic_a3 parent on parent.cycle_id = tc.id and parent.code = s.parent_code
where not exists (
  select 1 from public.strategic_a3 a where a.cycle_id = tc.id and a.code = s.code
);

-- ============================================================================
-- Cenário padrão "Budget" — vigente
-- ============================================================================
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
target_cycle as (
  select c.id, c.organization_id
  from public.strategic_cycles c, target_org o
  where c.organization_id = o.id and c.year = 2026
  limit 1
)
insert into public.strategic_scenarios (organization_id, cycle_id, name, scenario_type, is_current)
select tc.organization_id, tc.id, 'Budget', 'original', true
from target_cycle tc
where not exists (
  select 1 from public.strategic_scenarios s where s.cycle_id = tc.id and s.is_current
);

-- ============================================================================
-- Catálogo de KPIs — espelha tools/strategic-a3-catalog-2026.json
-- Colunas: code, name, a3_code, unit, decimal_places, entry_mode,
--          monthly_calculation, accumulation_method, comparison_mode,
--          formula_config (jsonb), is_active, display_order
-- ============================================================================
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
target_cycle as (
  select c.id, c.organization_id
  from public.strategic_cycles c, target_org o
  where c.organization_id = o.id and c.year = 2026
  limit 1
),
seed_rows (code, name, a3_code, unit, decimal_places, entry_mode, monthly_calculation, accumulation_method, comparison_mode, formula_config, is_active, display_order) as (
  values
    ('ebitda_pct', 'EBITDA %', 'ebitda', 'percent', 1, 'computed', 'direct', 'ratio_of_sums', 'higher',
      '{"source":"dre_gerencial","report":"gerencial_real","line":"ebitdaPct","numeratorLine":"ebitda","denominatorLine":"receitaLiquida"}'::jsonb, true, 1),
    ('mc1_pct', 'MC1 %', 'ebitda', 'percent', 1, 'computed', 'direct', 'ratio_of_sums', 'higher',
      '{"source":"dre_gerencial","report":"gerencial_real","line":"lbPct","numeratorLine":"lucroBruto","denominatorLine":"receitaLiquida"}'::jsonb, true, 2),

    ('commercial_revenue', 'Faturamento', 'comercial', 'BRL', 0, 'computed', 'direct', 'sum', 'higher',
      '{"source":"comercial_ledger","table":"comercial_realizado_ledger_entries","origem":"FAT","field":"valor"}'::jsonb, true, 1),
    ('commercial_volume', 'Volume', 'comercial', 'un', 0, 'computed', 'direct', 'sum', 'higher',
      '{"source":"comercial_ledger","table":"comercial_realizado_ledger_entries","origem":"FAT","field":"quantidade"}'::jsonb, true, 2),
    ('forecast_accuracy_general', 'Acurácia de Forecast Geral', 'comercial', 'percent', 1, 'breakdown', 'forecast_accuracy', 'average', 'higher',
      '{}'::jsonb, false, 3),
    ('forecast_accuracy_grains', 'Acurácia de Forecast Grãos', 'comercial', 'percent', 1, 'breakdown', 'forecast_accuracy', 'average', 'higher',
      '{}'::jsonb, false, 4),
    ('forecast_accuracy_livestock', 'Acurácia de Forecast Pecuária', 'comercial', 'percent', 1, 'breakdown', 'forecast_accuracy', 'average', 'higher',
      '{}'::jsonb, false, 5),
    ('mix_assertiveness', 'Assertividade do Mix', 'comercial', 'percent', 1, 'breakdown', 'mix_accuracy', 'average', 'higher',
      '{}'::jsonb, false, 6),

    ('cogs_pct', 'CPV %', 'supply_chain', 'percent', 1, 'computed', 'direct', 'ratio_of_sums', 'lower',
      '{"source":"dre_gerencial","numeratorLines":["materiais","custosPessoal","demaisGGF","custoAbsorcao"],"denominatorLine":"receitaLiquida"}'::jsonb, true, 1),
    ('inventory_turnover', 'Giro de Estoque', 'supply_chain', 'x', 2, 'drivers', 'ratio', 'ratio_of_sums', 'higher', '{}'::jsonb, true, 2),
    ('stockout_hours', 'Paradas por Falta de Material', 'supply_chain', 'h', 1, 'direct', 'direct', 'sum', 'lower', '{}'::jsonb, true, 3),
    ('payment_term_days', 'Prazo de Pagamento', 'supply_chain', 'dias', 0, 'direct', 'direct', 'average', 'higher',
      '{"pending_confirmation":"direção não confirmada com Compras/Supply Chain"}'::jsonb, true, 4),

    ('oee_pct', 'OEE', 'fabril', 'percent', 1, 'direct', 'direct', 'average', 'higher', '{}'::jsonb, true, 1),
    ('ggf_general_pct', 'GGF Geral %', 'fabril', 'percent', 1, 'computed', 'direct', 'ratio_of_sums', 'lower',
      '{"source":"dre_gerencial","numeratorLines":["custosPessoal","demaisGGF"],"denominatorLine":"receitaLiquida"}'::jsonb, true, 2),
    ('ggf_production_pct', 'GGF Produção %', 'fabril', 'percent', 1, 'computed', 'direct', 'ratio_of_sums', 'lower',
      '{"source":"dre_gerencial","numeratorLines":["custosPessoal","demaisGGF"],"denominatorLine":"receitaLiquida","ccManagementFilter":"Industrial"}'::jsonb, true, 3),
    ('five_s_score', '5S', 'fabril', 'pts', 1, 'direct', 'direct', 'average', 'higher', '{}'::jsonb, true, 4),

    ('warranty_index_general', 'Índice de Garantia Geral', 'areas_tecnicas', 'percent', 1, 'drivers', 'ratio', 'ratio_of_sums', 'lower', '{}'::jsonb, true, 1),
    ('warranty_index_new_products', 'Índice de Garantia Produtos Novos', 'areas_tecnicas', 'percent', 1, 'drivers', 'ratio', 'ratio_of_sums', 'lower', '{}'::jsonb, true, 2),
    ('downtime_technical_areas', 'Tempo de Parada por Área Técnica', 'areas_tecnicas', 'h', 1, 'direct', 'direct', 'sum', 'lower', '{}'::jsonb, true, 3),
    ('customer_satisfaction_new_product_technical', 'Satisfação do Cliente no Produto Novo (Áreas Técnicas)', 'areas_tecnicas', 'percent', 1, 'direct', 'direct', 'average', 'higher', '{}'::jsonb, true, 4),
    ('pilot_batch_downtime', 'Tempo de Parada por Máquina no Lote Piloto', 'areas_tecnicas', 'h', 1, 'breakdown', 'weighted_average', 'weighted_average', 'lower', '{}'::jsonb, true, 5),

    ('customer_satisfaction_new_product', 'Satisfação do Cliente no Produto Novo (Produto)', 'produto', 'nps', 0, 'breakdown', 'weighted_average', 'average', 'higher', '{}'::jsonb, true, 1),
    ('critical_machines_revenue_pct', '% Máquinas Críticas sobre Faturamento', 'produto', 'percent', 1, 'breakdown', 'ratio', 'ratio_of_sums', 'lower', '{}'::jsonb, true, 2),
    ('new_products_revenue_pct', '% Produtos Novos sobre Faturamento', 'produto', 'percent', 1, 'breakdown', 'ratio', 'ratio_of_sums', 'higher', '{}'::jsonb, true, 3),

    ('direct_channel_pct', '% de Revendas com Canal Direto', 'marketing', 'percent', 1, 'breakdown', 'ratio', 'ratio_of_sums', 'higher', '{}'::jsonb, true, 1),
    ('market_intelligence_structuring_pct', '% Estruturação Inteligência de Mercado', 'marketing', 'percent', 1, 'breakdown', 'weighted_average', 'last_closed', 'higher', '{}'::jsonb, true, 2),
    ('customer_knowledge_pct', '% Conhecimento do Cliente Final', 'marketing', 'percent', 1, 'drivers', 'ratio', 'ratio_of_sums', 'higher', '{}'::jsonb, true, 3),
    ('sales_funnel_standardization_pct', 'Processo Padronizado para Funil de Vendas', 'marketing', 'percent', 1, 'breakdown', 'weighted_average', 'last_closed', 'higher', '{}'::jsonb, true, 4),

    ('project_deadline_adherence_pct', 'Aderência aos Prazos dos Projetos', 'engenharia', 'percent', 1, 'breakdown', 'weighted_average', 'average', 'higher', '{}'::jsonb, true, 1),
    ('project_error_downtime', 'Paradas de Produção por Erro de Projeto', 'engenharia', 'h', 1, 'direct', 'direct', 'sum', 'lower', '{}'::jsonb, true, 2),
    ('project_error_warranty', 'Garantia por Erro de Projeto', 'engenharia', 'percent', 1, 'direct', 'direct', 'average', 'lower', '{}'::jsonb, true, 3),
    ('item_variety_reduction_pct', 'Redução de Variedade de Itens (Comunização)', 'engenharia', 'percent', 1, 'direct', 'direct', 'last_closed', 'higher', '{}'::jsonb, true, 4),
    ('sku_value_reduction', 'Redução de SKU em Valores', 'engenharia', 'BRL', 0, 'direct', 'direct', 'sum', 'higher', '{}'::jsonb, true, 5),
    ('project_agreed_value', 'Atingir Valor Acordado para o Projeto', 'engenharia', 'BRL', 0, 'direct', 'direct', 'last_closed', 'exact_with_tolerance', '{}'::jsonb, true, 6),

    ('labor_cost', 'Custo MO', 'pessoas', 'BRL', 0, 'computed', 'direct', 'sum', 'lower',
      '{"source":"headcount_real","mode":"custo","scope":"total","fn":"buildHcRealReport"}'::jsonb, true, 1),
    ('turnover_pct', 'Turnover', 'pessoas', 'percent', 1, 'drivers', 'ratio', 'average', 'lower', '{}'::jsonb, true, 2),
    ('absenteeism_pct', 'Absenteísmo', 'pessoas', 'percent', 1, 'drivers', 'ratio', 'average', 'lower', '{}'::jsonb, true, 3),
    ('career_track_pct', 'Trilha de Carreira', 'pessoas', 'percent', 1, 'drivers', 'ratio', 'average', 'higher', '{}'::jsonb, true, 4),
    ('onboarding_pct', 'Onboarding', 'pessoas', 'percent', 1, 'drivers', 'ratio', 'average', 'higher', '{}'::jsonb, true, 5),
    ('feedback_pct', 'Feedback', 'pessoas', 'percent', 1, 'drivers', 'ratio', 'average', 'higher', '{}'::jsonb, true, 6),
    ('training_hours_management', 'Horas de Treinamento para Gestão', 'pessoas', 'h', 0, 'direct', 'direct', 'sum', 'higher', '{}'::jsonb, true, 7),
    ('training_hours_general', 'Horas de Treinamento Geral', 'pessoas', 'h', 0, 'direct', 'direct', 'sum', 'higher', '{}'::jsonb, true, 8),
    ('accidents_count', 'Acidentes', 'pessoas', 'un', 0, 'direct', 'direct', 'sum', 'lower', '{}'::jsonb, true, 9),
    ('employee_satisfaction', 'Satisfação dos Colaboradores', 'pessoas', 'percent', 1, 'direct', 'direct', 'last_closed', 'higher',
      '{"periodicity":"annual","note":"pesquisa 1x/ano — convenção: só dezembro recebe lançamento"}'::jsonb, true, 10),

    ('export_revenue', 'Faturamento Exportação', 'exportacao', 'BRL', 0, 'computed', 'direct', 'sum', 'higher',
      '{"source":"comercial_painel_vendas","coordenacao":"Exportação","field":"fat_val"}'::jsonb, true, 1),
    ('export_volume', 'Volume Exportação', 'exportacao', 'un', 0, 'computed', 'direct', 'sum', 'higher',
      '{"source":"comercial_painel_vendas","coordenacao":"Exportação","field":"fat_qtd"}'::jsonb, true, 2),
    ('new_dealers_count', 'Novas Revendas', 'exportacao', 'un', 0, 'direct', 'direct', 'sum', 'higher', '{}'::jsonb, true, 3),
    ('export_share_pct', '% Exportação sobre Faturamento Total', 'exportacao', 'percent', 1, 'direct', 'direct', 'ratio_of_sums', 'higher', '{}'::jsonb, true, 4),

    ('livestock_revenue', 'Faturamento Pecuária Nacional', 'pecuaria', 'BRL', 0, 'computed', 'direct', 'sum', 'higher',
      '{"source":"comercial_painel_vendas","coordenacao":"Pecuária","field":"fat_val"}'::jsonb, true, 1),
    ('livestock_volume', 'Volume 900/910', 'pecuaria', 'un', 0, 'computed', 'direct', 'sum', 'higher',
      '{"source":"comercial_painel_vendas","coordenacao":"Pecuária","field":"fat_qtd"}'::jsonb, true, 2),
    ('livestock_warranty_index', 'Índice de Garantia Pecuária', 'pecuaria', 'percent', 1, 'drivers', 'ratio', 'ratio_of_sums', 'lower', '{}'::jsonb, true, 3),

    ('parts_revenue', 'Faturamento Peças Nacional', 'pecas', 'BRL', 0, 'computed', 'direct', 'sum', 'higher',
      '{"source":"comercial_painel_vendas","coordenacao":"Peças","field":"fat_val"}'::jsonb, true, 1),
    ('parts_share_pct', '% Peças sobre Faturamento Total', 'pecas', 'percent', 1, 'direct', 'direct', 'ratio_of_sums', 'higher', '{}'::jsonb, true, 2),

    ('safety_stock_compliance_pct', 'Cumprimento de Estoque de Segurança', 'estoques', 'percent', 1, 'direct', 'direct', 'average', 'higher', '{}'::jsonb, true, 1),
    ('cyclic_inventory_accuracy_value_pct', 'Acurácia Inventário Cíclico (Valor)', 'estoques', 'percent', 1, 'direct', 'direct', 'average', 'higher', '{}'::jsonb, true, 2),
    ('cyclic_inventory_accuracy_items_pct', 'Acurácia Inventário Cíclico (Itens)', 'estoques', 'percent', 1, 'direct', 'direct', 'average', 'higher', '{}'::jsonb, true, 3),
    ('obsolete_stock', 'Obsoletos', 'estoques', 'BRL', 0, 'direct', 'direct', 'last_closed', 'lower', '{}'::jsonb, true, 4),
    ('general_inventory_accuracy_pct', 'Acurácia Inventário Geral', 'estoques', 'percent', 1, 'direct', 'direct', 'last_closed', 'higher',
      '{"periodicity":"annual"}'::jsonb, true, 5),

    ('supplier_a_payment_term', 'Prazo Médio de Pagamento — Fornecedores A', 'compras', 'dias', 0, 'direct', 'direct', 'average', 'higher',
      '{"pending_confirmation":"mesma ressalva de direção do payment_term_days"}'::jsonb, true, 1),
    ('supplier_a_iqf', 'IQF Fornecedores A', 'compras', 'percent', 1, 'direct', 'direct', 'average', 'higher', '{}'::jsonb, true, 2),
    ('general_iqf', 'IQF Geral', 'compras', 'percent', 1, 'direct', 'direct', 'average', 'higher', '{}'::jsonb, true, 3),
    ('raw_material_saving', 'Saving Matéria-Prima', 'compras', 'BRL', 0, 'direct', 'direct', 'sum', 'higher', '{}'::jsonb, true, 4),
    ('curve_a_contract_pct', '% de Fornecedores com Contrato Curva A', 'compras', 'percent', 1, 'direct', 'direct', 'average', 'higher', '{}'::jsonb, true, 5),
    ('emergency_purchases_pct', '% do Valor de Compras Emergenciais', 'compras', 'percent', 1, 'direct', 'direct', 'average', 'lower', '{}'::jsonb, true, 6),
    ('overprice_index_pct', '% do Índice de Sobrepreço', 'compras', 'percent', 1, 'direct', 'direct', 'average', 'lower', '{}'::jsonb, true, 7),
    ('overprice_of_total_purchases_pct', '% do Índice de Sobrepreço sobre Total de Compras', 'compras', 'percent', 1, 'direct', 'direct', 'average', 'lower', '{}'::jsonb, true, 8)
)
insert into public.strategic_kpis (organization_id, cycle_id, primary_a3_id, code, name, unit, decimal_places, entry_mode, monthly_calculation, accumulation_method, comparison_mode, formula_config, is_active, display_order)
select tc.organization_id, tc.id, a3.id, s.code, s.name, s.unit, s.decimal_places, s.entry_mode, s.monthly_calculation, s.accumulation_method, s.comparison_mode, s.formula_config, s.is_active, s.display_order
from seed_rows s
join target_cycle tc on true
join public.strategic_a3 a3 on a3.cycle_id = tc.id and a3.code = s.a3_code
where not exists (
  select 1 from public.strategic_kpis k where k.cycle_id = tc.id and k.code = s.code
);

-- ============================================================================
-- strategic_a3_kpis — vínculo primário (todo KPI no seu A3 dono)
-- ============================================================================
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
target_cycle as (
  select c.id, c.organization_id
  from public.strategic_cycles c, target_org o
  where c.organization_id = o.id and c.year = 2026
  limit 1
)
insert into public.strategic_a3_kpis (a3_id, kpi_id, relationship_type, display_order)
select k.primary_a3_id, k.id, 'primary', k.display_order
from public.strategic_kpis k
join target_cycle tc on tc.id = k.cycle_id
where not exists (
  select 1 from public.strategic_a3_kpis link
  where link.a3_id = k.primary_a3_id and link.kpi_id = k.id
);

-- ============================================================================
-- strategic_a3_kpis — vínculos "linked" (dedup real, ver §9 da especificação)
-- ============================================================================
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
target_cycle as (
  select c.id, c.organization_id
  from public.strategic_cycles c, target_org o
  where c.organization_id = o.id and c.year = 2026
  limit 1
),
seed_links (kpi_code, a3_code) as (
  values
    ('stockout_hours', 'estoques'),
    ('export_share_pct', 'comercial'),
    ('parts_share_pct', 'comercial')
)
insert into public.strategic_a3_kpis (a3_id, kpi_id, relationship_type)
select a3.id, k.id, 'linked'
from seed_links sl
join target_cycle tc on true
join public.strategic_a3 a3 on a3.cycle_id = tc.id and a3.code = sl.a3_code
join public.strategic_kpis k on k.cycle_id = tc.id and k.code = sl.kpi_code
where not exists (
  select 1 from public.strategic_a3_kpis link where link.a3_id = a3.id and link.kpi_id = k.id
);

-- ============================================================================
-- strategic_kpi_drivers — só KPIs entry_mode='drivers' (breakdown usa
-- strategic_kpi_breakdown_rows direto, sem driver de catálogo)
-- ============================================================================
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
target_cycle as (
  select c.id, c.organization_id
  from public.strategic_cycles c, target_org o
  where c.organization_id = o.id and c.year = 2026
  limit 1
),
seed_rows (kpi_code, driver_code, driver_name, driver_role, display_order) as (
  values
    ('inventory_turnover', 'cogs_ggf',       'CPV + GGF',                              'numerator',   1),
    ('inventory_turnover', 'avg_inventory',  'Estoque médio do mês',                    'denominator', 2),

    ('warranty_index_general', 'warranty_claims', 'Total de garantias do mês',          'numerator',   1),
    ('warranty_index_general', 'machines_sold',   'Total de máquinas vendidas / com TG', 'denominator', 2),

    ('warranty_index_new_products', 'warranty_claims_new', 'Total de garantias mês',           'numerator',   1),
    ('warranty_index_new_products', 'new_machines_sold',   'Total máquinas novas vendidas',    'denominator', 2),

    ('customer_knowledge_pct', 'nf_dealer_to_customer', 'NF emitidas revenda→cliente final', 'numerator',   1),
    ('customer_knowledge_pct', 'machines_from_marcher', 'Máquinas que saem da Marcher',       'denominator', 2),

    ('turnover_pct', 'admissions',      'Admissões',                          'numerator',   1),
    ('turnover_pct', 'terminations',    'Demissões',                          'numerator',   2),
    ('turnover_pct', 'headcount_total', 'Total colaboradores no período',     'denominator', 3),

    ('absenteeism_pct', 'absence_hours',  'Horas de ausência',        'numerator',   1),
    ('absenteeism_pct', 'expected_hours', 'Horas totais previstas',   'denominator', 2),

    ('career_track_pct', 'roles_with_track', 'Nº de cargos com trilha', 'numerator',   1),
    ('career_track_pct', 'roles_expected',   'Cargos previstos',        'denominator', 2),

    ('onboarding_pct', 'onboarded', 'Funcionários novos que completaram onboarding', 'numerator',   1),
    ('onboarding_pct', 'new_hires', 'Total de funcionários novos',                   'denominator', 2),

    ('feedback_pct', 'feedback_given',   'Funcionários que receberam feedback',    'numerator',   1),
    ('feedback_pct', 'feedback_planned', 'Feedbacks planejados para o mês',        'denominator', 2),

    ('livestock_warranty_index', 'warranty_claims_livestock', 'Garantias do mês em Pecuária',              'numerator',   1),
    ('livestock_warranty_index', 'livestock_machines_sold',   'Máquinas vendidas em Pecuária / com TG',    'denominator', 2)
)
insert into public.strategic_kpi_drivers (kpi_id, code, name, driver_role, display_order)
select k.id, s.driver_code, s.driver_name, s.driver_role, s.display_order
from seed_rows s
join target_cycle tc on true
join public.strategic_kpis k on k.cycle_id = tc.id and k.code = s.kpi_code
where not exists (
  select 1 from public.strategic_kpi_drivers d where d.kpi_id = k.id and d.code = s.driver_code
);

-- ============================================================================
-- Benchmarks anuais reais — só os 2 que extraí com confiança da planilha
-- (Faturamento e Volume do Comercial). Resto entra pela Etapa 6.
-- ============================================================================
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
target_cycle as (
  select c.id, c.organization_id
  from public.strategic_cycles c, target_org o
  where c.organization_id = o.id and c.year = 2026
  limit 1
),
seed_rows (kpi_code, reference_year, value) as (
  values
    ('commercial_revenue', 2023, 120000000),
    ('commercial_revenue', 2024, 65000000),
    ('commercial_revenue', 2025, 102000000),
    ('commercial_volume',  2023, 1276),
    ('commercial_volume',  2024, 670),
    ('commercial_volume',  2025, 986)
)
insert into public.strategic_kpi_benchmarks (kpi_id, reference_year, reference_type, value)
select k.id, s.reference_year, 'actual', s.value
from seed_rows s
join target_cycle tc on true
join public.strategic_kpis k on k.cycle_id = tc.id and k.code = s.kpi_code
where not exists (
  select 1 from public.strategic_kpi_benchmarks b
  where b.kpi_id = k.id and b.reference_year = s.reference_year and b.reference_type = 'actual'
);

commit;
