-- 277: O Budget comercial (meta de vendas) deixa de ser "scenario_id nulo" e passa a
-- ser o cenário "Budget {ano}" do repositório de cenários (o mesmo do DRE/Opex).
--
-- Hoje: comercial_planejado_import_batches / comercial_planejado_ledger_entries guardam o
-- Budget com scenario_id = null (a view comercial_planejado só reflete a tabela de ledger).
-- Depois: esses registros passam a apontar para o cenário "Budget {ano}" (criado se faltar).
--
-- As RPCs do painel e dos relatórios (comercial_painel_*, comercial_report_*) já aceitam um
-- cenário qualquer e continuam iguais. A única função que lia o Budget direto como
-- "scenario_id is null" é comercial_pecas_geo_evolucao_mensal; ela passa a ler o cenário
-- "Budget {p_year}".
--
-- Idempotente. ORDEM: aplicar junto do deploy do app (o app novo lista só cenários; o antigo
-- ainda mostra a opção fixa "Budget" = scenario_id nulo, que fica vazia depois desta migration).

begin;

do $$
declare
  rec record;
  v_scenario_id uuid;
begin
  for rec in
    select organization_id, reference_year
      from (
        select organization_id, reference_year from public.comercial_planejado_ledger_entries where scenario_id is null
        union
        select organization_id, reference_year from public.comercial_planejado_import_batches where scenario_id is null
      ) t
     order by 1, 2
  loop
    select id into v_scenario_id
      from public.forecast_scenarios
     where organization_id = rec.organization_id
       and name = 'Budget ' || rec.reference_year;

    if v_scenario_id is null then
      insert into public.forecast_scenarios
        (organization_id, name, color, icon, reference_year, cutoff_month, sort_order)
      values
        (rec.organization_id, 'Budget ' || rec.reference_year, '#0ea5e9', '🎯', rec.reference_year, 0, 0)
      returning id into v_scenario_id;
    end if;

    update public.comercial_planejado_ledger_entries
       set scenario_id = v_scenario_id
     where organization_id = rec.organization_id
       and reference_year = rec.reference_year
       and scenario_id is null;

    update public.comercial_planejado_import_batches
       set scenario_id = v_scenario_id
     where organization_id = rec.organization_id
       and reference_year = rec.reference_year
       and scenario_id is null;

    raise notice 'Budget comercial % -> cenário %', rec.reference_year, v_scenario_id;
  end loop;
end;
$$;

-- Evolução mensal de Peças: a meta vem do cenário "Budget {p_year}" (antes: scenario_id nulo).
create or replace function public.comercial_pecas_geo_evolucao_mensal(
  p_org uuid,
  p_year integer,
  p_month integer,
  p_seller text default 'all'::text,
  p_state text default null::text,
  p_city text default null::text,
  p_customer_id uuid default null::uuid,
  p_sku text default null::text,
  p_revenue_scope text default 'nf'::text
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_line uuid;
  v_owner text;
  v_ref date;
  v_prev_year integer;
  v_budget_scenario uuid;
  v_result jsonb;
begin
  if not public.is_org_member(p_org) then raise exception 'Usuario sem acesso a organizacao'; end if;
  if p_month not between 1 and 12 then raise exception 'Mes invalido'; end if;
  if p_seller not in ('all','jenifer','others') then raise exception 'Vendedor invalido'; end if;
  if p_revenue_scope not in ('nf','cart','nf_cart') then raise exception 'Escopo de faturamento invalido'; end if;

  select id into v_line from public.comercial_linhas_negocio
   where organization_id = p_org and nome = 'Peças' limit 1;
  if v_line is null then
    return jsonb_build_object('year', p_year, 'previousYear', p_year - 1, 'months', '[]'::jsonb);
  end if;

  select fs.id into v_budget_scenario
    from public.forecast_scenarios fs
   where fs.organization_id = p_org and fs.name = 'Budget ' || p_year
   limit 1;

  v_prev_year := p_year - 1;
  v_ref := make_date(p_year, p_month, 1);
  select ar.cod_vendedor into v_owner
  from public.comercial_atribuicao_responsavel ar
  where ar.organization_id = p_org and ar.linha_negocio_id = v_line
    and ar.territorio_id is null and v_ref >= ar.data_inicio
    and (ar.data_fim is null or v_ref <= ar.data_fim)
  order by ar.data_inicio desc limit 1;

  with src as materialized (
    select le.reference_year, le.reference_month, le.valor
    from public.comercial_realizado_ledger_entries le
    join public.comercial_clientes cl on cl.id = le.cliente_id
    join public.comercial_produtos pr on pr.id = le.produto_id
    where le.organization_id = p_org and le.linha_negocio_id = v_line
      and ((p_revenue_scope in ('nf','nf_cart') and le.origem = 'FAT') or (p_revenue_scope in ('cart','nf_cart') and le.origem = 'CART'))
      and ((le.reference_year = p_year and le.reference_month between 1 and p_month)
        or (le.reference_year = v_prev_year and le.reference_month between 1 and p_month))
      and (p_seller = 'all'
        or (p_seller = 'jenifer' and v_owner is not null and le.cod_vendedor = v_owner)
        or (p_seller = 'others' and (v_owner is null or le.cod_vendedor is distinct from v_owner)))
      and (nullif(p_state, '') is null or coalesce(nullif(upper(trim(cl.uf)), ''), 'NI') = upper(p_state))
      and (nullif(p_city, '') is null or cl.cidade = p_city)
      and (p_customer_id is null or le.cliente_id = p_customer_id)
      and (nullif(p_sku, '') is null or pr.codigo = p_sku)
  ),
  monthly as (
    select reference_year, reference_month, sum(valor) revenue
    from src group by reference_year, reference_month
  ),
  meta as materialized (
    select le.reference_month, sum(le.valor) meta
    from public.comercial_planejado_ledger_entries le
    join public.comercial_produtos pr on pr.id = le.produto_id
    join public.comercial_tipos t on t.id = pr.tipo_id
    where le.organization_id = p_org and t.nome = 'Peças'
      and le.scenario_id = v_budget_scenario
      and le.reference_year = p_year and le.reference_month between 1 and p_month
    group by le.reference_month
  ),
  series as (
    select gs.m from generate_series(1, p_month) as gs(m)
  )
  select jsonb_build_object(
    'year', p_year,
    'previousYear', v_prev_year,
    'months', coalesce((select jsonb_agg(jsonb_build_object(
      'month', s.m,
      'revenueCurrent', coalesce((select m.revenue from monthly m where m.reference_year = p_year and m.reference_month = s.m), 0),
      'revenuePrevious', coalesce((select m.revenue from monthly m where m.reference_year = v_prev_year and m.reference_month = s.m), 0),
      'meta', coalesce((select mt.meta from meta mt where mt.reference_month = s.m), 0)
    ) order by s.m) from series s), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

commit;
