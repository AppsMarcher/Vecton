-- 110: Ativação por notificação + tipo agendado (Lembrete RPS de Gestão)
-- Criado por: Ricardo Guimarães — 2026-08-06
--
-- Duas frentes, pedidas juntas pelo usuário na tela Parâmetros → Notificações:
--
-- 1) ATIVAÇÃO: toda linha da tabela (as 5 já existentes + a nova) ganha um
--    "disjuntor geral" (`is_active`). Desliga sininho E e-mail juntos daquele
--    tipo, mesmo que os dois checkboxes individuais estejam marcados — não é
--    mais um canal, é "esse tipo de notificação existe ou não agora".
--
-- 2) AGENDADO: até aqui todo tipo de notificação era disparado por EVENTO (via
--    trigger na tabela de lote, ver 092). O "Lembrete RPS de Gestão" é
--    diferente — dispara periodicamente num dia da semana + horário que o
--    admin escolhe na tela, não em reação a nada. Modelagem:
--      - `notification_event_types.trigger_mode` distingue 'event' (os 5 já
--        existentes) de 'scheduled' (só este novo, por ora).
--      - `notification_settings` ganha `schedule_weekday` (0=domingo..
--        6=sábado, mesma convenção do extract(dow) do Postgres — não precisa
--        de tabela de tradução) + `schedule_time` (horário local) +
--        `schedule_last_fired_on` (carimbo pra não repetir no mesmo dia).
--      - `run_scheduled_notifications()`, chamada por pg_cron a cada 15min,
--        varre todas as orgs com tipo agendado ativo e horário configurado
--        batendo com "agora" (America/Sao_Paulo) e ainda não disparado hoje.
--        SEM Edge Function nova: gravar uma linha em `notifications` e/ou
--        `notification_email_outbox` é só INSERT — o envio de e-mail em si
--        já é drenado pela fila existente (`send-notification-emails`, cron
--        de 5min, ver 092). O backup semanal da RPS (105) precisou de Edge
--        Function + vault porque manipula arquivo; aqui não há esse motivo.
--      - Destinatário do sininho continua org-wide (mesmo padrão dos 5 tipos
--        de evento — quem vê a notificação é todo mundo da org, e-mail é que
--        vai só pra quem estiver no seletor de destinatários já existente).
--      - Limitação conhecida e aceita: a janela de disparo (`schedule_time`
--        até `schedule_time + 15min`) não trata o caso de virada de meia-
--        noite (ex.: configurar 23h55 puxaria a janela pra 00h10, que o
--        Postgres trata como ANTES por causa do wraparound do tipo `time`).
--        Caso real de uso é dia comercial de manhã/tarde, então não há
--        tratamento especial — só documentado aqui pra não surpreender no
--        futuro.

-- pg_cron pode não ter sido habilitado ainda se a 105 (backup semanal da RPS)
-- não rodou neste banco — idempotente, não depende da ordem das migrations.
create extension if not exists pg_cron;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. notification_event_types: trigger_mode + o novo tipo agendado
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.notification_event_types
  add column if not exists trigger_mode text not null default 'event';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notification_event_types_trigger_mode_check'
  ) then
    alter table public.notification_event_types
      add constraint notification_event_types_trigger_mode_check
      check (trigger_mode in ('event', 'scheduled'));
  end if;
end;
$$;

insert into public.notification_event_types (kind, label, description, target_report_id, sort_order, trigger_mode) values
  ('rps_gestao_reminder', 'Lembrete RPS de Gestão', 'Dispara periodicamente pra quem preenche a RPS de Gestão, no dia e horário configurados abaixo.', null, 60, 'scheduled')
on conflict (kind) do update
  set label            = excluded.label,
      description      = excluded.description,
      target_report_id = excluded.target_report_id,
      sort_order        = excluded.sort_order,
      trigger_mode      = excluded.trigger_mode;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. notification_settings: is_active (todas as linhas) + agendamento (só a nova)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.notification_settings
  add column if not exists is_active              boolean not null default true,
  add column if not exists schedule_weekday        smallint,
  add column if not exists schedule_time           time,
  add column if not exists schedule_last_fired_on  date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notification_settings_schedule_weekday_check'
  ) then
    alter table public.notification_settings
      add constraint notification_settings_schedule_weekday_check
      check (schedule_weekday is null or schedule_weekday between 0 and 6);
  end if;
end;
$$;

