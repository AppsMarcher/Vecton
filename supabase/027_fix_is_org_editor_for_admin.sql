begin;

-- is_org_editor previously only checked organization_users.role ('owner'|'editor').
-- Users invited via Edge Function always get role='viewer' in organization_users,
-- even when their user_profiles.access_role is 'admin' or 'super_admin'.
-- This caused RLS violations on INSERT for budget/actuals tables.
-- Fix: also grant editor-level access to admin/super_admin in user_profiles.

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
    left join public.user_profiles up
      on up.user_id = auth.uid()
      and up.organization_id = target_organization_id
    where ou.organization_id = target_organization_id
      and ou.user_id = auth.uid()
      and (
        ou.role in ('owner', 'editor')
        or up.access_role in ('admin', 'super_admin')
      )
  )
$$;

commit;
