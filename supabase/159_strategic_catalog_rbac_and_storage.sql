begin;

-- ============================================================================
-- Achado #2 do review de segurança (2026-08-29): o novo RBAC por-A3
-- (migrations 142-147) nunca chegou nas tabelas de CATÁLOGO nem no Storage.
--
-- Catálogo (ciclos, cenários, Norte Verdadeiro, catálogo de KPI, drivers,
-- benchmarks, responsáveis de A3/KPI): as policies de escrita (migration
-- 144, e as nunca tocadas da 128) continuam em can_manage_strategic_a3(org),
-- que libera QUALQUER perfil gestao_estrategica — inclusive
-- strategic_access_mode='read' e sem nenhum A3 em extra_strategic_a3_ids —
-- pra fazer POST/PATCH/DELETE DIRETO via PostgREST nessas tabelas. Isso já
-- contorna sozinho a intenção documentada no comentário da própria 143
-- ("catálogo nunca editável por Gestor/A3 Estratégicos") E as RPCs de
-- catálogo mais novas (154, 155, 156), que já fazem a coisa certa (só
-- super_admin/admin) mas não protegem contra quem escreve na tabela direto,
-- sem passar pela RPC.
--
-- Fix: strategic_can_manage_catalog(org) — só super_admin/admin (mesma
-- checagem que 154/155/156 já fazem inline) — substitui
-- can_manage_strategic_a3 nas policies de ESCRITA dessas tabelas. SELECT
-- (strategic_can_access_module) fica como está.
--
-- Storage (migration 133): as 4 policies do bucket strategic-a3-attachments
-- só validavam organização — qualquer pessoa com QUALQUER perfil do módulo
-- lia/subia/apagava anexo de QUALQUER A3 da org, sem checar o A3 dono do
-- anexo nem o modo (read/write). O path já embute o dono
-- (organization_id/ano/mês/entity_type/entity_id/arquivo — entity_type é
-- 'action' ou 'analysis_item' hoje, 'kpi_record' reservado pra quando ganhar
-- tela, mesmo padrão single-owner de strategic_attachments/128), então dá
-- pra resolver o A3 pelo próprio path sem round-trip na tabela.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- strategic_can_manage_catalog — só super_admin/admin (primário OU
-- adicional), mesma checagem que já está duplicada inline em
-- strategic_create_a3/strategic_create_kpi/strategic_deactivate_a3/
-- strategic_rename_kpi/strategic_deactivate_kpi (RPCs mantidas como estão —
-- fora de escopo deste fix reescrevê-las, elas já estão corretas).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_can_manage_catalog(target_organization_id uuid)
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
        or 'super_admin' = any(up.additional_access_roles)
        or 'admin' = any(up.additional_access_roles)
      )
  );
$$;

grant execute on function public.strategic_can_manage_catalog(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Tabelas de catálogo/config (migration 144 as reescreveu com SELECT
-- alargado; troca aqui só a policy de ESCRITA de cada uma).
-- ----------------------------------------------------------------------------
drop policy if exists "strategic write on strategic_cycles" on public.strategic_cycles;
create policy "strategic write on strategic_cycles"
on public.strategic_cycles for all
using (public.strategic_can_manage_catalog(organization_id))
with check (public.strategic_can_manage_catalog(organization_id));

drop policy if exists "strategic write on strategic_north_goals" on public.strategic_north_goals;
create policy "strategic write on strategic_north_goals"
on public.strategic_north_goals for all
using (public.strategic_can_manage_catalog(organization_id))
with check (public.strategic_can_manage_catalog(organization_id));

drop policy if exists "strategic write on strategic_scenarios" on public.strategic_scenarios;
create policy "strategic write on strategic_scenarios"
on public.strategic_scenarios for all
using (public.strategic_can_manage_catalog(organization_id))
with check (public.strategic_can_manage_catalog(organization_id));

drop policy if exists "strategic write on strategic_kpis" on public.strategic_kpis;
create policy "strategic write on strategic_kpis"
on public.strategic_kpis for all
using (public.strategic_can_manage_catalog(organization_id))
with check (public.strategic_can_manage_catalog(organization_id));

drop policy if exists "strategic write on strategic_kpi_drivers" on public.strategic_kpi_drivers;
create policy "strategic write on strategic_kpi_drivers"
on public.strategic_kpi_drivers for all
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_drivers.kpi_id and public.strategic_can_manage_catalog(k.organization_id)
))
with check (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_drivers.kpi_id and public.strategic_can_manage_catalog(k.organization_id)
));

drop policy if exists "strategic write on strategic_kpi_benchmarks" on public.strategic_kpi_benchmarks;
create policy "strategic write on strategic_kpi_benchmarks"
on public.strategic_kpi_benchmarks for all
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_benchmarks.kpi_id and public.strategic_can_manage_catalog(k.organization_id)
))
with check (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_benchmarks.kpi_id and public.strategic_can_manage_catalog(k.organization_id)
));

