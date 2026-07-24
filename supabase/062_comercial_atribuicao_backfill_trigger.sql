begin;

-- Ate aqui, corrigir responsavel/coordenacao numa Atribuicao (ex: renomear pra
-- "A definir") so afetava a propria tabela de Atribuicao -- as vendas/metas JA
-- carregadas ficam com o responsavel/coordenacao "carimbado" no momento do
-- import (trigger de validacao, ve 038/041/049), e esse carimbo nao e uma
-- referencia viva, entao nao refletia a correcao nos relatorios (Painel de
-- Vendas, Bateu Levou). Esta migration fecha esse gatilho: uma EDICAO
-- (UPDATE) de responsavel/coordenacao numa atribuicao existente re-carimba
-- automaticamente o ledger ja carregado daquele territorio+linha, na mesma
-- janela de vigencia (data_inicio/data_fim) da atribuicao editada.
--
-- So dispara em UPDATE (correcao de uma atribuicao existente), nao em INSERT
-- (uma nova vigencia/pessoa assumindo dali pra frente nao deve reescrever o
-- historico anterior -- isso e uma transicao de SCD2 normal, nao uma correcao).

create or replace function public.backfill_comercial_atribuicao_ledger(p_atrib_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ar        public.comercial_atribuicao_responsavel;
  v_linha   text;
begin
  select * into ar from public.comercial_atribuicao_responsavel where id = p_atrib_id;
  if not found then
    return;
  end if;

  select nome into v_linha from public.comercial_linhas_negocio where id = ar.linha_negocio_id;

  -- Pecas e nacional (atribuicao com territorio_id null, mas o ledger guarda o
  -- territorio real digitado no upload, so como referencia) -- por isso o
  -- match ignora territorio_id quando a linha e Pecas, igual a mesma regra
  -- usada na hora do import (049).
  update public.comercial_realizado_ledger_entries le
  set responsavel = ar.responsavel,
      coordenacao_id = ar.coordenacao_id
  where le.linha_negocio_id = ar.linha_negocio_id
    and (v_linha = 'Peças' or le.territorio_id is not distinct from ar.territorio_id)
    and le.entry_date >= ar.data_inicio
    and (ar.data_fim is null or le.entry_date <= ar.data_fim)
    and (le.responsavel is distinct from ar.responsavel or le.coordenacao_id is distinct from ar.coordenacao_id);

  update public.comercial_planejado_ledger_entries le
  set responsavel = ar.responsavel,
      coordenacao_id = ar.coordenacao_id
  where le.linha_negocio_id = ar.linha_negocio_id
    and (v_linha = 'Peças' or le.territorio_id is not distinct from ar.territorio_id)
    and make_date(le.reference_year, le.reference_month, 1) >= ar.data_inicio
    and (ar.data_fim is null or make_date(le.reference_year, le.reference_month, 1) <= ar.data_fim)
    and (le.responsavel is distinct from ar.responsavel or le.coordenacao_id is distinct from ar.coordenacao_id);
end;
$$;

create or replace function public.trg_backfill_comercial_atribuicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsavel is distinct from old.responsavel
     or new.coordenacao_id is distinct from old.coordenacao_id then
    perform public.backfill_comercial_atribuicao_ledger(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comercial_atribuicao_backfill on public.comercial_atribuicao_responsavel;
create trigger trg_comercial_atribuicao_backfill
after update on public.comercial_atribuicao_responsavel
for each row
execute function public.trg_backfill_comercial_atribuicao();

-- Reconciliacao one-time: corrige o drift que ja existe hoje (ex: a troca de
-- Rogerio -> "A definir" feita antes desta migration existir), rodando o
-- mesmo backfill pra TODAS as atribuicoes atuais. Idempotente (so faz UPDATE
-- nas linhas que realmente estao divergentes).
do $$
declare
  r record;
begin
  for r in select id from public.comercial_atribuicao_responsavel loop
    perform public.backfill_comercial_atribuicao_ledger(r.id);
  end loop;
end $$;

commit;
