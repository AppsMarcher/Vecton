begin;

-- ============================================================================
-- Pedido do usuário (2026-08-29): alertas/notificações do módulo A3
-- Estratégico, na Central de Notificações já existente (092/098/108/110).
-- Alinhado em duas rodadas de pergunta antes de escrever qualquer coisa:
--
--   1) "Indicador fora da meta"  → dispara no FECHAMENTO do período (não a
--      cada rascunho salvo), 1 notificação CONSOLIDADA por A3+mês listando
--      os KPIs que ficaram attention/off_target, pra sino + lista fixa de
--      e-mail definida pelo admin — mesmo padrão de sempre (broadcast).
--   2) "Prazo de ação vencendo/vencida" e "Ação atribuída a você" → os dois
--      são POR PESSOA (só o(s) Responsável(is) da ação), não broadcast pra
--      org. Isso é modelo novo — até aqui toda notificação da Central era
--      "todo mundo da org vê". Cadência do prazo: 1 aviso na janela de até
--      3 dias antes do vencimento + 1 aviso quando vence/já venceu, cada um
--      no máximo 1x por ação (2 marcadores novos em strategic_actions).
--
-- NÃO entrou nesta leva (decisão do usuário, focar no que importa mais):
-- A3/indicador criado ou excluído, período fechado/reaberto — são mais
-- auditoria que alerta, ficam pra uma leva futura se fizer falta.
--
-- NÃO entrou nesta leva (decisão minha, documentada): clique na notificação
-- não faz deep-link pra dentro do A3/ação — só informa, navegação continua
-- manual. Barato de adicionar depois (dá pra guardar a3_id numa coluna nova
-- e ensinar o popover a abrir o módulo estratégico nela).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. notifications: alvo por pessoa (novo) — null = broadcast pra org
--    inteira (comportamento de sempre), preenchido = só aquela pessoa vê.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.notifications
  add column if not exists target_user_id uuid references auth.users(id) on delete cascade;

create index if not exists notifications_target_user_idx
  on public.notifications (target_user_id) where target_user_id is not null;

-- notification_event_types: distingue "lista fixa escolhida pelo admin"
-- (broadcast, os 6 tipos já existentes) de "vai direto pro Responsável"
-- (assignee, os 2 tipos novos de ação) — só pra tela de Parâmetros saber
-- se mostra o seletor de destinatários ou não.
alter table public.notification_event_types
  add column if not exists target_mode text not null default 'broadcast';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notification_event_types_target_mode_check'
  ) then
    alter table public.notification_event_types
      add constraint notification_event_types_target_mode_check
      check (target_mode in ('broadcast', 'assignee'));
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Catálogo: os 3 tipos novos
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.notification_event_types (kind, label, description, target_report_id, sort_order, trigger_mode, target_mode) values
  ('strategic_kpi_off_target',   'A3: indicador fora da meta',        'Dispara ao fechar o período de um A3, se algum indicador ficou em atenção ou fora da meta.', null, 70, 'event', 'broadcast'),
  ('strategic_action_due',       'A3: prazo de ação vencendo/vencida','Avisa o(s) Responsável(is) de uma ação até 3 dias antes do prazo, e de novo quando vence.',      null, 80, 'event', 'assignee'),
  ('strategic_action_assigned',  'A3: você foi atribuído a uma ação', 'Avisa a pessoa quando ela é adicionada como Responsável de uma ação do plano.',                  null, 90, 'event', 'assignee')
on conflict (kind) do update
  set label            = excluded.label,
      description      = excluded.description,
      target_report_id = excluded.target_report_id,
      sort_order        = excluded.sort_order,
      trigger_mode      = excluded.trigger_mode,
      target_mode       = excluded.target_mode;

