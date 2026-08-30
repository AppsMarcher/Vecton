begin;

-- ============================================================================
-- 178: canal "Messenger" na Central de Notificações
-- Criado por: Ricardo Guimarães — 2026-08-29
--
-- Pedido do usuário: 3ª opção de canal (Messenger, ao lado de Sininho e
-- E-mail) na tela Parâmetros → Notificações, com seletor de destinatários
-- igual ao do e-mail. Alinhado em 3 perguntas antes de escrever qualquer
-- coisa:
--   1) Modelo da conversa: um assunto NOVO a cada disparo (igual o e-mail
--      hoje — não é uma thread única reaproveitada por tipo).
--   2) Remetente: aviso do sistema, sem pessoa por trás (author_user_id
--      nulo) — igual o e-mail hoje não tem remetente pessoal.
--   3) Escopo: vale pros 8 tipos de hoje — os 5 de carga aplicada, o
--      agendado (Lembrete RPS de Gestão, 110) e os 2 de responsável direto
--      do A3 Estratégico (Prazo de ação, Ação atribuída, 157) — mesma
--      paridade que sininho/e-mail já têm.
--
-- Destinatário do Messenger é uuid (usuário cadastrado no Vecton), não
-- e-mail — não existe "destinatário externo" pra correio interno.
--
-- GOTCHA descoberto no caminho: um aviso automático pra 1 destinatário só
-- (o caso mais comum dos 2 tipos "assignee") NÃO aparecia em lugar nenhum
-- da tela do Messenger com o modelo de thread que já existia. contacts_list
-- (108) só monta a conversa 1:1 quando existe um SEGUNDO participante além
-- de quem está olhando; groups_list (108) só lista quando
-- `audience = 'organization'` ou > 2 participantes. Uma thread de sistema
-- com 1 único destinatário (sem remetente humano como 2º participante) não
-- batia em nenhum dos dois filtros — ficaria gravada no banco e invisível
-- pro usuário. Resolvido com uma 3ª audience, 'system': sempre visível,
-- entra no bloco "Grupos" da lista independente de quantos participantes
-- tem (seção 2 e 5 abaixo).
--
-- REGRESSÃO ENCONTRADA E CORRIGIDA DE PASSAGEM: a 160 (multi-A3 edit)
-- reescreveu strategic_save_action() a partir de uma cópia anterior à 157 e
-- derrubou junto o bloco de notificação "Ação atribuída a você" (sininho e
-- e-mail já tinham parado de disparar nesse tipo desde então, silenciosa-
-- mente) — mesmo padrão de bug já visto e documentado na 116. Reintroduzido
-- na seção 6 abaixo porque essa função precisava ser mexida de qualquer
-- forma pra somar o Messenger.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. notification_settings: canal + destinatários
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.notification_settings
  add column if not exists messenger boolean not null default false,
  add column if not exists messenger_recipients uuid[] not null default '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. message_threads: 3ª audience pro aviso automático (ver gotcha acima)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.message_threads drop constraint if exists message_threads_audience_check;
