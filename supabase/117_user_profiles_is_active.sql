begin;

-- Ativar/Desativar usuário. O bloqueio "de verdade" (login) é feito à parte,
-- via GoTrue ban_duration na Edge Function set-user-active (service_role,
-- não dá pra chamar do browser). Este arquivo cobre a defesa em profundidade
-- para quem já está com uma sessão aberta no momento da desativação: o token
-- continua válido até expirar, mas is_org_member/is_org_editor passam a
-- negar qualquer leitura/escrita nas tabelas do VectonPlan (financeiro,
-- comercial, relatórios, forecast etc.) assim que is_active vira false.
alter table public.user_profiles
  add column if not exists is_active boolean not null default true;

-- Versão "crua" do antigo is_org_member (só checa vínculo com a org, sem
-- olhar is_active). Necessária pra política de leitura do PRÓPRIO perfil:
-- um usuário desativado precisa continuar enxergando a própria linha (senão
-- o app não teria como detectar e avisar "seu acesso foi desativado").
create or replace function public.is_org_member_raw(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = target_organization_id
      and ou.user_id = auth.uid()
  )
$$;

grant execute on function public.is_org_member_raw(uuid) to authenticated;

-- is_org_member agora também exige is_active=true no user_profiles de quem
-- chama. É o gate central: praticamente toda tabela do VectonPlan (branches,
-- accounts, cost_centers, actuals, budget, comercial, custom_reports,
-- forecast_scenarios etc.) usa esta função nas próprias policies, então
-- desativar aqui já bloqueia a leitura/escrita em todas elas de uma vez.
create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_member_raw(target_organization_id)
    and coalesce(
      (select up.is_active
       from public.user_profiles up
       where up.organization_id = target_organization_id
         and up.user_id = auth.uid()),
      true -- sem perfil ainda (ex: dono acabou de criar a org) não bloqueia
    )
$$;

-- Mesma lógica pro gate de escrita usado por budget/actuals/comercial.
create or replace function public.is_org_editor(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_users ou
    left join public.user_profiles up
      on up.user_id = auth.uid()
      and up.organization_id = target_organization_id
    where ou.organization_id = target_organization_id
      and ou.user_id = auth.uid()
      and coalesce(up.is_active, true)
      and (
        ou.role in ('owner', 'editor')
        or up.access_role in ('admin', 'super_admin')
      )
  )
$$;

-- Ajusta a policy de leitura (019_fix_user_profiles_rls.sql): o ramo "lê o
-- próprio perfil" passa a usar is_org_member_raw (ignora is_active) — assim
-- o usuário desativado ainda vê a própria linha. O ramo "admin lê todo
-- mundo" continua em is_org_member (o admin que está lendo precisa
-- continuar ativo). Escrita (019, "write own or admin writes all") não
-- muda: já usa is_org_member, então herda o bloqueio automaticamente — um
-- usuário desativado não consegue mais editar nem a própria linha (não dá
-- pra se autorreativar).
drop policy if exists "read own or admin reads all" on public.user_profiles;
create policy "read own or admin reads all"
on public.user_profiles
for select
using (
  (user_id = auth.uid() and public.is_org_member_raw(organization_id))
  or (
    public.is_org_member(organization_id)
    and public.get_my_access_role(organization_id) in ('super_admin', 'admin')
  )
);

commit;
