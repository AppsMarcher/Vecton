begin;

-- ============================================================================
-- RPS Comercial — nova área fixa "Pecuária", entre Oeste e Exportação (mesma
-- posição da coordenação "Pecuária" no painel Central de Vendas). Áreas
-- continuam fixas no código do módulo (rpsComercialModule.js, AREAS); aqui só
-- amplia o CHECK de rps_comercial_entries.area_id pra aceitar o novo id.
-- ============================================================================

alter table public.rps_comercial_entries
  drop constraint if exists rps_comercial_entries_area_id_check;

alter table public.rps_comercial_entries
  add constraint rps_comercial_entries_area_id_check
  check (area_id in (
    'norte', 'sul', 'oeste', 'pecuaria', 'exportacao', 'pecas', 'administrativo'
  ));

commit;
