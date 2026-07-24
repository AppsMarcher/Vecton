begin;

-- Extrato do "Bateu, Levou": ao clicar no botao EXTRATO de um dos 2 boards
-- (Grao/Pecuaria), lista as transacoes de Faturado (mesma fonte da RPC
-- comercial_bateu_levou) que formam os numeros da campanha inteira daquela
-- linha -- todos os RCs elegiveis juntos, nao 1 RC so. Mesma estrutura do
-- popover do Painel de Vendas (comercial_painel_detalhe), mas troca Tipo por
-- RC (aqui so existe origem FAT, entao Tipo seria sempre "NF" -- inutil) e
-- tira Cultura (lista ja e especifica de 1 linha so).

create or replace function public.comercial_bateu_levou_extrato(
  p_org   uuid,
  p_year  integer,
  p_month integer,
  p_linha text
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
  join public.comercial_linhas_negocio ln on ln.id = le.linha_negocio_id
  left join public.comercial_territorios tr on tr.id = le.territorio_id
  left join public.comercial_clientes cl on cl.id = le.cliente_id
  left join public.comercial_produtos pr on pr.id = le.produto_id
  left join public.comercial_atribuicao_responsavel ar
    on ar.territorio_id = le.territorio_id
   and ar.linha_negocio_id = le.linha_negocio_id
   and ar.responsavel = le.responsavel
  where le.organization_id = p_org
    and le.reference_year = p_year
    and le.reference_month = p_month
    and ln.nome = p_linha
    and le.responsavel is not null
    and lower(le.responsavel) <> 'a definir'
    and coalesce(ar.elegivel_campanha, true)
  order by le.valor desc nulls last;
end;
$$;

grant execute on function public.comercial_bateu_levou_extrato(uuid, integer, integer, text) to authenticated;

commit;
