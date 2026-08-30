begin;

-- ============================================================================
-- Reversão pedida pelo usuário (2026-08-29): os anexos de suporte do
-- indicador (migrations 172/173, ícone de clipe) foram pedidos como
-- "independente de mês/período" — mas na mesma sessão, revisando o
-- gráfico, o usuário decidiu que TUDO na Tela 2 (gráfico, causas, ações,
-- anexos) tem que respeitar o mês selecionado no filtro do topo. Decisão
-- final: anexo vira por MÊS (kpi_record_id), não mais por indicador
-- inteiro (kpi_id).
--
-- kpi_record_id já existia desde a migration 128 original — era
-- documentado como "leva futura" (comentário: "exige garantir que o
-- registro do mês já existe antes de anexar"). Essa leva futura é agora;
-- a migration 177 resolve o "garantir que o registro existe"
-- (strategic_ensure_kpi_record) e expõe o id do registro do mês corrente
-- pro frontend (strategic_get_a3_detail ganha 'recordId').
--
-- Esta migration desfaz especificamente o que a 172/173 acrescentaram:
-- kpi_id como 4º dono. kpi_record_id já estava coberto nas RLS "strategic
-- view/write on strategic_attachments" desde a migration 144 original —
-- não precisa recriar nada pra ele, só tirar o branch de kpi_id que não
-- serve mais.
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

-- Linha com só kpi_id preenchido ficaria com ZERO donos assim que a
-- coluna sumir (violaria a constraint nova, de 3 opções) — defensivo:
-- apaga essas linhas antes de derrubar a coluna. Deveria ser nenhuma (o
-- RLS write só ficou liberado por algumas horas até a correção da 173, e
-- ninguém confirmou ter anexado com sucesso nesse meio-tempo), mas não
-- custa garantir em vez de supor.
delete from public.strategic_attachments where kpi_id is not null;

alter table public.strategic_attachments drop constraint if exists strategic_attachments_single_owner;
alter table public.strategic_attachments drop column if exists kpi_id;
alter table public.strategic_attachments add constraint strategic_attachments_single_owner check (
  (case when kpi_record_id is not null then 1 else 0 end)
  + (case when analysis_item_id is not null then 1 else 0 end)
  + (case when action_id is not null then 1 else 0 end) = 1
);

drop index if exists idx_strategic_attachments_kpi;

commit;
