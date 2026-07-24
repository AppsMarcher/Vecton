-- Diagnostico (nao e migration): Andre/Gustavo aparecem com Meta R$0,00 em
-- TODOS os cards de "Performance por vendedor e cultura" no cenario Budget,
-- mas a Jenifer tem Meta normal. Precisa descobrir se e (a) o cenario Budget
-- realmente nao tem planejado de Maquinas carregado ainda (dado, nao bug) ou
-- (b) a atribuicao territorio->vendedor esta sem cod_vendedor preenchido pra
-- essas linhas (o que quebraria Meta em QUALQUER cenario, nao so Budget).
--
-- O motor resolve o vendedor da META via
-- comercial_atribuicao_responsavel.cod_vendedor (territorio+linha_negocio+
-- vigencia), NAO por um cod_vendedor direto na linha do planejado (esse so
-- existe no realizado). Se cod_vendedor estiver nulo na atribuicao, a linha
-- de meta e descartada do calculo por vendedor (join lateral sem match).

-- 1) Atribuicoes de Andre/Gustavo Carvalho vigentes em 06/2026: cod_vendedor
--    esta preenchido? (deveria ter sido preenchido pela migration 064)
select
  tr.nome as territorio, ln.nome as linha_negocio, ar.responsavel, ar.cod_vendedor,
  ar.data_inicio, ar.data_fim
from public.comercial_atribuicao_responsavel ar
join public.comercial_territorios tr on tr.id = ar.territorio_id
join public.comercial_linhas_negocio ln on ln.id = ar.linha_negocio_id
where lower(ar.responsavel) in ('andré', 'andre', 'gustavo')
  and ar.data_inicio <= '2026-06-30'
  and (ar.data_fim is null or ar.data_fim >= '2026-06-01')
order by tr.nome, ln.nome;

-- 2) Planejado (META) de Maquinas (Grao/Pecuaria) em 06/2026, por cenario:
--    tem linha nenhuma? Troque o uuid abaixo pelo id do cenario Budget e do
--    Fcst 5+7 (rode primeiro "select id, name, is_default from
--    forecast_scenarios where reference_year=2026" pra pegar os ids).
select fs.name as cenario, count(*) as linhas, sum(m.valor) as meta_total
from public.comercial_planejado_ledger_entries m
join public.comercial_produtos p on p.id = m.produto_id
join public.comercial_tipos t on t.id = p.tipo_id
left join public.forecast_scenarios fs on fs.id = m.scenario_id
where m.organization_id = (select organization_id from public.comercial_planejado_ledger_entries limit 1)
  and m.reference_year = 2026 and m.reference_month = 6
  and t.nome = 'Máquinas'
group by fs.name
order by cenario nulls first;

-- 3) Pra cada linha de planejado de Maquinas em 06/2026 (cenario Budget,
--    troque :scenario_id abaixo), confirma se a atribuicao resolve
--    cod_vendedor ou nao — reproduz exatamente o join do motor.
select
  m.id as planejado_id, m.territorio_id, tr.nome as territorio,
  ln.nome as linha_negocio, m.valor,
  ar.responsavel, ar.cod_vendedor
from public.comercial_planejado_ledger_entries m
left join public.comercial_territorios tr on tr.id = m.territorio_id
left join public.comercial_linhas_negocio ln on ln.id = m.linha_negocio_id
join public.comercial_produtos p on p.id = m.produto_id
join public.comercial_tipos t on t.id = p.tipo_id
left join lateral (
  select a.* from public.comercial_atribuicao_responsavel a
  where a.organization_id = m.organization_id
    and a.territorio_id is not distinct from m.territorio_id
    and a.linha_negocio_id = m.linha_negocio_id
    and make_date(m.reference_year, m.reference_month, 1) >= a.data_inicio
    and (a.data_fim is null or make_date(m.reference_year, m.reference_month, 1) <= a.data_fim)
  order by a.data_inicio desc limit 1
) ar on true
where m.reference_year = 2026 and m.reference_month = 6
  and t.nome = 'Máquinas'
  and m.scenario_id is null -- Budget = scenario_id nulo; troque se quiser testar outro cenario
order by ar.cod_vendedor nulls first, territorio;
