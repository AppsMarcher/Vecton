-- 099: foto do perfil na lista de contatos do correio
-- Criado por: Ricardo Guimarães — 2026-08-04
--
-- A lista de contatos mostrava só a inicial. Agora traz a foto que a pessoa já
-- tem no perfil do Vecton (mesmos campos `photo_kind`/`photo_value` usados pelo
-- avatar do cabeçalho): 'upload' guarda uma data URL, 'avatar' guarda a chave de
-- um dos avatares prontos — quem resolve os dois casos é o cliente, igual faz o
-- applyPhotoPreview do authSession.
--
-- DROP antes do CREATE porque muda o formato de retorno (42P13).

drop function if exists public.contacts_list();

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
         coalesce(nullif(btrim(coalesce(up.full_name, '')), ''), up.email, 'Alguém'),
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
             and m.created_at >= mp.joined_at
         ), 0),
         c.last_message_at
  from public.user_profiles up
  cross join me
  left join conversa c on c.outro = up.user_id
  where up.organization_id = me.organization_id
    and up.user_id <> auth.uid()
  order by c.last_message_at desc nulls last, up.full_name asc;
$$;

grant execute on function public.contacts_list() to authenticated;
