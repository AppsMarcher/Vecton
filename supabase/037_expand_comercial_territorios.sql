-- Expande comercial_territorios pra cobrir todos os 29 códigos de
-- REGIONAL_MARCHER confirmados pelo usuário (slicer da Razão), não só os 18
-- com responsável nomeado no Painel. Territórios sem responsável na origem
-- somam direto no coordenador da região (Grão) / no Paulo (Pecuária, mesma
-- regra de roteamento Sul/Norte->Pecuária já usada nos demais).
--
-- Também corrige um erro da migration 033: "MA_PI" foi um combinado incorreto
-- meu — MA e PI são territórios (REGIONAL_MARCHER) distintos na origem, viram
-- 2 linhas separadas agora, ambas com Claudemir como responsável.
begin;

with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
)
delete from public.comercial_atribuicao_responsavel
where organization_id = (select id from target_org)
  and territorio_id = (
    select id from public.comercial_territorios
    where organization_id = (select id from target_org) and nome = 'MA_PI'
  );

with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
)
delete from public.comercial_territorios
where organization_id = (select id from target_org) and nome = 'MA_PI';

with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
novos (nome) as (
  values ('MA'), ('PI'),
         ('AC'), ('AM'), ('AP'), ('CE'), ('ES'), ('PB'), ('PE'), ('RJ'), ('RN'), ('SC')
)
insert into public.comercial_territorios (organization_id, nome)
select target_org.id, novos.nome
from novos cross join target_org
on conflict (organization_id, nome) do nothing;

-- MA e PI: mesmo responsável (Claudemir), coordenação Norte (Grão) / Pecuária (Paulo).
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
t as (select id, nome from public.comercial_territorios where organization_id = (select id from target_org)),
l as (select id, nome from public.comercial_linhas_negocio where organization_id = (select id from target_org)),
c as (select id, nome from public.comercial_coordenacoes where organization_id = (select id from target_org)),
atrib (territorio, linha, coordenacao, responsavel) as (
  values
    ('MA', 'Grão',     'Norte',    'Claudemir'),
    ('MA', 'Pecuária', 'Pecuária', 'Claudemir'),
    ('PI', 'Grão',     'Norte',    'Claudemir'),
    ('PI', 'Pecuária', 'Pecuária', 'Claudemir')
)
insert into public.comercial_atribuicao_responsavel
  (organization_id, territorio_id, linha_negocio_id, coordenacao_id, responsavel, data_inicio)
select (select id from target_org), t.id, l.id, c.id, atrib.responsavel, date '2023-01-01'
from atrib
join t on t.nome = atrib.territorio
join l on l.nome = atrib.linha
join c on c.nome = atrib.coordenacao;

-- Territórios órfãos (sem responsável no Painel): Grão soma direto no
-- coordenador da região (Danilo=Norte, Yuri=Sul); Pecuária segue a mesma
-- exceção de roteamento Sul/Norte->Paulo já usada nos demais territórios.
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
t as (select id, nome from public.comercial_territorios where organization_id = (select id from target_org)),
l as (select id, nome from public.comercial_linhas_negocio where organization_id = (select id from target_org)),
c as (select id, nome from public.comercial_coordenacoes where organization_id = (select id from target_org)),
atrib (territorio, linha, coordenacao, responsavel) as (
  values
    -- Órfãos Norte (Danilo absorve o Grão direto)
    ('AC', 'Grão',     'Norte',    'Danilo'),
    ('AC', 'Pecuária', 'Pecuária', 'Paulo'),
    ('AM', 'Grão',     'Norte',    'Danilo'),
    ('AM', 'Pecuária', 'Pecuária', 'Paulo'),
    ('AP', 'Grão',     'Norte',    'Danilo'),
    ('AP', 'Pecuária', 'Pecuária', 'Paulo'),
    ('CE', 'Grão',     'Norte',    'Danilo'),
    ('CE', 'Pecuária', 'Pecuária', 'Paulo'),
    ('ES', 'Grão',     'Norte',    'Danilo'),
    ('ES', 'Pecuária', 'Pecuária', 'Paulo'),
    ('PB', 'Grão',     'Norte',    'Danilo'),
    ('PB', 'Pecuária', 'Pecuária', 'Paulo'),
    ('PE', 'Grão',     'Norte',    'Danilo'),
    ('PE', 'Pecuária', 'Pecuária', 'Paulo'),
    ('RJ', 'Grão',     'Norte',    'Danilo'),
    ('RJ', 'Pecuária', 'Pecuária', 'Paulo'),
    ('RN', 'Grão',     'Norte',    'Danilo'),
    ('RN', 'Pecuária', 'Pecuária', 'Paulo'),
    -- Órfão Sul (Yuri absorve o Grão direto)
    ('SC', 'Grão',     'Sul',      'Yuri'),
    ('SC', 'Pecuária', 'Pecuária', 'Paulo')
)
insert into public.comercial_atribuicao_responsavel
  (organization_id, territorio_id, linha_negocio_id, coordenacao_id, responsavel, data_inicio)
select (select id from target_org), t.id, l.id, c.id, atrib.responsavel, date '2023-01-01'
from atrib
join t on t.nome = atrib.territorio
join l on l.nome = atrib.linha
join c on c.nome = atrib.coordenacao;

commit;
