begin;

-- O Bateu, Levou legado era o card fixo comercialBateuLevou. O relatório
-- validado atual usa o catálogo dinâmico (report_kind = bateu_levou) e não
-- deve coexistir com a implementação antiga.
delete from public.report_section_items
where report_id = 'comercialBateuLevou';

commit;
