begin;

-- ============================================================================
-- Realizados 2026 (janeiro a julho) extraídos de "#INDICADORES# 2026.xlsx".
--
-- Cobertura segura: 57 dos 68 KPIs do catálogo, totalizando 376 registros
-- mensais não nulos. Percentuais são persistidos na convenção 0–1 usada pelo
-- módulo A3. Zeros explícitos da planilha são preservados; células vazias não
-- geram registros.
--
-- Séries deliberadamente não carregadas por não possuírem mês inequívoco,
-- estarem vazias ou conflitarem com a unidade do catálogo:
--   - customer_satisfaction_new_product: linhas por produto, não por mês;
--   - customer_satisfaction_new_product_technical e pilot_batch_downtime:
--     linhas por produto/lote, não por mês;
--   - project_deadline_adherence_pct: lista de marcos de projetos;
--   - item_variety_reduction_pct: planilha traz contagem (9, 23), catálogo %;
--   - sku_value_reduction: planilha traz 0,03, catálogo BRL;
--   - project_agreed_value: sem realizado;
--   - feedback_pct e employee_satisfaction: sem realizado mensal;
--   - general_inventory_accuracy_pct: série anual, 2026 ainda sem resultado;
--   - curve_a_contract_pct: planilha traz contagem, catálogo %.
--
-- A migration é idempotente: só atualiza registros cujo valor/status difere.
-- Valores já existentes para estes KPI/mês serão substituídos pelos realizados
-- da planilha; version e calculation_version só avançam quando houver mudança.
-- ============================================================================

create temporary table _strategic_actual_series_2026 (
  kpi_code       text primary key,
  source_sheet   text not null,
  source_range   text not null,
  monthly_values numeric[] not null check (cardinality(monthly_values) = 7),
  transform_note text
) on commit drop;

insert into _strategic_actual_series_2026
  (kpi_code, source_sheet, source_range, monthly_values, transform_note)
