begin;

-- Maquinas destinadas a exportacao (AltForce traz UF "Outro") passam a ser
-- gravadas com UF 'EX', mesmo codigo usado em comercial_clientes.uf.
alter table public.garantia_ativacoes
  drop constraint if exists garantia_ativacoes_uf_check;

alter table public.garantia_ativacoes
  add constraint garantia_ativacoes_uf_check check (uf is null or uf in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO','EX'
  ));

commit;
