begin;

-- ============================================================================
-- Pedido do usuário (2026-08-29), fecha a regra iniciada nas migrations 169
-- (Pessoas) e 170 (demais 'drivers'): os KPIs que ainda usam entry_mode=
-- 'breakdown' (painel de linhas livres — descrição + planejado + real, às
-- vezes com peso) também viram entry_mode='direct', campo único de "Real".
--
-- Confirmado explicitamente com o usuário: NÃO inclui os KPIs entry_mode=
-- 'computed' (EBITDA%, Faturamento, CPV%, GGF%, Custo MO etc.) — esses
-- continuam calculando sozinhos a partir do DRE gerencial / ledger
-- comercial / headcount, sem digitação manual. A regra "tudo vira direct"
-- vale só pra composição MANUAL (drivers e breakdown), não pra cálculo
-- automático do sistema.
--
-- KPIs afetados (12, incluindo 4 hoje is_active=false — convertidos por
-- completude do catálogo, sem efeito prático enquanto inativos):
--   forecast_accuracy_general        (comercial, inativo)
--   forecast_accuracy_grains         (comercial, inativo)
--   forecast_accuracy_livestock      (comercial, inativo)
--   mix_assertiveness                (comercial, inativo)
--   pilot_batch_downtime             (areas_tecnicas)
--   customer_satisfaction_new_product(produto)
--   critical_machines_revenue_pct    (produto)
--   new_products_revenue_pct         (produto)
--   direct_channel_pct               (marketing)
--   market_intelligence_structuring_pct (marketing)
--   sales_funnel_standardization_pct (marketing)
--   project_deadline_adherence_pct   (engenharia)
--
-- Depois desta migration, entry_mode='breakdown' não é mais usado por
-- nenhum KPI do catálogo 2026 — só restam 'direct' e 'computed'.
--
-- Mesmo critério das 169/170: só troca entry_mode no catálogo
-- (strategic_kpis). strategic_kpi_breakdown_rows (linhas já lançadas em
-- meses anteriores) fica intacta no banco, só sai de uso. result_value (o
-- resultado já calculado pela composição) não muda — é lido pelas RPCs
-- independente de entry_mode (ver 131), então o campo "Real" nasce
-- pré-preenchido com o último valor calculado, editável dali pra frente.
-- Meses fechados (snapshot) não são afetados.
-- ============================================================================

update public.strategic_kpis
set entry_mode = 'direct'
where code in (
  'forecast_accuracy_general',
  'forecast_accuracy_grains',
  'forecast_accuracy_livestock',
  'mix_assertiveness',
  'pilot_batch_downtime',
  'customer_satisfaction_new_product',
  'critical_machines_revenue_pct',
  'new_products_revenue_pct',
  'direct_channel_pct',
  'market_intelligence_structuring_pct',
  'sales_funnel_standardization_pct',
  'project_deadline_adherence_pct'
)
and entry_mode = 'breakdown';

commit;