alter table public.message_threads
  add constraint message_threads_audience_check check (audience in ('people', 'organization', 'system'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Disparo do aviso — chamado pelos 5 pontos que já escrevem em
--    notification_email_outbox (092/110/116/157). Não é RPC de cliente: só
--    quem chama são as próprias triggers/RPCs SECURITY DEFINER, por isso o
--    revoke no fim — um usuário autenticado não deve conseguir criar uma
--    thread de sistema pra qualquer um da org só chamando isto direto.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_via_messenger(
  p_organization_id uuid,
  p_subject         text,
  p_body            text,
  p_user_ids        uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_count  int;
begin
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return;
  end if;

  insert into public.message_threads (organization_id, subject, audience, created_by)
  values (p_organization_id, p_subject, 'system', null)
  returning id into v_thread;

  insert into public.message_thread_participants (thread_id, user_id, organization_id)
  select v_thread, up.user_id, p_organization_id
  from public.user_profiles up
  where up.organization_id = p_organization_id
    and up.user_id = any(p_user_ids)
  on conflict do nothing;

  select count(*) into v_count
  from public.message_thread_participants where thread_id = v_thread;
  if v_count = 0 then
    -- Nenhum destinatário válido resolvido (ex.: gente removida da org
    -- depois de configurada na lista) — não deixa thread órfã pra trás.
    delete from public.message_threads where id = v_thread;
    return;
  end if;

  insert into public.messages (thread_id, organization_id, author_user_id, body)
  values (v_thread, p_organization_id, null, p_body);
end;
$$;

revoke all on function public.notify_via_messenger(uuid, text, text, uuid[]) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. notify_batch_applied — reemitida com base na 116 (última versão), só
--    somando o Messenger.
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
  v_link     text;
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

  if not v_settings.is_active then
    return new;
  end if;

  if not v_settings.in_app and not v_settings.email and not v_settings.messenger then
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

  if v_type.target_report_id is not null then
    v_link := '?report=' || v_type.target_report_id
           || '&ano='    || new.reference_year::text
           || '&mes='    || new.reference_month::text;
  end if;

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
      (notification_id, organization_id, recipients, subject, body_text, link_path)
    values
      (v_notif_id, new.organization_id, v_settings.email_recipients,
       '[Vecton] ' || v_title || ' — ' || v_period,
       v_title || E'\n' || v_body,
       v_link);
  end if;

  if v_settings.messenger and array_length(v_settings.messenger_recipients, 1) > 0 then
    perform public.notify_via_messenger(
      new.organization_id, v_title || ' — ' || v_period, v_body, v_settings.messenger_recipients);
  end if;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. notify_strategic_kpi_off_target — reemitida com base na 157, só
--    somando o Messenger.
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
  if not v_settings.in_app and not v_settings.email and not v_settings.messenger then return new; end if;

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

  if v_settings.messenger and array_length(v_settings.messenger_recipients, 1) > 0 then
    perform public.notify_via_messenger(new.organization_id, v_title, v_body, v_settings.messenger_recipients);
  end if;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. strategic_save_action — reemitida com base na 160 (última versão, com
--    strategic_action_editable_all), RESTAURANDO o bloco de notificação
--    "Ação atribuída a você" que a própria 160 derrubou sem querer (ver
--    cabeçalho), e somando o Messenger nele.
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
    if not public.strategic_action_editable_all(p_id) then
      raise exception 'sem permissão para editar esta ação — precisa poder editar todos os A3 já vinculados a ela';
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

    if found and v_settings.is_active and (v_settings.in_app or v_settings.email or v_settings.messenger) then
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
        if v_settings.messenger then
          perform public.notify_via_messenger(
            p_organization_id, 'Você foi atribuído a uma ação',
            'Você foi atribuído como responsável pela ação "' || p_title || '".',
            array[v_owner.user_id]);
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
-- 7. run_strategic_action_due_reminders — reemitida com base na 157, só
--    somando o Messenger nos dois avisos (3 dias antes / vence-vencida).
-- ─────────────────────────────────────────────────────────────────────────────
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
    if found and v_settings.is_active and (v_settings.in_app or v_settings.email or v_settings.messenger) then
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
        if v_settings.messenger then
          perform public.notify_via_messenger(v_row.organization_id, v_title, v_body, array[v_owner.user_id]);
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
    if found and v_settings.is_active and (v_settings.in_app or v_settings.email or v_settings.messenger) then
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
        if v_settings.messenger then
          perform public.notify_via_messenger(v_row.organization_id, v_title, v_body, array[v_owner.user_id]);
        end if;
      end loop;
    end if;
    update public.strategic_actions set due_today_notified_at = now() where id = v_row.id;
  end loop;
end;
$$;

revoke all on function public.run_strategic_action_due_reminders() from public, anon, authenticated;
grant execute on function public.run_strategic_action_due_reminders() to postgres, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. run_scheduled_notifications — reemitida com base na 110, só somando o
--    Messenger (o único tipo 'scheduled' hoje é rps_gestao_reminder).
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

    if v_row.messenger and array_length(v_row.messenger_recipients, 1) > 0 then
      perform public.notify_via_messenger(
        v_row.organization_id, v_type.label,
        'Não esqueça de preencher a RPS de Gestão desta semana.', v_row.messenger_recipients);
    end if;

    update public.notification_settings
       set schedule_last_fired_on = v_today
     where organization_id = v_row.organization_id and kind = v_row.kind;
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. contacts_list / groups_list / messages_unread_count: enxergar a
--    audience 'system' nova (ver gotcha no cabeçalho). thread_messages:
--    remetente nulo aparece como "Vecton" em vez do genérico "Alguém".
--    Reemitidas com base na 108 (contacts_list/groups_list/unread_count) e
--    na 098 (thread_messages), últimas versões — só somando o predicado/
--    fallback novo, sem mexer no resto.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.messages_unread_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  with meus_threads as (
    select t.id,
           t.organization_id,
           t.audience,
           me.joined_at,
           (select count(*) from public.message_thread_participants p where p.thread_id = t.id) as membros
    from public.message_threads t
    join public.message_thread_participants me
      on me.thread_id = t.id and me.user_id = auth.uid()
  ),
  threads_visiveis as (
    select mt.*
    from meus_threads mt
    where mt.audience = 'organization'
       or mt.audience = 'system'
       or mt.membros > 2
       or (
         mt.audience = 'people'
         and mt.membros = 2
         and exists (
           select 1
           from public.message_thread_participants outro
           join public.user_profiles up
             on up.user_id = outro.user_id and up.organization_id = mt.organization_id
           where outro.thread_id = mt.id
             and outro.user_id <> auth.uid()
         )
       )
  )
  select count(*)::int
  from threads_visiveis tv
  join public.messages m on m.thread_id = tv.id
  left join public.message_reads r
    on r.message_id = m.id and r.user_id = auth.uid()
  where r.message_id is null
    and m.author_user_id is distinct from auth.uid()
    and m.created_at >= tv.joined_at;
$$;

create or replace function public.groups_list()
returns table (
  thread_id  uuid,
  titulo     text,
  audience   text,
  membros    int,
  nao_lidas  int,
  ultima_em  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id,
         case
           when t.audience = 'system' then coalesce(nullif(btrim(coalesce(t.subject, '')), ''), 'Aviso do sistema')
           else coalesce(
             nullif(btrim(coalesce(t.name, '')), ''),
             case when t.audience = 'organization' then 'Toda a organização' else null end,
             (select string_agg(coalesce(nullif(btrim(coalesce(up.full_name, '')), ''), up.email), ', ')
                from public.message_thread_participants p2
                join public.user_profiles up on up.user_id = p2.user_id
               where p2.thread_id = t.id and p2.user_id <> auth.uid()),
             'Grupo'
           )
         end,
         t.audience,
         (select count(*)::int from public.message_thread_participants p3 where p3.thread_id = t.id),
         coalesce((
           select count(*)::int
           from public.messages m
           left join public.message_reads r on r.message_id = m.id and r.user_id = auth.uid()
           where m.thread_id = t.id
             and r.message_id is null
             and m.author_user_id is distinct from auth.uid()
             and m.created_at >= me.joined_at
         ), 0),
         t.last_message_at
  from public.message_threads t
  join public.message_thread_participants me
    on me.thread_id = t.id and me.user_id = auth.uid()
  where t.audience = 'organization'
     or t.audience = 'system'
     or (select count(*) from public.message_thread_participants p4 where p4.thread_id = t.id) > 2
  order by t.last_message_at desc;
$$;

drop function if exists public.thread_messages(uuid);

create or replace function public.thread_messages(p_thread uuid)
returns table (
  id          uuid,
  autor       text,
  autor_id    uuid,
  body        text,
  kind        text,
  created_at  timestamptz,
  is_read     boolean,
  status      text,
  anexos      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with destinatarios as (
    select count(*)::int as total
    from public.message_thread_participants p
    where p.thread_id = p_thread and p.user_id <> auth.uid()
  )
  select m.id,
         case when m.author_user_id is null then 'Vecton'
              else coalesce(nullif(btrim(coalesce(ap.full_name, '')), ''), 'Alguém') end,
         m.author_user_id,
         m.body,
         m.kind,
         m.created_at,
         (r.message_id is not null),
         case
           when m.author_user_id is distinct from auth.uid() then null
           when d.total = 0 then 'sent'
           when (select count(*) from public.message_reads mr
                 where mr.message_id = m.id and mr.user_id <> auth.uid()) >= d.total then 'read'
           when (select count(*) from public.message_deliveries md
                 where md.message_id = m.id and md.user_id <> auth.uid()) >= d.total then 'delivered'
           else 'sent'
         end,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', a.id, 'path', a.storage_path, 'thumb', a.thumb_path,
                    'name', a.file_name, 'mime', a.mime_type, 'size', a.size_bytes)
                  order by a.created_at)
           from public.message_attachments a
           where a.message_id = m.id
         ), '[]'::jsonb)
  from public.messages m
  cross join destinatarios d
  join public.message_thread_participants me
    on me.thread_id = m.thread_id and me.user_id = auth.uid()
  left join public.user_profiles ap
    on ap.user_id = m.author_user_id and ap.organization_id = m.organization_id
  left join public.message_reads r
    on r.message_id = m.id and r.user_id = auth.uid()
  where m.thread_id = p_thread
    and m.created_at >= me.joined_at
  order by m.created_at asc;
$$;

revoke all on function public.messages_unread_count() from public, anon;
grant execute on function public.messages_unread_count() to authenticated;
grant execute on function public.groups_list() to authenticated;
grant execute on function public.thread_messages(uuid) to authenticated;

commit;
