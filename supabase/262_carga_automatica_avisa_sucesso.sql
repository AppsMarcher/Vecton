begin;

-- 262: carga automatica de vendas volta a gerar o aviso "Carga de Vendas (realizado) aplicada"
-- (sininho + e-mail, mesmos destinatarios da carga manual, em Parametros > Notificacoes).
--
-- Desfaz o silenciamento da 259 (lotes com notes '[auto]' eram ignorados) e acrescenta
-- " · carga automática" ao texto do aviso quando o lote e do robo.
-- Patch por string-replace na funcao viva (padrao 250/254/259). Idempotente.

do $do$
declare
  v_def       text;
  v_skip      constant text := E'  if coalesce(v_row ->> ''notes'', '''') like ''[auto]%'' then return new; end if;\n';
  v_by        constant text := E'    || case when v_actor_nm is not null then '' · por '' || v_actor_nm else '''' end;';
  v_by_tagged constant text := E'    || case when v_actor_nm is not null then '' · por '' || v_actor_nm else '''' end'
                              || E'\n    || case when coalesce(v_row ->> ''notes'', '''') like ''[auto]%'' then '' · carga automática'' else '''' end;';
begin
  select pg_get_functiondef('public.notify_batch_applied()'::regprocedure) into v_def;

  if position(v_skip in v_def) > 0 then
    v_def := replace(v_def, v_skip, '');
  else
    raise notice '262: silenciamento [auto] ja removido de notify_batch_applied';
  end if;

  if position('carga automática' in v_def) = 0 then
    if position(v_by in v_def) > 0 then
      v_def := replace(v_def, v_by, v_by_tagged);
    else
      raise notice '262: ancora do texto nao encontrada; aviso sai sem a marca "carga automática"';
    end if;
  end if;

  execute v_def;
end;
$do$;

commit;
