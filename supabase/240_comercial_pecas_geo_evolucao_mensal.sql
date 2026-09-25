begin;

-- Evolução mensal de Peças para a Performance Geográfica: série Jan..mês
-- atual do ano corrente comparada ao mesmo intervalo do ano anterior.
-- Reaproveita exatamente a mesma lógica de filtros (vendedor, UF, município,
-- cliente, SKU, escopo NFs/Carteira) da comercial_pecas_geo_performance,
-- porém agrupando por mês em vez de somar num único período.
create or replace function public.comercial_pecas_geo_evolucao_mensal(
  p_org uuid,
  p_year integer,
  p_month integer,
  p_seller text default 'all',
  p_state text default null,
  p_city text default null,
  p_customer_id uuid default null,
  p_sku text default null,
  p_revenue_scope text default 'nf'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_line uuid;
  v_owner text;
  v_ref date;
  v_prev_year integer;
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
  series as (
    select gs.m from generate_series(1, p_month) as gs(m)
  )
  select jsonb_build_object(
    'year', p_year,
    'previousYear', v_prev_year,
    'months', coalesce((select jsonb_agg(jsonb_build_object(
      'month', s.m,
      'revenueCurrent', coalesce((select m.revenue from monthly m where m.reference_year = p_year and m.reference_month = s.m), 0),
      'revenuePrevious', coalesce((select m.revenue from monthly m where m.reference_year = v_prev_year and m.reference_month = s.m), 0)
    ) order by s.m) from series s), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.comercial_pecas_geo_evolucao_mensal(uuid,integer,integer,text,text,text,uuid,text,text) to authenticated;

commit;