values
  ('ebitda_pct', 'A3 EBITDA', 'Z2:Z8', array[-0.00702255653382603, 0.159, 0.11, -0.005, 0.115, 0.076, 0.043]::numeric[], null),
  ('ebitda_pct_accumulated', 'A3 EBITDA', 'AA2:AA8', array[-0.00702255653382603, 0.102, 0.104, 0.079, 0.088, 0.086, 0.08]::numeric[], null),
  ('mc1_pct', 'A3 EBITDA', 'AK2:AK8', array[0.494064018299248, 0.52, 0.516, 0.488, 0.508, 0.501, 0.507]::numeric[], null),
  ('mc1_pct_accumulated', 'A3 EBITDA', 'AL2:AL8', array[0.494064018299248, 0.511, 0.513, 0.507, 0.507, 0.506, 0.5072]::numeric[], null),
  ('commercial_revenue', 'A3  COMERCIAL', 'Y2:Y8', array[5432232, 10464603, 9156470.05995188, 7880360, 11702751, 10719334, 7919000]::numeric[], null),
  ('commercial_volume', 'A3  COMERCIAL', 'AI2:AI8', array[57, 93, 88, 74, 94, 79, 57]::numeric[], null),
  ('forecast_accuracy_general', 'A3  COMERCIAL', 'AR40:AR46', array[0.472972972972973, 0.59375, 0.711864406779661, 0.426666666666667, 0.640776699029126, 0.475728155339806, 0.438775510204082]::numeric[], 'KPI inativo no catálogo; fórmula de agregação pendente, mas realizado mensal inequívoco no gráfico.'),
  ('forecast_accuracy_grains', 'A3  COMERCIAL', 'AT40:AT46', array[0.507692307692308, 0.632911392405063, 0.766990291262136, 0.483333333333333, 0.650602409638554, 0.469135802469136, 0.428571428571429]::numeric[], 'KPI inativo no catálogo; realizado preservado para futura ativação.'),
  ('forecast_accuracy_livestock', 'A3  COMERCIAL', 'AV40:AV46', array[0.222222222222222, 0.411764705882353, 0.333333333333333, 0.2, 0.7, 0.5, 0.611111111111111]::numeric[], 'KPI inativo no catálogo; realizado preservado para futura ativação.'),
  ('mix_assertiveness', 'A3  COMERCIAL', 'AR57:AR63', array[0.766714082503556, 0.794354838709677, 0.862095531587057, 0.805585585585586, 0.822247469531089, 0.713653680717709, null]::numeric[], 'KPI inativo; julho sem realizado na planilha.'),
  ('cogs_pct', 'A3 SUPPLY CHAIN', 'AB2:AB8', array[0.505936113973388, 0.479621660848034, 0.483844960554059, 0.511778420145677, 0.492027014705131, 0.498612435378992, null]::numeric[], 'Julho sem realizado na planilha.'),
  ('inventory_turnover', 'A3 SUPPLY CHAIN', 'AJ2:AJ8', array[0.218837010766583, 0.364882490297695, 0.302551023630094, 0.219603244381478, 0.324129334943994, 0.29560409409411, null]::numeric[], 'Julho sem realizado na planilha.'),
  ('stockout_hours', 'A3 Filho estoques', 'Z2:Z8', array[152, 116.3, 149.11, 94.8, 145.48, 40.09, 112.63]::numeric[], 'Usada a aba operacional Filho Estoques; a cópia em Supply Chain diverge em fevereiro (101,09).'),
  ('payment_term_days', 'A3 SUPPLY CHAIN', 'BH2:BH8', array[31, 39, 47, 57, 56, 48, null]::numeric[], 'KPI inativo; julho sem realizado na planilha.'),
  ('oee_pct', 'A3  FABRIL', 'Y2:Y8', array[0.7678, 0.7427, 0.717, 0.6854, 0.7478, 0.8023, 0.7435]::numeric[], null),
  ('ggf_general_pct', 'A3  FABRIL', 'AK2:AK8', array[0.214092039633424, 0.124869951558507, 0.162685473785808, 0.202701354150443, 0.130066782280577, 0.141903497769527, 0.2049450294419]::numeric[], null),
  ('ggf_production_pct', 'A3  FABRIL', 'AV2:AV8', array[0.0925150130811811, 0.0664703854282241, 0.078263133375886, 0.0932220869363286, 0.0594547839773601, 0.0599082702304592, 0.0875392467898562]::numeric[], null),
  ('five_s_score', 'A3  FABRIL', 'BE2:BE8', array[3.88, 4.24, 4.04, 4.1, 3.9, null, 4.2]::numeric[], 'Junho sem realizado na planilha.'),
  ('warranty_index_general', 'A3 FORMATAÇÃO ÁREA TÉCNICA', 'AB2:AB8', array[0.105263157894737, 0.0645161290322581, 0.0909090909090909, 0.189189189189189, 0.170212765957447, 0.240506329113924, 0.315789473684211]::numeric[], null),
  ('warranty_index_new_products', 'A3 FORMATAÇÃO ÁREA TÉCNICA', 'AO2:AO8', array[0, 0.142857142857143, 0, 0.833333333333333, 0.363636363636364, 0.333333333333333, 0.8]::numeric[], null),
  ('downtime_technical_areas', 'A3 FORMATAÇÃO ÁREA TÉCNICA', 'AX2:AX8', array[5, 4, null, 0.004, null, null, null]::numeric[], 'Meses sem valor foram mantidos em branco.'),
  ('critical_machines_revenue_pct', 'A3  PEP', 'AL2:AL8', array[0.597146254548706, 0.628786517025222, 0.698573264472736, 0.711514967106647, 0.540497769331436, 0.490238696730067, 0.519259112252253]::numeric[], null),
  ('new_products_revenue_pct', 'A3  PEP', 'BD2:BD8', array[0.173742704477895, 0.0951959723823481, 0.0782981023300504, 0.117345682715199, 0.194233171965949, 0.257412831885063, 0.168148497289788]::numeric[], 'Resultado mensal, não a coluna acumulada BE.'),
  ('direct_channel_pct', 'A3  MARKETING', 'Z2:Z8', array[0, 0, 0.142292490118577, 0.5, 0, 0.11, 0]::numeric[], null),
  ('market_intelligence_structuring_pct', 'A3  MARKETING', 'AJ2:AJ8', array[0, 0, 0, 0.2, 0.4, 0.4, null]::numeric[], 'Julho sem realizado na planilha.'),
  ('customer_knowledge_pct', 'A3  MARKETING', 'AQ2:AQ8', array[0, 0, 0, 0, 0, 0, 0.8]::numeric[], null),
  ('sales_funnel_standardization_pct', 'A3  MARKETING', 'AZ2:AZ8', array[0, 0.2, 0.6, 0.8, 0.8, 0.8, 0.8]::numeric[], 'Células formatadas como hora no Excel; seriais convertidos para fração percentual.'),
  ('project_error_downtime', 'A3  ENGENHARIA', 'AK2:AK8', array[14, 11, 46.3666666666667, 16.35, 2.84, 3.08, 2.03]::numeric[], null),
  ('project_error_warranty', 'A3  ENGENHARIA', 'AY2:AY8', array[0.0350877192982456, 0, 0, 0, 0.0212765957446809, 0.0506329113924051, 0.0526315789473684]::numeric[], null),
  ('labor_cost', 'A3 PESSOAS ', 'Z2:Z8', array[1470092, 1740895, 1541000, 1615000, 1672320, 1599000, 1596948]::numeric[], null),
  ('turnover_pct', 'A3 PESSOAS ', 'AJ2:AJ8', array[0.0245901639344262, 0.025, 0.0254237288135593, 0.0537190082644628, 0.0204918032786885, 0.031496062992126, 0.0277777777777778]::numeric[], null),
  ('absenteeism_pct', 'A3 PESSOAS ', 'AW2:AW8', array[0.0155681818181818, 0.0115056818181818, 0.0132482299935636, 0.0146834477498093, 0.011177347242921, 0.018961818961819, 0.0149935924818454]::numeric[], null),
  ('career_track_pct', 'A3 PESSOAS ', 'BE2:BF8', array[null, null, 1, 1, 1, 1, 1]::numeric[], 'Calculado como Nº de cargos com trilha / cargos previstos; janeiro e fevereiro sem base.'),
  ('onboarding_pct', 'A3 PESSOAS ', 'BO2:BO8', array[1, 1, 1, 1, 1, 1, 1]::numeric[], null),
  ('training_hours_management', 'A3 PESSOAS ', 'CJ2:CJ8', array[0, 0, 0, 0, 4, 0, 1]::numeric[], 'Horas realizadas divididas pelo quadro de gestores, conforme fórmula da planilha.'),
  ('training_hours_general', 'A3 PESSOAS ', 'CX2:CX8', array[2.74166666666667, 1.95, 2.15833333333333, 3.05, 3.09166666666667, 3.00833333333333, 2.70833333333333]::numeric[], 'Horas realizadas divididas pelo quadro de funcionários, conforme fórmula da planilha.'),
  ('accidents_count', 'A3 PESSOAS ', 'DH2:DH8', array[0, 0, 0, 1, 0, 0, 1]::numeric[], null),
  ('export_revenue', 'A3 Filho exportação ', 'Y2:Y8', array[649000, 0, 0, 113035.5, 696666.8195, 537864.4928, 1806011.76]::numeric[], null),
  ('export_volume', 'A3 Filho exportação ', 'AI2:AI8', array[8, 0, 0, 3, 1, 4, 7]::numeric[], null),
  ('new_dealers_count', 'A3 Filho exportação ', 'AS2:AS8', array[2, 0, 2, 0, 0, 0, 0]::numeric[], 'Resultado mensal, não a coluna acumulada AU.'),
  ('export_share_pct', 'A3 Filho exportação ', 'BB2:BB8', array[0.119472069675964, 0, 0, 0.0143439512915654, 0, 0.050177043909631, 0.228060583406996]::numeric[], null),
  ('livestock_revenue', 'A3 Filho pecuária', 'Y2:Y8', array[1342000, 3116210, 1956320, 983134, 2978233, null, null]::numeric[], 'Junho e julho sem realizado na planilha.'),
  ('livestock_volume', 'A3 Filho pecuária', 'AI2:AI8', array[null, 2, 0, 0, 1, null, null]::numeric[], 'Janeiro, junho e julho sem realizado na planilha.'),
  ('livestock_warranty_index', 'A3 Filho pecuária', 'AU2:AU8', array[0.2, 0, 0.222222222222222, 0, 0, null, null]::numeric[], 'Junho e julho sem realizado na planilha.'),
  ('parts_revenue', 'A3 Filho Peças', 'Y2:Y8', array[223349, 286279, 609345, 384493, 404197.23, 262395.9, null]::numeric[], 'Julho sem realizado na planilha.'),
  ('parts_share_pct', 'A3 Filho Peças', 'AJ2:AJ8', array[0.0466941599320292, 0.0273568906531858, 0.066548025168031, 0.0487912988746707, 0.0345386507839054, 0.0244787502656415, 0]::numeric[], 'Resultado mensal, não a coluna acumulada AK.'),
  ('safety_stock_compliance_pct', 'A3 Filho estoques', 'AK2:AK8', array[0, 0.29, 0.42, 0.56, 0.54, 0.49, 0.73]::numeric[], null),
  ('cyclic_inventory_accuracy_value_pct', 'A3 Filho estoques', 'AQ2:AQ8', array[null, 0.91, 0.97, 0.95, 0.9774, 0.98, 0.98]::numeric[], 'Janeiro sem realizado na planilha.'),
  ('cyclic_inventory_accuracy_items_pct', 'A3 Filho estoques', 'AW2:AW8', array[null, 0.32, 0.35, 0.34, 0.3277, 0.38, 0.45]::numeric[], 'Janeiro sem realizado na planilha.'),
  ('obsolete_stock', 'A3 Filho estoques', 'BD2:BD8', array[null, 595381, 579759, 557063.04, 441632, 410251, 410532]::numeric[], 'Usado Estoque Obsoletos em R$ (BD), não a razão percentual da coluna BE.'),
  ('supplier_a_payment_term', 'A3 Filho Compras', 'Y2:Y8', array[58, 51, 48, 52, 55, 64, 66]::numeric[], 'KPI inativo no catálogo; direção de comparação ainda pendente.'),
  ('supplier_a_iqf', 'A3 Filho Compras', 'AE2:AE8', array[0.8145, 0.7487, 0.8414, 0.8071, 0.7364, 0.8682, 0.7977]::numeric[], 'Escala 0–100 da planilha convertida para fração 0–1.'),
  ('general_iqf', 'A3 Filho Compras', 'AK2:AK8', array[0.8078, 0.783, 0.8765, 0.7669, 0.7533, 0.8734, 0.8234]::numeric[], 'Escala 0–100 da planilha convertida para fração 0–1.'),
  ('raw_material_saving', 'A3 Filho Compras', 'AR2:AR8', array[169771.966096089, 206079.246068568, 956457.676809915, 314833.091454645, 350808.486275181, 311132.593295603, 289430.68]::numeric[], null),
  ('emergency_purchases_pct', 'A3 Filho Compras', 'BN2:BN8', array[0.0097, 0.0235, 0.0052, 0.0379, 0.0538, 0.0259, 0.0153]::numeric[], null),
  ('overprice_index_pct', 'A3 Filho Compras', 'BT2:BT8', array[0.4046, 0.0589, 0.11, 0.1369, 0.1101, 0.1205, 0.0644]::numeric[], null),
  ('overprice_of_total_purchases_pct', 'A3 Filho Compras', 'BZ2:BZ8', array[0.002786, 0.00131, 0.000512, 0.004561, 0.005332, 0.00278, 0.00093]::numeric[], null);

