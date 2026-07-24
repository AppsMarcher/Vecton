-- 059: Seções (subdivisões) do catálogo de relatórios
-- Criado por: Ricardo Guimarães — 2026-07-20
-- Estrutura org-wide (admin define, vale pra todos), mesmo padrão de RLS de 025_create_custom_reports.sql.

create table if not exists public.report_sections (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  name            text        not null,
  sort_order      int         not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- report_id é a chave lógica já usada no catálogo hoje (ex: "dreSocReal", "custom_<uuid>"),
-- não uma FK — os relatórios fixos não são linhas de tabela nenhuma.
create table if not exists public.report_section_items (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  section_id      uuid        not null references public.report_sections(id) on delete cascade,
  report_id       text        not null,
  sort_order      int         not null default 0,
  created_at      timestamptz not null default now(),
  unique (organization_id, report_id)
);

alter table public.report_sections enable row level security;
alter table public.report_section_items enable row level security;

create policy "org members read report sections"
  on public.report_sections for select
  using (is_org_member(organization_id));

create policy "admin write report sections"
  on public.report_sections for all
  using (
    exists (
      select 1 from public.user_profiles
      where organization_id = report_sections.organization_id
        and user_id = auth.uid()
        and access_role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where organization_id = report_sections.organization_id
        and user_id = auth.uid()
        and access_role in ('admin', 'super_admin')
    )
  );

create policy "org members read report section items"
  on public.report_section_items for select
  using (is_org_member(organization_id));

create policy "admin write report section items"
  on public.report_section_items for all
  using (
    exists (
      select 1 from public.user_profiles
      where organization_id = report_section_items.organization_id
        and user_id = auth.uid()
        and access_role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where organization_id = report_section_items.organization_id
        and user_id = auth.uid()
        and access_role in ('admin', 'super_admin')
    )
  );

create index if not exists report_sections_org_idx
  on public.report_sections (organization_id, sort_order);

create index if not exists report_section_items_org_idx
  on public.report_section_items (organization_id, section_id, sort_order);

-- Seed: cria as 5 seções padrão (espelhando o catálogo atual) para cada organização já existente
-- e distribui os relatórios fixos + os relatórios personalizados já criados.
do $$
declare
  org record;
  sec_comercial      uuid;
  sec_dre            uuid;
  sec_opex           uuid;
  sec_headcount      uuid;
  sec_personalizados uuid;
begin
  for org in select id from public.organizations loop
    insert into public.report_sections (organization_id, name, sort_order)
      values (org.id, 'Comercial', 0) returning id into sec_comercial;
    insert into public.report_sections (organization_id, name, sort_order)
      values (org.id, 'DRE', 1) returning id into sec_dre;
    insert into public.report_sections (organization_id, name, sort_order)
      values (org.id, 'OPEX', 2) returning id into sec_opex;
    insert into public.report_sections (organization_id, name, sort_order)
      values (org.id, 'Headcount', 3) returning id into sec_headcount;
    insert into public.report_sections (organization_id, name, sort_order)
      values (org.id, 'Personalizados', 4) returning id into sec_personalizados;

    insert into public.report_section_items (organization_id, section_id, report_id, sort_order) values
      (org.id, sec_comercial, 'comercialPainel', 0),
      (org.id, sec_comercial, 'comercialMapa',   1),
      (org.id, sec_dre, 'dreSocReal',    0),
      (org.id, sec_dre, 'dreGerReal',    1),
      (org.id, sec_dre, 'dreDfsReal',    2),
      (org.id, sec_dre, 'dreSocBudget',  3),
      (org.id, sec_dre, 'dreGerBudget',  4),
      (org.id, sec_dre, 'dreDfsBudget',  5),
      (org.id, sec_opex, 'opexReal',     0),
      (org.id, sec_opex, 'opexBudget',   1),
      (org.id, sec_headcount, 'headcountReal',   0),
      (org.id, sec_headcount, 'headcountBudget', 1)
    on conflict (organization_id, report_id) do nothing;

    insert into public.report_section_items (organization_id, section_id, report_id, sort_order)
      select org.id, sec_personalizados, 'custom_' || cr.id::text,
             row_number() over (order by cr.created_at) - 1
      from public.custom_reports cr
      where cr.organization_id = org.id
    on conflict (organization_id, report_id) do nothing;
  end loop;
end $$;
