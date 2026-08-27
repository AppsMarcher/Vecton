-- ---------------------------------------------------------------------------
-- 125 — Mapa de Vendas ganha filtro "Equipe Comercial" (Território /
-- Coordenação / Vendedor), igual ao que o Ranking Geográfico
-- (comercial_mapa_geografico_vendas) já tem.
--
-- A RPC lia de public.comercial_faturado, uma view `select * from
-- comercial_realizado_ledger_entries where origem = 'FAT'` criada na
-- migration 038 — ANTES da coluna cod_vendedor existir (adicionada só na
-- 064). Em Postgres, `select *` numa view fica congelado na lista de colunas
-- de quando ela foi criada; colunas novas na tabela base não aparecem na view
-- automaticamente (mesmo bug já corrigido na 114 pro Ranking Geográfico).
-- Fix: ler direto de comercial_realizado_ledger_entries (com origem='FAT'
-- explícito).
--
-- Assinatura ganha 3 parâmetros novos com default null no final
-- (p_territorio/p_coordenacao/p_vendedor) — create or replace sem precisar
-- dropar, chamadas existentes continuam funcionando.
-- ---------------------------------------------------------------------------
begin;

create or replace function public.comercial_mapa_vendas(
  p_org         uuid,
  p_year        integer,
  p_month       integer,
  p_period      text,
  p_territorio  text[] default null,
  p_coordenacao text[] default null,
  p_vendedor    text[] default null
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
  from public.comercial_realizado_ledger_entries le
  join public.comercial_linhas_negocio ln on ln.id = le.linha_negocio_id and ln.nome in ('Grão','Pecuária')
  join public.comercial_clientes cl on cl.id = le.cliente_id
  left join public.comercial_municipios_geo g on g.codigo_ibge = cl.codigo_ibge
  left join public.comercial_territorios tr on tr.id = le.territorio_id
  left join public.comercial_coordenacoes co on co.id = le.coordenacao_id
  where le.organization_id = p_org
    and le.origem = 'FAT'
    and le.reference_year = p_year
    and le.reference_month between v_lo and v_hi
    and (p_territorio is null or cardinality(p_territorio) = 0 or tr.nome = any(p_territorio))
    and (p_coordenacao is null or cardinality(p_coordenacao) = 0 or co.nome = any(p_coordenacao))
    and (p_vendedor is null or cardinality(p_vendedor) = 0 or le.cod_vendedor = any(p_vendedor))
  group by cl.uf, cl.codigo_ibge, g.municipio, g.lat, g.lng
  having coalesce(sum(le.valor), 0) <> 0;
end;
$$;

grant execute on function public.comercial_mapa_vendas(
  uuid, integer, integer, text, text[], text[], text[]
) to authenticated;

commit;
