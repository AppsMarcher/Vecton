begin;

-- Troca a cor do card de um cenário de planejamento. O trigger planning_guard_forecast bloqueia UPDATE
-- direto em cenários de planejamento, então a troca passa por esta função (admin/super admin),
-- que libera a escrita só para o cenário alvo. Idempotente.
create or replace function public.planning_set_scenario_color(p_org uuid, p_scenario uuid, p_color text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.planning_is_admin(p_org) then raise exception 'Sem permissão'; end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Cor inválida'; end if;
  if not exists (select 1 from public.forecast_scenarios where id = p_scenario and organization_id = p_org and planning_version > 0) then
    raise exception 'Cenário de planejamento inválido';
  end if;
  perform set_config('vecton.planning_write', p_scenario::text, true);
  update public.forecast_scenarios set color = p_color where id = p_scenario and organization_id = p_org;
end $$;

revoke all on function public.planning_set_scenario_color(uuid, uuid, text) from public, anon;
grant execute on function public.planning_set_scenario_color(uuid, uuid, text) to authenticated;

commit;
