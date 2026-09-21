BEGIN;
ALTER TABLE public.fc_scenarios ADD COLUMN is_shared boolean NOT NULL DEFAULT false;
-- Cenários existentes: classificar conforme o perfil atual de seu criador.
UPDATE public.fc_scenarios s SET is_shared=true WHERE EXISTS (
 SELECT 1 FROM public.user_profiles p WHERE p.organization_id=s.organization_id AND p.user_id=s.created_by
 AND (p.access_role IN ('admin','super_admin') OR p.additional_access_roles && ARRAY['admin','super_admin']::text[])
);
DROP POLICY "Own FC scenarios" ON public.fc_scenarios;
CREATE POLICY "Visible FC scenarios" ON public.fc_scenarios FOR SELECT TO authenticated
 USING ((created_by=auth.uid() OR is_shared) AND public.can_read_fc(organization_id));
-- Visibilidade definida no salvamento pelo servidor, nunca pelo payload do cliente.
CREATE OR REPLACE FUNCTION public.save_fc_scenario(target_org uuid, payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE base jsonb; batch public.fc_import_batches; source public.fc_scenarios; node jsonb; vals jsonb; quantities jsonb;
 movements jsonb := '{}'::jsonb; keys integer:=0; i integer; value numeric; original numeric; result uuid; filename text;
BEGIN
 IF NOT public.can_read_fc(target_org) THEN RAISE EXCEPTION 'Sem permissão para simular Fluxo de Caixa.'; END IF;
 IF length(btrim(coalesce(payload->>'name',''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Informe um nome de até 100 caracteres.'; END IF;
 IF payload->>'source_scenario_id' IS NOT NULL THEN
  SELECT * INTO source FROM public.fc_scenarios WHERE id=(payload->>'source_scenario_id')::uuid AND organization_id=target_org AND (created_by=auth.uid() OR is_shared);
  IF NOT FOUND THEN RAISE EXCEPTION 'Cenário não encontrado.'; END IF;
  base:=source.report_data; filename:=source.base_file_name;
 ELSE
  SELECT * INTO batch FROM public.fc_import_batches WHERE id=(payload->>'base_batch_id')::uuid AND organization_id=target_org FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A carga base foi substituída. Atualize o relatório antes de salvar.'; END IF;
  SELECT jsonb_object_agg(account_id::text,to_jsonb(amounts)) INTO movements FROM public.fc_import_values WHERE batch_id=batch.id;
  base:=jsonb_build_object('year',batch.reference_year,'opening',batch.opening_balance,'kinds',batch.scenarios,'quantities',batch.quantities,'plan',batch.plan_snapshot,'movements',movements);
  filename:=batch.file_name;
 END IF;
 IF jsonb_typeof(payload->'movements') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Movimentos inválidos.'; END IF;
 movements:='{}'::jsonb;
 FOR node IN SELECT e.value FROM jsonb_array_elements(base->'plan') e WHERE e.value->>'node_class'='Analitica' LOOP
  keys:=keys+1; vals:=payload->'movements'->(node->>'id');
  IF jsonb_typeof(vals) IS DISTINCT FROM 'array' OR jsonb_array_length(vals)<>12 THEN RAISE EXCEPTION 'Informe os 12 meses de cada conta.'; END IF;
  FOR i IN 0..11 LOOP
   value:=(vals->>i)::numeric; original:=(base->'movements'->(node->>'id')->>i)::numeric;
   IF value IS NULL OR value::text IN ('NaN','Infinity','-Infinity') OR abs(value)>=1e16 THEN RAISE EXCEPTION 'Valor inválido.'; END IF;
   IF base->'kinds'->>i='Real' AND value IS DISTINCT FROM original THEN RAISE EXCEPTION 'Meses Real não podem ser alterados.'; END IF;
  END LOOP;
  movements:=movements || jsonb_build_object(node->>'id',vals);
 END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(payload->'movements'))<>keys THEN RAISE EXCEPTION 'Contas diferentes da carga base.'; END IF;
 quantities:=payload->'quantities';
 IF jsonb_typeof(quantities) IS DISTINCT FROM 'array' OR jsonb_array_length(quantities)<>12 THEN RAISE EXCEPTION 'Informe 12 quantidades.'; END IF;
 FOR i IN 0..11 LOOP
  value:=(quantities->>i)::numeric;
  IF value IS NULL OR value::text IN ('NaN','Infinity','-Infinity') OR value<0 OR value<>trunc(value) OR value>9007199254740991 THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;
  IF base->'kinds'->>i='Real' AND value IS DISTINCT FROM (base->'quantities'->>i)::numeric THEN RAISE EXCEPTION 'Quantidades Real não podem ser alteradas.'; END IF;
 END LOOP;
 base:=base || jsonb_build_object('movements',movements,'quantities',quantities);
 INSERT INTO public.fc_scenarios(organization_id,created_by,name,reference_year,base_file_name,report_data,is_shared)
 VALUES(target_org,auth.uid(),btrim(payload->>'name'),(base->>'year')::integer,filename,base,public.can_manage_fc_plan(target_org)) RETURNING id INTO result;
 RETURN result;
END; $$;
COMMIT;
