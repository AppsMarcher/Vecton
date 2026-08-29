begin;

-- ============================================================================
-- Correção: strategic_get_overview listava TODO strategic_a3 (mães e filhos
-- juntos), sem filtrar por parent_id — os 5 filhos (Exportação/Pecuária/
-- Peças/Estoques/Compras) apareciam soltos na Tela 1 em vez de aparecerem
-- só como desdobramento do pai. create or replace mantém grants (mesma
-- assinatura), não precisa regravar.
-- ============================================================================

create or replace function public.strategic_get_overview(
  p_organization_id uuid,
  p_year            int,
  p_month           int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cycle_id uuid;
  v_scenario_id uuid;
  v_north jsonb;
  v_areas jsonb;
begin
  if not public.can_manage_strategic_a3(p_organization_id) then
    raise exception 'sem permissão';
  end if;

  select id into v_cycle_id from public.strategic_cycles
  where organization_id = p_organization_id and year = p_year limit 1;

  if v_cycle_id is null then
    return jsonb_build_object('northGoals', '[]'::jsonb, 'areas', '[]'::jsonb);
  end if;

  select id into v_scenario_id from public.strategic_scenarios
  where cycle_id = v_cycle_id and is_current limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', g.code, 'title', g.title, 'description', g.description,
    'targetLabel', g.target_label, 'displayOrder', g.display_order
  ) order by g.display_order), '[]'::jsonb)
  into v_north
  from public.strategic_north_goals g
  where g.cycle_id = v_cycle_id and g.is_active;

  with kpi_status as (
    select
      ak.a3_id,
      k.id as kpi_id,
      public.strategic_kpi_status(
        rec.result_value, tgt.target_value, tgt.target_min, tgt.target_max, tgt.tolerance,
        k.comparison_mode, k.attention_band_pct
      ) as status
    from public.strategic_a3_kpis ak
    join public.strategic_kpis k on k.id = ak.kpi_id and k.is_active
    left join public.strategic_kpi_records rec on rec.kpi_id = k.id and rec.year = p_year and rec.month = p_month
    left join public.strategic_kpi_targets tgt on tgt.kpi_id = k.id and tgt.year = p_year and tgt.month = p_month
      and tgt.scenario_id = v_scenario_id
    where ak.relationship_type = 'primary'
      and ak.a3_id in (select id from public.strategic_a3 where cycle_id = v_cycle_id)
  ),
  area_agg as (
    select
      a3_id,
      count(*) as total_kpis,
      count(*) filter (where status = 'on_target')     as on_target_count,
      count(*) filter (where status = 'attention')      as attention_count,
      count(*) filter (where status = 'off_target')     as off_target_count,
      count(*) filter (where status = 'not_available')  as not_available_count
    from kpi_status
    group by a3_id
  ),
  children_agg as (
    select parent_id, count(*) as children_count
    from public.strategic_a3
    where cycle_id = v_cycle_id and is_active and parent_id is not null
    group by parent_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'code', a.code, 'name', a.name, 'parentId', a.parent_id,
    'color', a.color, 'displayOrder', a.display_order,
    'totalKpis', coalesce(agg.total_kpis, 0),
    'onTargetCount', coalesce(agg.on_target_count, 0),
    'attentionCount', coalesce(agg.attention_count, 0),
    'offTargetCount', coalesce(agg.off_target_count, 0),
    'notAvailableCount', coalesce(agg.not_available_count, 0),
    'childrenCount', coalesce(ca.children_count, 0)
  ) order by a.display_order), '[]'::jsonb)
  into v_areas
  from public.strategic_a3 a
  left join area_agg agg on agg.a3_id = a.id
  left join children_agg ca on ca.parent_id = a.id
  where a.cycle_id = v_cycle_id and a.is_active and a.parent_id is null;

  return jsonb_build_object('northGoals', v_north, 'areas', v_areas);
end;
$$;

