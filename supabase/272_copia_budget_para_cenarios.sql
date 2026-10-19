-- 272: Copia o Budget (budget_ledger_entries) para cenários "Budget {ano}".
-- O Budget passa a viver no repositório único de cenários (forecast_scenarios +
-- forecast_ledger_entries). As tabelas budget_* permanecem intactas, somente
-- leitura, como fallback até a validação do usuário.
-- Idempotente: se o cenário "Budget {ano}" já tem lançamentos, o ano é pulado.
-- Os totais conta × mês (forecast_monthly_account_totals) são preenchidos pelo
-- trigger de statement da 056.
-- Requer a 271 (nome com ano / nome único).

begin;

set local statement_timeout = 0;

do $$
declare
  rec record;
  mes integer;
  v_scenario_id uuid;
  v_nome text;
begin
  for rec in
    select distinct organization_id, reference_year
      from public.budget_ledger_entries
     order by organization_id, reference_year
  loop
    v_nome := 'Budget ' || rec.reference_year;

    select id into v_scenario_id
      from public.forecast_scenarios
     where organization_id = rec.organization_id
       and name = v_nome;

    if v_scenario_id is null then
      insert into public.forecast_scenarios
        (organization_id, name, color, icon, reference_year, cutoff_month, sort_order)
      values
        (rec.organization_id, v_nome, '#0ea5e9', '🎯', rec.reference_year, 0, 0)
      returning id into v_scenario_id;
    end if;

    if exists (
      select 1 from public.forecast_ledger_entries
       where scenario_id = v_scenario_id
         and reference_year = rec.reference_year
    ) then
      raise notice 'Cenário % já possui lançamentos; ano pulado.', v_nome;
      continue;
    end if;

    -- Um statement por mês: o trigger recalcula os totais 1 vez por mês.
    for mes in 1..12 loop
      insert into public.forecast_ledger_entries
        (organization_id, scenario_id, reference_year, reference_month,
         account_number, cost_center_id, cost_center_number, amount, entry_date, history)
      select b.organization_id, v_scenario_id, b.reference_year, b.reference_month,
             b.account_number, b.cost_center_id, b.cost_center_number, b.amount, null, b.history
        from public.budget_ledger_entries b
       where b.organization_id = rec.organization_id
         and b.reference_year = rec.reference_year
         and b.reference_month = mes;
    end loop;

    raise notice 'Cenário % criado/preenchido.', v_nome;
  end loop;
end;
$$;

commit;
