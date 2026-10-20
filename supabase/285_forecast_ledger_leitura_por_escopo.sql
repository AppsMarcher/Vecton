begin;

-- Fecha o vazamento do DRE consolidado dos cenários: forecast_ledger_entries era legível por QUALQUER membro
-- da organização (policy "members read forecast ledger"), então um Analista lia o consolidado direto pela API,
-- mesmo sem a permissão do relatório na tela.
--
-- Nova regra de leitura (mesma lógica de escopo da tela, getAllowedCcNumbers):
--   * Admin / Super Admin (principal ou adicional): leem tudo — já cobertos pela policy
--     "admins manage forecast ledger" (ALL), que continua valendo.
--   * Demais perfis ativos: só as linhas dos centros de custo do próprio escopo = gestão principal
--     + gestões extras + centros extras (user_profiles.management / extra_managements / extra_cc_ids).
--   * Linhas sem centro de custo (receitas e demais linhas consolidadas) ficam só para admin.
-- O casamento é por id do centro OU pelo número (há linhas só com o número).
-- As funções do módulo de planejamento são security definer e não são afetadas.
-- Idempotente.

create or replace function public.forecast_read_scope()
returns table (organization_id uuid, cost_center_id uuid, cost_center_number text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.organization_id, c.id, c.cost_center_number
  from public.user_profiles u
  join public.cost_centers c on c.organization_id = u.organization_id
  where u.user_id = auth.uid()
    and u.is_active
    and public.is_org_member(u.organization_id)
    and (
      (nullif(trim(u.management), '') is not null and trim(c.cost_center_management) = trim(u.management))
      or trim(c.cost_center_management) = any (coalesce(u.extra_managements, '{}'))
      or c.id::text = any (coalesce(u.extra_cc_ids::text[], '{}'))
    );
$$;

revoke all on function public.forecast_read_scope() from public, anon;
grant execute on function public.forecast_read_scope() to authenticated;

drop policy if exists "members read forecast ledger" on public.forecast_ledger_entries;
drop policy if exists "scoped read forecast ledger" on public.forecast_ledger_entries;

create policy "scoped read forecast ledger"
  on public.forecast_ledger_entries for select
  using (
    cost_center_id in (select s.cost_center_id from public.forecast_read_scope() s)
    or (organization_id, cost_center_number) in (
      select s.organization_id, s.cost_center_number from public.forecast_read_scope() s
      where nullif(s.cost_center_number, '') is not null
    )
  );

commit;
