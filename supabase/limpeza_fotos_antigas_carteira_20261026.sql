-- Limpeza das fotos antigas de carteira (rodar UMA vez, no SQL Editor do Supabase, projeto Vecton).
--
-- Contexto: desde 26/10/2026 a carteira vigente (migration 311) e a carga completa do mes corrente. As fotos de
-- carteira dos meses anteriores (agosto/2026: 20 linhas; setembro/2026: 9 linhas) nao sao mais lidas por nenhuma
-- tela. Este script guarda uma copia e apaga so essas linhas CART do razao (comercial_realizado_ledger_entries).
--
-- Seguranca (tudo num unico bloco, atomico: se algo falhar, nada muda):
--   * recusa rodar se o backup ja existe (nao sobrescreve nada);
--   * recusa se o numero de linhas a apagar nao for o esperado (v_esperado) - nada e criado nem apagado;
--   * nunca toca no faturamento (FAT) nem no lote de carteira vigente (o mais recente nao posterior ao mes corrente).
-- Nao mexe nas tabelas de importacao (import_rows/batches): o historico dos lotes continua la.
--
-- Para voltar atras (so se necessario), com o backup ainda existindo:
--   insert into public.comercial_realizado_ledger_entries
--   select * from public._bkp_ledger_cart_fotos_antigas_20261026;
-- O backup fica ate a Controladoria decidir apagar (drop table public._bkp_ledger_cart_fotos_antigas_20261026;).

do $do$
declare
  v_esperado constant integer := 29;   -- agosto (20) + setembro (9), conferido em 26/10/2026
  v_vigente  integer;                  -- AAAAMM da foto vigente
  v_achadas  integer;
  v_apagadas integer;
begin
  if to_regclass('public._bkp_ledger_cart_fotos_antigas_20261026') is not null then
    raise exception 'O backup _bkp_ledger_cart_fotos_antigas_20261026 ja existe (limpeza ja feita?). Nada foi alterado.';
  end if;

  select max(reference_year * 100 + reference_month) into v_vigente
  from public.comercial_realizado_ledger_entries
  where origem = 'CART' and reference_year * 100 + reference_month <= public.comercial_cart_ym_corrente();
  if v_vigente is null then
    raise exception 'Nao ha carteira vigente no razao: nada a limpar.';
  end if;

  select count(*) into v_achadas
  from public.comercial_realizado_ledger_entries
  where origem = 'CART' and reference_year * 100 + reference_month < v_vigente;
  if v_achadas <> v_esperado then
    raise exception 'Linhas de carteira antigas: esperado %, encontrado %. Nada foi alterado.', v_esperado, v_achadas;
  end if;

  execute format($f$create table public._bkp_ledger_cart_fotos_antigas_20261026 as
    select * from public.comercial_realizado_ledger_entries
    where origem = 'CART' and reference_year * 100 + reference_month < %s$f$, v_vigente);
  alter table public._bkp_ledger_cart_fotos_antigas_20261026 enable row level security;   -- fechado para a API (sem policies)

  delete from public.comercial_realizado_ledger_entries
  where id in (select id from public._bkp_ledger_cart_fotos_antigas_20261026);
  get diagnostics v_apagadas = row_count;
  if v_apagadas <> v_achadas then
    raise exception 'Apagou % linhas, esperava %. Tudo desfeito.', v_apagadas, v_achadas;
  end if;

  raise notice 'Fotos antigas de carteira apagadas: % (backup em public._bkp_ledger_cart_fotos_antigas_20261026).', v_apagadas;
end $do$;

-- Conferencia: deve restar carteira so do lote vigente (outubro/2026); o backup deve ter 29 linhas.
select 'carteira no razao' as o_que, reference_year || '-' || lpad(reference_month::text, 2, '0') as lote, count(*) as linhas
from public.comercial_realizado_ledger_entries where origem = 'CART' group by 1, 2
union all
select 'backup', 'fotos antigas', count(*) from public._bkp_ledger_cart_fotos_antigas_20261026
order by 1, 2;
