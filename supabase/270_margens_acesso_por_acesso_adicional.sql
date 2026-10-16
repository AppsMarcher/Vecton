begin;

-- Acessos adicionais (matriz de relatórios) passam a valer para QUALQUER relatório, inclusive os
-- comerciais fixos. O Evolutivo de Margens era o único com trava própria no banco (Super Admin,
-- Admin e Gestor): as duas funções abaixo passam a aceitar também quem recebeu 'comercialMargens'
-- em user_profiles.extra_report_ids. Patch por string-replace na definição viva (padrão da 251),
-- para não sobrescrever as versões 256/258. Idempotente.

do $$
declare
  v_fn record;
  v_def text;
  v_old text := '''manager'' = any(up.additional_access_roles)';
  v_new text := '''manager'' = any(up.additional_access_roles) or ''comercialMargens'' = any(up.extra_report_ids)';
  v_count int := 0;
begin
  for v_fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('comercial_margens_itens', 'comercial_margens_detalhe')
  loop
    v_def := pg_get_functiondef(v_fn.oid);
    if position('comercialMargens' in v_def) > 0 then
      continue; -- já aplicado
    end if;
    if position(v_old in v_def) = 0 then
      raise exception 'Estrutura inesperada em %', v_fn.oid::regprocedure;
    end if;
    execute replace(v_def, v_old, v_new);
    v_count := v_count + 1;
  end loop;
  raise notice 'Funções de margens atualizadas: %', v_count;
end $$;

commit;
