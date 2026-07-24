begin;

-- 058: card do Painel de Vendas passa a aparecer SEMPRE que existir atribuicao
-- vigente pro territorio+linha, mesmo sem nenhuma venda/carteira/meta/historico
-- no periodo consultado (Mes/YTD/Ano).
--
-- Problema: o CTE 'keys' (047) so incluia uma combinacao coordenacao+territorio+
-- linha quando ELA TINHA DADO (fat/cart/meta/y1/y2/y3) dentro da janela do
-- periodo. Janela "Mes" = 1 mes so; territorio que nao vendeu naquele mes
-- especifico (mas vende em outros meses do ano) sumia do card na aba Mes,
-- e reaparecia na aba YTD/Ano so porque a janela e maior. Nao era bug de
-- carga, era o RPC so materializar linha quando ha fato.
--
-- Fix: novo CTE 'atrib' = TODA atribuicao_responsavel vigente na janela
-- (qualquer responsavel, nao so 'A definir' como o 'slots' da 046/047),
-- entra no UNION do 'keys' e no coalesce do responsavel. Territorio com
-- atribuicao ativa aparece zerado quando nao ha venda -- igual ja acontecia
-- pros slots "A definir". 'slots'/'home' ficam intactos (atrib e fonte
-- adicional, nao substitui).
--
-- Mesma assinatura de retorno da 047 -> create or replace sem DROP.

