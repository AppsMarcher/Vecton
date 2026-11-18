begin;

-- Coloca os cards "Análises e planos de ação" e "Minhas ações" na seção OPEX da Central de Relatórios
-- (as organizações com seções salvas no banco não os mostrariam; sem esta carga eles cairiam em "Sem seção").
insert into public.report_section_items (organization_id, section_id, report_id, sort_order)
select s.organization_id, s.id, r.report_id,
       coalesce((select max(i.sort_order) from public.report_section_items i where i.section_id = s.id), -1) + r.ord
  from public.report_sections s
 cross join (values ('opexAnalises', 1), ('minhasAcoes', 2)) as r(report_id, ord)
 where lower(btrim(s.name)) = 'opex'
on conflict (organization_id, report_id) do nothing;

commit;
