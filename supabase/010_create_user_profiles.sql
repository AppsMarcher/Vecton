begin;

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text,
  email text,
  department text,
  profile_label text not null default 'Administrador',
  photo_kind text not null default 'none' check (photo_kind in ('none', 'upload', 'avatar')),
  photo_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_user_profiles_org_user
  on public.user_profiles (organization_id, user_id);

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

alter table public.user_profiles enable row level security;

drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile"
on public.user_profiles
for select
using (
  user_id = auth.uid()
  and public.is_org_member(organization_id)
);

drop policy if exists "users can manage own profile" on public.user_profiles;
create policy "users can manage own profile"
on public.user_profiles
for all
using (
  user_id = auth.uid()
  and public.is_org_member(organization_id)
)
with check (
  user_id = auth.uid()
  and public.is_org_member(organization_id)
);

commit;
