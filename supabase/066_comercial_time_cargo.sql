begin;

-- O cadastro mantem a mesma chave comercial (codigo), usada nas atribuicoes e
-- campanhas. Cargo descreve a funcao do integrante sem alterar essa integracao.
alter table public.comercial_vendedores
  add column if not exists cargo text;

-- Registros anteriores iniciam com a classificacao padrao e podem ser
-- reclassificados no cadastro. A interface apresenta somente os cargos da lista.
update public.comercial_vendedores
set cargo = 'Representando Comercial'
where cargo is null or btrim(cargo) = '';

-- A versao inicial deste cadastro usava textos livres. Normaliza qualquer
-- valor legado que nao faz parte da lista antes de restringir a coluna.
update public.comercial_vendedores
set cargo = 'Representando Comercial'
where cargo not in (
  'Gerente Comercial',
  'Coordenador Sul',
  'Coordenador Norte',
  'Coordenador Oeste',
  'Coordenador Pecuária',
  'Especialista Exportação',
  'Representando Comercial',
  'Vendedor'
);

alter table public.comercial_vendedores
  alter column cargo set default 'Representando Comercial',
  alter column cargo set not null;

alter table public.comercial_vendedores
  drop constraint if exists comercial_vendedores_cargo_check;
alter table public.comercial_vendedores
  add constraint comercial_vendedores_cargo_check check (cargo in (
    'Gerente Comercial',
    'Coordenador Sul',
    'Coordenador Norte',
    'Coordenador Oeste',
    'Coordenador Pecuária',
    'Especialista Exportação',
    'Representando Comercial',
    'Vendedor'
  ));

-- Pablo integra a coordenacao de Exportacao. O upsert e idempotente e nao
-- modifica quaisquer atribuicoes ou lancamentos historicos.
with org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
)
insert into public.comercial_vendedores (organization_id, codigo, nome, cargo, situacao)
select org.id, '000685', 'PABLO GENRIH ARROYO', 'Especialista Exportação', 'ativo'
from org
on conflict (organization_id, codigo) do update
set nome = excluded.nome,
    cargo = excluded.cargo,
    situacao = excluded.situacao,
    updated_at = now();

commit;
