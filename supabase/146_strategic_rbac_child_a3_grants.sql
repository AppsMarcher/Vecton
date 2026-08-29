begin;

-- ============================================================================
-- RBAC granular do módulo A3 — ajuste: concessão por A3-FILHA isolada.
--
-- Até aqui (migrations 142-145), extra_strategic_a3_ids só era checado
-- contra a A3-MÃE resolvida (strategic_a3_root_id) — conceder acesso a uma
-- pessoa exigia sempre dar a área inteira (ex.: Comercial, com Exportação +
-- Pecuária + Peças juntos), mesmo quando ela só devia ver 1 filha.
--
-- Fix: strategic_can_view_a3/strategic_can_edit_a3 passam a aceitar o ID
-- EXATO do A3 (mãe OU filha) em extra_strategic_a3_ids, não só o da mãe.
-- Conceder a MÃE continua cascateando pra todas as filhas automaticamente
-- (raciocínio inalterado); conceder só 1 FILHA agora dá acesso só a ela,
-- sem tocar nas irmãs nem no consolidado da mãe.
--
-- strategic_get_overview precisa saber mostrar essa filha "órfã" (mãe não
-- concedida, só ela) como se fosse uma área de primeiro nível na Tela 1 —
-- senão a pessoa nunca teria como navegar até ela (Tela 1 só lista mães,
-- filha só aparece como aba dentro da Tela 2 da própria mãe). O resto do
-- pipeline (strategic_get_a3_detail, get_monthly_entry, save_kpi_record...)
-- já funciona pra qualquer A3 (mãe ou filha) sem mudança nenhuma — a KPI/
-- ação/análise já é ligada ao A3 específico, nunca "à mãe por tabela
-- própria".
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
begin
  select organization_id, public.strategic_a3_root_id(id) into v_org, v_root_id
  from public.strategic_a3 where id = p_a3_id;
  if v_org is null then return false; end if;

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
begin
  select organization_id, public.strategic_a3_root_id(id), public.strategic_a3_management(id)
  into v_org, v_root_id, v_mgmt
  from public.strategic_a3 where id = p_a3_id;
  if v_org is null then return false; end if;

  return exists (
    select 1 from public.user_profiles up
    where up.organization_id = v_org and up.user_id = auth.uid()
      and (
        up.access_role in ('super_admin', 'admin')
        or (
          (up.access_role = 'manager' or 'manager' = any(up.additional_access_roles))
          and (
            (v_mgmt is not null and v_mgmt = up.management)
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
-- strategic_get_overview — Tela 1: além das A3-mãe visíveis (como já era),
-- também lista como "área" de primeiro nível qualquer A3-FILHA visível cuja
-- mãe NÃO seja visível (senão a pessoa não teria como abri-la). Pra quem já
-- vê a mãe, a filha continua só como aba dentro da Tela 2 — não duplica.
-- Resto idêntico à versão da 145 (childrenCount, canEdit por área).
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
  -- filha visível cuja mãe NÃO está em visible_roots — sem isso ela não
  -- teria entrada nenhuma na Tela 1 (mãe invisível, filha só aparece como
  -- aba dentro da Tela 2 da mãe).
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

commit;
