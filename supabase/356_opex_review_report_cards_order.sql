begin;

-- Garante "Minhas ações" na seção OPEX, logo depois de "Análises e planos de ação"
-- (cobre organizações em que o card ficou em "Sem seção"). Pode ser executada mais de uma vez.
with a as (
  select i.organization_id, i.section_id, i.sort_order
    from public.report_section_items i
   where i.report_id = 'opexAnalises'
     and not exists (
       select 1 from public.report_section_items m
        where m.organization_id = i.organization_id and m.report_id = 'minhasAcoes'
          and m.section_id = i.section_id and m.sort_order = i.sort_order + 1
     )
), shifted as (
  update public.report_section_items x
     set sort_order = x.sort_order + 1
    from a
   where x.section_id = a.section_id and x.sort_order > a.sort_order and x.report_id <> 'minhasAcoes'
  returning x.id
)
insert into public.report_section_items (organization_id, section_id, report_id, sort_order)
select a.organization_id, a.section_id, 'minhasAcoes', a.sort_order + 1 from a
on conflict (organization_id, report_id) do update
  set section_id = excluded.section_id, sort_order = excluded.sort_order;

commit;
