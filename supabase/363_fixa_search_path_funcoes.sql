begin;

-- Alerta "function_search_path_mutable" do Supabase: funções sem search_path fixo resolvem nomes de acordo
-- com o search_path de quem chama. Aqui as 12 funções utilitárias (todas SECURITY INVOKER, só usam recursos
-- do pg_catalog ou objetos qualificados com public.) passam a ter search_path = public.
--
-- Fora desta migration, de propósito: comercial_cart_ref_month e comercial_cart_ym_corrente. Uma view do
-- Painel de Vendas (comercial_realizado_ledger_vigente) usa uma delas, e funções com SET não são expandidas
-- ("inlined") pelo planejador; para não mexer no plano de um relatório crítico, ficam como estão.

alter function public.bloqueia_escrita_budget_antigo() set search_path to 'public';
alter function public.bp_code_sort_key(text) set search_path to 'public';
alter function public.garantia_classificar_financiamento(text) set search_path to 'public';
alter function public.opex_block_event_mutation() set search_path to 'public';
alter function public.opex_check_version(public.opex_action_plans, integer) set search_path to 'public';
alter function public.opex_is_overdue(date, text) set search_path to 'public';
alter function public.opex_today() set search_path to 'public';
alter function public.planning_fat_line_of(text) set search_path to 'public';
alter function public.set_updated_at() set search_path to 'public';
alter function public.strategic_kpi_status(numeric, numeric, numeric, numeric, numeric, text, numeric) set search_path to 'public';
alter function public.strategic_slugify(text) set search_path to 'public';
alter function public.update_updated_at() set search_path to 'public';

-- Para desfazer qualquer uma: alter function public.<nome>(<args>) reset search_path;

commit;
