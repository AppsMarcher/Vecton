-- 273: Anos com dados de Real carregados (alimenta as opções "Real {ano}" do
-- "Comparar com"). PostgREST não tem SELECT DISTINCT, então vai por RPC.

begin;

create or replace function public.list_actuals_reference_years(target_organization_id uuid)
returns setof integer
language sql
stable
security definer
set search_path = public
as $$
  select distinct t.reference_year
    from public.actuals_monthly_account_totals t
   where t.organization_id = target_organization_id
     and public.is_org_member(target_organization_id)
   order by t.reference_year desc;
$$;

grant execute on function public.list_actuals_reference_years(uuid) to authenticated;

commit;
