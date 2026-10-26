begin;

-- 311: carteira vigente (estoque de pedidos em aberto), distribuida pelo mes da DATA DE ENTREGA.
--
-- Antes (254): a carteira (CART) era lida de um unico lote (o "mes de referencia") e cada lote era uma foto
-- estanque das entregas daquele mes. Pedido de marco ainda aberto em outubro sumia; YTD/Ano nao mostravam o estoque real.
--
-- Agora o robo grava, no lote do mes corrente, TODA a carteira aberta (qualquer data de entrega). O painel le:
--   FAT  = lotes de cada mes, como sempre (inalterado);
--   CART = somente a "foto vigente" = lote de carteira mais recente que nao seja posterior ao mes corrente do
--          calendario (um lote manual de mes futuro nao vence o mes corrente), com ano/mes reclassificados
--          pela data de entrega. Os filtros Mes/YTD/Ano que ja existiam passam a valer pela data de entrega.
-- Carteira de ano anterior fica so no ano de origem. A comparacao de carteira com periodo/ano anterior
-- (Pecas Geo) deixa de existir (nao ha foto historica comparavel).
--
-- Ordem de implantacao: 311 (esta) -> 312 (validacao aceita data fora do mes so para CART) -> carga do robo.
-- Com os dados de hoje (carteira so com entregas do mes) esta migration nao muda nenhum numero.
-- Reversao: reaplicar as definicoes anteriores das funcoes (migration 254) e dropar a visao.

-- Mes corrente do calendario (YYYYMM) no fuso de Sao Paulo. Funcao propria para os testes poderem fixar a data.
create or replace function public.comercial_cart_ym_corrente()
returns integer
language sql
stable
as $$
  select extract(year  from (now() at time zone 'America/Sao_Paulo'))::integer * 100
       + extract(month from (now() at time zone 'America/Sao_Paulo'))::integer;
$$;

grant execute on function public.comercial_cart_ym_corrente() to authenticated;

-- Ledger = FAT como esta + CART do lote vigente (reference_year/reference_month vem da data de entrega).
create or replace view public.comercial_realizado_ledger_vigente
with (security_invoker = true) as
with vigente as (
  select le.organization_id, max(le.reference_year * 100 + le.reference_month) as ym
  from public.comercial_realizado_ledger_entries le
  where le.origem = 'CART'
    and le.reference_year * 100 + le.reference_month <= public.comercial_cart_ym_corrente()
  group by le.organization_id
)
select
  le.id, le.organization_id, le.batch_id, le.batch_row_id,
  case when le.origem = 'CART' then extract(year  from le.entry_date)::integer else le.reference_year  end as reference_year,
  case when le.origem = 'CART' then extract(month from le.entry_date)::integer else le.reference_month end as reference_month,
  le.entry_date, le.origem, le.produto_id, le.cliente_id, le.territorio_id, le.linha_negocio_id, le.coordenacao_id,
  le.responsavel, le.cod_produto, le.cod_cliente, le.quantidade, le.valor, le.mb_pct, le.source_type,
  le.created_by, le.updated_by, le.created_at, le.updated_at, le.cod_vendedor, le.campanha_atribuicao_id,
  le.campanha_status, le.documento, le.serie_documento, le.rl, le.mp
from public.comercial_realizado_ledger_entries le
left join vigente v on v.organization_id = le.organization_id
where le.origem is distinct from 'CART'
   or le.reference_year * 100 + le.reference_month = v.ym;

revoke all on public.comercial_realizado_ledger_vigente from anon;
revoke insert, update, delete, truncate, references, trigger on public.comercial_realizado_ledger_vigente from authenticated;
grant select on public.comercial_realizado_ledger_vigente to authenticated;

-- @@ PARTE 2: funcoes do painel passam a ler a visao (so no banco real; os testes de visao carregam apenas a parte 1)
-- Um unico bloco DO (sem tabela temporaria): o SQL Editor do Supabase roda cada comando separado, e uma tabela
-- temporaria criada em um comando nao existe no seguinte. Reaplicar o arquivo e seguro (funcoes ja trocadas sao puladas).