create or replace function public.comercial_painel_vendas(
  p_org         uuid,
  p_year        integer,
  p_month       integer,
  p_period      text,
  p_scenario_id uuid default null
)
returns table(
  coordenacao text,
  gestor      text,
  territorio  text,
  responsavel text,
  linha       text,
  regiao      text,
  orfao       boolean,
  fat_qtd  numeric, fat_val  numeric,
  cart_qtd numeric, cart_val numeric,
  meta_qtd numeric, meta_val numeric,
  y1_qtd numeric, y1_val numeric,
  y2_qtd numeric, y2_val numeric,
  y3_qtd numeric, y3_val numeric
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
    select le.coordenacao_id, le.territorio_id, le.linha_negocio_id,
           max(le.responsavel) as responsavel,
           sum(le.quantidade) as qtd, sum(le.valor) as val
    from public.comercial_faturado le
    where le.organization_id = p_org
      and le.reference_year = p_year
      and le.reference_month between v_lo and v_hi
    group by le.coordenacao_id, le.territorio_id, le.linha_negocio_id
  ),
  cart as (
    select le.coordenacao_id, le.territorio_id, le.linha_negocio_id,
           max(le.responsavel) as responsavel,
           sum(le.quantidade) as qtd, sum(le.valor) as val
    from public.comercial_fat_cart le
    where le.organization_id = p_org
      and le.reference_year = p_year
      and le.reference_month between v_lo and v_hi
    group by le.coordenacao_id, le.territorio_id, le.linha_negocio_id
  ),
  meta as (
    select le.coordenacao_id, le.territorio_id, le.linha_negocio_id,
           max(le.responsavel) as responsavel,
           sum(le.quantidade) as qtd, sum(le.valor) as val
    from public.comercial_planejado le
    where le.organization_id = p_org
      and le.reference_year = p_year
      and le.reference_month between v_lo and v_hi
      and ((p_scenario_id is null and le.scenario_id is null)
           or le.scenario_id = p_scenario_id)
    group by le.coordenacao_id, le.territorio_id, le.linha_negocio_id
  ),
  y1 as (
    select le.coordenacao_id, le.territorio_id, le.linha_negocio_id,
           max(le.responsavel) as responsavel,
           sum(le.quantidade) as qtd, sum(le.valor) as val
    from public.comercial_faturado le
    where le.organization_id = p_org
      and le.reference_year = p_year - 1
      and le.reference_month between v_lo and v_hi
    group by le.coordenacao_id, le.territorio_id, le.linha_negocio_id
  ),
  y2 as (
    select le.coordenacao_id, le.territorio_id, le.linha_negocio_id,
           max(le.responsavel) as responsavel,
           sum(le.quantidade) as qtd, sum(le.valor) as val
    from public.comercial_faturado le
    where le.organization_id = p_org
      and le.reference_year = p_year - 2
      and le.reference_month between v_lo and v_hi
    group by le.coordenacao_id, le.territorio_id, le.linha_negocio_id
  ),
  y3 as (
    select le.coordenacao_id, le.territorio_id, le.linha_negocio_id,
           max(le.responsavel) as responsavel,
           sum(le.quantidade) as qtd, sum(le.valor) as val
    from public.comercial_faturado le
    where le.organization_id = p_org
      and le.reference_year = p_year - 3
      and le.reference_month between v_lo and v_hi
    group by le.coordenacao_id, le.territorio_id, le.linha_negocio_id
  ),
  slots as (
    select ar.coordenacao_id, ar.territorio_id, ar.linha_negocio_id,
           max(ar.responsavel) as responsavel
    from public.comercial_atribuicao_responsavel ar
    where ar.organization_id = p_org
      and lower(btrim(ar.responsavel)) = 'a definir'
      and ar.data_inicio <= make_date(p_year, v_hi, 1)
      and (ar.data_fim is null or ar.data_fim >= make_date(p_year, v_lo, 1))
    group by ar.coordenacao_id, ar.territorio_id, ar.linha_negocio_id
  ),
  -- NOVO (058): toda atribuicao vigente, qualquer responsavel -> garante que
  -- o territorio+linha sempre gera linha/card, mesmo zerado no periodo.
  atrib as (
    select ar.coordenacao_id, ar.territorio_id, ar.linha_negocio_id,
           max(ar.responsavel) as responsavel
    from public.comercial_atribuicao_responsavel ar
    where ar.organization_id = p_org
      and ar.data_inicio <= make_date(p_year, v_hi, 1)
      and (ar.data_fim is null or ar.data_fim >= make_date(p_year, v_lo, 1))
    group by ar.coordenacao_id, ar.territorio_id, ar.linha_negocio_id
  ),
  -- Casa geografica do territorio = coordenacao da atribuicao de GRAO vigente.
  home as (
    select ar.territorio_id, max(co.nome) as regiao
    from public.comercial_atribuicao_responsavel ar
    join public.comercial_linhas_negocio ln on ln.id = ar.linha_negocio_id and ln.nome = 'Grão'
    join public.comercial_coordenacoes co on co.id = ar.coordenacao_id
    where ar.organization_id = p_org
      and ar.data_inicio <= make_date(p_year, v_hi, 1)
      and (ar.data_fim is null or ar.data_fim >= make_date(p_year, v_lo, 1))
    group by ar.territorio_id
  ),
  keys as (
    select coordenacao_id, territorio_id, linha_negocio_id from fat
    union select coordenacao_id, territorio_id, linha_negocio_id from cart
    union select coordenacao_id, territorio_id, linha_negocio_id from meta
    union select coordenacao_id, territorio_id, linha_negocio_id from y1
    union select coordenacao_id, territorio_id, linha_negocio_id from y2
    union select coordenacao_id, territorio_id, linha_negocio_id from y3
    union select coordenacao_id, territorio_id, linha_negocio_id from slots
    union select coordenacao_id, territorio_id, linha_negocio_id from atrib
  )
  select
    co.nome,
    co.gestor,
    tr.nome,
    coalesce(fat.responsavel, cart.responsavel, meta.responsavel, y1.responsavel, y2.responsavel, y3.responsavel, atrib.responsavel, sl.responsavel),
    ln.nome,
    h.regiao,
    (co.gestor is not null
      and coalesce(fat.responsavel, cart.responsavel, meta.responsavel, y1.responsavel, y2.responsavel, y3.responsavel, atrib.responsavel, sl.responsavel) is not null
      and lower(btrim(coalesce(fat.responsavel, cart.responsavel, meta.responsavel, y1.responsavel, y2.responsavel, y3.responsavel, atrib.responsavel, sl.responsavel)))
          = lower(btrim(co.gestor))) as orfao,
    coalesce(fat.qtd, 0),  coalesce(fat.val, 0),
    coalesce(cart.qtd, 0), coalesce(cart.val, 0),
    coalesce(meta.qtd, 0), coalesce(meta.val, 0),
    coalesce(y1.qtd, 0), coalesce(y1.val, 0),
    coalesce(y2.qtd, 0), coalesce(y2.val, 0),
    coalesce(y3.qtd, 0), coalesce(y3.val, 0)
  from keys k
  join public.comercial_linhas_negocio ln on ln.id = k.linha_negocio_id
  left join public.comercial_coordenacoes co on co.id = k.coordenacao_id
  left join public.comercial_territorios tr on tr.id = k.territorio_id
  left join home h on h.territorio_id = k.territorio_id
  left join fat  on fat.coordenacao_id  is not distinct from k.coordenacao_id
                and fat.territorio_id   is not distinct from k.territorio_id
                and fat.linha_negocio_id = k.linha_negocio_id
  left join cart on cart.coordenacao_id is not distinct from k.coordenacao_id
                and cart.territorio_id  is not distinct from k.territorio_id
                and cart.linha_negocio_id = k.linha_negocio_id
  left join meta on meta.coordenacao_id is not distinct from k.coordenacao_id
                and meta.territorio_id  is not distinct from k.territorio_id
                and meta.linha_negocio_id = k.linha_negocio_id
  left join y1 on y1.coordenacao_id is not distinct from k.coordenacao_id
              and y1.territorio_id  is not distinct from k.territorio_id
              and y1.linha_negocio_id = k.linha_negocio_id
  left join y2 on y2.coordenacao_id is not distinct from k.coordenacao_id
              and y2.territorio_id  is not distinct from k.territorio_id
              and y2.linha_negocio_id = k.linha_negocio_id
  left join y3 on y3.coordenacao_id is not distinct from k.coordenacao_id
              and y3.territorio_id  is not distinct from k.territorio_id
              and y3.linha_negocio_id = k.linha_negocio_id
  left join slots sl on sl.coordenacao_id is not distinct from k.coordenacao_id
                    and sl.territorio_id  is not distinct from k.territorio_id
                    and sl.linha_negocio_id = k.linha_negocio_id
  left join atrib on atrib.coordenacao_id is not distinct from k.coordenacao_id
                  and atrib.territorio_id  is not distinct from k.territorio_id
                  and atrib.linha_negocio_id = k.linha_negocio_id
  where ln.nome in ('Grão', 'Pecuária', 'Peças');
end;
$$;

grant execute on function public.comercial_painel_vendas(uuid, integer, integer, text, uuid) to authenticated;

commit;
