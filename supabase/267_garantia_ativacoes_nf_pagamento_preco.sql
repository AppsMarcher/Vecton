begin;

-- Ativacoes de Garantia: dados da NF que o painel "Marcher no Campo" usa e que a
-- carga ainda nao gravava.
--   * AltForce: CFOP, natureza da operacao, CPF/CNPJ do destinatario (agrupa o
--     cliente final), forma de pagamento e informacoes adicionais (de onde se
--     identifica o financiamento).
--   * Aba "Detalhes - Nota fiscal - Itens": preco da maquina = valor unitario do item
--     cujo numero de serie/modelo bate com a ativacao (NF com varios itens).
--   * Aba "Detalhes - Nota fiscal - Parcelas": parcelas da NF (jsonb) e quantidade.
-- Linhas ja carregadas recebem o que o raw_payload permite; preco/parcelas das abas
-- extras so aparecem ao recarregar a planilha completa.

alter table public.garantia_ativacoes
  add column if not exists nf_cfop                text,
  add column if not exists nf_natureza_operacao   text,
  add column if not exists nf_destinatario_doc    text,
  add column if not exists nf_forma_pagamento     text,
  add column if not exists nf_info_adicionais     text,
  add column if not exists financiamento          text,
  add column if not exists preco_maquina          numeric(18, 2),
  add column if not exists preco_origem           text,
  add column if not exists parcelas               jsonb,
  add column if not exists parcelas_qtd           integer;

alter table public.garantia_ativacoes
  drop constraint if exists garantia_ativacoes_preco_origem_check;
alter table public.garantia_ativacoes
  add constraint garantia_ativacoes_preco_origem_check
  check (preco_origem is null or preco_origem in ('item', 'linha'));

-- Classificacao do financiamento por palavra-chave (mesma ordem de prioridade da carga).
create or replace function public.garantia_classificar_financiamento(p_texto text)
returns text
language sql
immutable
as $$
  with t as (
    select lower(translate(coalesce(p_texto, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) as x
  )
  select case
    when x = '' then 'Não identificado'
    when x ~ '\ybnb\y' then 'BNB'
    when x ~ '(finame|bndes)' then 'Finame/BNDES'
    when x ~ 'consorcio' then 'Consórcio'
    when x ~ 'aliena[a-z]* fiduciaria' then 'Alienação fiduciária'
    when x ~ 'reserva de dominio' then 'Reserva de domínio'
    when x ~ 'financ' then 'Financiamento (outro)'
    when x ~ '(\ypix\y|a vista)' then 'À vista/PIX'
    else 'Não identificado'
  end
  from t;
$$;

-- Backfill a partir do raw_payload (colunas do AltForce).
update public.garantia_ativacoes
set nf_cfop              = coalesce(nf_cfop, nullif(trim(raw_payload ->> 'Detalhes - Nota fiscal - CFOP'), '')),
    nf_natureza_operacao = coalesce(nf_natureza_operacao, nullif(trim(raw_payload ->> 'Detalhes - Nota fiscal - Natureza da operação'), '')),
    nf_destinatario_doc  = coalesce(nf_destinatario_doc, nullif(trim(raw_payload ->> 'Detalhes - Nota fiscal - CPF/CNPJ do destinatário'), '')),
    nf_forma_pagamento   = coalesce(nf_forma_pagamento, nullif(trim(raw_payload ->> 'Detalhes - Nota fiscal - Formas de pagamento'), '')),
    nf_info_adicionais   = coalesce(nf_info_adicionais, nullif(trim(raw_payload ->> 'Detalhes - Nota fiscal - Informações adicionais'), ''))
where raw_payload ? 'Detalhes - Nota fiscal - CFOP';

update public.garantia_ativacoes
set financiamento = public.garantia_classificar_financiamento(nf_info_adicionais)
where financiamento is null;

-- Sem a aba de itens, o preco da maquina e o valor unitario da linha do AltForce.
update public.garantia_ativacoes
set preco_maquina = nf_valor_unitario,
    preco_origem  = 'linha'
where preco_maquina is null and nf_valor_unitario is not null;

create index if not exists idx_garantia_ativacoes_destinatario_doc
  on public.garantia_ativacoes (organization_id, nf_destinatario_doc);

commit;
