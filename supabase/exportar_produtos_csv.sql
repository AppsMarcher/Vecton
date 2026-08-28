-- Exportacao completa do cadastro de produtos do VectonPlan.
--
-- Como baixar em CSV pelo Supabase:
-- 1. Abra o SQL Editor, cole este arquivo e clique em Run.
-- 2. No resultado da consulta, clique em Export/Download CSV.
--
-- Esta consulta e somente leitura e nao altera nenhum dado.

select
  p.id                         as id_produto,
  p.organization_id            as id_organizacao,
  o.name                       as organizacao,
  p.codigo                     as codigo,
  p.descricao                  as descricao,
  p.nome_reduzido              as nome_reduzido,
  p.tipo_id                    as id_tipo,
  t.nome                       as tipo,
  p.cultura_id                 as id_cultura,
  c.nome                       as cultura,
  p.created_at                 as criado_em,
  p.updated_at                 as atualizado_em
from public.comercial_produtos as p
join public.organizations as o
  on o.id = p.organization_id
join public.comercial_tipos as t
  on t.id = p.tipo_id
 and t.organization_id = p.organization_id
left join public.comercial_culturas as c
  on c.id = p.cultura_id
 and c.organization_id = p.organization_id
order by
  o.name,
  p.codigo;
