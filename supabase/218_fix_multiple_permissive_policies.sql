begin;

-- Corrige o aviso "multiple_permissive_policies" do performance advisor do
-- Supabase: 21 tabelas tem duas politicas RLS permissivas cobrindo SELECT
-- ao mesmo tempo ("editors can manage X", FOR ALL, e "members can read X",
-- FOR SELECT). O Postgres avalia as DUAS em toda linha de toda consulta e
-- faz OR entre elas -- dobra o custo de RLS em toda leitura.
--
-- Como todo editor ja e membro (is_org_editor exige a mesma checagem de
-- vinculo em organization_users + perfil ativo que is_org_member usa),
-- trocar a politica de FOR ALL para FOR INSERT/UPDATE/DELETE nao tira
-- acesso de leitura de ninguem -- so elimina a politica duplicada pro
-- SELECT, que passa a depender so de "members can read X".
--
-- Postgres nao aceita uma unica policy com "FOR INSERT, UPDATE, DELETE"
-- (so aceita UM comando, ou ALL) -- por isso cada tabela vira 3 policies
-- novas no lugar da 1 antiga de FOR ALL.
--
-- Fora dessa lista: forecast_ledger_entries, que usa um esquema de
-- permissao diferente (get_my_access_role em vez de is_org_editor) e nao
-- da pra garantir a mesma equivalencia com seguranca.

-- accounts
drop policy if exists "editors can manage accounts" on public.accounts;
create policy "editors can insert accounts" on public.accounts for insert with check (is_org_editor(organization_id));
create policy "editors can update accounts" on public.accounts for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete accounts" on public.accounts for delete using (is_org_editor(organization_id));

-- actuals_import_batches
drop policy if exists "editors can manage actuals import batches" on public.actuals_import_batches;
create policy "editors can insert actuals import batches" on public.actuals_import_batches for insert with check (is_org_editor(organization_id));
create policy "editors can update actuals import batches" on public.actuals_import_batches for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete actuals import batches" on public.actuals_import_batches for delete using (is_org_editor(organization_id));

-- actuals_import_rows
drop policy if exists "editors can manage actuals import rows" on public.actuals_import_rows;
create policy "editors can insert actuals import rows" on public.actuals_import_rows for insert with check (is_org_editor(get_actuals_batch_organization_id(batch_id)));
create policy "editors can update actuals import rows" on public.actuals_import_rows for update using (is_org_editor(get_actuals_batch_organization_id(batch_id))) with check (is_org_editor(get_actuals_batch_organization_id(batch_id)));
create policy "editors can delete actuals import rows" on public.actuals_import_rows for delete using (is_org_editor(get_actuals_batch_organization_id(batch_id)));

-- actuals_ledger_entries
drop policy if exists "editors can manage actuals ledger" on public.actuals_ledger_entries;
create policy "editors can insert actuals ledger" on public.actuals_ledger_entries for insert with check (is_org_editor(organization_id));
create policy "editors can update actuals ledger" on public.actuals_ledger_entries for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete actuals ledger" on public.actuals_ledger_entries for delete using (is_org_editor(organization_id));

-- actuals_monthly_account_totals
drop policy if exists "editors can manage actuals monthly account totals" on public.actuals_monthly_account_totals;
create policy "editors can insert actuals monthly account totals" on public.actuals_monthly_account_totals for insert with check (is_org_editor(organization_id));
create policy "editors can update actuals monthly account totals" on public.actuals_monthly_account_totals for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete actuals monthly account totals" on public.actuals_monthly_account_totals for delete using (is_org_editor(organization_id));

-- branches
drop policy if exists "editors can manage branches" on public.branches;
create policy "editors can insert branches" on public.branches for insert with check (is_org_editor(organization_id));
create policy "editors can update branches" on public.branches for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete branches" on public.branches for delete using (is_org_editor(organization_id));

-- budget_import_batches
drop policy if exists "editors can manage budget import batches" on public.budget_import_batches;
create policy "editors can insert budget import batches" on public.budget_import_batches for insert with check (is_org_editor(organization_id));
create policy "editors can update budget import batches" on public.budget_import_batches for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete budget import batches" on public.budget_import_batches for delete using (is_org_editor(organization_id));

-- budget_import_rows
drop policy if exists "editors can manage budget import rows" on public.budget_import_rows;
create policy "editors can insert budget import rows" on public.budget_import_rows for insert with check (is_org_editor(get_budget_batch_organization_id(batch_id)));
create policy "editors can update budget import rows" on public.budget_import_rows for update using (is_org_editor(get_budget_batch_organization_id(batch_id))) with check (is_org_editor(get_budget_batch_organization_id(batch_id)));
create policy "editors can delete budget import rows" on public.budget_import_rows for delete using (is_org_editor(get_budget_batch_organization_id(batch_id)));

-- budget_ledger_entries
drop policy if exists "editors can manage budget ledger" on public.budget_ledger_entries;
create policy "editors can insert budget ledger" on public.budget_ledger_entries for insert with check (is_org_editor(organization_id));
create policy "editors can update budget ledger" on public.budget_ledger_entries for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete budget ledger" on public.budget_ledger_entries for delete using (is_org_editor(organization_id));

-- budget_monthly_account_totals
drop policy if exists "editors can manage budget monthly account totals" on public.budget_monthly_account_totals;
create policy "editors can insert budget monthly account totals" on public.budget_monthly_account_totals for insert with check (is_org_editor(organization_id));
create policy "editors can update budget monthly account totals" on public.budget_monthly_account_totals for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete budget monthly account totals" on public.budget_monthly_account_totals for delete using (is_org_editor(organization_id));

