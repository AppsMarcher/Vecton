begin;

-- Notificações (sino + e-mail) dos planos de ação de OPEX.
--   * Eventos nascem NO SERVIDOR, dentro da mesma transação da mutação (opex_emit, chamada pelas RPCs da 348):
--     rollback da atribuição desfaz sino e e-mail juntos. Nada depende de listener do botão.
--   * Destinatário individual (notifications.target_user_id); nunca broadcast para a organização.
--   * Os nove tipos nascem com sino E e-mail ligados (o default histórico de e-mail é desligado).
--   * Conteúdo operacional mínimo: sem valores, justificativa financeira, impacto ou anexos — igual para todos os destinatários.
--   * Idempotência: opex_notification_log (ação, ciclo, versão, tipo, destinatário, canal) é único; repetir a mutação não duplica.
--   * Estados independentes: evento criado · lido no sino (notification_reads) · e-mail na outbox (status) · ciência (opex_action_plans).
-- Reemite notifications_feed (base: 157) acrescentando ref_action_id para o deep link; o tipo de retorno muda, por isso drop + create.
-- Idempotente.

alter table public.notifications add column if not exists ref_action_id uuid;
-- Contexto OPEX na outbox: permite revalidar destinatário e atribuição ANTES de enviar (migration 351).
alter table public.notification_email_outbox
  add column if not exists opex_action_id uuid,
  add column if not exists opex_kind text,
  add column if not exists opex_recipient_user_id uuid,
  add column if not exists opex_assignment_cycle integer;
create index if not exists notifications_ref_action_idx on public.notifications (ref_action_id) where ref_action_id is not null;

insert into public.notification_event_types (kind, label, description, target_report_id, sort_order, trigger_mode, target_mode) values
  ('opex_action_assigned',     'OPEX: ação atribuída a você',        'Avisa a pessoa quando uma ação de OPEX é atribuída a ela.',                          null, 100, 'event', 'assignee'),
  ('opex_action_unassigned',   'OPEX: responsabilidade retirada',    'Avisa o responsável anterior quando uma ação é reatribuída.',                         null, 110, 'event', 'assignee'),
  ('opex_action_changed',      'OPEX: ação atualizada',              'Avisa quando o prazo ou o resultado esperado mudam ou o dono do plano é trocado.',    null, 120, 'event', 'assignee'),
  ('opex_action_acknowledged', 'OPEX: ciência confirmada',           'Avisa o dono do plano quando o responsável confirma ciência.',                        null, 130, 'event', 'assignee'),
  ('opex_action_due_soon',     'OPEX: prazo da ação próximo',        'Avisa o responsável até 3 dias antes do prazo.',                                      null, 140, 'event', 'assignee'),
  ('opex_action_overdue',      'OPEX: ação vencida',                 'Avisa o responsável e o dono do plano quando o prazo vence.',                         null, 150, 'event', 'assignee'),
  ('opex_action_submitted',    'OPEX: entrega aguardando validação', 'Avisa o dono do plano quando o responsável conclui e pede validação.',                null, 160, 'event', 'assignee'),
  ('opex_action_validated',    'OPEX: entrega validada',             'Avisa o responsável quando o dono valida a entrega.',                                 null, 170, 'event', 'assignee'),
  ('opex_action_returned',     'OPEX: ajustes solicitados',          'Avisa o responsável quando o dono devolve a entrega para ajuste.',                    null, 180, 'event', 'assignee')
on conflict (kind) do update
  set label = excluded.label, description = excluded.description, target_report_id = excluded.target_report_id,
      sort_order = excluded.sort_order, trigger_mode = excluded.trigger_mode, target_mode = excluded.target_mode;

insert into public.notification_settings (organization_id, kind, in_app, email)
select o.id, t.kind, true, true
from public.organizations o
join public.notification_event_types t on t.kind like 'opex\_action\_%'
on conflict (organization_id, kind) do nothing;