-- Semeia a configuração do tipo novo pra todas as orgs que já existem (mesmo
-- padrão da 092). Sem dia/horário definido ainda — admin escolhe na tela.
insert into public.notification_settings (organization_id, kind)
select o.id, 'rps_gestao_reminder'
from public.organizations o
on conflict (organization_id, kind) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. notify_batch_applied: passa a respeitar is_active
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_batch_applied()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_months   constant text[] := array['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  v_kind     text;
  v_type     public.notification_event_types%rowtype;
  v_settings public.notification_settings%rowtype;
  v_row      jsonb := to_jsonb(new);
  v_actor    uuid  := auth.uid();
  v_actor_nm text;
  v_period   text;
  v_title    text;
  v_body     text;
  v_rows     int;
  v_loadtype text;
  v_notif_id uuid;
begin
  if new.status is distinct from 'applied' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'applied' then
    return new;
  end if;

  v_kind := case tg_table_name
    when 'actuals_import_batches'              then 'actuals_batch_applied'
    when 'budget_import_batches'               then 'budget_batch_applied'
    when 'headcount_import_batches'            then 'headcount_batch_applied'
    when 'comercial_realizado_import_batches'  then 'comercial_realizado_batch_applied'
    when 'comercial_planejado_import_batches'  then 'comercial_planejado_batch_applied'
    else null
  end;
  if v_kind is null then
    return new;
  end if;

  select * into v_type from public.notification_event_types where kind = v_kind;
  if not found then
    return new;
  end if;

  select * into v_settings
  from public.notification_settings
  where organization_id = new.organization_id and kind = v_kind;
  if not found then
    insert into public.notification_settings (organization_id, kind)
    values (new.organization_id, v_kind)
    on conflict (organization_id, kind) do nothing;

    select * into v_settings
    from public.notification_settings
    where organization_id = new.organization_id and kind = v_kind;
    if not found then
      return new;
    end if;
  end if;

  -- "Ativo" desligado é um disjuntor geral: nem sininho nem e-mail, mesmo que
  -- os dois estejam marcados na configuração.
  if not v_settings.is_active then
    return new;
  end if;

  if not v_settings.in_app and not v_settings.email then
    return new;
  end if;

  v_rows     := coalesce((v_row ->> 'valid_rows')::int, (v_row ->> 'total_rows')::int, 0);
  v_loadtype := v_row ->> 'load_type';

  v_period := coalesce(v_months[new.reference_month], '') || '/' || new.reference_year::text;

  select nullif(trim(coalesce(full_name, '')), '') into v_actor_nm
  from public.user_profiles
  where user_id = v_actor and organization_id = new.organization_id
  limit 1;

  v_title := v_type.label;
  if v_kind = 'headcount_batch_applied' and v_loadtype is not null then
    v_title := v_title || case
      when v_loadtype = 'realizado' then ' (realizado)'
      when v_loadtype = 'planejado' then ' (planejado)'
      when v_loadtype like 'cenario:%' then ' (cenário)'
      else ''
    end;
  end if;

  v_body := v_period
    || case when v_rows > 0 then ' · ' || to_char(v_rows, 'FM999G999G999') || ' linhas' else '' end
    || case when v_actor_nm is not null then ' · por ' || v_actor_nm else '' end;

  if v_settings.in_app then
    insert into public.notifications
      (organization_id, kind, title, body, ref_year, ref_month, target_report_id, actor_user_id)
    values
      (new.organization_id, v_kind, v_title, v_body,
       new.reference_year, new.reference_month, v_type.target_report_id, v_actor)
    returning id into v_notif_id;
  end if;

  if v_settings.email and array_length(v_settings.email_recipients, 1) > 0 then
    insert into public.notification_email_outbox
      (notification_id, organization_id, recipients, subject, body_text)
    values
      (v_notif_id, new.organization_id, v_settings.email_recipients,
       '[Vecton] ' || v_title || ' — ' || v_period,
       v_title || E'\n' || v_body);
  end if;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. run_scheduled_notifications: dispara os tipos 'scheduled' cujo dia/horário bateu
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
begin
  for v_row in
    select ns.*
    from public.notification_settings ns
    join public.notification_event_types t on t.kind = ns.kind
    where t.trigger_mode = 'scheduled'
      and ns.is_active
      and ns.schedule_weekday is not null
      and ns.schedule_time is not null
      and (ns.in_app or ns.email)
      and v_dow = ns.schedule_weekday
      and v_time >= ns.schedule_time
      and v_time <  ns.schedule_time + interval '15 minutes'
      and (ns.schedule_last_fired_on is null or ns.schedule_last_fired_on < v_today)
  loop
    select * into v_type from public.notification_event_types where kind = v_row.kind;
    if not found then
      continue;
    end if;

    v_notif_id := null;
    if v_row.in_app then
      insert into public.notifications (organization_id, kind, title, body)
      values (v_row.organization_id, v_row.kind, v_type.label,
              'Não esqueça de preencher a RPS de Gestão desta semana.')
      returning id into v_notif_id;
    end if;

    if v_row.email and array_length(v_row.email_recipients, 1) > 0 then
      insert into public.notification_email_outbox
        (notification_id, organization_id, recipients, subject, body_text)
      values
        (v_notif_id, v_row.organization_id, v_row.email_recipients,
         '[Vecton] ' || v_type.label,
         v_type.label || E'\n' || 'Não esqueça de preencher a RPS de Gestão desta semana.');
    end if;

    update public.notification_settings
       set schedule_last_fired_on = v_today
     where organization_id = v_row.organization_id and kind = v_row.kind;
  end loop;
end;
$$;

-- Só o cron dispara — não é um botão que o usuário aciona pelo app, então não
-- vai pra 'authenticated' (evita disparar o lembrete de todas as orgs fora de
-- hora só chamando a RPC manualmente).
revoke all on function public.run_scheduled_notifications() from public, anon, authenticated;
grant execute on function public.run_scheduled_notifications() to postgres, service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'vecton-scheduled-notifications';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'vecton-scheduled-notifications',
    '*/15 * * * *',
    'select public.run_scheduled_notifications();'
  );
end;
$$;
