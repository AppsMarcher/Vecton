begin;

-- 087: quebra do detalhe de PEÇAS por vendedor no Painel de Vendas.
--
-- Peças roteia NACIONALMENTE (039): toda linha cai na coordenacao Peças, com
-- responsavel unico. Por isso o card e o box lateral ja mostram 100% das pecas
-- e continuam mostrando — esta migration NAO muda roteamento nem totais.
--
-- O que ela adiciona e so uma LEITURA: separar o realizado de pecas entre o
-- titular da atribuicao nacional (hoje a Jenifer) e "demais", usando o
-- cod_vendedor que vem NA PLANILHA de carga (coluna adicionada na 064).
--
-- Identidade do titular NAO e hardcoded: sai do cod_vendedor da propria
-- atribuicao nacional de Pecas vigente na janela (a 064 seedou '000633' ali).
-- Se essa atribuicao nao tiver cod_vendedor, v_owner fica nulo e TUDO cai em
-- "demais" — estado visivel na tela, em vez de um numero errado silencioso.
--
-- ATENCAO (dado, nao codigo): cod_vendedor no ledger vem da planilha e e
-- OPCIONAL na carga. Linhas de pecas carregadas antes da 064, ou sem a coluna
-- preenchida, ficam com cod_vendedor nulo e caem em "demais" por definicao
-- (decisao do usuario). Ver supabase/_diag_seller_cod_vendedor_pecas.sql para
-- medir quanto do faturamento de pecas esta nessa situacao antes de tirar
-- conclusao da tela.
--
-- Meta NAO e quebrada de proposito: a meta de pecas e nacional e unica. O
-- cliente reaproveita a meta consolidada na tabela do titular (decisao do
-- usuario: "so na jenifer, que e a mesma do total") e deixa "demais" sem meta.

create or replace function public.comercial_painel_pecas_vendedor(
  p_org    uuid,
  p_year   integer,
  p_month  integer,
  p_period text
)
returns table(
  bucket       text,      -- 'titular' | 'demais'
  cod_vendedor text,      -- preenchido so no titular
  vendedor     text,      -- nome para o rotulo da tabela
  fat_val      numeric,   -- Faturado (origem = FAT)
  cart_val     numeric,   -- Fat.+Cart. (todo o ledger, ja combinado)
  y1_val       numeric,
  y2_val       numeric,
  y3_val       numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lo         integer;
  v_hi         integer;
  v_linha      uuid;
  v_owner      text;
  v_owner_nome text;
  v_ref        date;
begin
  if not public.is_org_member(p_org) then
    raise exception 'Usuario sem acesso a organizacao';
  end if;

  -- Mesma janela de periodo dos outros RPCs do painel (043/044).
  v_lo := case when p_period = 'mes' then p_month else 1 end;
  v_hi := case when p_period = 'fy'  then 12      else p_month end;

  select ln.id
    into v_linha
  from public.comercial_linhas_negocio ln
  where ln.organization_id = p_org
    and ln.nome = 'Peças';

  if v_linha is null then
    return;   -- organizacao sem a linha Pecas: nada a quebrar
  end if;

  -- Titular = cod_vendedor da atribuicao NACIONAL (territorio nulo) de Pecas
  -- vigente no fim da janela consultada.
  v_ref := make_date(p_year, v_hi, 1);
  select ar.cod_vendedor
    into v_owner
  from public.comercial_atribuicao_responsavel ar
  where ar.organization_id = p_org
    and ar.linha_negocio_id = v_linha
    and ar.territorio_id is null
    and v_ref >= ar.data_inicio
    and (ar.data_fim is null or v_ref <= ar.data_fim)
  order by ar.data_inicio desc
  limit 1;

  if v_owner is not null then
    select v.nome
      into v_owner_nome
    from public.comercial_vendedores v
    where v.organization_id = p_org
      and v.codigo = v_owner;
  end if;

  return query
  with src as (
    select
      case when v_owner is not null and le.cod_vendedor = v_owner
           then 'titular' else 'demais' end as bkt,
      le.reference_year as yr,
      (le.origem = 'FAT') as is_fat,
      le.valor           as valor
    from public.comercial_realizado_ledger_entries le
    where le.organization_id  = p_org
      and le.linha_negocio_id = v_linha
      and le.reference_month between v_lo and v_hi
      and le.reference_year in (p_year, p_year - 1, p_year - 2, p_year - 3)
  )
  select
    b.bkt,
    case when b.bkt = 'titular' then v_owner end,
    case when b.bkt = 'titular'
         then coalesce(v_owner_nome, 'Titular de Peças')
         else 'Demais' end,
    coalesce(sum(s.valor) filter (where s.yr = p_year     and s.is_fat), 0)::numeric,
    coalesce(sum(s.valor) filter (where s.yr = p_year),                  0)::numeric,
    coalesce(sum(s.valor) filter (where s.yr = p_year - 1 and s.is_fat), 0)::numeric,
    coalesce(sum(s.valor) filter (where s.yr = p_year - 2 and s.is_fat), 0)::numeric,
    coalesce(sum(s.valor) filter (where s.yr = p_year - 3 and s.is_fat), 0)::numeric
  from (values ('titular'), ('demais')) as b(bkt)
  left join src s on s.bkt = b.bkt
  group by b.bkt
  order by b.bkt desc;   -- 'titular' antes de 'demais'
end;
$$;

grant execute on function public.comercial_painel_pecas_vendedor(uuid, integer, integer, text) to authenticated;

commit;
