begin;

-- ============================================================================
-- RBAC granular do módulo A3 — ajuste: Gestor SEM Gestão marcada edita TUDO.
--
-- Achado do usuário (2026-08-29, analisando o perfil de um Gestor sem
-- Gestão atribuída): strategic_can_edit_a3 comparava a Gestão do A3 direto
-- com up.management, e NULL nunca bate com nada em SQL — então um Gestor
-- sem Gestão marcada enxergava tudo (visão é incondicional pro Gestor) mas
-- não editava NADA, nem com "extra" nenhum concedido. Isso destoava do
-- padrão que já existe em OPEX/Headcount (getAllowedManagements, app.js):
-- "Gestor sem nenhuma gestão atribuída — em vez de travar em 'nenhuma',
-- enxerga tudo, igual admin". Decisão do usuário: mesma paridade aqui —
-- Gestor sem Gestão marcada edita TODOS os A3, sem exceção (nem EBITDA
-- fica de fora, que é o mesmo espírito de "igual admin").
--
-- Cuidado que este fix respeita: a condição nova é sobre up.management (a
-- Gestão DO GESTOR) ser null — não sobre v_mgmt (a Gestão DO A3, ex.:
-- EBITDA) ser null. Um Gestor com Gestão própria bem definida (ex.:
-- "Comercial") continua SEM editar EBITDA só porque o EBITDA não tem
-- Gestão — essa regra não mudou, só o caso "Gestor sem Gestão nenhuma".
-- ============================================================================

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
            up.management is null  -- sem Gestão marcada = edita tudo, igual Admin
            or (v_mgmt is not null and v_mgmt = up.management)
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

-- Gate de entrada das RPCs "em lote" (sync_computed) — pra manager, sempre
-- passa (visão já é total, e a granularidade real de edição é resolvida
-- por-A3 dentro de cada RPC via strategic_can_edit_a3, inclusive o novo
-- caso "sem Gestão = tudo").
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
        or up.access_role = 'manager'
        or 'manager' = any(up.additional_access_roles)
        or (
          (up.access_role = 'gestao_estrategica' or 'gestao_estrategica' = any(up.additional_access_roles))
          and up.strategic_access_mode = 'write'
          and cardinality(up.extra_strategic_a3_ids) > 0
        )
      )
  );
$$;

grant execute on function public.strategic_can_edit_any_a3(uuid) to authenticated;

commit;
