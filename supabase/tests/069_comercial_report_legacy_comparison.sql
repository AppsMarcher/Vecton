-- Comparacao somente leitura entre os cards legados e os presets novos.
-- Ajuste os tres valores de params para o periodo/cenario que deseja validar.
-- Execute autenticado no SQL Editor ou em uma sessao com auth.uid() configurado.

with params as (
  select 2026::integer as ano, 7::integer as mes, null::uuid as scenario_id
), org as (
  select up.organization_id
  from public.user_profiles up
  where up.user_id = auth.uid()
  limit 1
), definition as (
  select d.id
  from public.comercial_report_definitions d, org
  where d.organization_id = org.organization_id and d.slug = 'bateu-levou'
), legacy as (
  select split_part(x.responsavel, ' - ', 1) as cod_vendedor,
         case when x.linha = 'Grão' then 'Grãos' else x.linha end as segmento,
         x.real_qtd, x.meta_qtd
  from org, params,
       lateral public.comercial_bateu_levou(org.organization_id, params.ano, params.mes, params.scenario_id) x
), payload as (
  select public.comercial_report_execute(
    definition.id, params.ano, params.mes, params.scenario_id, false
  ) as value
  from definition, params
), novo as (
  select r.cod_vendedor, r.segment as segmento,
         r.quantity as real_qtd, r.target as meta_qtd
  from payload,
       lateral jsonb_to_recordset(payload.value->'rows') as r(
         cod_vendedor text, segment text, quantity numeric, target numeric
       )
)
select 'Bateu, Levou' as relatorio,
       coalesce(l.cod_vendedor, n.cod_vendedor) as cod_vendedor,
       coalesce(l.segmento, n.segmento) as segmento,
       l.real_qtd as legado_real, n.real_qtd as novo_real,
       l.meta_qtd as legado_meta, n.meta_qtd as novo_meta,
       coalesce(n.real_qtd, 0) - coalesce(l.real_qtd, 0) as diferenca_real,
       coalesce(n.meta_qtd, 0) - coalesce(l.meta_qtd, 0) as diferenca_meta
from legacy l
full join novo n using (cod_vendedor, segmento)
where coalesce(l.real_qtd, 0) <> coalesce(n.real_qtd, 0)
   or coalesce(l.meta_qtd, 0) <> coalesce(n.meta_qtd, 0)
order by 2, 3;

with params as (
  select 2026::integer as ano, 7::integer as mes, null::uuid as scenario_id
), org as (
  select up.organization_id
  from public.user_profiles up
  where up.user_id = auth.uid()
  limit 1
), definition as (
  select d.id
  from public.comercial_report_definitions d, org
  where d.organization_id = org.organization_id and d.slug = 'final-ano-2026'
), legacy as (
  select split_part(x.responsavel, ' - ', 1) as cod_vendedor,
         x.real_val, x.meta_val
  from org, params,
       lateral public.comercial_final_de_ano(org.organization_id, params.ano, params.mes, params.scenario_id) x
), payload as (
  select public.comercial_report_execute(
    definition.id, params.ano, params.mes, params.scenario_id, false
  ) as value
  from definition, params
), novo as (
  select r.cod_vendedor, r.revenue as real_val, r.target as meta_val
  from payload,
       lateral jsonb_to_recordset(payload.value->'rows') as r(
         cod_vendedor text, revenue numeric, target numeric
       )
)
select 'Meta de Final de Ano' as relatorio,
       coalesce(l.cod_vendedor, n.cod_vendedor) as cod_vendedor,
       l.real_val as legado_real, n.real_val as novo_real,
       l.meta_val as legado_meta, n.meta_val as novo_meta,
       coalesce(n.real_val, 0) - coalesce(l.real_val, 0) as diferenca_real,
       coalesce(n.meta_val, 0) - coalesce(l.meta_val, 0) as diferenca_meta
from legacy l
full join novo n using (cod_vendedor)
where coalesce(l.real_val, 0) <> coalesce(n.real_val, 0)
   or coalesce(l.meta_val, 0) <> coalesce(n.meta_val, 0)
order by 2;