insert into public.notification_settings (organization_id, kind)
select o.id, k.kind
from public.organizations o
cross join (values ('strategic_kpi_off_target'), ('strategic_action_due'), ('strategic_action_assigned')) as k(kind)
on conflict (organization_id, kind) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Feed/contagem/marcar-tudo-lido respeitam target_user_id
--    (reemitidas com base na versão mais recente de cada uma — 098 pro feed,
--    108 pro inbox_counts, 092 pro mark_all_read — só somando o predicado).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notifications_feed(p_limit int default 30)
returns table (
  id               uuid,
  kind             text,
  title            text,
  body             text,
  ref_year         int,
  ref_month        int,
  target_report_id text,
  created_at       timestamptz,
  is_read          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.kind, n.title, n.body, n.ref_year, n.ref_month,
         n.target_report_id, n.created_at,
         (r.notification_id is not null) as is_read
  from public.notifications n
  join public.user_profiles me
    on me.user_id = auth.uid() and me.organization_id = n.organization_id
  left join public.notification_reads r
    on r.notification_id = n.id and r.user_id = auth.uid()
  where n.created_at >= now() - interval '90 days'
    and n.created_at >= me.created_at
    and n.created_at > coalesce(me.notifications_cleared_at, '-infinity'::timestamptz)
    and (n.target_user_id is null or n.target_user_id = auth.uid())
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.inbox_counts()
returns table (notificacoes int, mensagens int)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles set last_seen_at = now() where user_id = auth.uid();

  return query
  select
    (select count(*)::int
       from public.notifications n
       join public.user_profiles me
         on me.user_id = auth.uid() and me.organization_id = n.organization_id
       left join public.notification_reads r
         on r.notification_id = n.id and r.user_id = auth.uid()
      where r.notification_id is null
        and n.created_at >= now() - interval '90 days'
        and n.created_at >= me.created_at
        and n.created_at > coalesce(me.notifications_cleared_at, '-infinity'::timestamptz)
        and (n.target_user_id is null or n.target_user_id = auth.uid())),
    public.messages_unread_count();
end;
$$;

create or replace function public.notifications_mark_all_read()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notification_reads (notification_id, user_id)
  select n.id, auth.uid()
  from public.notifications n
  join public.user_profiles me
    on me.user_id = auth.uid()
   and me.organization_id = n.organization_id
  where n.created_at >= now() - interval '90 days'
    and n.created_at >= me.created_at
    and (n.target_user_id is null or n.target_user_id = auth.uid())
  on conflict (notification_id, user_id) do nothing;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. "Indicador fora da meta" — trigger no fechamento de período
--    (mesmo desenho do notify_batch_applied da 092: só a transição PRA
--    'closed' dispara; reabrir e fechar de novo dispara de novo, que é o
--    comportamento certo — pode ter mudado o resultado nesse meio-tempo).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_strategic_kpi_off_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_months   constant text[] := array['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  v_type     public.notification_event_types%rowtype;
  v_settings public.notification_settings%rowtype;
  v_a3_name  text;
  v_scenario uuid;
  v_kpi_names text[];
  v_count    int;
  v_title    text;
  v_body     text;
  v_notif_id uuid;
begin
  if new.status is distinct from 'closed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'closed' then
    return new;
  end if;

  select * into v_type from public.notification_event_types where kind = 'strategic_kpi_off_target';
  if not found then return new; end if;

  select * into v_settings
  from public.notification_settings
  where organization_id = new.organization_id and kind = 'strategic_kpi_off_target';
  if not found then
    insert into public.notification_settings (organization_id, kind)
    values (new.organization_id, 'strategic_kpi_off_target')
    on conflict (organization_id, kind) do nothing;
    select * into v_settings
    from public.notification_settings
    where organization_id = new.organization_id and kind = 'strategic_kpi_off_target';
    if not found then return new; end if;
  end if;

  if not v_settings.is_active then return new; end if;
  if not v_settings.in_app and not v_settings.email then return new; end if;

  select name into v_a3_name from public.strategic_a3 where id = new.a3_id;
  select id into v_scenario from public.strategic_scenarios where cycle_id = new.cycle_id and is_current limit 1;

  select array_agg(k.name order by ak.display_order), count(*)
  into v_kpi_names, v_count
  from public.strategic_a3_kpis ak
  join public.strategic_kpis k on k.id = ak.kpi_id and k.is_active
  left join lateral (
    select target_value, target_min, target_max, tolerance
    from public.strategic_kpi_targets
    where kpi_id = k.id and year = new.year and month = new.month and scenario_id = v_scenario
  ) tgt on true
  left join lateral (
    select result_value from public.strategic_kpi_records
    where kpi_id = k.id and year = new.year and month = new.month
  ) rec on true
  where ak.a3_id = new.a3_id and ak.relationship_type = 'primary'
    and public.strategic_kpi_status(
      rec.result_value, tgt.target_value, tgt.target_min, tgt.target_max, tgt.tolerance,
      k.comparison_mode, k.attention_band_pct
    ) in ('attention', 'off_target');

  if coalesce(v_count, 0) = 0 then
    return new;
  end if;

  v_title := v_count || ' indicador' || case when v_count = 1 then '' else 'es' end
    || ' fora da meta em ' || coalesce(v_a3_name, 'A3');
  v_body := array_to_string(v_kpi_names, ', ') || ' — ' || v_months[new.month] || '/' || new.year::text;

  if v_settings.in_app then
    insert into public.notifications
      (organization_id, kind, title, body, ref_year, ref_month, actor_user_id)
    values
      (new.organization_id, 'strategic_kpi_off_target', v_title, v_body, new.year, new.month, auth.uid())
    returning id into v_notif_id;
  end if;

  if v_settings.email and array_length(v_settings.email_recipients, 1) > 0 then
    insert into public.notification_email_outbox
      (notification_id, organization_id, recipients, subject, body_text)
    values
      (v_notif_id, new.organization_id, v_settings.email_recipients,
       '[Vecton] ' || v_title, v_title || E'\n' || v_body);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_strategic_kpi_off_target on public.strategic_a3_periods;
create trigger trg_notify_strategic_kpi_off_target
after insert or update of status on public.strategic_a3_periods
for each row execute function public.notify_strategic_kpi_off_target();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. "Ação atribuída a você" — dentro do próprio strategic_save_action, não
--    num trigger na tabela de vínculo. Motivo: strategic_save_action APAGA E
--    RECRIA todos os Responsáveis a cada salvamento (mesmo sem mudar
--    ninguém) — um trigger de INSERT em strategic_action_owners spamaria
--    "você foi atribuído" a cada edição trivial (status, progresso etc.).
--    Aqui comparamos a lista antiga com a nova e só notificamos quem é
--    GENUINAMENTE novo. Reemitida com base na 145 (só essa adição no fim).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.strategic_save_action(
  p_organization_id          uuid,
  p_cycle_id                 uuid,
  p_id                       uuid default null,
  p_title                    text default null,
  p_description              text default null,
  p_status                   text default 'not_started',
  p_priority                 text default null,
  p_due_date                 date default null,
  p_progress                 numeric default null,
  p_source_analysis_item_id  uuid default null,
  p_a3_ids                   uuid[] default array[]::uuid[],
  p_kpi_ids                  uuid[] default array[]::uuid[],
  p_owner_user_ids           uuid[] default array[]::uuid[]
)
returns public.strategic_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_id uuid;
  v_uid uuid;
  v_a3_id uuid;
  v_kpi_id uuid;
  v_out public.strategic_actions;
  v_old_owners uuid[];
  v_new_owners uuid[];
  v_type public.notification_event_types%rowtype;
  v_settings public.notification_settings%rowtype;
  v_owner record;
  v_notif_id uuid;
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'título da ação é obrigatório';
  end if;
  if p_a3_ids is null or cardinality(p_a3_ids) = 0 then
    raise exception 'ação precisa de pelo menos 1 A3 vinculado';
  end if;

  if exists (
    select 1 from unnest(p_a3_ids) as u(a3_id) where not public.strategic_can_edit_a3(u.a3_id)
  ) then
    raise exception 'sem permissão de edição em um ou mais A3 informados';
  end if;

  if exists (
    select 1
    from unnest(p_kpi_ids) as u(kpi_id)
    left join public.strategic_kpis k on k.id = u.kpi_id
    where k.id is null or not public.strategic_can_edit_a3(k.primary_a3_id)
  ) then
    raise exception 'sem permissão de edição em um ou mais KPIs informados';
  end if;

  if exists (
    select 1
    from unnest(p_owner_user_ids) as u(user_id)
    left join public.organization_users ou on ou.user_id = u.user_id and ou.organization_id = p_organization_id
    where ou.user_id is null
  ) then
    raise exception 'um ou mais responsáveis informados não pertencem a esta organização';
  end if;

  if p_id is null then
    insert into public.strategic_actions
      (organization_id, cycle_id, source_analysis_item_id, title, description, status, priority, due_date, progress, created_by, updated_by)
    values
      (p_organization_id, p_cycle_id, p_source_analysis_item_id, p_title, p_description,
       coalesce(p_status, 'not_started'), p_priority, p_due_date, p_progress, auth.uid(), auth.uid())
    returning id into v_action_id;
    v_old_owners := array[]::uuid[];
  else
    if not public.strategic_action_editable(p_id) then
      raise exception 'sem permissão para editar esta ação';
    end if;

    select coalesce(array_agg(user_id), array[]::uuid[]) into v_old_owners
    from public.strategic_action_owners where action_id = p_id;

    update public.strategic_actions
    set title = p_title,
        description = p_description,
        status = coalesce(p_status, status),
        priority = p_priority,
        due_date = p_due_date,
        progress = p_progress,
        completed_at = case
          when p_status = 'done' and status <> 'done' then now()
          when p_status <> 'done' then null
          else completed_at
        end,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_id and organization_id = p_organization_id
    returning id into v_action_id;

    if v_action_id is null then raise exception 'ação não encontrada'; end if;
  end if;

  delete from public.strategic_action_a3 where action_id = v_action_id;
  foreach v_a3_id in array p_a3_ids loop
    insert into public.strategic_action_a3 (action_id, a3_id) values (v_action_id, v_a3_id)
    on conflict do nothing;
  end loop;

  delete from public.strategic_action_kpis where action_id = v_action_id;
  foreach v_kpi_id in array p_kpi_ids loop
    insert into public.strategic_action_kpis (action_id, kpi_id) values (v_action_id, v_kpi_id)
    on conflict do nothing;
  end loop;

  delete from public.strategic_action_owners where action_id = v_action_id;
  v_new_owners := coalesce(p_owner_user_ids, array[]::uuid[]);
  foreach v_uid in array v_new_owners loop
    insert into public.strategic_action_owners (action_id, user_id, owner_type)
    values (v_action_id, v_uid, 'owner')
    on conflict do nothing;
  end loop;

  -- "Ação atribuída a você" — só pra quem é NOVO na lista (não estava em
  -- v_old_owners) e não é quem está salvando agora (evita "você se
  -- atribuiu" toda vez que a própria pessoa cria a ação já se marcando).
  select * into v_type from public.notification_event_types where kind = 'strategic_action_assigned';
  if found then
    select * into v_settings
    from public.notification_settings
    where organization_id = p_organization_id and kind = 'strategic_action_assigned';
    if not found then
      insert into public.notification_settings (organization_id, kind)
      values (p_organization_id, 'strategic_action_assigned')
      on conflict (organization_id, kind) do nothing;
      select * into v_settings
      from public.notification_settings
      where organization_id = p_organization_id and kind = 'strategic_action_assigned';
    end if;

    if found and v_settings.is_active and (v_settings.in_app or v_settings.email) then
      for v_owner in
        select up.user_id, up.email, up.full_name
        from unnest(v_new_owners) as nu(user_id)
        join public.user_profiles up on up.user_id = nu.user_id and up.organization_id = p_organization_id
        where nu.user_id <> auth.uid()
          and not (nu.user_id = any(v_old_owners))
      loop
        v_notif_id := null;
        if v_settings.in_app then
          insert into public.notifications (organization_id, kind, title, body, target_user_id, actor_user_id)
          values (p_organization_id, 'strategic_action_assigned', 'Você foi atribuído a uma ação',
                  '"' || p_title || '"', v_owner.user_id, auth.uid())
          returning id into v_notif_id;
        end if;
        if v_settings.email and v_owner.email is not null and btrim(v_owner.email) <> '' then
          insert into public.notification_email_outbox
            (notification_id, organization_id, recipients, subject, body_text)
          values
            (v_notif_id, p_organization_id, array[v_owner.email],
             '[Vecton] Você foi atribuído a uma ação',
             'Você foi atribuído como responsável pela ação "' || p_title || '".');
        end if;
      end loop;
    end if;
  end if;

  select * into v_out from public.strategic_actions where id = v_action_id;
  return v_out;
end;
$$;

grant execute on function public.strategic_save_action(uuid, uuid, uuid, text, text, text, text, date, numeric, uuid, uuid[], uuid[], uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. "Prazo de ação vencendo/vencida" — job diário (reaproveita o cron de
--    15 min já criado na 110, um segundo `perform` no mesmo job). Usa
--    "due_date <= hoje" (não "= hoje") pro aviso de vencida — cobre tanto o
--    dia exato quanto ação que já estava vencida antes deste deploy (ou um
--    tick de cron perdido), sempre disparando UMA vez só por marcador.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.strategic_actions
  add column if not exists due_soon_notified_at  timestamptz,
  add column if not exists due_today_notified_at timestamptz;

create or replace function public.run_strategic_action_due_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_type     public.notification_event_types%rowtype;
  v_row      record;
  v_settings public.notification_settings%rowtype;
  v_owner    record;
  v_notif_id uuid;
  v_title    text;
  v_body     text;
begin
  select * into v_type from public.notification_event_types where kind = 'strategic_action_due';
  if not found then return; end if;

  -- Aviso 1: até 3 dias antes de vencer.
  for v_row in
    select * from public.strategic_actions
    where due_date between v_today + 1 and v_today + 3
      and status not in ('done', 'cancelled')
      and due_soon_notified_at is null
  loop
    select * into v_settings from public.notification_settings
      where organization_id = v_row.organization_id and kind = 'strategic_action_due';
    if found and v_settings.is_active and (v_settings.in_app or v_settings.email) then
      v_title := 'Prazo de ação chegando';
      v_body  := '"' || v_row.title || '" vence em ' || (v_row.due_date - v_today) || ' dia(s).';
      for v_owner in
        select up.user_id, up.email
        from public.strategic_action_owners o
        join public.user_profiles up on up.user_id = o.user_id and up.organization_id = v_row.organization_id
        where o.action_id = v_row.id
      loop
        v_notif_id := null;
        if v_settings.in_app then
          insert into public.notifications (organization_id, kind, title, body, target_user_id)
          values (v_row.organization_id, 'strategic_action_due', v_title, v_body, v_owner.user_id)
          returning id into v_notif_id;
        end if;
        if v_settings.email and v_owner.email is not null and btrim(v_owner.email) <> '' then
          insert into public.notification_email_outbox (notification_id, organization_id, recipients, subject, body_text)
          values (v_notif_id, v_row.organization_id, array[v_owner.email], '[Vecton] ' || v_title, v_title || E'\n' || v_body);
        end if;
      end loop;
    end if;
    update public.strategic_actions set due_soon_notified_at = now() where id = v_row.id;
  end loop;

  -- Aviso 2: vence hoje (ou já venceu e ainda está aberta).
  for v_row in
    select * from public.strategic_actions
    where due_date <= v_today
      and due_date is not null
      and status not in ('done', 'cancelled')
      and due_today_notified_at is null
  loop
    select * into v_settings from public.notification_settings
      where organization_id = v_row.organization_id and kind = 'strategic_action_due';
    if found and v_settings.is_active and (v_settings.in_app or v_settings.email) then
      v_title := case when v_row.due_date = v_today then 'Prazo de ação vence hoje' else 'Prazo de ação vencido' end;
      v_body  := '"' || v_row.title || '"' || case
        when v_row.due_date = v_today then ' vence hoje.'
        else ' venceu em ' || to_char(v_row.due_date, 'DD/MM/YYYY') || '.'
      end;
      for v_owner in
        select up.user_id, up.email
        from public.strategic_action_owners o
        join public.user_profiles up on up.user_id = o.user_id and up.organization_id = v_row.organization_id
        where o.action_id = v_row.id
      loop
        v_notif_id := null;
        if v_settings.in_app then
          insert into public.notifications (organization_id, kind, title, body, target_user_id)
          values (v_row.organization_id, 'strategic_action_due', v_title, v_body, v_owner.user_id)
          returning id into v_notif_id;
        end if;
        if v_settings.email and v_owner.email is not null and btrim(v_owner.email) <> '' then
          insert into public.notification_email_outbox (notification_id, organization_id, recipients, subject, body_text)
          values (v_notif_id, v_row.organization_id, array[v_owner.email], '[Vecton] ' || v_title, v_title || E'\n' || v_body);
        end if;
      end loop;
    end if;
    update public.strategic_actions set due_today_notified_at = now() where id = v_row.id;
  end loop;
end;
$$;

revoke all on function public.run_strategic_action_due_reminders() from public, anon, authenticated;
grant execute on function public.run_strategic_action_due_reminders() to postgres, service_role;

-- Job novo e independente do 'vecton-scheduled-notifications' (110) — este
-- não depende de dia/horário escolhido pelo admin, roda 1x por dia igual
-- pra todas as orgs. Horário fixo 08:00 America/Sao_Paulo = 11:00 UTC.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'vecton-strategic-action-due-reminders';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'vecton-strategic-action-due-reminders',
    '0 11 * * *',
    'select public.run_strategic_action_due_reminders();'
  );
end;
$$;

commit;
