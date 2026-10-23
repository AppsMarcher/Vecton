begin;

-- Cadastro BP: contas contábeis do arquivo e chave agrupadora do relatório.
-- Instala somente o cadastro; não cria nem aplica cargas de saldos.
create table if not exists public.bp_plan_nodes (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 parent_id uuid,
 account_code text not null,
 name text not null check(length(btrim(name)) between 1 and 200),
 node_class text not null check(node_class in ('Analitica','Sintetica')),
 group_key text,
 source_name text,
 source_row integer,
 seed_key text,
 sort_order integer not null default 0 check(sort_order>=0),
 active boolean not null default true,
 note text not null default '' check(length(note)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,parent_id) references public.bp_plan_nodes(organization_id,id),
 check(parent_id is distinct from id)
);

-- Compatível também com o rascunho anterior, caso tenha sido instalado em teste.
alter table public.bp_plan_nodes add column if not exists account_code text;
alter table public.bp_plan_nodes add column if not exists group_key text;
create unique index if not exists bp_plan_code_unique on public.bp_plan_nodes(organization_id,account_code);
create index if not exists bp_plan_parent_order on public.bp_plan_nodes(organization_id,parent_id,sort_order,id);

create or replace function public.can_manage_bp_plan(target_organization_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.is_org_member(target_organization_id) and exists (
  select 1 from public.user_profiles p where p.organization_id=target_organization_id
  and p.user_id=auth.uid() and p.is_active and
  (p.access_role::text in ('admin','super_admin') or coalesce(p.additional_access_roles::text[],'{}') && array['admin','super_admin'])
 );
$$;
revoke all on function public.can_manage_bp_plan(uuid) from public,anon;
grant execute on function public.can_manage_bp_plan(uuid) to authenticated;

create or replace function public.validate_bp_plan_node()
returns trigger language plpgsql security definer set search_path=public as $$
declare parent_node public.bp_plan_nodes;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,300));
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.id<>old.id) then
  raise exception 'A organização e a identificação da conta não podem ser alteradas';
 end if;
 new.account_code:=btrim(new.account_code);
 new.name:=btrim(new.name);
 new.group_key:=nullif(btrim(new.group_key),'');
 new.updated_at:=now();
 if new.account_code is null or new.account_code!~'^[0-9]+([.][0-9]+)*$' then raise exception 'Informe o código contábil da conta'; end if;
 if new.node_class='Sintetica' and new.group_key is not null then raise exception 'Somente contas analíticas podem ter chave agrupadora'; end if;
 if new.node_class='Analitica' then
  if new.group_key is null then raise exception 'Informe a chave agrupadora da conta analítica'; end if;
  if new.parent_id is null then raise exception 'Vincule a conta analítica a uma conta sintética'; end if;
  new.source_name:=new.account_code;
 else
  new.source_name:=null;
 end if;
 if new.node_class='Analitica' and exists(select 1 from public.bp_plan_nodes where organization_id=new.organization_id and parent_id=new.id) then
  raise exception 'Uma conta com filhas deve permanecer sintética';
 end if;
 if not new.active and exists(select 1 from public.bp_plan_nodes where organization_id=new.organization_id and parent_id=new.id and active) then
  raise exception 'Inative as contas filhas antes da conta pai';
 end if;
 if exists(select 1 from public.bp_plan_nodes where organization_id=new.organization_id and parent_id=new.id
    and left(account_code,length(new.account_code)+1)<>new.account_code||'.') then
  raise exception 'O código deve preservar a hierarquia das contas filhas';
 end if;
 if new.parent_id is not null then
  select * into parent_node from public.bp_plan_nodes where organization_id=new.organization_id and id=new.parent_id;
  if not found or parent_node.node_class<>'Sintetica' then raise exception 'A conta pai deve ser uma sintética da mesma organização'; end if;
  if left(new.account_code,length(parent_node.account_code)+1)<>parent_node.account_code||'.' then
   raise exception 'O código da conta deve pertencer à hierarquia da conta pai';
  end if;
  if new.active and not parent_node.active then raise exception 'A conta pai deve estar ativa'; end if;
  if exists(with recursive ancestors as (
   select id,parent_id from public.bp_plan_nodes where organization_id=new.organization_id and id=new.parent_id
   union select n.id,n.parent_id from public.bp_plan_nodes n join ancestors a on n.id=a.parent_id where n.organization_id=new.organization_id
  ) select 1 from ancestors where id=new.id) then raise exception 'Este vínculo criaria um ciclo'; end if;
 end if;
 return new;
end $$;
revoke all on function public.validate_bp_plan_node() from public,anon,authenticated;
drop trigger if exists validate_bp_plan_node on public.bp_plan_nodes;
create trigger validate_bp_plan_node before insert or update on public.bp_plan_nodes
 for each row execute function public.validate_bp_plan_node();

alter table public.bp_plan_nodes enable row level security;
grant select,insert,update,delete on public.bp_plan_nodes to authenticated;
drop policy if exists "members read BP plan" on public.bp_plan_nodes;
create policy "members read BP plan" on public.bp_plan_nodes for select to authenticated using(public.is_org_member(organization_id));
drop policy if exists "admins insert BP plan" on public.bp_plan_nodes;
create policy "admins insert BP plan" on public.bp_plan_nodes for insert to authenticated with check(public.can_manage_bp_plan(organization_id));
drop policy if exists "admins update BP plan" on public.bp_plan_nodes;
create policy "admins update BP plan" on public.bp_plan_nodes for update to authenticated using(public.can_manage_bp_plan(organization_id)) with check(public.can_manage_bp_plan(organization_id));
drop policy if exists "admins delete BP plan" on public.bp_plan_nodes;
create policy "admins delete BP plan" on public.bp_plan_nodes for delete to authenticated using(public.can_manage_bp_plan(organization_id));
commit;
