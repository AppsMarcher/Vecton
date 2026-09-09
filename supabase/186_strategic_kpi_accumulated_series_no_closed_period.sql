begin;

-- ============================================================================
-- Fix (achado do usuário, 2026-09-09, testando a 185 ao vivo): checkbox
-- "Acumulado" mostrava o card vazio pra QUALQUER indicador. Causa:
-- strategic_get_kpi_accumulated_series (185) reusava strategic_kpi_
-- accumulated / strategic_kpi_target_accumulated (migrations 131/140) que
-- só contam mês com strategic_a3_periods.status = 'closed' — e essa tabela
-- está vazia (0 linhas) pra esta organização inteira. Ninguém aqui usa o
-- fluxo de "Fechar período", então accumulatedResult/accumulatedTarget já
-- eram sempre null hoje pra qualquer KPI entry_mode='direct' — só não tinha
-- sido notado porque nada em tela hoje depende visualmente deles pra um KPI
-- manual (só os "Auto" tipo EBITDA % Acumulado, que são um KPI À PARTE cujo
-- result_value é escrito por um job de cálculo, não por
-- strategic_kpi_accumulated).
--
-- Reemitida SEM o join com strategic_a3_periods — acumula por accumulation_
-- method direto em cima de strategic_kpi_records/strategic_kpi_targets, meses
-- <= m, ponto. Pra 'ratio_of_sums' em KPI entry_mode='direct' (10 dos 15 KPIs
-- que usam esse método hoje) não tem "recomputar do ledger" que faça sentido
-- (strategic_compute_kpi_result só existe pra entry_mode='computed') — vira
-- "último valor lançado até o mês", mesmo critério que a meta já usa pra
-- ratio_of_sums (comentário original da 140: "não há soma de metas que faça
-- sentido pra uma métrica de razão, é o valor de referência do último mês").
-- ============================================================================
create or replace function public.strategic_get_kpi_accumulated_series(
  p_kpi_id uuid,
  p_year   int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k record;
  v_a3_id uuid;
  v_cycle_id uuid;
  v_scenario_id uuid;
  v_values jsonb;
  v_targets jsonb;
begin
  select id, comparison_mode, attention_band_pct, accumulation_method, entry_mode into k
  from public.strategic_kpis where id = p_kpi_id;
  if k.id is null then
    raise exception 'KPI não encontrado';
  end if;

  select ak.a3_id into v_a3_id from public.strategic_a3_kpis ak
  where ak.kpi_id = p_kpi_id and ak.relationship_type = 'primary' limit 1;
  if v_a3_id is null then
    raise exception 'KPI sem A3 primário';
  end if;

  if not public.strategic_can_view_a3(v_a3_id) then
    raise exception 'sem permissão';
  end if;

  select a.cycle_id into v_cycle_id from public.strategic_a3 a where a.id = v_a3_id;
  select id into v_scenario_id from public.strategic_scenarios
  where cycle_id = v_cycle_id and is_current limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'month', m, 'value', vv.val,
    'status', public.strategic_kpi_status(vv.val, tt.val, null, null, null, k.comparison_mode, k.attention_band_pct)
  ) order by m), '[]'::jsonb)
  into v_values
  from generate_series(1, 12) as m
  cross join lateral (
    select case k.accumulation_method
      when 'sum' then (
        select sum(r.result_value) from public.strategic_kpi_records r
        where r.kpi_id = p_kpi_id and r.year = p_year and r.month <= m
      )
      when 'average' then (
        select avg(r.result_value) from public.strategic_kpi_records r
        where r.kpi_id = p_kpi_id and r.year = p_year and r.month <= m and r.result_value is not null
      )
      when 'weighted_average' then (
        select case when sum(coalesce(br.weight_value, 1)) = 0 then null
                    else sum(br.actual_value * coalesce(br.weight_value, 1)) / sum(coalesce(br.weight_value, 1))
               end
        from public.strategic_kpi_breakdown_rows br
        join public.strategic_kpi_records r on r.id = br.record_id
        where r.kpi_id = p_kpi_id and r.year = p_year and r.month <= m and br.actual_value is not null
      )
      when 'ratio_of_sums' then
        case when k.entry_mode = 'computed' then (
          select public.strategic_compute_kpi_result(p_kpi_id, p_year, 1, mm.last_m)
          from (
            select max(r.month) as last_m from public.strategic_kpi_records r
            where r.kpi_id = p_kpi_id and r.year = p_year and r.month <= m and r.result_value is not null
          ) mm
          where mm.last_m is not null
        ) else (
          select r.result_value from public.strategic_kpi_records r
          where r.kpi_id = p_kpi_id and r.year = p_year and r.month <= m and r.result_value is not null
          order by r.month desc limit 1
        ) end
      when 'last_closed' then (
        select r.result_value from public.strategic_kpi_records r
        where r.kpi_id = p_kpi_id and r.year = p_year and r.month <= m and r.result_value is not null
        order by r.month desc limit 1
      )
      else null
    end as val
  ) vv
  cross join lateral (
    select case k.accumulation_method
      when 'sum' then (
        select sum(t.target_value) from public.strategic_kpi_targets t
        where t.kpi_id = p_kpi_id and t.year = p_year and t.month <= m and t.scenario_id = v_scenario_id
      )
      when 'average', 'weighted_average' then (
        select avg(t.target_value) from public.strategic_kpi_targets t
        where t.kpi_id = p_kpi_id and t.year = p_year and t.month <= m and t.scenario_id = v_scenario_id
          and t.target_value is not null
      )
      when 'last_closed', 'ratio_of_sums' then (
        select t.target_value from public.strategic_kpi_targets t
        where t.kpi_id = p_kpi_id and t.year = p_year and t.month <= m and t.scenario_id = v_scenario_id
          and t.target_value is not null
        order by t.month desc limit 1
      )
      else null
    end as val
  ) tt;

  select coalesce(jsonb_agg(jsonb_build_object('month', m, 'value', tv.val) order by m), '[]'::jsonb)
  into v_targets
  from generate_series(1, 12) as m
  cross join lateral (
    select case k.accumulation_method
      when 'sum' then (
        select sum(t.target_value) from public.strategic_kpi_targets t
        where t.kpi_id = p_kpi_id and t.year = p_year and t.month <= m and t.scenario_id = v_scenario_id
      )
      when 'average', 'weighted_average' then (
        select avg(t.target_value) from public.strategic_kpi_targets t
        where t.kpi_id = p_kpi_id and t.year = p_year and t.month <= m and t.scenario_id = v_scenario_id
          and t.target_value is not null
      )
      when 'last_closed', 'ratio_of_sums' then (
        select t.target_value from public.strategic_kpi_targets t
        where t.kpi_id = p_kpi_id and t.year = p_year and t.month <= m and t.scenario_id = v_scenario_id
          and t.target_value is not null
        order by t.month desc limit 1
      )
      else null
    end as val
  ) tv;

  return jsonb_build_object('monthlyValues', v_values, 'monthlyTargets', v_targets);
end;
$$;

grant execute on function public.strategic_get_kpi_accumulated_series(uuid, int) to authenticated;

commit;
