begin;

-- ============================================================================
-- Achados #4, #6, #7 do review de segurança (2026-08-29) — base de schema
-- pras 3 correções (RPCs na 163/164):
--
--   #7 meta+realizado numa RPC transacional só, com CAS nos dois — meta
--   ganha "version" (mesmo padrão que strategic_kpi_records.version já
--   tinha só pro realizado).
--
--   #4 rastrear se o valor atual de strategic_kpi_records veio do cálculo
--   automático ('computed') ou de alguém digitando por cima ('manual') —
--   "Sincronizar automáticos" (RPC na 163) passa a pular quem está
--   'manual', nunca mais sobrescreve sem uma ação nova da pessoa.
--
--   #6 fechamento grava um SNAPSHOT de verdade (valor copiado, não só
--   referência a uma linha de meta que continua editável) — a RPC de
--   fechamento (163) preenche essas colunas; as RPCs de leitura (164) usam
--   snapshot pra mês de período fechado, e a meta "ao vivo" (join na
--   strategic_kpi_targets do cenário vigente) só pra período aberto.
-- ============================================================================

alter table public.strategic_kpi_targets
  add column if not exists version bigint not null default 1 check (version >= 1);

alter table public.strategic_kpi_records
  add column if not exists result_source text not null default 'manual'
    check (result_source in ('computed', 'manual')),
  add column if not exists overridden_by uuid references auth.users(id) on delete set null,
  add column if not exists overridden_at timestamptz,
  add column if not exists snapshot_target_value numeric,
  add column if not exists snapshot_target_min numeric,
  add column if not exists snapshot_target_max numeric,
  add column if not exists snapshot_tolerance numeric,
  add column if not exists snapshot_comparison_mode text;

comment on column public.strategic_kpi_records.result_source is
  'De onde veio o result_value ATUAL desta linha: computed (última gravação foi strategic_sync_computed_kpi_records) ou manual (última gravação foi uma pessoa via strategic_save_kpi_record — inclusive sobrescrita de KPI computed). Só importa de verdade pra KPI entry_mode=computed: é o que strategic_sync_computed_kpi_records usa pra decidir se pula (nunca sobrescreve manual sem ação nova da pessoa). Pra entry_mode direct/drivers/breakdown fica sempre manual (sync nunca toca nesses KPIs mesmo, o campo é irrelevante ali).';
comment on column public.strategic_kpi_records.overridden_by is
  'Preenchido só quando result_source vira manual POR CIMA de um KPI entry_mode=computed (sobrescrita de verdade). Null pra entry direct/drivers/breakdown (não é "sobrescrita" de nada, é a forma normal de preencher).';
comment on column public.strategic_kpi_records.snapshot_target_value is
  'Cópia congelada da meta no momento do fechamento do período (strategic_close_a3_period) — null enquanto o período está aberto (usa a meta AO VIVO do cenário vigente) ou se o KPI nunca teve fechamento. Existe pra mês fechado não mudar de figura se a meta do cenário for editada depois (achado #6: "fechamento guardava referência a uma meta mutável, não snapshot").';

-- Backfill de result_source pros registros que já existem: assume que todo
-- registro de KPI entry_mode='computed' até hoje veio do sync automático
-- (sobrescrita manual só foi habilitada na migration 135, sem rastro de
-- quem usou até aqui) — não muda o comportamento de quem já tinha dado
-- (continuam sendo re-sincronizáveis normalmente); só sobrescrita NOVA, de
-- agora em diante, é que passa a marcar 'manual' e travar o sync.
update public.strategic_kpi_records r
set result_source = 'computed'
from public.strategic_kpis k
where r.kpi_id = k.id and k.entry_mode = 'computed';

commit;
