-- 106: preferências de identidade do Vecton Messenger
-- O nickname é exclusivo do Messenger e não altera o nome corporativo do perfil.

begin;

alter table public.user_profiles
  add column if not exists messenger_nickname text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_messenger_nickname_length'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_messenger_nickname_length
      check (messenger_nickname is null or char_length(messenger_nickname) <= 40);
  end if;
end;
$$;

drop function if exists public.messenger_my_state();

create function public.messenger_my_state()
returns table (presenca text, recado text, nickname text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(up.presence_choice, 'disponivel'),
         coalesce(up.status_message, ''),
         coalesce(up.messenger_nickname, '')
  from public.user_profiles up
  where up.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.set_messenger_nickname(p_nickname text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text := nullif(btrim(coalesce(p_nickname, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if v_nickname is not null and char_length(v_nickname) > 40 then
    raise exception 'O nickname deve ter no máximo 40 caracteres';
  end if;

  update public.user_profiles
     set messenger_nickname = v_nickname
   where user_id = auth.uid();

  if not found then
    raise exception 'Perfil não encontrado';
  end if;

  return coalesce(v_nickname, '');
end;
$$;

drop function if exists public.contacts_list();

create function public.contacts_list()
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

revoke all on function public.set_messenger_nickname(text) from public, anon;
grant execute on function public.set_messenger_nickname(text) to authenticated;
grant execute on function public.messenger_my_state() to authenticated;
grant execute on function public.contacts_list() to authenticated;

commit;
