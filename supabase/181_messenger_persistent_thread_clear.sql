-- 181: Messenger — limpeza persistente da conversa por participante
--
-- A lixeira escondia mensagens apenas no Set em memória do navegador. Ao
-- fechar a janela, esse estado era perdido e thread_messages devolvia todo o
-- histórico. O corte passa a morar no participante da conversa: cada pessoa
-- limpa somente a própria visualização e mensagens posteriores continuam
-- aparecendo normalmente.

begin;

alter table public.message_thread_participants
  add column if not exists cleared_at timestamptz;

create or replace function public.clear_thread_messages(p_thread uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := clock_timestamp();
begin
  update public.message_thread_participants
     set cleared_at = v_cutoff
   where thread_id = p_thread
     and user_id = auth.uid();

  if not found then
    raise exception 'Você não participa desta conversa';
  end if;

  -- A limpeza também zera imediatamente os contadores do usuário. O recorte
  -- pelo cutoff evita marcar como lida uma mensagem que chegar em paralelo.
  insert into public.message_reads (message_id, user_id)
  select m.id, auth.uid()
    from public.messages m
   where m.thread_id = p_thread
     and m.created_at <= v_cutoff
  on conflict (message_id, user_id) do nothing;
end;
$$;

-- Reemite a versão mais recente (178), acrescentando somente o corte pessoal.
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
         case when m.author_user_id is null then 'Vecton'
              else coalesce(nullif(btrim(coalesce(ap.full_name, '')), ''), 'Alguém') end,
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
    and m.created_at >= me.joined_at
    and (me.cleared_at is null or m.created_at > me.cleared_at)
  order by m.created_at asc;
$$;

-- A aba Mídias obedece ao mesmo corte da conversa.
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
  select a.id,
         a.storage_path,
         a.thumb_path,
         a.file_name,
         a.mime_type,
         a.size_bytes,
         a.created_at
    from public.message_attachments a
    join public.messages m on m.id = a.message_id
    join public.message_thread_participants me
      on me.thread_id = m.thread_id and me.user_id = auth.uid()
   where a.thread_id = p_thread
     and m.created_at >= me.joined_at
     and (me.cleared_at is null or m.created_at > me.cleared_at)
   order by a.created_at desc;
$$;

revoke all on function public.clear_thread_messages(uuid) from public, anon;
grant execute on function public.clear_thread_messages(uuid) to authenticated;
grant execute on function public.thread_messages(uuid) to authenticated;
grant execute on function public.thread_media(uuid) to authenticated;

commit;
