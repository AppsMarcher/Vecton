begin;

-- 055: acrescenta cidade/uf do cliente ao detalhe do drilldown do Painel de
-- Vendas (popover aberto por comercial_painel_detalhe). Coluna nova exibida
-- no front logo apos o nome do cliente.

drop function if exists public.comercial_painel_detalhe(uuid, integer, integer, text, text[], text[], text, text);

create or replace function public.comercial_painel_detalhe(
  p_org         uuid,
  p_year        integer,
  p_month       integer,
  p_period      text,
  p_origens     text[],
  p_linhas      text[],
  p_coordenacao text default null,
  p_territorio  text default null
)
returns table(
  tipo        text,
  territorio  text,
  cod_cliente text,
  cliente     text,
  cidade      text,
  uf          text,
  cultura     text,
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
  where le.organization_id = p_org
    and le.reference_year = p_year
    and le.reference_month between v_lo and v_hi
    and le.origem = any(p_origens)
    and ln.nome = any(p_linhas)
    and (p_territorio  is null or tr.nome = p_territorio)
    and (p_coordenacao is null or co.nome = p_coordenacao)
  order by le.valor desc nulls last;
end;
$$;

grant execute on function public.comercial_painel_detalhe(uuid, integer, integer, text, text[], text[], text, text) to authenticated;

commit;
