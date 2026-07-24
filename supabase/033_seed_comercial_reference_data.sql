-- Seed dos cadastros de referencia do modulo Comercial: Tipo, Cultura, Linha de
-- Negocio, Coordenacao (com gestor) e Territorio, mais a atribuicao inicial
-- territorio+linha_negocio -> responsavel + coordenacao.
--
-- Fonte: extracao direta das abas Painel (nomes/territorios/coordenacoes) e
-- MATR550 (COORD por territorio) do Razao_MATR550.xlsm.
--
-- Correcoes feitas nesta extracao em relacao ao desenho conversado antes:
-- - "Exportacao" NAO e uma linha_negocio: o card Exportacao tambem se divide
--   em Grao/Pecuaria internamente, igual Sul/Norte/Oeste. Fica só como
--   coordenacao. linhas_negocio = Grao, Pecuaria, Pecas, Outros (4, nao 5).
-- - GO_MG SUL pertence a coordenacao Norte (confirmado pelo COORD bruto da
--   MATR550), apesar do nome sugerir Sul.
-- - Pecas nao tem territorio (Jenifer atende nacionalmente, roteamento e so
--   por Tipo) -> territorio_id vira opcional em comercial_atribuicao_responsavel.
-- - BA-Pecuaria e TO-Pecuaria nao tem nome preenchido na planilha real -> "A definir".
-- - MA_PI combina os territorios MA e PI da MATR550 num só (Claudemir atende os dois).
begin;

alter table public.comercial_atribuicao_responsavel
  alter column territorio_id drop not null;

with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
tipos (nome) as (
  values ('Máquinas'), ('Peças'), ('Transgrain'), ('Acessórios')
)
insert into public.comercial_tipos (organization_id, nome)
select target_org.id, tipos.nome
from tipos cross join target_org
on conflict (organization_id, nome) do nothing;

with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
culturas (nome) as (
  values ('Grãos'), ('Pecuária')
)
insert into public.comercial_culturas (organization_id, nome)
select target_org.id, culturas.nome
from culturas cross join target_org
on conflict (organization_id, nome) do nothing;

with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
linhas (nome) as (
  values ('Grão'), ('Pecuária'), ('Peças'), ('Outros')
)
insert into public.comercial_linhas_negocio (organization_id, nome)
select target_org.id, linhas.nome
from linhas cross join target_org
on conflict (organization_id, nome) do nothing;

with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
coords (nome, gestor) as (
  values
    ('Sul', 'Yuri'),
    ('Norte', 'Danilo'),
    ('Oeste', 'Izaque'),
    ('Pecuária', 'Paulo'),
    ('Exportação', 'Pablo'),
    ('Peças', 'Jenifer')
)
insert into public.comercial_coordenacoes (organization_id, nome, gestor)
select target_org.id, coords.nome, coords.gestor
from coords cross join target_org
on conflict (organization_id, nome) do update set gestor = excluded.gestor;

-- Territorios: usa o valor exato de REGIONAL_MARCHER da MATR550 (chave natural
-- pra futura carga de venda/carteira casar direto), exceto MA_PI que combina
-- dois valores da origem (MA e PI) num só território, por decisão de negócio.
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
territorios (nome) as (
  values
    ('SP'), ('PR'), ('RS SUL'), ('RS NORTE'),
    ('GO_MG SUL'), ('GO_MG NORTE'), ('BA'), ('PA'), ('SEALBA'),
    ('MA_PI'), ('RR'), ('TO'),
    ('MT OESTE'), ('MT CENTRO'), ('MT LESTE'), ('RO'), ('MS'),
    ('EX')
)
insert into public.comercial_territorios (organization_id, nome)
select target_org.id, territorios.nome
from territorios cross join target_org
on conflict (organization_id, nome) do nothing;

