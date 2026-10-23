begin;

-- 309: aviso "Carga de Balanco Patrimonial (realizado) aplicada" (sininho + e-mail + Messenger), no mesmo molde
-- da carga de Fluxo de Caixa (226/227). Dispara quando um fechamento BP Real e gravado em bp_import_batches
-- (importacao do Excel, lote manual ou robo; o texto marca "carga automatica" quando e do robo).
-- Cargas do Planejado nao avisam. Destinatarios e canais: Parametros > Notificacoes.

insert into public.notification_event_types (kind, label, description, target_report_id, sort_order, trigger_mode)
values ('bp_batch_applied', 'Carga de Balanço Patrimonial (realizado) aplicada',
        'Dispara quando um fechamento mensal do Balanço Patrimonial realizado é aplicado ou substituído com sucesso.',
        'balanceSheetReal', 26, 'event')
on conflict (kind) do update set label = excluded.label, description = excluded.description,
  target_report_id = excluded.target_report_id, sort_order = excluded.sort_order, trigger_mode = excluded.trigger_mode;

insert into public.notification_settings (organization_id, kind)
select id, 'bp_batch_applied' from public.organizations
on conflict (organization_id, kind) do nothing;

-- Ordem na tela (Parametros > Notificacoes): logo depois da carga de Fluxo de Caixa. Organizacao que ja arrastou os
-- cartoes (sort_order gravado) abre espaco depois do FC; sem ordem propria vale a do catalogo (26, logo apos o FC = 25).
do $$
declare o record; fc integer;
begin
  for o in select id from public.organizations loop
    select sort_order into fc from public.notification_settings where organization_id = o.id and kind = 'fc_batch_applied';
    if fc is not null then
      update public.notification_settings set sort_order = sort_order + 1
       where organization_id = o.id and sort_order > fc and kind <> 'bp_batch_applied';
      update public.notification_settings set sort_order = fc + 1
       where organization_id = o.id and kind = 'bp_batch_applied';
    end if;
  end loop;
end $$;

create or replace function public.notify_bp_batch_applied() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  settings public.notification_settings;
  notice_id uuid; actor_name text; detail text; title text; link text; period text;
  meses constant text[] := array['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
begin
  if new.source_type <> 'actual' then return new; end if;
  select label into title from public.notification_event_types where kind = 'bp_batch_applied';
  if title is null then return new; end if;
  insert into public.notification_settings (organization_id, kind) values (new.organization_id, 'bp_batch_applied') on conflict do nothing;
  select * into settings from public.notification_settings where organization_id = new.organization_id and kind = 'bp_batch_applied';
  if not settings.is_active or not (settings.in_app or settings.email or settings.messenger) then return new; end if;

  select nullif(btrim(full_name), '') into actor_name from public.user_profiles
   where organization_id = new.organization_id and user_id = new.applied_by limit 1;
  period := meses[new.reference_month] || '/' || new.reference_year::text;
  detail := period || ' · ' || jsonb_array_length(new.rows)::text || ' contas · ' || new.file_name
    || case when actor_name is not null then ' · por ' || actor_name else '' end
    || case when new.file_name like 'Protheus BP %' then ' · carga automática' else '' end;
  link := '?report=balanceSheetReal&ano=' || new.reference_year::text || '&mes=' || new.reference_month::text;

  if settings.in_app then
    insert into public.notifications (organization_id, kind, title, body, ref_year, ref_month, target_report_id, actor_user_id)
    values (new.organization_id, 'bp_batch_applied', title, detail, new.reference_year, new.reference_month, 'balanceSheetReal', new.applied_by)
    returning id into notice_id;
  end if;
  if settings.email and coalesce(array_length(settings.email_recipients, 1), 0) > 0 then
    insert into public.notification_email_outbox (notification_id, organization_id, recipients, subject, body_text, link_path)
    values (notice_id, new.organization_id, settings.email_recipients, '[Vecton] ' || title || ' — ' || period, title || E'\n' || detail, link);
  end if;
  if settings.messenger and coalesce(array_length(settings.messenger_recipients, 1), 0) > 0 then
    perform public.notify_via_messenger(new.organization_id, title || ' — ' || period, detail, settings.messenger_recipients);
  end if;
  return new;
end $$;
revoke all on function public.notify_bp_batch_applied() from public, anon, authenticated;

drop trigger if exists bp_batch_applied_notification on public.bp_import_batches;
create trigger bp_batch_applied_notification after insert on public.bp_import_batches
  for each row execute function public.notify_bp_batch_applied();

notify pgrst, 'reload schema';
commit;
