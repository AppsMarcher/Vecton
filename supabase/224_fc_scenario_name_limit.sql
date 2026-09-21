BEGIN;
-- Preserva nomes já cadastrados. A regra vale para novos cenários e renomeações.
CREATE FUNCTION public.validate_fc_scenario_name() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF char_length(btrim(NEW.name)) NOT BETWEEN 1 AND 15 THEN
  RAISE EXCEPTION 'O nome do cenário deve ter entre 1 e 15 caracteres.';
 END IF;
 NEW.name := btrim(NEW.name);
 RETURN NEW;
END; $$;
CREATE TRIGGER fc_scenario_name_limit BEFORE INSERT OR UPDATE OF name
 ON public.fc_scenarios FOR EACH ROW EXECUTE FUNCTION public.validate_fc_scenario_name();
COMMIT;
