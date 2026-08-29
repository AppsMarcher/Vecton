begin;

-- ============================================================================
-- RBAC granular do módulo A3 — parte 4/4: RPCs.
--
-- Toda RPC do módulo é SECURITY DEFINER, então NÃO passa pelas policies de
-- RLS reescritas na migration 144 — o próprio corpo da função é a única
-- linha de defesa pra elas. Preciso trocar a checagem de permissão de cada
-- uma (que hoje só valida a ORG, nunca o A3 específico) pelas novas funções
-- por-A3 (migration 143).
--
-- ATENÇÃO — regressão descoberta ao escrever esta migration: a 140 (já
-- rodada em produção) reemitiu strategic_get_a3_detail a partir da versão
-- da 131, sem saber que a 134 já tinha acrescentado o campo "children"
-- (abas Consolidado + filhos da Tela 2). Resultado: desde que a 140 rodou,
-- strategic_get_a3_detail parou de devolver "children" — as abas de A3 com
-- filho (Comercial, Supply Chain) devem ter sumido da Tela 2. A versão
-- abaixo já corrige isso (traz "children" de volta) além de adicionar o
-- RBAC por-A3.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- strategic_get_overview — Tela 1: gate alargado (strategic_can_access_module,
-- não mais can_manage_strategic_a3) + lista de áreas FILTRADA por
-- strategic_can_view_a3 (admin/manager veem todas; A3 Estratégicos só as
-- concedidas). Resto idêntico à versão da 134 (childrenCount, parent_id is null).
-- ----------------------------------------------------------------------------
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
  if not public.strategic_can_access_module(p_organization_id) then
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
    'childrenCount', coalesce(ca.children_count, 0),
    'canEdit', public.strategic_can_edit_a3(a.id)
  ) order by a.display_order), '[]'::jsonb)
  into v_areas
  from public.strategic_a3 a
  left join area_agg agg on agg.a3_id = a.id
  left join children_agg ca on ca.parent_id = a.id
  where a.cycle_id = v_cycle_id and a.is_active and a.parent_id is null
    and public.strategic_can_view_a3(a.id);

  return jsonb_build_object('northGoals', v_north, 'areas', v_areas);
end;
$$;

grant execute on function public.strategic_get_overview(uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_get_a3_detail — Tela 2: gate trocado pra strategic_can_view_a3
-- (por A3, não mais por org) + campo "canEdit" novo (o frontend usa isso
-- pra mostrar/esconder os controles de edição, em vez de replicar a regra
-- de papel em JS). "children" (perdido na 140, ver nota no topo do arquivo)
-- e "accumulatedTarget" via strategic_kpi_target_accumulated (fix da 140,
-- mantido) — o resto é idêntico à versão da 134.
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
  if not public.strategic_can_view_a3(p_a3_id) then
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
    'children', v_children,
    'kpis', v_kpis,
    'canEdit', public.strategic_can_edit_a3(p_a3_id)
  );
end;
$$;