-- ---------------------------------------------------------------- feed com referência segura à ação
drop function if exists public.notifications_feed(int);
create function public.notifications_feed(p_limit int default 30)
returns table (
  id               uuid,
  kind             text,
  title            text,
  body             text,
  ref_year         int,
  ref_month        int,
  target_report_id text,
  created_at       timestamptz,
  is_read          boolean,
  ref_action_id    uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.kind, n.title, n.body, n.ref_year, n.ref_month,
         n.target_report_id, n.created_at,
         (r.notification_id is not null) as is_read,
         n.ref_action_id
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
revoke all on function public.notifications_feed(int) from public, anon;
grant execute on function public.notifications_feed(int) to authenticated;

-- ---------------------------------------------------------------- histórico de entrega (não depende da retenção do feed/outbox)
create table if not exists public.opex_notification_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  action_id uuid not null,
  kind text not null,
  recipient_user_id uuid not null,
  assignment_cycle integer not null,
  action_version integer not null,
  channel text not null check (channel in ('in_app', 'email')),
  status text not null default 'queued' check (status in ('queued', 'suppressed', 'no_email', 'disabled')),
  notification_id uuid,
  outbox_id uuid,
  created_at timestamptz not null default now(),
  unique (action_id, kind, recipient_user_id, assignment_cycle, action_version, channel)
);
alter table public.opex_notification_log enable row level security;
revoke all on public.opex_notification_log from public, anon, authenticated;
create index if not exists opex_notification_log_action_idx on public.opex_notification_log (action_id, created_at desc);

-- ---------------------------------------------------------------- emissão (substitui o gancho vazio da 348)
create or replace function public.opex_emit(p_action uuid, p_kind text, p_recipient uuid, p_cycle integer, p_version integer)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  p public.opex_action_plans; v_kind text; v_type public.notification_event_types%rowtype; v_settings public.notification_settings%rowtype;
  v_actor uuid := auth.uid(); v_actor_name text; v_owner_name text; v_assignee_name text;
  v_subject text; v_heading text; v_lines text[]; v_body text; v_email text; v_notif uuid; v_outbox uuid; v_rows integer;
  due_txt text; ctx text;
