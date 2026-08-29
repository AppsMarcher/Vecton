begin;

-- ============================================================================
-- Achado #8 do review de segurança (2026-08-29): strategic_compute_
-- commercial_metric e strategic_compute_labor_cost usavam
-- coalesce(sum(...), 0) — misturava "resultado realmente zero" (linhas
-- existem, somam zero) com "fonte não carregada" (nenhuma linha de origem
-- pro período, sum() puro já devolve NULL sozinho). Isso podia acender
-- status 'on_target'/'off_target' pra um mês sem carga nenhuma, em vez de
-- 'not_available'.
--
-- Fix: tira o coalesce — sum() de 0 linhas já é NULL nativamente, é só
-- deixar passar. O resto do pipeline já tratava NULL direito antes disso
-- (strategic_sync_computed_kpi_records grava completion_status='empty'
-- quando v_result is null, strategic_kpi_status devolve 'not_available'
-- quando p_result is null) — só a função de origem é que apagava a
-- distinção antes de chegar lá.
-- ============================================================================

create or replace function public.strategic_compute_commercial_metric(
  p_organization_id uuid,
  p_year            int,
  p_month_from      int,
  p_month_to        int,
  p_field           text,          -- 'valor' | 'quantidade'
  p_coordenacao     text default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select sum(case when p_field = 'valor' then cle.valor else cle.quantidade end)
  from public.comercial_realizado_ledger_entries cle
  left join public.comercial_coordenacoes co on co.id = cle.coordenacao_id
  where cle.organization_id = p_organization_id
    and cle.reference_year = p_year
    and cle.reference_month between p_month_from and p_month_to
    and cle.origem = 'FAT'
    and (p_coordenacao is null or co.nome = p_coordenacao);
$$;

create or replace function public.strategic_compute_labor_cost(
  p_organization_id uuid,
  p_year            int,
  p_month_from      int,
  p_month_to        int
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select sum(ale.amount)
  from public.actuals_ledger_entries ale
  join public.dre_gerencial_account_lines dgl
    on dgl.account_number = ale.account_number and dgl.line_key = 'hc_pessoal'
  where ale.organization_id = p_organization_id
    and ale.reference_year = p_year
    and ale.reference_month between p_month_from and p_month_to;
$$;

-- grants inalterados (revogados de authenticated na 158; continuam
-- chamáveis só de dentro de outra SECURITY DEFINER do módulo).

commit;
