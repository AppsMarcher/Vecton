begin;

-- ============================================================================
-- Fix (achado #3 do review externo, 2026-08-29): "Meta acumulada" incompatível
-- com o realizado.
--
-- strategic_get_a3_detail calculava accumulatedTarget como SUM(target_value)
-- até o mês selecionado, SEMPRE — ignorando accumulation_method do KPI
-- (que accumulatedResult já respeitava via strategic_kpi_accumulated) e
-- incluindo meses ainda não fechados. Pra um KPI accumulation_method='average'
-- (ex.: os 8 KPIs entry_mode='breakdown' ativos, seed 132), 8 metas mensais de
-- 10% viravam "meta acumulada" de 80% contra um realizado médio de ~10% —
-- comparação sem sentido.
--
-- strategic_kpi_target_accumulated espelha strategic_kpi_accumulated
-- (migration 131) ponto a ponto: mesmo agrupamento por accumulation_method,
-- mesma restrição a meses com período fechado (p.status = 'closed'). Onde
-- accumulatedResult soma resultado, a meta soma target; onde soma média,
-- meta faz média; onde pega o último fechado, meta pega o target do último
-- fechado (ratio_of_sums entra no mesmo balde de last_closed pro lado da
-- meta — não há "soma de metas" que faça sentido pra uma métrica de razão
-- recalculada no período, é o valor de referência do último mês fechado).
-- ============================================================================

create or replace function public.strategic_kpi_target_accumulated(
  p_kpi_id      uuid,
  p_year        int,
  p_month       int,
  p_scenario_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k record;
  v_a3_id uuid;
  v_result numeric;
begin
  select id, accumulation_method into k from public.strategic_kpis where id = p_kpi_id;
  if k.id is null then return null; end if;

  select ak.a3_id into v_a3_id from public.strategic_a3_kpis ak
  where ak.kpi_id = p_kpi_id and ak.relationship_type = 'primary' limit 1;

  case k.accumulation_method
    when 'sum' then
      select sum(t.target_value) into v_result
      from public.strategic_kpi_targets t
      join public.strategic_a3_periods p on p.a3_id = v_a3_id and p.year = t.year and p.month = t.month
      where t.kpi_id = p_kpi_id and t.year = p_year and t.month <= p_month
        and t.scenario_id = p_scenario_id and p.status = 'closed';

    when 'average', 'weighted_average' then
      select avg(t.target_value) into v_result
      from public.strategic_kpi_targets t
      join public.strategic_a3_periods p on p.a3_id = v_a3_id and p.year = t.year and p.month = t.month
      where t.kpi_id = p_kpi_id and t.year = p_year and t.month <= p_month
        and t.scenario_id = p_scenario_id and p.status = 'closed'
        and t.target_value is not null;

    when 'last_closed', 'ratio_of_sums' then
      select t.target_value into v_result
      from public.strategic_kpi_targets t
      join public.strategic_a3_periods p on p.a3_id = v_a3_id and p.year = t.year and p.month = t.month
      where t.kpi_id = p_kpi_id and t.year = p_year and t.month <= p_month
        and t.scenario_id = p_scenario_id and p.status = 'closed'
        and t.target_value is not null
      order by t.month desc limit 1;

    else -- 'none'
      v_result := null;
  end case;

  return v_result;
end;
$$;

grant execute on function public.strategic_kpi_target_accumulated(uuid, int, int, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_get_a3_detail — reemitida (migration 131) só trocando a expressão
-- de accumulatedTarget pela função acima. Resto idêntico.
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
      'accumulatedTarget', public.strategic_kpi_target_accumulated(k.id, p_year, p_month, v_scenario_id),
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
    'kpis', v_kpis
  );
end;
$$;

grant execute on function public.strategic_get_a3_detail(uuid, uuid, int, int) to authenticated;

commit;
