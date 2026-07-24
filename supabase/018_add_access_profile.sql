begin;

-- Tipo enumerado para os 4 perfis
do $$ begin
  create type public.access_profile_role as enum (
    'super_admin',
    'admin',
    'manager',
    'analyst'
  );
exception when duplicate_object then null; end $$;

-- Novas colunas em user_profiles
alter table public.user_profiles
  add column if not exists access_role  public.access_profile_role not null default 'analyst',
  add column if not exists management   text,           -- área de gestão (Gestor/Analista)
  add column if not exists matrix_accounts text[] not null default '{}', -- contas matriciais
  add column if not exists phone        text;           -- telefone (já existe no form de perfil)

-- Migração dos dados existentes: quem era 'Administrador' vira 'admin'
update public.user_profiles
  set access_role = 'admin'
  where lower(profile_label) in ('administrador', 'admin');

-- Índice para busca por role dentro de uma organização
create index if not exists idx_user_profiles_org_role
  on public.user_profiles (organization_id, access_role);

-- Política: admins e super_admins podem ler todos os perfis da org
drop policy if exists "admins can read org profiles" on public.user_profiles;
create policy "admins can read org profiles"
on public.user_profiles
for select
using (
  public.is_org_member(organization_id)
  and (
    user_id = auth.uid()
    or exists (
      select 1 from public.user_profiles up2
      where up2.user_id = auth.uid()
        and up2.organization_id = user_profiles.organization_id
        and up2.access_role in ('super_admin', 'admin')
    )
  )
);

-- Política: só admins podem alterar perfis de outros usuários
drop policy if exists "admins can manage org profiles" on public.user_profiles;
create policy "admins can manage org profiles"
on public.user_profiles
for all
using (
  public.is_org_member(organization_id)
  and (
    user_id = auth.uid()
    or exists (
      select 1 from public.user_profiles up2
      where up2.user_id = auth.uid()
        and up2.organization_id = user_profiles.organization_id
        and up2.access_role in ('super_admin', 'admin')
    )
  )
)
with check (
  public.is_org_member(organization_id)
  and (
    user_id = auth.uid()
    or exists (
      select 1 from public.user_profiles up2
      where up2.user_id = auth.uid()
        and up2.organization_id = user_profiles.organization_id
        and up2.access_role in ('super_admin', 'admin')
    )
  )
);

commit;
