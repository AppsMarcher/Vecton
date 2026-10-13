begin;

-- 254: carteira (CART) entra so pelo mes de referencia da consulta.
--
-- Antes: Mes/YTD/Ano somavam o CART de TODOS os meses da janela. Como a
-- carteira dos meses anteriores ja virou FAT nos meses seguintes, o YTD
-- (Fat.+Cart.) contava o mesmo pedido duas vezes (CART de jan + FAT de fev).
--
-- Agora, em qualquer janela (Mes / YTD / Ano):
--   FAT  = soma de todos os meses da janela (inalterado);
--   CART = apenas o "mes da carteira":
--            mes e ytd -> o proprio p_month (ultimo mes da janela);
--            fy        -> ultimo mes com carga de CART no ano (fallback p_month).
-- Assim o painel de agosto continua mostrando a foto da carteira de agosto, e
-- o de outubro a carteira de outubro.
--
-- Aplicado por string-replace nas funcoes vivas (padrao 250/251), para nao
-- sobrescrever patches anteriores (072 etc.). Idempotente.
-- Nao altera: comercial_pecas_geo_evolucao_mensal (serie mes a mes, cada mes ja
-- usa o proprio CART) nem o motor de relatorios comercial_report_* (origens
-- escolhidas pelo usuario na configuracao do relatorio).

create or replace function public.comercial_cart_ref_month(
  p_org    uuid,
  p_year   integer,
  p_month  integer,
  p_period text
)
returns integer
language sql
stable
as $$
  select case
    when p_period = 'fy' then coalesce(
      (select max(le.reference_month)
         from public.comercial_realizado_ledger_entries le
        where le.organization_id = p_org
          and le.reference_year  = p_year
          and le.origem          = 'CART'),
      p_month)
    else p_month
  end;
$$;

grant execute on function public.comercial_cart_ref_month(uuid, integer, integer, text) to authenticated;

do $do$
declare
  r record;
  v_signature  regprocedure;
  v_definition text;
begin
  for r in
    select * from (values
      -- Painel de Vendas (cards por territorio + hero)
      ('public.comercial_painel_vendas(uuid,integer,integer,text,uuid)',
       $q$from public.comercial_fat_cart le$q$,
       $q$from (select x.* from public.comercial_fat_cart x where x.origem = 'FAT' or x.reference_month = (select public.comercial_cart_ref_month(p_org, p_year, p_month, p_period))) le$q$),
      -- Box lateral Pecas / Transgrain / Acessorios
      ('public.comercial_painel_tipos(uuid,integer,integer,text,uuid)',
       $q$from public.comercial_fat_cart le$q$,
       $q$from (select x.* from public.comercial_fat_cart x where x.origem = 'FAT' or x.reference_month = (select public.comercial_cart_ref_month(p_org, p_year, p_month, p_period))) le$q$),
      -- Pecas por vendedor
      ('public.comercial_painel_pecas_vendedor(uuid,integer,integer,text)',
       $q$and le.reference_month between v_lo and v_hi$q$,
       $q$and le.reference_month between v_lo and v_hi
      and (le.origem = 'FAT' or (le.reference_year = p_year and le.reference_month = (select public.comercial_cart_ref_month(p_org, p_year, p_month, p_period))))$q$),
      -- Drill-down (popover do Painel)
      ('public.comercial_painel_detalhe(uuid,integer,integer,text,text[],text[],text,text,text,text)',
       $q$and le.origem = any(p_origens)$q$,
       $q$and le.origem = any(p_origens)
    and (le.origem = 'FAT' or le.reference_month = (select public.comercial_cart_ref_month(p_org, p_year, p_month, p_period)))$q$),
      -- Performance de Pecas (geografica): janelas atual, anterior e YoY
      ('public.comercial_pecas_geo_performance(uuid,integer,integer,text,text,text,text,uuid,text,text)',
       $q$and ((p_revenue_scope in ('nf','nf_cart') and le.origem = 'FAT') or (p_revenue_scope in ('cart','nf_cart') and le.origem = 'CART'))$q$,
       $q$and ((p_revenue_scope in ('nf','nf_cart') and le.origem = 'FAT')
        or (p_revenue_scope in ('cart','nf_cart') and le.origem = 'CART'
          and le.reference_month = case
            when le.reference_year = p_year and le.reference_month between v_lo and v_hi
              then (select public.comercial_cart_ref_month(p_org, p_year, p_month, p_period))
            when le.reference_year = v_prev_year and le.reference_month between v_prev_lo and v_prev_hi
              then (case when p_period = 'mes' then v_prev_lo
                    else (select public.comercial_cart_ref_month(p_org, v_prev_year, p_month, p_period)) end)
            else (select public.comercial_cart_ref_month(p_org, p_year - 1, p_month, p_period))
          end))$q$)
    ) as t(sig, old_txt, new_txt)
  loop
    v_signature := to_regprocedure(r.sig);
    if v_signature is null then raise exception '% nao encontrada', r.sig; end if;
    v_definition := pg_get_functiondef(v_signature);
    if position('comercial_cart_ref_month' in v_definition) = 0 then
      if position(r.old_txt in v_definition) = 0 then
        raise exception 'Estrutura inesperada em %', r.sig;
      end if;
      v_definition := replace(v_definition, r.old_txt, r.new_txt);
      execute v_definition;
    end if;
  end loop;
end $do$;

commit;
