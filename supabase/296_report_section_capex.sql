-- Central de Relatórios: seção CAPEX logo depois de Headcount, com o card "Capex Meta" (capexBudget).
do $$
declare
  org record;
  head_order integer;
  sec_capex uuid;
begin
  for org in select id from public.organizations loop
    if exists (select 1 from public.report_sections where organization_id = org.id and name = 'CAPEX') then
      continue;
    end if;
    -- só organizações que já têm seções salvas (as demais usam o catálogo padrão do app)
    select sort_order into head_order from public.report_sections
      where organization_id = org.id and lower(name) = 'headcount' order by sort_order limit 1;
    if head_order is null then
      select max(sort_order) into head_order from public.report_sections where organization_id = org.id;
      if head_order is null then continue; end if;
    end if;
    update public.report_sections set sort_order = sort_order + 1
      where organization_id = org.id and sort_order > head_order;
    insert into public.report_sections (organization_id, name, sort_order)
      values (org.id, 'CAPEX', head_order + 1) returning id into sec_capex;
    insert into public.report_section_items (organization_id, section_id, report_id, sort_order)
      values (org.id, sec_capex, 'capexBudget', 0)
      on conflict (organization_id, report_id) do nothing;
  end loop;
end $$;
