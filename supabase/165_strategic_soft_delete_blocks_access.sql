begin;

-- ============================================================================
-- Melhoria #7 do review de segurança (2026-08-29): soft-delete de A3 não
-- bloqueava leitura nem edição de verdade. strategic_deactivate_a3
-- (migration 156) só marca is_active=false — nenhum helper de RBAC
-- (strategic_can_view_a3/strategic_can_edit_a3, migrations 143/146/147)
-- checava esse campo. Resultado: quem já tinha o a3_id (histórico de URL,
-- cache do frontend, ID adivinhado) continuava lendo/editando um A3
-- "excluído" via RPC ou REST direto — só sumia das LISTAGENS (Tela 1/2 já
-- filtram is_active nas próprias queries), nunca do acesso direto.
--
-- Fix: strategic_can_view_a3/strategic_can_edit_a3 passam a negar se o A3
-- em si OU a A3-mãe dele estiverem is_active=false. Como toda RLS de tabela
-- (migration 144) e toda RPC do módulo (145+) resolve permissão através
-- desses 2 helpers, o bloqueio propaga sozinho pro módulo inteiro — sem
-- precisar reemitir cada RPC de novo. strategic_save_kpi_record ganha uma
-- checagem própria (é o único ponto que resolve o KPI sem passar pelo A3
-- primeiro nas linhas iniciais da função).
-- ============================================================================

create or replace function public.strategic_can_view_a3(p_a3_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_root_id uuid;
  v_is_active boolean;
  v_root_active boolean;
begin
  select organization_id, public.strategic_a3_root_id(id), is_active
  into v_org, v_root_id, v_is_active
  from public.strategic_a3 where id = p_a3_id;
  if v_org is null or not coalesce(v_is_active, false) then return false; end if;

  select is_active into v_root_active from public.strategic_a3 where id = v_root_id;
  if not coalesce(v_root_active, false) then return false; end if;

  return exists (
    select 1 from public.user_profiles up
    where up.organization_id = v_org and up.user_id = auth.uid()
      and (
        up.access_role in ('super_admin', 'admin', 'manager')
        or 'manager' = any(up.additional_access_roles)
        or (
          (up.access_role = 'gestao_estrategica' or 'gestao_estrategica' = any(up.additional_access_roles))
          and (p_a3_id = any(up.extra_strategic_a3_ids) or v_root_id = any(up.extra_strategic_a3_ids))
        )
      )
  );
end;
$$;

grant execute on function public.strategic_can_view_a3(uuid) to authenticated;

create or replace function public.strategic_can_edit_a3(p_a3_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_root_id uuid;
  v_mgmt text;
  v_is_active boolean;
  v_root_active boolean;
begin
  select organization_id, public.strategic_a3_root_id(id), public.strategic_a3_management(id), is_active
  into v_org, v_root_id, v_mgmt, v_is_active
  from public.strategic_a3 where id = p_a3_id;
  if v_org is null or not coalesce(v_is_active, false) then return false; end if;

  select is_active into v_root_active from public.strategic_a3 where id = v_root_id;
  if not coalesce(v_root_active, false) then return false; end if;

  return exists (
    select 1 from public.user_profiles up
    where up.organization_id = v_org and up.user_id = auth.uid()
      and (
        up.access_role in ('super_admin', 'admin')
        or (
          (up.access_role = 'manager' or 'manager' = any(up.additional_access_roles))
          and (
            up.management is null  -- sem Gestão marcada = edita tudo, igual Admin
            or (v_mgmt is not null and v_mgmt = up.management)
            or p_a3_id = any(up.extra_strategic_a3_ids)
            or v_root_id = any(up.extra_strategic_a3_ids)
          )
        )
        or (
          (up.access_role = 'gestao_estrategica' or 'gestao_estrategica' = any(up.additional_access_roles))
          and up.strategic_access_mode = 'write'
          and (p_a3_id = any(up.extra_strategic_a3_ids) or v_root_id = any(up.extra_strategic_a3_ids))
        )
      )
  );
end;
$$;

grant execute on function public.strategic_can_edit_a3(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_save_kpi_record — reemitida (base: migration 163) só
-- acrescentando a checagem de k.is_active. Resto idêntico.
-- ----------------------------------------------------------------------------
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

commit;
