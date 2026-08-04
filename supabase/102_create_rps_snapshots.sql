begin;

-- Snapshot mensal da Reunião de Performance Semanal.
-- A versão é usada pelo cliente em compare-and-swap; nunca deve ser reiniciada
-- durante importações ou migrações.
create table if not exists public.rps_snapshots (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  ano             integer     not null check (ano between 2000 and 2200),
  mes             integer     not null check (mes between 1 and 12),
  payload         jsonb       not null default '{}'::jsonb,
  version         bigint      not null default 1 check (version >= 1),
  created_by      uuid        references auth.users(id) on delete set null default auth.uid(),
  updated_by      uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, ano, mes)
);

create index if not exists rps_snapshots_org_period_idx
  on public.rps_snapshots (organization_id, ano desc, mes desc);

drop trigger if exists trg_rps_snapshots_updated_at on public.rps_snapshots;
create trigger trg_rps_snapshots_updated_at
before update on public.rps_snapshots
for each row execute function public.set_updated_at();

alter table public.rps_snapshots enable row level security;

drop policy if exists "org members read rps snapshots" on public.rps_snapshots;
create policy "org members read rps snapshots"
on public.rps_snapshots
for select
using (public.is_org_member(organization_id));

drop policy if exists "org editors manage rps snapshots" on public.rps_snapshots;
create policy "org editors manage rps snapshots"
on public.rps_snapshots
for all
using (public.is_org_editor(organization_id))
with check (public.is_org_editor(organization_id));

grant select, insert, update, delete on public.rps_snapshots to authenticated;

comment on table public.rps_snapshots is
  'Snapshots mensais da RPS. Payload compatível com o aplicativo RPS legado; version sustenta o CAS concorrente.';

commit;
