begin;

-- ============================================================================
-- Duas melhorias trazidas pelo usuário (2026-08-29):
--
-- 1) Cores do gráfico mensal (Tela 2) só tratavam comparisonMode 'higher'/
-- 'lower' certo — o frontend reimplementava a classificação em JS
-- (`m.value >= tVal`) em vez de usar strategic_kpi_status, que já é
-- correta pros 5 modos. Afeta hoje 1 indicador real do catálogo
-- ('Atingir Valor Acordado para o Projeto', Engenharia,
-- exact_with_tolerance): estourar o valor acordado aparecia VERDE no
-- gráfico (>= meta), enquanto o resto da tela (pill de status, contagem
-- da Tela 1) já mostrava corretamente fora da meta — cores contraditórias
-- na mesma tela. strategic_get_a3_detail passa a devolver o status já
-- calculado por mês (mesma função, já snapshot-aware pra período fechado
-- desde a 164); o frontend só mapeia status->cor, não reimplementa regra
-- nenhuma. monthlyTargets ganha min/max (preparação pra 'range', que hoje
-- não tem nenhum KPI usando mas não tinha como desenhar meta nenhuma).
--
-- 2) Concorrência na CRIAÇÃO (não só na edição) de meta/realizado:
-- strategic_save_kpi_record fazia um INSERT puro quando o registro/meta
-- ainda não existia — sem ON CONFLICT. As UNIQUE constraints da tabela
-- (kpi_id,year,month / kpi_id,scenario_id,year,month, migration 128) já
-- impediam sobrescrita SILENCIOSA numa corrida de criação simultânea (a
-- 2ª chamada batia na constraint e falhava), mas com um erro cru de
-- Postgres em vez da mensagem "conflito de concorrência" amigável que o
-- caminho de UPDATE já dava. Troca pra INSERT ... ON CONFLICT DO NOTHING
-- RETURNING — se voltar vazio, é porque alguém criou entre o SELECT e o
-- INSERT desta chamada, e agora levanta a mesma exceção amigável
-- (errcode 40001) do CAS de UPDATE.
-- ============================================================================

