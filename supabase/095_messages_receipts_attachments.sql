-- 095: Correio interno — recibos (tiques), exclusão e anexos
-- Criado por: Ricardo Guimarães — 2026-08-03
--
-- Três adições ao correio da 094:
--
-- 1. TIQUES estilo WhatsApp. Já tínhamos "lida" (message_reads); faltava
--    "entregue". `message_deliveries` registra que o cliente do destinatário
--    baixou a mensagem — marcado pela RPC mark_messages_delivered, que o app
--    chama junto do polling. Em conversa com várias pessoas vale a regra de
--    grupo: 2 tiques só quando TODOS receberam, verdes só quando TODOS leram.
--
-- 2. EXCLUSÃO de mensagem, uma a uma, só pelo autor. É exclusão real: some
--    para todos os participantes (não fica "mensagem apagada").
--
-- 3. ANEXOS em bucket privado. O caminho do arquivo começa pelo id da thread
--    (`<thread_id>/<uuid>_<nome>`), o que deixa a policy do Storage reusar o
--    mesmo `is_thread_participant` do resto do correio — sem inventar um
--    segundo modelo de permissão.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Entregue
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.message_deliveries (
  message_id   uuid        not null references public.messages(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_deliveries_user_idx
  on public.message_deliveries (user_id, message_id);

alter table public.message_deliveries enable row level security;

drop policy if exists "own message deliveries" on public.message_deliveries;
create policy "own message deliveries"
  on public.message_deliveries for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Participante também precisa LER os recibos dos outros pra saber se a própria
-- mensagem foi entregue. Feito via RPC (thread_messages), que é SECURITY
-- DEFINER — por isso não há policy de leitura ampla aqui.

-- Chamada pelo app junto do polling. Barata quando não há nada novo: o insert
-- não encontra linha nenhuma. Exclui as próprias mensagens (não faz sentido
-- "receber" o que você mesmo escreveu).
create or replace function public.mark_messages_delivered()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.message_deliveries (message_id, user_id)
  select m.id, auth.uid()
  from public.messages m
  join public.message_thread_participants p
    on p.thread_id = m.thread_id and p.user_id = auth.uid()
  where m.author_user_id is distinct from auth.uid()
  on conflict (message_id, user_id) do nothing;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Anexos
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.message_attachments (
  id           uuid        primary key default gen_random_uuid(),
  message_id   uuid        not null references public.messages(id) on delete cascade,
  thread_id    uuid        not null references public.message_threads(id) on delete cascade,
  storage_path text        not null,
  file_name    text        not null,
  mime_type    text        not null default '',
  size_bytes   bigint      not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id);

alter table public.message_attachments enable row level security;

drop policy if exists "participants read attachments" on public.message_attachments;
create policy "participants read attachments"
  on public.message_attachments for select
  using (public.is_thread_participant(thread_id));

-- Registra o anexo depois do upload. Valida que quem chama é o AUTOR da
-- mensagem — participante qualquer não pendura arquivo em mensagem alheia.
create or replace function public.add_message_attachment(
  p_message_id uuid,
  p_path       text,
  p_file_name  text,
  p_mime       text default '',
  p_size       bigint default 0
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

  insert into public.message_attachments (message_id, thread_id, storage_path, file_name, mime_type, size_bytes)
  values (p_message_id, v_thread, p_path, coalesce(nullif(btrim(p_file_name), ''), 'arquivo'),
          coalesce(p_mime, ''), coalesce(p_size, 0))
  returning id into v_id;

  return v_id;
end;
$$;

-- Bucket privado. Se a instância não permitir criar bucket por SQL, criar pelo
-- painel (Storage → New bucket, nome `message-attachments`, Public = OFF) —
-- as policies abaixo continuam valendo.
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

-- Permissão do arquivo = permissão da conversa. O primeiro segmento do caminho
-- é o thread_id; o regex evita que um nome malformado exploda o cast pra uuid
-- dentro da policy.
drop policy if exists "participants read message files" on storage.objects;
create policy "participants read message files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.is_thread_participant(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "participants upload message files" on storage.objects;
create policy "participants upload message files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.is_thread_participant(((storage.foldername(name))[1])::uuid)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Excluir mensagem (uma a uma, só o autor)
-- ─────────────────────────────────────────────────────────────────────────────
-- Exclusão real: some pra todos. O arquivo no Storage NÃO é apagado aqui (a
-- linha de message_attachments cai por cascade) — limpeza de órfãos fica pra
-- uma rotina futura, se o volume justificar.
create or replace function public.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
begin
  select thread_id into v_thread
  from public.messages
  where id = p_message_id and author_user_id = auth.uid();

  if v_thread is null then
    raise exception 'Só é possível excluir mensagens que você enviou';
  end if;

  delete from public.messages where id = p_message_id;

  -- Assunto que ficou sem nenhuma mensagem deixa de existir.
  if not exists (select 1 from public.messages where thread_id = v_thread) then
    delete from public.message_threads where id = v_thread;
  else
    update public.message_threads
       set last_message_at = (select max(created_at) from public.messages where thread_id = v_thread)
     where id = v_thread;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. thread_messages agora devolve status dos tiques + anexos
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP antes do CREATE: `create or replace` não muda o formato de retorno de
-- uma função existente (42P13 — "cannot change return type"). A versão da 094
-- devolvia menos colunas; aqui entram `status` e `anexos`.
drop function if exists public.thread_messages(uuid);

create or replace function public.thread_messages(p_thread uuid)
returns table (
  id          uuid,
  autor       text,
  autor_id    uuid,
  body        text,
  created_at  timestamptz,
  is_read     boolean,
  status      text,      -- 'sent' | 'delivered' | 'read' (só faz sentido nas próprias)
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
         m.created_at,
         (r.message_id is not null),
         case
           when m.author_user_id is distinct from auth.uid() then null
           when d.total = 0 then 'sent'
           when (select count(*) from public.message_reads mr
                  join public.message_thread_participants pp
                    on pp.thread_id = m.thread_id and pp.user_id = mr.user_id
                 where mr.message_id = m.id and mr.user_id <> auth.uid()) >= d.total then 'read'
           when (select count(*) from public.message_deliveries md
                 where md.message_id = m.id and md.user_id <> auth.uid()) >= d.total then 'delivered'
           else 'sent'
         end,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', a.id, 'path', a.storage_path, 'name', a.file_name,
                    'mime', a.mime_type, 'size', a.size_bytes) order by a.created_at)
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
  order by m.created_at asc;
$$;

grant execute on function public.mark_messages_delivered()                       to authenticated;
grant execute on function public.delete_message(uuid)                            to authenticated;
grant execute on function public.add_message_attachment(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.thread_messages(uuid)                           to authenticated;
