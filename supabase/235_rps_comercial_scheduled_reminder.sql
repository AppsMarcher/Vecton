begin;

-- ============================================================================
-- 236: Lembrete "RPS Comercial" na Central de Notificações — mesmo padrão do
-- Lembrete RPS de Gestão (110/178/232): 2º tipo 'scheduled', agendável por
-- dia da semana + horário na tela Parâmetros -> Notificações, com os 3
-- canais já existentes (sininho, e-mail, Messenger). A tela e o resto do
-- fluxo (notificationsModule.js) já são 100% data-driven a partir de
-- notification_event_types/notification_settings — não precisa de nenhuma
-- mudança de UI, só cadastrar o tipo novo aqui.
--
-- Até aqui só existia 1 tipo 'scheduled' (rps_gestao_reminder), então
-- run_scheduled_notifications() tinha o texto do lembrete (corpo + linha
-- "Acesse em: ...") fixo no código, só pra esse tipo. Generaliza: duas
-- colunas novas em notification_event_types (reminder_body/
-- reminder_access_line) guardam esse texto POR TIPO; a função passa a ler
-- delas em vez de hardcode — sem isso o lembrete de RPS Comercial sairia
-- disparando texto de "RPS de Gestão".
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. notification_event_types: reminder_body/reminder_access_line + backfill
--    do tipo existente (mesmo texto que já rodava hardcoded na função, pra
--    não mudar o e-mail/sininho de quem já usa RPS Gestão) + o tipo novo.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.notification_event_types
  add column if not exists reminder_body        text,
  add column if not exists reminder_access_line text;

update public.notification_event_types
set reminder_body        = 'Não esqueça de preencher a RPS de Gestão desta semana.',
    reminder_access_line = 'Acesse em: Vecton/RPS Gestão e preencha a semana.'
where kind = 'rps_gestao_reminder';

insert into public.notification_event_types
  (kind, label, description, target_report_id, sort_order, trigger_mode, reminder_body, reminder_access_line)
values (
  'rps_comercial_reminder',
  'Lembrete RPS Comercial',
  'Dispara periodicamente pra quem conduz a reunião comercial semanal (RPS Comercial), no dia e horário configurados abaixo.',
  null, 61, 'scheduled',
  'Não esqueça de registrar a reunião comercial semanal (RPS Comercial).',
  'Acesse em: Vecton/RPS Comercial e registre a semana.'
)
on conflict (kind) do update
  set label                = excluded.label,
      description          = excluded.description,
      target_report_id     = excluded.target_report_id,
      sort_order            = excluded.sort_order,
      trigger_mode          = excluded.trigger_mode,
      reminder_body         = excluded.reminder_body,
      reminder_access_line  = excluded.reminder_access_line;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. notification_settings: semeia a configuração do tipo novo pra todas as
--    orgs que já existem (mesmo padrão da 110) — sem dia/horário definido
--    ainda, admin escolhe na tela.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.notification_settings (organization_id, kind)
select o.id, 'rps_comercial_reminder'
from public.organizations o
on conflict (organization_id, kind) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. run_scheduled_notifications — generalizada: lê reminder_body/
--    reminder_access_line de notification_event_types por kind, em vez do
--    texto fixo de RPS de Gestão (Messenger continua sem a linha de acesso,
--    mesmo recorte da 232 — não foi pedido pra esse canal). Base: 232.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.run_scheduled_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now_sp  timestamp := (now() at time zone 'America/Sao_Paulo');
  v_dow     smallint   := extract(dow from v_now_sp)::smallint;   -- 0=domingo..6=sábado
  v_time    time       := v_now_sp::time;
  v_today   date       := v_now_sp::date;
  v_row     record;
  v_type    public.notification_event_types%rowtype;
  v_notif_id uuid;
  v_body    text;
  v_access  text;
begin
  for v_row in
    select ns.*
    from public.notification_settings ns
    join public.notification_event_types t on t.kind = ns.kind
    where t.trigger_mode = 'scheduled'
      and ns.is_active
      and ns.schedule_weekday is not null
      and ns.schedule_time is not null
      and (ns.in_app or ns.email or ns.messenger)
      and v_dow = ns.schedule_weekday
      and v_time >= ns.schedule_time
      and v_time <  ns.schedule_time + interval '15 minutes'
      and (ns.schedule_last_fired_on is null or ns.schedule_last_fired_on < v_today)
  loop
    select * into v_type from public.notification_event_types where kind = v_row.kind;
    if not found then
      continue;
    end if;

    v_body   := coalesce(v_type.reminder_body, v_type.label);
    v_access := v_type.reminder_access_line;

    v_notif_id := null;
    if v_row.in_app then
      insert into public.notifications (organization_id, kind, title, body)
      values (v_row.organization_id, v_row.kind, v_type.label,
              v_body || case when v_access is not null then E'\n' || v_access else '' end)
      returning id into v_notif_id;
    end if;

    if v_row.email and array_length(v_row.email_recipients, 1) > 0 then
      insert into public.notification_email_outbox
        (notification_id, organization_id, recipients, subject, body_text)
      values
        (v_notif_id, v_row.organization_id, v_row.email_recipients,
         '[Vecton] ' || v_type.label,
         v_type.label || E'\n' || v_body
           || case when v_access is not null then E'\n' || v_access else '' end);
    end if;

    if v_row.messenger and array_length(v_row.messenger_recipients, 1) > 0 then
      perform public.notify_via_messenger(
        v_row.organization_id, v_type.label, v_body, v_row.messenger_recipients);
    end if;

    update public.notification_settings
       set schedule_last_fired_on = v_today
     where organization_id = v_row.organization_id and kind = v_row.kind;
  end loop;
end;
$$;

commit;