create or replace function public.strategic_save_kpi_record(
  p_kpi_id              uuid,
  p_year                int,
  p_month               int,
  p_result_value        numeric default null,
  p_expected_version    bigint default null,
  p_driver_inputs       jsonb default null,
  p_breakdown_rows      jsonb default null,
  p_target_value        numeric default null,
  p_target_min          numeric default null,
  p_target_max          numeric default null,
  p_tolerance           numeric default null,
  p_expected_target_version bigint default null
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
  v_current_scenario uuid;
  v_target_id uuid;
  v_target_current_version bigint;
  v_record_id uuid;
  v_current_version bigint;
  v_result numeric;
  v_completion text;
  v_source text;
  v_driver jsonb;
  v_row jsonb;
  v_driver_id uuid;
  v_num numeric;
  v_den numeric;
  v_wsum numeric;
  v_wtot numeric;
  v_out public.strategic_kpi_records;
begin
  select id, organization_id, code, entry_mode, monthly_calculation, is_active into k
  from public.strategic_kpis where id = p_kpi_id;

  if k.id is null then raise exception 'KPI não encontrado'; end if;
  if not k.is_active then raise exception 'este indicador foi desativado'; end if;

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

  select s.id into v_current_scenario
  from public.strategic_scenarios s
  join public.strategic_a3 a3 on a3.cycle_id = s.cycle_id
  where a3.id = v_a3_id and s.is_current
  limit 1;
  if v_current_scenario is null then
    raise exception 'nenhum cenário vigente pra este ciclo — configure um cenário antes de lançar meta/realizado';
  end if;

  -- ---- meta (upsert com CAS + corrida de criação) ----
  select id, version into v_target_id, v_target_current_version
  from public.strategic_kpi_targets
  where kpi_id = p_kpi_id and scenario_id = v_current_scenario and year = p_year and month = p_month;

  if v_target_id is not null and p_expected_target_version is not null and v_target_current_version <> p_expected_target_version then
    raise exception 'conflito de concorrência: a meta deste indicador foi alterada por outra pessoa (versão esperada %, atual %)',
      p_expected_target_version, v_target_current_version using errcode = '40001';
  end if;

  if v_target_id is null then
    insert into public.strategic_kpi_targets (kpi_id, scenario_id, year, month, target_value, target_min, target_max, tolerance)
    values (p_kpi_id, v_current_scenario, p_year, p_month, p_target_value, p_target_min, p_target_max, p_tolerance)
    on conflict (kpi_id, scenario_id, year, month) do nothing
    returning id into v_target_id;

    if v_target_id is null then
      raise exception 'conflito de concorrência: a meta deste indicador acabou de ser criada por outra pessoa — recarregue a tela e tente de novo'
        using errcode = '40001';
    end if;
  else
    update public.strategic_kpi_targets
    set target_value = p_target_value,
        target_min = p_target_min,
        target_max = p_target_max,
        tolerance = p_tolerance,
        version = version + 1,
        updated_at = now()
    where id = v_target_id;
  end if;

  -- ---- realizado (mesma lógica, mesma proteção de corrida na criação) ----
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
    on conflict (kpi_id, year, month) do nothing
    returning id into v_record_id;

    if v_record_id is null then
      raise exception 'conflito de concorrência: este registro acabou de ser criado por outra pessoa — recarregue a tela e tente de novo'
        using errcode = '40001';
    end if;
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
      v_result := null;
    end if;

  else
    v_result := p_result_value;
  end if;

  v_completion := case when v_result is null then 'partial' else 'complete' end;
  v_source := 'manual';

  update public.strategic_kpi_records
  set result_value = v_result,
      completion_status = v_completion,
      calculation_version = calculation_version + 1,
      version = version + 1,
      result_source = v_source,
      overridden_by = case when k.entry_mode = 'computed' then auth.uid() else overridden_by end,
      overridden_at = case when k.entry_mode = 'computed' then now() else overridden_at end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = v_record_id
  returning * into v_out;

  return v_out;
end;
$$;

grant execute on function public.strategic_save_kpi_record(
  uuid, int, int, numeric, bigint, jsonb, jsonb, numeric, numeric, numeric, numeric, bigint
) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_get_a3_detail — monthlyValues ganha "status" (strategic_kpi_
-- status já calculada por mês, snapshot-aware pra período fechado — mesma
-- função que currentTarget/status já usavam só pro mês corrente).
-- monthlyTargets ganha "min"/"max" (preparação pro modo 'range', que hoje
-- só tinha "value", sempre null pra esse modo). Resto idêntico à versão
-- da 164.
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
        select coalesce(jsonb_agg(jsonb_build_object(
          'month', m, 'value', r.result_value,
          'status', case when p.status = 'closed' then public.strategic_kpi_status(
              r.result_value, r.snapshot_target_value, r.snapshot_target_min, r.snapshot_target_max,
              r.snapshot_tolerance, coalesce(r.snapshot_comparison_mode, k.comparison_mode), k.attention_band_pct
            ) else public.strategic_kpi_status(
              r.result_value, t.target_value, t.target_min, t.target_max, t.tolerance,
              k.comparison_mode, k.attention_band_pct
            )
          end
        ) order by m), '[]'::jsonb)
        from generate_series(1, 12) as m
        left join public.strategic_a3_periods p on p.a3_id = p_a3_id and p.year = p_year and p.month = m
        left join public.strategic_kpi_records r on r.kpi_id = k.id and r.year = p_year and r.month = m
        left join public.strategic_kpi_targets t
          on t.kpi_id = k.id and t.year = p_year and t.month = m and t.scenario_id = v_scenario_id
      ),
      'monthlyTargets', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'month', m,
          'value', case when p.status = 'closed' then r.snapshot_target_value else t.target_value end,
          'min', case when p.status = 'closed' then r.snapshot_target_min else t.target_min end,
          'max', case when p.status = 'closed' then r.snapshot_target_max else t.target_max end
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

commit;
