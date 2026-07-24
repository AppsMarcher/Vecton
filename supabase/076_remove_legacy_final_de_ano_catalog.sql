begin;

-- O Final de Ano legado era o card fixo comercialFinalDeAno. O relatório
-- validado atual usa o catálogo dinâmico (report_kind = final_ano) e não
-- deve coexistir com a implementação antiga, seguindo o mesmo padrão já
-- aplicado ao Bateu, Levou em 074_remove_legacy_bateu_levou_catalog.sql.
delete from public.report_section_items
where report_id = 'comercialFinalDeAno';

drop function if exists public.comercial_final_de_ano(uuid, integer, integer, uuid);
drop function if exists public.comercial_final_de_ano_extrato(uuid, integer, integer);

commit;
