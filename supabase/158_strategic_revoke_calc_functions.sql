begin;

-- ============================================================================
-- Achado #1 do review de segurança (2026-08-29): as funções auxiliares de
-- cálculo do módulo A3 são SECURITY DEFINER e ficaram com "grant execute to
-- authenticated" desde a 130/131 — qualquer pessoa autenticada na org (nem
-- precisa ter perfil do módulo) conseguia chamar
-- rpc/strategic_compute_dre_metric, rpc/strategic_compute_commercial_metric
-- etc. direto via PostgREST com UUIDs adivinhados/enumerados, contornando
-- todo o RBAC por-A3 (migrations 143-147) — essas funções não checam
-- permissão nenhuma, só agregam dado financeiro cru.
--
-- Fix: revoke total nelas. Continuam funcionando normalmente chamadas de
-- DENTRO de outra função SECURITY DEFINER (strategic_compute_kpi_result,
-- strategic_sync_computed_kpi_records, strategic_kpi_accumulated, RPCs de
-- leitura) — o Postgres checa o privilégio de EXECUTE do role efetivo no
-- momento da chamada, que durante a execução de uma SECURITY DEFINER é o
-- OWNER da função chamadora (sempre tem EXECUTE nas próprias funções,
-- independente de grant/revoke). Só o acesso DIRETO via
-- rpc/<nome-da-função> por alguém autenticado é que passa a ser negado.
--
-- strategic_kpi_status fica de fora de propósito: não consulta nenhuma
-- tabela, só classifica valores já recebidos como parâmetro — não é vetor
-- de leitura indevida.
-- ============================================================================

revoke all on function public.strategic_dre_line_amount(uuid, int, int, int, text[], text) from public, authenticated;
revoke all on function public.strategic_compute_dre_metric(uuid, int, int, int, text, text) from public, authenticated;
revoke all on function public.strategic_compute_commercial_metric(uuid, int, int, int, text, text) from public, authenticated;
revoke all on function public.strategic_compute_labor_cost(uuid, int, int, int) from public, authenticated;
revoke all on function public.strategic_compute_kpi_result(uuid, int, int, int) from public, authenticated;
revoke all on function public.strategic_kpi_accumulated(uuid, int, int) from public, authenticated;

commit;
