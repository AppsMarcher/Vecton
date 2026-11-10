-- Administrador renomeia o cenário de planejamento (lápis ao lado do nome na tela do cenário).
-- Função própria: não mexe no planning_write nem no bloqueio do cenário (admin continua mantendo cenário bloqueado).
begin;

create or replace function public.planning_rename_scenario(p_org uuid,p_scenario uuid,p_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare nm text:=trim(coalesce(p_name,''));
begin
 if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização'; end if;
 if not public.planning_is_admin(p_org) then raise exception 'Sem permissão'; end if;
 if length(nm) not between 1 and 80 then raise exception 'Nome inválido'; end if;
 perform 1 from public.forecast_scenarios where id=p_scenario and organization_id=p_org and planning_version=1 for update;
 if not found then raise exception 'Cenário de planejamento inválido'; end if;
 if exists(select 1 from public.forecast_scenarios where organization_id=p_org and name=nm and id<>p_scenario) then raise exception 'Já existe um cenário com esse nome'; end if;
 perform set_config('vecton.planning_write',p_scenario::text,true);
 update public.forecast_scenarios set name=nm where id=p_scenario;
 insert into public.planning_audit_log(organization_id,scenario_id,actor,action) values(p_org,p_scenario,auth.uid(),'renamed');
 return jsonb_build_object('id',p_scenario,'name',nm);
end $$;

revoke all on function public.planning_rename_scenario(uuid,uuid,text) from public,anon;
grant execute on function public.planning_rename_scenario(uuid,uuid,text) to authenticated;

commit;
