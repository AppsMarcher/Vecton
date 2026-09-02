begin;

-- ============================================================================
-- RBAC do módulo A3 — reversão do "opt-in puro" pro perfil "A3 Estratégicos"
-- (gestao_estrategica): lista extra_strategic_a3_ids VAZIA volta a significar
-- "sem restrição, enxerga/edita TUDO", igual já acontece em todo o resto do
-- Vecton (Gestor sem Gestão marcada = edita tudo, migration 147;
-- getAllowedCcNumbers/resolveManagementFilter em app.js = sem gestão nem
-- extra nenhum, enxerga tudo igual admin).
--
-- Achado do usuário (2026-09-02, testando com um usuário 'A3 Estratégicos'
-- sem nenhum A3 marcado): esperava ver TODOS os A3, e a tela não mostrava
-- nenhum. Isso reverte de propósito a decisão registrada nas migrations 142
-- ("lista vazia = nenhum, igual todo extra_* do app" — na época achamos que
-- gestao_estrategica seguia o MESMO padrão dos extra_*, mas os extra_* do
-- resto do app são sempre um ADICIONAL sobre uma base que já é ampla
-- (Gestor/Analista com gestão própria, ou sem gestão = tudo) — gestao_
-- estrategica nunca teve essa base, então "lista vazia" nele sempre caiu no
-- caso degenerado "nenhum", nunca no caso "sem restrição" que o resto do
-- app trata como tal) e usersModule.js ("A3 Estratégicos: NADA vem por
-- padrão, tudo é opt-in"). Confirmado explicitamente com o usuário
-- (AskUserQuestion, 2026-09-02) para VISUALIZAÇÃO e também para EDIÇÃO
-- (strategic_access_mode='write'), mesma paridade do Gestor.
--
-- Assim que 1 A3 é marcado em extra_strategic_a3_ids, o comportamento passa
-- a ser exatamente o de antes (só os A3 marcados, mãe cascateando pras
-- filhas) — só o caso "lista 100% vazia" muda de "nenhum" pra "todos".
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
          and (
            cardinality(up.extra_strategic_a3_ids) = 0  -- sem nenhum A3 marcado = enxerga tudo, igual Admin
            or p_a3_id = any(up.extra_strategic_a3_ids)
            or v_root_id = any(up.extra_strategic_a3_ids)
          )
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
            up.management is null  -- sem Gestão marcada = edita tudo, igual Admin
            or (v_mgmt is not null and v_mgmt = up.management)
            or p_a3_id = any(up.extra_strategic_a3_ids)
            or v_root_id = any(up.extra_strategic_a3_ids)
          )
        )
        or (
          (up.access_role = 'gestao_estrategica' or 'gestao_estrategica' = any(up.additional_access_roles))
          and up.strategic_access_mode = 'write'
          and (
            cardinality(up.extra_strategic_a3_ids) = 0  -- sem nenhum A3 marcado = edita tudo, igual Admin
            or p_a3_id = any(up.extra_strategic_a3_ids)
            or v_root_id = any(up.extra_strategic_a3_ids)
          )
        )
      )
  );
end;
$$;

grant execute on function public.strategic_can_edit_a3(uuid) to authenticated;

-- Gate de entrada das RPCs "em lote" (sync_computed) — pra gestao_estrategica
-- em modo write, agora sempre passa (a granularidade real, "todos" ou só os
-- marcados, é resolvida por-A3 dentro de cada RPC via strategic_can_edit_a3,
-- que já sabe do caso "lista vazia = tudo"). Antes exigia
-- cardinality(extra_strategic_a3_ids) > 0, o que barrava na entrada
-- exatamente o caso que passou a ser válido nesta migration.
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
        )
      )
  );
$$;

grant execute on function public.strategic_can_edit_any_a3(uuid) to authenticated;

comment on column public.user_profiles.extra_strategic_a3_ids is
  'IDs de A3-MÃE (strategic_a3.id, sempre parent_id is null) concedidos a esta pessoa. Uso duplo: (1) perfil "A3 Estratégicos" (gestao_estrategica) — lista vazia = SEM restrição, enxerga/edita todos os A3 da org (igual Admin); assim que 1 A3 é marcado, passa a valer só os marcados (mesma regra geral de extra_cc_ids/extra_report_ids/extra_managements no resto do Vecton — migration 184, 2026-09-02); (2) Gestor (manager) — concessão EXTRA de A3 fora da própria Gestão (a Gestão em si já dá edição via strategic_a3.management = up.management, sem precisar listar aqui).';

commit;
