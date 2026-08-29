begin;

-- ============================================================================
-- RBAC granular do módulo A3 — parte 3/4: políticas de tabela.
--
-- Toda tabela de dado OPERACIONAL (por A3) ganha 2 políticas em vez de 1
-- "for all": SELECT via strategic_can_view_a3 (Gestor vê tudo), escrita
-- (INSERT/UPDATE/DELETE) via strategic_can_edit_a3 (Gestor só a Gestão
-- dele; A3 Estratégicos só o que foi concedido, e só em modo write).
--
-- Tabelas de CATÁLOGO/CONFIG (não pertencem a 1 A3: ciclos, cenários,
-- catálogo de KPI, drivers, benchmarks, e as tabelas de "owner" que o
-- frontend nunca usa) só têm o SELECT alargado pra strategic_can_access_module
-- (deixa Gestor/A3-Estratégicos passarem pelo ensureContext() e pelas RPCs
-- de leitura) — a ESCRITA nessas continua com can_manage_strategic_a3
-- (migration 128, inalterada: só quem já podia curar o catálogo antes
-- continua podendo — Gestor nunca edita catálogo).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers de resolução pra ação (pode ligar a mais de 1 A3) e anexo
-- (exatamente 1 dono entre kpi_record/analysis_item/action).
-- ----------------------------------------------------------------------------
create or replace function public.strategic_action_viewable(p_action_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.strategic_action_a3 saa
    where saa.action_id = p_action_id and public.strategic_can_view_a3(saa.a3_id)
  );
$$;

grant execute on function public.strategic_action_viewable(uuid) to authenticated;

create or replace function public.strategic_action_editable(p_action_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.strategic_action_a3 saa
    where saa.action_id = p_action_id and public.strategic_can_edit_a3(saa.a3_id)
  );
$$;

grant execute on function public.strategic_action_editable(uuid) to authenticated;

-- ============================================================================
-- 1. strategic_a3
-- ============================================================================
-- Nota: strategic_can_edit_a3(id) só resolve linha JÁ existente (faz SELECT
-- na própria tabela) — não há INSERT de A3 pelo app hoje (só migration/
-- seed, que roda como service role e não passa por RLS), então "for all"
-- aqui na prática só habilita UPDATE (edição do objetivo) e DELETE.
drop policy if exists "strategic managers all on strategic_a3" on public.strategic_a3;
create policy "strategic view on strategic_a3"
on public.strategic_a3 for select
using (public.strategic_can_view_a3(id));
create policy "strategic write on strategic_a3"
on public.strategic_a3 for all
using (public.strategic_can_edit_a3(id))
with check (public.strategic_can_edit_a3(id));

-- ============================================================================
-- 2. strategic_a3_kpis (a3_id direto)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_a3_kpis" on public.strategic_a3_kpis;
create policy "strategic view on strategic_a3_kpis"
on public.strategic_a3_kpis for select
using (public.strategic_can_view_a3(a3_id));
create policy "strategic write on strategic_a3_kpis"
on public.strategic_a3_kpis for all
using (public.strategic_can_edit_a3(a3_id))
with check (public.strategic_can_edit_a3(a3_id));

-- ============================================================================
-- 3. strategic_kpi_targets (via kpi_id -> strategic_kpis.primary_a3_id)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_kpi_targets" on public.strategic_kpi_targets;
create policy "strategic view on strategic_kpi_targets"
on public.strategic_kpi_targets for select
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_targets.kpi_id and public.strategic_can_view_a3(k.primary_a3_id)
));
create policy "strategic write on strategic_kpi_targets"
on public.strategic_kpi_targets for all
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_targets.kpi_id and public.strategic_can_edit_a3(k.primary_a3_id)
))
with check (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_targets.kpi_id and public.strategic_can_edit_a3(k.primary_a3_id)
));

-- ============================================================================
-- 4. strategic_a3_periods (a3_id direto)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_a3_periods" on public.strategic_a3_periods;
create policy "strategic view on strategic_a3_periods"
on public.strategic_a3_periods for select
using (public.strategic_can_view_a3(a3_id));
create policy "strategic write on strategic_a3_periods"
on public.strategic_a3_periods for all
using (public.strategic_can_edit_a3(a3_id))
with check (public.strategic_can_edit_a3(a3_id));

