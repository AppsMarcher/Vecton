begin;

-- ============================================================================
-- Continuação da 176 (anexo por mês, kpi_record_id) — 2 peças que faltavam
-- pro fluxo funcionar de ponta a ponta:
--
-- 1. strategic_get_a3_detail não devolvia o id de strategic_kpi_records do
--    mês corrente — sem ele o frontend não sabe em qual "dono" anexar.
--    Reproduz a função inteira igual (última versão: migration 168), só
--    com 'recordId' a mais no jsonb de cada KPI.
--
-- 2. strategic_ensure_kpi_record — quando o indicador ainda não tem NADA
--    lançado no mês (nem meta nem realizado), não existe registro em
--    strategic_kpi_records nenhum, logo não tem em quê anexar. Cria um
--    registro "vazio" (completion_status='partial', sem result_value) se
--    ainda não existir, e devolve o id — só isso, não mexe em meta nem
--    dispara os cálculos de strategic_save_kpi_record (não é uma "leva
--    de salvar", é só "garante que a linha existe").
-- ============================================================================

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
    select id, result_value, snapshot_target_value, snapshot_target_min, snapshot_target_max,
           snapshot_tolerance, snapshot_comparison_mode
    from public.strategic_kpi_records
    where kpi_id = k.id and year = p_year and month = p_month
  ) cur_r on true
  cross join lateral (
    select jsonb_build_object(
      'id', k.id, 'code', k.code, 'name', k.name, 'description', k.description, 'unit', k.unit,
      'decimalPlaces', k.decimal_places, 'entryMode', k.entry_mode,
      'comparisonMode', k.comparison_mode, 'relationshipType', ak.relationship_type,
      'recordId', cur_r.id,

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

-- ----------------------------------------------------------------------------
-- strategic_ensure_kpi_record — garante que existe uma linha em
-- strategic_kpi_records pro (kpi, ano, mês), pra poder anexar suporte
-- mesmo quando ninguém ainda digitou meta/realizado daquele mês. Mesmo
-- padrão de insert-se-não-existir de strategic_save_kpi_record (163), só
-- que sem tocar em resultado/meta/versão — não é um "save", é só um
-- "garante que a âncora existe".
-- ----------------------------------------------------------------------------
create or replace function public.strategic_ensure_kpi_record(
  p_kpi_id uuid,
  p_year   int,
  p_month  int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_a3_id uuid;
  v_record_id uuid;
begin
  select organization_id, primary_a3_id into v_org, v_a3_id
  from public.strategic_kpis where id = p_kpi_id;
  if v_org is null then raise exception 'KPI não encontrado'; end if;
  if not public.strategic_can_edit_a3(v_a3_id) then
    raise exception 'sem permissão pra editar este indicador';
  end if;

  select id into v_record_id from public.strategic_kpi_records
  where kpi_id = p_kpi_id and year = p_year and month = p_month;

  if v_record_id is null then
    insert into public.strategic_kpi_records (organization_id, kpi_id, year, month, completion_status, updated_by)
    values (v_org, p_kpi_id, p_year, p_month, 'partial', auth.uid())
    returning id into v_record_id;
  end if;

  return v_record_id;
end;
$$;

grant execute on function public.strategic_ensure_kpi_record(uuid, int, int) to authenticated;

commit;
