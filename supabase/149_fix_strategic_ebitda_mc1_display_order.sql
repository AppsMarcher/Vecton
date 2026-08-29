begin;

-- ============================================================================
-- Fix (achado do usuário, 2026-08-29): área EBITDA fora de ordem — a
-- migration 136 desdobrou EBITDA%/MC1% em 4 indicadores (mensal +
-- acumulado) mas ordenou por PERÍODO (os 2 "mensal" juntos, display_order
-- 1/2, depois os 2 "acumulado" juntos, 3/4) — resultado na Tela 2: EBITDA
-- Mensal, MC1 Mensal, EBITDA Acumulado, MC1 Acumulado.
--
-- A planilha original agrupa por MÉTRICA, não por período: EBITDA (mensal
-- + acumulado) primeiro, depois MC1 (mensal + acumulado). Corrige nas duas
-- tabelas que carregam display_order — strategic_kpis é só o catálogo
-- (documentação); strategic_a3_kpis é o que strategic_get_a3_detail e
-- strategic_get_monthly_entry realmente usam pra ordenar a Tela 2/3 (ver
-- "order by ak.display_order" nas duas RPCs).
--
-- Único ponto do catálogo afetado por esta checagem — 136 foi a única
-- migration além da 132 que mexeu em display_order, e só pra EBITDA/MC1;
-- as outras 8 áreas já conferidas batem com a planilha (achado anterior,
-- 2026-08-29, ressalvado o bug separado dos KPIs "linked" — migration 148).
-- ============================================================================

update public.strategic_kpis set display_order = 1 where code = 'ebitda_pct';
update public.strategic_kpis set display_order = 2 where code = 'ebitda_pct_accumulated';
update public.strategic_kpis set display_order = 3 where code = 'mc1_pct';
update public.strategic_kpis set display_order = 4 where code = 'mc1_pct_accumulated';

update public.strategic_a3_kpis ak
set display_order = k.display_order
from public.strategic_kpis k
where ak.kpi_id = k.id
  and k.code in ('ebitda_pct', 'ebitda_pct_accumulated', 'mc1_pct', 'mc1_pct_accumulated');

commit;
