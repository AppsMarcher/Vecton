begin;

-- ============================================================================
-- RBAC granular do módulo A3 — parte 2/4: funções de resolução.
--
-- can_manage_strategic_a3(org) (migration 128) NÃO muda de significado —
-- continua "super_admin/admin/gestao_estrategica (qualquer modo) no nível
-- da ORG", sem noção de A3. Mantida assim de propósito, e continua sendo
-- usada em 2 lugares que são genuinamente org-wide, não por-A3: troca do
-- cenário vigente (strategic_set_current_scenario) e escrita nas tabelas de
-- catálogo/config que não pertencem a 1 A3 só (ciclos, cenários, catálogo
-- de KPI, drivers, benchmarks — curadas por quem administra o módulo,
-- nunca pelo Gestor de uma área). Todas as funções NOVAS abaixo é que
-- entendem "por A3".
-- ============================================================================

-- Resolve a A3-MÃE de qualquer A3 (raiz devolve a si mesma, filha devolve o
-- parent_id). Só 2 níveis de hierarquia no modelo atual (mãe/filho, nunca
-- neto — Tela 1/2 do frontend só conhecem esses 2 níveis), não precisa de
-- função recursiva.
create or replace function public.strategic_a3_root_id(p_a3_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(a3.parent_id, a3.id) from public.strategic_a3 a3 where a3.id = p_a3_id;
$$;

grant execute on function public.strategic_a3_root_id(uuid) to authenticated;

-- Gestão da A3-mãe (raiz) de qualquer A3 dado (filha herda da mãe).
create or replace function public.strategic_a3_management(p_a3_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select root.management
  from public.strategic_a3 a3
  join public.strategic_a3 root on root.id = coalesce(a3.parent_id, a3.id)
  where a3.id = p_a3_id;
$$;

grant execute on function public.strategic_a3_management(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_can_view_a3 — quem pode VER esta A3 (raiz ou filha):
--   super_admin/admin/manager: sempre (Gestor tem visão TOTAL do módulo,
--   independente de Gestão — só a EDIÇÃO é restrita).
--   gestao_estrategica ("A3 Estratégicos"): só se a A3-mãe estiver em
--   extra_strategic_a3_ids — em QUALQUER modo (read ou write; modo só
--   distingue leitura de gravação, não afeta o que a pessoa enxerga).
-- ----------------------------------------------------------------------------
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
          and v_root_id = any(up.extra_strategic_a3_ids)
        )
      )
  );
end;
$$;

grant execute on function public.strategic_can_view_a3(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_can_edit_a3 — quem pode EDITAR esta A3 (raiz ou filha):
--   super_admin/admin: sempre.
--   manager (Gestor): a Gestão da A3-mãe bate com up.management, OU a
--   A3-mãe está em extra_strategic_a3_ids (concessão pontual além da
--   própria Gestão).
--   gestao_estrategica ("A3 Estratégicos"): strategic_access_mode='write'
--   E a A3-mãe está em extra_strategic_a3_ids.
-- ----------------------------------------------------------------------------
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
            or v_root_id = any(up.extra_strategic_a3_ids)
          )
        )
        or (
          (up.access_role = 'gestao_estrategica' or 'gestao_estrategica' = any(up.additional_access_roles))
          and up.strategic_access_mode = 'write'
          and v_root_id = any(up.extra_strategic_a3_ids)
        )
      )
  );
end;
$$;

grant execute on function public.strategic_can_edit_a3(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_can_edit_any_a3 — gate de ENTRADA pras RPCs de escrita que não
-- recebem um a3_id único de cara (ex.: sync_computed roda pra vários KPIs
-- de vários A3 numa chamada só). Só confirma que a pessoa tem edição em
-- PELO MENOS 1 A3 da org — a checagem fina por A3 específico continua
-- acontecendo dentro da RPC, via strategic_can_edit_a3 por linha/KPI.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_can_edit_any_a3(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.organization_id = target_organization_id
      and up.user_id = auth.uid()
      and (
        up.access_role in ('super_admin', 'admin')
        or (
          (up.access_role = 'manager' or 'manager' = any(up.additional_access_roles))
          and (up.management is not null or cardinality(up.extra_strategic_a3_ids) > 0)
        )
        or (
          (up.access_role = 'gestao_estrategica' or 'gestao_estrategica' = any(up.additional_access_roles))
          and up.strategic_access_mode = 'write'
          and cardinality(up.extra_strategic_a3_ids) > 0
        )
      )
  );
$$;

grant execute on function public.strategic_can_edit_any_a3(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_can_access_module — visão AMPLA (org-level, não por A3), pra
-- telas/tabelas que não são por-A3 (catálogo de KPI, ciclos, cenários) e
-- pro ponto de entrada de leitura (ensureContext, que resolve
-- cycle_id/scenario_id ANTES de saber qual A3 o usuário vai abrir).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_can_access_module(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.organization_id = target_organization_id
      and up.user_id = auth.uid()
      and (
        up.access_role in ('super_admin', 'admin', 'manager')
        or 'manager' = any(up.additional_access_roles)
        or up.access_role = 'gestao_estrategica'
        or 'gestao_estrategica' = any(up.additional_access_roles)
      )
  );
$$;

grant execute on function public.strategic_can_access_module(uuid) to authenticated;

commit;
