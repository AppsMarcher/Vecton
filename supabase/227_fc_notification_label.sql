BEGIN;
UPDATE public.notification_event_types
SET label='Carga de Fluxo de Caixa (realizado) aplicada'
WHERE kind='fc_batch_applied';

CREATE OR REPLACE FUNCTION public.notify_fc_batch_applied() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE settings public.notification_settings; batch public.fc_import_batches;
 notice_id uuid; actor_name text; detail text; title text; link text; accounts integer;
BEGIN
 SELECT label INTO title FROM public.notification_event_types WHERE kind='fc_batch_applied';
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
COMMIT;
