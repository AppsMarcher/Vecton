begin;

-- Acrescenta a visão exclusiva de carteira ao relatório geográfico de Peças.
-- Mantém a mesma assinatura da RPC e, portanto, não interrompe clientes antigos.
do $$
declare
  v_function regprocedure := 'public.comercial_pecas_geo_performance(uuid,integer,integer,text,text,text,text,uuid,text,text)'::regprocedure;
  v_before text;
  v_after text;
begin
  v_before := pg_get_functiondef(v_function);
  v_after := replace(
    v_before,
    'if p_revenue_scope not in (''nf'',''nf_cart'') then',
    'if p_revenue_scope not in (''nf'',''cart'',''nf_cart'') then'
  );

  if v_after = v_before then
    raise exception 'Nao foi possivel localizar a validacao de p_revenue_scope';
  end if;

  v_before := v_after;
  v_after := replace(
    v_before,
    'and (le.origem = ''FAT'' or (p_revenue_scope = ''nf_cart'' and le.origem = ''CART''))',
    'and ((p_revenue_scope in (''nf'',''nf_cart'') and le.origem = ''FAT'') or (p_revenue_scope in (''cart'',''nf_cart'') and le.origem = ''CART''))'
  );

  if v_after = v_before then
    raise exception 'Nao foi possivel localizar o filtro de origem da RPC';
  end if;

  execute v_after;
end;
$$;

comment on function public.comercial_pecas_geo_performance(uuid,integer,integer,text,text,text,text,uuid,text,text)
  is 'Performance geografica de Pecas nas visoes nf, cart ou nf_cart.';

commit;
