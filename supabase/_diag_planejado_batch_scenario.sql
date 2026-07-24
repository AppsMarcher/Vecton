-- Diagnostico (nao e migration): descobrir em qual cenario (scenario_id)
-- a carga "Meta Com. 2026 [1041].xlsx" (feita ontem/anteontem, com Maquinas
-- de SP/PR/etc pra 06/2026) realmente foi aplicada — o usuario diz que e a
-- base do Budget, mas a consulta anterior mostrou 0 linhas de Maquinas com
-- scenario_id nulo (Budget) em 06/2026, so 76 em "Fcst 5+7".

-- 1) Lotes de carga de planejado mais recentes (a coluna scenario_id do
--    LOTE mostra o "Destino" escolhido na tela no momento do upload).
select
  b.id as batch_id, b.created_at, b.status, b.scenario_id,
  fs.name as cenario_destino, b.load_mode,
  count(r.id) as linhas_no_lote
from public.comercial_planejado_import_batches b
left join public.forecast_scenarios fs on fs.id = b.scenario_id
left join public.comercial_planejado_import_rows r on r.batch_id = b.id
where b.created_at >= now() - interval '5 days'
group by b.id, b.created_at, b.status, b.scenario_id, fs.name, b.load_mode
order by b.created_at desc;

-- 2) Todos os cenarios da organizacao em 2026 (pra saber quais existem e
--    qual e o "is_default", que e o que o Painel/Criador abrem por padrao).
select id, name, is_default, reference_year
from public.forecast_scenarios
where reference_year = 2026
order by is_default desc, name;
