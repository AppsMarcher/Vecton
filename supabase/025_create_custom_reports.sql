-- 025: Relatórios personalizados (Report Builder)
-- Criado por: Ricardo Guimarães — 2026-06-24

create table if not exists public.custom_reports (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  created_by      uuid        not null,
  label           text        not null,
  config          jsonb       not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.custom_reports enable row level security;

-- Qualquer membro da org pode visualizar os relatórios criados
create policy "org members read custom reports"
  on public.custom_reports for select
  using (is_org_member(organization_id));

-- Apenas admin/super_admin podem criar, editar e excluir
create policy "admin write custom reports"
  on public.custom_reports for all
  using (
    exists (
      select 1 from public.user_profiles
      where organization_id = custom_reports.organization_id
        and user_id = auth.uid()
        and access_role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where organization_id = custom_reports.organization_id
        and user_id = auth.uid()
        and access_role in ('admin', 'super_admin')
    )
  );

-- Índice para busca por org
create index if not exists custom_reports_org_idx
  on public.custom_reports (organization_id, created_at);
