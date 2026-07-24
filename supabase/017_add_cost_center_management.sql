begin;

alter table public.cost_centers
  add column if not exists cost_center_management text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cost_centers_management_check'
  ) then
    alter table public.cost_centers
      add constraint cost_centers_management_check
      check (
        cost_center_management is null
        or cost_center_management in (
          'Diretoria',
          'Controladoria',
          'Recursos Humanos',
          'Supply Chain',
          'Industrial',
          'Engenharia',
          'Marketing',
          'Produto',
          'Qualidade',
          'Comercial'
        )
      );
  end if;
end $$;

commit;
