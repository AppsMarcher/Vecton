-- 098: Telas separadas — notificações com limpeza, e correio estilo MSN
-- Criado por: Ricardo Guimarães — 2026-08-04
--
-- Duas frentes:
--
-- NOTIFICAÇÕES: ganham "marcar como não lida" e "limpar a tela". Limpar é
-- necessariamente POR USUÁRIO: a notificação é uma linha única da organização
-- que todos enxergam, então apagar a linha sumiria da tela de todo mundo. O
-- marco `notifications_cleared_at` no perfil esconde tudo o que existe até
-- aquele instante, sem tocar no dado dos outros.
--
-- CORREIO ESTILO MSN: lista de contatos com presença e recado pessoal, janelas
-- de conversa, grupos, "está digitando", zumbido e miniatura de anexo.
--   • Presença sai do polling que já existe (`inbox_counts` passa a gravar
--     `last_seen_at`) — sem timer novo, mantendo a decisão de UMA consulta
--     periódica só.
--   • `joined_at` no participante faz quem entra num grupo ver a conversa só
--     dali pra frente (decisão do usuário). Backfill obrigatório: sem ele,
--     quem já participa perderia todo o histórico.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Notificações: limpar e desmarcar
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists notifications_cleared_at timestamptz;

create or replace function public.notifications_clear()
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_profiles
     set notifications_cleared_at = now()
   where user_id = auth.uid();
$$;

