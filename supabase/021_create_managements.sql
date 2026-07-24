begin;

create table if not exists public.managements (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.managements enable row level security;

create policy "org members can read managements"
  on public.managements for select
  using (organization_id in (
    select organization_id from public.organization_users where user_id = auth.uid()
  ));

create policy "admins can manage managements"
  on public.managements for all
  using (
    public.get_my_access_role(organization_id) in ('super_admin', 'admin')
  )
  with check (
    public.get_my_access_role(organization_id) in ('super_admin', 'admin')
  );

-- popula com as gestões que já existem nos centros de custo
insert into public.managements (organization_id, name, sort_order)
select distinct
  organization_id,
  cost_center_management,
  row_number() over (partition by organization_id order by cost_center_management) - 1
from public.cost_centers
where cost_center_management is not null and cost_center_management <> ''
on conflict do nothing;

commit;
