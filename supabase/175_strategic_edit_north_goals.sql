begin;

-- ============================================================================
-- Pedido do usuário (2026-08-29): o card "Norte Verdadeiro" (Tela 1) só
-- tinha leitura — as 6 metas macro da empresa (Receita Líquida, EBITDA
-- etc.) só existiam via seed/SQL direto. Botão de editar (lápis), só
-- super_admin/admin, mesmo fluxo de permissão do resto do catálogo
-- (strategic_can_manage_catalog — cria/edita A3, indicador, etc.).
--
-- strategic_get_overview (última versão: migration 164) devolvia
-- northGoals SEM o "id" de cada meta — dava pra listar mas não pra saber
-- QUAL linha editar depois. Reproduz a função inteira idêntica, só com
-- 'id' a mais no jsonb_build_object das metas.
-- ============================================================================

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
  if not public.strategic_can_access_module(p_organization_id) then
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
    'id', g.id, 'code', g.code, 'title', g.title, 'description', g.description,
    'targetLabel', g.target_label, 'displayOrder', g.display_order
  ) order by g.display_order), '[]'::jsonb)
  into v_north
  from public.strategic_north_goals g
  where g.cycle_id = v_cycle_id and g.is_active;

  with kpi_status as (
    select
      ak.a3_id,
      k.id as kpi_id,
      case when p.status = 'closed' then public.strategic_kpi_status(
          rec.result_value, rec.snapshot_target_value, rec.snapshot_target_min, rec.snapshot_target_max,
          rec.snapshot_tolerance, coalesce(rec.snapshot_comparison_mode, k.comparison_mode), k.attention_band_pct
        ) else public.strategic_kpi_status(
          rec.result_value, tgt.target_value, tgt.target_min, tgt.target_max, tgt.tolerance,
          k.comparison_mode, k.attention_band_pct
        )
      end as status
    from public.strategic_a3_kpis ak
    join public.strategic_kpis k on k.id = ak.kpi_id and k.is_active
    left join public.strategic_a3_periods p on p.a3_id = ak.a3_id and p.year = p_year and p.month = p_month
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
  ),
  children_agg as (
    select parent_id, count(*) as children_count
    from public.strategic_a3
    where cycle_id = v_cycle_id and is_active and parent_id is not null
    group by parent_id
  ),
  visible_roots as (
    select a.* from public.strategic_a3 a
    where a.cycle_id = v_cycle_id and a.is_active and a.parent_id is null
      and public.strategic_can_view_a3(a.id)
  ),
  visible_orphan_children as (
    select c.* from public.strategic_a3 c
    where c.cycle_id = v_cycle_id and c.is_active and c.parent_id is not null
      and public.strategic_can_view_a3(c.id)
      and not exists (select 1 from visible_roots vr where vr.id = c.parent_id)
  ),
  visible_areas as (
    select * from visible_roots
    union all
    select * from visible_orphan_children
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'code', a.code, 'name', a.name, 'parentId', a.parent_id,
    'color', a.color, 'displayOrder', a.display_order,
    'totalKpis', coalesce(agg.total_kpis, 0),
    'onTargetCount', coalesce(agg.on_target_count, 0),
    'attentionCount', coalesce(agg.attention_count, 0),
    'offTargetCount', coalesce(agg.off_target_count, 0),
    'notAvailableCount', coalesce(agg.not_available_count, 0),
    'childrenCount', coalesce(ca.children_count, 0),
    'canEdit', public.strategic_can_edit_a3(a.id)
  ) order by a.display_order), '[]'::jsonb)
  into v_areas
  from visible_areas a
  left join area_agg agg on agg.a3_id = a.id
  left join children_agg ca on ca.parent_id = a.id;

  return jsonb_build_object('northGoals', v_north, 'areas', v_areas);
end;
$$;

grant execute on function public.strategic_get_overview(uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_save_north_goals — substitui a lista inteira de metas do ciclo
-- num RPC só, mesmo padrão de strategic_save_period_analysis (145): apaga
-- quem não veio no payload, faz upsert (update se veio "id", insert se
-- não veio) de quem ficou. display_order = posição no array recebido —
-- não tem drag-and-drop na UI, a ordem de edição já É a ordem de exibição.
-- Título vazio é ignorado silenciosamente (linha em branco do "+ Nova
-- meta" que a pessoa não preencheu não vira lixo no banco).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_save_north_goals(
  p_organization_id uuid,
  p_year            int,
  p_goals           jsonb default '[]'::jsonb
)
returns setof public.strategic_north_goals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_id uuid;
  v_goal jsonb;
  v_order int := 0;
begin
  if not public.strategic_can_manage_catalog(p_organization_id) then
    raise exception 'sem permissão — só super_admin/admin editam o Norte Verdadeiro';
  end if;

  select id into v_cycle_id from public.strategic_cycles
  where organization_id = p_organization_id and year = p_year limit 1;
  if v_cycle_id is null then raise exception 'ciclo % não encontrado', p_year; end if;

  delete from public.strategic_north_goals
  where cycle_id = v_cycle_id
    and id <> all (
      coalesce(
        array(select (elem->>'id')::uuid from jsonb_array_elements(p_goals) elem where elem->>'id' is not null),
        array[]::uuid[]
      )
    );

  for v_goal in select * from jsonb_array_elements(p_goals) loop
    if coalesce(trim(v_goal->>'title'), '') = '' then
      continue;
    end if;

    if v_goal->>'id' is not null then
      update public.strategic_north_goals
      set title = v_goal->>'title',
          target_label = nullif(v_goal->>'target_label', ''),
          display_order = v_order,
          updated_at = now()
      where id = (v_goal->>'id')::uuid and cycle_id = v_cycle_id;
    else
      insert into public.strategic_north_goals (organization_id, cycle_id, title, target_label, display_order)
      values (p_organization_id, v_cycle_id, v_goal->>'title', nullif(v_goal->>'target_label', ''), v_order);
    end if;

    v_order := v_order + 1;
  end loop;

  return query select * from public.strategic_north_goals where cycle_id = v_cycle_id order by display_order;
end;
$$;

grant execute on function public.strategic_save_north_goals(uuid, int, jsonb) to authenticated;

commit;
