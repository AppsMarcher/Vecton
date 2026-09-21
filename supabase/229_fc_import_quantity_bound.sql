BEGIN;
-- public.apply_fc_annual_import() validava "quantities" como inteiro não-negativo, mas sem o
-- limite de Number.isSafeInteger (2^53-1) que save_fc_scenario (222/223) e o editor do
-- dashboard (fcDashboard.js editValue) já aplicam. Uma quantidade fora desse limite ficava
-- gravada pela carga anual e se tornava impossível de editar depois pela UI normal. O gatilho
-- cobre qualquer caminho de escrita na tabela, não só a RPC de carga.
CREATE FUNCTION public.fc_import_batches_quantity_bound() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM unnest(NEW.quantities) v WHERE v > 9007199254740991) THEN
  RAISE EXCEPTION 'Quantidade de máquinas inválida.';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER fc_import_batches_quantity_bound BEFORE INSERT OR UPDATE OF quantities
 ON public.fc_import_batches FOR EACH ROW EXECUTE FUNCTION public.fc_import_batches_quantity_bound();
COMMIT;
