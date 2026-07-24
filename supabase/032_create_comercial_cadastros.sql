begin;

-- Cadastros base do modulo Comercial (produtos, clientes, regionais de vendas).
-- Fonte de referencia: Razao_MATR550.xlsm (sheets MATR550/Pedidos/META 5+7/Regioes).
-- Escopo desta migration: só os cadastros (dimensões). Pipelines de carga
-- (venda real / carteira / forecast) ficam para uma migration futura.

create table if not exists public.comercial_tipos (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  nome             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, nome)
);

create table if not exists public.comercial_culturas (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  nome             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, nome)
);

create table if not exists public.comercial_linhas_negocio (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  nome             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, nome)
);

create table if not exists public.comercial_coordenacoes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  nome             text not null,
  gestor           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, nome)
);

create table if not exists public.comercial_territorios (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  nome             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, nome)
);

create table if not exists public.comercial_produtos (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  codigo           text not null,
  descricao        text not null,
  tipo_id          uuid not null references public.comercial_tipos(id) on delete restrict,
  cultura_id       uuid references public.comercial_culturas(id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, codigo)
);

create table if not exists public.comercial_clientes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  codigo           text not null,
  descricao        text not null,
  cidade           text,
  uf               text check (uf is null or uf in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  )),
  codigo_ibge      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, codigo)
);

-- Atribuicao territorio+linha_negocio -> responsavel + coordenacao, com historico (SCD2).
-- Substitui as listas literais de territorio hardcoded nas formulas do Painel hoje:
-- somar uma coordenacao vira "where coordenacao_id = X and periodo vigente",
-- em vez de listar territorio a territorio manualmente.
create extension if not exists btree_gist;

create table if not exists public.comercial_atribuicao_responsavel (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  territorio_id    uuid not null references public.comercial_territorios(id) on delete restrict,
  linha_negocio_id uuid not null references public.comercial_linhas_negocio(id) on delete restrict,
  coordenacao_id   uuid not null references public.comercial_coordenacoes(id) on delete restrict,
  responsavel      text not null,
  data_inicio      date not null,
  data_fim         date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (data_fim is null or data_fim >= data_inicio),
  exclude using gist (
    territorio_id with =,
    linha_negocio_id with =,
    daterange(data_inicio, coalesce(data_fim, 'infinity'::date), '[]') with &&
  )
);

create index if not exists idx_comercial_produtos_org_codigo
  on public.comercial_produtos (organization_id, codigo);

create index if not exists idx_comercial_produtos_tipo
  on public.comercial_produtos (tipo_id);

create index if not exists idx_comercial_produtos_cultura
  on public.comercial_produtos (cultura_id);

create index if not exists idx_comercial_clientes_org_codigo
  on public.comercial_clientes (organization_id, codigo);

create index if not exists idx_comercial_atribuicao_territorio_linha
  on public.comercial_atribuicao_responsavel (territorio_id, linha_negocio_id, data_inicio);

create index if not exists idx_comercial_atribuicao_coordenacao
  on public.comercial_atribuicao_responsavel (coordenacao_id);

drop trigger if exists trg_comercial_tipos_updated_at on public.comercial_tipos;
create trigger trg_comercial_tipos_updated_at
before update on public.comercial_tipos
for each row
execute function public.set_updated_at();

drop trigger if exists trg_comercial_culturas_updated_at on public.comercial_culturas;
create trigger trg_comercial_culturas_updated_at
before update on public.comercial_culturas
for each row
execute function public.set_updated_at();

drop trigger if exists trg_comercial_linhas_negocio_updated_at on public.comercial_linhas_negocio;
create trigger trg_comercial_linhas_negocio_updated_at
before update on public.comercial_linhas_negocio
for each row
execute function public.set_updated_at();

drop trigger if exists trg_comercial_coordenacoes_updated_at on public.comercial_coordenacoes;
create trigger trg_comercial_coordenacoes_updated_at
before update on public.comercial_coordenacoes
for each row
execute function public.set_updated_at();

drop trigger if exists trg_comercial_territorios_updated_at on public.comercial_territorios;
create trigger trg_comercial_territorios_updated_at
before update on public.comercial_territorios
for each row
execute function public.set_updated_at();

drop trigger if exists trg_comercial_produtos_updated_at on public.comercial_produtos;
create trigger trg_comercial_produtos_updated_at
before update on public.comercial_produtos
for each row
execute function public.set_updated_at();

