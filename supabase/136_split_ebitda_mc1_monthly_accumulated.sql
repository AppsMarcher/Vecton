begin;

-- ============================================================================
-- Pedido do usuário: a área EBITDA tem que ter 4 indicadores, não 2 —
-- EBITDA % Mensal / EBITDA % Acumulado / MC1 % Mensal / MC1 % Acumulado,
-- cada um com sua própria meta e linha na tela de lançamentos (em vez de o
-- acumulado aparecer só como um número extra ao lado do gráfico mensal).
-- Decisão restrita a EBITDA%/MC1% (não é padrão pro resto do catálogo).
-- ============================================================================

-- Deixa claro que a linha original é a versão mensal.
update public.strategic_kpis set name = 'EBITDA % Mensal' where code = 'ebitda_pct';
update public.strategic_kpis set name = 'MC1 % Mensal' where code = 'mc1_pct';

-- Novos KPIs "acumulado": entry_mode continua 'computed' — o valor mensal
-- gravado por strategic_sync_computed_kpi_records PASSA A SER o acumulado
-- Jan..mês (ver strategic_compute_kpi_result abaixo, que ignora o
-- month_from recebido pra estes 2 códigos e sempre usa 1). accumulation_
-- method = 'last_closed' porque o próprio valor mensal já é o YTD — não faz
-- sentido reprocessar como ratio_of_sums de novo em cima dele.
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
target_cycle as (
  select c.id, c.organization_id
  from public.strategic_cycles c, target_org o
  where c.organization_id = o.id and c.year = 2026
  limit 1
),
ebitda_area as (
  select a.id from public.strategic_a3 a, target_cycle tc
  where a.cycle_id = tc.id and a.code = 'ebitda'
  limit 1
),
seed_rows (code, name, unit, decimal_places, entry_mode, monthly_calculation, accumulation_method, comparison_mode, formula_config, is_active, display_order) as (
  values
    ('ebitda_pct_accumulated', 'EBITDA % Acumulado', 'percent', 1, 'computed', 'direct', 'last_closed', 'higher',
      '{"source":"dre_gerencial","report":"gerencial_real","line":"ebitdaPct","numeratorLine":"ebitda","denominatorLine":"receitaLiquida","range":"ytd"}'::jsonb, true, 3),
    ('mc1_pct_accumulated', 'MC1 % Acumulado', 'percent', 1, 'computed', 'direct', 'last_closed', 'higher',
      '{"source":"dre_gerencial","report":"gerencial_real","line":"lbPct","numeratorLine":"lucroBruto","denominatorLine":"receitaLiquida","range":"ytd"}'::jsonb, true, 4)
)
insert into public.strategic_kpis (organization_id, cycle_id, primary_a3_id, code, name, unit, decimal_places, entry_mode, monthly_calculation, accumulation_method, comparison_mode, formula_config, is_active, display_order)
select tc.organization_id, tc.id, ea.id, s.code, s.name, s.unit, s.decimal_places, s.entry_mode, s.monthly_calculation, s.accumulation_method, s.comparison_mode, s.formula_config, s.is_active, s.display_order
from seed_rows s
join target_cycle tc on true
join ebitda_area ea on true
where not exists (
  select 1 from public.strategic_kpis k where k.cycle_id = tc.id and k.code = s.code
);

-- Vínculo primário na área EBITDA (mesmo padrão da 132).
insert into public.strategic_a3_kpis (a3_id, kpi_id, relationship_type, display_order)
select k.primary_a3_id, k.id, 'primary', k.display_order
from public.strategic_kpis k
where k.code in ('ebitda_pct_accumulated', 'mc1_pct_accumulated')
  and not exists (
    select 1 from public.strategic_a3_kpis link
    where link.a3_id = k.primary_a3_id and link.kpi_id = k.id
  );

-- Dispatcher: os 2 códigos novos ignoram o p_month_from recebido e sempre
-- calculam Jan..p_month_to — é assim que o "mensal" gravado por
-- strategic_sync_computed_kpi_records vira, na prática, o acumulado do ano.
create or replace function public.strategic_compute_kpi_result(
  p_kpi_id     uuid,
  p_year       int,
  p_month_from int,
  p_month_to   int
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k record;
begin
  select id, organization_id, code, entry_mode into k
  from public.strategic_kpis where id = p_kpi_id;

  if k.id is null then
    raise exception 'strategic_compute_kpi_result: KPI % não encontrado', p_kpi_id;
  end if;
  if k.entry_mode <> 'computed' then
    raise exception 'strategic_compute_kpi_result: KPI % não é entry_mode=computed (é %)', k.code, k.entry_mode;
  end if;

  case k.code
    when 'ebitda_pct' then
      return public.strategic_compute_dre_metric(k.organization_id, p_year, p_month_from, p_month_to, 'ebitda_pct');
    when 'ebitda_pct_accumulated' then
      return public.strategic_compute_dre_metric(k.organization_id, p_year, 1, p_month_to, 'ebitda_pct');
    when 'mc1_pct' then
      return public.strategic_compute_dre_metric(k.organization_id, p_year, p_month_from, p_month_to, 'mc1_pct');
    when 'mc1_pct_accumulated' then
      return public.strategic_compute_dre_metric(k.organization_id, p_year, 1, p_month_to, 'mc1_pct');
    when 'cogs_pct' then
      return public.strategic_compute_dre_metric(k.organization_id, p_year, p_month_from, p_month_to, 'cogs_pct');
    when 'ggf_general_pct' then
      return public.strategic_compute_dre_metric(k.organization_id, p_year, p_month_from, p_month_to, 'ggf_general_pct');
    when 'ggf_production_pct' then
      return public.strategic_compute_dre_metric(k.organization_id, p_year, p_month_from, p_month_to, 'ggf_production_pct');
    when 'labor_cost' then
      return public.strategic_compute_labor_cost(k.organization_id, p_year, p_month_from, p_month_to);
    when 'commercial_revenue' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'valor');
    when 'commercial_volume' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'quantidade');
    when 'export_revenue' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'valor', 'Exportação');
    when 'export_volume' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'quantidade', 'Exportação');
    when 'livestock_revenue' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'valor', 'Pecuária');
    when 'livestock_volume' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'quantidade', 'Pecuária');
    when 'parts_revenue' then
      return public.strategic_compute_commercial_metric(k.organization_id, p_year, p_month_from, p_month_to, 'valor', 'Peças');
    else
      raise exception 'strategic_compute_kpi_result: KPI % marcado computed sem fórmula implementada', k.code;
  end case;
end;
$$;

grant execute on function public.strategic_compute_kpi_result(uuid, int, int, int) to authenticated;

commit;
