begin;

-- Relatorio "Marcher no Campo" (id marcherCampo): coloca o card na mesma secao do catalogo
-- em que ja esta "Ativacoes de Garantia", logo ao lado. Organizacoes sem o card de
-- Ativacoes na grade nao sao alteradas (o card cai em "Sem secao" e pode ser arrastado
-- no modo reorganizar). Idempotente.

insert into public.report_section_items (organization_id, section_id, report_id, sort_order)
select i.organization_id, i.section_id, 'marcherCampo', i.sort_order + 1
from public.report_section_items i
where i.report_id = 'garantiaAtivacoes'
on conflict (organization_id, report_id) do nothing;

commit;
