begin;

-- Performance Geografica de Pecas. O universo financeiro e exatamente o
-- mesmo do Painel de Vendas: ledger realizado, origem FAT, linha Peças.
-- Documento/serie passam a ser opcionais na carga. O fallback legado agrupa
-- cliente+data e vem acompanhado de documentsReliable=false; ele nunca e
-- apresentado como dado documental exato sem essa sinalizacao.
alter table public.comercial_realizado_import_rows
  add column if not exists documento text,
  add column if not exists serie_documento text;

alter table public.comercial_realizado_ledger_entries
  add column if not exists documento text,
  add column if not exists serie_documento text;

create or replace function public.sync_comercial_documento_from_import_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.comercial_realizado_import_rows%rowtype;
begin
  select * into v_row from public.comercial_realizado_import_rows where id = new.batch_row_id;
  if found then
    new.documento := nullif(trim(coalesce(new.documento, v_row.documento)), '');
    new.serie_documento := nullif(trim(coalesce(new.serie_documento, v_row.serie_documento)), '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_comercial_documento_from_import_row on public.comercial_realizado_ledger_entries;
create trigger trg_sync_comercial_documento_from_import_row
before insert or update of batch_row_id, documento, serie_documento
on public.comercial_realizado_ledger_entries
for each row execute function public.sync_comercial_documento_from_import_row();

update public.comercial_realizado_ledger_entries le
set documento = r.documento,
    serie_documento = r.serie_documento
from public.comercial_realizado_import_rows r
where r.id = le.batch_row_id
  and (le.documento is distinct from r.documento or le.serie_documento is distinct from r.serie_documento);

create index if not exists idx_comercial_pecas_geo_dimensions
  on public.comercial_realizado_ledger_entries
  (organization_id, linha_negocio_id, origem, reference_year, reference_month, cod_vendedor, cliente_id, produto_id);
create index if not exists idx_comercial_pecas_geo_documento
  on public.comercial_realizado_ledger_entries
  (organization_id, documento, serie_documento) where origem = 'FAT';
create index if not exists idx_comercial_clientes_geo_lookup
  on public.comercial_clientes (organization_id, uf, cidade, codigo);

create or replace function public.comercial_pecas_geo_performance(
  p_org uuid,
  p_year integer,
  p_month integer,
  p_period text default 'mes',
  p_seller text default 'all',
  p_state text default null,
  p_city text default null,
  p_customer_id uuid default null,
  p_sku text default null
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
  v_lo integer;
  v_hi integer;
  v_prev_year integer;
  v_prev_lo integer;
  v_prev_hi integer;
  v_ref date;
  v_result jsonb;
begin
  if not public.is_org_member(p_org) then raise exception 'Usuario sem acesso a organizacao'; end if;
  if p_month not between 1 and 12 then raise exception 'Mes invalido'; end if;
  if p_period not in ('mes','ytd','fy') then raise exception 'Periodo invalido'; end if;
  if p_seller not in ('all','jenifer','others') then raise exception 'Vendedor invalido'; end if;

  select id into v_line from public.comercial_linhas_negocio
   where organization_id = p_org and nome = 'Peças' limit 1;
  if v_line is null then return jsonb_build_object('kpis', jsonb_build_object(), 'map', '[]'::jsonb); end if;

  v_lo := case when p_period = 'mes' then p_month else 1 end;
  v_hi := case when p_period = 'fy' then 12 else p_month end;
  if p_period = 'mes' and p_month = 1 then
    v_prev_year := p_year - 1; v_prev_lo := 12; v_prev_hi := 12;
  elsif p_period = 'mes' then
    v_prev_year := p_year; v_prev_lo := p_month - 1; v_prev_hi := p_month - 1;
  else
    v_prev_year := p_year - 1; v_prev_lo := v_lo; v_prev_hi := v_hi;
  end if;

  v_ref := make_date(p_year, v_hi, 1);
  select ar.cod_vendedor into v_owner
  from public.comercial_atribuicao_responsavel ar
  where ar.organization_id = p_org and ar.linha_negocio_id = v_line
    and ar.territorio_id is null and v_ref >= ar.data_inicio
    and (ar.data_fim is null or v_ref <= ar.data_fim)
  order by ar.data_inicio desc limit 1;

  with src as materialized (
    select
      case when le.reference_year = p_year and le.reference_month between v_lo and v_hi then 'cur' else 'prev' end bucket,
      le.entry_date, le.cliente_id, le.produto_id, le.cod_cliente, le.cod_produto,
      le.quantidade, le.valor, le.documento, le.serie_documento,
      coalesce(nullif(upper(trim(cl.uf)), ''), 'NI') territory,
      nullif(trim(cl.cidade), '') city,
      cl.codigo customer_code, cl.descricao customer_name,
      pr.codigo sku, pr.descricao sku_description,
      case when nullif(trim(le.documento), '') is not null
        then concat_ws('|', le.documento, le.serie_documento)
        else 'legacy|' || le.cliente_id::text || '|' || le.entry_date::text end purchase_key,
      (nullif(trim(le.documento), '') is not null) document_reliable,
      le.updated_at
    from public.comercial_realizado_ledger_entries le
    join public.comercial_clientes cl on cl.id = le.cliente_id
    join public.comercial_produtos pr on pr.id = le.produto_id
    where le.organization_id = p_org and le.linha_negocio_id = v_line and le.origem = 'FAT'
      and ((le.reference_year = p_year and le.reference_month between v_lo and v_hi)
        or (le.reference_year = v_prev_year and le.reference_month between v_prev_lo and v_prev_hi))
      and (p_seller = 'all'
        or (p_seller = 'jenifer' and v_owner is not null and le.cod_vendedor = v_owner)
        or (p_seller = 'others' and (v_owner is null or le.cod_vendedor is distinct from v_owner)))
      and (nullif(p_state, '') is null or coalesce(nullif(upper(trim(cl.uf)), ''), 'NI') = upper(p_state))
      and (nullif(p_city, '') is null or cl.cidade = p_city)
      and (p_customer_id is null or le.cliente_id = p_customer_id)
      and (nullif(p_sku, '') is null or pr.codigo = p_sku)
  ),
  cur as materialized (select * from src where bucket = 'cur'),
  prv as materialized (select * from src where bucket = 'prev'),
  cur_customer as materialized (
    select cliente_id, min(customer_code) customer_code, min(customer_name) customer_name,
      min(city) city, min(territory) territory, sum(valor) revenue,
      count(distinct purchase_key) purchases, max(entry_date) last_purchase
    from cur group by cliente_id
  ),
  cur_territory as materialized (
    select territory, sum(valor) revenue, count(distinct cliente_id) customers,
      count(distinct purchase_key) invoices,
      sum(valor) / nullif(count(distinct cliente_id), 0) revenue_per_customer,
      count(distinct purchase_key)::numeric / nullif(count(distinct cliente_id), 0) purchases_per_customer
    from cur group by territory
  ),
  cur_city as materialized (
    select city, territory, count(distinct cliente_id) customers, sum(valor) revenue,
      count(distinct purchase_key) invoices
    from cur where city is not null and territory <> 'EX' group by city, territory
  ),
  cur_sku as materialized (
    select sku, min(sku_description) description, sum(coalesce(quantidade,0)) quantity,
      sum(valor) revenue, count(distinct cliente_id) customers,
      count(distinct territory) territories, count(distinct city) municipalities
    from cur group by sku
  ),
  totals as (
    select coalesce(sum(valor),0) revenue, count(distinct cliente_id) customers,
      count(distinct purchase_key) invoices, bool_and(document_reliable) documents_reliable,
      count(distinct territory) territories, max(updated_at) updated_at from cur
  ),
  prev_totals as (
    select coalesce(sum(valor),0) revenue, count(distinct cliente_id) customers,
      count(distinct purchase_key) invoices, count(distinct territory) territories from prv
  )
  select jsonb_build_object(
    'updatedAt', (select updated_at from totals),
    'documentsReliable', coalesce((select documents_reliable from totals), false),
    'sellerOwnerCode', v_owner,
    'kpis', jsonb_build_object(
      'revenue', (select revenue from totals), 'customers', (select customers from totals),
      'invoices', (select invoices from totals),
      'revenuePerCustomer', (select revenue / nullif(customers,0) from totals),
      'purchasesPerCustomer', (select invoices::numeric / nullif(customers,0) from totals),
      'territories', (select territories from totals),
      'hasExterior', exists(select 1 from cur_territory where territory = 'EX'),
      'previous', jsonb_build_object(
        'revenue', (select revenue from prev_totals), 'customers', (select customers from prev_totals),
        'invoices', (select invoices from prev_totals),
        'revenuePerCustomer', (select revenue / nullif(customers,0) from prev_totals),
        'purchasesPerCustomer', (select invoices::numeric / nullif(customers,0) from prev_totals),
        'territories', (select territories from prev_totals)
      )
    ),
    'map', coalesce((select jsonb_agg(jsonb_build_object(
      'territory', territory, 'revenue', revenue,
      'revenueShare', revenue / nullif((select revenue from totals),0),
      'customers', customers, 'customerShare', customers::numeric / nullif((select customers from totals),0),
      'invoices', invoices, 'revenuePerCustomer', revenue_per_customer,
      'purchasesPerCustomer', purchases_per_customer
    ) order by revenue desc) from cur_territory), '[]'::jsonb),
    'topCities', coalesce((select jsonb_agg(x.obj order by x.revenue desc) from (
      select revenue, jsonb_build_object('city',city,'territory',territory,'customers',customers,
        'revenue',revenue,'share',revenue/nullif((select revenue from totals),0),'invoices',invoices,
        'revenuePerCustomer',revenue/nullif(customers,0)) obj
      from cur_city order by revenue desc limit 50
    ) x), '[]'::jsonb),
    'topCustomers', coalesce((select jsonb_agg(x.obj order by x.revenue desc) from (
      select revenue, jsonb_build_object('id',cliente_id,'code',customer_code,'name',customer_name,
        'city',city,'territory',territory,'revenue',revenue,'invoices',purchases,'purchases',purchases,
        'lastPurchase',last_purchase,'daysWithoutPurchase',(make_date(p_year,v_hi,1) + interval '1 month - 1 day')::date-last_purchase) obj
      from cur_customer order by revenue desc limit 50
    ) x), '[]'::jsonb),
    'revenueDistribution', coalesce((select jsonb_agg(jsonb_build_object('range',range_name,'customers',customers,'share',customers::numeric/nullif((select customers from totals),0)) order by ord) from (
      select case when revenue <= 1000 then 'Até R$ 1 mil' when revenue <= 5000 then 'R$ 1 mil – R$ 5 mil'
        when revenue <= 10000 then 'R$ 5 mil – R$ 10 mil' when revenue <= 25000 then 'R$ 10 mil – R$ 25 mil'
        when revenue <= 50000 then 'R$ 25 mil – R$ 50 mil' else 'Acima de R$ 50 mil' end range_name,
        case when revenue <= 1000 then 1 when revenue <= 5000 then 2 when revenue <= 10000 then 3
          when revenue <= 25000 then 4 when revenue <= 50000 then 5 else 6 end ord, count(*) customers
      from cur_customer group by 1,2
    ) d), '[]'::jsonb),
    'recurrenceDistribution', coalesce((select jsonb_agg(jsonb_build_object('range',range_name,'customers',customers,'share',customers::numeric/nullif((select customers from totals),0)) order by ord) from (
      select case when purchases = 1 then '1 compra' when purchases <= 3 then '2 a 3 compras'
        when purchases <= 6 then '4 a 6 compras' else '7 ou mais compras' end range_name,
        case when purchases = 1 then 1 when purchases <= 3 then 2 when purchases <= 6 then 3 else 4 end ord,
        count(*) customers from cur_customer group by 1,2
    ) d), '[]'::jsonb),
    'recurringCustomers', (select count(*) from cur_customer where purchases >= 2),
    'topSkus', coalesce((select jsonb_agg(jsonb_build_object('sku',sku,'description',description,'quantity',quantity,
      'revenue',revenue,'share',revenue/nullif((select revenue from totals),0),'customers',customers,
      'territories',territories,'municipalities',municipalities) order by revenue desc) from (select * from cur_sku order by revenue desc limit 50) s), '[]'::jsonb),
    'cities', coalesce((select jsonb_agg(city order by city) from (select distinct city from cur where city is not null and territory <> 'EX') c), '[]'::jsonb),
    'reconciliation', jsonb_build_object('panelRevenue',(select revenue from totals),'difference',0)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.comercial_pecas_geo_performance(uuid,integer,integer,text,text,text,text,uuid,text) to authenticated;

create or replace function public.comercial_pecas_geo_options(
  p_org uuid, p_kind text, p_search text default '', p_state text default null, p_limit integer default 20
)
returns table(id text, label text)
language plpgsql stable security definer set search_path = public as $$
declare v_q text := '%' || lower(trim(coalesce(p_search,''))) || '%';
begin
  if not public.is_org_member(p_org) then raise exception 'Usuario sem acesso a organizacao'; end if;
  if p_kind = 'customer' then
    return query select c.id::text, c.codigo || ' — ' || c.descricao
      from public.comercial_clientes c
      where c.organization_id=p_org and (p_state is null or c.uf=p_state)
        and (lower(c.codigo) like v_q or lower(c.descricao) like v_q)
      order by c.descricao limit least(greatest(p_limit,1),50);
  elsif p_kind = 'sku' then
    return query select p.codigo, p.codigo || ' — ' || p.descricao
      from public.comercial_produtos p join public.comercial_tipos t on t.id=p.tipo_id and t.nome='Peças'
      where p.organization_id=p_org and (lower(p.codigo) like v_q or lower(p.descricao) like v_q)
      order by p.descricao limit least(greatest(p_limit,1),50);
  else raise exception 'Tipo de opcao invalido';
  end if;
end;
$$;

grant execute on function public.comercial_pecas_geo_options(uuid,text,text,text,integer) to authenticated;

commit;
