begin;

-- 258 — Evolutivo de Margens: detalhe por NF de uma celula (maquina x mes).
--
-- Ao clicar no valor de um mes na tabela "Evolutivo de Margens · Marcher", o
-- front abre um popover com as notas fiscais que compoem aquela celula. A
-- celula pode ser uma maquina-pai (varios cod_produto) ou um item (um so),
-- por isso p_cods e um array.
--
-- Uma linha por lancamento do ledger (nada e agrupado): 5 vendas + 1 devolucao
-- = 6 linhas, a devolucao com sinal negativo.
-- Mesmas regras da comercial_margens_itens (255/256): so FAT, liquido de
-- devolucao (as devolucoes aparecem como linhas negativas), acesso restrito a
-- super_admin, admin e manager, e o mesmo filtro opcional de Equipe Comercial.
-- Regional Marcher = territorio comercial.

create or replace function public.comercial_margens_detalhe(
  p_org         uuid,
  p_year        integer,
  p_month       integer,
  p_cods        text[],
  p_territorio  text[] default null,
  p_coordenacao text[] default null,
  p_vendedor    text[] default null
)
returns table(
  entry_date      date,
  documento       text,
  serie_documento text,
  cod_produto     text,
  produto         text,
  cliente         text,
  cidade          text,
  uf              text,
  regional        text,
  quantidade      numeric,
  fat             numeric,
  rl              numeric,
  mp              numeric
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

  if not exists (
    select 1 from public.user_profiles up
     where up.organization_id = p_org
       and up.user_id = auth.uid()
       and (
         up.access_role in ('super_admin', 'admin', 'manager')
         or 'manager' = any(up.additional_access_roles)
       )
  ) then
    raise exception 'Usuario sem permissao para o relatorio de margens';
  end if;

  return query
  select le.entry_date,
         le.documento,
         le.serie_documento,
         le.cod_produto,
         pr.descricao,
         cl.descricao,
         cl.cidade,
         cl.uf,
         tr.nome,
         le.quantidade,
         le.valor,
         coalesce(le.rl, 0),
         coalesce(le.mp, 0)
    from public.comercial_realizado_ledger_entries le
    left join public.comercial_produtos    pr on pr.id = le.produto_id
    left join public.comercial_clientes    cl on cl.id = le.cliente_id
    left join public.comercial_territorios tr on tr.id = le.territorio_id
    left join public.comercial_coordenacoes co on co.id = le.coordenacao_id
   where le.organization_id = p_org
     and le.origem = 'FAT'
     and le.reference_year = p_year
     and le.reference_month = p_month
     and le.cod_produto = any(p_cods)
     and (p_territorio  is null or cardinality(p_territorio)  = 0 or tr.nome = any(p_territorio))
     and (p_coordenacao is null or cardinality(p_coordenacao) = 0 or co.nome = any(p_coordenacao))
     and (p_vendedor    is null or cardinality(p_vendedor)    = 0 or le.cod_vendedor = any(p_vendedor))
   order by le.entry_date, le.documento;
end;
$$;

grant execute on function public.comercial_margens_detalhe(uuid, integer, integer, text[], text[], text[], text[]) to authenticated;

commit;
