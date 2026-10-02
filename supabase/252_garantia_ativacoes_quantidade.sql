begin;

-- Quantidade de ativacoes = coluna "Detalhes - Nota fiscal - Quantidade" do AltForce
-- (e nao a contagem de linhas). Preenche as linhas ja carregadas a partir do
-- raw_payload, sem precisar reimportar a planilha.
alter table public.garantia_ativacoes
  add column if not exists nf_quantidade numeric(18, 3);

update public.garantia_ativacoes
set nf_quantidade = nullif(trim(raw_payload ->> 'Detalhes - Nota fiscal - Quantidade'), '')::numeric
where nf_quantidade is null
  and raw_payload ? 'Detalhes - Nota fiscal - Quantidade';

commit;