grant execute on function public.strategic_get_overview(uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_get_a3_detail agora também devolve "children" (id/code/name/
-- color dos filhos do A3 pedido) — a Tela 2 usa isso pra montar as abas
-- Consolidado + 1 por filho, sem precisar de outra chamada.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_get_a3_detail(
  p_organization_id uuid,
  p_a3_id           uuid,
  p_year            int,
  p_month           int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a3 record;
  v_scenario_id uuid;
  v_kpis jsonb;
  v_children jsonb;
begin
  if not public.can_manage_strategic_a3(p_organization_id) then
    raise exception 'sem permissão';
  end if;

  select a.id, a.code, a.name, a.color, a.objective, a.parent_id, a.cycle_id
  into v_a3
  from public.strategic_a3 a
  where a.id = p_a3_id and a.organization_id = p_organization_id;

  if v_a3.id is null then
    raise exception 'A3 não encontrado';
  end if;

  select id into v_scenario_id from public.strategic_scenarios
  where cycle_id = v_a3.cycle_id and is_current limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'code', c.code, 'name', c.name, 'color', c.color
  ) order by c.display_order), '[]'::jsonb)
  into v_children
  from public.strategic_a3 c
  where c.parent_id = p_a3_id and c.is_active;

  select coalesce(jsonb_agg(kpi_data order by ak.display_order), '[]'::jsonb)
  into v_kpis
  from public.strategic_a3_kpis ak
  join public.strategic_kpis k on k.id = ak.kpi_id and k.is_active
  left join lateral (
    select target_value, target_min, target_max, tolerance
    from public.strategic_kpi_targets
    where kpi_id = k.id and year = p_year and month = p_month and scenario_id = v_scenario_id
  ) cur_t on true
  left join lateral (
    select result_value from public.strategic_kpi_records
    where kpi_id = k.id and year = p_year and month = p_month
  ) cur_r on true
  cross join lateral (
    select jsonb_build_object(
      'id', k.id, 'code', k.code, 'name', k.name, 'unit', k.unit,
      'decimalPlaces', k.decimal_places, 'entryMode', k.entry_mode,
      'comparisonMode', k.comparison_mode, 'relationshipType', ak.relationship_type,

      'monthlyValues', (
        select coalesce(jsonb_agg(jsonb_build_object('month', m, 'value', r.result_value) order by m), '[]'::jsonb)
        from generate_series(1, 12) as m
        left join public.strategic_kpi_records r on r.kpi_id = k.id and r.year = p_year and r.month = m
      ),
      'monthlyTargets', (
        select coalesce(jsonb_agg(jsonb_build_object('month', m, 'value', t.target_value) order by m), '[]'::jsonb)
        from generate_series(1, 12) as m
        left join public.strategic_kpi_targets t
          on t.kpi_id = k.id and t.year = p_year and t.month = m and t.scenario_id = v_scenario_id
      ),

      'currentResult', cur_r.result_value,
      'currentTarget', jsonb_build_object('value', cur_t.target_value, 'min', cur_t.target_min, 'max', cur_t.target_max, 'tolerance', cur_t.tolerance),
      'accumulatedResult', public.strategic_kpi_accumulated(k.id, p_year, p_month),
      'accumulatedTarget', (
        select sum(t.target_value) from public.strategic_kpi_targets t
        where t.kpi_id = k.id and t.year = p_year and t.month <= p_month and t.scenario_id = v_scenario_id
      ),
      'status', public.strategic_kpi_status(
        cur_r.result_value, cur_t.target_value, cur_t.target_min, cur_t.target_max, cur_t.tolerance,
        k.comparison_mode, k.attention_band_pct
      ),
      'benchmarks', (
        select coalesce(jsonb_agg(jsonb_build_object('year', b.reference_year, 'type', b.reference_type, 'value', b.value) order by b.reference_year), '[]'::jsonb)
        from public.strategic_kpi_benchmarks b where b.kpi_id = k.id
      )
    ) as kpi_data
  ) x
  where ak.a3_id = p_a3_id;

  return jsonb_build_object(
    'a3', jsonb_build_object(
      'id', v_a3.id, 'code', v_a3.code, 'name', v_a3.name,
      'color', v_a3.color, 'objective', v_a3.objective, 'parentId', v_a3.parent_id
    ),
    'children', v_children,
    'kpis', v_kpis
  );
end;
$$;

grant execute on function public.strategic_get_a3_detail(uuid, uuid, int, int) to authenticated;

commit;
