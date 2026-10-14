begin;

-- Codigo e nome do cliente (destinatario da NF Marcher -> revenda) vindos das colunas
-- "Cod_Cliente" / "Nome_Cliente" da planilha de Ativacoes de Garantia. O codigo e a chave
-- do cruzamento com comercial_clientes.codigo (e portanto com as vendas faturadas).
alter table public.garantia_ativacoes
  add column if not exists cod_cliente  text,
  add column if not exists nome_cliente text;

-- Linhas ja carregadas: recupera do raw_payload quando a planilha antiga ja tinha as colunas.
update public.garantia_ativacoes
set cod_cliente  = nullif(nullif(trim(raw_payload ->> 'Cod_Cliente'), ''), '#N/A'),
    nome_cliente = nullif(nullif(trim(raw_payload ->> 'Nome_Cliente'), ''), '#N/A')
where cod_cliente is null
  and raw_payload ? 'Cod_Cliente';

create index if not exists idx_garantia_ativacoes_cod_cliente
  on public.garantia_ativacoes (organization_id, cod_cliente);

commit;
