begin;

-- Resumo por TIPO (valores) para o box lateral do hero do Painel de Vendas:
-- Peças, Transgrain e Acessórios — SÓ valores (R$). Complementa o painel de
-- maquinas (Grao/Pecuaria) com as linhas que nao entram na contagem de maquinas.
-- Mesma janela de periodo e cenario do comercial_painel_vendas (043).

create or replace function public.comercial_painel_tipos(
  p_org         uuid,
  p_year        integer,
  p_month       integer,
  p_period      text,
  p_scenario_id uuid default null
)
returns table(
  tipo text,
  fat_val numeric, cart_val numeric, meta_val numeric,
  y1_val numeric, y2_val numeric, y3_val numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lo integer;
  v_hi integer;
begin
  if not public.is_org_member(p_org) then
    raise exception 'Usuario sem acesso a organizacao';
  end if;

  v_lo := case when p_period = 'mes' then p_month else 1 end;
  v_hi := case when p_period = 'fy' then 12 else p_month end;

  return query
  with
  fat as (
    select pr.tipo_id, sum(le.valor) as v
    from public.comercial_faturado le
    join public.comercial_produtos pr on pr.id = le.produto_id
    where le.organization_id = p_org and le.reference_year = p_year
      and le.reference_month between v_lo and v_hi
    group by pr.tipo_id
  ),
  cart as (
    select pr.tipo_id, sum(le.valor) as v
    from public.comercial_fat_cart le
    join public.comercial_produtos pr on pr.id = le.produto_id
    where le.organization_id = p_org and le.reference_year = p_year
      and le.reference_month between v_lo and v_hi
    group by pr.tipo_id
  ),
  meta as (
    select pr.tipo_id, sum(le.valor) as v
    from public.comercial_planejado le
    join public.comercial_produtos pr on pr.id = le.produto_id
    where le.organization_id = p_org and le.reference_year = p_year
      and le.reference_month between v_lo and v_hi
      and ((p_scenario_id is null and le.scenario_id is null) or le.scenario_id = p_scenario_id)
    group by pr.tipo_id
  ),
  y1 as (
    select pr.tipo_id, sum(le.valor) as v
    from public.comercial_faturado le
    join public.comercial_produtos pr on pr.id = le.produto_id
    where le.organization_id = p_org and le.reference_year = p_year - 1
      and le.reference_month between v_lo and v_hi
    group by pr.tipo_id
  ),
  y2 as (
    select pr.tipo_id, sum(le.valor) as v
    from public.comercial_faturado le
    join public.comercial_produtos pr on pr.id = le.produto_id
    where le.organization_id = p_org and le.reference_year = p_year - 2
      and le.reference_month between v_lo and v_hi
    group by pr.tipo_id
  ),
  y3 as (
    select pr.tipo_id, sum(le.valor) as v
    from public.comercial_faturado le
    join public.comercial_produtos pr on pr.id = le.produto_id
    where le.organization_id = p_org and le.reference_year = p_year - 3
      and le.reference_month between v_lo and v_hi
    group by pr.tipo_id
  )
  select
    t.nome,
    coalesce(fat.v, 0), coalesce(cart.v, 0), coalesce(meta.v, 0),
    coalesce(y1.v, 0), coalesce(y2.v, 0), coalesce(y3.v, 0)
  from public.comercial_tipos t
  left join fat  on fat.tipo_id  = t.id
  left join cart on cart.tipo_id = t.id
  left join meta on meta.tipo_id = t.id
  left join y1 on y1.tipo_id = t.id
  left join y2 on y2.tipo_id = t.id
  left join y3 on y3.tipo_id = t.id
  where t.organization_id = p_org
    and t.nome in ('Peças', 'Transgrain', 'Acessórios');
end;
$$;

grant execute on function public.comercial_painel_tipos(uuid, integer, integer, text, uuid) to authenticated;

commit;
