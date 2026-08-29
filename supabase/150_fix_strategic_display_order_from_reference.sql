begin;

-- ============================================================================
-- Fix (referência do usuário, 2026-08-29): ordem definitiva dos 9 A3-mãe
-- passada pelo usuário. Cruzada contra o catálogo — Supply Chain, Fabril,
-- Áreas Técnicas e Pessoas já batiam (nenhuma mudança); EBITDA já corrigido
-- na 149. Restam Comercial, Produto, Marketing e Engenharia abaixo.
--
-- Regra aplicada onde a lista do usuário é mais curta que o catálogo: os
-- itens citados vão pras primeiras posições, na ordem dada; o que sobra no
-- catálogo e NÃO foi citado mantém a ordem relativa que já tinha, só
-- empurrado pro final (nada foi removido/desativado, só reordenado).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Comercial: Faturamento, Volume, Acurácia do Forecast, Assertividade do
-- Mix. "Acurácia do Forecast" é ambíguo (3 variantes no catálogo: Geral/
-- Grãos/Pecuária, todas is_active=false) — mapeado pra forecast_accuracy_
-- general (a "Geral"); Grãos/Pecuária ficam depois, sem ordem citada.
-- KPIs "linked" (export_share_pct, parts_share_pct — vêm de Exportação/
-- Peças, não são do Comercial) não entraram na lista do usuário: ficam
-- por último (7/8), depois de todo primário — supersede os valores 3/4 que
-- a migration 148 tinha posto (evita colidir com forecast/mix, que agora
-- ocupam 3/4).
-- ---------------------------------------------------------------------------
update public.strategic_kpis set display_order = 1 where code = 'commercial_revenue';
update public.strategic_kpis set display_order = 2 where code = 'commercial_volume';
update public.strategic_kpis set display_order = 3 where code = 'forecast_accuracy_general';
update public.strategic_kpis set display_order = 4 where code = 'mix_assertiveness';
update public.strategic_kpis set display_order = 5 where code = 'forecast_accuracy_grains';
update public.strategic_kpis set display_order = 6 where code = 'forecast_accuracy_livestock';

update public.strategic_a3_kpis ak
set display_order = k.display_order
from public.strategic_kpis k
where ak.kpi_id = k.id and ak.relationship_type = 'primary'
  and k.code in ('commercial_revenue', 'commercial_volume', 'forecast_accuracy_general',
                 'mix_assertiveness', 'forecast_accuracy_grains', 'forecast_accuracy_livestock');

update public.strategic_a3_kpis ak
set display_order = 7
from public.strategic_kpis k
where ak.kpi_id = k.id and ak.relationship_type = 'linked' and k.code = 'export_share_pct';

update public.strategic_a3_kpis ak
set display_order = 8
from public.strategic_kpis k
where ak.kpi_id = k.id and ak.relationship_type = 'linked' and k.code = 'parts_share_pct';

-- ---------------------------------------------------------------------------
-- Produto: % Máquinas Críticas, % Novos Produtos, depois Satisfação do
-- Cliente no Produto Novo (não citada — vai pro final, era a 1ª antes).
-- ---------------------------------------------------------------------------
update public.strategic_kpis set display_order = 1 where code = 'critical_machines_revenue_pct';
update public.strategic_kpis set display_order = 2 where code = 'new_products_revenue_pct';
update public.strategic_kpis set display_order = 3 where code = 'customer_satisfaction_new_product';

update public.strategic_a3_kpis ak
set display_order = k.display_order
from public.strategic_kpis k
where ak.kpi_id = k.id and ak.relationship_type = 'primary'
  and k.code in ('critical_machines_revenue_pct', 'new_products_revenue_pct', 'customer_satisfaction_new_product');

-- ---------------------------------------------------------------------------
-- Marketing: Canal Direto, Inteligência de Mercado, Funil Padronizado,
-- Conhecimento do Cliente Final — troca as posições 3/4 (Funil vem antes
-- de Conhecimento do Cliente agora).
-- ---------------------------------------------------------------------------
update public.strategic_kpis set display_order = 3 where code = 'sales_funnel_standardization_pct';
update public.strategic_kpis set display_order = 4 where code = 'customer_knowledge_pct';

update public.strategic_a3_kpis ak
set display_order = k.display_order
from public.strategic_kpis k
where ak.kpi_id = k.id and ak.relationship_type = 'primary'
  and k.code in ('sales_funnel_standardization_pct', 'customer_knowledge_pct');

-- ---------------------------------------------------------------------------
-- Engenharia: Paradas por Erro de Projeto, Garantia por Erro de Projeto
-- primeiro; os 4 não citados (Aderência aos Prazos, Redução de Itens, SKU,
-- Valor Acordado) mantêm a ordem relativa que já tinham, empurrados pro
-- final.
-- ---------------------------------------------------------------------------
update public.strategic_kpis set display_order = 1 where code = 'project_error_downtime';
update public.strategic_kpis set display_order = 2 where code = 'project_error_warranty';
update public.strategic_kpis set display_order = 3 where code = 'project_deadline_adherence_pct';
update public.strategic_kpis set display_order = 4 where code = 'item_variety_reduction_pct';
update public.strategic_kpis set display_order = 5 where code = 'sku_value_reduction';
update public.strategic_kpis set display_order = 6 where code = 'project_agreed_value';

update public.strategic_a3_kpis ak
set display_order = k.display_order
from public.strategic_kpis k
where ak.kpi_id = k.id and ak.relationship_type = 'primary'
  and k.code in ('project_error_downtime', 'project_error_warranty', 'project_deadline_adherence_pct',
                 'item_variety_reduction_pct', 'sku_value_reduction', 'project_agreed_value');

commit;
