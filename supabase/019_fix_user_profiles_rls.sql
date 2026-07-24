begin;

-- Function SECURITY DEFINER: lê access_role sem passar pelo RLS de user_profiles
-- Evita recursão infinita nas policies que precisam checar se o usuário é admin
create or replace function public.get_my_access_role(target_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select access_role::text
  from public.user_profiles
  where organization_id = target_organization_id
    and user_id = auth.uid()
  limit 1
$$;

grant execute on function public.get_my_access_role(uuid) to authenticated;

-- Remove policies antigas que causavam recursão
drop policy if exists "users can read own profile"       on public.user_profiles;
drop policy if exists "users can manage own profile"     on public.user_profiles;
drop policy if exists "admins can read org profiles"     on public.user_profiles;
drop policy if exists "admins can manage org profiles"   on public.user_profiles;

-- Leitura: próprio perfil OU admin/super_admin da org (sem subquery recursiva)
create policy "read own or admin reads all"
on public.user_profiles
for select
using (
  public.is_org_member(organization_id)
  and (
    user_id = auth.uid()
    or public.get_my_access_role(organization_id) in ('super_admin', 'admin')
  )
);

-- Escrita: próprio perfil OU admin/super_admin da org
create policy "write own or admin writes all"
on public.user_profiles
for all
using (
  public.is_org_member(organization_id)
  and (
    user_id = auth.uid()
    or public.get_my_access_role(organization_id) in ('super_admin', 'admin')
  )
)
with check (
  public.is_org_member(organization_id)
  and (
    user_id = auth.uid()
    or public.get_my_access_role(organization_id) in ('super_admin', 'admin')
  )
);

commit;
