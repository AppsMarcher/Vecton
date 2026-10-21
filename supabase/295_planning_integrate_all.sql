-- Botão único "Integrar no DRE e OPEX": integra os formulários OPEX liberados e recalcula o CAPEX
-- na mesma chamada. Reaproveita as duas integrações existentes (cada uma segue atômica e registra
-- a sua própria execução em planning_runs); a permissão de cada parte continua a de cada formulário.
begin;
create function public.planning_integrate_all(p_org uuid,p_scenario uuid,p_form uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare f public.planning_forms;opex_id uuid;capex_id uuid;capex_f public.planning_forms;
 r_opex jsonb;r_capex jsonb;notes text[]:='{}';rows int:=0;ok boolean:=true;errs text[]:='{}';
begin
 if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização';end if;
 select * into f from public.planning_forms where id=p_form and scenario_id=p_scenario and organization_id=p_org;
 if not found then raise exception 'Formulário inválido';end if;

 -- Formulário OPEX usado para autorizar a integração do OPEX (o clicado, ou outro com escrita).
 if f.form_type='opex' and public.planning_form_mode(f.id)='write' then opex_id:=f.id;
 else select id into opex_id from public.planning_forms where scenario_id=p_scenario and organization_id=p_org and form_type='opex'
   and public.planning_form_mode(id)='write' order by code limit 1;end if;
 select * into capex_f from public.planning_forms where scenario_id=p_scenario and organization_id=p_org and form_type='capex';
 capex_id:=capex_f.id;

 if opex_id is not null then
   r_opex:=public.planning_write(p_org,'project',p_scenario,jsonb_build_object('form_id',opex_id));
   rows:=rows+coalesce((r_opex->>'rows_written')::int,0);
   if not coalesce((r_opex->>'ok')::boolean,false) then ok:=false;errs:=errs||('OPEX: '||coalesce(r_opex->>'error','falha'));end if;
 else notes:=notes||'OPEX: sem permissão de escrita em formulário OPEX';end if;

 if capex_id is null then notes:=notes||'CAPEX: formulário inexistente';
 elsif public.planning_form_mode(capex_id) is distinct from 'write' then notes:=notes||'CAPEX: sem permissão de escrita';
 elsif capex_f.status<>'released' then notes:=notes||'CAPEX: formulário não liberado';
 else
   r_capex:=public.planning_capex_write(p_org,'project',p_scenario,jsonb_build_object('form_id',capex_id));
   rows:=rows+coalesce((r_capex->>'rows_written')::int,0);
   if not coalesce((r_capex->>'ok')::boolean,false) then ok:=false;errs:=errs||('CAPEX: '||coalesce(r_capex->>'error','falha'));end if;
 end if;

 return jsonb_build_object('ok',ok,'rows_written',rows,'opex',r_opex,'capex',r_capex,'notes',to_jsonb(notes),
   'error',case when cardinality(errs)>0 then array_to_string(errs,' · ') end);
end $$;
revoke all on function public.planning_integrate_all(uuid,uuid,uuid) from public,anon;
grant execute on function public.planning_integrate_all(uuid,uuid,uuid) to authenticated;
commit;
