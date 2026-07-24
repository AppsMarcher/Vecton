begin;

-- "Bateu, Levou": campanha mensal de atingimento de meta (volume real x meta),
-- restrita aos RCs (responsaveis de territorio), separada em Grao/Pecuaria.
-- Mesma base de dados do Painel de Vendas (comercial_faturado/comercial_planejado),
-- mas SEM agrupamento territorial/geografico -- ranking flat por pessoa.
--
-- Gerente geral, coordenadores e vendedores internos NAO disputam. Marcado por
-- ATRIBUICAO (territorio+linha), nao por nome global -- necessario porque o
-- mesmo primeiro nome pode ser 2 pessoas diferentes (ex: "Gustavo" em RS Sul
-- e um "Gustavo" existe tambem em RO como RC de campo real).

alter table public.comercial_atribuicao_responsavel
  add column if not exists elegivel_campanha boolean not null default true;

comment on column public.comercial_atribuicao_responsavel.elegivel_campanha is
  'Falso para quem nao disputa a campanha Bateu, Levou (gerente geral, coordenadores, vendedores internos). Controlado por atribuicao (territorio+linha), nao por nome global.';

-- Gerente geral (Pedro) e coordenadores (Yuri/Danilo/Izaque/Paulo/Pablo/Jenifer)
-- fora da disputa. Cobre tambem os casos em que o proprio coordenador aparece
-- como responsavel (territorios orfaos que somam direto nele, EX e Pecas).
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
)
update public.comercial_atribuicao_responsavel ar
set elegivel_campanha = false
from target_org
where ar.organization_id = target_org.id
  and ar.responsavel in ('Pedro', 'Yuri', 'Danilo', 'Izaque', 'Paulo', 'Pablo', 'Jenifer');

-- Territorios sem RC nomeado ("A definir": BA-Pecuaria, TO-Pecuaria) tambem
-- ficam fora -- ninguem disputa por eles.
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
)
update public.comercial_atribuicao_responsavel ar
set elegivel_campanha = false
from target_org
where ar.organization_id = target_org.id
  and lower(ar.responsavel) = 'a definir';

-- Vendedores internos: Andre (SP) e Gustavo (RS Sul) especificamente. NAO o
-- Gustavo de RO -- e um RC de campo de verdade, so coincide o primeiro nome.
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
sp as (
  select id from public.comercial_territorios
  where organization_id = (select id from target_org) and nome = 'SP'
),
rs_sul as (
  select id from public.comercial_territorios
  where organization_id = (select id from target_org) and nome = 'RS SUL'
)
update public.comercial_atribuicao_responsavel ar
set elegivel_campanha = false
from target_org
where ar.organization_id = target_org.id
  and (
    (ar.territorio_id = (select id from sp) and ar.responsavel = 'André')
    or (ar.territorio_id = (select id from rs_sul) and ar.responsavel = 'Gustavo')
  );

-- ---------------------------------------------------------------------------
-- RPC: agregacao por (responsavel, linha) -- 1 linha por pessoa, Grao/Pecuaria
-- separados, so mes fechado (sem YTD/FY, e campanha mensal). Real = Faturado
-- (FAT) apenas, nao FAT+CART. Meta = comercial_planejado do cenario informado
-- (null = Budget base). territorios = lista informativa (territorio(s) que a
-- pessoa cobre nessa linha, no periodo).
-- ---------------------------------------------------------------------------

create or replace function public.comercial_bateu_levou(
  p_org         uuid,
  p_year        integer,
  p_month       integer,
  p_scenario_id uuid default null
)
returns table(
  responsavel text,
  linha       text,
  territorios text,
  real_qtd    numeric,
  meta_qtd    numeric
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
  with real as (
    select le.responsavel, ln.nome as linha, le.territorio_id, sum(le.quantidade) as qtd
    from public.comercial_faturado le
    join public.comercial_linhas_negocio ln on ln.id = le.linha_negocio_id
    left join public.comercial_atribuicao_responsavel ar
      on ar.territorio_id = le.territorio_id
     and ar.linha_negocio_id = le.linha_negocio_id
     and ar.responsavel = le.responsavel
    where le.organization_id = p_org
      and le.reference_year = p_year
      and le.reference_month = p_month
      and ln.nome in ('Grão', 'Pecuária')
      and le.responsavel is not null
      and lower(le.responsavel) <> 'a definir'
      and coalesce(ar.elegivel_campanha, true)
    group by le.responsavel, ln.nome, le.territorio_id
  ),
  meta as (
    select le.responsavel, ln.nome as linha, le.territorio_id, sum(le.quantidade) as qtd
    from public.comercial_planejado le
    join public.comercial_linhas_negocio ln on ln.id = le.linha_negocio_id
    left join public.comercial_atribuicao_responsavel ar
      on ar.territorio_id = le.territorio_id
     and ar.linha_negocio_id = le.linha_negocio_id
     and ar.responsavel = le.responsavel
    where le.organization_id = p_org
      and le.reference_year = p_year
      and le.reference_month = p_month
      and ln.nome in ('Grão', 'Pecuária')
      and le.responsavel is not null
      and lower(le.responsavel) <> 'a definir'
      and coalesce(ar.elegivel_campanha, true)
      and ((p_scenario_id is null and le.scenario_id is null) or le.scenario_id = p_scenario_id)
    group by le.responsavel, ln.nome, le.territorio_id
  ),
  real_agg as (
    select real.responsavel, real.linha, sum(real.qtd) as real_qtd
    from real
    group by real.responsavel, real.linha
  ),
  meta_agg as (
    select meta.responsavel, meta.linha, sum(meta.qtd) as meta_qtd
    from meta
    group by meta.responsavel, meta.linha
  ),
  terrs as (
    select real.responsavel, real.linha, real.territorio_id from real
    union
    select meta.responsavel, meta.linha, meta.territorio_id from meta
  ),
  terr_names as (
    select t.responsavel, t.linha,
           string_agg(distinct tr.nome, ', ' order by tr.nome) as territorios
    from terrs t
    left join public.comercial_territorios tr on tr.id = t.territorio_id
    group by t.responsavel, t.linha
  ),
  keys as (
    select real_agg.responsavel, real_agg.linha from real_agg
    union
    select meta_agg.responsavel, meta_agg.linha from meta_agg
  )
  select
    k.responsavel,
    k.linha,
    tn.territorios,
    coalesce(r.real_qtd, 0),
    coalesce(m.meta_qtd, 0)
  from keys k
  left join real_agg r on r.responsavel = k.responsavel and r.linha = k.linha
  left join meta_agg m on m.responsavel = k.responsavel and m.linha = k.linha
  left join terr_names tn on tn.responsavel = k.responsavel and tn.linha = k.linha
  order by k.linha, k.responsavel;
end;
$$;

grant execute on function public.comercial_bateu_levou(uuid, integer, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Card no catalogo de Relatorios, secao "Comercial" (migration 059 ja seedou
-- as 5 secoes/12 itens -- so adiciona este item novo pras orgs existentes).
-- ---------------------------------------------------------------------------

insert into public.report_section_items (organization_id, section_id, report_id, sort_order)
select rs.organization_id, rs.id, 'comercialBateuLevou', 2
from public.report_sections rs
where rs.name = 'Comercial'
on conflict (organization_id, report_id) do nothing;

commit;
