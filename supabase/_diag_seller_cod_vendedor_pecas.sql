-- Diagnostico (nao e migration, nao aplica nada): investiga por que Jenifer
-- aparece zerada no relatorio "Performance por vendedor e cultura" mesmo
-- havendo venda de Pecas (sem cultura) na base.
--
-- Hipotese: o eixo vendedor desse relatorio agrupa por
-- comercial_realizado_ledger_entries.cod_vendedor diretamente (coluna
-- adicionada na migration 064, preenchida a partir do QUE VEM NA PLANILHA DE
-- CARGA — nao e derivada automaticamente do roteamento nacional de Pecas pra
-- Jenifer, que so alimenta responsavel/coordenacao_id, usados pelo Painel de
-- Vendas). Se o cod_vendedor das linhas de Pecas estiver NULL (carga antiga,
-- de antes da 064) ou diferente de '000633' (codigo dela em 064), a receita
-- cai fora da agregacao por vendedor (a condicao "l.cod_vendedor is not
-- null" do motor descarta silenciosamente) ou vai pro codigo errado.
--
-- Rode cada select abaixo no SQL editor do Supabase e compare com o
-- Faturamento de Pecas que voce conferiu na base.

-- 1) Visao geral: quanto de faturamento "sem cultura" (Pecas/Transgrain/
--    Acessorios) esta com cod_vendedor nulo vs preenchido, por mes.
select
  l.reference_year, l.reference_month,
  (l.cod_vendedor is null) as cod_vendedor_nulo,
  count(*) as linhas,
  sum(l.valor) as faturamento
from public.comercial_realizado_ledger_entries l
join public.comercial_produtos p on p.id = l.produto_id
where p.cultura_id is null
group by 1, 2, 3
order by 1, 2, 3;

-- 2) Pra 06/2026 especificamente: faturamento sem cultura por cod_vendedor
--    (null aparece como uma linha propria) — confirma se '000633' (Jenifer)
--    tem alguma coisa, ou se esta tudo em null/outro codigo.
select
  coalesce(l.cod_vendedor, '(nulo)') as cod_vendedor,
  v.nome,
  count(*) as linhas,
  sum(l.valor) as faturamento
from public.comercial_realizado_ledger_entries l
join public.comercial_produtos p on p.id = l.produto_id
left join public.comercial_vendedores v
  on v.organization_id = l.organization_id and v.codigo = l.cod_vendedor
where p.cultura_id is null
  and l.reference_year = 2026 and l.reference_month = 6
group by 1, 2
order by faturamento desc nulls last;

-- 3) Confirma o codigo oficial da Jenifer no cadastro (deveria ser 000633,
--    seedado na migration 064) e se ela esta 'ativo'.
select codigo, nome, situacao
from public.comercial_vendedores
where lower(nome) like '%jenifer%';
