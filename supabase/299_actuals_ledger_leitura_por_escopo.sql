begin;

-- Padroniza o escopo de leitura do ledger do REALIZADO com o do ledger dos cenários (285):
-- antes, actuals_ledger_entries era legível por QUALQUER membro da organização e o filtro por gestão
-- existia só na tela. Regra única, valendo no banco para Real e Meta:
--   * Admin / Super Admin (principal ou adicional): leem tudo.
--   * Demais perfis: só as linhas dos centros de custo do próprio escopo (gestão principal + gestões
--     extras + centros extras), via forecast_read_scope(). Sem nenhum escopo = nenhuma linha.
--   * Linhas sem centro de custo ficam só para admin.
-- Os totais por conta e mês (actuals_monthly_account_totals) NÃO mudam: continuam alimentando os DREs
-- consolidados e a receita do cockpit.
-- Idempotente.

drop policy if exists "members can read actuals ledger" on public.actuals_ledger_entries;
drop policy if exists "admins read actuals ledger" on public.actuals_ledger_entries;
drop policy if exists "scoped read actuals ledger" on public.actuals_ledger_entries;

-- Sub-selects sem correlação: o Postgres avalia uma vez e não por linha (o ledger do Real é grande).
create policy "admins read actuals ledger"
  on public.actuals_ledger_entries for select
  using (
    organization_id in (
      select u.organization_id from public.user_profiles u
      where u.user_id = auth.uid() and u.is_active
        and (u.access_role::text in ('admin', 'super_admin')
             or coalesce(u.additional_access_roles::text[], '{}') && array['admin', 'super_admin'])
    )
  );

create policy "scoped read actuals ledger"
  on public.actuals_ledger_entries for select
  using (
    cost_center_id in (select s.cost_center_id from public.forecast_read_scope() s)
    or (organization_id, cost_center_number) in (
      select s.organization_id, s.cost_center_number from public.forecast_read_scope() s
      where nullif(s.cost_center_number, '') is not null
    )
  );

commit;
