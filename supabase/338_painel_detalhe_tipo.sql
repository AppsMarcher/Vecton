begin;

-- 338: drill-down do box lateral do Painel de Vendas (Transgrain / Acessorios).
--
-- Transgrain e Acessorios nao tem linha de negocio propria: ambos caem na linha
-- "Outros" (040/045) e so se distinguem pelo TIPO do produto -- o mesmo criterio
-- do box (comercial_painel_tipos). Por isso comercial_painel_detalhe, que filtra
-- por linha/coordenacao/territorio, nao consegue listar um deles sozinho.
--
-- Esta funcao devolve as mesmas colunas e a mesma leitura da comercial_painel_detalhe
-- (ledger vigente, FAT + carteira vigente, ordem estavel por valor/id), filtrando
-- apenas pelo tipo do produto. Sem filtro de coordenacao/territorio: esses tipos
-- nao tem gestao (so valor), igual ao box.

create or replace function public.comercial_painel_detalhe_tipo(
  p_org      uuid,
  p_year     integer,
  p_month    integer,
  p_period   text,
  p_origens  text[],
  p_tipo     text
)
returns table(
  tipo         text,
  territorio   text,
  cod_vendedor text,
  vendedor     text,
  cod_cliente  text,
  cliente      text,
  cidade       text,
  uf           text,
  cultura      text,
  cod_produto  text,
  produto      text,
  quantidade   numeric,
  valor        numeric,
  mb_pct       numeric,
  entry_date   date,
  documento    text,
  serie_documento text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lo integer;
  v_hi integer;
begin
  if not public.is_org_member(p_org) then
    raise exception 'Usuario sem acesso a organizacao';
  end if;

  v_lo := case when p_period = 'mes' then p_month else 1 end;
  v_hi := case when p_period = 'fy' then 12 else p_month end;

  return query
  select
    case when le.origem = 'FAT' then 'NF' else 'Ped' end,
    tr.nome,
    le.cod_vendedor,
    coalesce(ve.nome, le.cod_vendedor),
    le.cod_cliente,
    cl.descricao,
    cl.cidade,
    cl.uf,
    cu.nome,
    le.cod_produto,
    pr.descricao,
    le.quantidade,
    le.valor,
    le.mb_pct,
    le.entry_date,
    le.documento,
    le.serie_documento
  from public.comercial_realizado_ledger_vigente le
  join public.comercial_produtos pr on pr.id = le.produto_id
  join public.comercial_tipos ti on ti.id = pr.tipo_id
  left join public.comercial_territorios tr on tr.id = le.territorio_id
  left join public.comercial_clientes cl on cl.id = le.cliente_id
  left join public.comercial_culturas cu on cu.id = pr.cultura_id
  left join public.comercial_vendedores ve
         on ve.organization_id = le.organization_id
        and ve.codigo = le.cod_vendedor
  where le.organization_id = p_org
    and ti.organization_id = p_org
    and ti.nome = p_tipo
    and le.reference_year = p_year
    and le.reference_month between v_lo and v_hi
    and le.origem = any(p_origens)
  order by le.valor desc nulls last, le.id;
end;
$$;

grant execute on function public.comercial_painel_detalhe_tipo(uuid, integer, integer, text, text[], text) to authenticated;

commit;