-- ============================================================================
-- 5. strategic_kpi_records (via kpi_id -> strategic_kpis.primary_a3_id)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_kpi_records" on public.strategic_kpi_records;
create policy "strategic view on strategic_kpi_records"
on public.strategic_kpi_records for select
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_records.kpi_id and public.strategic_can_view_a3(k.primary_a3_id)
));
create policy "strategic write on strategic_kpi_records"
on public.strategic_kpi_records for all
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_records.kpi_id and public.strategic_can_edit_a3(k.primary_a3_id)
))
with check (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_records.kpi_id and public.strategic_can_edit_a3(k.primary_a3_id)
));

-- ============================================================================
-- 6. strategic_kpi_record_inputs (via record_id -> kpi_id -> primary_a3_id)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_kpi_record_inputs" on public.strategic_kpi_record_inputs;
create policy "strategic view on strategic_kpi_record_inputs"
on public.strategic_kpi_record_inputs for select
using (exists (
  select 1 from public.strategic_kpi_records r
  join public.strategic_kpis k on k.id = r.kpi_id
  where r.id = strategic_kpi_record_inputs.record_id and public.strategic_can_view_a3(k.primary_a3_id)
));
create policy "strategic write on strategic_kpi_record_inputs"
on public.strategic_kpi_record_inputs for all
using (exists (
  select 1 from public.strategic_kpi_records r
  join public.strategic_kpis k on k.id = r.kpi_id
  where r.id = strategic_kpi_record_inputs.record_id and public.strategic_can_edit_a3(k.primary_a3_id)
))
with check (exists (
  select 1 from public.strategic_kpi_records r
  join public.strategic_kpis k on k.id = r.kpi_id
  where r.id = strategic_kpi_record_inputs.record_id and public.strategic_can_edit_a3(k.primary_a3_id)
));

-- ============================================================================
-- 7. strategic_kpi_breakdown_rows (via record_id -> kpi_id -> primary_a3_id)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_kpi_breakdown_rows" on public.strategic_kpi_breakdown_rows;
create policy "strategic view on strategic_kpi_breakdown_rows"
on public.strategic_kpi_breakdown_rows for select
using (exists (
  select 1 from public.strategic_kpi_records r
  join public.strategic_kpis k on k.id = r.kpi_id
  where r.id = strategic_kpi_breakdown_rows.record_id and public.strategic_can_view_a3(k.primary_a3_id)
));
create policy "strategic write on strategic_kpi_breakdown_rows"
on public.strategic_kpi_breakdown_rows for all
using (exists (
  select 1 from public.strategic_kpi_records r
  join public.strategic_kpis k on k.id = r.kpi_id
  where r.id = strategic_kpi_breakdown_rows.record_id and public.strategic_can_edit_a3(k.primary_a3_id)
))
with check (exists (
  select 1 from public.strategic_kpi_records r
  join public.strategic_kpis k on k.id = r.kpi_id
  where r.id = strategic_kpi_breakdown_rows.record_id and public.strategic_can_edit_a3(k.primary_a3_id)
));

-- ============================================================================
-- 8. strategic_period_analyses (a3_id direto)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_period_analyses" on public.strategic_period_analyses;
create policy "strategic view on strategic_period_analyses"
on public.strategic_period_analyses for select
using (public.strategic_can_view_a3(a3_id));
create policy "strategic write on strategic_period_analyses"
on public.strategic_period_analyses for all
using (public.strategic_can_edit_a3(a3_id))
with check (public.strategic_can_edit_a3(a3_id));

-- ============================================================================
-- 9. strategic_analysis_items (via analysis_id -> strategic_period_analyses.a3_id)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_analysis_items" on public.strategic_analysis_items;
create policy "strategic view on strategic_analysis_items"
on public.strategic_analysis_items for select
using (exists (
  select 1 from public.strategic_period_analyses pa
  where pa.id = strategic_analysis_items.analysis_id and public.strategic_can_view_a3(pa.a3_id)
));
create policy "strategic write on strategic_analysis_items"
on public.strategic_analysis_items for all
using (exists (
  select 1 from public.strategic_period_analyses pa
  where pa.id = strategic_analysis_items.analysis_id and public.strategic_can_edit_a3(pa.a3_id)
))
with check (exists (
  select 1 from public.strategic_period_analyses pa
  where pa.id = strategic_analysis_items.analysis_id and public.strategic_can_edit_a3(pa.a3_id)
));

