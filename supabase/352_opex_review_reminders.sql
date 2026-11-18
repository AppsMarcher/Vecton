begin;

-- Lembretes de prazo das ações de OPEX — rodam NO SERVIDOR (pg_cron), com ou sem alguém logado.
--   * 08:00 America/Sao_Paulo (= 11:00 UTC; o Brasil não usa horário de verão), só em dias úteis (seg–sex).
--   * "prazo próximo": 1 aviso quando faltam até 3 dias; "vencida": 1 aviso ao executor e ao dono (um só se forem a mesma pessoa).
--   * Deduplicação por (ação, ciclo da atribuição, versão do prazo, tipo, destinatário, canal) — opex_notification_log (350):
--     reexecutar no mesmo dia, ou login/polling, não reenvia; novo prazo (due_date_version) reabre a elegibilidade;
--     reatribuição (novo ciclo) também.
--   * Entrega aguardando validação / concluída não é cobrança do executor.
--   * Aproveita a rodada para reconciliar a posse de ações cujo dono perdeu o acesso (348).
-- Dia do prazo ainda não é atraso: vence no fim do dia local. Prazo de fim de semana é avisado na sexta (janela de 3 dias) e
-- cobrado como vencido na segunda.
-- Idempotente.

create or replace function public.opex_run_reminders(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare r record; v_today date := (p_now at time zone 'America/Sao_Paulo')::date; v_before bigint; v_after bigint;
begin
  if extract(isodow from v_today) in (6, 7) then return 0; end if;
  perform public.opex_reconcile_owners();
  select count(*) into v_before from public.opex_notification_log;

  for r in select p.id, p.assignee_user_id, p.assignment_cycle, p.due_date_version
             from public.opex_action_plans p
            where p.deleted_at is null and p.status in ('awaiting_ack', 'in_progress', 'adjustments_requested')
              and p.due_date between v_today and v_today + 3
            order by p.due_date, p.id loop
    perform public.opex_emit(r.id, 'due_soon', r.assignee_user_id, r.assignment_cycle, r.due_date_version);
  end loop;

  for r in select p.id, p.assignee_user_id, p.owner_user_id, p.assignment_cycle, p.due_date_version
             from public.opex_action_plans p
            where p.deleted_at is null and p.status in ('awaiting_ack', 'in_progress', 'adjustments_requested') and p.due_date < v_today
            order by p.due_date, p.id loop
    perform public.opex_emit(r.id, 'overdue', r.assignee_user_id, r.assignment_cycle, r.due_date_version);
    if r.owner_user_id <> r.assignee_user_id then
      perform public.opex_emit(r.id, 'overdue', r.owner_user_id, r.assignment_cycle, r.due_date_version);
    end if;
  end loop;

  select count(*) into v_after from public.opex_notification_log;
  return (v_after - v_before)::integer;
end;
$$;
revoke all on function public.opex_run_reminders(timestamptz) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.opex_run_reminders(timestamptz) to service_role;
  end if;
end $$;

-- Agendamento: só onde o pg_cron existe (produção). Job próprio, independente dos demais lembretes.
do $$
declare v_job_id bigint;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    select jobid into v_job_id from cron.job where jobname = 'vecton-opex-action-reminders';
    if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
    perform cron.schedule('vecton-opex-action-reminders', '0 11 * * 1-5', 'select public.opex_run_reminders();');
  end if;
end;
$$;

commit;
