begin;

-- Bug: quando o usuario seleciona mais de uma metrica (Volume+Faturamento+
-- Margem) no template "Desempenho de um vendedor", o front so tinha como
-- mostrar 1 metrica por linha, porque o motor so devolvia 'target' (meta) da
-- METRICA PRINCIPAL, nao das complementares. As colunas target_quantity/
-- target_revenue ja eram calculadas na CTE joined da branch row_axis=month,
-- so nunca chegavam ao JSON de saida. Patch cirurgico: adiciona as duas no
-- jsonb_build_object da linha, sem mexer em mais nada.
do $$
declare
  v_signature regprocedure := to_regprocedure(
    'public.comercial_report_compute(uuid,uuid,text,text,text,text,date,date,jsonb,integer,text,integer,integer,uuid)'
  );
  v_definition text;
  v_original text;
  v_old text := '        ''row_key'', f.row_key, ''label'', f.label,
        ''quantity'', f.quantity, ''revenue'', f.revenue, ''margin'', f.margin,
        ''realized'', f.realized, ''target'', f.target, ''attainment_pct'', f.attainment_pct';
  v_new text := '        ''row_key'', f.row_key, ''label'', f.label,
        ''quantity'', f.quantity, ''revenue'', f.revenue, ''margin'', f.margin,
        ''target_quantity'', f.target_quantity, ''target_revenue'', f.target_revenue,
        ''realized'', f.realized, ''target'', f.target, ''attainment_pct'', f.attainment_pct';
begin
  if v_signature is null then
    raise exception 'comercial_report_compute nao encontrada. Aplique primeiro as migrations 078-082.';
  end if;
  v_definition := pg_get_functiondef(v_signature);
  v_original := v_definition;
  if position(v_old in v_definition) = 0 then
    raise exception 'Estrutura inesperada em comercial_report_compute; correcao 083 nao aplicada.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  if v_definition is distinct from v_original then
    execute v_definition;
  end if;
end;
$$;

commit;
