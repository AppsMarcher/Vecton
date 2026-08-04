-- 100: Marcher Messenger em tempo real
-- Mensagens, anexos e digitação passam pelo Supabase Realtime. O acesso aos
-- eventos continua limitado aos participantes de cada conversa pelas RLS.

-- O Realtime precisa de SELECT para aplicar as políticas e entregar cada
-- alteração somente a quem participa da thread.
grant select on public.messages, public.message_attachments, public.message_typing to authenticated;

drop policy if exists "participants read typing" on public.message_typing;
create policy "participants read typing"
  on public.message_typing for select
  using (public.is_thread_participant(thread_id));

-- Idempotente: não tenta adicionar novamente uma tabela já publicada.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_attachments'
    ) then
      alter publication supabase_realtime add table public.message_attachments;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_typing'
    ) then
      alter publication supabase_realtime add table public.message_typing;
    end if;
  end if;
end;
$$;

-- Estado persistido do próprio usuário. Carregado antes de conectar o canal,
-- para a decisão "abrir ou piscar" não depender de o painel estar aberto.
create or replace function public.messenger_my_state()
returns table (presenca text, recado text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(up.presence_choice, 'disponivel'),
         coalesce(up.status_message, '')
  from public.user_profiles up
  where up.user_id = auth.uid()
  limit 1;
$$;

-- Resolve o título da conversa e o estado local quando chega um evento. A
-- função recusa threads das quais o usuário não participa.
create or replace function public.messenger_event_context(p_thread uuid)
returns table (titulo text, presenca text, recado text)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      nullif(btrim(coalesce(t.name, '')), ''),
      case when t.audience = 'organization' then 'Toda a organização' end,
      case
        when (select count(*) from public.message_thread_participants pc where pc.thread_id = t.id) = 2
        then (
          select coalesce(nullif(btrim(coalesce(other.full_name, '')), ''), other.email, 'Conversa')
          from public.message_thread_participants po
          join public.user_profiles other on other.user_id = po.user_id
          where po.thread_id = t.id and po.user_id <> auth.uid()
          limit 1
        )
      end,
      (
        select string_agg(
          coalesce(nullif(btrim(coalesce(member.full_name, '')), ''), member.email, 'Alguém'),
          ', ' order by coalesce(member.full_name, member.email)
        )
        from public.message_thread_participants pm
        join public.user_profiles member on member.user_id = pm.user_id
        where pm.thread_id = t.id and pm.user_id <> auth.uid()
      ),
      'Conversa'
    ),
    coalesce(me.presence_choice, 'disponivel'),
    coalesce(me.status_message, '')
  from public.message_threads t
  join public.message_thread_participants mine
    on mine.thread_id = t.id and mine.user_id = auth.uid()
  join public.user_profiles me on me.user_id = auth.uid()
  where t.id = p_thread
  limit 1;
$$;

grant execute on function public.messenger_my_state() to authenticated;
grant execute on function public.messenger_event_context(uuid) to authenticated;
