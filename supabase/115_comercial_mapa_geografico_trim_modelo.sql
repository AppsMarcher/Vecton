begin;

-- ---------------------------------------------------------------------------
-- 115 — Corrige fragmentacao de "modelo" por espaco em branco no
-- nome_reduzido. A RPC agrupava por pr.nome_reduzido cru; o filtro Modelo
-- (frontend) ja fazia .trim() ao montar a lista, mas a agregacao do mapa nao
-- — se o cadastro tiver "INGRAIN100" e "INGRAIN100 " (espaco a mais) em
-- produtos diferentes, viravam DOIS "modelos" na mesma UF, cada um pequeno
-- o bastante pra cair fora do Top 5 e inchar o Outros artificialmente.
--
-- Mesma assinatura da 114 — create or replace sem precisar dropar.
-- ---------------------------------------------------------------------------

create or replace function public.comercial_mapa_geografico_vendas(
  p_org          uuid,
  p_year         integer,
  p_month        integer,
  p_period       text,
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
declare v_lo integer; v_hi integer;
begin
  if not public.is_org_member(p_org) then
    raise exception 'Usuario sem acesso a organizacao';
  end if;
  v_lo := case when p_period = 'mes' then p_month else 1 end;
  v_hi := case when p_period = 'fy' then 12 else p_month end;

  return query
  select
    cl.uf,
    coalesce(nullif(trim(pr.nome_reduzido), ''), pr.codigo) as modelo,
    coalesce(cu.nome, 'Outros') as cultura,
    sum(le.quantidade),
    sum(le.valor)
  from public.comercial_realizado_ledger_entries le
  join public.comercial_produtos pr on pr.id = le.produto_id
  join public.comercial_tipos ti on ti.id = pr.tipo_id and ti.nome = 'Máquinas'
  join public.comercial_clientes cl on cl.id = le.cliente_id
  left join public.comercial_culturas cu on cu.id = pr.cultura_id
  left join public.comercial_territorios tr on tr.id = le.territorio_id
  left join public.comercial_coordenacoes co on co.id = le.coordenacao_id
  where le.organization_id = p_org
    and le.origem = 'FAT'
    and le.reference_year = p_year
    and le.reference_month between v_lo and v_hi
    and cl.uf is not null
    and (p_uf is null or cardinality(p_uf) = 0 or cl.uf = any(p_uf))
    and (p_cultura is null or p_cultura = '' or coalesce(cu.nome, 'Outros') = p_cultura)
    and (p_modelo is null or cardinality(p_modelo) = 0
         or coalesce(nullif(trim(pr.nome_reduzido), ''), pr.codigo) = any(p_modelo))
    and (p_territorio is null or cardinality(p_territorio) = 0 or tr.nome = any(p_territorio))
    and (p_coordenacao is null or cardinality(p_coordenacao) = 0 or co.nome = any(p_coordenacao))
    and (p_vendedor is null or cardinality(p_vendedor) = 0 or le.cod_vendedor = any(p_vendedor))
  group by cl.uf, coalesce(nullif(trim(pr.nome_reduzido), ''), pr.codigo), coalesce(cu.nome, 'Outros')
  having coalesce(sum(le.valor), 0) <> 0;
end;
$$;

grant execute on function public.comercial_mapa_geografico_vendas(
  uuid, integer, integer, text, text[], text, text[], text[], text[], text[]
) to authenticated;

commit;
