-- 094: Correio interno (mensagens entre usuários)
-- Criado por: Ricardo Guimarães — 2026-08-03
--
-- A cartinha do header vira caixa de mensagens, dividindo o mesmo popover com o
-- sininho (duas abas). Diferença de modelo em relação às notificações (092):
-- notificação é evento da ORG que todo mundo enxerga (fan-out na leitura);
-- mensagem tem destinatários específicos, então o fan-out é na ESCRITA —
-- `message_thread_participants` guarda quem participa de cada assunto.
--
-- Semânticas travadas nesta v1:
--   • Resposta é visível a TODOS os participantes (thread comum, "responder a
--     todos" implícito).
--   • Grupo "Toda a organização" é resolvido NO ENVIO (snapshot): quem entrar
--     na org depois não passa a ver mensagem antiga.
--   • Não há exclusão de mensagem nem retenção automática.
--   • Não dispara e-mail — o correio é interno.

create table if not exists public.message_threads (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  subject          text        not null,
  audience         text        not null default 'people' check (audience in ('people', 'organization')),
  created_by       uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);

-- Snapshot de quem participa. O autor entra aqui também: ele precisa ver o
-- próprio assunto e acompanhar as respostas.
create table if not exists public.message_thread_participants (
  thread_id       uuid not null references public.message_threads(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (thread_id, user_id)
);

create table if not exists public.messages (
  id              uuid        primary key default gen_random_uuid(),
  thread_id       uuid        not null references public.message_threads(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  author_user_id  uuid        references auth.users(id) on delete set null,
  body            text        not null,
  created_at      timestamptz not null default now()
);

create table if not exists public.message_reads (
  message_id uuid        not null references public.messages(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_threads_org_last_idx
  on public.message_threads (organization_id, last_message_at desc);
create index if not exists message_participants_user_idx
  on public.message_thread_participants (user_id, thread_id);
create index if not exists messages_thread_created_idx
  on public.messages (thread_id, created_at);
create index if not exists message_reads_user_idx
  on public.message_reads (user_id, message_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper de participação — SECURITY DEFINER de propósito
-- ─────────────────────────────────────────────────────────────────────────────
-- Sem isto a política de `message_thread_participants` consultaria a PRÓPRIA
-- tabela ("sou participante desta thread?"), e a RLS entraria em recursão
-- infinita (42P17). Rodando como owner, a função enxerga a tabela sem aplicar
-- RLS e quebra o ciclo — mesma armadilha já vista em outros projetos.
create or replace function public.is_thread_participant(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.message_thread_participants
    where thread_id = p_thread and user_id = auth.uid()
  );
$$;

grant execute on function public.is_thread_participant(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — tudo gira em torno de "sou participante da thread?"
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.message_threads              enable row level security;
alter table public.message_thread_participants  enable row level security;
alter table public.messages                     enable row level security;
alter table public.message_reads                enable row level security;

drop policy if exists "participants read threads" on public.message_threads;
create policy "participants read threads"
  on public.message_threads for select
  using (public.is_thread_participant(id));

drop policy if exists "participants read participants" on public.message_thread_participants;
create policy "participants read participants"
  on public.message_thread_participants for select
  using (public.is_thread_participant(thread_id));

drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages"
  on public.messages for select
  using (public.is_thread_participant(thread_id));

drop policy if exists "own message reads" on public.message_reads;
create policy "own message reads"
  on public.message_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Escrita de thread/participante/mensagem só pelas RPCs abaixo (SECURITY
-- DEFINER): criar assunto exige inserir em 3 tabelas de uma vez, e o autor
-- ainda não é participante no instante do INSERT da thread — com RLS pura isso
-- vira um problema de ovo e galinha.

-- ─────────────────────────────────────────────────────────────────────────────
-- Enviar
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.send_message(
  p_subject    text,
  p_body       text,
  p_user_ids   uuid[] default '{}',
  p_audience   text   default 'people'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_org       uuid;
  v_thread    uuid;
  v_subject   text := nullif(btrim(coalesce(p_subject, '')), '');
  v_body      text := nullif(btrim(coalesce(p_body, '')), '');
  v_audience  text := case when p_audience = 'organization' then 'organization' else 'people' end;
  v_count     int;
begin
  if v_me is null then
    raise exception 'Não autenticado';
  end if;
  if v_subject is null then
    raise exception 'Informe um assunto para a mensagem';
  end if;
  if v_body is null then
    raise exception 'Escreva o texto da mensagem';
  end if;

  select organization_id into v_org
  from public.user_profiles where user_id = v_me limit 1;
  if v_org is null then
    raise exception 'Perfil do remetente não encontrado';
  end if;

  insert into public.message_threads (organization_id, subject, audience, created_by)
  values (v_org, v_subject, v_audience, v_me)
  returning id into v_thread;

  -- Destinatários: sempre restritos à MESMA organização. O grupo é resolvido
  -- aqui, no envio (snapshot) — não é uma regra viva.
  if v_audience = 'organization' then
    insert into public.message_thread_participants (thread_id, user_id, organization_id)
    select v_thread, up.user_id, v_org
    from public.user_profiles up
    where up.organization_id = v_org
    on conflict do nothing;
  else
    insert into public.message_thread_participants (thread_id, user_id, organization_id)
    select v_thread, up.user_id, v_org
    from public.user_profiles up
    where up.organization_id = v_org
      and up.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
    on conflict do nothing;
  end if;

  -- O autor participa do próprio assunto (pra ver as respostas).
  insert into public.message_thread_participants (thread_id, user_id, organization_id)
  values (v_thread, v_me, v_org)
  on conflict do nothing;

  select count(*) into v_count
  from public.message_thread_participants where thread_id = v_thread;
  if v_count < 2 then
    -- Só o autor: nenhum destinatário válido foi resolvido.
    delete from public.message_threads where id = v_thread;
    raise exception 'Selecione ao menos um destinatário válido';
  end if;

  insert into public.messages (thread_id, organization_id, author_user_id, body)
  values (v_thread, v_org, v_me, v_body);

  -- Quem escreve já leu.
  insert into public.message_reads (message_id, user_id)
  select m.id, v_me from public.messages m
  where m.thread_id = v_thread
  on conflict do nothing;

  return v_thread;
end;
$$;

create or replace function public.reply_to_thread(p_thread uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_org  uuid;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_id   uuid;
begin
  if v_me is null then
    raise exception 'Não autenticado';
  end if;
  if v_body is null then
    raise exception 'Escreva o texto da resposta';
  end if;
  if not public.is_thread_participant(p_thread) then
    raise exception 'Você não participa desta conversa';
  end if;

  select organization_id into v_org from public.message_threads where id = p_thread;

  insert into public.messages (thread_id, organization_id, author_user_id, body)
  values (p_thread, v_org, v_me, v_body)
  returning id into v_id;

  update public.message_threads set last_message_at = now() where id = p_thread;

  insert into public.message_reads (message_id, user_id) values (v_id, v_me)
  on conflict do nothing;

  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Ler
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.messages_feed(p_limit int default 30)
returns table (
  thread_id     uuid,
  subject       text,
  audience      text,
  last_body     text,
  last_author   text,
  last_at       timestamptz,
  participantes int,
  nao_lidas     int
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id,
         t.subject,
         t.audience,
         ult.body,
         coalesce(nullif(btrim(coalesce(ap.full_name, '')), ''), 'Alguém'),
         t.last_message_at,
         (select count(*)::int from public.message_thread_participants p where p.thread_id = t.id),
         (select count(*)::int
            from public.messages m
            left join public.message_reads r on r.message_id = m.id and r.user_id = auth.uid()
           where m.thread_id = t.id and r.message_id is null)
  from public.message_threads t
  join public.message_thread_participants me
    on me.thread_id = t.id and me.user_id = auth.uid()
  left join lateral (
    select m.body, m.author_user_id
    from public.messages m
    where m.thread_id = t.id
    order by m.created_at desc
    limit 1
  ) ult on true
  left join public.user_profiles ap
    on ap.user_id = ult.author_user_id and ap.organization_id = t.organization_id
  order by t.last_message_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.thread_messages(p_thread uuid)
returns table (
  id          uuid,
  autor       text,
  autor_id    uuid,
  body        text,
  created_at  timestamptz,
  is_read     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id,
         coalesce(nullif(btrim(coalesce(ap.full_name, '')), ''), 'Alguém'),
         m.author_user_id,
         m.body,
         m.created_at,
         (r.message_id is not null)
  from public.messages m
  join public.message_thread_participants me
    on me.thread_id = m.thread_id and me.user_id = auth.uid()
  left join public.user_profiles ap
    on ap.user_id = m.author_user_id and ap.organization_id = m.organization_id
  left join public.message_reads r
    on r.message_id = m.id and r.user_id = auth.uid()
  where m.thread_id = p_thread
  order by m.created_at asc;
$$;

create or replace function public.messages_mark_thread_read(p_thread uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.message_reads (message_id, user_id)
  select m.id, auth.uid()
  from public.messages m
  where m.thread_id = p_thread
    and public.is_thread_participant(p_thread)
  on conflict (message_id, user_id) do nothing;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contagem unificada — UM polling só
-- ─────────────────────────────────────────────────────────────────────────────
-- O app consulta esta função a cada 60s. Ter uma RPC por caixa dobraria o
-- tráfego de fundo, e requisição periódica extra foi exatamente o que expôs a
-- corrida de renovação de token em 2026-08-03.
create or replace function public.inbox_counts()
returns table (notificacoes int, mensagens int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int
       from public.notifications n
       join public.user_profiles me
         on me.user_id = auth.uid() and me.organization_id = n.organization_id
       left join public.notification_reads r
         on r.notification_id = n.id and r.user_id = auth.uid()
      where r.notification_id is null
        and n.created_at >= now() - interval '90 days'
        and n.created_at >= me.created_at),
    (select count(*)::int
       from public.messages m
       join public.message_thread_participants p
         on p.thread_id = m.thread_id and p.user_id = auth.uid()
       left join public.message_reads r
         on r.message_id = m.id and r.user_id = auth.uid()
      where r.message_id is null);
$$;

grant execute on function public.send_message(text, text, uuid[], text)  to authenticated;
grant execute on function public.reply_to_thread(uuid, text)             to authenticated;
grant execute on function public.messages_feed(int)                      to authenticated;
grant execute on function public.thread_messages(uuid)                   to authenticated;
grant execute on function public.messages_mark_thread_read(uuid)         to authenticated;
grant execute on function public.inbox_counts()                          to authenticated;
