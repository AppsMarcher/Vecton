-- Diagnostico (nao e migration, nao aplica nada): confirma se o ledger tem
-- linhas de Pecas (linha_negocio = 'Peças', origem = 'FAT') em anos
-- anteriores a 2026, e se o filtro de Vendedor (Jenifer/Outros) do relatorio
-- "Performance Geografica de Pecas" teria como funcionar nesses anos.
--
-- Rode no SQL editor do Supabase e compare com o que aparece no relatorio.

-- 1) Faturamento de Pecas por ano (visao "Todos" do relatorio, sem filtro
--    de vendedor) — se aparecer linha pra 2023/2024/2025, o dado existe na
--    base e o relatorio deveria conseguir mostrar ao navegar pro ano no
--    seletor de periodo do cabecalho.
select
  l.reference_year,
  count(*) as linhas,
  count(distinct l.cliente_id) as clientes,
  sum(l.valor) as faturamento
from public.comercial_realizado_ledger_entries l
join public.comercial_linhas_negocio ln on ln.id = l.linha_negocio_id
where ln.nome = 'Peças' and l.origem = 'FAT'
group by 1
order by 1;

-- 2) Mesmo corte, mas separando cod_vendedor nulo vs preenchido por ano —
--    confirma o gap conhecido (coluna so existe desde a migration 064): se
--    o filtro Vendedor=Jenifer estiver sendo usado ao olhar anos antigos,
--    o relatorio vai aparecer vazio mesmo com faturamento existindo.
select
  l.reference_year,
  (l.cod_vendedor is null) as cod_vendedor_nulo,
  count(*) as linhas,
  sum(l.valor) as faturamento
from public.comercial_realizado_ledger_entries l
join public.comercial_linhas_negocio ln on ln.id = l.linha_negocio_id
where ln.nome = 'Peças' and l.origem = 'FAT'
group by 1, 2
order by 1, 2;

-- 3) Primeiro e ultimo mes com dado de Pecas na base — delimita a janela
--    real de carga (deveria começar em 2023-01 conforme a atribuicao
--    seedada; se começar so em 2026, a carga historica de Pecas nunca foi
--    feita, mesmo a atribuicao existindo desde 2023).
select
  min(make_date(l.reference_year, l.reference_month, 1)) as primeiro_mes,
  max(make_date(l.reference_year, l.reference_month, 1)) as ultimo_mes,
  count(*) as linhas_totais
from public.comercial_realizado_ledger_entries l
join public.comercial_linhas_negocio ln on ln.id = l.linha_negocio_id
where ln.nome = 'Peças' and l.origem = 'FAT';
