begin;

-- 245: acrescenta documento/serie_documento ao retorno (jsonb) de
-- comercial_report_movements -- o popover "Detalhamento dos movimentos" das
-- campanhas Bateu/Levou e Final de Ano lista NF/Pedido por vendedor, mas nao
-- trazia o numero do documento. A coluna ja existe no ledger desde a 122.
--
-- comercial_report_movements retorna jsonb (nao RETURNS TABLE), mas o corpo
-- da funcao foi reescrito em runtime por patches dinamicos anteriores (072 e
-- 075, que usam pg_get_functiondef + replace no `return ...;` final, ao inves
-- de um create or replace estatico) -- reescrever a funcao aqui do zero a
-- partir do texto de uma migration antiga arriscaria descartar esses patches
-- se o texto do arquivo nao bater com o corpo hoje ao vivo no banco. Por isso
-- este ajuste usa a mesma tecnica: le a definicao atual da funcao em runtime
-- e insere as duas novas chaves no jsonb_build_object, preservando o restante
-- do corpo (incluindo os wraps de comercial_apply_current_seller_names e
-- comercial_filter_considered_movements) exatamente como estiver ao vivo.
--
-- A assinatura exata (quantidade/tipos de parametro) mudou entre migrations
-- (069 criou com 5 parametros, 074 recriou com 6, acrescentando p_segment
-- default null) -- por isso a funcao e localizada pelo NOME em pg_proc, sem
-- fixar tipos de parametro, evitando que uma assinatura futura quebre este
-- ajuste de novo.

do $$
declare
  v_oid oid;
  v_count integer;
  v_definition text;
  v_original text;
  v_old_cols text := $marker$'data', l.entry_date,
    'origem', l.origem,$marker$;
  v_new_cols text := $marker$'data', l.entry_date,
    'documento', l.documento,
    'serie_documento', l.serie_documento,
    'origem', l.origem,$marker$;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'comercial_report_movements';

  if v_count = 0 then
    raise exception 'comercial_report_movements não encontrada em public. Aplique primeiro a migração 069.';
  end if;
  if v_count > 1 then
    raise exception 'comercial_report_movements tem % sobrecargas -- resolva manualmente qual versao ajustar.', v_count;
  end if;

  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'comercial_report_movements';

  v_definition := pg_get_functiondef(v_oid);
  v_original := v_definition;

  if position(v_old_cols in v_definition) = 0 then
    raise exception 'comercial_report_movements: padrao de colunas esperado (data/origem) nao encontrado no corpo atual da funcao -- verifique manualmente antes de aplicar.';
  end if;

  v_definition := replace(v_definition, v_old_cols, v_new_cols);

  if v_definition is distinct from v_original then execute v_definition; end if;
end;
$$;

commit;
