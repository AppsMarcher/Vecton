begin;

-- Tela Parâmetros > Novidades > "Visualizações": admin precisa ver quem já
-- dispensou cada anúncio (para listar) e apagar a linha de alguém específico
-- (para "reativar" o pop-up pra essa pessoa). A policy de leitura anterior
-- (migration 238) só deixa cada usuário ver a própria linha — esta soma-se a
-- ela (RLS combina policies do mesmo comando com OR), sem tirar o acesso que
-- já existia.

drop policy if exists "admins can read organization announcement dismissals" on public.user_announcement_dismissals;
create policy "admins can read organization announcement dismissals"
on public.user_announcement_dismissals
for select
using (public.get_my_access_role(organization_id) in ('super_admin', 'admin'));

drop policy if exists "admins can reactivate announcement dismissals" on public.user_announcement_dismissals;
create policy "admins can reactivate announcement dismissals"
on public.user_announcement_dismissals
for delete
using (public.get_my_access_role(organization_id) in ('super_admin', 'admin'));

commit;
