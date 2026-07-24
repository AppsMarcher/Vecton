begin;

-- Campanha mensal: FAT e meta são vinculados ao vendedor por código.
-- A venda usa o snapshot de atribuição gravado na importação; a meta é
-- associada à atribuição territorial vigente no mês do planejamento.
create or replace function public.comercial_bateu_levou(
  p_org uuid, p_year integer, p_month integer, p_scenario_id uuid default null
) returns table(responsavel text, linha text, territorios text, real_qtd numeric, meta_qtd numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_org_member(p_org) then raise exception 'Usuario sem acesso a organizacao'; end if;
  return query
  with real as (
    select l.cod_vendedor, ar.responsavel, ln.nome as linha, ar.territorio_id, sum(l.quantidade) as qtd
    from public.comercial_realizado_ledger_entries l
    join public.comercial_atribuicao_responsavel ar on ar.id = l.campanha_atribuicao_id
    join public.comercial_linhas_negocio ln on ln.id = l.linha_negocio_id
    where l.organization_id=p_org and l.reference_year=p_year and l.reference_month=p_month
      and l.origem='FAT' and l.campanha_status='valida' and coalesce(ar.elegivel_campanha, true)
      and ln.nome in ('Grão','Pecuária')
    group by l.cod_vendedor, ar.responsavel, ln.nome, ar.territorio_id
  ), meta as (
    select ar.cod_vendedor, ar.responsavel, ln.nome as linha, ar.territorio_id, sum(m.quantidade) as qtd
    from public.comercial_planejado m
    join public.comercial_linhas_negocio ln on ln.id=m.linha_negocio_id
    join lateral (
      select a.* from public.comercial_atribuicao_responsavel a
       where a.organization_id=p_org and a.territorio_id=m.territorio_id and a.linha_negocio_id=m.linha_negocio_id
         and make_date(p_year,p_month,1) >= a.data_inicio and (a.data_fim is null or make_date(p_year,p_month,1) <= a.data_fim)
       order by a.data_inicio desc limit 1
    ) ar on true
    where m.organization_id=p_org and m.reference_year=p_year and m.reference_month=p_month
      and ln.nome in ('Grão','Pecuária') and ar.cod_vendedor is not null and coalesce(ar.elegivel_campanha, true)
      and ((p_scenario_id is null and m.scenario_id is null) or m.scenario_id=p_scenario_id)
    group by ar.cod_vendedor, ar.responsavel, ln.nome, ar.territorio_id
  ), all_rows as (
    select cod_vendedor, responsavel, linha, territorio_id, qtd, 0::numeric as meta_qtd from real
    union all
    select cod_vendedor, responsavel, linha, territorio_id, 0::numeric, qtd from meta
  ), agg as (
    select cod_vendedor, max(responsavel) as nome, linha,
      string_agg(distinct t.nome, ', ' order by t.nome) as territorios, sum(qtd) as real_qtd, sum(meta_qtd) as meta_qtd
    from all_rows x left join public.comercial_territorios t on t.id=x.territorio_id
    group by cod_vendedor, linha
  )
  select a.cod_vendedor || ' - ' || coalesce(v.nome,a.nome,a.cod_vendedor), a.linha, a.territorios, a.real_qtd, a.meta_qtd
  from agg a join public.comercial_vendedores v on v.organization_id=p_org and v.codigo=a.cod_vendedor and v.situacao='ativo'
  order by a.linha, 1;
end; $$;

-- Campanha anual: somente FAT no realizado, acumulado no ano. A chave de
-- agrupamento é o código; assim homônimos nunca se misturam e cidade/UF não
-- participa da escolha da regional comercial.
create or replace function public.comercial_final_de_ano(
  p_org uuid, p_year integer, p_month integer, p_scenario_id uuid default null
) returns table(responsavel text, territorios text, real_val numeric, meta_val numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_org_member(p_org) then raise exception 'Usuario sem acesso a organizacao'; end if;
  return query
  with real as (
    select l.cod_vendedor, ar.responsavel, ar.territorio_id, sum(l.valor) val
    from public.comercial_realizado_ledger_entries l join public.comercial_atribuicao_responsavel ar on ar.id=l.campanha_atribuicao_id
    where l.organization_id=p_org and l.reference_year=p_year and l.reference_month<=p_month
      and l.origem='FAT' and l.campanha_status='valida' and ar.cod_vendedor <> '000633'
    group by l.cod_vendedor,ar.responsavel,ar.territorio_id
  ), meta as (
    select ar.cod_vendedor, ar.responsavel, ar.territorio_id, sum(m.valor) val
    from public.comercial_planejado m
    join lateral (
      select a.* from public.comercial_atribuicao_responsavel a
       where a.organization_id=p_org and a.territorio_id=m.territorio_id and a.linha_negocio_id=m.linha_negocio_id
         and make_date(m.reference_year,m.reference_month,1)>=a.data_inicio and (a.data_fim is null or make_date(m.reference_year,m.reference_month,1)<=a.data_fim)
       order by a.data_inicio desc limit 1
    ) ar on true
    where m.organization_id=p_org and m.reference_year=p_year and m.reference_month<=p_month
      and ar.cod_vendedor is not null and ar.cod_vendedor <> '000633'
      and ((p_scenario_id is null and m.scenario_id is null) or m.scenario_id=p_scenario_id)
    group by ar.cod_vendedor,ar.responsavel,ar.territorio_id
  ), all_rows as (
    select cod_vendedor,responsavel,territorio_id,val,0::numeric meta_val from real
    union all select cod_vendedor,responsavel,territorio_id,0::numeric,val from meta
  ), agg as (
    select x.cod_vendedor,max(x.responsavel) nome,string_agg(distinct t.nome,', ' order by t.nome) territorios,sum(x.val) real_val,sum(x.meta_val) meta_val
    from all_rows x left join public.comercial_territorios t on t.id=x.territorio_id group by x.cod_vendedor
  )
  select a.cod_vendedor || ' - ' || coalesce(v.nome,a.nome,a.cod_vendedor),a.territorios,a.real_val,a.meta_val
  from agg a join public.comercial_vendedores v on v.organization_id=p_org and v.codigo=a.cod_vendedor and v.situacao='ativo' order by 1;
end; $$;

-- Auditoria consultável: cada linha FAT sem chave/vigência é explicitamente
-- classificada, em vez de ser transferida para um substituto ou território geográfico.
create or replace function public.comercial_campanhas_pendencias(
  p_org uuid, p_year integer, p_month integer
) returns table(entry_date date, cod_vendedor text, cod_produto text, cod_cliente text, quantidade numeric, valor numeric, classificacao text)
language sql stable security definer set search_path = public as $$
  select entry_date,cod_vendedor,cod_produto,cod_cliente,quantidade,valor,'SEM ATRIBUIÇÃO VÁLIDA'::text
  from public.comercial_realizado_ledger_entries
  where organization_id=p_org and reference_year=p_year and reference_month<=p_month
    and origem='FAT' and campanha_status='sem_atribuicao_valida'
  order by entry_date,cod_vendedor;
$$;
grant execute on function public.comercial_campanhas_pendencias(uuid,integer,integer) to authenticated;

commit;
