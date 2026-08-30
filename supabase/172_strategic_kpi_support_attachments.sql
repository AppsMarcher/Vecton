begin;

-- ============================================================================
-- Pedido do usuário (2026-08-29): anexos de SUPORTE do indicador, direto
-- no card do KPI (Tela 2 — "% Máquinas Críticas sobre Faturamento" etc.),
-- independente de mês/período, de meta batida ou não, de existir causa/
-- contramedida ou plano de ação. Ícone de clipe no cabeçalho do card abre
-- um painel com o mesmo widget de chips + carrossel já usado em Causas/
-- Contramedidas e Plano de Ação (strategic_attachments, ver 128).
--
-- strategic_attachments já tinha kpi_record_id (anexo por MÊS específico,
-- documentado como "leva futura" na 128) — não é isso que o usuário pediu
-- agora (ele quer indicador inteiro, não um mês). Nova coluna kpi_id
-- (-> strategic_kpis) como 4ª opção de dono, ao lado de kpi_record_id/
-- analysis_item_id/action_id — constraint strategic_attachments_single_
-- owner atualizada pra continuar exigindo exatamente 1 preenchido.
--
-- RLS não muda: a policy já é genérica por organization_id
-- (can_manage_strategic_a3), não olha pra qual FK específica está
-- preenchida.
-- ============================================================================

alter table public.strategic_attachments
  add column if not exists kpi_id uuid references public.strategic_kpis(id) on delete cascade;

alter table public.strategic_attachments
  drop constraint if exists strategic_attachments_single_owner;

alter table public.strategic_attachments
  add constraint strategic_attachments_single_owner check (
    (case when kpi_record_id is not null then 1 else 0 end)
    + (case when analysis_item_id is not null then 1 else 0 end)
    + (case when action_id is not null then 1 else 0 end)
    + (case when kpi_id is not null then 1 else 0 end) = 1
  );

create index if not exists idx_strategic_attachments_kpi on public.strategic_attachments (kpi_id);

commit;