create temporary table _strategic_actuals_2026 on commit drop as
select
  s.kpi_code,
  u.month::integer as month,
  u.result_value,
  s.source_sheet,
  s.source_range,
  s.transform_note
from _strategic_actual_series_2026 s
cross join lateral unnest(s.monthly_values)
  with ordinality as u(result_value, month)
where u.result_value is not null;

create unique index on _strategic_actuals_2026 (kpi_code, month);

do $$
declare
  v_org_id uuid;
  v_cycle_id uuid;
  v_missing_codes text;
  v_row_count integer;
begin
  select id into v_org_id
  from public.organizations
  where name = 'Marcher Brasil'
  limit 1;

  if v_org_id is null then
    raise exception 'Organização Marcher Brasil não encontrada';
  end if;

  select id into v_cycle_id
  from public.strategic_cycles
  where organization_id = v_org_id
    and year = 2026
  limit 1;

  if v_cycle_id is null then
    raise exception 'Ciclo estratégico 2026 não encontrado para Marcher Brasil';
  end if;

  select string_agg(s.kpi_code, ', ' order by s.kpi_code)
    into v_missing_codes
  from _strategic_actual_series_2026 s
  left join public.strategic_kpis k
    on k.cycle_id = v_cycle_id
   and k.code = s.kpi_code
  where k.id is null;

  if v_missing_codes is not null then
    raise exception 'KPIs do seed não encontrados no ciclo 2026: %', v_missing_codes;
  end if;

  select count(*) into v_row_count from _strategic_actuals_2026;
  if v_row_count <> 376 then
    raise exception 'Extração esperava 376 registros; encontrou %', v_row_count;
  end if;