-- Atribuição território+linha_negócio -> responsável + coordenação.
-- data_inicio = início da janela de dados da Razão (Parametros!C7), sem data_fim
-- (vigente). Pecuária de Sul/Norte roteia pra coordenação Pecuária (Paulo);
-- Oeste agrega a própria Pecuária direto, sem passar por Paulo.
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
t as (select id, nome from public.comercial_territorios where organization_id = (select id from target_org)),
l as (select id, nome from public.comercial_linhas_negocio where organization_id = (select id from target_org)),
c as (select id, nome from public.comercial_coordenacoes where organization_id = (select id from target_org)),
atrib (territorio, linha, coordenacao, responsavel) as (
  values
    -- Sul
    ('SP',        'Grão',     'Sul',       'André'),
    ('SP',        'Pecuária', 'Pecuária',  'André'),
    ('PR',        'Grão',     'Sul',       'Valtuir'),
    ('PR',        'Pecuária', 'Pecuária',  'Rogerio'),
    ('RS SUL',    'Grão',     'Sul',       'Gustavo'),
    ('RS SUL',    'Pecuária', 'Pecuária',  'Gustavo'),
    ('RS NORTE',  'Grão',     'Sul',       'Caio'),
    ('RS NORTE',  'Pecuária', 'Pecuária',  'Caio'),
    -- Norte
    ('GO_MG NORTE','Grão',     'Norte',    'Rennan'),
    ('GO_MG NORTE','Pecuária', 'Pecuária', 'Rennan'),
    ('GO_MG SUL', 'Grão',     'Norte',     'Renan B.'),
    ('GO_MG SUL', 'Pecuária', 'Pecuária',  'Renan B.'),
    ('BA',        'Grão',     'Norte',     'Peninha'),
    ('BA',        'Pecuária', 'Pecuária',  'A definir'),
    ('MA_PI',     'Grão',     'Norte',     'Claudemir'),
    ('MA_PI',     'Pecuária', 'Pecuária',  'Claudemir'),
    ('TO',        'Grão',     'Norte',     'Gabriel'),
    ('TO',        'Pecuária', 'Pecuária',  'A definir'),
    ('PA',        'Grão',     'Norte',     'Ricardo'),
    ('PA',        'Pecuária', 'Pecuária',  'Ricardo'),
    ('SEALBA',    'Grão',     'Norte',     'Escoura'),
    ('SEALBA',    'Pecuária', 'Pecuária',  'Escoura'),
    ('RR',        'Grão',     'Norte',     'Nabor'),
    ('RR',        'Pecuária', 'Pecuária',  'Nabor'),
    -- Oeste (Pecuária fica direto no Oeste, não passa por Paulo)
    ('MS',        'Grão',     'Oeste',     'Grazian'),
    ('MS',        'Pecuária', 'Oeste',     'Grazian'),
    ('MT CENTRO', 'Grão',     'Oeste',     'João'),
    ('MT CENTRO', 'Pecuária', 'Oeste',     'João'),
    ('MT LESTE',  'Grão',     'Oeste',     'Gleson'),
    ('MT LESTE',  'Pecuária', 'Oeste',     'Gleson'),
    ('MT OESTE',  'Grão',     'Oeste',     'Rodrigo'),
    ('MT OESTE',  'Pecuária', 'Oeste',     'Rodrigo'),
    ('RO',        'Grão',     'Oeste',     'Gustavo'),
    ('RO',        'Pecuária', 'Oeste',     'Gustavo'),
    -- Exportação
    ('EX',        'Grão',     'Exportação','Pablo'),
    ('EX',        'Pecuária', 'Exportação','Pablo')
)
insert into public.comercial_atribuicao_responsavel
  (organization_id, territorio_id, linha_negocio_id, coordenacao_id, responsavel, data_inicio)
select
  (select id from target_org),
  t.id,
  l.id,
  c.id,
  atrib.responsavel,
  date '2023-01-01'
from atrib
join t on t.nome = atrib.territorio
join l on l.nome = atrib.linha
join c on c.nome = atrib.coordenacao;

-- Peças: nacional, sem território (roteamento é só por Tipo=Peças).
with target_org as (
  select id from public.organizations where name = 'Marcher Brasil' limit 1
),
l as (select id from public.comercial_linhas_negocio where organization_id = (select id from target_org) and nome = 'Peças'),
c as (select id from public.comercial_coordenacoes where organization_id = (select id from target_org) and nome = 'Peças')
insert into public.comercial_atribuicao_responsavel
  (organization_id, territorio_id, linha_negocio_id, coordenacao_id, responsavel, data_inicio)
select (select id from target_org), null, l.id, c.id, 'Jenifer', date '2023-01-01'
from l cross join c;

commit;
