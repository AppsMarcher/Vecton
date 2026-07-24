-- ===========================================================================
-- DIAGNÓSTICO (não é migration) — Mapa de Vendas: faturado de MÁQUINAS
-- (Grão/Pecuária) que NÃO vira bolha no mapa por falta de geolocalização.
-- Rode no SQL editor do Supabase e me mande o resultado da query 2.
-- A diferença entre "Top estados" (total do estado) e a soma das bolhas =
-- exatamente essas linhas (cliente sem codigo_ibge OU município fora da geo).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) RESUMO por UF — o quanto de faturado está "sem localização" em cada estado
--    (pra medir materialidade; olhe a BA aqui primeiro)
-- ---------------------------------------------------------------------------
select
  cl.uf,
  round(sum(le.valor) / 1000.0)  as sem_local_mil,
  count(distinct cl.id)          as clientes
from public.comercial_faturado le
join public.comercial_linhas_negocio ln
  on ln.id = le.linha_negocio_id and ln.nome in ('Grão', 'Pecuária')
join public.comercial_clientes cl
  on cl.id = le.cliente_id
left join public.comercial_municipios_geo g
  on g.codigo_ibge = cl.codigo_ibge
where g.codigo_ibge is null          -- não casou com a tabela de geo
group by cl.uf
order by sum(le.valor) desc;

-- ---------------------------------------------------------------------------
-- 2) DETALHE por município — a lista do que precisa ser corrigido/seedado.
--    'motivo' diz qual dos dois problemas é:
--      - cliente sem codigo_ibge  -> falta preencher o IBGE do CLIENTE
--      - municipio ausente na geo -> falta INSERIR o município em
--                                    comercial_municipios_geo (lat/lng)
--    ME MANDE ESTE RESULTADO (pode filtrar por uf='BA' se quiser começar por ela).
-- ---------------------------------------------------------------------------
select
  cl.uf,
  cl.cidade,
  cl.codigo_ibge,
  case
    when cl.codigo_ibge is null then 'cliente sem codigo_ibge'
    else 'municipio ausente na geo'
  end                            as motivo,
  count(distinct cl.id)          as clientes,
  round(sum(le.valor) / 1000.0)  as faturado_mil
from public.comercial_faturado le
join public.comercial_linhas_negocio ln
  on ln.id = le.linha_negocio_id and ln.nome in ('Grão', 'Pecuária')
join public.comercial_clientes cl
  on cl.id = le.cliente_id
left join public.comercial_municipios_geo g
  on g.codigo_ibge = cl.codigo_ibge
where g.codigo_ibge is null
-- and cl.uf = 'BA'                  -- descomente pra focar na Bahia
group by cl.uf, cl.cidade, cl.codigo_ibge
order by sum(le.valor) desc;
