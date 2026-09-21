BEGIN;
INSERT INTO public.notification_event_types(kind,label,description,target_report_id,sort_order,trigger_mode)
VALUES('fc_batch_applied','Carga de Fluxo de Caixa aplicada','Dispara quando uma carga anual de Fluxo de Caixa é aplicada ou substituída com sucesso.','cashFlow',25,'event')
ON CONFLICT(kind) DO UPDATE SET label=excluded.label,description=excluded.description,target_report_id=excluded.target_report_id,sort_order=excluded.sort_order,trigger_mode=excluded.trigger_mode;
INSERT INTO public.notification_settings(organization_id,kind)
SELECT id,'fc_batch_applied' FROM public.organizations
ON CONFLICT(organization_id,kind) DO NOTHING;

CREATE FUNCTION public.notify_fc_batch_applied() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE settings public.notification_settings; batch public.fc_import_batches;
 notice_id uuid; actor_name text; detail text; title text:='Carga de Fluxo de Caixa aplicada'; link text; accounts integer;
BEGIN
 SELECT * INTO batch FROM public.fc_import_batches WHERE id=NEW.batch_id AND organization_id=NEW.organization_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 INSERT INTO public.notification_settings(organization_id,kind) VALUES(NEW.organization_id,'fc_batch_applied') ON CONFLICT DO NOTHING;
 SELECT * INTO settings FROM public.notification_settings WHERE organization_id=NEW.organization_id AND kind='fc_batch_applied';
 IF NOT settings.is_active OR NOT(settings.in_app OR settings.email OR settings.messenger) THEN RETURN NEW; END IF;
 SELECT nullif(btrim(full_name),'') INTO actor_name FROM public.user_profiles WHERE organization_id=NEW.organization_id AND user_id=NEW.actor_id LIMIT 1;
 SELECT count(*) INTO accounts FROM public.fc_import_values WHERE batch_id=NEW.batch_id;
 detail:=batch.reference_year::text || ' Oficial · Janeiro a dezembro · ' || accounts::text || ' contas · ' || batch.file_name
   || CASE WHEN actor_name IS NOT NULL THEN ' · por ' || actor_name ELSE '' END;
 link:='?report=cashFlow&ano=' || batch.reference_year::text || '&mes=12';
 IF settings.in_app THEN
  INSERT INTO public.notifications(organization_id,kind,title,body,ref_year,ref_month,target_report_id,actor_user_id)
  VALUES(NEW.organization_id,'fc_batch_applied',title,detail,batch.reference_year,12,'cashFlow',NEW.actor_id) RETURNING id INTO notice_id;
 END IF;
 IF settings.email AND coalesce(array_length(settings.email_recipients,1),0)>0 THEN
  INSERT INTO public.notification_email_outbox(notification_id,organization_id,recipients,subject,body_text,link_path)
  VALUES(notice_id,NEW.organization_id,settings.email_recipients,'[Vecton] ' || title || ' — ' || batch.reference_year::text,title || E'\n' || detail,link);
 END IF;
 IF settings.messenger AND coalesce(array_length(settings.messenger_recipients,1),0)>0 THEN
  PERFORM public.notify_via_messenger(NEW.organization_id,title || ' — ' || batch.reference_year::text,detail,settings.messenger_recipients);
 END IF;
 RETURN NEW;
END; $$;
-- Evento inserido ao final da RPC: qualquer falha reverte também a notificação.
-- Retry idempotente da carga não reinsere o evento, portanto não duplica avisos.
CREATE TRIGGER fc_batch_applied_notification AFTER INSERT ON public.fc_import_events
FOR EACH ROW EXECUTE FUNCTION public.notify_fc_batch_applied();
COMMIT;
