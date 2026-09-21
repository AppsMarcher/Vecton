BEGIN;
CREATE FUNCTION public.delete_fc_scenario(target_org uuid, target_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_read_fc(target_org) THEN RAISE EXCEPTION 'Sem permissão para excluir cenários.'; END IF;
 DELETE FROM public.fc_scenarios WHERE organization_id=target_org AND id=target_id
 AND (created_by=auth.uid() OR (is_shared AND public.can_manage_fc_plan(target_org)));
 IF NOT FOUND THEN RAISE EXCEPTION 'Cenário não encontrado ou sem permissão para excluir.'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.delete_fc_scenario(uuid,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_fc_scenario(uuid,uuid) TO authenticated;
COMMIT;
