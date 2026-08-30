begin;

-- ============================================================================
-- Pedido do usuário (2026-08-29): os 5 KPIs de "Indicadores de Pessoas" que
-- usavam entry_mode='drivers' (composição numerador/denominador — ex.:
-- Turnover = admissões+demissões / headcount) viram entry_mode='direct',
-- com um campo único de "Real" pra digitação direta do percentual —
-- ninguém aqui precisa da composição, só do resultado final.
--
-- Escopo combinado com o usuário:
--   - Só muda entry_mode no catálogo (strategic_kpis). Não apaga nada de
--     strategic_kpi_drivers (definição dos direcionadores) nem de
--     strategic_kpi_record_inputs (valores de admissões/demissões etc. já
--     lançados em meses anteriores) — ficam no banco, só saem de uso.
--   - strategic_kpi_records.result_value (a % já calculada) NÃO muda: é
--     lida direto pelas RPCs independente de entry_mode (ver 131), então o
--     campo "Real" já nasce pré-preenchido com o último valor calculado
--     pelos drivers, editável dali pra frente — sem perda de número pra
--     quem já tinha lançado o mês corrente.
--   - Meses fechados (snapshot em strategic_kpi_records) não são afetados;
--     entry_mode só importa pra RPC de salvar (163/145), que já ramifica
--     100% por cima dele — 'direct' cai direto no `else: v_result :=
--     p_result_value`, sem tocar em driver nenhum.
--   - monthly_calculation permanece 'ratio' (config órfã pra entry_mode=
--     'direct', igual já acontece com export_share_pct/parts_share_pct —
--     não precisa mudar pra o fluxo funcionar).
-- ============================================================================

update public.strategic_kpis
set entry_mode = 'direct'
where code in (
  'turnover_pct',
  'absenteeism_pct',
  'career_track_pct',
  'onboarding_pct',
  'feedback_pct'
)
and entry_mode = 'drivers';

commit;
