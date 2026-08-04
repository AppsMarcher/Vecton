-- 097: Correio interno vira bate-papo — sem assunto, conversa por pessoa
-- Criado por: Ricardo Guimarães — 2026-08-03
--
-- O campo "Assunto" saiu da interface (decisão do usuário: "a conversa é como
-- um bate-papo"). Isso obriga duas mudanças de semântica:
--
-- 1. TÍTULO passa a ser quem participa. Sem assunto, o card da lista precisava
--    de outro rótulo — e o natural num bate-papo é o nome do interlocutor.
--    `messages_feed` passa a devolver `titulo` pronto: até 3 nomes e "+N" pro
--    resto, ou "Toda a organização".
--
-- 2. ENVIO REAPROVEITA a conversa existente com exatamente os mesmos
--    participantes, em vez de sempre criar uma nova. Sem isso, mandar duas
--    mensagens pra mesma pessoa criaria dois cards idênticos e sem título —
--    o antigo modelo só se sustentava porque cada thread tinha um assunto
--    próprio pra diferenciar.

alter table public.message_threads alter column subject drop not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enviar: reaproveita a conversa quando o conjunto de participantes bate
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
  v_body      text := nullif(btrim(coalesce(p_body, '')), '');
  v_audience  text := case when p_audience = 'organization' then 'organization' else 'people' end;
  v_esperado  uuid[];
  v_msg       uuid;
begin
  if v_me is null then
    raise exception 'Não autenticado';
  end if;
  if v_body is null then
    raise exception 'Escreva o texto da mensagem';
  end if;

  select organization_id into v_org
  from public.user_profiles where user_id = v_me limit 1;
  if v_org is null then
    raise exception 'Perfil do remetente não encontrado';
  end if;

  -- Conjunto de participantes desejado (sempre inclui quem envia).
  if v_audience = 'organization' then
    select array_agg(distinct up.user_id order by up.user_id) into v_esperado
    from public.user_profiles up
    where up.organization_id = v_org;
  else
    select array_agg(distinct u order by u) into v_esperado
    from unnest(coalesce(p_user_ids, '{}'::uuid[]) || v_me) as u
    where exists (
      select 1 from public.user_profiles up
      where up.user_id = u and up.organization_id = v_org
    );
  end if;

  if v_esperado is null or array_length(v_esperado, 1) < 2 then
    raise exception 'Selecione ao menos um destinatário válido';
  end if;

  -- Já existe conversa com exatamente essas pessoas? Então continua nela.
  select t.id into v_thread
  from public.message_threads t
  where t.organization_id = v_org
    and t.audience = v_audience
    and (
      select array_agg(p.user_id order by p.user_id)
      from public.message_thread_participants p
      where p.thread_id = t.id
    ) = v_esperado
  order by t.last_message_at desc
  limit 1;

  if v_thread is null then
    insert into public.message_threads (organization_id, subject, audience, created_by)
    values (v_org, nullif(btrim(coalesce(p_subject, '')), ''), v_audience, v_me)
    returning id into v_thread;

    insert into public.message_thread_participants (thread_id, user_id, organization_id)
    select v_thread, u, v_org from unnest(v_esperado) as u
    on conflict do nothing;
  end if;

  insert into public.messages (thread_id, organization_id, author_user_id, body)
  values (v_thread, v_org, v_me, v_body)
  returning id into v_msg;

  update public.message_threads set last_message_at = now() where id = v_thread;

  insert into public.message_reads (message_id, user_id) values (v_msg, v_me)
  on conflict do nothing;

  return v_thread;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Feed: título vindo dos participantes
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP antes do CREATE: muda o formato de retorno (entra `titulo`), e
-- `create or replace` não faz isso (42P13).
drop function if exists public.messages_feed(int);

create or replace function public.messages_feed(p_limit int default 30)
returns table (
  thread_id     uuid,
  subject       text,
  titulo        text,
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
         case
           when t.audience = 'organization' then 'Toda a organização'
           else coalesce((
             select string_agg(x.nome, ', ')
                    || case when x.sobra > 0 then ' +' || x.sobra else '' end
             from (
               select coalesce(nullif(btrim(coalesce(up.full_name, '')), ''), up.email, 'Alguém') as nome,
                      greatest(count(*) over () - 3, 0) as sobra,
                      row_number() over (order by up.full_name) as rn
               from public.message_thread_participants p
               join public.user_profiles up
                 on up.user_id = p.user_id and up.organization_id = t.organization_id
               where p.thread_id = t.id and p.user_id <> auth.uid()
             ) x
             where x.rn <= 3
             group by x.sobra
           ), 'Conversa')
         end,
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

grant execute on function public.send_message(text, text, uuid[], text) to authenticated;
grant execute on function public.messages_feed(int)                     to authenticated;
