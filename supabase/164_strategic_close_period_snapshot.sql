begin;

-- ============================================================================
-- Achado #6 do review de segurança (2026-08-29) — parte 3/3: fechamento com
-- validação de completude + snapshot de verdade, e as RPCs de leitura
-- passam a usar o snapshot pra mês de período FECHADO (nunca mais a meta ao
-- vivo do cenário vigente, que pode ter mudado depois do fechamento).
--
-- Escopo assumido (documentado, não escondido): strategic_kpi_target_
-- accumulated (migration 140, usada só no campo "Meta acumulada") continua
-- lendo pelo cenário vigente mesmo pra meses fechados — ela soma/faz média
-- de VÁRIOS meses de uma vez, não dá pra resolver com um snapshot por
-- registro sem redesenhar a função inteira pra por-mês. Fora de escopo
-- desta leva; resultado acumulado (accumulatedResult) não tem esse
-- problema, já recalcula do ledger, não da meta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- strategic_close_a3_period — agora valida completude (todo KPI primário
-- ATIVO do A3 precisa ter realizado E meta lançados pro mês) antes de
-- fechar, e sempre SOBRESCREVE o snapshot (era só "where scenario_id is
-- null" — reabrir e fechar de novo ficava preso ao cenário do primeiro
-- fechamento, achado #6 "reabrir e fechar de novo pode manter o cenário
-- antigo preso ao registro").
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
  v_missing text[];
  v_out public.strategic_a3_periods;
begin
  select organization_id, cycle_id into v_org, v_cycle from public.strategic_a3 where id = p_a3_id;
  if v_org is null then raise exception 'A3 não encontrado'; end if;
  if not public.strategic_can_edit_a3(p_a3_id) then raise exception 'sem permissão pra fechar período'; end if;

  select id into v_current_scenario from public.strategic_scenarios
  where cycle_id = v_cycle and is_current limit 1;
  if v_current_scenario is null then
    raise exception 'nenhum cenário vigente pra este ciclo — configure um cenário antes de fechar o período';
  end if;

  -- Completude: só KPI primário ATIVO do A3 entra na validação (KPI
  -- 'linked' pertence à Gestão de outra área — decisão do usuário,
  -- 2026-08-29). Falta meta OU realizado já bloqueia.
  select array_agg(k.name order by k.name) into v_missing
  from public.strategic_a3_kpis ak
  join public.strategic_kpis k on k.id = ak.kpi_id and k.is_active
  left join public.strategic_kpi_records r on r.kpi_id = k.id and r.year = p_year and r.month = p_month
  left join public.strategic_kpi_targets t
    on t.kpi_id = k.id and t.scenario_id = v_current_scenario and t.year = p_year and t.month = p_month
  where ak.a3_id = p_a3_id and ak.relationship_type = 'primary'
    and (
      r.result_value is null
      or (k.comparison_mode = 'range' and (t.target_min is null or t.target_max is null))
      or (k.comparison_mode <> 'range' and t.target_value is null)
    );

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception 'não é possível fechar: faltam meta e/ou realizado em %s indicador(es) — %',
      array_length(v_missing, 1), array_to_string(v_missing, ', ');
  end if;

  -- fixa cenário+meta (snapshot de verdade, não só a referência) em cada
  -- registro do mês antes de fechar — SEMPRE sobrescreve, pra reabrir +
  -- fechar de novo capturar o cenário/meta vigentes NA HORA deste fechamento,
  -- não os do primeiro fechamento.
  update public.strategic_kpi_records r
  set scenario_id = v_current_scenario,
      target_id = t.id,
      snapshot_target_value = t.target_value,
      snapshot_target_min = t.target_min,
      snapshot_target_max = t.target_max,
      snapshot_tolerance = t.tolerance,
      snapshot_comparison_mode = k.comparison_mode
  from public.strategic_a3_kpis ak
  join public.strategic_kpis k on k.id = ak.kpi_id
  left join public.strategic_kpi_targets t
    on t.kpi_id = ak.kpi_id and t.scenario_id = v_current_scenario and t.year = p_year and t.month = p_month
  where r.kpi_id = ak.kpi_id
    and ak.a3_id = p_a3_id and ak.relationship_type = 'primary'
    and r.year = p_year and r.month = p_month;

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

-- ----------------------------------------------------------------------------
-- strategic_reopen_a3_period — limpa o snapshot dos registros do mês (volta
-- pra "vivo": exibição passa a usar a meta ao vivo do cenário vigente de
-- novo, até fechar mais uma vez).
-- ----------------------------------------------------------------------------
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

  update public.strategic_kpi_records r
  set scenario_id = null,
      target_id = null,
      snapshot_target_value = null,
      snapshot_target_min = null,
      snapshot_target_max = null,
      snapshot_tolerance = null,
      snapshot_comparison_mode = null
  from public.strategic_a3_kpis ak
  where r.kpi_id = ak.kpi_id and ak.a3_id = p_a3_id and ak.relationship_type = 'primary'
    and r.year = p_year and r.month = p_month;

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
-- strategic_get_monthly_entry — meta ganha id/version (CAS da 163, campo
-- novo strategic_save_kpi_record.p_expected_target_version) e passa a vir
-- do SNAPSHOT quando o período está fechado (em vez da meta ao vivo do
-- cenário vigente, que pode já ter mudado). resultSource novo, informativo
-- (achado #4 — frontend fica livre pra usar depois, sem migration nova).
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
  v_is_closed boolean;
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
  v_is_closed := coalesce(v_period.status, 'open') = 'closed';

  select coalesce(jsonb_agg(kpi_data order by ak.display_order), '[]'::jsonb)
  into v_kpis
  from public.strategic_a3_kpis ak
  join public.strategic_kpis k on k.id = ak.kpi_id and k.is_active
  left join lateral (
    select id, result_value, completion_status, version, result_source,
           snapshot_target_value, snapshot_target_min, snapshot_target_max, snapshot_tolerance
    from public.strategic_kpi_records
    where kpi_id = k.id and year = p_year and month = p_month
  ) rec on true
  left join lateral (
    select id, version, target_value, target_min, target_max, tolerance
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
      'resultSource', rec.result_source,
      'target', case when v_is_closed then jsonb_build_object(
          'value', rec.snapshot_target_value, 'min', rec.snapshot_target_min,
          'max', rec.snapshot_target_max, 'tolerance', rec.snapshot_tolerance,
          'id', tgt.id, 'version', tgt.version
        ) else jsonb_build_object(
          'value', tgt.target_value, 'min', tgt.target_min,
          'max', tgt.target_max, 'tolerance', tgt.tolerance,
          'id', tgt.id, 'version', tgt.version
        )
      end,
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
-- strategic_get_a3_detail — currentTarget/status/monthlyTargets passam a
-- vir do snapshot pro(s) mês(es) com período fechado, em vez da meta ao
-- vivo do cenário vigente. Resto idêntico à versão da 154 (children,
-- description, canEdit).
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
  v_current_closed boolean;
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

  select (status = 'closed') into v_current_closed
  from public.strategic_a3_periods
  where a3_id = p_a3_id and year = p_year and month = p_month;
  v_current_closed := coalesce(v_current_closed, false);

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
    select result_value, snapshot_target_value, snapshot_target_min, snapshot_target_max,
           snapshot_tolerance, snapshot_comparison_mode
    from public.strategic_kpi_records
    where kpi_id = k.id and year = p_year and month = p_month
  ) cur_r on true
  cross join lateral (
    select jsonb_build_object(
      'id', k.id, 'code', k.code, 'name', k.name, 'description', k.description, 'unit', k.unit,
      'decimalPlaces', k.decimal_places, 'entryMode', k.entry_mode,
      'comparisonMode', k.comparison_mode, 'relationshipType', ak.relationship_type,

      'monthlyValues', (
        select coalesce(jsonb_agg(jsonb_build_object('month', m, 'value', r.result_value) order by m), '[]'::jsonb)
        from generate_series(1, 12) as m
        left join public.strategic_kpi_records r on r.kpi_id = k.id and r.year = p_year and r.month = m
      ),
      'monthlyTargets', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'month', m,
          'value', case when p.status = 'closed' then r.snapshot_target_value else t.target_value end
        ) order by m), '[]'::jsonb)
        from generate_series(1, 12) as m
        left join public.strategic_a3_periods p on p.a3_id = p_a3_id and p.year = p_year and p.month = m
        left join public.strategic_kpi_records r on r.kpi_id = k.id and r.year = p_year and r.month = m
        left join public.strategic_kpi_targets t
          on t.kpi_id = k.id and t.year = p_year and t.month = m and t.scenario_id = v_scenario_id
      ),

      'currentResult', cur_r.result_value,
      'currentTarget', case when v_current_closed then jsonb_build_object(
          'value', cur_r.snapshot_target_value, 'min', cur_r.snapshot_target_min,
          'max', cur_r.snapshot_target_max, 'tolerance', cur_r.snapshot_tolerance
        ) else jsonb_build_object(
          'value', cur_t.target_value, 'min', cur_t.target_min, 'max', cur_t.target_max, 'tolerance', cur_t.tolerance
        )
      end,
      'accumulatedResult', public.strategic_kpi_accumulated(k.id, p_year, p_month),
      'accumulatedTarget', public.strategic_kpi_target_accumulated(k.id, p_year, p_month, v_scenario_id),
      'status', case when v_current_closed then public.strategic_kpi_status(
          cur_r.result_value, cur_r.snapshot_target_value, cur_r.snapshot_target_min, cur_r.snapshot_target_max,
          cur_r.snapshot_tolerance, coalesce(cur_r.snapshot_comparison_mode, k.comparison_mode), k.attention_band_pct
        ) else public.strategic_kpi_status(
          cur_r.result_value, cur_t.target_value, cur_t.target_min, cur_t.target_max, cur_t.tolerance,
          k.comparison_mode, k.attention_band_pct
        )
      end,
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
-- strategic_get_overview — status por área do mês corrente (Tela 1) também
-- vira snapshot-aware por A3 fechado (mesmo padrão do get_a3_detail acima).
-- Resto idêntico à versão da 147 (visible_orphan_children, childrenCount).
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
      case when p.status = 'closed' then public.strategic_kpi_status(
          rec.result_value, rec.snapshot_target_value, rec.snapshot_target_min, rec.snapshot_target_max,
          rec.snapshot_tolerance, coalesce(rec.snapshot_comparison_mode, k.comparison_mode), k.attention_band_pct
        ) else public.strategic_kpi_status(
          rec.result_value, tgt.target_value, tgt.target_min, tgt.target_max, tgt.tolerance,
          k.comparison_mode, k.attention_band_pct
        )
      end as status
    from public.strategic_a3_kpis ak
    join public.strategic_kpis k on k.id = ak.kpi_id and k.is_active
    left join public.strategic_a3_periods p on p.a3_id = ak.a3_id and p.year = p_year and p.month = p_month
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
  ),
  visible_roots as (
    select a.* from public.strategic_a3 a
    where a.cycle_id = v_cycle_id and a.is_active and a.parent_id is null
      and public.strategic_can_view_a3(a.id)
  ),
  visible_orphan_children as (
    select c.* from public.strategic_a3 c
    where c.cycle_id = v_cycle_id and c.is_active and c.parent_id is not null
      and public.strategic_can_view_a3(c.id)
      and not exists (select 1 from visible_roots vr where vr.id = c.parent_id)
  ),
  visible_areas as (
    select * from visible_roots
    union all
    select * from visible_orphan_children
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
  from visible_areas a
  left join area_agg agg on agg.a3_id = a.id
  left join children_agg ca on ca.parent_id = a.id;

  return jsonb_build_object('northGoals', v_north, 'areas', v_areas);
end;
$$;

grant execute on function public.strategic_get_overview(uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- Meta só grava mais pela RPC (strategic_save_kpi_record, 163) — fecha o
-- caminho de escrita direta via PostgREST que não checava período fechado
-- nem tinha CAS de verdade (achado #6). Leitura direta continua liberada
-- (RLS de SELECT, migration 144, inalterada) — telas que só listam.
-- ----------------------------------------------------------------------------
revoke insert, update, delete on public.strategic_kpi_targets from authenticated;

commit;
