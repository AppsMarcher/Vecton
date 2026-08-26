begin;

-- Corrige assimetria observada em produção: Admin conseguia editar mas não
-- excluir um usuário comum (Gestor/Analista/etc.) — a mesma ação que já
-- funcionava normalmente pra Super Admin. A exclusão não estourava erro
-- nenhum (por isso parecia que "o botão não fazia nada"): o DELETE do
-- PostgREST, quando a policy filtra a linha pelo USING, só devolve 0 linhas
-- afetadas em vez de um 403 — silencioso.
--
-- Recria a policy de escrita (INSERT/UPDATE/DELETE) do zero, sem depender
-- de qual versão ficou de fato ativa no banco (018 tinha uma variante com
-- subquery recursiva em user_profiles, que 019 substituiu por
-- get_my_access_role() — se por algum motivo a de 018 ainda está viva ou
-- as duas coexistem de um jeito inesperado, este DROP+CREATE elimina a
-- ambiguidade).
drop policy if exists "admins can manage org profiles" on public.user_profiles; -- 018, legado
drop policy if exists "write own or admin writes all"   on public.user_profiles; -- 019

create policy "write own or admin writes all"
on public.user_profiles
for all
using (
  public.is_org_member(organization_id)
  and (
    user_id = auth.uid()
    or public.get_my_access_role(organization_id) in ('super_admin', 'admin')
  )
)
with check (
  public.is_org_member(organization_id)
  and (
    user_id = auth.uid()
    or public.get_my_access_role(organization_id) in ('super_admin', 'admin')
  )
);

commit;
