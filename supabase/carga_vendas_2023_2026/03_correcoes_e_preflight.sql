-- 03: correcoes pontuais no staging + checagens previas (nada toca o ledger).
-- As linhas abaixo vieram do Excel com problema; o valor correto e o que JA esta no ledger atual.
--   * 19 linhas com territorio 'NAO ENCONTRADO' (falha de PROCV no Excel) -> territorio do ledger atual.
--   * 4 linhas de FAT vazio (RL e MP tambem vazios) -> FAT do ledger atual; RL/MP ficam nulos.
begin;

do $$
declare k integer;
begin
  update public.stg_carga_vendas_2023_2026 s
     set territorio = c.t,
         obs = coalesce(s.obs || ' | ', '') || 'territorio corrigido de NAO ENCONTRADO (' || c.ref || ')'
  from (values
  (5536,'MS','data 2023-06-05 prod 09001124 cli 003450'),
  (6189,'SP','data 2023-07-10 prod 0300007 cli 003697'),
  (6190,'SP','data 2023-07-10 prod 0820000 cli 003697'),
  (8803,'MS','data 2025-03-20 prod 0820000 cli 005831'),
  (8914,'RS SUL','data 2025-03-31 prod 0300007 cli 005926'),
  (9149,'RS SUL','data 2025-04-17 prod 0830000 cli 005973'),
  (9329,'RS SUL','data 2025-04-30 prod 0830000 cli 005926'),
  (9701,'PA','data 2025-05-30 prod 0900001 cli 006149'),
  (9702,'PA','data 2025-05-30 prod 101470 cli 006149'),
  (9926,'MT OESTE','data 2025-06-18 prod 0100022 cli 006406'),
  (9927,'MT OESTE','data 2025-06-18 prod 0900000 cli 006406'),
  (9928,'MT OESTE','data 2025-06-18 prod 101470 cli 006406'),
  (10218,'MT OESTE','data 2025-07-10 prod 101470 cli 006406'),
  (10240,'PA','data 2025-07-11 prod 101470 cli 006149'),
  (10284,'MT OESTE','data 2025-07-16 prod 09003310 cli 006406'),
  (11300,'TO','data 2025-11-19 prod 0910000 cli 006820'),
  (14074,'RS NORTE','data 2024-09-03 prod 04001163 cli 004358'),
  (14075,'RS NORTE','data 2024-09-03 prod 04001790 cli 004358'),
  (14076,'RS NORTE','data 2024-09-03 prod 08101040 cli 004358')
  ) as c(n, t, ref)
  where s.n = c.n and s.territorio = 'NAO ENCONTRADO';
  get diagnostics k = row_count;
  if k <> 19 then raise exception 'Correcao de territorio: esperado 19 linhas, atualizou %', k; end if;

  update public.stg_carga_vendas_2023_2026 s
     set fat = c.f,
         obs = coalesce(s.obs || ' | ', '') || 'FAT vazio no Excel; usado FAT do ledger atual (' || c.ref || ')'
  from (values
  (407,-89132.28,'2026-02-20 prod 0820000 cli 004789'),
  (515,-44232.00,'2026-02-27 prod 09103100 cli 006214'),
  (2214,167042.15,'2026-07-02 prod 0410000 cli 002661'),
  (2652,-172317.17,'2026-07-29 prod 0410000 cli 000577')
  ) as c(n, f, ref)
  where s.n = c.n and s.fat is null;
  get diagnostics k = row_count;
  if k <> 4 then raise exception 'Correcao de FAT: esperado 4 linhas, atualizou %', k; end if;

  -- Tipo divergente do cadastro: produto 03003215 e "Pecas" no cadastro e no ledger atual (linha de 30/06/2026, cliente 005887),
  -- mas o Excel traz "Acessorios" (a carga rejeitaria a linha).
  update public.stg_carga_vendas_2023_2026
     set tipo = 'Peças',
         obs = coalesce(obs || ' | ', '') || 'tipo corrigido de Acessorios para Pecas (cadastro do produto 03003215)'
   where n = 2177 and cod_produto = '03003215' and tipo = 'Acessórios';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'Correcao de tipo (produto 03003215): esperado 1 linha, atualizou %', k; end if;

  -- Regra de negocio (decisao do usuario): Pecas e nacional, 100% do vendedor 000633 (Jenifer).
  -- 4.581 linhas de Pecas vinham com outros vendedores (principalmente 000546/000547 em 2023-2024).
  update public.stg_carga_vendas_2023_2026
     set cod_vendedor = '000633',
         obs = coalesce(obs || ' | ', '') || 'vendedor ' || cod_vendedor || ' -> 000633 (Pecas 100% Jenifer)'
   where tipo = 'Peças' and cod_vendedor <> '000633';
  get diagnostics k = row_count;
  if k <> 4581 then raise exception 'Correcao de vendedor das Pecas: esperado 4581 linhas, atualizou %', k; end if;

  -- Codigo de vendedor com 5 digitos no Excel (linha de 10/07/2023): o correto e 000599.
  update public.stg_carga_vendas_2023_2026
     set cod_vendedor = '000599',
         obs = coalesce(obs || ' | ', '') || 'vendedor 00597 -> 000599'
   where cod_vendedor = '00597';
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'Correcao do vendedor 00597: esperado 1 linha, atualizou %', k; end if;
end $$;

-- Checagens: a coluna "problemas" deve ser 0 em todas (a 1a linha deve mostrar 14758).
select 'linhas no staging (esperado 14758)' as checagem, count(*) as problemas from public.stg_carga_vendas_2023_2026
union all select 'FAT nulo', count(*) from public.stg_carga_vendas_2023_2026 where fat is null
union all select 'territorio fora do cadastro', count(*) from public.stg_carga_vendas_2023_2026 s
  where nullif(btrim(territorio), '') is not null and not exists (select 1 from public.comercial_territorios t where t.nome = s.territorio)
union all select 'origem diferente de FAT/CART', count(*) from public.stg_carga_vendas_2023_2026 where origem not in ('FAT', 'CART')
union all select 'tipo invalido', count(*) from public.stg_carga_vendas_2023_2026 where tipo not in ('Máquinas', 'Peças', 'Acessórios', 'Transgrain')
union all select 'cod_vendedor vazio', count(*) from public.stg_carga_vendas_2023_2026 where nullif(btrim(cod_vendedor), '') is null
union all select 'colunas rl/mp ausentes (migration 253; esperado 4 encontradas)', 4 - count(*) from information_schema.columns
  where table_schema = 'public' and table_name in ('comercial_realizado_ledger_entries', 'comercial_realizado_import_rows') and column_name in ('rl', 'mp');

commit;
