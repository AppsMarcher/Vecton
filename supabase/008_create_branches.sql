begin;

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

create index if not exists idx_branches_org_code
  on public.branches (organization_id, branch_code);

drop trigger if exists trg_branches_updated_at on public.branches;
create trigger trg_branches_updated_at
before update on public.branches
for each row
execute function public.set_updated_at();

alter table public.branches enable row level security;

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

commit;
