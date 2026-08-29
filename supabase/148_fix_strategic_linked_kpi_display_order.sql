begin;

-- ============================================================================
-- Fix (achado do usuário, 2026-08-29): KPIs "linked" apareciam ANTES dos
-- primários na Tela 2 — "% Exportação sobre Faturamento Total" e "% Peças
-- sobre Faturamento Total" vinham antes de "Faturamento"/"Volume" no A3
-- Comercial; "Paradas por Falta de Material" (linked de Supply Chain) fura
-- na frente em Estoques pelo mesmo motivo.
--
-- Causa raiz: strategic_a3_kpis.display_order tem default 0 na coluna
-- (migration 128). O INSERT dos vínculos 'linked' (migration 132,
-- seed_links) nunca setava display_order — ficaram todos em 0, menor que
-- qualquer KPI primário (display_order >= 1) da área de destino.
-- strategic_get_a3_detail (migrations 131/134/140/145) ordena por
-- ak.display_order sem filtrar relationship_type, então o linked sempre
-- vinha primeiro na lista renderizada.
--
-- A planilha original não lista essas métricas na aba raiz de destino (só
-- nas abas filhas onde já são primárias) — não há posição "correta"
-- derivável do Excel pra um KPI linked. Decisão: depois de todos os
-- primários ativos da área de destino, na mesma ordem em que os A3-filha
-- de origem aparecem no catálogo (Exportação antes de Peças).
-- ============================================================================

-- Comercial: Faturamento(1)/Volume(2) primeiro, depois os 2 linked.
update public.strategic_a3_kpis ak
set display_order = 3
from public.strategic_a3 a3, public.strategic_kpis k
where ak.a3_id = a3.id and ak.kpi_id = k.id
  and ak.relationship_type = 'linked'
  and a3.code = 'comercial' and k.code = 'export_share_pct';

update public.strategic_a3_kpis ak
set display_order = 4
from public.strategic_a3 a3, public.strategic_kpis k
where ak.a3_id = a3.id and ak.kpi_id = k.id
  and ak.relationship_type = 'linked'
  and a3.code = 'comercial' and k.code = 'parts_share_pct';

-- Estoques: depois do último primário ativo (general_inventory_accuracy_pct = 5).
update public.strategic_a3_kpis ak
set display_order = 6
from public.strategic_a3 a3, public.strategic_kpis k
where ak.a3_id = a3.id and ak.kpi_id = k.id
  and ak.relationship_type = 'linked'
  and a3.code = 'estoques' and k.code = 'stockout_hours';

commit;