-- strategic_a3_owners / strategic_kpi_owners — nunca tocadas desde a 128
-- (sem tela consumidora até hoje, mesma nota da 144), mas o mesmo bug de
-- "qualquer gestao_estrategica escreve" existia nelas — fix de graça.
drop policy if exists "strategic managers all on strategic_a3_owners" on public.strategic_a3_owners;
create policy "strategic managers all on strategic_a3_owners"
on public.strategic_a3_owners for all
using (exists (
  select 1 from public.strategic_a3 a
  where a.id = strategic_a3_owners.a3_id and public.strategic_can_manage_catalog(a.organization_id)
))
with check (exists (
  select 1 from public.strategic_a3 a
  where a.id = strategic_a3_owners.a3_id and public.strategic_can_manage_catalog(a.organization_id)
));

drop policy if exists "strategic managers all on strategic_kpi_owners" on public.strategic_kpi_owners;
create policy "strategic managers all on strategic_kpi_owners"
on public.strategic_kpi_owners for all
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_owners.kpi_id and public.strategic_can_manage_catalog(k.organization_id)
))
with check (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_owners.kpi_id and public.strategic_can_manage_catalog(k.organization_id)
));

-- ----------------------------------------------------------------------------
-- strategic_set_current_scenario — troca de cenário afeta a meta vigente da
-- ORGANIZAÇÃO INTEIRA (não só 1 A3); decisão do usuário (2026-08-29):
-- restringir a super_admin/admin, mesmo padrão do resto do catálogo (era
-- can_manage_strategic_a3, qualquer gestao_estrategica).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_set_current_scenario(
  p_scenario_id uuid
)
returns public.strategic_scenarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_cycle uuid;
  v_out public.strategic_scenarios;
begin
  select organization_id, cycle_id into v_org, v_cycle
  from public.strategic_scenarios where id = p_scenario_id;
  if v_org is null then raise exception 'cenário não encontrado'; end if;
  if not public.strategic_can_manage_catalog(v_org) then raise exception 'sem permissão'; end if;

  update public.strategic_scenarios set is_current = false
  where cycle_id = v_cycle and is_current and id <> p_scenario_id;

  update public.strategic_scenarios set is_current = true, updated_at = now()
  where id = p_scenario_id
  returning * into v_out;

  return v_out;
end;
$$;

grant execute on function public.strategic_set_current_scenario(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- strategic_attachment_a3_ok — resolve o A3 dono de um anexo a partir do
-- path do Storage (organization_id/ano/mês/entity_type/entity_id/arquivo) e
-- aplica strategic_can_view_a3/strategic_can_edit_a3 (ou
-- strategic_action_viewable/editable pra entity_type='action', que já
-- resolve N:N com A3). entity_type/entity_id desconhecido ou não resolvível
-- (registro apagado, UUID inválido) nega, nunca libera por omissão.
-- ----------------------------------------------------------------------------
create or replace function public.strategic_attachment_a3_ok(p_path text[], p_want_edit boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_a3_id uuid;
begin
  if p_path is null or array_length(p_path, 1) < 5 then return false; end if;

  v_entity_type := p_path[4];
  begin
    v_entity_id := p_path[5]::uuid;
  exception when others then
    return false;
  end;

  if v_entity_type = 'kpi_record' then
    select k.primary_a3_id into v_a3_id
    from public.strategic_kpi_records r
    join public.strategic_kpis k on k.id = r.kpi_id
    where r.id = v_entity_id;
    if v_a3_id is null then return false; end if;
    return case when p_want_edit then public.strategic_can_edit_a3(v_a3_id) else public.strategic_can_view_a3(v_a3_id) end;

  elsif v_entity_type = 'analysis_item' then
    select pa.a3_id into v_a3_id
    from public.strategic_analysis_items ai
    join public.strategic_period_analyses pa on pa.id = ai.analysis_id
    where ai.id = v_entity_id;
    if v_a3_id is null then return false; end if;
    return case when p_want_edit then public.strategic_can_edit_a3(v_a3_id) else public.strategic_can_view_a3(v_a3_id) end;

  elsif v_entity_type = 'action' then
    return case when p_want_edit then public.strategic_action_editable(v_entity_id) else public.strategic_action_viewable(v_entity_id) end;

  else
    return false;
  end if;
end;
$$;

grant execute on function public.strategic_attachment_a3_ok(text[], boolean) to authenticated;

drop policy if exists "strategic managers read strategic a3 attachments" on storage.objects;
create policy "strategic managers read strategic a3 attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'strategic-a3-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.strategic_attachment_a3_ok(storage.foldername(name), false)
);

drop policy if exists "strategic managers upload strategic a3 attachments" on storage.objects;
create policy "strategic managers upload strategic a3 attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'strategic-a3-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.strategic_attachment_a3_ok(storage.foldername(name), true)
);

drop policy if exists "strategic managers update strategic a3 attachments" on storage.objects;
create policy "strategic managers update strategic a3 attachments"
on storage.objects for update
to authenticated
using (
  bucket_id = 'strategic-a3-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.strategic_attachment_a3_ok(storage.foldername(name), true)
)
with check (
  bucket_id = 'strategic-a3-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.strategic_attachment_a3_ok(storage.foldername(name), true)
);

drop policy if exists "strategic managers delete strategic a3 attachments" on storage.objects;
create policy "strategic managers delete strategic a3 attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'strategic-a3-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.strategic_attachment_a3_ok(storage.foldername(name), true)
);

commit;
