-- Protege campos de acesso de user_profiles contra auto-promoção.
-- A policy "write own or admin writes all" (118) deixa qualquer pessoa gravar a
-- própria linha, inclusive access_role e as concessões extra_*. Este trigger
-- restringe a pessoa comum aos campos pessoais. Admin, super_admin e chamadas
-- sem usuário (service role, edge functions) não são afetados.
-- Independente do Planejamento: pode ser aplicado e homologado à parte.
-- Homologar: salvar o perfil pelo diálogo "Meu perfil" com usuário não-admin
-- (o app faz upsert), cadastro/convite e troca de aparência.
begin;

create or replace function public.planning_guard_profile() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is not null and not public.planning_is_admin(case when tg_op='DELETE' then old.organization_id else new.organization_id end) then
   if tg_op='DELETE' then raise exception 'Apenas administradores podem remover perfis'; end if;
   if tg_op='INSERT' then
     -- O upsert do app dispara o BEFORE INSERT mesmo quando a linha já existe e
     -- vira UPDATE. Aqui só se libera esse caso; o UPDATE é conferido abaixo.
     -- Criar um perfil novo continua exclusivo do administrador.
     if new.user_id is distinct from auth.uid()
        or not exists(select 1 from public.user_profiles p where p.organization_id=new.organization_id and p.user_id=new.user_id) then
       raise exception 'Apenas administradores podem criar perfis';
     end if;
     return new;
   end if;
   if new.user_id<>auth.uid() or old.user_id<>auth.uid() or
      (to_jsonb(new)-array['full_name','email','phone','department','profile_label','photo_kind','photo_value','appearance','updated_at'])
      is distinct from (to_jsonb(old)-array['full_name','email','phone','department','profile_label','photo_kind','photo_value','appearance','updated_at']) then
     raise exception 'Campos de acesso do perfil são exclusivos do administrador';
   end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;

drop trigger if exists planning_guard_profile on public.user_profiles;
create trigger planning_guard_profile before insert or update or delete on public.user_profiles
for each row execute function public.planning_guard_profile();

commit;
