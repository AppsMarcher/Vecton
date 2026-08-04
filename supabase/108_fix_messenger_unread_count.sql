-- 108: corrige contadores fantasmas de mensagens não lidas
--
-- A contagem global podia divergir da lista do Messenger por três motivos:
--   1. mensagens próprias sem recibo legado entravam como não lidas;
--   2. conversas 1:1 órfãs (sem outro participante/perfil visível) entravam no
--      total, embora não existisse uma linha que o usuário pudesse abrir;
--   3. o cliente não tinha uma RPC exclusiva para reconciliar o total logo
--      depois de marcar uma conversa como lida.

begin;

-- Saneia mensagens próprias antigas. As RPCs atuais já criam este recibo no
-- envio, mas dados anteriores ou gravações interrompidas podem não tê-lo.
insert into public.message_reads (message_id, user_id)
select m.id, m.author_user_id
from public.messages m
join public.message_thread_participants p
  on p.thread_id = m.thread_id and p.user_id = m.author_user_id
left join public.message_reads r
  on r.message_id = m.id and r.user_id = m.author_user_id
where r.message_id is null
on conflict (message_id, user_id) do nothing;

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
        and n.created_at > coalesce(me.notifications_cleared_at, '-infinity'::timestamptz)),
    public.messages_unread_count();
end;
$$;

-- Mantém a lista de contatos sob a mesma definição do total global.
create or replace function public.contacts_list()
returns table (
  user_id     uuid,
  nome        text,
  email       text,
  presenca    text,
  recado      text,
  foto_kind   text,
  foto_value  text,
  thread_id   uuid,
  nao_lidas   int,
  ultima_em   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select organization_id from public.user_profiles where user_id = auth.uid() limit 1
  ),
  conversa as (
    select t.id as thread_id,
           (select p2.user_id from public.message_thread_participants p2
             where p2.thread_id = t.id and p2.user_id <> auth.uid() limit 1) as outro,
           t.last_message_at
    from public.message_threads t
    join public.message_thread_participants p on p.thread_id = t.id and p.user_id = auth.uid()
    where t.audience = 'people'
      and (select count(*) from public.message_thread_participants p3 where p3.thread_id = t.id) = 2
  )
  select up.user_id,
         coalesce(
           nullif(btrim(coalesce(up.messenger_nickname, '')), ''),
           nullif(btrim(coalesce(up.full_name, '')), ''),
           up.email,
           'Alguém'
         ),
         coalesce(up.email, ''),
         case
           when up.presence_choice = 'invisivel' then 'offline'
           when up.last_seen_at is null or up.last_seen_at < now() - interval '2 minutes' then 'offline'
           else up.presence_choice
         end,
         coalesce(up.status_message, ''),
         coalesce(up.photo_kind, 'none'),
         coalesce(up.photo_value, ''),
         c.thread_id,
         coalesce((
           select count(*)::int
           from public.messages m
           join public.message_thread_participants mp
             on mp.thread_id = m.thread_id and mp.user_id = auth.uid()
           left join public.message_reads r on r.message_id = m.id and r.user_id = auth.uid()
           where m.thread_id = c.thread_id
             and r.message_id is null
             and m.author_user_id is distinct from auth.uid()
             and m.created_at >= mp.joined_at
         ), 0),
         c.last_message_at
  from public.user_profiles up
  cross join me
  left join conversa c on c.outro = up.user_id
  where up.organization_id = me.organization_id
    and up.user_id <> auth.uid()
  order by c.last_message_at desc nulls last,
           coalesce(nullif(btrim(coalesce(up.messenger_nickname, '')), ''), up.full_name, up.email) asc;
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
         coalesce(
           nullif(btrim(coalesce(t.name, '')), ''),
           case when t.audience = 'organization' then 'Toda a organização' else null end,
           (select string_agg(coalesce(nullif(btrim(coalesce(up.full_name, '')), ''), up.email), ', ')
              from public.message_thread_participants p2
              join public.user_profiles up on up.user_id = p2.user_id
             where p2.thread_id = t.id and p2.user_id <> auth.uid()),
           'Grupo'
         ),
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
     or (select count(*) from public.message_thread_participants p4 where p4.thread_id = t.id) > 2
  order by t.last_message_at desc;
$$;

revoke all on function public.messages_unread_count() from public, anon;
grant execute on function public.messages_unread_count() to authenticated;
grant execute on function public.inbox_counts() to authenticated;
grant execute on function public.contacts_list() to authenticated;
grant execute on function public.groups_list() to authenticated;

commit;