-- comercial_clientes
drop policy if exists "editors can manage comercial clientes" on public.comercial_clientes;
create policy "editors can insert comercial clientes" on public.comercial_clientes for insert with check (is_org_editor(organization_id));
create policy "editors can update comercial clientes" on public.comercial_clientes for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete comercial clientes" on public.comercial_clientes for delete using (is_org_editor(organization_id));

-- comercial_planejado_import_batches
drop policy if exists "editors manage comercial planejado batches" on public.comercial_planejado_import_batches;
create policy "editors insert comercial planejado batches" on public.comercial_planejado_import_batches for insert with check (is_org_editor(organization_id));
create policy "editors update comercial planejado batches" on public.comercial_planejado_import_batches for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors delete comercial planejado batches" on public.comercial_planejado_import_batches for delete using (is_org_editor(organization_id));

-- comercial_planejado_import_rows
drop policy if exists "editors manage comercial planejado rows" on public.comercial_planejado_import_rows;
create policy "editors insert comercial planejado rows" on public.comercial_planejado_import_rows for insert with check (is_org_editor(get_comercial_planejado_batch_organization_id(batch_id)));
create policy "editors update comercial planejado rows" on public.comercial_planejado_import_rows for update using (is_org_editor(get_comercial_planejado_batch_organization_id(batch_id))) with check (is_org_editor(get_comercial_planejado_batch_organization_id(batch_id)));
create policy "editors delete comercial planejado rows" on public.comercial_planejado_import_rows for delete using (is_org_editor(get_comercial_planejado_batch_organization_id(batch_id)));

-- comercial_planejado_ledger_entries
drop policy if exists "editors manage comercial planejado ledger" on public.comercial_planejado_ledger_entries;
create policy "editors insert comercial planejado ledger" on public.comercial_planejado_ledger_entries for insert with check (is_org_editor(organization_id));
create policy "editors update comercial planejado ledger" on public.comercial_planejado_ledger_entries for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors delete comercial planejado ledger" on public.comercial_planejado_ledger_entries for delete using (is_org_editor(organization_id));

-- comercial_produtos
drop policy if exists "editors can manage comercial produtos" on public.comercial_produtos;
create policy "editors can insert comercial produtos" on public.comercial_produtos for insert with check (is_org_editor(organization_id));
create policy "editors can update comercial produtos" on public.comercial_produtos for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete comercial produtos" on public.comercial_produtos for delete using (is_org_editor(organization_id));

-- comercial_realizado_import_batches
drop policy if exists "editors manage comercial realizado batches" on public.comercial_realizado_import_batches;
create policy "editors insert comercial realizado batches" on public.comercial_realizado_import_batches for insert with check (is_org_editor(organization_id));
create policy "editors update comercial realizado batches" on public.comercial_realizado_import_batches for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors delete comercial realizado batches" on public.comercial_realizado_import_batches for delete using (is_org_editor(organization_id));

-- comercial_realizado_import_rows
drop policy if exists "editors manage comercial realizado rows" on public.comercial_realizado_import_rows;
create policy "editors insert comercial realizado rows" on public.comercial_realizado_import_rows for insert with check (is_org_editor(get_comercial_realizado_batch_organization_id(batch_id)));
create policy "editors update comercial realizado rows" on public.comercial_realizado_import_rows for update using (is_org_editor(get_comercial_realizado_batch_organization_id(batch_id))) with check (is_org_editor(get_comercial_realizado_batch_organization_id(batch_id)));
create policy "editors delete comercial realizado rows" on public.comercial_realizado_import_rows for delete using (is_org_editor(get_comercial_realizado_batch_organization_id(batch_id)));

-- comercial_realizado_ledger_entries
drop policy if exists "editors manage comercial realizado ledger" on public.comercial_realizado_ledger_entries;
create policy "editors insert comercial realizado ledger" on public.comercial_realizado_ledger_entries for insert with check (is_org_editor(organization_id));
create policy "editors update comercial realizado ledger" on public.comercial_realizado_ledger_entries for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors delete comercial realizado ledger" on public.comercial_realizado_ledger_entries for delete using (is_org_editor(organization_id));

-- comercial_territorios
drop policy if exists "editors can manage comercial territorios" on public.comercial_territorios;
create policy "editors can insert comercial territorios" on public.comercial_territorios for insert with check (is_org_editor(organization_id));
create policy "editors can update comercial territorios" on public.comercial_territorios for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete comercial territorios" on public.comercial_territorios for delete using (is_org_editor(organization_id));

-- cost_centers
drop policy if exists "editors can manage cost centers" on public.cost_centers;
create policy "editors can insert cost centers" on public.cost_centers for insert with check (is_org_editor(organization_id));
create policy "editors can update cost centers" on public.cost_centers for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete cost centers" on public.cost_centers for delete using (is_org_editor(organization_id));

-- forecast_monthly_account_totals
drop policy if exists "editors can manage forecast monthly account totals" on public.forecast_monthly_account_totals;
create policy "editors can insert forecast monthly account totals" on public.forecast_monthly_account_totals for insert with check (is_org_editor(organization_id));
create policy "editors can update forecast monthly account totals" on public.forecast_monthly_account_totals for update using (is_org_editor(organization_id)) with check (is_org_editor(organization_id));
create policy "editors can delete forecast monthly account totals" on public.forecast_monthly_account_totals for delete using (is_org_editor(organization_id));

commit;
