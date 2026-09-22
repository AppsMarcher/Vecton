begin;

-- ============================================================================
-- Módulo RPS Comercial — schema. Isolado do RPS Gestão e do A3 Estratégico:
-- nenhuma tabela, permissão, snapshot ou bucket compartilhado (mesmo
-- princípio da migration 128). Prefixo rps_comercial_ em tudo.
--
-- Regra de acesso: NÃO cria perfil novo — reaproveita o perfil 'comercial'
-- já existente (migration 054), mesmo perfil que já dá acesso a Relatórios.
-- Só super_admin, admin, manager e 'comercial' enxergam ou escrevem QUALQUER
-- coisa neste módulo — sem leitura ampla via is_org_member, mesma regra
-- "módulo invisível sem o perfil" do A3 Estratégico (decisão #15 da
-- migration 128). Quem tem acesso preenche as 6 áreas, sem recorte por
-- região nesta v1.
-- ============================================================================

create or replace function public.can_manage_rps_comercial(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.organization_id = target_organization_id
      and up.user_id = auth.uid()
      and (
        up.access_role in ('super_admin', 'admin', 'manager', 'comercial')
        or 'comercial' = any(up.additional_access_roles)
      )
  );
$$;

grant execute on function public.can_manage_rps_comercial(uuid) to authenticated;

-- ============================================================================
-- 1. rps_comercial_entries — registro semanal por área (as 6 áreas comerciais
-- são fixas no código do módulo, não há tabela de cadastro para elas).
-- period = data da segunda-feira da semana da reunião.
-- ============================================================================
create table if not exists public.rps_comercial_entries (
  id                        uuid        primary key default gen_random_uuid(),
  organization_id           uuid        not null references public.organizations(id) on delete cascade,
  period                    date        not null,
  area_id                   text        not null check (area_id in (
                               'norte', 'sul', 'oeste', 'exportacao', 'pecas', 'administrativo'
                             )),
  semana_anterior_texto     text,
  planejamento_atual_texto  text,
  comentarios_texto         text,
  version                   bigint      not null default 1 check (version >= 1),
  updated_by                uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (organization_id, period, area_id)
);

create index if not exists idx_rps_comercial_entries_period on public.rps_comercial_entries (organization_id, period);

drop trigger if exists trg_rps_comercial_entries_updated_at on public.rps_comercial_entries;
create trigger trg_rps_comercial_entries_updated_at
before update on public.rps_comercial_entries
for each row execute function public.set_updated_at();

alter table public.rps_comercial_entries enable row level security;
drop policy if exists "rps comercial managers all on rps_comercial_entries" on public.rps_comercial_entries;
create policy "rps comercial managers all on rps_comercial_entries"
on public.rps_comercial_entries for all
using (public.can_manage_rps_comercial(organization_id))
with check (public.can_manage_rps_comercial(organization_id));

-- ============================================================================
-- 2. rps_comercial_attachments — anexos de cada bloco (arquivo em si no
-- Storage, migration 234). Mesmo molde de strategic_attachments, mas o dono
-- é sempre um par (entry_id, block_type) — um bloco pode ter vários anexos.
-- ============================================================================
create table if not exists public.rps_comercial_attachments (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  entry_id        uuid        not null references public.rps_comercial_entries(id) on delete cascade,
  block_type      text        not null check (block_type in (
                     'semana_anterior', 'planejamento_atual', 'comentarios'
                   )),
  storage_path    text        not null,
  file_name       text        not null,
  mime_type       text,
  file_size       bigint,
  display_order   integer     not null default 0,
  created_by      uuid        references auth.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);

create index if not exists idx_rps_comercial_attachments_entry on public.rps_comercial_attachments (entry_id, block_type, display_order);

alter table public.rps_comercial_attachments enable row level security;
drop policy if exists "rps comercial managers all on rps_comercial_attachments" on public.rps_comercial_attachments;
create policy "rps comercial managers all on rps_comercial_attachments"
on public.rps_comercial_attachments for all
using (public.can_manage_rps_comercial(organization_id))
with check (public.can_manage_rps_comercial(organization_id));

commit;
