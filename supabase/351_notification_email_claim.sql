begin;

-- Claim REAL da fila de e-mail (notification_email_outbox) + revalidação antes do envio.
--
-- Problema: o "claim" da Edge Function send-notification-emails fazia `update({status:'pending'}) ... eq('status','pending')`,
-- que mantém o status e portanto NÃO reserva nada: duas execuções sobrepostas pegavam os mesmos itens e enviavam em dobro.
-- Agora a reserva é uma RPC transacional (FOR UPDATE SKIP LOCKED) com token e lease:
--   * itens reservados somem para outros workers até o lease expirar (worker interrompido => item volta sozinho);
--   * a tentativa é contada na reserva, então um item que derruba o worker repetidamente chega a 'failed' em vez de girar para sempre;
--   * resultado só é gravado por quem tem o token da reserva (resposta antiga não sobrescreve estado novo).
-- Vale para TODOS os tipos de e-mail (os antigos não têm colunas opex_* e passam direto).
-- "enviado" = aceite do provedor; não prova entrega nem leitura. Falha do provedor nunca desfaz a ação de origem.
-- Idempotente.

alter table public.notification_email_outbox
  add column if not exists claimed_token uuid,
  add column if not exists claimed_until timestamptz;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.notification_email_outbox'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%status%' loop
    execute format('alter table public.notification_email_outbox drop constraint %I', c.conname);
  end loop;
  alter table public.notification_email_outbox
    add constraint notification_email_outbox_status_check check (status in ('pending', 'sent', 'failed', 'suppressed'));
end;
$$;

drop index if exists public.notification_email_outbox_pending_idx;
create index if not exists notification_email_outbox_pending_idx
  on public.notification_email_outbox (created_at) where status = 'pending';

create or replace function public.notification_email_claim(p_limit integer, p_lease_seconds integer, p_token uuid, p_max_attempts integer default 5)
returns setof public.notification_email_outbox
language plpgsql security definer set search_path to 'public'
as $$
begin
  -- item cujo worker morreu e que já esgotou as tentativas: falha visível, sem novo envio
  update public.notification_email_outbox
     set status = 'failed', last_error = coalesce(last_error, 'Tentativas esgotadas (envio interrompido)'), claimed_token = null, claimed_until = null
   where status = 'pending' and attempts >= p_max_attempts and (claimed_until is null or claimed_until < now());

  return query
  with picked as (
    select id from public.notification_email_outbox
     where status = 'pending' and attempts < p_max_attempts and (claimed_until is null or claimed_until < now())
     order by created_at, id
     limit least(greatest(coalesce(p_limit, 10), 1), 50)
     for update skip locked
  )
  update public.notification_email_outbox o
     set claimed_token = p_token, claimed_until = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30)),
         attempts = o.attempts + 1
    from picked
   where o.id = picked.id
  returning o.*;
end;
$$;

-- Grava o resultado da tentativa. Só vale com o token da reserva; devolve false se a reserva já não é sua.
create or replace function public.notification_email_finish(p_id uuid, p_token uuid, p_status text, p_error text)
returns boolean
language plpgsql security definer set search_path to 'public'
as $$
declare v_rows integer;
begin
  if p_status not in ('sent', 'pending', 'failed', 'suppressed') then raise exception 'Status inválido' using errcode = '22023'; end if;
  update public.notification_email_outbox
     set status = p_status, last_error = left(p_error, 500),
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         claimed_token = null, claimed_until = null
   where id = p_id and claimed_token = p_token;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Revalida, antes de enviar, se uma mensagem operacional de OPEX ainda faz sentido.
-- Retorna null quando deve enviar; ou o motivo da supressão (ex.: pessoa desativada, atribuição trocada).
create or replace function public.opex_email_check(p_outbox_id uuid)
returns text
language plpgsql stable security definer set search_path to 'public'
as $$
declare o public.notification_email_outbox; p public.opex_action_plans;
begin
  select * into o from public.notification_email_outbox where id = p_outbox_id;
  if not found or o.opex_action_id is null then return null; end if;
  if not public.opex_is_active_member(o.organization_id, o.opex_recipient_user_id) then return 'destinatário inativo'; end if;
  select * into p from public.opex_action_plans where id = o.opex_action_id and deleted_at is null;
  if not found then return 'ação removida'; end if;
  case o.opex_kind
    when 'assigned' then
      if p.assignee_user_id <> o.opex_recipient_user_id or p.assignment_cycle <> o.opex_assignment_cycle then return 'atribuição substituída'; end if;
      if p.status = 'completed' then return 'ação já concluída'; end if;
    when 'due_soon', 'overdue' then
      if p.status not in ('awaiting_ack', 'in_progress', 'adjustments_requested') then return 'ação não está mais pendente'; end if;
      if o.opex_kind = 'due_soon' and p.assignee_user_id <> o.opex_recipient_user_id then return 'atribuição substituída'; end if;
    when 'submitted' then
      if p.status <> 'awaiting_validation' then return 'entrega já tratada'; end if;
    else null;
  end case;
  return null;
end;
$$;

revoke all on function public.notification_email_claim(integer, integer, uuid, integer), public.notification_email_finish(uuid, uuid, text, text),
  public.opex_email_check(uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.notification_email_claim(integer, integer, uuid, integer), public.notification_email_finish(uuid, uuid, text, text),
      public.opex_email_check(uuid) to service_role;
  end if;
end $$;

commit;
