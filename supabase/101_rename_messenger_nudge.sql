-- 101: Atualiza o texto exibido ao chamar a atenção em uma conversa.

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

  select organization_id into v_org
  from public.message_threads
  where id = p_thread;

  insert into public.messages (thread_id, organization_id, author_user_id, body, kind)
  values (p_thread, v_org, auth.uid(), 'chamou sua atenção!', 'nudge')
  returning id into v_id;

  update public.message_threads
  set last_message_at = now()
  where id = p_thread;

  insert into public.message_reads (message_id, user_id)
  values (v_id, auth.uid())
  on conflict do nothing;

  return v_id;
end;
$$;