create or replace function public.notifications_mark_unread(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.notification_reads
   where user_id = auth.uid()
     and notification_id = any(coalesce(p_ids, '{}'::uuid[]));
$$;

-- Feed e contagem passam a respeitar o marco de limpeza.
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
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Presença e recado pessoal
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists last_seen_at    timestamptz,
  add column if not exists status_message  text,
  add column if not exists presence_choice text not null default 'disponivel';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_presence_choice_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_presence_choice_check
      check (presence_choice in ('disponivel', 'ausente', 'ocupado', 'invisivel'));
  end if;
end;
$$;

create or replace function public.set_my_presence(p_choice text, p_status text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_profiles
     set presence_choice = case when p_choice in ('disponivel','ausente','ocupado','invisivel')
                                then p_choice else presence_choice end,
         status_message  = coalesce(p_status, status_message)
   where user_id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grupos: histórico a partir da entrada
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.message_threads
  add column if not exists name text;

alter table public.message_thread_participants
  add column if not exists joined_at timestamptz;

-- BACKFILL obrigatório: sem ele, quem já participa passaria a ver a conversa a
-- partir de agora e perderia todo o histórico.
update public.message_thread_participants p
   set joined_at = t.created_at
  from public.message_threads t
 where t.id = p.thread_id and p.joined_at is null;

alter table public.message_thread_participants
  alter column joined_at set default now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Zumbido: mensagem com tipo
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.messages
  add column if not exists kind text not null default 'text';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_kind_check') then
    alter table public.messages
      add constraint messages_kind_check check (kind in ('text', 'nudge'));
  end if;
end;
$$;

create or replace function public.send_nudge(p_thread uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  if not public.is_thread_participant(p_thread) then
    raise exception 'Você não participa desta conversa';
  end if;
  select organization_id into v_org from public.message_threads where id = p_thread;

  insert into public.messages (thread_id, organization_id, author_user_id, body, kind)
  values (p_thread, v_org, auth.uid(), 'enviou um zumbido', 'nudge')
  returning id into v_id;

  update public.message_threads set last_message_at = now() where id = p_thread;
  insert into public.message_reads (message_id, user_id) values (v_id, auth.uid())
  on conflict do nothing;
  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. "Está digitando"
-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela minúscula e efêmera: uma linha por pessoa/conversa, sobrescrita a cada
-- aviso. Quem lê só considera os últimos 6 segundos.
create table if not exists public.message_typing (
  thread_id  uuid        not null references public.message_threads(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

alter table public.message_typing enable row level security;

drop policy if exists "own typing" on public.message_typing;
create policy "own typing"
  on public.message_typing for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.set_typing(p_thread uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.message_typing (thread_id, user_id, updated_at)
  select p_thread, auth.uid(), now()
  where public.is_thread_participant(p_thread)
  on conflict (thread_id, user_id) do update set updated_at = now();
$$;

create or replace function public.thread_typing(p_thread uuid)
returns table (nome text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(coalesce(up.full_name, '')), ''), 'Alguém')
  from public.message_typing t
  join public.user_profiles up on up.user_id = t.user_id
  where t.thread_id = p_thread
    and t.user_id <> auth.uid()
    and t.updated_at > now() - interval '6 seconds'
    and public.is_thread_participant(p_thread);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Miniatura de anexo
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.message_attachments
  add column if not exists thumb_path text;

-- Dropa a versão de 5 argumentos da 095: mantê-la criaria uma SOBRECARGA, e uma
-- chamada com 5 argumentos nomeados casaria com as duas (a nova tem default no
-- 6º) — o PostgREST devolveria erro de ambiguidade.
drop function if exists public.add_message_attachment(uuid, text, text, text, bigint);

create or replace function public.add_message_attachment(
  p_message_id uuid,
  p_path       text,
  p_file_name  text,
  p_mime       text default '',
  p_size       bigint default 0,
  p_thumb      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_id     uuid;
begin
  select m.thread_id into v_thread
  from public.messages m
  where m.id = p_message_id and m.author_user_id = auth.uid();

  if v_thread is null then
    raise exception 'Mensagem não encontrada ou não é sua';
  end if;

  insert into public.message_attachments
    (message_id, thread_id, storage_path, file_name, mime_type, size_bytes, thumb_path)
  values (p_message_id, v_thread, p_path, coalesce(nullif(btrim(p_file_name), ''), 'arquivo'),
          coalesce(p_mime, ''), coalesce(p_size, 0), p_thumb)
  returning id into v_id;

  return v_id;
end;
$$;

-- Galeria da conversa (aba "Mídias").
create or replace function public.thread_media(p_thread uuid)
returns table (
  id         uuid,
  path       text,
  thumb      text,
  nome       text,
  mime       text,
  tamanho    bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.storage_path, a.thumb_path, a.file_name, a.mime_type, a.size_bytes, a.created_at
  from public.message_attachments a
  where a.thread_id = p_thread
    and public.is_thread_participant(p_thread)
  order by a.created_at desc;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Lista de contatos e de grupos
-- ─────────────────────────────────────────────────────────────────────────────
-- Presença efetiva: quem escolheu "invisível" aparece offline; os demais só
-- ficam online se o cliente deu sinal de vida nos últimos 2 minutos.
create or replace function public.contacts_list()
returns table (
  user_id        uuid,
  nome           text,
  email          text,
  presenca       text,
  recado         text,
  thread_id      uuid,
  nao_lidas      int,
  ultima_em      timestamptz
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
    -- conversa 1:1 = exatamente eu e a outra pessoa
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
           where m.thread_id = t.id and r.message_id is null and m.created_at >= me.joined_at
         ), 0),
         t.last_message_at
  from public.message_threads t
  join public.message_thread_participants me
    on me.thread_id = t.id and me.user_id = auth.uid()
  where t.audience = 'organization'
     or (select count(*) from public.message_thread_participants p4 where p4.thread_id = t.id) > 2
  order by t.last_message_at desc;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Abrir conversa 1:1, criar grupo, entrar e sair
-- ─────────────────────────────────────────────────────────────────────────────
-- Duplo clique no contato: devolve a conversa existente ou cria uma vazia.
create or replace function public.open_direct_thread(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_org    uuid;
  v_thread uuid;
begin
  select organization_id into v_org from public.user_profiles where user_id = v_me limit 1;
  if v_org is null then raise exception 'Perfil não encontrado'; end if;
  if not exists (select 1 from public.user_profiles where user_id = p_user and organization_id = v_org) then
    raise exception 'Usuário não pertence à sua organização';
  end if;

  select t.id into v_thread
  from public.message_threads t
  where t.organization_id = v_org
    and t.audience = 'people'
    and (select array_agg(p.user_id order by p.user_id)
           from public.message_thread_participants p where p.thread_id = t.id)
        = (select array_agg(u order by u) from unnest(array[v_me, p_user]) as u)
  limit 1;

  if v_thread is null then
    insert into public.message_threads (organization_id, audience, created_by)
    values (v_org, 'people', v_me)
    returning id into v_thread;

    insert into public.message_thread_participants (thread_id, user_id, organization_id)
    values (v_thread, v_me, v_org), (v_thread, p_user, v_org)
    on conflict do nothing;
  end if;

  return v_thread;
end;
$$;

create or replace function public.create_group_thread(p_name text, p_user_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_org    uuid;
  v_thread uuid;
  v_qtd    int;
begin
  select organization_id into v_org from public.user_profiles where user_id = v_me limit 1;
  if v_org is null then raise exception 'Perfil não encontrado'; end if;

  insert into public.message_threads (organization_id, audience, created_by, name)
  values (v_org, 'people', v_me, nullif(btrim(coalesce(p_name, '')), ''))
  returning id into v_thread;

  insert into public.message_thread_participants (thread_id, user_id, organization_id)
  select v_thread, up.user_id, v_org
  from public.user_profiles up
  where up.organization_id = v_org
    and (up.user_id = any(coalesce(p_user_ids, '{}'::uuid[])) or up.user_id = v_me)
  on conflict do nothing;

  select count(*) into v_qtd from public.message_thread_participants where thread_id = v_thread;
  if v_qtd < 3 then
    delete from public.message_threads where id = v_thread;
    raise exception 'Um grupo precisa de pelo menos duas outras pessoas';
  end if;

  return v_thread;
end;
$$;

-- Quem entra depois vê a conversa a partir de agora (joined_at = now()).
create or replace function public.add_thread_participants(p_thread uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if not public.is_thread_participant(p_thread) then
    raise exception 'Você não participa desta conversa';
  end if;
  select organization_id into v_org from public.message_threads where id = p_thread;

  insert into public.message_thread_participants (thread_id, user_id, organization_id, joined_at)
  select p_thread, up.user_id, v_org, now()
  from public.user_profiles up
  where up.organization_id = v_org
    and up.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
  on conflict do nothing;
end;
$$;

create or replace function public.leave_thread(p_thread uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.message_thread_participants
   where thread_id = p_thread and user_id = auth.uid();

  -- Conversa sem ninguém não precisa continuar existindo.
  if not exists (select 1 from public.message_thread_participants where thread_id = p_thread) then
    delete from public.message_threads where id = p_thread;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. thread_messages: tipo da mensagem + recorte por entrada no grupo
-- ─────────────────────────────────────────────────────────────────────────────
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
         coalesce(nullif(btrim(coalesce(ap.full_name, '')), ''), 'Alguém'),
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
    and m.created_at >= me.joined_at          -- entrou depois? vê dali pra frente
  order by m.created_at asc;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. inbox_counts vira também o batimento de presença
-- ─────────────────────────────────────────────────────────────────────────────
-- Deixa de ser `stable` porque agora ESCREVE (last_seen_at). Feito aqui, e não
-- num timer novo, pra manter uma única consulta periódica — foi requisição
-- periódica extra que expôs a corrida de renovação de token em 2026-08-03.
drop function if exists public.inbox_counts();

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
    (select count(*)::int
       from public.messages m
       join public.message_thread_participants p
         on p.thread_id = m.thread_id and p.user_id = auth.uid()
       left join public.message_reads r
         on r.message_id = m.id and r.user_id = auth.uid()
      where r.message_id is null
        and m.created_at >= p.joined_at);
end;
$$;

grant execute on function public.notifications_clear()                        to authenticated;
grant execute on function public.notifications_mark_unread(uuid[])            to authenticated;
grant execute on function public.notifications_feed(int)                      to authenticated;
grant execute on function public.set_my_presence(text, text)                  to authenticated;
grant execute on function public.send_nudge(uuid)                             to authenticated;
grant execute on function public.set_typing(uuid)                             to authenticated;
grant execute on function public.thread_typing(uuid)                          to authenticated;
grant execute on function public.thread_media(uuid)                           to authenticated;
grant execute on function public.contacts_list()                              to authenticated;
grant execute on function public.groups_list()                                to authenticated;
grant execute on function public.open_direct_thread(uuid)                     to authenticated;
grant execute on function public.create_group_thread(text, uuid[])            to authenticated;
grant execute on function public.add_thread_participants(uuid, uuid[])        to authenticated;
grant execute on function public.leave_thread(uuid)                           to authenticated;
grant execute on function public.thread_messages(uuid)                        to authenticated;
grant execute on function public.inbox_counts()                               to authenticated;
grant execute on function public.add_message_attachment(uuid, text, text, text, bigint, text) to authenticated;
