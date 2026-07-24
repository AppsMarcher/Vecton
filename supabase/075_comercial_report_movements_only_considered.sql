begin;

-- O detalhe deve ser a mesma população usada no realizado. Linhas retornadas
-- apenas para auditoria (movimento_considerado = false) não são movimentos do
-- ranking e não devem aparecer no popover operacional.
create or replace function public.comercial_filter_considered_movements(
  p_payload jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(item order by ordinality),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(p_payload, '[]'::jsonb))
    with ordinality as rows(item, ordinality)
  where coalesce((item ->> 'movimento_considerado')::boolean, false);
$$;

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_original text;
begin
  v_signature := to_regprocedure(
    'public.comercial_report_movements(uuid,integer,integer,uuid,text)'
  );
  if v_signature is null then
    raise exception 'comercial_report_movements não encontrada. Aplique primeiro a migração 069.';
  end if;

  v_definition := pg_get_functiondef(v_signature);
  v_original := v_definition;
  if position('public.comercial_filter_considered_movements' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'return public.comercial_apply_current_seller_names(v_report.organization_id, v_result);',
      'return public.comercial_apply_current_seller_names(v_report.organization_id, public.comercial_filter_considered_movements(v_result));'
    );
    v_definition := replace(
      v_definition,
      'return v_result;',
      'return public.comercial_filter_considered_movements(v_result);'
    );
  end if;
  if v_definition is distinct from v_original then execute v_definition; end if;
end;
$$;

revoke all on function public.comercial_filter_considered_movements(jsonb) from public;

commit;
