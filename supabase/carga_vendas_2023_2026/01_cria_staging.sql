-- 01: tabela de staging (dados brutos do Excel). RLS ligado sem policies = inacessivel pela API.
begin;
drop table if exists public.stg_carga_vendas_2023_2026;
create table public.stg_carga_vendas_2023_2026 (
  n            integer primary key,   -- linha no Excel
  origem       text not null,
  tipo         text not null,
  data         date not null,
  documento    text,
  cod_produto  text,
  cod_cliente  text,
  cod_vendedor text,
  territorio   text,
  qtd          numeric(18,4),
  fat          numeric(18,2),
  rl           numeric(18,2),
  mp           numeric(18,2),
  obs          text
);
alter table public.stg_carga_vendas_2023_2026 enable row level security;
commit;