grant execute on function public.strategic_get_a3_detail(uuid, uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_get_monthly_entry — Tela 3: gate trocado pra strategic_can_view_a3
-- (visão total do Gestor inclui poder ABRIR a tela, mesmo sem poder salvar)
-- + "canEdit" novo (frontend desabilita Salvar/Fechar-período/Reabrir se
-- false). Resto idêntico à versão original (131).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_get_monthly_entry(
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
  v_period record;
  v_kpis jsonb;
begin
  if not public.strategic_can_view_a3(p_a3_id) then
    raise exception 'sem permissão';
  end if;

  select id, code, name, cycle_id into v_a3
  from public.strategic_a3
  where id = p_a3_id and organization_id = p_organization_id;
  if v_a3.id is null then raise exception 'A3 não encontrado'; end if;

  select id into v_scenario_id from public.strategic_scenarios
  where cycle_id = v_a3.cycle_id and is_current limit 1;

  select status, closed_at, reopened_at into v_period
  from public.strategic_a3_periods
  where a3_id = p_a3_id and year = p_year and month = p_month;

  select coalesce(jsonb_agg(kpi_data order by ak.display_order), '[]'::jsonb)
  into v_kpis
  from public.strategic_a3_kpis ak
  join public.strategic_kpis k on k.id = ak.kpi_id and k.is_active
  left join lateral (
    select id, result_value, completion_status, version
    from public.strategic_kpi_records
    where kpi_id = k.id and year = p_year and month = p_month
  ) rec on true
  left join lateral (
    select target_value, target_min, target_max, tolerance
    from public.strategic_kpi_targets
    where kpi_id = k.id and year = p_year and month = p_month and scenario_id = v_scenario_id
  ) tgt on true
  cross join lateral (
    select jsonb_build_object(
      'id', k.id, 'code', k.code, 'name', k.name, 'unit', k.unit,
      'entryMode', k.entry_mode, 'monthlyCalculation', k.monthly_calculation,
      'comparisonMode', k.comparison_mode, 'relationshipType', ak.relationship_type,
      'recordId', rec.id, 'resultValue', rec.result_value,
      'completionStatus', coalesce(rec.completion_status, 'empty'),
      'version', rec.version,
      'target', jsonb_build_object('value', tgt.target_value, 'min', tgt.target_min, 'max', tgt.target_max, 'tolerance', tgt.tolerance),
      'drivers', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', d.id, 'code', d.code, 'name', d.name, 'role', d.driver_role, 'unit', d.unit,
          'value', i.numeric_value, 'textValue', i.text_value
        ) order by d.display_order), '[]'::jsonb)
        from public.strategic_kpi_drivers d
        left join public.strategic_kpi_record_inputs i on i.driver_id = d.id and i.record_id = rec.id
        where d.kpi_id = k.id
      ),
      'breakdownRows', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'dimensionKey', br.dimension_key, 'dimensionLabel', br.dimension_label,
          'plannedValue', br.planned_value, 'actualValue', br.actual_value, 'weightValue', br.weight_value
        ) order by br.display_order), '[]'::jsonb)
        from public.strategic_kpi_breakdown_rows br
        where br.record_id = rec.id
      )
    ) as kpi_data
  ) x
  where ak.a3_id = p_a3_id;

  return jsonb_build_object(
    'a3', jsonb_build_object('id', v_a3.id, 'code', v_a3.code, 'name', v_a3.name),
    'period', jsonb_build_object(
      'year', p_year, 'month', p_month,
      'status', coalesce(v_period.status, 'open'),
      'closedAt', v_period.closed_at, 'reopenedAt', v_period.reopened_at
    ),
    'kpis', v_kpis,
    'canEdit', public.strategic_can_edit_a3(p_a3_id)
  );
end;
$$;

