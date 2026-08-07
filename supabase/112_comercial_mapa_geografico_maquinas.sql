begin;

-- ---------------------------------------------------------------------------
-- 112 — Relatorio novo "Vendas - Distribuicao Geografica" (Maquinas).
--
-- Agrega o FATURADO (comercial_faturado, so FAT) de produtos Tipo=Maquinas por
-- UF x Modelo x Cultura. Modelo = comercial_produtos.nome_reduzido (migration
-- 111), com fallback pro codigo enquanto o campo nao estiver preenchido.
--
-- Diferente do Painel/Mapa de Vendas existentes (que usam o seletor
-- mes/ytd/fy do cabecalho do site), este relatorio tem filtro de PERIODO
-- LIVRE (data inicial/data final), conforme a especificacao recebida — filtra
-- por entry_date, nao por reference_year/reference_month.
--
-- Grao de retorno = UF x Modelo x Cultura. O frontend deriva o resto (total
-- por UF, mix por modelo, mix por cultura, preco medio, ranking, comparativo
-- Brasil x UF etc.) somando essa mesma tabela em memoria — nao duplica logica
-- de agregacao no banco pra cada card.
-- ---------------------------------------------------------------------------

create or replace function public.comercial_mapa_geografico_vendas(
  p_org          uuid,
  p_date_from    date,
  p_date_to      date,
  p_uf           text[] default null,
  p_cultura      text   default null,
  p_modelo       text[] default null,
  p_territorio   text[] default null,
  p_coordenacao  text[] default null,
  p_vendedor     text[] default null
)
returns table(
  uf          text,
  modelo      text,
  cultura     text,
  quantidade  numeric,
  valor       numeric
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
    cl.uf,
    coalesce(nullif(pr.nome_reduzido, ''), pr.codigo) as modelo,
    coalesce(cu.nome, 'Outros') as cultura,
    sum(le.quantidade),
    sum(le.valor)
  from public.comercial_faturado le
  join public.comercial_produtos pr on pr.id = le.produto_id
  join public.comercial_tipos ti on ti.id = pr.tipo_id and ti.nome = 'Máquinas'
  join public.comercial_clientes cl on cl.id = le.cliente_id
  left join public.comercial_culturas cu on cu.id = pr.cultura_id
  left join public.comercial_territorios tr on tr.id = le.territorio_id
  left join public.comercial_coordenacoes co on co.id = le.coordenacao_id
  where le.organization_id = p_org
    and le.entry_date between p_date_from and p_date_to
    and cl.uf is not null
    and (p_uf is null or cardinality(p_uf) = 0 or cl.uf = any(p_uf))
    and (p_cultura is null or p_cultura = '' or coalesce(cu.nome, 'Outros') = p_cultura)
    and (p_modelo is null or cardinality(p_modelo) = 0
         or coalesce(nullif(pr.nome_reduzido, ''), pr.codigo) = any(p_modelo))
    and (p_territorio is null or cardinality(p_territorio) = 0 or tr.nome = any(p_territorio))
    and (p_coordenacao is null or cardinality(p_coordenacao) = 0 or co.nome = any(p_coordenacao))
    and (p_vendedor is null or cardinality(p_vendedor) = 0 or le.cod_vendedor = any(p_vendedor))
  group by cl.uf, coalesce(nullif(pr.nome_reduzido, ''), pr.codigo), coalesce(cu.nome, 'Outros')
  having coalesce(sum(le.valor), 0) <> 0;
end;
$$;

grant execute on function public.comercial_mapa_geografico_vendas(
  uuid, date, date, text[], text, text[], text[], text[], text[]
) to authenticated;

commit;
