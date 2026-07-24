begin;

create table if not exists public.dre_plan_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  parent_node_id uuid references public.dre_plan_nodes(id) on delete set null,
  node_code text not null,
  node_name text not null,
  node_class text not null check (node_class in ('Sintetica', 'Analitica')),
  sort_order integer not null default 1,
  active boolean not null default true,
  origin text not null default 'manual',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, node_code)
);

create table if not exists public.cc_plan_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  parent_node_id uuid references public.cc_plan_nodes(id) on delete set null,
  node_code text not null,
  node_name text not null,
  node_class text not null check (node_class in ('Sintetica', 'Analitica')),
  node_type text not null,
  sort_order integer not null default 1,
  active boolean not null default true,
  origin text not null default 'manual',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, node_code)
);

create index if not exists idx_dre_plan_nodes_org_parent
  on public.dre_plan_nodes (organization_id, parent_node_id, sort_order);

create index if not exists idx_cc_plan_nodes_org_parent
  on public.cc_plan_nodes (organization_id, parent_node_id, sort_order);

drop trigger if exists trg_dre_plan_nodes_updated_at on public.dre_plan_nodes;
create trigger trg_dre_plan_nodes_updated_at
before update on public.dre_plan_nodes
for each row
execute function public.set_updated_at();

drop trigger if exists trg_cc_plan_nodes_updated_at on public.cc_plan_nodes;
create trigger trg_cc_plan_nodes_updated_at
before update on public.cc_plan_nodes
for each row
execute function public.set_updated_at();

alter table public.dre_plan_nodes enable row level security;
alter table public.cc_plan_nodes enable row level security;

drop policy if exists "members can read dre plan nodes" on public.dre_plan_nodes;
create policy "members can read dre plan nodes"
on public.dre_plan_nodes
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage dre plan nodes" on public.dre_plan_nodes;
create policy "editors can manage dre plan nodes"
on public.dre_plan_nodes
for all
using (public.is_org_editor(dre_plan_nodes.organization_id))
with check (public.is_org_editor(dre_plan_nodes.organization_id));

drop policy if exists "members can read cc plan nodes" on public.cc_plan_nodes;
create policy "members can read cc plan nodes"
on public.cc_plan_nodes
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage cc plan nodes" on public.cc_plan_nodes;
create policy "editors can manage cc plan nodes"
on public.cc_plan_nodes
for all
using (public.is_org_editor(cc_plan_nodes.organization_id))
with check (public.is_org_editor(cc_plan_nodes.organization_id));

commit;
