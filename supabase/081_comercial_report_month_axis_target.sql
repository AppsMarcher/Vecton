begin;

-- Bug encontrado ao especificar o template "Desempenho de um vendedor": a
-- exibicao de Meta/Atingimento dependia de v_evaluation (target_reached,
-- highest_attainment, highest_overachievement), criterios que so fazem
-- sentido pro eixo Vendedor em modo campanha. Os templates simplificados
-- gravam evaluation='rank_quantity' (valor de preenchimento, sem ranking real
-- habilitado) — por isso o eixo Mes nunca mostrava Meta, mesmo pedindo
-- Volume/Faturamento com meta cadastrada. Fix: eixo Mes sempre tenta mostrar
-- Meta quando a metrica principal e quantidade/faturamento, independente do
-- criterio de avaliacao (que so importa pro eixo Vendedor).
do $$
declare
  v_signature regprocedure := to_regprocedure(
    'public.comercial_report_compute(uuid,uuid,text,text,text,text,date,date,jsonb,integer,text,integer,integer,uuid)'
  );
  v_definition text;
  v_original text;
  v_old text := 'v_uses_target := v_primary in (''quantity'', ''revenue'') and (v_requires_target or v_evaluation in (
    ''target_reached'', ''highest_attainment'', ''highest_overachievement''
  ));';
  v_new text := 'v_uses_target := v_primary in (''quantity'', ''revenue'') and (v_row_axis = ''month'' or v_requires_target or v_evaluation in (
    ''target_reached'', ''highest_attainment'', ''highest_overachievement''
  ));';
begin
  if v_signature is null then
    raise exception 'comercial_report_compute nao encontrada. Aplique primeiro as migrations 078-080.';
  end if;
  v_definition := pg_get_functiondef(v_signature);
  v_original := v_definition;
  if position(v_old in v_definition) = 0 then
    raise exception 'Estrutura inesperada em comercial_report_compute; correcao 081 nao aplicada.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  if v_definition is distinct from v_original then
    execute v_definition;
  end if;
end;
$$;

commit;
