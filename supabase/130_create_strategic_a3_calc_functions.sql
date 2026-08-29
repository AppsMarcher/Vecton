begin;

-- ============================================================================
-- Módulo A3 - Gestão Estratégica — motor de cálculo (Etapa 3, parte 2).
--
-- Depende da migration 129 (dre_gerencial_account_lines). Cobre:
--   - Cálculo dos 13 KPIs entry_mode='computed' (EBITDA%, MC1%, CPV%,
--     GGF Geral%, GGF Produção%, Custo MO, Faturamento/Volume do Comercial
--     + Exportação/Pecuária/Peças).
--   - Situação do KPI (on_target/attention/off_target/not_available).
--   - Gravação manual (direct/drivers/breakdown) com CAS por version.
--   - Fechamento/reabertura de período por A3.
--   - Troca de cenário vigente.
--
-- Fórmula de cada KPI computed é um CASE por k.code em
-- strategic_compute_kpi_result — não um interpretador genérico de
-- formula_config (decisão explícita da especificação: nunca eval/fórmula
-- arbitrária). Acumulado NUNCA é persistido aqui (decisão #7.4) — só o
-- resultado mensal grava em strategic_kpi_records; ratio_of_sums/sum/etc.
-- do acumulado ficam pra RPC de leitura (strategic_get_a3_detail, próxima
-- leva).
--
-- Ficam pra próxima leva: RPCs de leitura pra UI (get_overview,
-- get_a3_detail, get_monthly_entry), strategic_save_period_analysis,
-- strategic_save_action, bucket de anexos, notificações.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- strategic_dre_line_amount — soma de actuals_ledger_entries por line_key da
-- DRE Gerencial, já com o sinal de contribuição ao resultado (mesma
-- convenção do neg() em app.js: receita positiva, custo negativo — por isso
-- retorna -1*soma pra TODOS os grupos, revenue incluído).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_dre_line_amount(
  p_organization_id uuid,
  p_year            int,
  p_month_from      int,
  p_month_to        int,
  p_line_keys       text[],
  p_cc_management   text default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select -1 * coalesce(sum(ale.amount), 0)
  from public.actuals_ledger_entries ale
  join public.dre_gerencial_account_lines dgl
    on dgl.account_number = ale.account_number and dgl.line_key = any(p_line_keys)
  left join public.cost_centers cc
    on cc.organization_id = ale.organization_id and cc.cost_center_number = ale.cost_center_number
  where ale.organization_id = p_organization_id
    and ale.reference_year = p_year
    and ale.reference_month between p_month_from and p_month_to
    and (p_cc_management is null or cc.cost_center_management = p_cc_management);
$$;

grant execute on function public.strategic_dre_line_amount(uuid, int, int, int, text[], text) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_compute_dre_metric — EBITDA%, MC1%, CPV%, GGF Geral%,
-- GGF Produção%. Espelha DRE_GER_DRILLDOWN_COMPOSITE de app.js:
--   receitaLiquida = receita_bruta + impostos + devolucoes + descontos
--   lucroBruto(=MC1 R$) = receitaLiquida + materiais + custos_pessoal + demais_ggf + custo_absorcao
--   ebitda = lucroBruto + despComerciais + despAdmin + outrosResultados
--   CPV (R$, positivo) = receitaLiquida - lucroBruto
--   GGF (R$, positivo) = -(custos_pessoal + demais_ggf)  — SEM custo_absorcao,
--     correção do usuário (28/08): diverge do CPV/MC1, que continuam com
--     custo_absorcao incluído.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_compute_dre_metric(
  p_organization_id uuid,
  p_year            int,
  p_month_from      int,
  p_month_to        int,
  p_metric          text,
  p_cc_management   text default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_receita_liquida  numeric;
  v_lucro_bruto      numeric;
  v_desp_comerciais  numeric;
  v_desp_admin       numeric;
  v_outros           numeric;
  v_ebitda           numeric;
  v_cpv              numeric;
  v_ggf              numeric;
begin
  v_receita_liquida := public.strategic_dre_line_amount(
    p_organization_id, p_year, p_month_from, p_month_to,
    array['receita_bruta','impostos','devolucoes','descontos']
  );

  if v_receita_liquida is null or v_receita_liquida = 0 then
    return null; -- todo %, aqui, tem receita líquida como denominador
  end if;

  case p_metric
    when 'mc1_pct' then
      v_lucro_bruto := v_receita_liquida + public.strategic_dre_line_amount(
        p_organization_id, p_year, p_month_from, p_month_to,
        array['materiais','custos_pessoal','demais_ggf','custo_absorcao']
      );
      return v_lucro_bruto / v_receita_liquida;

    when 'ebitda_pct' then
      v_lucro_bruto := v_receita_liquida + public.strategic_dre_line_amount(
        p_organization_id, p_year, p_month_from, p_month_to,
        array['materiais','custos_pessoal','demais_ggf','custo_absorcao']
      );
      v_desp_comerciais := public.strategic_dre_line_amount(
        p_organization_id, p_year, p_month_from, p_month_to,
        array['comissoes','demais_desp_comerciais']
      );
      v_desp_admin := public.strategic_dre_line_amount(
        p_organization_id, p_year, p_month_from, p_month_to, array['desp_admin']
      );
      v_outros := public.strategic_dre_line_amount(
        p_organization_id, p_year, p_month_from, p_month_to, array['outros_resultados']
      );
      v_ebitda := v_lucro_bruto + v_desp_comerciais + v_desp_admin + v_outros;
      return v_ebitda / v_receita_liquida;

    when 'cogs_pct' then
      v_lucro_bruto := v_receita_liquida + public.strategic_dre_line_amount(
        p_organization_id, p_year, p_month_from, p_month_to,
        array['materiais','custos_pessoal','demais_ggf','custo_absorcao']
      );
      v_cpv := v_receita_liquida - v_lucro_bruto;
      return v_cpv / v_receita_liquida;

    when 'ggf_general_pct' then
      v_ggf := -1 * public.strategic_dre_line_amount(
        p_organization_id, p_year, p_month_from, p_month_to,
        array['custos_pessoal','demais_ggf']
      );
      return v_ggf / v_receita_liquida;

    when 'ggf_production_pct' then
      v_ggf := -1 * public.strategic_dre_line_amount(
        p_organization_id, p_year, p_month_from, p_month_to,
        array['custos_pessoal','demais_ggf'], 'Industrial'
      );
      return v_ggf / v_receita_liquida;

    else
      raise exception 'strategic_compute_dre_metric: métrica desconhecida %', p_metric;
  end case;
end;
$$;

grant execute on function public.strategic_compute_dre_metric(uuid, int, int, int, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_compute_commercial_metric — Faturamento/Volume, Comercial +
-- filhos (origem='FAT', coordenação já vem gravada no ledger pelo trigger
-- de carga — ver project_vecton_comercial).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_compute_commercial_metric(
  p_organization_id uuid,
  p_year            int,
  p_month_from      int,
  p_month_to        int,
  p_field           text,          -- 'valor' | 'quantidade'
  p_coordenacao     text default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(case when p_field = 'valor' then cle.valor else cle.quantidade end), 0)
  from public.comercial_realizado_ledger_entries cle
  left join public.comercial_coordenacoes co on co.id = cle.coordenacao_id
  where cle.organization_id = p_organization_id
    and cle.reference_year = p_year
    and cle.reference_month between p_month_from and p_month_to
    and cle.origem = 'FAT'
    and (p_coordenacao is null or co.nome = p_coordenacao);
$$;

grant execute on function public.strategic_compute_commercial_metric(uuid, int, int, int, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_compute_labor_cost — Custo MO, relatório Headcount Real (aba
-- Custo/colab), classificação PRÓPRIA (line_key='hc_pessoal'), sem sinal
-- invertido — HC_PESSOAL_ACCOUNTS já é somado direto em buildHcRealReport,
-- sem neg().
-- ----------------------------------------------------------------------------
create or replace function public.strategic_compute_labor_cost(
  p_organization_id uuid,
  p_year            int,
  p_month_from      int,
  p_month_to        int
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(ale.amount), 0)
  from public.actuals_ledger_entries ale
  join public.dre_gerencial_account_lines dgl
    on dgl.account_number = ale.account_number and dgl.line_key = 'hc_pessoal'
  where ale.organization_id = p_organization_id
    and ale.reference_year = p_year
    and ale.reference_month between p_month_from and p_month_to;
$$;

grant execute on function public.strategic_compute_labor_cost(uuid, int, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_compute_kpi_result — dispatcher único. Fórmula por k.code
-- (13 KPIs computed confirmados); qualquer outro código marcado 'computed'
-- sem fórmula implementada aqui levanta exceção em vez de devolver um
-- número inventado.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_compute_kpi_result(
  p_kpi_id     uuid,
  p_year       int,
  p_month_from int,
  p_month_to   int
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k record;
begin
  select id, organization_id, code, entry_mode into k
  from public.strategic_kpis where id = p_kpi_id;

  if k.id is null then
    raise exception 'strategic_compute_kpi_result: KPI % não encontrado', p_kpi_id;
  end if;
  if k.entry_mode <> 'computed' then
    raise exception 'strategic_compute_kpi_result: KPI % não é entry_mode=computed (é %)', k.code, k.entry_mode;
  end if;

  case k.code
    when 'ebitda_pct' then
      return public.strategic_compute_dre_metric(k.organization_id, p_year, p_month_from, p_month_to, 'ebitda_pct');
    when 'mc1_pct' then
      return public.strategic_compute_dre_metric(k.organization_id, p_year, p_month_from, p_month_to, 'mc1_pct');
    when 'cogs_pct' then
      return public.strategic_compute_dre_metric(k.organization_id, p_year, p_month_from, p_month_to, 'cogs_pct');
    when 'ggf_general_pct' then
      return public.strategic_compute_dre_metric(k.organization_id, p_year, p_month_from, p_month_to, 'ggf_general_pct');
    when 'ggf_production_pct' then
      return public.strategic_compute_dre_metric(k.organization_id, p_year, p_month_from, p_month_to, 'ggf_production_pct');
    when 'labor_cost' then
      return public.strategic_compute_labor_cost(k.organization_id, p_year, p_month_from, p_month_to);
    when 'commercial_revenue' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'valor');
    when 'commercial_volume' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'quantidade');
    when 'export_revenue' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'valor', 'Exportação');
    when 'export_volume' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'quantidade', 'Exportação');
    when 'livestock_revenue' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'valor', 'Pecuária');
    when 'livestock_volume' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'quantidade', 'Pecuária');
    when 'parts_revenue' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'valor', 'Peças');
    else
      raise exception 'strategic_compute_kpi_result: KPI % marcado computed sem fórmula implementada', k.code;
  end case;
