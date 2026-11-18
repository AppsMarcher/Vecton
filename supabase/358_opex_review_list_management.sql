begin;

-- Consolidado: filtro "Cancelado" também para análises e nome da gestão do CC em cada registro.
create or replace function public.opex_list_records(p_filters jsonb, p_cursor jsonb)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare me uuid := auth.uid();
  v_type text := coalesce(p_filters ->> 'type', 'all'); v_cc uuid := nullif(p_filters ->> 'costCenterId', '')::uuid;
  v_year integer := nullif(p_filters ->> 'year', '')::integer; v_period text := nullif(p_filters ->> 'periodType', '');
  v_month integer := nullif(p_filters ->> 'month', '')::integer; v_resp uuid := nullif(p_filters ->> 'responsibleUserId', '')::uuid;
  v_status text := nullif(p_filters ->> 'status', ''); v_sort text := coalesce(p_filters ->> 'sort', 'updated');
  v_limit integer := least(greatest(coalesce((p_filters ->> 'limit')::int, 50), 1), 100);
  v_offset integer := greatest(coalesce((p_cursor ->> 'offset')::int, 0), 0);
  result jsonb;
begin
  if me is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  if v_type not in ('all', 'analyses', 'actions') then raise exception 'Filtro inválido' using errcode = '22023'; end if;
  if v_sort not in ('updated', 'due', 'period') then raise exception 'Ordenação inválida' using errcode = '22023'; end if;
  if v_status is not null and v_status not in ('in_analysis', 'analyzed', 'cancelled', 'awaiting_ack', 'in_progress', 'overdue', 'awaiting_validation', 'adjustments_requested', 'completed') then
    raise exception 'Filtro inválido' using errcode = '22023';
  end if;
  if v_cc is not null and not exists (select 1 from public.cost_centers c where c.id = v_cc and public.opex_can_read_cc(c.organization_id, c.id)) then
    return jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'nextCursor', null);
  end if;
  with rows_all as (
    select 'analysis'::text as rtype, a.id, a.id as analysis_id, left(a.cause, 200) as title, a.cost_center_id, a.cost_center_number_snapshot as cc_number,
           a.cost_center_name_snapshot as cc_name, a.account_number, a.account_name_snapshot as account_name, a.group_reference,
           a.reference_year, a.period_type, a.reference_month, a.comparison_source_key, a.comparison_source_label, a.comparison_source_year,
           a.updated_by as responsible, null::date as due_date, a.analysis_state as status, false as overdue, a.monitor, a.updated_at,
           a.organization_id, null::int as assignment_cycle
      from public.opex_variance_analyses a
     where a.deleted_at is null and a.cause is not null and public.opex_can_read_cc(a.organization_id, a.cost_center_id)
    union all
    select 'action', p.id, a.id, p.title, a.cost_center_id, a.cost_center_number_snapshot, a.cost_center_name_snapshot, a.account_number, a.account_name_snapshot,
           a.group_reference, a.reference_year, a.period_type, a.reference_month, a.comparison_source_key, a.comparison_source_label, a.comparison_source_year,
           p.assignee_user_id, p.due_date, p.status, public.opex_is_overdue(p.due_date, p.status), false, p.updated_at, p.organization_id, p.assignment_cycle
      from public.opex_action_plans p join public.opex_variance_analyses a on a.id = p.analysis_id
     where p.deleted_at is null and a.deleted_at is null and public.opex_can_read_cc(a.organization_id, a.cost_center_id)
  ), filtered as (
    select * from rows_all r
     where (v_type = 'all' or (v_type = 'analyses' and r.rtype = 'analysis') or (v_type = 'actions' and r.rtype = 'action'))
       and (v_cc is null or r.cost_center_id = v_cc) and (v_year is null or r.reference_year = v_year)
       and (v_period is null or r.period_type = v_period) and (v_month is null or r.reference_month = v_month)
       and (v_resp is null or r.responsible = v_resp)
       and (v_status is null
            or (v_status in ('in_analysis', 'analyzed', 'cancelled') and r.rtype = 'analysis' and r.status = v_status)
            or (v_status = 'overdue' and r.rtype = 'action' and r.overdue)
            or (v_status not in ('in_analysis', 'analyzed', 'cancelled', 'overdue') and r.rtype = 'action' and r.status = v_status))
  ), page as (
    select f.* from filtered f
     order by case when v_sort = 'due' then f.due_date end asc nulls last,
              case when v_sort = 'period' then f.reference_year * 100 + f.reference_month end desc,
              f.updated_at desc, f.id
     offset v_offset limit v_limit
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('type', g.rtype, 'id', g.id, 'analysisId', g.analysis_id, 'title', g.title,
        'costCenterId', g.cost_center_id, 'costCenterNumber', g.cc_number, 'costCenterName', g.cc_name, 'accountNumber', g.account_number, 'accountName', g.account_name,
        'groupName', g.group_reference,
        'managementName', (select nullif(trim(c.cost_center_management), '') from public.cost_centers c where c.id = g.cost_center_id), 'year', g.reference_year, 'periodType', g.period_type, 'month', g.reference_month,
        'sourceKey', g.comparison_source_key, 'sourceLabel', g.comparison_source_label, 'sourceYear', g.comparison_source_year,
        'responsible', public.opex_user_name(g.organization_id, g.responsible), 'responsibleUserId', g.responsible, 'dueDate', g.due_date,
        'status', g.status, 'overdue', g.overdue, 'monitor', g.monitor, 'updatedAt', g.updated_at)
        order by case when v_sort = 'due' then g.due_date end asc nulls last, case when v_sort = 'period' then g.reference_year * 100 + g.reference_month end desc, g.updated_at desc, g.id) from page g), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'nextCursor', case when (select count(*) from filtered) > v_offset + v_limit then jsonb_build_object('offset', v_offset + v_limit) else null end)
  into result;
  return result;
end;
$$;

revoke all on function public.opex_list_records(jsonb, jsonb) from public, anon;
grant execute on function public.opex_list_records(jsonb, jsonb) to authenticated;

commit;
