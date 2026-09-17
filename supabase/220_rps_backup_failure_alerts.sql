begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Avisa (notificação in-app + e-mail, mesmo canal usado pelos outros tipos —
-- ver 092/178) sempre que um backup da RPS de Gestão (semanal ou manual)
-- falhar. Cobre os dois jeitos de falhar observados em produção:
--   1. erro explícito durante a cópia/verificação dos anexos (ex.: "Bad
--      Gateway" do Storage) — o worker já marca status='failed' sozinho;
--   2. execução MORTA no meio (timeout da Edge Function) sem nunca marcar
--      nada — fica presa em 'building' pra sempre. A 219 corrigiu o lock
--      órfão que isso deixava, mas não repetia a limpeza sozinha; aqui
--      entra uma varredura própria (rps_mark_stuck_backups_failed, via
--      cron de hora em hora) que marca como 'failed' e, por tabela, dispara
--      o mesmo aviso.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.notification_event_types (kind, label, description, target_report_id, sort_order, trigger_mode) values
  ('rps_backup_failed', 'Falha no backup da RPS', 'Dispara quando um backup (semanal ou manual) da RPS de Gestão falha ou trava sem concluir.', null, 65, 'event')
on conflict (kind) do update
  set label            = excluded.label,
      description      = excluded.description,
      target_report_id = excluded.target_report_id,
      sort_order        = excluded.sort_order,
      trigger_mode      = excluded.trigger_mode;

-- Semeia a config pra todas as orgs que já existem (mesmo padrão da 110),
-- já com e-mail pré-marcado (mas sem destinatário — o admin ainda precisa
-- cadastrar o e-mail em Configurações > Notificações pra ele sair).
insert into public.notification_settings (organization_id, kind, in_app, email)
select o.id, 'rps_backup_failed', true, true
from public.organizations o
on conflict (organization_id, kind) do nothing;

create or replace function public.notify_rps_backup_failed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_months   constant text[] := array['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  v_kind_pt  constant jsonb := '{"scheduled":"backup semanal","manual":"backup manual","pre_restore":"backup de segurança (pré-restauração)"}'::jsonb;
  v_type     public.notification_event_types%rowtype;
  v_settings public.notification_settings%rowtype;
  v_period   text;
  v_title    text;
  v_body     text;
  v_notif_id uuid;
begin
  select * into v_type from public.notification_event_types where kind = 'rps_backup_failed';
  if not found then return new; end if;

  select * into v_settings
  from public.notification_settings
  where organization_id = new.organization_id and kind = 'rps_backup_failed';
  if not found then
    insert into public.notification_settings (organization_id, kind, in_app, email)
    values (new.organization_id, 'rps_backup_failed', true, true)
    on conflict (organization_id, kind) do nothing;
    select * into v_settings
    from public.notification_settings
    where organization_id = new.organization_id and kind = 'rps_backup_failed';
    if not found then return new; end if;
  end if;

  if not v_settings.is_active then return new; end if;
  if not v_settings.in_app and not v_settings.email and not v_settings.messenger then return new; end if;

  v_period := coalesce(v_months[new.mes], new.mes::text) || '/' || new.ano::text;
  v_title  := 'Falha no backup da RPS — ' || v_period;
  v_body   := coalesce(v_kind_pt ->> new.kind, new.kind) || ' de ' || v_period || ' falhou'
    || case when new.error_message is not null and btrim(new.error_message) <> ''
         then ': ' || left(new.error_message, 300)
         else '.'
       end;

  if v_settings.in_app then
    insert into public.notifications (organization_id, kind, title, body, ref_year, ref_month)
    values (new.organization_id, 'rps_backup_failed', v_title, v_body, new.ano, new.mes)
    returning id into v_notif_id;
  end if;

  if v_settings.email and array_length(v_settings.email_recipients, 1) > 0 then
    insert into public.notification_email_outbox
      (notification_id, organization_id, recipients, subject, body_text)
    values
      (v_notif_id, new.organization_id, v_settings.email_recipients, '[Vecton] ' || v_title, v_body);
  end if;

  if v_settings.messenger and array_length(v_settings.messenger_recipients, 1) > 0 then
    perform public.notify_via_messenger(new.organization_id, v_title, v_body, v_settings.messenger_recipients);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_rps_backup_failed on public.rps_backup_runs;
create trigger trg_notify_rps_backup_failed
  after update of status on public.rps_backup_runs
  for each row
  when (new.status = 'failed' and old.status is distinct from 'failed')
  execute function public.notify_rps_backup_failed();

-- Varredura periódica: sem isso, uma execução morta no meio (timeout da
-- Edge Function) fica presa em 'building' pra sempre e ninguém é avisado
-- (foi exatamente o caso do Setembro/2026, travado de 14 a 17/09 até a
-- limpeza manual da migration 219). Rodar via cron, não pelo worker, porque
-- não depende de rede/Vault — só UPDATE local.
create or replace function public.rps_mark_stuck_backups_failed()
returns void
language sql
security definer
set search_path = public
as $$
  update public.rps_backup_runs
  set status = 'failed',
      completed_at = now(),
      error_message = 'Execução interrompida antes de concluir (worker encerrado no meio do processamento).'
  where status = 'building'
    and captured_at <= now() - interval '2 hours';
$$;

revoke all on function public.rps_mark_stuck_backups_failed() from public, anon, authenticated;
grant execute on function public.rps_mark_stuck_backups_failed() to postgres, service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'rps-backup-stuck-sweep';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'rps-backup-stuck-sweep',
    '15 * * * *',
    'select public.rps_mark_stuck_backups_failed();'
  );
end;
$$;

commit;
