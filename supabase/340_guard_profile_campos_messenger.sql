-- Corrige a guarda de user_profiles (281): ela passou a bloquear, para quem não é
-- admin, a gravação de campos que o próprio app grava pelo usuário logado:
--   last_seen_at (batimento de inbox_counts), presence_choice e status_message
--   (set_my_presence), messenger_nickname e notifications_cleared_at.
-- Efeito do bug: para não-admin, inbox_counts falhava inteiro (sem presença
-- online no Messenger e sem contagem de notificações/mensagens), desde 19/10.
-- Só estes campos pessoais entram na lista; access_role, management e extra_*
-- continuam exclusivos do administrador.
begin;

create or replace function public.planning_guard_profile() returns trigger
language plpgsql security definer set search_path=public as $$
declare
 v_livres text[] := array[
   'full_name','email','phone','department','profile_label','photo_kind','photo_value','appearance','updated_at',
   'last_seen_at','presence_choice','status_message','messenger_nickname','notifications_cleared_at'];
begin
 if auth.uid() is not null and not public.planning_is_admin(case when tg_op='DELETE' then old.organization_id else new.organization_id end) then
   if tg_op='DELETE' then raise exception 'Apenas administradores podem remover perfis'; end if;
   if tg_op='INSERT' then
     if new.user_id is distinct from auth.uid()
        or not exists(select 1 from public.user_profiles p where p.organization_id=new.organization_id and p.user_id=new.user_id) then
       raise exception 'Apenas administradores podem criar perfis';
     end if;
     return new;
   end if;
   if new.user_id<>auth.uid() or old.user_id<>auth.uid() or
      (to_jsonb(new)-v_livres) is distinct from (to_jsonb(old)-v_livres) then
     raise exception 'Campos de acesso do perfil são exclusivos do administrador';
   end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;

commit;
