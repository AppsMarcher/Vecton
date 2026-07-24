-- Clientes de exportação vêm com UF='EX' na origem (não é estado brasileiro,
-- é o mesmo código de território usado pra Exportação) -- 16 clientes reais,
-- não é ruído. Relaxa o CHECK de comercial_clientes.uf pra aceitar 'EX'.
begin;

alter table public.comercial_clientes drop constraint if exists comercial_clientes_uf_check;

alter table public.comercial_clientes
  add constraint comercial_clientes_uf_check
  check (uf is null or uf in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO','EX'
  ));

commit;
