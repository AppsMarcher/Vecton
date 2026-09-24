begin;

-- Pop-up de novidades/lançamentos exibido na abertura do app (ver
-- src/modules/announcements/). Um "anúncio" é uma campanha com N slides
-- (carrossel); cada slide é uma imagem cheia (banner já pronto, sem overlay
-- do sistema) ou um bloco cabeçalho + texto + imagem opcional montado pelo
-- sistema. user_announcement_dismissals registra quem já viu/dispensou, para
-- não repetir a cada login.

create table if not exists public.product_announcements (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  title            text not null,
  active           boolean not null default true,
  starts_at        timestamptz,
  ends_at          timestamptz,
  sort_order       integer not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.product_announcement_slides (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  announcement_id   uuid not null references public.product_announcements(id) on delete cascade,
  sort_order        integer not null default 0,
  slide_type        text not null default 'content' check (slide_type in ('image', 'content')),
  image_path        text,
  heading           text,
  body              text,
  cta_label         text,
  cta_url           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.user_announcement_dismissals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  announcement_id  uuid not null references public.product_announcements(id) on delete cascade,
  dismissed_at     timestamptz not null default now(),
  unique (user_id, announcement_id)
);

create index if not exists idx_product_announcements_org_active
  on public.product_announcements (organization_id, active);

create index if not exists idx_product_announcement_slides_announcement
  on public.product_announcement_slides (announcement_id, sort_order);

create index if not exists idx_user_announcement_dismissals_user
  on public.user_announcement_dismissals (user_id, announcement_id);

drop trigger if exists trg_product_announcements_updated_at on public.product_announcements;
create trigger trg_product_announcements_updated_at
before update on public.product_announcements
for each row
execute function public.set_updated_at();

drop trigger if exists trg_product_announcement_slides_updated_at on public.product_announcement_slides;
create trigger trg_product_announcement_slides_updated_at
before update on public.product_announcement_slides
for each row
execute function public.set_updated_at();

alter table public.product_announcements enable row level security;
alter table public.product_announcement_slides enable row level security;
alter table public.user_announcement_dismissals enable row level security;

-- product_announcements: qualquer membro ativo lê; só admins gerenciam.
drop policy if exists "members can read product announcements" on public.product_announcements;
create policy "members can read product announcements"
on public.product_announcements
for select
using (public.is_org_member(organization_id));

drop policy if exists "admins can manage product announcements" on public.product_announcements;
create policy "admins can manage product announcements"
on public.product_announcements
for all
using (public.get_my_access_role(organization_id) in ('super_admin', 'admin'))
with check (public.get_my_access_role(organization_id) in ('super_admin', 'admin'));

-- product_announcement_slides: mesma regra do anúncio pai.
drop policy if exists "members can read product announcement slides" on public.product_announcement_slides;
create policy "members can read product announcement slides"
on public.product_announcement_slides
for select
using (public.is_org_member(organization_id));

drop policy if exists "admins can manage product announcement slides" on public.product_announcement_slides;
create policy "admins can manage product announcement slides"
on public.product_announcement_slides
for all
using (public.get_my_access_role(organization_id) in ('super_admin', 'admin'))
with check (public.get_my_access_role(organization_id) in ('super_admin', 'admin'));

-- user_announcement_dismissals: cada usuário só enxerga/grava o próprio "vi isso".
drop policy if exists "users can read own announcement dismissals" on public.user_announcement_dismissals;
create policy "users can read own announcement dismissals"
on public.user_announcement_dismissals
for select
using (user_id = auth.uid());

drop policy if exists "users can dismiss announcements" on public.user_announcement_dismissals;
create policy "users can dismiss announcements"
on public.user_announcement_dismissals
for insert
with check (user_id = auth.uid() and public.is_org_member(organization_id));

-- Bucket público (mesmo padrão do bucket de templates de carga já usado pelo
-- app): banners não são dado sensível, e servir por URL pública direta evita
-- gerar signed URL a cada exibição do pop-up. Escrita continua restrita a
-- admins via policy de storage.objects.
insert into storage.buckets (id, name, public, file_size_limit)
values ('product-announcements', 'product-announcements', true, 5242880)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit;

-- Caminho esperado: organization_id/announcement_id/slide_id-filename —
-- primeiro segmento valida como UUID antes de checar o papel do usuário.
drop policy if exists "public can read product announcement images" on storage.objects;
create policy "public can read product announcement images"
on storage.objects for select
to public
using (bucket_id = 'product-announcements');

drop policy if exists "admins upload product announcement images" on storage.objects;
create policy "admins upload product announcement images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-announcements'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.get_my_access_role(((storage.foldername(name))[1])::uuid) in ('super_admin', 'admin')
);

drop policy if exists "admins update product announcement images" on storage.objects;
create policy "admins update product announcement images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'product-announcements'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.get_my_access_role(((storage.foldername(name))[1])::uuid) in ('super_admin', 'admin')
)
with check (
  bucket_id = 'product-announcements'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.get_my_access_role(((storage.foldername(name))[1])::uuid) in ('super_admin', 'admin')
);

drop policy if exists "admins delete product announcement images" on storage.objects;
create policy "admins delete product announcement images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-announcements'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.get_my_access_role(((storage.foldername(name))[1])::uuid) in ('super_admin', 'admin')
);

commit;
