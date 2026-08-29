begin;

-- ============================================================================
-- Pedido do usuário: pra KPIs 'computed' (EBITDA%, MC1%, CPV%, GGF, Custo MO,
-- Faturamento/Volume...), "Sincronizar automáticos" deve preencher o campo
-- Realizado como SUGESTÃO EDITÁVEL, não um valor travado — a pessoa pode
-- concordar (não mexe) ou corrigir e salvar por cima, no mesmo botão único
-- "Salvar" de qualquer outro indicador.
--
-- strategic_save_kpi_record até aqui REJEITAVA qualquer tentativa de salvar
-- manualmente um KPI computed (só aceitava via strategic_sync_computed_
-- kpi_records). Remove essa trava — computed passa a poder ser sobrescrito
-- manualmente pelo mesmo caminho de um KPI 'direct' (usa p_result_value
-- direto, sem recomputar). strategic_sync_computed_kpi_records continua
-- existindo do jeito que está, só que agora é "puxar a sugestão", não mais
-- "a única forma de o valor mudar".
-- ============================================================================

create or replace function public.strategic_save_kpi_record(
  p_kpi_id            uuid,
  p_year              int,
  p_month             int,
  p_result_value      numeric default null,  -- usado quando entry_mode='direct' OU sobrescrita manual de 'computed'
  p_expected_version  bigint default null,    -- null = registro ainda não existe
  p_driver_inputs     jsonb default null,     -- [{driver_code, numeric_value, text_value}]
  p_breakdown_rows    jsonb default null      -- [{dimension_key, dimension_label, planned_value, actual_value, weight_value, display_order}]
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
  if not public.can_manage_strategic_a3(k.organization_id) then
    raise exception 'sem permissão para editar este KPI';
  end if;

  select ak.a3_id into v_a3_id
  from public.strategic_a3_kpis ak
  where ak.kpi_id = k.id and ak.relationship_type = 'primary'
  limit 1;

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

commit;
