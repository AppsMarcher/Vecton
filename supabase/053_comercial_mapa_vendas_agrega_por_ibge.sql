-- ---------------------------------------------------------------------------
-- 053 — Mapa de Vendas: agrega por CÓDIGO IBGE, não pelo nome livre do município.
--
-- BUG corrigido: o RPC agrupava por `cl.cidade` (texto livre do cadastro), então
-- dois clientes do MESMO município com o nome grafado diferente
-- (ex.: 000730 "LUIS EDUARDO MAGA" vs 0026666 "LUIS EDUARDO MAGALHAES", mesmo
-- codigo_ibge) viravam DUAS bolhas separadas sobrepostas no mesmo ponto, em vez
-- de uma só somada — o valor de uma parecia "não somar" no mapa.
--
-- A posição sempre foi pelo codigo_ibge (join g.codigo_ibge = cl.codigo_ibge);
-- agora a AGREGAÇÃO e o RÓTULO também são: agrupa por codigo_ibge e usa o nome
-- canônico do município vindo de comercial_municipios_geo (g.municipio). O nome
-- livre do cadastro (cl.cidade) deixa de influenciar o mapa.
--
-- Assinatura idêntica à 051 -> create or replace (sem drop).
-- ---------------------------------------------------------------------------
begin;

create or replace function public.comercial_mapa_vendas(
  p_org uuid, p_year integer, p_month integer, p_period text
)
returns table(
  uf text, municipio text, codigo_ibge text, lat numeric, lng numeric,
  grao_val numeric, pec_val numeric, grao_qtd numeric, pec_qtd numeric
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
  select cl.uf, g.municipio, cl.codigo_ibge, g.lat, g.lng,
         coalesce(sum(le.valor)      filter (where ln.nome = 'Grão'), 0),
         coalesce(sum(le.valor)      filter (where ln.nome = 'Pecuária'), 0),
         coalesce(sum(le.quantidade) filter (where ln.nome = 'Grão'), 0),
         coalesce(sum(le.quantidade) filter (where ln.nome = 'Pecuária'), 0)
  from public.comercial_faturado le
  join public.comercial_linhas_negocio ln on ln.id = le.linha_negocio_id and ln.nome in ('Grão','Pecuária')
  join public.comercial_clientes cl on cl.id = le.cliente_id
  left join public.comercial_municipios_geo g on g.codigo_ibge = cl.codigo_ibge
  where le.organization_id = p_org
    and le.reference_year = p_year
    and le.reference_month between v_lo and v_hi
  group by cl.uf, cl.codigo_ibge, g.municipio, g.lat, g.lng
  having coalesce(sum(le.valor), 0) <> 0;
end;
$$;

grant execute on function public.comercial_mapa_vendas(uuid, integer, integer, text) to authenticated;

commit;
