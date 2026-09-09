begin;

-- ============================================================================
-- strategic_get_kpi_accumulated_series — pedido do usuário (2026-09-09):
-- checkbox "Acumulado" em CADA indicador do A3 (não só nos poucos que já têm
-- um KPI-irmão "X Acumulado" cadastrado à parte, ex.: EBITDA/MC1 — migration
-- 136). Ligando o checkbox, o gráfico troca pra série acumulada do PRÓPRIO
-- indicador, calculada aqui.
--
-- Reaproveita strategic_kpi_accumulated / strategic_kpi_target_accumulated
-- (migrations 131/140) ponto a ponto — mesma regra de accumulation_method e
-- mesma exigência de período 'closed' que já vale pro valor acumulado único
-- mostrado no card (accumulatedResult/accumulatedTarget). Só chama as duas
-- em loop pra virar uma série de 12 pontos em vez de 1 valor do mês
-- corrente — nenhuma lógica de acumulação nova, zero risco de divergir do
-- que o app já mostra hoje.
--
-- comparisonMode='range' fica sem min/max acumulado (strategic_kpi_
-- target_accumulated só devolve o valor central) — a banda pontilhada
-- simplesmente não aparece na visão acumulada desses KPIs; escopo de uma
-- limitação futura, não deste pedido.
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
  select id, comparison_mode, attention_band_pct into k
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
    'month', m,
    'value', v.val,
    'status', public.strategic_kpi_status(
      v.val, t.val, null, null, null, k.comparison_mode, k.attention_band_pct
    )
  ) order by m), '[]'::jsonb)
  into v_values
  from generate_series(1, 12) as m
  cross join lateral (select public.strategic_kpi_accumulated(p_kpi_id, p_year, m) as val) v
  cross join lateral (select public.strategic_kpi_target_accumulated(p_kpi_id, p_year, m, v_scenario_id) as val) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'month', m,
    'value', public.strategic_kpi_target_accumulated(p_kpi_id, p_year, m, v_scenario_id)
  ) order by m), '[]'::jsonb)
  into v_targets
  from generate_series(1, 12) as m;

  return jsonb_build_object('monthlyValues', v_values, 'monthlyTargets', v_targets);
end;
$$;

grant execute on function public.strategic_get_kpi_accumulated_series(uuid, int) to authenticated;

commit;