end;
$$;

with target_org as (
  select id
  from public.organizations
  where name = 'Marcher Brasil'
  limit 1
),
target_cycle as (
  select c.id, c.organization_id
  from public.strategic_cycles c
  join target_org o on o.id = c.organization_id
  where c.year = 2026
  limit 1
),
resolved as (
  select
    tc.organization_id,
    k.id as kpi_id,
    s.month,
    s.result_value
  from _strategic_actuals_2026 s
  join target_cycle tc on true
  join public.strategic_kpis k
    on k.cycle_id = tc.id
   and k.code = s.kpi_code
)
insert into public.strategic_kpi_records
  (organization_id, kpi_id, year, month, result_value, completion_status)
select
  organization_id,
  kpi_id,
  2026,
  month,
  result_value,
  'complete'
from resolved
on conflict (kpi_id, year, month) do update
set
  result_value = excluded.result_value,
  completion_status = 'complete',
  calculation_version = public.strategic_kpi_records.calculation_version + 1,
  version = public.strategic_kpi_records.version + 1,
  updated_at = now()
where public.strategic_kpi_records.result_value is distinct from excluded.result_value
   or public.strategic_kpi_records.completion_status <> 'complete';

do $$
declare
  v_loaded_count integer;
begin
  select count(*)
    into v_loaded_count
  from _strategic_actuals_2026 s
  join public.organizations o
    on o.name = 'Marcher Brasil'
  join public.strategic_cycles c
    on c.organization_id = o.id
   and c.year = 2026
  join public.strategic_kpis k
    on k.cycle_id = c.id
   and k.code = s.kpi_code
  join public.strategic_kpi_records r
    on r.kpi_id = k.id
   and r.year = 2026
   and r.month = s.month
   and r.result_value is not distinct from s.result_value
   and r.completion_status = 'complete';

  if v_loaded_count <> 376 then
    raise exception 'Validação pós-carga esperava 376 registros; encontrou %', v_loaded_count;
  end if;
end;
$$;

commit;

