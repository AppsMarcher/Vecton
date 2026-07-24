begin;

-- 046: o Painel de Vendas passa a exibir card proprio para territorios com um
-- SLOT dedicado de responsavel marcado como "A definir" (hoje: BA-Pecuaria e
-- TO-Pecuaria), MESMO sem venda/meta no periodo. Sao territorios estabelecidos
-- Marcher, so que ainda sem responsavel nomeado — devem aparecer na tabela da
-- sua coordenacao (Pecuaria/Paulo, pela regra Sul/Norte -> Paulo).
--
-- Territorios ORFAOS (cujo responsavel e o PROPRIO gestor da coordenacao) NAO
-- ganham card: continuam consolidando no gestor. Essa supressao e feita no
-- front (renderDetail), porque o consolidado da coordenacao e somado no cliente
-- a partir das linhas por territorio — o valor do orfao precisa continuar vindo
-- do RPC pra entrar no total, so nao vira card.
--
-- Unica mudanca aqui vs 043: um CTE "slots" que injeta as chaves (coordenacao,
-- territorio, linha) das atribuicoes "A definir" vigentes na janela, com metricas
-- zeradas (LEFT JOIN nos fatos) e responsavel "A definir".

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
  -- Slots "A definir": territorios estabelecidos, sem responsavel nomeado, que
  -- devem ter card mesmo sem movimento no periodo. Vigencia relativa a janela.
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
  keys as (
    select coordenacao_id, territorio_id, linha_negocio_id from fat
    union select coordenacao_id, territorio_id, linha_negocio_id from cart
    union select coordenacao_id, territorio_id, linha_negocio_id from meta
    union select coordenacao_id, territorio_id, linha_negocio_id from y1
    union select coordenacao_id, territorio_id, linha_negocio_id from y2
    union select coordenacao_id, territorio_id, linha_negocio_id from y3
    union select coordenacao_id, territorio_id, linha_negocio_id from slots
  )
  select
    co.nome,
    co.gestor,
    tr.nome,
    coalesce(fat.responsavel, cart.responsavel, meta.responsavel, y1.responsavel, y2.responsavel, y3.responsavel, sl.responsavel),
    ln.nome,
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
  where ln.nome in ('Grão', 'Pecuária', 'Peças');
end;
$$;

grant execute on function public.comercial_painel_vendas(uuid, integer, integer, text, uuid) to authenticated;

commit;