-- ============================================================================
-- 10. strategic_analysis_item_kpis (via analysis_item_id -> analysis_id -> a3_id)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_analysis_item_kpis" on public.strategic_analysis_item_kpis;
create policy "strategic view on strategic_analysis_item_kpis"
on public.strategic_analysis_item_kpis for select
using (exists (
  select 1 from public.strategic_analysis_items ai
  join public.strategic_period_analyses pa on pa.id = ai.analysis_id
  where ai.id = strategic_analysis_item_kpis.analysis_item_id and public.strategic_can_view_a3(pa.a3_id)
));
create policy "strategic write on strategic_analysis_item_kpis"
on public.strategic_analysis_item_kpis for all
using (exists (
  select 1 from public.strategic_analysis_items ai
  join public.strategic_period_analyses pa on pa.id = ai.analysis_id
  where ai.id = strategic_analysis_item_kpis.analysis_item_id and public.strategic_can_edit_a3(pa.a3_id)
))
with check (exists (
  select 1 from public.strategic_analysis_items ai
  join public.strategic_period_analyses pa on pa.id = ai.analysis_id
  where ai.id = strategic_analysis_item_kpis.analysis_item_id and public.strategic_can_edit_a3(pa.a3_id)
));

-- ============================================================================
-- 11. strategic_actions (ação pode ligar a mais de 1 A3 — viewable/editable
-- se tiver direito em QUALQUER UM dos A3 ligados)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_actions" on public.strategic_actions;
create policy "strategic view on strategic_actions"
on public.strategic_actions for select
using (public.strategic_action_viewable(id));
create policy "strategic write on strategic_actions"
on public.strategic_actions for all
using (public.strategic_action_editable(id))
with check (public.strategic_action_editable(id));

-- ============================================================================
-- 12. strategic_action_a3 (a3_id direto — a linha em si)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_action_a3" on public.strategic_action_a3;
create policy "strategic view on strategic_action_a3"
on public.strategic_action_a3 for select
using (public.strategic_can_view_a3(a3_id));
create policy "strategic write on strategic_action_a3"
on public.strategic_action_a3 for all
using (public.strategic_can_edit_a3(a3_id))
with check (public.strategic_can_edit_a3(a3_id));

-- ============================================================================
-- 13. strategic_action_kpis (via kpi_id -> primary_a3_id — mais direto que
-- passar pela ação, já que kpi_id já é coluna própria da linha)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_action_kpis" on public.strategic_action_kpis;
create policy "strategic view on strategic_action_kpis"
on public.strategic_action_kpis for select
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_action_kpis.kpi_id and public.strategic_can_view_a3(k.primary_a3_id)
));
create policy "strategic write on strategic_action_kpis"
on public.strategic_action_kpis for all
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_action_kpis.kpi_id and public.strategic_can_edit_a3(k.primary_a3_id)
))
with check (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_action_kpis.kpi_id and public.strategic_can_edit_a3(k.primary_a3_id)
));

-- ============================================================================
-- 14. strategic_action_owners (via action_id -> ação, mesma regra da ação)
-- ============================================================================
drop policy if exists "strategic managers all on strategic_action_owners" on public.strategic_action_owners;
create policy "strategic view on strategic_action_owners"
on public.strategic_action_owners for select
using (public.strategic_action_viewable(action_id));
create policy "strategic write on strategic_action_owners"
on public.strategic_action_owners for all
using (public.strategic_action_editable(action_id))
with check (public.strategic_action_editable(action_id));

-- ============================================================================
-- 15. strategic_attachments — exatamente 1 dono entre kpi_record_id /
-- analysis_item_id / action_id (CHECK da migration 128); resolve o A3 pelo
-- dono que estiver preenchido.
-- ============================================================================
drop policy if exists "strategic managers all on strategic_attachments" on public.strategic_attachments;
create policy "strategic view on strategic_attachments"
on public.strategic_attachments for select
using (
  (kpi_record_id is not null and exists (
    select 1 from public.strategic_kpi_records r join public.strategic_kpis k on k.id = r.kpi_id
    where r.id = strategic_attachments.kpi_record_id and public.strategic_can_view_a3(k.primary_a3_id)
  ))
  or (analysis_item_id is not null and exists (
    select 1 from public.strategic_analysis_items ai join public.strategic_period_analyses pa on pa.id = ai.analysis_id
    where ai.id = strategic_attachments.analysis_item_id and public.strategic_can_view_a3(pa.a3_id)
  ))
  or (action_id is not null and public.strategic_action_viewable(strategic_attachments.action_id))
);
create policy "strategic write on strategic_attachments"
on public.strategic_attachments for all
using (
  (kpi_record_id is not null and exists (
    select 1 from public.strategic_kpi_records r join public.strategic_kpis k on k.id = r.kpi_id
    where r.id = strategic_attachments.kpi_record_id and public.strategic_can_edit_a3(k.primary_a3_id)
  ))
  or (analysis_item_id is not null and exists (
    select 1 from public.strategic_analysis_items ai join public.strategic_period_analyses pa on pa.id = ai.analysis_id
    where ai.id = strategic_attachments.analysis_item_id and public.strategic_can_edit_a3(pa.a3_id)
  ))
  or (action_id is not null and public.strategic_action_editable(strategic_attachments.action_id))
)
with check (
  (kpi_record_id is not null and exists (
    select 1 from public.strategic_kpi_records r join public.strategic_kpis k on k.id = r.kpi_id
    where r.id = strategic_attachments.kpi_record_id and public.strategic_can_edit_a3(k.primary_a3_id)
  ))
  or (analysis_item_id is not null and exists (
    select 1 from public.strategic_analysis_items ai join public.strategic_period_analyses pa on pa.id = ai.analysis_id
    where ai.id = strategic_attachments.analysis_item_id and public.strategic_can_edit_a3(pa.a3_id)
  ))
  or (action_id is not null and public.strategic_action_editable(strategic_attachments.action_id))
);