drop trigger if exists trg_comercial_clientes_updated_at on public.comercial_clientes;
create trigger trg_comercial_clientes_updated_at
before update on public.comercial_clientes
for each row
execute function public.set_updated_at();

drop trigger if exists trg_comercial_atribuicao_updated_at on public.comercial_atribuicao_responsavel;
create trigger trg_comercial_atribuicao_updated_at
before update on public.comercial_atribuicao_responsavel
for each row
execute function public.set_updated_at();

alter table public.comercial_tipos enable row level security;
alter table public.comercial_culturas enable row level security;
alter table public.comercial_linhas_negocio enable row level security;
alter table public.comercial_coordenacoes enable row level security;
alter table public.comercial_territorios enable row level security;
alter table public.comercial_produtos enable row level security;
alter table public.comercial_clientes enable row level security;
alter table public.comercial_atribuicao_responsavel enable row level security;

drop policy if exists "members can read comercial tipos" on public.comercial_tipos;
create policy "members can read comercial tipos"
on public.comercial_tipos
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage comercial tipos" on public.comercial_tipos;
create policy "editors can manage comercial tipos"
on public.comercial_tipos
for all
using (public.is_org_editor(comercial_tipos.organization_id))
with check (public.is_org_editor(comercial_tipos.organization_id));

drop policy if exists "members can read comercial culturas" on public.comercial_culturas;
create policy "members can read comercial culturas"
on public.comercial_culturas
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage comercial culturas" on public.comercial_culturas;
create policy "editors can manage comercial culturas"
on public.comercial_culturas
for all
using (public.is_org_editor(comercial_culturas.organization_id))
with check (public.is_org_editor(comercial_culturas.organization_id));

drop policy if exists "members can read comercial linhas negocio" on public.comercial_linhas_negocio;
create policy "members can read comercial linhas negocio"
on public.comercial_linhas_negocio
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage comercial linhas negocio" on public.comercial_linhas_negocio;
create policy "editors can manage comercial linhas negocio"
on public.comercial_linhas_negocio
for all
using (public.is_org_editor(comercial_linhas_negocio.organization_id))
with check (public.is_org_editor(comercial_linhas_negocio.organization_id));

drop policy if exists "members can read comercial coordenacoes" on public.comercial_coordenacoes;
create policy "members can read comercial coordenacoes"
on public.comercial_coordenacoes
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage comercial coordenacoes" on public.comercial_coordenacoes;
create policy "editors can manage comercial coordenacoes"
on public.comercial_coordenacoes
for all
using (public.is_org_editor(comercial_coordenacoes.organization_id))
with check (public.is_org_editor(comercial_coordenacoes.organization_id));

drop policy if exists "members can read comercial territorios" on public.comercial_territorios;
create policy "members can read comercial territorios"
on public.comercial_territorios
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage comercial territorios" on public.comercial_territorios;
create policy "editors can manage comercial territorios"
on public.comercial_territorios
for all
using (public.is_org_editor(comercial_territorios.organization_id))
with check (public.is_org_editor(comercial_territorios.organization_id));

drop policy if exists "members can read comercial produtos" on public.comercial_produtos;
create policy "members can read comercial produtos"
on public.comercial_produtos
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage comercial produtos" on public.comercial_produtos;
create policy "editors can manage comercial produtos"
on public.comercial_produtos
for all
using (public.is_org_editor(comercial_produtos.organization_id))
with check (public.is_org_editor(comercial_produtos.organization_id));

drop policy if exists "members can read comercial clientes" on public.comercial_clientes;
create policy "members can read comercial clientes"
on public.comercial_clientes
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage comercial clientes" on public.comercial_clientes;
create policy "editors can manage comercial clientes"
on public.comercial_clientes
for all
using (public.is_org_editor(comercial_clientes.organization_id))
with check (public.is_org_editor(comercial_clientes.organization_id));

drop policy if exists "members can read comercial atribuicao" on public.comercial_atribuicao_responsavel;
create policy "members can read comercial atribuicao"
on public.comercial_atribuicao_responsavel
for select
using (public.is_org_member(organization_id));

drop policy if exists "editors can manage comercial atribuicao" on public.comercial_atribuicao_responsavel;
create policy "editors can manage comercial atribuicao"
on public.comercial_atribuicao_responsavel
for all
using (public.is_org_editor(comercial_atribuicao_responsavel.organization_id))
with check (public.is_org_editor(comercial_atribuicao_responsavel.organization_id));

commit;
