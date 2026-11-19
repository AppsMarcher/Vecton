begin;

-- Performance: nas tabelas de totais mensais a política de leitura chamava is_org_member(organization_id)
-- UMA VEZ POR LINHA lida (2 consultas ao banco cada vez). Com ~2.700 linhas por leitura isso dava ~400 ms
-- numa tabela de 6 mil linhas. Aqui a lista de organizações do usuário é calculada UMA VEZ por consulta.
--
-- Mesma regra de is_org_member: membro da organização (organization_users) e perfil ativo; quem ainda não
-- tem perfil na organização continua valendo como ativo.
create or replace function public.my_member_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select ou.organization_id
  from public.organization_users ou
  left join public.user_profiles up
    on up.organization_id = ou.organization_id
   and up.user_id = (select auth.uid())
  where ou.user_id = (select auth.uid())
    and coalesce(up.is_active, true)
$$;

-- Sem acesso anônimo (devolveria vazio, mas não há motivo para expor); só quem está logado e o service_role.
revoke execute on function public.my_member_org_ids() from public, anon;
grant execute on function public.my_member_org_ids() to authenticated, service_role;

alter policy "members can read forecast monthly account totals" on public.forecast_monthly_account_totals
  using (organization_id in (select * from public.my_member_org_ids()));

alter policy "members can read actuals monthly account totals" on public.actuals_monthly_account_totals
  using (organization_id in (select * from public.my_member_org_ids()));

alter policy "members can read budget monthly account totals" on public.budget_monthly_account_totals
  using (organization_id in (select * from public.my_member_org_ids()));

-- Para voltar ao comportamento anterior:
--   alter policy "members can read forecast monthly account totals" on public.forecast_monthly_account_totals using (is_org_member(organization_id));
--   alter policy "members can read actuals monthly account totals"  on public.actuals_monthly_account_totals  using (is_org_member(organization_id));
--   alter policy "members can read budget monthly account totals"   on public.budget_monthly_account_totals   using (is_org_member(organization_id));
--   drop function public.my_member_org_ids();

commit;
