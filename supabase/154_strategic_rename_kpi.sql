begin;

-- ============================================================================
-- Pedido do usuário (2026-08-29): Super Admin e Admin (só esses 2 perfis,
-- nem Gestor nem A3 Estratégicos — é edição de CATÁLOGO, não do A3 em si)
-- ganham um ícone de editar em cada card de indicador, pra trocar o nome e
-- o "subtítulo" (hoje um texto fixo "Realizado vs. meta mensal" igual pra
-- todo mundo).
--
-- "Subtítulo" vira strategic_kpis.description — coluna que já existe desde
-- a migration 128 (schema original) mas nunca foi usada por nenhuma tela
-- até aqui. Sem coluna nova, só passa a aparecer nas RPCs de leitura e
-- ganha uma RPC de escrita dedicada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- strategic_rename_kpi — só super_admin/admin (checagem própria, não
-- reaproveita can_manage_strategic_a3 nem strategic_can_edit_a3 de
-- propósito: isto é catálogo, gestao_estrategica e Gestor nunca editam
-- catálogo, só o A3 em si).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_rename_kpi(
  p_kpi_id      uuid,
  p_name        text,
  p_description text default null
)
returns public.strategic_kpis
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_out public.strategic_kpis;
begin
  select organization_id into v_org from public.strategic_kpis where id = p_kpi_id;
  if v_org is null then raise exception 'KPI não encontrado'; end if;

  if not exists (
    select 1 from public.user_profiles up
    where up.organization_id = v_org and up.user_id = auth.uid()
      and (
        up.access_role in ('super_admin', 'admin')
        or 'super_admin' = any(up.additional_access_roles)
        or 'admin' = any(up.additional_access_roles)
      )
  ) then
    raise exception 'sem permissão — só super_admin/admin editam o catálogo de indicadores';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'nome do indicador é obrigatório';
  end if;

  update public.strategic_kpis
  set name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_kpi_id
  returning * into v_out;

  return v_out;
end;
$$;

grant execute on function public.strategic_rename_kpi(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_deactivate_kpi — a "lixeirinha" (pedido do usuário, mesma leva).
-- Nunca DELETE de verdade: strategic_kpi_records/targets/breakdown_rows
-- têm on delete cascade (migration 128) — apagar a linha destruiria
-- realizado/meta já lançados, sem confirmação nem forma de desfazer. Marca
-- is_active=false — some de toda tela (todas as RPCs de leitura já
-- filtram k.is_active), histórico fica intacto, mesmo padrão já usado pros
-- 4 KPIs de forecast/mix que nunca tiveram fórmula implementada.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_deactivate_kpi(
  p_kpi_id uuid
)
returns public.strategic_kpis
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_out public.strategic_kpis;
begin
  select organization_id into v_org from public.strategic_kpis where id = p_kpi_id;
  if v_org is null then raise exception 'KPI não encontrado'; end if;

  if not exists (
    select 1 from public.user_profiles up
    where up.organization_id = v_org and up.user_id = auth.uid()
      and (
        up.access_role in ('super_admin', 'admin')
        or 'super_admin' = any(up.additional_access_roles)
        or 'admin' = any(up.additional_access_roles)
      )
  ) then
    raise exception 'sem permissão — só super_admin/admin excluem indicadores do catálogo';
  end if;

  update public.strategic_kpis
  set is_active = false, updated_by = auth.uid(), updated_at = now()
  where id = p_kpi_id
  returning * into v_out;

  return v_out;
end;
$$;

grant execute on function public.strategic_deactivate_kpi(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_get_a3_detail — reemitida (base: migration 145) só acrescentando
-- 'description' no kpi_data. Resto idêntico.
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
    select result_value from public.strategic_kpi_records
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
        select coalesce(jsonb_agg(jsonb_build_object('month', m, 'value', t.target_value) order by m), '[]'::jsonb)
        from generate_series(1, 12) as m
        left join public.strategic_kpi_targets t
          on t.kpi_id = k.id and t.year = p_year and t.month = m and t.scenario_id = v_scenario_id
      ),

      'currentResult', cur_r.result_value,
      'currentTarget', jsonb_build_object('value', cur_t.target_value, 'min', cur_t.target_min, 'max', cur_t.target_max, 'tolerance', cur_t.tolerance),
      'accumulatedResult', public.strategic_kpi_accumulated(k.id, p_year, p_month),
      'accumulatedTarget', public.strategic_kpi_target_accumulated(k.id, p_year, p_month, v_scenario_id),
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
    'children', v_children,
    'kpis', v_kpis,
    'canEdit', public.strategic_can_edit_a3(p_a3_id)
  );
end;
$$;

grant execute on function public.strategic_get_a3_detail(uuid, uuid, int, int) to authenticated;

commit;
