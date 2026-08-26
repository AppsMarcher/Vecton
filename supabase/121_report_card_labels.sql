-- 121: Apelidos (nome/subtítulo) dos cards fixos do catálogo de relatórios.
-- Criado por: Ricardo Guimarães — 2026-08-26
-- Antes disso, o botão de editar dos cards (Comercial, DRE, OPEX, Headcount)
-- gravava em localStorage por usuário (vp_report_labels_<user_id>) — cada
-- admin via seu próprio apelido, sem refletir pra ninguém. Aqui o apelido
-- passa a ser org-wide: um admin/super_admin edita, todo mundo da organização
-- vê a mesma coisa. Mesmo padrão de RLS de 059_create_report_sections.sql.

create table if not exists public.report_card_labels (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  -- Mesma chave lógica usada em report_section_items.report_id (ex: "comercialMapa",
  -- "dreSocReal", "custom_<uuid>") — não é FK, os relatórios fixos não são linhas de tabela.
  report_id       text        not null,
  label           text,
  subtitle        text,
  updated_by      uuid        references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (organization_id, report_id)
);

alter table public.report_card_labels enable row level security;

create policy "org members read report card labels"
  on public.report_card_labels for select
  using (is_org_member(organization_id));

create policy "admin write report card labels"
  on public.report_card_labels for all
  using (
    exists (
      select 1 from public.user_profiles
      where organization_id = report_card_labels.organization_id
        and user_id = auth.uid()
        and access_role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where organization_id = report_card_labels.organization_id
        and user_id = auth.uid()
        and access_role in ('admin', 'super_admin')
    )
  );

create index if not exists report_card_labels_org_idx
  on public.report_card_labels (organization_id);

drop trigger if exists trg_report_card_labels_updated_at on public.report_card_labels;
create trigger trg_report_card_labels_updated_at
before update on public.report_card_labels
for each row execute function public.set_updated_at();