end;
$$;

grant execute on function public.strategic_compute_kpi_result(uuid, int, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_kpi_status — situação do KPI. Banda de atenção configurável por
-- KPI (attention_band_pct, migration 129), nunca hardcoded aqui nem no
-- frontend.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_kpi_status(
  p_result             numeric,
  p_target_value       numeric,
  p_target_min         numeric,
  p_target_max         numeric,
  p_tolerance          numeric,
  p_comparison_mode    text,
  p_attention_band_pct numeric default 0.05
)
returns text
language plpgsql
immutable
as $$
begin
  if p_result is null then
    return 'not_available';
  end if;

  case p_comparison_mode
    when 'higher' then
      if p_target_value is null then return 'not_available'; end if;
      if p_result >= p_target_value then return 'on_target'; end if;
      if p_target_value <> 0 and (p_target_value - p_result) / abs(p_target_value) <= p_attention_band_pct then
        return 'attention';
      end if;
      return 'off_target';

    when 'lower' then
      if p_target_value is null then return 'not_available'; end if;
      if p_result <= p_target_value then return 'on_target'; end if;
      if p_target_value <> 0 and (p_result - p_target_value) / abs(p_target_value) <= p_attention_band_pct then
        return 'attention';
      end if;
      return 'off_target';

    when 'range' then
      if p_target_min is null or p_target_max is null then return 'not_available'; end if;
      if p_result between p_target_min and p_target_max then return 'on_target'; end if;
      return 'off_target';

    when 'exact' then
      if p_target_value is null then return 'not_available'; end if;
      if p_result = p_target_value then return 'on_target'; end if;
      return 'off_target';

    when 'exact_with_tolerance' then
      if p_target_value is null then return 'not_available'; end if;
      if abs(p_result - p_target_value) <= coalesce(p_tolerance, 0) then return 'on_target'; end if;
      return 'off_target';

    else
      return 'not_available';
  end case;
end;
$$;

grant execute on function public.strategic_kpi_status(numeric, numeric, numeric, numeric, numeric, text, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_sync_computed_kpi_records — roda o dispatcher pra todo KPI
-- entry_mode='computed' ativo da org, grava o resultado MENSAL (nunca o
-- acumulado — decisão #7.4). Pula silenciosamente A3 com o período já
-- fechado (decisão #19), sem quebrar o restante do lote.
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
  if not public.can_manage_strategic_a3(p_organization_id) then
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
-- strategic_save_kpi_record — gravação manual (direct/drivers/breakdown),
-- CAS por version. KPI computed é rejeitado aqui de propósito (usa
-- strategic_sync_computed_kpi_records). Recalcula result_value no servidor
-- a partir do que acabou de gravar — nunca aceita um result_value calculado
-- pelo cliente pra drivers/breakdown.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_save_kpi_record(
  p_kpi_id            uuid,
  p_year              int,
  p_month             int,
  p_result_value      numeric default null,  -- só usado quando entry_mode='direct'
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
  if k.entry_mode = 'computed' then
    raise exception 'KPI % é calculado automaticamente — use strategic_sync_computed_kpi_records', k.code;
  end if;
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
-- Fechamento / reabertura de período por A3 (decisão #9).
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
  if not public.can_manage_strategic_a3(v_org) then raise exception 'sem permissão pra fechar período'; end if;

  select id into v_current_scenario from public.strategic_scenarios
  where cycle_id = v_cycle and is_current limit 1;

  -- fixa cenário+meta em cada registro do mês antes de fechar — trocar o
  -- cenário vigente depois não reclassifica período já fechado (decisão #14)
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
  if not public.can_manage_strategic_a3(v_org) then raise exception 'sem permissão pra reabrir período'; end if;

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
-- strategic_set_current_scenario — troca o cenário vigente do ciclo.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_set_current_scenario(
  p_scenario_id uuid
)
returns public.strategic_scenarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_cycle uuid;
  v_out public.strategic_scenarios;
begin
  select organization_id, cycle_id into v_org, v_cycle
  from public.strategic_scenarios where id = p_scenario_id;
  if v_org is null then raise exception 'cenário não encontrado'; end if;
  if not public.can_manage_strategic_a3(v_org) then raise exception 'sem permissão'; end if;

  update public.strategic_scenarios set is_current = false
  where cycle_id = v_cycle and is_current and id <> p_scenario_id;

  update public.strategic_scenarios set is_current = true, updated_at = now()
  where id = p_scenario_id
  returning * into v_out;

  return v_out;
end;
$$;

grant execute on function public.strategic_set_current_scenario(uuid) to authenticated;

commit;
