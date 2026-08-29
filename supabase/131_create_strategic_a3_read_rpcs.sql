begin;

-- ============================================================================
-- Módulo A3 - Gestão Estratégica — RPCs de leitura pra UI + gravação de
-- causas/contramedidas/ações (Etapa 3, parte 2).
--
-- Leitura simples de entidade (listar ações, listar comentários, listar
-- itens de análise) NÃO precisa de RPC — é SELECT direto protegido por RLS
-- (can_manage_strategic_a3 já em toda tabela, migration 128). RPC só onde
-- tem agregação/cálculo real: status por KPI, acumulado, contagens por A3.
--
-- Fora de escopo desta leva: bucket de anexos, notificações, módulo
-- frontend.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- strategic_kpi_accumulated — acumulado NUNCA persistido (decisão #7.4),
-- calculado aqui só com meses cujo período do A3 dono está 'closed'.
--
-- Simplificação assumida (documentada, não escondida): fechamento
-- sequencial — se o mês M está fechado, assume que 1..M-1 também estão
-- (prática de negócio padrão; não valida contiguidade). Pra
-- 'ratio_of_sums' isso importa de verdade porque o cálculo reconsulta o
-- ledger num range de meses, não soma result_value já arredondados —
-- evita erro de arredondamento acumulado, mas exige a premissa de
-- sequência.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_kpi_accumulated(
  p_kpi_id uuid,
  p_year   int,
  p_month  int
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
  v_last_month int;
  v_result numeric;
begin
  select id, accumulation_method into k from public.strategic_kpis where id = p_kpi_id;
  if k.id is null then return null; end if;

  select ak.a3_id into v_a3_id from public.strategic_a3_kpis ak
  where ak.kpi_id = p_kpi_id and ak.relationship_type = 'primary' limit 1;

  case k.accumulation_method
    when 'sum' then
      select sum(r.result_value) into v_result
      from public.strategic_kpi_records r
      join public.strategic_a3_periods p on p.a3_id = v_a3_id and p.year = r.year and p.month = r.month
      where r.kpi_id = p_kpi_id and r.year = p_year and r.month <= p_month and p.status = 'closed';

    when 'average' then
      select avg(r.result_value) into v_result
      from public.strategic_kpi_records r
      join public.strategic_a3_periods p on p.a3_id = v_a3_id and p.year = r.year and p.month = r.month
      where r.kpi_id = p_kpi_id and r.year = p_year and r.month <= p_month and p.status = 'closed'
        and r.result_value is not null;

    when 'last_closed' then
      select r.result_value into v_result
      from public.strategic_kpi_records r
      join public.strategic_a3_periods p on p.a3_id = v_a3_id and p.year = r.year and p.month = r.month
      where r.kpi_id = p_kpi_id and r.year = p_year and r.month <= p_month and p.status = 'closed'
        and r.result_value is not null
      order by r.month desc limit 1;

    when 'weighted_average' then
      select case when sum(coalesce(br.weight_value, 1)) = 0 then null
                  else sum(br.actual_value * coalesce(br.weight_value, 1)) / sum(coalesce(br.weight_value, 1))
             end
      into v_result
      from public.strategic_kpi_breakdown_rows br
      join public.strategic_kpi_records r on r.id = br.record_id
      join public.strategic_a3_periods p on p.a3_id = v_a3_id and p.year = r.year and p.month = r.month
      where r.kpi_id = p_kpi_id and r.year = p_year and r.month <= p_month and p.status = 'closed'
        and br.actual_value is not null;

    when 'ratio_of_sums' then
      select max(r.month) into v_last_month
      from public.strategic_kpi_records r
      join public.strategic_a3_periods p on p.a3_id = v_a3_id and p.year = r.year and p.month = r.month
      where r.kpi_id = p_kpi_id and r.year = p_year and r.month <= p_month and p.status = 'closed';

      if v_last_month is not null then
        v_result := public.strategic_compute_kpi_result(p_kpi_id, p_year, 1, v_last_month);
      else
        v_result := null;
      end if;

    else -- 'none'
      v_result := null;
  end case;

  return v_result;
end;
$$;

grant execute on function public.strategic_kpi_accumulated(uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_get_overview — Tela 1 (Visão Executiva): Norte Verdadeiro +
-- contagem de status por área, pros KPIs primários de cada A3.
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
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'code', a.code, 'name', a.name, 'parentId', a.parent_id,
    'color', a.color, 'displayOrder', a.display_order,
    'totalKpis', coalesce(agg.total_kpis, 0),
    'onTargetCount', coalesce(agg.on_target_count, 0),
    'attentionCount', coalesce(agg.attention_count, 0),
    'offTargetCount', coalesce(agg.off_target_count, 0),
    'notAvailableCount', coalesce(agg.not_available_count, 0)
  ) order by a.display_order), '[]'::jsonb)
  into v_areas
  from public.strategic_a3 a
  left join area_agg agg on agg.a3_id = a.id
  where a.cycle_id = v_cycle_id and a.is_active;

  return jsonb_build_object('northGoals', v_north, 'areas', v_areas);
end;
$$;

grant execute on function public.strategic_get_overview(uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_get_a3_detail — Tela 2 (Detalhe do A3): série mensal completa,
-- acumulado, meta, status e benchmarks por KPI (primário + linkado).
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
    'kpis', v_kpis
  );
end;
$$;

grant execute on function public.strategic_get_a3_detail(uuid, uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_get_monthly_entry — Tela "Preenchimento Mensal": estado
-- editável de cada KPI do A3 (registro atual, direcionadores, composição,
-- meta) + status do período.
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
  if not public.can_manage_strategic_a3(p_organization_id) then
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
    'kpis', v_kpis
  );
end;
$$;

grant execute on function public.strategic_get_monthly_entry(uuid, uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_save_period_analysis — causas/contramedidas estruturadas
-- (decisão #23, nunca texto livre "Causas:"/"Ações:" num campo só).
-- Contrato: p_items é a LISTA COMPLETA da tela — item existente que não
-- vier no payload é removido (não é incremento).
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
  if not public.can_manage_strategic_a3(v_org) then raise exception 'sem permissão'; end if;

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
-- strategic_save_action — plano de ações, N:N com A3 e KPIs (decisão #25).
-- p_id null = cria; preenchido = atualiza. Vínculos (a3/kpi/responsáveis)
-- sempre substituídos por inteiro, mesmo contrato de save_period_analysis.
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
  if not public.can_manage_strategic_a3(p_organization_id) then
    raise exception 'sem permissão';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'título da ação é obrigatório';
  end if;

  if p_id is null then
    insert into public.strategic_actions
      (organization_id, cycle_id, source_analysis_item_id, title, description, status, priority, due_date, progress, created_by, updated_by)
    values
      (p_organization_id, p_cycle_id, p_source_analysis_item_id, p_title, p_description,
       coalesce(p_status, 'not_started'), p_priority, p_due_date, p_progress, auth.uid(), auth.uid())
    returning id into v_action_id;
  else
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
