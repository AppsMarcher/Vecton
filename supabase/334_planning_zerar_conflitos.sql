-- Aviso de integração: "Zerar estes valores e integrar". Zera nos formulários OPEX do cenário os lançamentos cuja chave
-- (conta + centro de custo + mês) o FAT ou o CPX já ocupa, para o formulário não mostrar valor que o DRE não usa.
-- Só administrador; a alteração sobe a versão da célula e fica na auditoria dos lançamentos. Pré-requisito: migration 332.
begin;

create function public.planning_zero_conflicts(p_org uuid,p_scenario uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare n integer; begin
 if auth.uid() is null or not public.planning_is_admin(p_org) then raise exception 'Somente o administrador zera valores em conflito'; end if;
 if not exists(select 1 from public.forecast_scenarios where id=p_scenario and organization_id=p_org and planning_version=1) then raise exception 'Cenário inválido'; end if;
 perform 1 from public.forecast_scenarios where id=p_scenario for update;
 update public.planning_entries e set amount=0,row_version=e.row_version+1,updated_by=auth.uid(),updated_at=clock_timestamp()
 from public.planning_form_lines l join public.accounts a on a.id=l.account_id join public.planning_forms f on f.id=l.form_id
 where e.line_id=l.id and f.scenario_id=p_scenario and f.organization_id=p_org and f.form_type='opex' and e.amount<>0
   and exists(select 1 from public.planning_prevailing_keys(p_scenario) k where k.account_number=a.account_number and k.reference_month=e.reference_month and k.cost_center_id is not distinct from e.cost_center_id);
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.planning_zero_conflicts(uuid,uuid) from public,anon;
grant execute on function public.planning_zero_conflicts(uuid,uuid) to authenticated;

commit;
