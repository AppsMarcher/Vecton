begin;

-- ============================================================================
-- Achados #4, #6, #7 do review de segurança (2026-08-29) — parte 2/3: RPCs
-- de escrita. Base de schema na migration 162.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- #7 — strategic_save_kpi_record ganha meta (p_target_*) na MESMA
-- transação do realizado, com CAS própria (p_expected_target_version,
-- espelha p_expected_version que já existia só pro realizado). Cenário é
-- SEMPRE o vigente do ciclo do A3, resolvido aqui dentro — nunca aceita
-- scenario_id vindo do cliente (era assim que a REST direta de
-- saveKpiTarget funcionava antes, dava pra mandar qualquer scenario_id).
--
-- #6 — período fechado agora bloqueia meta E realizado juntos (antes só o
-- realizado checava via esta RPC; a meta ia direto pra tabela por REST, sem
-- checar nada — achado #6: "meta podia ser modificada direto pela tabela,
-- sem respeitar o período fechado"). A migration 164 revoga o
-- INSERT/UPDATE direto de authenticated em strategic_kpi_targets, forçando
-- toda gravação de meta a passar por aqui.
--
-- #4 — toda gravação por esta RPC marca result_source='manual'. Quando o
-- KPI é entry_mode='computed' (sobrescrita de verdade, não preenchimento
-- normal), também grava overridden_by/overridden_at — strategic_sync_
-- computed_kpi_records (nesta mesma migration) passa a pular essas linhas.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_save_kpi_record(
  p_kpi_id              uuid,
  p_year                int,
  p_month               int,
  p_result_value        numeric default null,  -- só usado quando entry_mode='direct'/'computed'
  p_expected_version    bigint default null,    -- null = registro de realizado ainda não existe
  p_driver_inputs       jsonb default null,
  p_breakdown_rows      jsonb default null,
  p_target_value        numeric default null,
  p_target_min          numeric default null,
  p_target_max          numeric default null,
  p_tolerance           numeric default null,
  p_expected_target_version bigint default null -- null = meta ainda não existe pra este cenário/mês
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

  select s.id into v_current_scenario
  from public.strategic_scenarios s
  join public.strategic_a3 a3 on a3.cycle_id = s.cycle_id
  where a3.id = v_a3_id and s.is_current
  limit 1;
  if v_current_scenario is null then
    raise exception 'nenhum cenário vigente pra este ciclo — configure um cenário antes de lançar meta/realizado';
  end if;

  -- ---- meta (upsert com CAS) ----
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
    returning id into v_target_id;
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

  -- ---- realizado (mesma lógica de sempre, CAS própria) ----
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

  -- #4: toda gravação por aqui é 'manual'. overridden_by/at só quando é
  -- de fato uma SOBRESCRITA (KPI que normalmente é calculado automático).
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

-- Assinatura antiga (sem parâmetros de meta) some — nenhuma outra função do
-- catálogo depende dela (só o frontend chamava, atualizado na mesma leva).
drop function if exists public.strategic_save_kpi_record(uuid, int, int, numeric, bigint, jsonb, jsonb);

-- ----------------------------------------------------------------------------
-- #4 — strategic_sync_computed_kpi_records passa a: (a) pular (continue)
-- qualquer registro com result_source='manual' — nunca mais sobrescreve
-- uma correção manual sem uma ação nova da pessoa; (b) aceitar p_a3_id
-- opcional pra restringir a sincronização a 1 A3 só (era sempre a
-- organização inteira — decisão do usuário: bota o A3 aberto, default null
-- continua sincronizando tudo se algum caller antigo ainda depender disso).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_sync_computed_kpi_records(
  p_organization_id uuid,
  p_year            int,
  p_month           int,
  p_a3_id           uuid default null
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
  v_existing_source text;
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
      and (p_a3_id is null or ak.a3_id = p_a3_id)
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

    select result_source into v_existing_source
    from public.strategic_kpi_records
    where kpi_id = k.id and year = p_year and month = p_month;

    if v_existing_source = 'manual' then
      continue; -- correção manual: sync nunca sobrescreve sem ação nova da pessoa
    end if;

    v_result := public.strategic_compute_kpi_result(k.id, p_year, p_month, p_month);

    insert into public.strategic_kpi_records (organization_id, kpi_id, year, month, result_value, completion_status, result_source, updated_by)
    values (p_organization_id, k.id, p_year, p_month, v_result,
            case when v_result is null then 'empty' else 'complete' end, 'computed', auth.uid())
    on conflict (kpi_id, year, month) do update
      set result_value = excluded.result_value,
          completion_status = excluded.completion_status,
          result_source = 'computed',
          calculation_version = public.strategic_kpi_records.calculation_version + 1,
          version = public.strategic_kpi_records.version + 1,
          updated_by = auth.uid(),
          updated_at = now()
    returning * into v_record;

    return next v_record;
  end loop;
end;
$$;

grant execute on function public.strategic_sync_computed_kpi_records(uuid, int, int, uuid) to authenticated;
drop function if exists public.strategic_sync_computed_kpi_records(uuid, int, int);

commit;
