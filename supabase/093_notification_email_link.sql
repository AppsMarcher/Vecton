-- 093: link direto pro relatório no e-mail de notificação
-- Criado por: Ricardo Guimarães — 2026-08-03
--
-- O botão "Abrir o Vecton" levava pra home do app. Agora leva pro relatório do
-- evento, no mês certo (ex.: Painel de Vendas em Agosto/2026).
--
-- O caminho é montado AQUI, na trigger, e não na Edge Function, por um motivo:
-- quando o sininho está desligado e só o e-mail está ligado, não existe linha
-- em `notifications` pra function consultar (notification_id fica nulo).
-- Gravando o link junto do item da fila, o e-mail sai correto nos dois casos.

alter table public.notification_email_outbox
  add column if not exists link_path text;

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

  -- Caminho relativo; o domínio fica na Edge Function (um lugar só).
  -- target_report_id é identificador simples ("comercialPainel"), sem
  -- necessidade de escape.
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

  return new;
end;
$$;
