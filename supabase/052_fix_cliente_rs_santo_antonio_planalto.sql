-- ---------------------------------------------------------------------------
-- 052 — Correção de geolocalização: o único cliente RS sem codigo_ibge
-- ("SANTO ANTONIO D…", R$ 105 mil de máquinas) é Santo Antônio do Planalto/RS
-- (IBGE 4317756, já presente em comercial_municipios_geo). Preenche o IBGE
-- pra ele passar a aparecer como bolha no Mapa de Vendas.
--
-- Contexto: diagnóstico do mapa mostrou só 2 grupos "sem localização" —
-- Exterior (uf='EX', exportação, sem geografia por natureza, mantido como está)
-- e este cliente RS. A cobertura de municípios da geo está completa.
--
-- Idempotente: o filtro `codigo_ibge is null` faz a 2ª execução não afetar nada.
-- ---------------------------------------------------------------------------
begin;

update public.comercial_clientes
set codigo_ibge = '4317756'
where uf = 'RS'
  and codigo_ibge is null
  and upper(cidade) like 'SANTO ANTONIO%';

commit;
