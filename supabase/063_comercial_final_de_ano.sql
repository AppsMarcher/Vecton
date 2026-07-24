begin;

-- "Final de Ano": campanha ANUAL de atingimento de meta de FATURAMENTO (R$),
-- YTD (jan ate o mes do cabecalho), aberta a Representantes Comerciais E
-- vendedores internos (Andre/SP, Gustavo/RS Sul) -- ao contrario do
-- Bateu,Levou, que exclui esses dois. Ranking UNICO por pessoa (Grao+Pecuaria
-- somados, sem separar board). Mesma base de dados do Painel de Vendas
-- (comercial_faturado/comercial_planejado). Nao filtra linha_negocio: Pecas
-- (Jenifer) e Outros (responsavel nulo) ja saem sozinhos pela exclusao de
-- coordenador/nome nulo abaixo -- se algum dia Pecas tiver responsavel
-- proprio nao-coordenador, entra automaticamente, sem precisar mexer aqui.
--
-- Territorio "A definir" fica de fora do agregado de qualquer pessoa (nao
-- soma nem para o coordenador) -- diferente do rollup do Painel de Vendas.
--
-- CUIDADO -- colisao de nome: existem 2 pessoas diferentes chamadas
-- "Gustavo" no cadastro (RS Sul e RO), coincidencia de primeiro nome (mesmo
-- problema ja documentado/corrigido no Painel de Vendas, matricial/regiao).
-- Bateu,Levou nao sofre disso porque exclui o Gustavo de RS Sul (vendedor
-- interno); aqui os dois ficam elegiveis, entao agrupar so por `responsavel`
-- somaria as 2 pessoas erradamente. Fix: agrupa por (responsavel, "casa"),
-- onde casa = coordenacao da atribuicao de GRAO vigente do territorio (mesmo
-- conceito de "casa geografica" do Painel) -- Gustavo/RS Sul cai em casa=Sul,
-- Gustavo/RO cai em casa=Oeste, nunca se somam. Claudemir (MA+PI, mesma
-- pessoa de verdade) continua se fundindo normalmente porque os dois
-- territorios compartilham casa=Norte.

