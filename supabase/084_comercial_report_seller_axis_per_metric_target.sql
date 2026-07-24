begin;

-- Mesmo bug do 083, agora no eixo Vendedor: quando o usuario seleciona mais
-- de uma metrica (Volume+Faturamento+Margem) no template "Comparativo do
-- time", so a metrica principal tinha Meta/Var% — as complementares so
-- tinham o valor realizado (quantity/revenue/margin), porque 'target' e
-- 'overachievement_pct' na linha sempre foram calculados so pra v_primary.
-- target_quantity/target_revenue ja existiam na CTE combined/metrics/scored/
-- final_rows, so nunca chegavam ao JSON de saida. Patch cirurgico: adiciona
-- as duas no jsonb_build_object da linha, sem mexer em mais nada.
do $$
declare
  v_signature regprocedure := to_regprocedure(
    'public.comercial_report_compute(uuid,uuid,text,text,text,text,date,date,jsonb,integer,text,integer,integer,uuid)'
  );
  v_definition text;
  v_original text;
  v_old text := '          ''quantity'', f.real_quantity,
          ''revenue'', f.real_revenue,
          ''margin'', f.real_margin,';
  v_new text := '          ''quantity'', f.real_quantity,
          ''revenue'', f.real_revenue,
          ''margin'', f.real_margin,
          ''target_quantity'', f.target_quantity,
          ''target_revenue'', f.target_revenue,';
begin
  if v_signature is null then
    raise exception 'comercial_report_compute nao encontrada. Aplique primeiro as migrations 078-083.';
  end if;
  v_definition := pg_get_functiondef(v_signature);
  v_original := v_definition;
  if position(v_old in v_definition) = 0 then
    raise exception 'Estrutura inesperada em comercial_report_compute; correcao 084 nao aplicada.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  if v_definition is distinct from v_original then
    execute v_definition;
  end if;
end;
$$;

commit;
