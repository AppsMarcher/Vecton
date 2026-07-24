begin;

-- Corrige o texto canonico aprovado depois da migration 066. Esta migration e
-- separada porque a 066 ja pode ter sido aplicada em ambientes existentes.
alter table public.comercial_vendedores
  drop constraint if exists comercial_vendedores_cargo_check;

update public.comercial_vendedores
set cargo = 'Representante Comercial'
where cargo = 'Representando Comercial';

alter table public.comercial_vendedores
  alter column cargo set default 'Representante Comercial';

alter table public.comercial_vendedores
  add constraint comercial_vendedores_cargo_check check (cargo in (
    'Gerente Comercial',
    'Coordenador Sul',
    'Coordenador Norte',
    'Coordenador Oeste',
    'Coordenador Pecuária',
    'Especialista Exportação',
    'Representante Comercial',
    'Vendedor'
  ));

-- Historico SCD2 dos atributos usados pelos relatorios. A vigencia da pessoa e
-- distinta da vigencia da atribuicao territorio + linha de negocio.
create table if not exists public.comercial_vendedor_vigencias (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  cod_vendedor     text not null,
  nome             text not null,
  cargo            text not null check (cargo in (
    'Gerente Comercial',
    'Coordenador Sul',
    'Coordenador Norte',
    'Coordenador Oeste',
    'Coordenador Pecuária',
    'Especialista Exportação',
    'Representante Comercial',
    'Vendedor'
  )),
  situacao         text not null check (situacao in ('ativo', 'historico')),
  data_inicio      date not null,
  data_fim         date,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (data_fim is null or data_fim >= data_inicio),
  foreign key (organization_id, cod_vendedor)
    references public.comercial_vendedores(organization_id, codigo) on delete restrict,
  exclude using gist (
    organization_id with =,
    cod_vendedor with =,
    daterange(data_inicio, coalesce(data_fim, 'infinity'::date), '[]') with &&
  )
);

create index if not exists idx_comercial_vendedor_vigencias_lookup
  on public.comercial_vendedor_vigencias
  (organization_id, cod_vendedor, data_inicio, data_fim);

-- Backfill conservador: usa a primeira atribuicao conhecida como inicio. Para
-- cadastros sem atribuicao, usa o inicio da base comercial (01/01/2023).
with base as (
  select
    v.organization_id,
    v.codigo,
    v.nome,
    v.cargo,
    v.situacao,
    coalesce(min(ar.data_inicio), date '2023-01-01') as data_inicio
  from public.comercial_vendedores v
  left join public.comercial_atribuicao_responsavel ar
    on ar.organization_id = v.organization_id
   and ar.cod_vendedor = v.codigo
  group by v.organization_id, v.codigo, v.nome, v.cargo, v.situacao
)
insert into public.comercial_vendedor_vigencias (
  organization_id, cod_vendedor, nome, cargo, situacao, data_inicio, data_fim
)
select
  b.organization_id,
  b.codigo,
  b.nome,
  b.cargo,
  case when b.situacao = 'historico' and b.data_inicio < current_date
       then 'ativo' else b.situacao end,
  b.data_inicio,
  case when b.situacao = 'historico' and b.data_inicio < current_date
       then current_date - 1 else null end
from base b
where not exists (
  select 1
  from public.comercial_vendedor_vigencias h
  where h.organization_id = b.organization_id
    and h.cod_vendedor = b.codigo
);

-- Preserva o estado atual dos cadastros historicos sem apagar sua participacao
-- nos periodos anteriores.
insert into public.comercial_vendedor_vigencias (
  organization_id, cod_vendedor, nome, cargo, situacao, data_inicio, data_fim
)
select v.organization_id, v.codigo, v.nome, v.cargo, 'historico', current_date, null
from public.comercial_vendedores v
where v.situacao = 'historico'
  and not exists (
    select 1
    from public.comercial_vendedor_vigencias h
    where h.organization_id = v.organization_id
      and h.cod_vendedor = v.codigo
      and current_date >= h.data_inicio
      and (h.data_fim is null or current_date <= h.data_fim)
  );

create or replace function public.sync_comercial_vendedor_vigencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.comercial_vendedor_vigencias%rowtype;
begin
  select * into atual
  from public.comercial_vendedor_vigencias
  where organization_id = new.organization_id
    and cod_vendedor = new.codigo
    and data_fim is null
  order by data_inicio desc
  limit 1;

  if not found then
    insert into public.comercial_vendedor_vigencias (
      organization_id, cod_vendedor, nome, cargo, situacao, data_inicio, created_by
    ) values (
      new.organization_id, new.codigo, new.nome, new.cargo, new.situacao,
      current_date, auth.uid()
    );
    return new;
  end if;

  if atual.nome = new.nome
     and atual.cargo = new.cargo
     and atual.situacao = new.situacao then
    return new;
  end if;

  if atual.data_inicio = current_date then
    update public.comercial_vendedor_vigencias
    set nome = new.nome,
        cargo = new.cargo,
        situacao = new.situacao,
        updated_at = now()
    where id = atual.id;
  else
    update public.comercial_vendedor_vigencias
    set data_fim = current_date - 1,
        updated_at = now()
    where id = atual.id;

    insert into public.comercial_vendedor_vigencias (
      organization_id, cod_vendedor, nome, cargo, situacao, data_inicio, created_by
    ) values (
      new.organization_id, new.codigo, new.nome, new.cargo, new.situacao,
      current_date, auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_comercial_vendedor_vigencia
  on public.comercial_vendedores;
create trigger trg_sync_comercial_vendedor_vigencia
after insert or update of nome, cargo, situacao
on public.comercial_vendedores
for each row execute function public.sync_comercial_vendedor_vigencia();

alter table public.comercial_vendedor_vigencias enable row level security;

drop policy if exists "members read comercial vendedor vigencias"
  on public.comercial_vendedor_vigencias;
create policy "members read comercial vendedor vigencias"
  on public.comercial_vendedor_vigencias
  for select using (public.is_org_member(organization_id));

drop policy if exists "editors manage comercial vendedor vigencias"
  on public.comercial_vendedor_vigencias;
create policy "editors manage comercial vendedor vigencias"
  on public.comercial_vendedor_vigencias
  for all using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

commit;
