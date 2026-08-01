-- Diagnostico (nao e migration): mede a divergencia entre o TIPO ATUAL do
-- cadastro de produto e a LINHA DE NEGOCIO que ficou gravada na carga.
--
-- Contexto: o box lateral do Painel de Vendas (RPC comercial_painel_tipos, 044)
-- resolve o tipo no momento da consulta (join em comercial_produtos), entao
-- reflete a edicao do cadastro na hora. Ja os cards de coordenacao (RPC
-- comercial_painel_vendas, 058) e a tabela de Pecas (RPC
-- comercial_painel_pecas_vendedor, 087) leem linha_negocio_id/coordenacao_id
-- GRAVADOS no ledger na hora da carga -- editar o cadastro depois nao reescreve
-- o ledger. Dai o box mudar e o card/tabela nao.
--
-- Rode ESTE arquivo ANTES da migration 089 para ver exatamente o que ela vai
-- mexer. Ele so le, nao altera nada.

-- ---------------------------------------------------------------------------
-- 1) REALIZADO: linhas cuja linha_negocio gravada nao bate mais com o cadastro
-- ---------------------------------------------------------------------------
with derivada as (
  select
    r.id                as row_id,
    r.batch_id,
    b.organization_id,
    b.reference_year,
    b.reference_month,
    b.status            as batch_status,
    r.cod_produto,
    p.descricao         as produto,
    t.nome              as tipo_cadastro,
    r.tipo_informado,
    ln.nome             as linha_gravada,
    r.origem,
    r.quantidade,
    r.valor,
    case
      when t.nome = 'Peças' then 'Peças'
      when t.nome = 'Máquinas' and c.nome = 'Grãos' then 'Grão'
      when t.nome = 'Máquinas' and c.nome = 'Pecuária' then 'Pecuária'
      when t.nome in ('Transgrain', 'Acessórios') then 'Outros'
    end                 as linha_cadastro
  from public.comercial_realizado_import_rows r
  join public.comercial_realizado_import_batches b on b.id = r.batch_id
  join public.comercial_produtos p on p.id = r.produto_id
  join public.comercial_tipos t on t.id = p.tipo_id
  left join public.comercial_culturas c on c.id = p.cultura_id
  left join public.comercial_linhas_negocio ln on ln.id = r.linha_negocio_id
  where r.validation_status = 'valid'
)
select
  'realizado'      as fonte,
  reference_year,
  reference_month,
  batch_status,
  cod_produto,
  produto,
  tipo_informado   as tipo_na_planilha,
  tipo_cadastro    as tipo_no_cadastro_hoje,
  linha_gravada,
  linha_cadastro   as linha_correta,
  origem,
  count(*)         as linhas,
  sum(valor)       as valor_total,
  count(*) filter (where quantidade is null) as sem_quantidade
from derivada
where linha_cadastro is not null
  and linha_cadastro is distinct from linha_gravada
group by 1,2,3,4,5,6,7,8,9,10,11
order by valor_total desc;

-- ---------------------------------------------------------------------------
-- 2) PLANEJADO (meta): mesma divergencia no lado do orcamento/cenario
-- ---------------------------------------------------------------------------
with derivada as (
  select
    r.id           as row_id,
    b.reference_year,
    coalesce(r.reference_month, b.reference_month) as reference_month,
    b.scenario_id,
    b.status       as batch_status,
    r.cod_produto,
    p.descricao    as produto,
    t.nome         as tipo_cadastro,
    ln.nome        as linha_gravada,
    r.quantidade,
    r.valor,
    case
      when t.nome = 'Peças' then 'Peças'
      when t.nome = 'Máquinas' and c.nome = 'Grãos' then 'Grão'
      when t.nome = 'Máquinas' and c.nome = 'Pecuária' then 'Pecuária'
      when t.nome in ('Transgrain', 'Acessórios') then 'Outros'
    end            as linha_cadastro
  from public.comercial_planejado_import_rows r
  join public.comercial_planejado_import_batches b on b.id = r.batch_id
  join public.comercial_produtos p on p.id = r.produto_id
  join public.comercial_tipos t on t.id = p.tipo_id
  left join public.comercial_culturas c on c.id = p.cultura_id
  left join public.comercial_linhas_negocio ln on ln.id = r.linha_negocio_id
  where r.validation_status = 'valid'
)
select
  'planejado'    as fonte,
  reference_year,
  reference_month,
  scenario_id,
  batch_status,
  cod_produto,
  produto,
  tipo_cadastro  as tipo_no_cadastro_hoje,
  linha_gravada,
  linha_cadastro as linha_correta,
  count(*)       as linhas,
  sum(valor)     as valor_total,
  count(*) filter (where quantidade is null) as sem_quantidade
from derivada
where linha_cadastro is not null
  and linha_cadastro is distinct from linha_gravada
group by 1,2,3,4,5,6,7,8,9,10
order by valor_total desc;

-- ---------------------------------------------------------------------------
-- 3) Conferencia do numero da tela: total de Pecas pelos DOIS caminhos
--    (box lateral = tipo do cadastro; card/tabela = linha gravada no ledger).
--    Troque o ano/mes se precisar. Enquanto divergirem, a 089 nao rodou.
-- ---------------------------------------------------------------------------
select
  'box lateral (tipo do cadastro)' as caminho,
  sum(le.valor) as faturado
from public.comercial_faturado le
join public.comercial_produtos p on p.id = le.produto_id
join public.comercial_tipos t on t.id = p.tipo_id
where t.nome = 'Peças'
  and le.reference_year = 2026
  and le.reference_month = 7
union all
select
  'card/tabela (linha gravada no ledger)',
  sum(le.valor)
from public.comercial_faturado le
join public.comercial_linhas_negocio ln on ln.id = le.linha_negocio_id
where ln.nome = 'Peças'
  and le.reference_year = 2026
  and le.reference_month = 7;