create or replace function public.comercial_final_de_ano(
  p_org         uuid,
  p_year        integer,
  p_month       integer,
  p_scenario_id uuid default null
)
returns table(
  responsavel text,
  territorios text,
  real_val    numeric,
  meta_val    numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_org_member(p_org) then
    raise exception 'Usuario sem acesso a organizacao';
  end if;

  return query
  with casa as (
    select ar.territorio_id, ar.coordenacao_id as casa_id
    from public.comercial_atribuicao_responsavel ar
    join public.comercial_linhas_negocio ln on ln.id = ar.linha_negocio_id
    where ln.nome = 'Grão' and ar.data_fim is null
  ),
  real as (
    select le.responsavel, c.casa_id, le.territorio_id, sum(le.valor) as val
    from public.comercial_faturado le
    left join casa c on c.territorio_id = le.territorio_id
    where le.organization_id = p_org
      and le.reference_year = p_year
      and le.reference_month <= p_month
      and le.responsavel is not null
      and lower(le.responsavel) <> 'a definir'
      and le.responsavel not in ('Pedro', 'Yuri', 'Danilo', 'Izaque', 'Paulo', 'Pablo', 'Jenifer')
    group by le.responsavel, c.casa_id, le.territorio_id
  ),
  meta as (
    select le.responsavel, c.casa_id, le.territorio_id, sum(le.valor) as val
    from public.comercial_planejado le
    left join casa c on c.territorio_id = le.territorio_id
    where le.organization_id = p_org
      and le.reference_year = p_year
      and le.reference_month <= p_month
      and le.responsavel is not null
      and lower(le.responsavel) <> 'a definir'
      and le.responsavel not in ('Pedro', 'Yuri', 'Danilo', 'Izaque', 'Paulo', 'Pablo', 'Jenifer')
      and ((p_scenario_id is null and le.scenario_id is null) or le.scenario_id = p_scenario_id)
    group by le.responsavel, c.casa_id, le.territorio_id
  ),
  real_agg as (
    select real.responsavel, real.casa_id, sum(real.val) as real_val
    from real
    group by real.responsavel, real.casa_id
  ),
  meta_agg as (
    select meta.responsavel, meta.casa_id, sum(meta.val) as meta_val
    from meta
    group by meta.responsavel, meta.casa_id
  ),
  terrs as (
    select real.responsavel, real.casa_id, real.territorio_id from real
    union
    select meta.responsavel, meta.casa_id, meta.territorio_id from meta
  ),
  terr_names as (
    select t.responsavel, t.casa_id,
           string_agg(distinct tr.nome, ', ' order by tr.nome) as territorios
    from terrs t
    left join public.comercial_territorios tr on tr.id = t.territorio_id
    group by t.responsavel, t.casa_id
  ),
  keys as (
    select real_agg.responsavel, real_agg.casa_id from real_agg
    union
    select meta_agg.responsavel, meta_agg.casa_id from meta_agg
  )
  select
    k.responsavel,
    tn.territorios,
    coalesce(r.real_val, 0),
    coalesce(m.meta_val, 0)
  from keys k
  left join real_agg r on r.responsavel = k.responsavel and r.casa_id is not distinct from k.casa_id
  left join meta_agg m on m.responsavel = k.responsavel and m.casa_id is not distinct from k.casa_id
  left join terr_names tn on tn.responsavel = k.responsavel and tn.casa_id is not distinct from k.casa_id
  order by k.responsavel;
end;
$$;

grant execute on function public.comercial_final_de_ano(uuid, integer, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Extrato: ao clicar no botao EXTRATO do ranking, lista as transacoes de
-- Faturado (mesma fonte da RPC acima) que formam os numeros da campanha
-- inteira YTD -- todas as pessoas elegiveis juntas, sem separar por linha
-- (o ranking e unico). Mesma estrutura do popover do Bateu,Levou (061), so
-- sem o filtro p_linha.
-- ---------------------------------------------------------------------------

create or replace function public.comercial_final_de_ano_extrato(
  p_org   uuid,
  p_year  integer,
  p_month integer
)
returns table(
  responsavel text,
  territorio  text,
  cod_cliente text,
  cliente     text,
  cidade      text,
  uf          text,
  cod_produto text,
  produto     text,
  quantidade  numeric,
  valor       numeric,
  mb_pct      numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_org_member(p_org) then
    raise exception 'Usuario sem acesso a organizacao';
  end if;

  return query
  select
    le.responsavel,
    tr.nome,
    le.cod_cliente,
    cl.descricao,
    cl.cidade,
    cl.uf,
    le.cod_produto,
    pr.descricao,
    le.quantidade,
    le.valor,
    le.mb_pct
  from public.comercial_faturado le
  left join public.comercial_territorios tr on tr.id = le.territorio_id
  left join public.comercial_clientes cl on cl.id = le.cliente_id
  left join public.comercial_produtos pr on pr.id = le.produto_id
  where le.organization_id = p_org
    and le.reference_year = p_year
    and le.reference_month <= p_month
    and le.responsavel is not null
    and lower(le.responsavel) <> 'a definir'
    and le.responsavel not in ('Pedro', 'Yuri', 'Danilo', 'Izaque', 'Paulo', 'Pablo', 'Jenifer')
  order by le.valor desc nulls last;
end;
$$;

grant execute on function public.comercial_final_de_ano_extrato(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Card no catalogo de Relatorios, secao "Comercial", logo apos "Bateu, Levou"
-- (sort_order 2 -- ver migration 060).
-- ---------------------------------------------------------------------------

insert into public.report_section_items (organization_id, section_id, report_id, sort_order)
select rs.organization_id, rs.id, 'comercialFinalDeAno', 3
from public.report_sections rs
where rs.name = 'Comercial'
on conflict (organization_id, report_id) do nothing;

commit;
