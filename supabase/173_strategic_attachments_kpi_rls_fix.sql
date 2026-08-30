begin;

-- ============================================================================
-- Fix (2026-08-29): a migration 172 adicionou kpi_id como 4º dono possível
-- de strategic_attachments (anexo de SUPORTE do indicador, ver 172), mas
-- as policies de RLS granulares por A3 (migration 144, "strategic view/
-- write on strategic_attachments") só conheciam os 3 donos originais
-- (kpi_record_id, analysis_item_id, action_id) — toda linha com só kpi_id
-- preenchido caía nas 3 condições como false, e o with check rejeitava o
-- INSERT com "new row violates row-level security policy" (reproduzido
-- pelo usuário tentando anexar pelo ícone de clipe novo).
--
-- Recria as 2 policies com o 4º branch (kpi_id -> strategic_kpis direto,
-- sem passar por strategic_kpi_records — kpi_id aponta pro indicador,
-- não por um registro de mês específico).
-- ============================================================================

drop policy if exists "strategic view on strategic_attachments" on public.strategic_attachments;
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
  or (kpi_id is not null and exists (
    select 1 from public.strategic_kpis k
    where k.id = strategic_attachments.kpi_id and public.strategic_can_view_a3(k.primary_a3_id)
  ))
);

drop policy if exists "strategic write on strategic_attachments" on public.strategic_attachments;
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
  or (kpi_id is not null and exists (
    select 1 from public.strategic_kpis k
    where k.id = strategic_attachments.kpi_id and public.strategic_can_edit_a3(k.primary_a3_id)
  ))
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
  or (kpi_id is not null and exists (
    select 1 from public.strategic_kpis k
    where k.id = strategic_attachments.kpi_id and public.strategic_can_edit_a3(k.primary_a3_id)
  ))
);

commit;
