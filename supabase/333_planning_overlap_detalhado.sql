-- Aviso de integração mais claro: as funções de sobreposição passam a informar o formulário de origem do valor
-- (código e nome), o nome da conta e o centro de custo, para quem integra validar de onde vem cada valor.
-- Pré-requisito: migration 332. Mudar as colunas de retorno exige recriar as funções.
begin;

drop function public.planning_fat_overlap(uuid,uuid);
create function public.planning_fat_overlap(p_org uuid,p_form uuid)
returns table(account_number text,account_name text,form_code text,form_name text,cost_center_number text,months integer[])
language plpgsql stable security definer set search_path=public as $$
begin
 if public.planning_form_mode(p_form) is distinct from 'write' or not exists(select 1 from public.planning_forms where id=p_form and organization_id=p_org and form_type='fat') then raise exception 'Sem permissão de lançamento';end if;
 return query select d.account_number,a.account_name,o.code,o.name,null::text,array_agg(distinct d.reference_month order by d.reference_month)
 from public.planning_fat_calculate(p_form) d join public.planning_forms f on f.id=p_form
 join public.accounts a on a.organization_id=f.organization_id and a.account_number=d.account_number
 join public.planning_form_lines l on l.account_id=a.id and l.origin='input'
 join public.planning_forms o on o.id=l.form_id and o.scenario_id=f.scenario_id and o.form_type='opex' and o.status='released'
 join public.planning_entries e on e.line_id=l.id and e.reference_month=d.reference_month and e.cost_center_id is null and e.amount<>0
 group by d.account_number,a.account_name,o.code,o.name order by o.code,d.account_number;
end $$;

drop function public.planning_capex_overlap(uuid,uuid);
create function public.planning_capex_overlap(p_org uuid,p_form uuid)
returns table(account_number text,account_name text,form_code text,form_name text,cost_center_number text,months integer[])
language plpgsql stable security definer set search_path=public as $$
begin
 if public.planning_form_mode(p_form) is distinct from 'write' or not exists(select 1 from public.planning_forms where id=p_form and organization_id=p_org and form_type='capex') then raise exception 'Sem permissão de lançamento';end if;
 return query select d.account_number,a.account_name,o.code,o.name,c.cost_center_number,array_agg(distinct d.reference_month order by d.reference_month)
 from public.planning_capex_calculate(p_form) d join public.planning_forms f on f.id=p_form
 join public.accounts a on a.organization_id=f.organization_id and a.account_number=d.account_number
 join public.planning_form_lines l on l.account_id=a.id and l.origin='input'
 join public.planning_forms o on o.id=l.form_id and o.scenario_id=f.scenario_id and o.form_type='opex' and o.status='released'
 join public.cost_centers c on c.id=d.cost_center_id
 join public.planning_entries e on e.line_id=l.id and e.reference_month=d.reference_month and e.cost_center_id=d.cost_center_id and e.amount<>0
 where d.amount<>0
 group by d.account_number,a.account_name,o.code,o.name,c.cost_center_number order by o.code,d.account_number,c.cost_center_number;
end $$;

revoke all on function public.planning_fat_overlap(uuid,uuid),public.planning_capex_overlap(uuid,uuid) from public,anon;
grant execute on function public.planning_fat_overlap(uuid,uuid),public.planning_capex_overlap(uuid,uuid) to authenticated;

commit;
