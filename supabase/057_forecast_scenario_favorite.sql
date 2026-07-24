-- 057: Cenário favorito da organização (comparativo padrão).
-- Um cenário por ano pode ser marcado como favorito (is_default). Semântica:
-- nenhum cenário favorito no ano = o comparativo padrão é o Budget (estado
-- inicial de todas as orgs, sem migração de dados). O favorito vale para a
-- organização inteira (DREs Real "Comparar com" e comparativos do Dashboard);
-- cada usuário ainda pode trocar o comparativo na própria sessão.
-- Só admin/super_admin altera — enforced na RPC (a RLS de forecast_scenarios
-- é member-level, então a escrita da estrela passa por SECURITY DEFINER).

begin;

alter table public.forecast_scenarios
  add column if not exists is_default boolean not null default false;

-- No máximo 1 favorito por organização/ano.
create unique index if not exists uq_forecast_scenarios_default_per_year
  on public.forecast_scenarios (organization_id, reference_year)
  where is_default;

create or replace function public.set_default_forecast_scenario(
  target_organization_id uuid,
  target_reference_year integer,
  target_scenario_id uuid  -- null = Budget (nenhum cenário favorito)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.user_profiles up
    where up.organization_id = target_organization_id
      and up.user_id = auth.uid()
      and up.access_role in ('admin', 'super_admin')
  ) then
    raise exception 'Apenas administradores podem alterar o cenário favorito';
  end if;

  if target_scenario_id is not null and not exists (
    select 1
    from public.forecast_scenarios s
    where s.id = target_scenario_id
      and s.organization_id = target_organization_id
      and s.reference_year = target_reference_year
  ) then
    raise exception 'Cenário não encontrado para este ano';
  end if;

  update public.forecast_scenarios
     set is_default = false,
         updated_at = now()
   where organization_id = target_organization_id
     and reference_year = target_reference_year
     and is_default;

  if target_scenario_id is not null then
    update public.forecast_scenarios
       set is_default = true,
           updated_at = now()
     where id = target_scenario_id;
  end if;
end;
$$;

grant execute on function public.set_default_forecast_scenario(uuid, integer, uuid) to authenticated;

commit;
