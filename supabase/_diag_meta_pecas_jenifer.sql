-- Diagnostico (nao e migration): por que a Meta de Pecas (Budget, 1 linha
-- por mes, ~R$300-460 mil) nao esta caindo na Jenifer no relatorio "seller
-- axis". O motor resolve o vendedor da meta via territorio_id+linha_negocio
-- da linha do planejado -> comercial_atribuicao_responsavel (mesmo join
-- usado antes pra Maquinas). Pecas e nacional: atribuicao correta tem
-- territorio_id NULL + linha_negocio='Peças', responsavel=Jenifer.

-- 1) Como a linha de Pecas foi gravada no ledger: tem territorio_id e
--    linha_negocio_id preenchidos? Qual o valor exato deles?
select
  m.id, m.reference_year, m.reference_month, m.scenario_id,
  m.territorio_id, tr.nome as territorio_nome,
  m.linha_negocio_id, ln.nome as linha_negocio_nome,
  m.produto_id, p.codigo as cod_produto, m.valor
from public.comercial_planejado_ledger_entries m
join public.comercial_produtos p on p.id = m.produto_id
join public.comercial_tipos t on t.id = p.tipo_id
left join public.comercial_territorios tr on tr.id = m.territorio_id
left join public.comercial_linhas_negocio ln on ln.id = m.linha_negocio_id
where m.scenario_id is null
  and t.nome = 'Peças'
order by m.reference_month;

-- 2) A atribuicao oficial da Jenifer pra Pecas: territorio_id e
--    linha_negocio_id EXATOS (pra comparar com a consulta 1 acima).
select
  ar.id, ar.territorio_id, ar.linha_negocio_id, ln.nome as linha_negocio_nome,
  ar.responsavel, ar.cod_vendedor, ar.data_inicio, ar.data_fim
from public.comercial_atribuicao_responsavel ar
join public.comercial_linhas_negocio ln on ln.id = ar.linha_negocio_id
where lower(ar.responsavel) = 'jenifer'
order by ar.data_inicio desc;

-- 3) Reproduz o join exato do motor pra Junho/2026: resolve cod_vendedor ou
--    nao pra essa linha de Pecas?
select
  m.reference_month, m.territorio_id, m.linha_negocio_id, m.valor,
  ar.responsavel, ar.cod_vendedor
from public.comercial_planejado_ledger_entries m
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
where m.scenario_id is null
  and t.nome = 'Peças'
  and m.reference_year = 2026 and m.reference_month = 6;