begin
  select * into p from public.opex_action_plans where id = p_action;
  if not found then return; end if;
  v_kind := 'opex_action_' || case p_kind when 'owner_changed' then 'changed' else p_kind end;
  select * into v_type from public.notification_event_types where kind = v_kind;
  if not found then return; end if;
  if not public.opex_is_active_member(p.organization_id, p_recipient) then
    insert into public.opex_notification_log (organization_id, action_id, kind, recipient_user_id, assignment_cycle, action_version, channel, status)
    values (p.organization_id, p.id, p_kind, p_recipient, p_cycle, p_version, 'in_app', 'suppressed') on conflict do nothing;
    return;
  end if;

  select * into v_settings from public.notification_settings where organization_id = p.organization_id and kind = v_kind;
  if not found then
    insert into public.notification_settings (organization_id, kind, in_app, email) values (p.organization_id, v_kind, true, true) on conflict do nothing;
    select * into v_settings from public.notification_settings where organization_id = p.organization_id and kind = v_kind;
  end if;
  if not v_settings.is_active then return; end if;

  v_actor_name := coalesce(public.opex_user_name(p.organization_id, v_actor), public.opex_user_name(p.organization_id, p.owner_user_id));
  v_owner_name := public.opex_user_name(p.organization_id, p.owner_user_id);
  v_assignee_name := public.opex_user_name(p.organization_id, p.assignee_user_id);
  due_txt := to_char(p.due_date, 'DD/MM/YYYY');
  ctx := '"' || p.title || '"';

  case p_kind
    when 'assigned' then
      v_subject := 'Vecton — nova ação atribuída a você'; v_heading := 'Nova ação atribuída a você';
      v_lines := array[v_actor_name || ' atribuiu a ação: ' || p.title || '.', 'Prazo: ' || due_txt, 'Resultado esperado: ' || p.expected_result];
    when 'unassigned' then
      v_subject := 'Vecton — sua responsabilidade foi retirada'; v_heading := 'Responsabilidade retirada';
      v_lines := array[v_actor_name || ' retirou sua responsabilidade pela ação: ' || p.title || '.'];
    when 'changed' then
      v_subject := 'Vecton — ação atualizada'; v_heading := 'Ação atualizada';
      v_lines := array['O prazo ou o resultado esperado da ação foi alterado: ' || p.title || '.', 'Prazo: ' || due_txt, 'Resultado esperado: ' || p.expected_result];
    when 'owner_changed' then
      if p_recipient = p.owner_user_id then
        v_subject := 'Vecton — você é o novo dono de um plano de ação'; v_heading := 'Você é o novo dono do plano';
        v_lines := array['Você passou a acompanhar a ação: ' || p.title || '.', 'Prazo: ' || due_txt];
      else
        v_subject := 'Vecton — o dono do plano de ação mudou'; v_heading := 'Dono do plano alterado';
        v_lines := array['O dono da ação ' || ctx || ' agora é ' || v_owner_name || '.'];
      end if;
    when 'acknowledged' then
      v_subject := 'Vecton — ciência confirmada'; v_heading := 'Ciência confirmada';
      v_lines := array[v_assignee_name || ' confirmou ciência da ação: ' || p.title || '.'];
    when 'due_soon' then
      v_subject := 'Vecton — prazo próximo'; v_heading := 'Prazo próximo';
      v_lines := array['A ação ' || ctx || ' vence em ' || due_txt || '.'];
    when 'overdue' then
      v_subject := 'Vecton — ação vencida'; v_heading := 'Ação vencida';
      v_lines := array[case when p_recipient = p.assignee_user_id then 'O prazo da ação ' || ctx || ' venceu em ' || due_txt || '.'
                            else 'O prazo da ação ' || ctx || ' venceu em ' || due_txt || '. Responsável: ' || v_assignee_name || '.' end];
    when 'submitted' then
      v_subject := 'Vecton — entrega aguardando validação'; v_heading := 'Entrega aguardando validação';
      v_lines := array[v_assignee_name || ' concluiu a ação ' || ctx || ' e aguarda sua validação.'];
    when 'validated' then
      v_subject := 'Vecton — entrega validada'; v_heading := 'Entrega validada';
      v_lines := array[v_actor_name || ' validou a entrega da ação: ' || p.title || '.'];
    when 'returned' then
      v_subject := 'Vecton — ajustes solicitados'; v_heading := 'Ajustes solicitados';
      v_lines := array[v_actor_name || ' solicitou ajustes na ação: ' || p.title || '.', 'Veja os detalhes na ação.'];
    else return;
  end case;
  v_body := array_to_string(v_lines, ' · ');

  -- sino
  if v_settings.in_app then
    insert into public.opex_notification_log (organization_id, action_id, kind, recipient_user_id, assignment_cycle, action_version, channel)
    values (p.organization_id, p.id, p_kind, p_recipient, p_cycle, p_version, 'in_app') on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      insert into public.notifications (organization_id, kind, title, body, target_user_id, actor_user_id, ref_action_id)
      values (p.organization_id, v_kind, v_heading, v_body, p_recipient, v_actor, p.id) returning id into v_notif;
      update public.opex_notification_log set notification_id = v_notif
       where action_id = p.id and kind = p_kind and recipient_user_id = p_recipient and assignment_cycle = p_cycle and action_version = p_version and channel = 'in_app';
    end if;
  end if;

  -- e-mail (fila): a ação continua válida se o envio falhar; sem e-mail cadastrado fica registrado
  if v_settings.email then
    insert into public.opex_notification_log (organization_id, action_id, kind, recipient_user_id, assignment_cycle, action_version, channel)
    values (p.organization_id, p.id, p_kind, p_recipient, p_cycle, p_version, 'email') on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      select nullif(btrim(email), '') into v_email from public.user_profiles where organization_id = p.organization_id and user_id = p_recipient;
      if v_email is null then
        update public.opex_notification_log set status = 'no_email'
         where action_id = p.id and kind = p_kind and recipient_user_id = p_recipient and assignment_cycle = p_cycle and action_version = p_version and channel = 'email';
        if p_kind = 'assigned' and p.owner_user_id <> p_recipient then
          insert into public.notifications (organization_id, kind, title, body, target_user_id, actor_user_id, ref_action_id)
          values (p.organization_id, 'opex_action_changed', 'Responsável sem e-mail cadastrado',
                  public.opex_user_name(p.organization_id, p_recipient) || ' foi avisado só pelo sino da ação: ' || p.title || '.', p.owner_user_id, v_actor, p.id);
        end if;
      else
        insert into public.notification_email_outbox (notification_id, organization_id, recipients, subject, body_text, link_path,
          opex_action_id, opex_kind, opex_recipient_user_id, opex_assignment_cycle)
        values (v_notif, p.organization_id, array[v_email], v_subject, v_heading || E'\n' || array_to_string(v_lines, E'\n'), '?acao=' || p.id::text,
          p.id, p_kind, p_recipient, p_cycle)
        returning id into v_outbox;
        update public.opex_notification_log set outbox_id = v_outbox
         where action_id = p.id and kind = p_kind and recipient_user_id = p_recipient and assignment_cycle = p_cycle and action_version = p_version and channel = 'email';
      end if;
    end if;
  end if;
end;
$$;
revoke all on function public.opex_emit(uuid, text, uuid, integer, integer) from public, anon, authenticated;

commit;