-- ============================================================================
-- Tabelas de CATÁLOGO/CONFIG (não são por A3): só alarga o SELECT. Escrita
-- continua com can_manage_strategic_a3 (migration 128, inalterada).
-- ============================================================================
drop policy if exists "strategic managers all on strategic_cycles" on public.strategic_cycles;
create policy "strategic view on strategic_cycles"
on public.strategic_cycles for select
using (public.strategic_can_access_module(organization_id));
create policy "strategic write on strategic_cycles"
on public.strategic_cycles for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

drop policy if exists "strategic managers all on strategic_north_goals" on public.strategic_north_goals;
create policy "strategic view on strategic_north_goals"
on public.strategic_north_goals for select
using (public.strategic_can_access_module(organization_id));
create policy "strategic write on strategic_north_goals"
on public.strategic_north_goals for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

drop policy if exists "strategic managers all on strategic_scenarios" on public.strategic_scenarios;
create policy "strategic view on strategic_scenarios"
on public.strategic_scenarios for select
using (public.strategic_can_access_module(organization_id));
create policy "strategic write on strategic_scenarios"
on public.strategic_scenarios for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

drop policy if exists "strategic managers all on strategic_kpis" on public.strategic_kpis;
create policy "strategic view on strategic_kpis"
on public.strategic_kpis for select
using (public.strategic_can_access_module(organization_id));
create policy "strategic write on strategic_kpis"
on public.strategic_kpis for all
using (public.can_manage_strategic_a3(organization_id))
with check (public.can_manage_strategic_a3(organization_id));

drop policy if exists "strategic managers all on strategic_kpi_drivers" on public.strategic_kpi_drivers;
create policy "strategic view on strategic_kpi_drivers"
on public.strategic_kpi_drivers for select
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_drivers.kpi_id and public.strategic_can_access_module(k.organization_id)
));
create policy "strategic write on strategic_kpi_drivers"
on public.strategic_kpi_drivers for all
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_drivers.kpi_id and public.can_manage_strategic_a3(k.organization_id)
))
with check (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_drivers.kpi_id and public.can_manage_strategic_a3(k.organization_id)
));

drop policy if exists "strategic managers all on strategic_kpi_benchmarks" on public.strategic_kpi_benchmarks;
create policy "strategic view on strategic_kpi_benchmarks"
on public.strategic_kpi_benchmarks for select
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_benchmarks.kpi_id and public.strategic_can_access_module(k.organization_id)
));
create policy "strategic write on strategic_kpi_benchmarks"
on public.strategic_kpi_benchmarks for all
using (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_benchmarks.kpi_id and public.can_manage_strategic_a3(k.organization_id)
))
with check (exists (
  select 1 from public.strategic_kpis k
  where k.id = strategic_kpi_benchmarks.kpi_id and public.can_manage_strategic_a3(k.organization_id)
));

-- strategic_a3_owners / strategic_kpi_owners / strategic_comments: schema
-- existe (migration 128) mas nenhuma leva de frontend usa essas 3 tabelas
-- até hoje (mesma situação de "notificações" — greenfield). Só troco o
-- gate genérico pelo mesmo can_manage_strategic_a3 de sempre, sem
-- granularidade por A3 — não vale o esforço agora pra tabela sem consumidor.
-- Revisar quando/se ganharem uma tela.

commit;
