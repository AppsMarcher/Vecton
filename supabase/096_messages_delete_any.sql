-- 096: Correio interno — excluir mensagem de qualquer um e excluir a conversa
-- Criado por: Ricardo Guimarães — 2026-08-03
--
-- Muda a regra da 095: lá só o AUTOR apagava a própria mensagem. Agora qualquer
-- participante da conversa pode apagar qualquer mensagem dela, e também a
-- conversa inteira. Decisão do usuário — o correio é interno, entre colegas da
-- mesma organização.
--
-- Continua sendo exclusão REAL: some para todos os participantes, sem "mensagem
-- apagada" no lugar e sem volta. O frontend pede confirmação ao apagar mensagem
-- de terceiro e ao apagar a conversa; a própria mensagem sai direto.

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
  where id = p_message_id;

  if v_thread is null then
    raise exception 'Mensagem não encontrada';
  end if;

  -- A permissão agora é participar da conversa, não ser o autor.
  if not public.is_thread_participant(v_thread) then
    raise exception 'Você não participa desta conversa';
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

-- Apaga a conversa inteira. As mensagens, participantes e registros de anexo
-- caem por cascade das FKs. Os ARQUIVOS no Storage ficam órfãos — limpeza fica
-- pra uma rotina futura, se o volume justificar.
create or replace function public.delete_thread(p_thread uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_thread_participant(p_thread) then
    raise exception 'Você não participa desta conversa';
  end if;

  delete from public.message_threads where id = p_thread;
end;
$$;

grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.delete_thread(uuid)  to authenticated;
