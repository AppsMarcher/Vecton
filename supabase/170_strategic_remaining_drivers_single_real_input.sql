begin;

-- ============================================================================
-- Pedido do usuário (2026-08-29), sequência da migration 169: os 5 KPIs que
-- ainda restavam com entry_mode='drivers' no catálogo inteiro (fora os de
-- Pessoas, já convertidos) viram entry_mode='direct' também — de marketing
-- a áreas técnicas e pecuária, mesma decisão: o cálculo (numerador/
-- denominador) passa a ser feito FORA da ferramenta, aqui só se digita o
-- percentual/índice final num campo único.
--
-- KPIs afetados:
--   customer_knowledge_pct        (marketing)       — Conhecimento do Cliente Final
--   inventory_turnover            (supply_chain)     — Giro de Estoque
--   warranty_index_general        (areas_tecnicas)   — Índice de Garantia Geral
--   warranty_index_new_products   (areas_tecnicas)   — Índice de Garantia Produtos Novos
--   livestock_warranty_index      (pecuaria)         — Índice de Garantia Pecuária
--
-- Depois desta migration, entry_mode='drivers' não é mais usado por nenhum
-- KPI ativo do catálogo 2026 (só entry_mode em ('direct','computed',
-- 'breakdown') seguem em uso).
--
-- Mesmo escopo/critérios da 169: só troca entry_mode no catálogo
-- (strategic_kpis). strategic_kpi_drivers (definição dos direcionadores) e
-- strategic_kpi_record_inputs (numerador/denominador já lançados em meses
-- anteriores) ficam intactos no banco, só saem de uso. result_value
-- (a % já calculada) não muda — é lido pelas RPCs independente de
-- entry_mode (ver 131), então o campo "Real" nasce pré-preenchido com o
-- último valor calculado, editável dali pra frente. Meses fechados
-- (snapshot) não são afetados. monthly_calculation permanece 'ratio'
-- (config órfã pra entry_mode='direct', igual já acontecia com
-- export_share_pct/parts_share_pct antes desta leva).
-- ============================================================================

update public.strategic_kpis
set entry_mode = 'direct'
where code in (
  'customer_knowledge_pct',
  'inventory_turnover',
  'warranty_index_general',
  'warranty_index_new_products',
  'livestock_warranty_index'
)
and entry_mode = 'drivers';

commit;
