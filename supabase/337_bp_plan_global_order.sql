begin;
-- Ordem de exibição do Plano BP como sequência corrida 1..N no plano inteiro (posição na árvore, de cima para baixo).
-- Substitui a ordem por grupo da 336. Inserir ou mover uma conta para a posição N faz as seguintes avançarem;
-- remover fecha o buraco. A conta sempre fica dentro do bloco da sua conta pai: um número que cairia no
-- bloco de outra conta vira a posição válida mais próxima.

create or replace function public.bp_code_sort_key(code text)
returns text[] language sql immutable as $$
 select array_agg(lpad(s,20,'0') order by ord) from unnest(string_to_array(code,'.')) with ordinality as u(s,ord)
$$;

-- Renumera 1..N a organização inteira. A ordem entre irmãs vem do número que cada uma tem hoje
-- (a conta movida vence o empate, exceto quando foi para uma posição maior); demais empates seguem o código contábil.
create or replace function public.bp_resequence_plan(p_org uuid, p_moved uuid, p_moved_last boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 with recursive sib as (
  select id,parent_id,(row_number() over(partition by parent_id order by sort_order,
    case when id=p_moved then (case when p_moved_last then 1 else 0 end) else (case when p_moved_last then 0 else 1 end) end,
    public.bp_code_sort_key(account_code),account_code,id))::integer as rk
  from public.bp_plan_nodes where organization_id=p_org
 ), tree as (
  select id,array[lpad(rk::text,8,'0')] as path from sib where parent_id is null
  union all
  select s.id,t.path||lpad(s.rk::text,8,'0') from sib s join tree t on s.parent_id=t.id
 ), ranked as (
  select id,(row_number() over(order by path))::integer as new_order from tree
 ) update public.bp_plan_nodes n set sort_order=r.new_order from ranked r where n.id=r.id and n.sort_order<>r.new_order;
end $$;
revoke all on function public.bp_resequence_plan(uuid,uuid,boolean) from public,anon,authenticated;

create or replace function public.bp_plan_resequence()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(coalesce(new.organization_id,old.organization_id)::text,300));
 if tg_op='INSERT' then
  perform public.bp_resequence_plan(new.organization_id,new.id,false);
 elsif tg_op='DELETE' then
  perform public.bp_resequence_plan(old.organization_id,null,false);
 elsif old.parent_id is distinct from new.parent_id then
  perform public.bp_resequence_plan(new.organization_id,new.id,false);
 else
  perform public.bp_resequence_plan(new.organization_id,new.id,old.sort_order<new.sort_order);
 end if;
 return null;
end $$;
revoke all on function public.bp_plan_resequence() from public,anon,authenticated;

drop function if exists public.bp_resequence_group(uuid,uuid,uuid,boolean);

-- Desliga as triggers, renumera o plano de cada organização na ordem atual da árvore e liga de novo.
drop trigger if exists bp_plan_resequence_insert on public.bp_plan_nodes;
drop trigger if exists bp_plan_resequence_update on public.bp_plan_nodes;
drop trigger if exists bp_plan_resequence_delete on public.bp_plan_nodes;
do $$ declare org record; begin
 for org in select distinct organization_id from public.bp_plan_nodes loop
  perform public.bp_resequence_plan(org.organization_id,null,false);
 end loop;
end $$;

-- pg_trigger_depth()=0: as gravações feitas pela própria função não disparam a trigger de novo.
create trigger bp_plan_resequence_insert after insert on public.bp_plan_nodes
 for each row when (pg_trigger_depth()=0) execute function public.bp_plan_resequence();
create trigger bp_plan_resequence_update after update of sort_order,parent_id on public.bp_plan_nodes
 for each row when (pg_trigger_depth()=0 and (old.sort_order is distinct from new.sort_order or old.parent_id is distinct from new.parent_id))
 execute function public.bp_plan_resequence();
create trigger bp_plan_resequence_delete after delete on public.bp_plan_nodes
 for each row when (pg_trigger_depth()=0) execute function public.bp_plan_resequence();

notify pgrst,'reload schema';
commit;
