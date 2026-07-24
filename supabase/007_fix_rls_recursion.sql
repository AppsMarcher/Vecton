begin;

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = target_organization_id
      and ou.user_id = auth.uid()
  )
$$;

create or replace function public.is_org_owner(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = target_organization_id
      and ou.user_id = auth.uid()
      and ou.role = 'owner'
  )
$$;

create or replace function public.is_org_editor(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = target_organization_id
      and ou.user_id = auth.uid()
      and ou.role in ('owner', 'editor')
  )
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_owner(uuid) to authenticated;
grant execute on function public.is_org_editor(uuid) to authenticated;

drop policy if exists "org users can read organizations" on public.organizations;
create policy "org users can read organizations"
on public.organizations
for select
using (public.is_org_member(id));

drop policy if exists "owners can manage organizations" on public.organizations;
create policy "owners can manage organizations"
on public.organizations
for all
using (public.is_org_owner(id))
with check (public.is_org_owner(id));

drop policy if exists "members can read org memberships" on public.organization_users;
create policy "members can read org memberships"
on public.organization_users
for select
using (
  user_id = auth.uid()
  or public.is_org_owner(organization_id)
);

drop policy if exists "owners can manage org memberships" on public.organization_users;
create policy "owners can manage org memberships"
on public.organization_users
for all
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists "members can read accounts" on public.accounts;
create policy "members can read accounts"
on public.accounts
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage accounts" on public.accounts;
create policy "editors can manage accounts"
on public.accounts
for all
using (public.is_org_editor(organization_id))
with check (public.is_org_editor(organization_id));

drop policy if exists "members can read cost centers" on public.cost_centers;
create policy "members can read cost centers"
on public.cost_centers
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage cost centers" on public.cost_centers;
create policy "editors can manage cost centers"
on public.cost_centers
for all
using (public.is_org_editor(organization_id))
with check (public.is_org_editor(organization_id));

drop policy if exists "members can read branches" on public.branches;
create policy "members can read branches"
on public.branches
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage branches" on public.branches;
create policy "editors can manage branches"
on public.branches
for all
using (public.is_org_editor(organization_id))
with check (public.is_org_editor(organization_id));

drop policy if exists "members can read reporting periods" on public.reporting_periods;
create policy "members can read reporting periods"
on public.reporting_periods
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage reporting periods" on public.reporting_periods;
create policy "editors can manage reporting periods"
on public.reporting_periods
for all
using (public.is_org_editor(organization_id))
with check (public.is_org_editor(organization_id));

drop policy if exists "members can read dre plan nodes" on public.dre_plan_nodes;
create policy "members can read dre plan nodes"
on public.dre_plan_nodes
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage dre plan nodes" on public.dre_plan_nodes;
create policy "editors can manage dre plan nodes"
on public.dre_plan_nodes
for all
using (public.is_org_editor(organization_id))
with check (public.is_org_editor(organization_id));

drop policy if exists "members can read cc plan nodes" on public.cc_plan_nodes;
create policy "members can read cc plan nodes"
on public.cc_plan_nodes
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage cc plan nodes" on public.cc_plan_nodes;
create policy "editors can manage cc plan nodes"
on public.cc_plan_nodes
for all
using (public.is_org_editor(organization_id))
with check (public.is_org_editor(organization_id));

commit;
