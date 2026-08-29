begin;

-- ============================================================================
-- Fix (usuário, 2026-08-29): "quando a gente fala do A3 Comercial, no
-- consolidado, tem que aparecer SOMENTE Faturamento, Volume, Acurácia do
-- Forecast e Assertividade de Mix" — 4 indicadores, nunca mais que isso.
--
-- export_share_pct (dono real: Exportação) e parts_share_pct (dono real:
-- Peças) estavam TAMBÉM linkados no Comercial (seed_links, migration 132)
-- — reordenados pro final nas migrations 148/150, mas o pedido agora é
-- mais simples: eles NÃO devem aparecer no Consolidado de jeito nenhum.
-- Remove os 2 vínculos 'linked'; o vínculo 'primary' de cada um continua
-- intacto na área dona (Exportação/Peças respectivamente) — é lá que já
-- apareciam corretamente, na ordem certa, sem mudança nenhuma.
-- ============================================================================

delete from public.strategic_a3_kpis ak
using public.strategic_a3 a3, public.strategic_kpis k
where ak.a3_id = a3.id and ak.kpi_id = k.id
  and ak.relationship_type = 'linked'
  and a3.code = 'comercial'
  and k.code in ('export_share_pct', 'parts_share_pct');

commit;
