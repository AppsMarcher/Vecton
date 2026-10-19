-- 276: Trava a escrita no Budget antigo (budget_ledger_entries e
-- budget_monthly_account_totals). O Budget passou a viver nos cenários
-- (forecast_scenarios + forecast_ledger_entries; "Budget {ano}"), copiado pela 272.
--
-- NÃO apaga nada: os dados antigos ficam só para consulta. A trava impede que um
-- navegador com versão antiga do app (cache) grave Budget no lugar errado.
-- Para reverter: drop trigger trg_budget_ledger_somente_leitura on public.budget_ledger_entries;
--
-- ORDEM: aplicar DEPOIS de publicar a versão nova do app (a versão antiga do app
-- ainda grava Budget nessas tabelas e passaria a receber o erro abaixo).
-- Exclusões continuam permitidas (delete_budget_import_batch limpa o que sobrou).

begin;

create or replace function public.bloqueia_escrita_budget_antigo()
returns trigger
language plpgsql
as $$
begin
  raise exception 'O Budget agora é carregado em um cenário (Repositório de Cenários, "Budget {ano}"). Esta tabela é somente leitura.';
end;
$$;

drop trigger if exists trg_budget_ledger_somente_leitura on public.budget_ledger_entries;
create trigger trg_budget_ledger_somente_leitura
before insert or update on public.budget_ledger_entries
for each statement
execute function public.bloqueia_escrita_budget_antigo();

drop trigger if exists trg_budget_totais_somente_leitura on public.budget_monthly_account_totals;
create trigger trg_budget_totais_somente_leitura
before insert or update on public.budget_monthly_account_totals
for each statement
execute function public.bloqueia_escrita_budget_antigo();

commit;
