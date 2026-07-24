begin;

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_users (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  registration_control text,
  account_number text not null,
  account_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, account_number)
);

create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cost_center_number text not null,
  cost_center_name text not null,
  cost_center_type text not null check (cost_center_type in ('MOD', 'MOI', 'ADM', 'COM', 'ENG')),
  cost_center_management text check (cost_center_management in ('Diretoria', 'Controladoria', 'Recursos Humanos', 'Supply Chain', 'Industrial', 'Engenharia', 'Marketing', 'Produto', 'Qualidade', 'Comercial')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, cost_center_number)
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_code text not null check (branch_code ~ '^[0-9]{2}$'),
  branch_name text not null,
  origin text not null default 'manual',
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, branch_code)
);

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

create table if not exists public.reporting_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fiscal_year integer not null,
  month_number integer not null check (month_number between 1 and 12),
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  unique (organization_id, fiscal_year, month_number),
  check (period_end >= period_start)
);

create index if not exists idx_accounts_org_number
  on public.accounts (organization_id, account_number);

create index if not exists idx_cost_centers_org_number
  on public.cost_centers (organization_id, cost_center_number);

create index if not exists idx_branches_org_code
  on public.branches (organization_id, branch_code);

create index if not exists idx_user_profiles_org_user
  on public.user_profiles (organization_id, user_id);

create index if not exists idx_reporting_periods_org_year_month
  on public.reporting_periods (organization_id, fiscal_year, month_number);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_accounts_updated_at on public.accounts;
create trigger trg_accounts_updated_at
before update on public.accounts
for each row
execute function public.set_updated_at();

drop trigger if exists trg_cost_centers_updated_at on public.cost_centers;
create trigger trg_cost_centers_updated_at
before update on public.cost_centers
for each row
execute function public.set_updated_at();

drop trigger if exists trg_branches_updated_at on public.branches;
create trigger trg_branches_updated_at
before update on public.branches
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

create or replace function public.create_organization_with_owner(org_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Usuario autenticado obrigatorio';
  end if;

  insert into public.organizations (name)
  values (org_name)
  returning * into new_org;

  insert into public.organization_users (organization_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  return new_org;
end;
$$;

grant execute on function public.create_organization_with_owner(text) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;
alter table public.accounts enable row level security;
alter table public.cost_centers enable row level security;
alter table public.branches enable row level security;
alter table public.user_profiles enable row level security;
alter table public.reporting_periods enable row level security;

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
using (public.is_org_editor(accounts.organization_id))
with check (public.is_org_editor(accounts.organization_id));

drop policy if exists "members can read cost centers" on public.cost_centers;
create policy "members can read cost centers"
on public.cost_centers
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage cost centers" on public.cost_centers;
create policy "editors can manage cost centers"
on public.cost_centers
for all
using (public.is_org_editor(cost_centers.organization_id))
with check (public.is_org_editor(cost_centers.organization_id));

drop policy if exists "members can read branches" on public.branches;
create policy "members can read branches"
on public.branches
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage branches" on public.branches;
create policy "editors can manage branches"
on public.branches
for all
using (public.is_org_editor(branches.organization_id))
with check (public.is_org_editor(branches.organization_id));

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

drop policy if exists "members can read reporting periods" on public.reporting_periods;
create policy "members can read reporting periods"
on public.reporting_periods
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage reporting periods" on public.reporting_periods;
create policy "editors can manage reporting periods"
on public.reporting_periods
for all
using (public.is_org_editor(reporting_periods.organization_id))
with check (public.is_org_editor(reporting_periods.organization_id));

commit;
