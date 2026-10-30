-- Formularios de Planejamento: selecionar "Marcher" (todos os CCs, hoje 131) falhava com
-- "Centro de custo fora do escopo" porque a leitura aceitava no maximo 100 CCs por chamada.
-- O limite sobe para 1000; a checagem de escopo (CCs que a pessoa enxerga) continua igual.
begin;

do $$
declare fn text; def text;
begin
  foreach fn in array array['public.planning_read_form(uuid,uuid,uuid[])','public.planning_capex_read(uuid,uuid,uuid[],jsonb)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    if position('cardinality(p_cc_ids)>100' in def) > 0 then
      execute replace(def, 'cardinality(p_cc_ids)>100', 'cardinality(p_cc_ids)>1000');
    end if;
  end loop;
end $$;

commit;
