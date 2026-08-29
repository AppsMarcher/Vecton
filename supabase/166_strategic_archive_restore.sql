begin;

-- ============================================================================
-- Melhoria #8 do review de segurança (2026-08-29): não existia nenhum jeito
-- de restaurar A3/KPI desativado (strategic_deactivate_a3/
-- strategic_deactivate_kpi, migrations 154/156) nem de listar o que foi
-- arquivado — só sumia da tela, sem volta pela UI (só editando o banco na
-- mão). RPCs novas, mesmo gate strategic_can_manage_catalog (só
-- super_admin/admin — catálogo nunca é editável por Gestor/A3
-- Estratégicos, migration 159).
-- ============================================================================

create or replace function public.strategic_list_archived_a3(
  p_organization_id uuid
)
returns setof public.strategic_a3
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.strategic_can_manage_catalog(p_organization_id) then
    raise exception 'sem permissão — só super_admin/admin veem itens arquivados';
  end if;

  return query
    select a.*
    from public.strategic_a3 a
    where a.organization_id = p_organization_id and a.is_active = false
    order by a.parent_id nulls first, a.name;
end;
$$;

grant execute on function public.strategic_list_archived_a3(uuid) to authenticated;

create or replace function public.strategic_list_archived_kpi(
  p_organization_id uuid
)
returns setof public.strategic_kpis
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.strategic_can_manage_catalog(p_organization_id) then
    raise exception 'sem permissão — só super_admin/admin veem itens arquivados';
  end if;

  return query
    select k.*
    from public.strategic_kpis k
    where k.organization_id = p_organization_id and k.is_active = false
    order by k.name;
end;
$$;

grant execute on function public.strategic_list_archived_kpi(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_restore_a3 — bloqueia restaurar uma A3-FILHA cuja mãe continua
-- arquivada (ficaria invisível mesmo restaurada — strategic_can_view_a3,
-- migration 165, exige mãe E filha ativas). Restaurar a mãe nunca cascateia
-- pras filhas automaticamente (mesmo espírito não-cascateante do
-- strategic_deactivate_a3 original) — cada uma se restaura à parte.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_restore_a3(
  p_a3_id uuid
)
returns public.strategic_a3
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_parent_id uuid;
  v_parent_active boolean;
  v_out public.strategic_a3;
begin
  select organization_id, parent_id into v_org, v_parent_id from public.strategic_a3 where id = p_a3_id;
  if v_org is null then raise exception 'A3 não encontrada'; end if;
  if not public.strategic_can_manage_catalog(v_org) then
    raise exception 'sem permissão — só super_admin/admin restauram A3 do catálogo';
  end if;

  if v_parent_id is not null then
    select is_active into v_parent_active from public.strategic_a3 where id = v_parent_id;
    if not coalesce(v_parent_active, false) then
      raise exception 'a A3-mãe desta A3-filha ainda está arquivada — restaure a mãe primeiro';
    end if;
  end if;

  update public.strategic_a3
  set is_active = true, updated_by = auth.uid(), updated_at = now()
  where id = p_a3_id
  returning * into v_out;

  return v_out;
end;
$$;

grant execute on function public.strategic_restore_a3(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_restore_kpi — bloqueia restaurar um KPI cuja A3 dona continua
-- arquivada, mesma razão do restore de A3-filha acima.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_restore_kpi(
  p_kpi_id uuid
)
returns public.strategic_kpis
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_a3_id uuid;
  v_a3_active boolean;
  v_out public.strategic_kpis;
begin
  select organization_id, primary_a3_id into v_org, v_a3_id from public.strategic_kpis where id = p_kpi_id;
  if v_org is null then raise exception 'KPI não encontrado'; end if;
  if not public.strategic_can_manage_catalog(v_org) then
    raise exception 'sem permissão — só super_admin/admin restauram indicador do catálogo';
  end if;

  select is_active into v_a3_active from public.strategic_a3 where id = v_a3_id;
  if not coalesce(v_a3_active, false) then
    raise exception 'a A3 deste indicador está arquivada — restaure a A3 primeiro';
  end if;

  update public.strategic_kpis
  set is_active = true, updated_by = auth.uid(), updated_at = now()
  where id = p_kpi_id
  returning * into v_out;

  return v_out;
end;
$$;

grant execute on function public.strategic_restore_kpi(uuid) to authenticated;

commit;