do $do$
declare
  v_patches jsonb := jsonb_build_array(
    -- Painel de Vendas (cards por territorio + hero) e box lateral Pecas/Transgrain/Acessorios: "FAT + carteira"
    jsonb_build_object('sig', 'public.comercial_painel_vendas(uuid,integer,integer,text,uuid)', 'ord', 1, 'modo', 'lit',
      'antigo', $q$from (select x.* from public.comercial_fat_cart x where x.origem = 'FAT' or x.reference_month = (select public.comercial_cart_ref_month(p_org, p_year, p_month, p_period))) le$q$,
      'novo',   $q$from public.comercial_realizado_ledger_vigente le$q$),
    jsonb_build_object('sig', 'public.comercial_painel_tipos(uuid,integer,integer,text,uuid)', 'ord', 1, 'modo', 'lit',
      'antigo', $q$from (select x.* from public.comercial_fat_cart x where x.origem = 'FAT' or x.reference_month = (select public.comercial_cart_ref_month(p_org, p_year, p_month, p_period))) le$q$,
      'novo',   $q$from public.comercial_realizado_ledger_vigente le$q$),
    -- Pecas por vendedor: carteira so do ano escolhido (como antes); a janela de meses ja vale pela data de entrega
    jsonb_build_object('sig', 'public.comercial_painel_pecas_vendedor(uuid,integer,integer,text)', 'ord', 1, 'modo', 'lit',
      'antigo', $q$from public.comercial_realizado_ledger_entries le$q$,
      'novo',   $q$from public.comercial_realizado_ledger_vigente le$q$),
    jsonb_build_object('sig', 'public.comercial_painel_pecas_vendedor(uuid,integer,integer,text)', 'ord', 2, 'modo', 'lit',
      'antigo', $q$and (le.origem = 'FAT' or (le.reference_year = p_year and le.reference_month = (select public.comercial_cart_ref_month(p_org, p_year, p_month, p_period))))$q$,
      'novo',   $q$and (le.origem = 'FAT' or le.reference_year = p_year)$q$),
    -- Drill-down (popover do Painel)
    jsonb_build_object('sig', 'public.comercial_painel_detalhe(uuid,integer,integer,text,text[],text[],text,text,text,text)', 'ord', 1, 'modo', 'lit',
      'antigo', $q$from public.comercial_realizado_ledger_entries le$q$,
      'novo',   $q$from public.comercial_realizado_ledger_vigente le$q$),
    jsonb_build_object('sig', 'public.comercial_painel_detalhe(uuid,integer,integer,text,text[],text[],text,text,text,text)', 'ord', 2, 'modo', 'lit',
      'antigo', $q$and (le.origem = 'FAT' or le.reference_month = (select public.comercial_cart_ref_month(p_org, p_year, p_month, p_period)))$q$,
      'novo',   ''),
    -- Performance de Pecas (geografica): carteira so na janela atual (sem comparacao com periodo/ano anterior)
    jsonb_build_object('sig', 'public.comercial_pecas_geo_performance(uuid,integer,integer,text,text,text,text,uuid,text,text)', 'ord', 1, 'modo', 'lit',
      'antigo', $q$from public.comercial_realizado_ledger_entries le$q$,
      'novo',   $q$from public.comercial_realizado_ledger_vigente le$q$),
    jsonb_build_object('sig', 'public.comercial_pecas_geo_performance(uuid,integer,integer,text,text,text,text,uuid,text,text)', 'ord', 2, 'modo', 'rx',
      'antigo', $q$and le\.origem = 'CART'\s+?and le\.reference_month = case.*?end\)\)$q$,
      'novo',   $q$and le.origem = 'CART' and le.reference_year = p_year and le.reference_month between v_lo and v_hi))$q$),
    -- Evolucao mensal de Pecas: a serie mes a mes passa a usar a carteira vigente pelo mes de entrega
    jsonb_build_object('sig', 'public.comercial_pecas_geo_evolucao_mensal(uuid,integer,integer,text,text,text,uuid,text,text)', 'ord', 1, 'modo', 'lit',
      'antigo', $q$from public.comercial_realizado_ledger_entries le$q$,
      'novo',   $q$from public.comercial_realizado_ledger_vigente le$q$)
  );
  r record;
  p jsonb;
  v_signature regprocedure;
  v_def text;
begin
  for r in select distinct e ->> 'sig' as sig from jsonb_array_elements(v_patches) e order by 1 loop
    v_signature := to_regprocedure(r.sig);
    if v_signature is null then raise exception '% nao encontrada', r.sig; end if;
    v_def := replace(pg_get_functiondef(v_signature), E'\r', '');
    if position('comercial_realizado_ledger_vigente' in v_def) = 0 then   -- idempotente
      for p in select e from jsonb_array_elements(v_patches) e where e ->> 'sig' = r.sig order by (e ->> 'ord')::integer loop
        if p ->> 'modo' = 'lit' then
          if position((p ->> 'antigo') in v_def) = 0 then
            raise exception 'Estrutura inesperada em % (trecho %)', r.sig, p ->> 'ord';
          end if;
          v_def := replace(v_def, p ->> 'antigo', p ->> 'novo');
        else
          if v_def !~ (p ->> 'antigo') then
            raise exception 'Estrutura inesperada em % (trecho %)', r.sig, p ->> 'ord';
          end if;
          v_def := regexp_replace(v_def, p ->> 'antigo', p ->> 'novo');
        end if;
      end loop;
      if position('comercial_cart_ref_month' in v_def) > 0 then
        raise exception 'Sobrou comercial_cart_ref_month em %', r.sig;
      end if;
      execute v_def;
    end if;
  end loop;
end $do$;

commit;
