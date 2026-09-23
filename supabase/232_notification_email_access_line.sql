BEGIN;

-- ============================================================================
-- 232: linha "Acesse em: ..." no corpo do e-mail e do sininho das notificações
--
-- Pedido do usuário: e-mail e sininho ganham uma linha a mais dizendo onde no
-- menu a pessoa encontra a tela — no e-mail, pra quem não clica no botão; no
-- sininho, pra reforçar o caminho mesmo a notificação já sendo clicável.
-- Messenger fica de fora (não foi pedido) — continua só com o texto de hoje.
--
-- Escopo: os 9 tipos "carga aplicada"/RPS/A3 (1,2,3,4,5,6,8,9,10,11 da tela
-- de Parâmetros → Notificações). Falha no backup da RPS (7) fica de fora —
-- combinado com o usuário, é alerta de sistema, não "vá conferir o relatório".
--
-- Reemite 6 funções na última versão de cada (228 pros 5 tipos de carga
-- genérica, 227 pro Fluxo de Caixa, 178 pros 3 tipos de A3 Estratégico e pro
-- lembrete de RPS), só acrescentando a linha nova no body do sininho e no
-- body_text do e-mail — resto do corpo de cada função idêntico ao que já
-- estava valendo.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. notify_batch_applied — kinds 1 a 5 (DRE real/planejado, Headcount,
--    Vendas real/planejado). Base: 228.
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
  v_email_path text;
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
  if v_kind = 'headcount_batch_applied' then
    v_title := case
      when v_loadtype = 'planejado' then 'Carga de Headcount (planejado) aplicada'
      when v_loadtype like 'cenario:%' then 'Carga de Headcount (cenário) aplicada'
      else v_type.label
    end;
  end if;

  v_body := v_period
    || case when v_rows > 0 then ' · ' || to_char(v_rows, 'FM999G999G999') || ' linhas' else '' end
    || case when v_actor_nm is not null then ' · por ' || v_actor_nm else '' end;

  v_email_path := case v_kind
    when 'actuals_batch_applied'              then 'Relatórios Gerenciais/DRE'
    when 'budget_batch_applied'               then 'Relatórios Gerenciais/DRE'
    when 'headcount_batch_applied'            then 'Relatórios Gerenciais/Headcount'
    when 'comercial_realizado_batch_applied'  then 'Relatórios Gerenciais/Comercial'
    when 'comercial_planejado_batch_applied'  then 'Relatórios Gerenciais/Comercial'
    else null
  end;

  if v_type.target_report_id is not null then
    v_link := '?report=' || v_type.target_report_id
           || '&ano='    || new.reference_year::text
           || '&mes='    || new.reference_month::text;
  end if;

  if v_settings.in_app then
    insert into public.notifications
      (organization_id, kind, title, body, ref_year, ref_month, target_report_id, actor_user_id)
    values
      (new.organization_id, v_kind, v_title,
       v_body || E'\n' || 'Acesse em: Vecton/' || v_email_path || ' e confirme as atualizações.',
       new.reference_year, new.reference_month, v_type.target_report_id, v_actor)
    returning id into v_notif_id;
  end if;

  if v_settings.email and array_length(v_settings.email_recipients, 1) > 0 then
    insert into public.notification_email_outbox
      (notification_id, organization_id, recipients, subject, body_text, link_path)
    values
      (v_notif_id, new.organization_id, v_settings.email_recipients,
       '[Vecton] ' || v_title || ' — ' || v_period,
       v_title || E'\n' || v_body
         || E'\n' || 'Acesse em: Vecton/' || v_email_path || ' e confirme as atualizações.',
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
-- 2. notify_fc_batch_applied — kind 6 (Fluxo de Caixa). Base: 227.
-- ─────────────────────────────────────────────────────────────────────────────
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
  VALUES(NEW.organization_id,'fc_batch_applied',title,
    detail || E'\n' || 'Acesse em: Vecton/Relatórios Gerenciais/Fluxo de Caixa e confirme as atualizações.',
    batch.reference_year,12,'cashFlow',NEW.actor_id) RETURNING id INTO notice_id;
 END IF;
 IF settings.email AND coalesce(array_length(settings.email_recipients,1),0)>0 THEN
  INSERT INTO public.notification_email_outbox(notification_id,organization_id,recipients,subject,body_text,link_path)
  VALUES(notice_id,NEW.organization_id,settings.email_recipients,'[Vecton] ' || title || ' — ' || batch.reference_year::text,
    title || E'\n' || detail || E'\n' || 'Acesse em: Vecton/Relatórios Gerenciais/Fluxo de Caixa e confirme as atualizações.',
    link);
 END IF;
 IF settings.messenger AND coalesce(array_length(settings.messenger_recipients,1),0)>0 THEN
  PERFORM public.notify_via_messenger(NEW.organization_id,title || ' — ' || batch.reference_year::text,detail,settings.messenger_recipients);
 END IF;
 RETURN NEW;
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. notify_strategic_kpi_off_target — kind 9 (A3: indicador fora da meta).
--    Base: 178.
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
      (new.organization_id, 'strategic_kpi_off_target', v_title,
       v_body || E'\n' || 'Acesse em: Vecton/A3 Estratégicos e revise o indicador.',
       new.year, new.month, auth.uid())
    returning id into v_notif_id;
  end if;

  if v_settings.email and array_length(v_settings.email_recipients, 1) > 0 then
    insert into public.notification_email_outbox
      (notification_id, organization_id, recipients, subject, body_text)
    values
      (v_notif_id, new.organization_id, v_settings.email_recipients,
       '[Vecton] ' || v_title,
       v_title || E'\n' || v_body
         || E'\n' || 'Acesse em: Vecton/A3 Estratégicos e revise o indicador.');
  end if;

  if v_settings.messenger and array_length(v_settings.messenger_recipients, 1) > 0 then
    perform public.notify_via_messenger(new.organization_id, v_title, v_body, v_settings.messenger_recipients);
  end if;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. strategic_save_action — kind 11 (A3: você foi atribuído a uma ação).
--    Base: 178. Só o bloco de e-mail muda; resto idêntico.
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
                  '"' || p_title || '"' || E'\n' || 'Acesse em: Vecton/A3 Estratégicos e confira os detalhes da ação.',
                  v_owner.user_id, auth.uid())
          returning id into v_notif_id;
        end if;
        if v_settings.email and v_owner.email is not null and btrim(v_owner.email) <> '' then
          insert into public.notification_email_outbox
            (notification_id, organization_id, recipients, subject, body_text)
          values
            (v_notif_id, p_organization_id, array[v_owner.email],
             '[Vecton] Você foi atribuído a uma ação',
             'Você foi atribuído como responsável pela ação "' || p_title || '".'
               || E'\n' || 'Acesse em: Vecton/A3 Estratégicos e confira os detalhes da ação.');
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
-- 5. run_strategic_action_due_reminders — kind 10 (A3: prazo de ação
--    vencendo/vencida). Base: 178. Os dois avisos (3 dias antes / vence-
--    vencida) ganham a linha nova.
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
          values (v_row.organization_id, 'strategic_action_due', v_title,
            v_body || E'\n' || 'Acesse em: Vecton/A3 Estratégicos e atualize o status da ação.',
            v_owner.user_id)
          returning id into v_notif_id;
        end if;
        if v_settings.email and v_owner.email is not null and btrim(v_owner.email) <> '' then
          insert into public.notification_email_outbox (notification_id, organization_id, recipients, subject, body_text)
          values (v_notif_id, v_row.organization_id, array[v_owner.email], '[Vecton] ' || v_title,
            v_title || E'\n' || v_body
              || E'\n' || 'Acesse em: Vecton/A3 Estratégicos e atualize o status da ação.');
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
          values (v_row.organization_id, 'strategic_action_due', v_title,
            v_body || E'\n' || 'Acesse em: Vecton/A3 Estratégicos e atualize o status da ação.',
            v_owner.user_id)
          returning id into v_notif_id;
        end if;
        if v_settings.email and v_owner.email is not null and btrim(v_owner.email) <> '' then
          insert into public.notification_email_outbox (notification_id, organization_id, recipients, subject, body_text)
          values (v_notif_id, v_row.organization_id, array[v_owner.email], '[Vecton] ' || v_title,
            v_title || E'\n' || v_body
              || E'\n' || 'Acesse em: Vecton/A3 Estratégicos e atualize o status da ação.');
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
-- 6. run_scheduled_notifications — kind 8 (Lembrete RPS de Gestão). Base: 178.
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
              'Não esqueça de preencher a RPS de Gestão desta semana.'
                || E'\n' || 'Acesse em: Vecton/RPS Gestão e preencha a semana.')
      returning id into v_notif_id;
    end if;

    if v_row.email and array_length(v_row.email_recipients, 1) > 0 then
      insert into public.notification_email_outbox
        (notification_id, organization_id, recipients, subject, body_text)
      values
        (v_notif_id, v_row.organization_id, v_row.email_recipients,
         '[Vecton] ' || v_type.label,
         v_type.label || E'\n' || 'Não esqueça de preencher a RPS de Gestão desta semana.'
           || E'\n' || 'Acesse em: Vecton/RPS Gestão e preencha a semana.');
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

COMMIT;