grant execute on function public.strategic_get_monthly_entry(uuid, uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_save_kpi_record — gate trocado pra strategic_can_edit_a3(v_a3_id)
-- (era can_manage_strategic_a3(k.organization_id), só org). Resto idêntico
-- à versão da 135 (computed sobrescrevível manualmente).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_save_kpi_record(
  p_kpi_id            uuid,
  p_year              int,
  p_month             int,
  p_result_value      numeric default null,
  p_expected_version  bigint default null,
  p_driver_inputs     jsonb default null,
  p_breakdown_rows    jsonb default null
)
returns public.strategic_kpi_records
language plpgsql
security definer
set search_path = public
as $$
declare
  k record;
  v_a3_id uuid;
  v_is_closed boolean;
  v_record_id uuid;
  v_current_version bigint;
  v_result numeric;
  v_completion text;
  v_driver jsonb;
  v_row jsonb;
  v_driver_id uuid;
  v_num numeric;
  v_den numeric;
  v_wsum numeric;
  v_wtot numeric;
  v_out public.strategic_kpi_records;
begin
  select id, organization_id, code, entry_mode, monthly_calculation into k
  from public.strategic_kpis where id = p_kpi_id;

  if k.id is null then raise exception 'KPI não encontrado'; end if;

  select ak.a3_id into v_a3_id
  from public.strategic_a3_kpis ak
  where ak.kpi_id = k.id and ak.relationship_type = 'primary'
  limit 1;

  if v_a3_id is null or not public.strategic_can_edit_a3(v_a3_id) then
    raise exception 'sem permissão para editar este KPI';
  end if;

  select exists (
    select 1 from public.strategic_a3_periods p
    where p.a3_id = v_a3_id and p.year = p_year and p.month = p_month and p.status = 'closed'
  ) into v_is_closed;
  if v_is_closed then
    raise exception 'período %/% deste A3 já está fechado', p_month, p_year;
  end if;

  select id, version into v_record_id, v_current_version
  from public.strategic_kpi_records
  where kpi_id = p_kpi_id and year = p_year and month = p_month;

  if v_record_id is not null and p_expected_version is not null and v_current_version <> p_expected_version then
    raise exception 'conflito de concorrência: este registro foi alterado por outra pessoa (versão esperada %, atual %)',
      p_expected_version, v_current_version using errcode = '40001';
  end if;

  if v_record_id is null then
    insert into public.strategic_kpi_records (organization_id, kpi_id, year, month, completion_status, updated_by)
    values (k.organization_id, p_kpi_id, p_year, p_month, 'partial', auth.uid())
    returning id into v_record_id;
  end if;

  if k.entry_mode = 'drivers' and p_driver_inputs is not null then
    for v_driver in select * from jsonb_array_elements(p_driver_inputs) loop
      select id into v_driver_id from public.strategic_kpi_drivers
      where kpi_id = p_kpi_id and code = (v_driver->>'driver_code');
      if v_driver_id is null then
        raise exception 'direcionador % não existe pra este KPI', v_driver->>'driver_code';
      end if;
      insert into public.strategic_kpi_record_inputs (record_id, driver_id, numeric_value, text_value, updated_by)
      values (v_record_id, v_driver_id, nullif(v_driver->>'numeric_value', '')::numeric, v_driver->>'text_value', auth.uid())
      on conflict (record_id, driver_id) do update
        set numeric_value = excluded.numeric_value,
            text_value = excluded.text_value,
            updated_by = auth.uid(),
            updated_at = now();
    end loop;

    if k.monthly_calculation = 'ratio' then
      select sum(i.numeric_value) filter (where d.driver_role = 'numerator'),
             sum(i.numeric_value) filter (where d.driver_role = 'denominator')
      into v_num, v_den
      from public.strategic_kpi_record_inputs i
      join public.strategic_kpi_drivers d on d.id = i.driver_id
      where i.record_id = v_record_id;
      v_result := case when v_den is null or v_den = 0 then null else v_num / v_den end;
    elsif k.monthly_calculation = 'sum_drivers' then
      select sum(i.numeric_value) into v_result
      from public.strategic_kpi_record_inputs i
      join public.strategic_kpi_drivers d on d.id = i.driver_id
      where i.record_id = v_record_id and d.driver_role = 'value';
    elsif k.monthly_calculation = 'average_drivers' then
      select avg(i.numeric_value) into v_result
      from public.strategic_kpi_record_inputs i
      join public.strategic_kpi_drivers d on d.id = i.driver_id
      where i.record_id = v_record_id and d.driver_role = 'value';
    else
      v_result := null;
    end if;

  elsif k.entry_mode = 'breakdown' and p_breakdown_rows is not null then
    delete from public.strategic_kpi_breakdown_rows where record_id = v_record_id;
    insert into public.strategic_kpi_breakdown_rows
      (record_id, dimension_key, dimension_label, planned_value, actual_value, weight_value, display_order)
    select v_record_id,
      v_row->>'dimension_key', v_row->>'dimension_label',
      nullif(v_row->>'planned_value', '')::numeric,
      nullif(v_row->>'actual_value', '')::numeric,
      nullif(v_row->>'weight_value', '')::numeric,
      coalesce((v_row->>'display_order')::int, 0)
    from jsonb_array_elements(p_breakdown_rows) as v_row;

    if k.monthly_calculation = 'weighted_average' then
      select sum(actual_value * coalesce(weight_value, 1)), sum(coalesce(weight_value, 1))
      into v_wsum, v_wtot
      from public.strategic_kpi_breakdown_rows
      where record_id = v_record_id and actual_value is not null;
      v_result := case when v_wtot is null or v_wtot = 0 then null else v_wsum / v_wtot end;
    elsif k.monthly_calculation = 'ratio' then
      select sum(actual_value), sum(planned_value) into v_wsum, v_wtot
      from public.strategic_kpi_breakdown_rows where record_id = v_record_id;
      v_result := case when v_wtot is null or v_wtot = 0 then null else v_wsum / v_wtot end;
    else
      -- forecast_accuracy / mix_accuracy: fórmula pendente (KPI is_active=false)
      v_result := null;
    end if;

  else
    -- 'direct', ou sobrescrita manual de 'computed' — mesmo caminho: usa
    -- exatamente o que a pessoa digitou, sem recomputar.
    v_result := p_result_value;
  end if;

  v_completion := case when v_result is null then 'partial' else 'complete' end;

  update public.strategic_kpi_records
  set result_value = v_result,
      completion_status = v_completion,
      calculation_version = calculation_version + 1,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where id = v_record_id
  returning * into v_out;

  return v_out;
end;
$$;

grant execute on function public.strategic_save_kpi_record(uuid, int, int, numeric, bigint, jsonb, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_sync_computed_kpi_records — gate de entrada alargado
-- (strategic_can_edit_any_a3, não mais can_manage_strategic_a3) + PULA
-- (continue) qualquer KPI cujo A3 o chamador não pode editar, além do pulo
-- por período fechado que já existia.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_sync_computed_kpi_records(
  p_organization_id uuid,
  p_year            int,
  p_month           int
)
returns setof public.strategic_kpi_records
language plpgsql
security definer
set search_path = public
as $$
declare
  k record;
  v_result numeric;
  v_is_closed boolean;
  v_record public.strategic_kpi_records;
begin
  if not public.strategic_can_edit_any_a3(p_organization_id) then
    raise exception 'sem permissão para sincronizar os KPIs deste módulo';
  end if;

  for k in
    select sk.id, sk.code, ak.a3_id
    from public.strategic_kpis sk
    join public.strategic_a3_kpis ak on ak.kpi_id = sk.id and ak.relationship_type = 'primary'
    where sk.organization_id = p_organization_id
      and sk.entry_mode = 'computed'
      and sk.is_active = true
  loop
    if not public.strategic_can_edit_a3(k.a3_id) then
      continue;
    end if;

    select exists (
      select 1 from public.strategic_a3_periods p
      where p.a3_id = k.a3_id and p.year = p_year and p.month = p_month and p.status = 'closed'
    ) into v_is_closed;

    if v_is_closed then
      continue;
    end if;

    v_result := public.strategic_compute_kpi_result(k.id, p_year, p_month, p_month);

    insert into public.strategic_kpi_records (organization_id, kpi_id, year, month, result_value, completion_status, updated_by)
    values (p_organization_id, k.id, p_year, p_month, v_result,
            case when v_result is null then 'empty' else 'complete' end, auth.uid())
    on conflict (kpi_id, year, month) do update
      set result_value = excluded.result_value,
          completion_status = excluded.completion_status,
          calculation_version = public.strategic_kpi_records.calculation_version + 1,
          version = public.strategic_kpi_records.version + 1,
          updated_by = auth.uid(),
          updated_at = now()
    returning * into v_record;

    return next v_record;
  end loop;
end;
$$;

grant execute on function public.strategic_sync_computed_kpi_records(uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_close_a3_period / strategic_reopen_a3_period — gate trocado pra
-- strategic_can_edit_a3(p_a3_id) (era can_manage_strategic_a3(v_org), só org).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_close_a3_period(
  p_a3_id uuid,
  p_year  int,
  p_month int
)
returns public.strategic_a3_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_cycle uuid;
  v_current_scenario uuid;
  v_out public.strategic_a3_periods;
begin
  select organization_id, cycle_id into v_org, v_cycle from public.strategic_a3 where id = p_a3_id;
  if v_org is null then raise exception 'A3 não encontrado'; end if;
  if not public.strategic_can_edit_a3(p_a3_id) then raise exception 'sem permissão pra fechar período'; end if;

  select id into v_current_scenario from public.strategic_scenarios
  where cycle_id = v_cycle and is_current limit 1;

  update public.strategic_kpi_records r
  set scenario_id = v_current_scenario,
      target_id = t.id
  from public.strategic_a3_kpis ak
  left join public.strategic_kpi_targets t
    on t.kpi_id = ak.kpi_id and t.scenario_id = v_current_scenario and t.year = p_year and t.month = p_month
  where r.kpi_id = ak.kpi_id
    and ak.a3_id = p_a3_id and ak.relationship_type = 'primary'
    and r.year = p_year and r.month = p_month
    and r.scenario_id is null;

  insert into public.strategic_a3_periods (organization_id, cycle_id, a3_id, year, month, status, closed_at, closed_by)
  values (v_org, v_cycle, p_a3_id, p_year, p_month, 'closed', now(), auth.uid())
  on conflict (a3_id, year, month) do update
    set status = 'closed', closed_at = now(), closed_by = auth.uid(),
        reopened_at = null, reopened_by = null, updated_at = now()
  returning * into v_out;

  return v_out;
end;
$$;

grant execute on function public.strategic_close_a3_period(uuid, int, int) to authenticated;

create or replace function public.strategic_reopen_a3_period(
  p_a3_id uuid,
  p_year  int,
  p_month int
)
returns public.strategic_a3_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_out public.strategic_a3_periods;
begin
  select organization_id into v_org from public.strategic_a3 where id = p_a3_id;
  if v_org is null then raise exception 'A3 não encontrado'; end if;
  if not public.strategic_can_edit_a3(p_a3_id) then raise exception 'sem permissão pra reabrir período'; end if;

  update public.strategic_a3_periods
  set status = 'open', reopened_at = now(), reopened_by = auth.uid(), updated_at = now()
  where a3_id = p_a3_id and year = p_year and month = p_month
  returning * into v_out;

  if v_out.id is null then
    raise exception 'período %/% não encontrado pra este A3', p_month, p_year;
  end if;

  return v_out;
end;
$$;

grant execute on function public.strategic_reopen_a3_period(uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_save_period_analysis — gate trocado pra strategic_can_edit_a3
-- (era can_manage_strategic_a3(v_org), só org). Resto idêntico à versão
-- original (131).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_save_period_analysis(
  p_a3_id  uuid,
  p_year   int,
  p_month  int,
  p_summary text default null,
  p_items  jsonb default '[]'::jsonb
)
returns public.strategic_period_analyses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_is_closed boolean;
  v_analysis_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_kpi_id uuid;
  v_out public.strategic_period_analyses;
begin
  select organization_id into v_org from public.strategic_a3 where id = p_a3_id;
  if v_org is null then raise exception 'A3 não encontrado'; end if;
  if not public.strategic_can_edit_a3(p_a3_id) then raise exception 'sem permissão'; end if;

  select exists (
    select 1 from public.strategic_a3_periods p
    where p.a3_id = p_a3_id and p.year = p_year and p.month = p_month and p.status = 'closed'
  ) into v_is_closed;
  if v_is_closed then raise exception 'período %/% já está fechado', p_month, p_year; end if;

  insert into public.strategic_period_analyses (organization_id, a3_id, year, month, summary, updated_by)
  values (v_org, p_a3_id, p_year, p_month, p_summary, auth.uid())
  on conflict (a3_id, year, month) do update
    set summary = excluded.summary, updated_by = auth.uid(), updated_at = now()
  returning id into v_analysis_id;

  delete from public.strategic_analysis_items
  where analysis_id = v_analysis_id
    and id <> all (
      coalesce(
        array(select (elem->>'id')::uuid from jsonb_array_elements(p_items) elem where elem->>'id' is not null),
        array[]::uuid[]
      )
    );

  for v_item in select * from jsonb_array_elements(p_items) loop
    if v_item->>'id' is not null then
      update public.strategic_analysis_items
      set item_type = v_item->>'item_type',
          description = v_item->>'description',
          impact_level = v_item->>'impact_level',
          display_order = coalesce((v_item->>'display_order')::int, 0),
          updated_at = now()
      where id = (v_item->>'id')::uuid and analysis_id = v_analysis_id
      returning id into v_item_id;
    else
      insert into public.strategic_analysis_items (analysis_id, item_type, description, impact_level, display_order, created_by)
      values (
        v_analysis_id, v_item->>'item_type', v_item->>'description', v_item->>'impact_level',
        coalesce((v_item->>'display_order')::int, 0), auth.uid()
      )
      returning id into v_item_id;
    end if;

    delete from public.strategic_analysis_item_kpis where analysis_item_id = v_item_id;
    if v_item ? 'kpi_ids' then
      for v_kpi_id in select (jsonb_array_elements_text(v_item->'kpi_ids'))::uuid loop
        insert into public.strategic_analysis_item_kpis (analysis_item_id, kpi_id)
        values (v_item_id, v_kpi_id)
        on conflict do nothing;
      end loop;
    end if;
  end loop;

  select * into v_out from public.strategic_period_analyses where id = v_analysis_id;
  return v_out;
end;
$$;

grant execute on function public.strategic_save_period_analysis(uuid, int, int, text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_save_action — troca as checagens de "pertence à org" (achado #5
-- do review original, migration 141) por checagens de EDIÇÃO por-A3, mais
-- estritas (strategic_can_edit_a3 já garante pertencimento de org como
-- efeito colateral, já que resolve a org do A3 e checa o perfil da pessoa
-- NESSA org). Ação editada precisa que o chamador já pudesse editar PELO
-- MENOS UM dos vínculos ATUAIS antes de aceitar qualquer alteração —
-- impede "sequestro" de ação de outra Gestão só por conhecer o UUID dela.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_save_action(
  p_organization_id          uuid,
  p_cycle_id                 uuid,
  p_id                       uuid default null,
  p_title                    text default null,
  p_description              text default null,
  p_status                   text default 'not_started',
  p_priority                 text default null,
  p_due_date                 date default null,
  p_progress                 numeric default null,
  p_source_analysis_item_id  uuid default null,
  p_a3_ids                   uuid[] default array[]::uuid[],
  p_kpi_ids                  uuid[] default array[]::uuid[],
  p_owner_user_ids           uuid[] default array[]::uuid[]
)
returns public.strategic_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_id uuid;
  v_uid uuid;
  v_a3_id uuid;
  v_kpi_id uuid;
  v_out public.strategic_actions;
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'título da ação é obrigatório';
  end if;
  if p_a3_ids is null or cardinality(p_a3_ids) = 0 then
    raise exception 'ação precisa de pelo menos 1 A3 vinculado';
  end if;

  if exists (
    select 1 from unnest(p_a3_ids) as u(a3_id) where not public.strategic_can_edit_a3(u.a3_id)
  ) then
    raise exception 'sem permissão de edição em um ou mais A3 informados';
  end if;

  if exists (
    select 1
    from unnest(p_kpi_ids) as u(kpi_id)
    left join public.strategic_kpis k on k.id = u.kpi_id
    where k.id is null or not public.strategic_can_edit_a3(k.primary_a3_id)
  ) then
    raise exception 'sem permissão de edição em um ou mais KPIs informados';
  end if;

  if exists (
    select 1
    from unnest(p_owner_user_ids) as u(user_id)
    left join public.organization_users ou on ou.user_id = u.user_id and ou.organization_id = p_organization_id
    where ou.user_id is null
  ) then
    raise exception 'um ou mais responsáveis informados não pertencem a esta organização';
  end if;

  if p_id is null then
    insert into public.strategic_actions
      (organization_id, cycle_id, source_analysis_item_id, title, description, status, priority, due_date, progress, created_by, updated_by)
    values
      (p_organization_id, p_cycle_id, p_source_analysis_item_id, p_title, p_description,
       coalesce(p_status, 'not_started'), p_priority, p_due_date, p_progress, auth.uid(), auth.uid())
    returning id into v_action_id;
  else
    if not public.strategic_action_editable(p_id) then
      raise exception 'sem permissão para editar esta ação';
    end if;

    update public.strategic_actions
    set title = p_title,
        description = p_description,
        status = coalesce(p_status, status),
        priority = p_priority,
        due_date = p_due_date,
        progress = p_progress,
        completed_at = case
          when p_status = 'done' and status <> 'done' then now()
          when p_status <> 'done' then null
          else completed_at
        end,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_id and organization_id = p_organization_id
    returning id into v_action_id;

    if v_action_id is null then raise exception 'ação não encontrada'; end if;
  end if;

  delete from public.strategic_action_a3 where action_id = v_action_id;
  foreach v_a3_id in array p_a3_ids loop
    insert into public.strategic_action_a3 (action_id, a3_id) values (v_action_id, v_a3_id)
    on conflict do nothing;
  end loop;

  delete from public.strategic_action_kpis where action_id = v_action_id;
  foreach v_kpi_id in array p_kpi_ids loop
    insert into public.strategic_action_kpis (action_id, kpi_id) values (v_action_id, v_kpi_id)
    on conflict do nothing;
  end loop;

  delete from public.strategic_action_owners where action_id = v_action_id;
  foreach v_uid in array p_owner_user_ids loop
    insert into public.strategic_action_owners (action_id, user_id, owner_type)
    values (v_action_id, v_uid, 'owner')
    on conflict do nothing;
  end loop;

  select * into v_out from public.strategic_actions where id = v_action_id;
  return v_out;
end;
$$;

grant execute on function public.strategic_save_action(uuid, uuid, uuid, text, text, text, text, date, numeric, uuid, uuid[], uuid[], uuid[]) to authenticated;

commit;
