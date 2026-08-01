begin;

-- 090: habilita o drilldown (popover de transacoes) nas tabelas de PECAS do
-- Painel de Vendas -- consolidado, titular e "Demais".
--
-- O drill ja existia para as coordenacoes de maquinas via
-- comercial_painel_detalhe (048, ampliada pela 055). Ele filtra por
-- coordenacao/territorio + linha de negocio, o que resolve o consolidado de
-- Pecas (coordenacao 'Peças' + linha 'Peças'), mas NAO consegue separar o
-- titular dos demais vendedores: essa quebra vive no cod_vendedor da linha
-- (coluna trazida da planilha na 064) e a RPC nem filtrava nem devolvia esse
-- campo.
--
-- Esta migration acrescenta:
--   * filtro opcional por vendedor -- p_cod_vendedor + p_vendedor_modo
--     ('igual' = titular, 'diferente' = demais). A semantica de 'diferente'
--     espelha EXATAMENTE o bucket 'demais' da 087: linha sem cod_vendedor
--     (carga anterior a 064 ou coluna em branco) conta como "demais", por isso
--     o teste e `is distinct from` e nao `<>`.
--   * colunas cod_vendedor e vendedor no retorno, para o popover mostrar quem
--     vendeu (util justamente na tabela "Demais", que agrega varios). `vendedor`
--     ja vem com fallback para o codigo quando o vendedor nao esta cadastrado em
--     comercial_vendedores -- assim a coluna nunca fica vazia por falta de
--     cadastro, e o sort do front nao precisa de regra extra.
--
-- Compatibilidade: os dois parametros novos tem default null, entao as chamadas
-- antigas (8 argumentos, usadas pelos cards de maquinas) continuam validas e com
-- o mesmo resultado. Como o RETURNS TABLE muda, e preciso DROP antes do CREATE
-- (nao da para `create or replace` alterando o tipo de retorno) -- mesmo padrao
-- ja usado na 051 e na propria 055.

drop function if exists public.comercial_painel_detalhe(uuid, integer, integer, text, text[], text[], text, text);
drop function if exists public.comercial_painel_detalhe(uuid, integer, integer, text, text[], text[], text, text, text, text);

create function public.comercial_painel_detalhe(
  p_org           uuid,
  p_year          integer,
  p_month         integer,
  p_period        text,
  p_origens       text[],
  p_linhas        text[],
  p_coordenacao   text default null,
  p_territorio    text default null,
  p_cod_vendedor  text default null,
  p_vendedor_modo text default null
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
  mb_pct       numeric
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

  if p_vendedor_modo is not null and p_vendedor_modo not in ('igual', 'diferente') then
    raise exception 'p_vendedor_modo invalido: % (use igual, diferente ou null)', p_vendedor_modo;
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
    le.mb_pct
  from public.comercial_realizado_ledger_entries le
  join public.comercial_linhas_negocio ln on ln.id = le.linha_negocio_id
  left join public.comercial_territorios tr on tr.id = le.territorio_id
  left join public.comercial_clientes cl on cl.id = le.cliente_id
  left join public.comercial_produtos pr on pr.id = le.produto_id
  left join public.comercial_culturas cu on cu.id = pr.cultura_id
  left join public.comercial_coordenacoes co on co.id = le.coordenacao_id
  left join public.comercial_vendedores ve
         on ve.organization_id = le.organization_id
        and ve.codigo = le.cod_vendedor
  where le.organization_id = p_org
    and le.reference_year = p_year
    and le.reference_month between v_lo and v_hi
    and le.origem = any(p_origens)
    and ln.nome = any(p_linhas)
    and (p_territorio  is null or tr.nome = p_territorio)
    and (p_coordenacao is null or co.nome = p_coordenacao)
    and (
      p_vendedor_modo is null
      or (p_vendedor_modo = 'igual'     and le.cod_vendedor = p_cod_vendedor)
      or (p_vendedor_modo = 'diferente' and le.cod_vendedor is distinct from p_cod_vendedor)
    )
  order by le.valor desc nulls last;
end;
$$;

grant execute on function public.comercial_painel_detalhe(uuid, integer, integer, text, text[], text[], text, text, text, text) to authenticated;

commit;
