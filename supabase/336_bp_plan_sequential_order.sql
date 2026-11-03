begin;
-- Ordem de exibição do Plano BP sempre sequencial (1..n) entre contas irmãs, sem repetição.
-- Inserir ou mover uma conta para uma posição já ocupada empurra as seguintes; remover fecha o buraco.

create or replace function public.bp_code_sort_key(code text)
returns text[] language sql immutable as $$
 select array_agg(lpad(s,20,'0') order by ord) from unnest(string_to_array(code,'.')) with ordinality as u(s,ord)
$$;

-- Renumera 1..n um grupo de irmãs (mesma organização e mesma conta pai).
-- Empate: a conta movida vence (fica antes), exceto quando p_moved_last (foi movida para uma posição maior).
-- Demais empates seguem o código contábil, comparando cada segmento como número.
create or replace function public.bp_resequence_group(p_org uuid, p_parent uuid, p_moved uuid, p_moved_last boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 with ranked as (
  select id,(row_number() over(order by sort_order,
    case when id=p_moved then (case when p_moved_last then 1 else 0 end) else (case when p_moved_last then 0 else 1 end) end,
    public.bp_code_sort_key(account_code),account_code,id))::integer as new_order
  from public.bp_plan_nodes where organization_id=p_org and parent_id is not distinct from p_parent
 ) update public.bp_plan_nodes n set sort_order=r.new_order from ranked r where n.id=r.id and n.sort_order<>r.new_order;
end $$;
revoke all on function public.bp_resequence_group(uuid,uuid,uuid,boolean) from public,anon,authenticated;

create or replace function public.bp_plan_resequence()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(coalesce(new.organization_id,old.organization_id)::text,300));
 if tg_op='INSERT' then
  perform public.bp_resequence_group(new.organization_id,new.parent_id,new.id,false);
 elsif tg_op='DELETE' then
  perform public.bp_resequence_group(old.organization_id,old.parent_id,null,false);
 elsif old.parent_id is distinct from new.parent_id then
  perform public.bp_resequence_group(old.organization_id,old.parent_id,null,false);
  perform public.bp_resequence_group(new.organization_id,new.parent_id,new.id,false);
 else
  perform public.bp_resequence_group(new.organization_id,new.parent_id,new.id,old.sort_order<new.sort_order);
 end if;
 return null;
end $$;
revoke all on function public.bp_plan_resequence() from public,anon,authenticated;

-- Limpa os empates e buracos atuais antes de ligar a trigger.
do $$ declare grp record; begin
 for grp in select distinct organization_id,parent_id from public.bp_plan_nodes loop
  perform public.bp_resequence_group(grp.organization_id,grp.parent_id,null,false);
 end loop;
end $$;

-- pg_trigger_depth()=0: as gravações feitas pela própria função não disparam a trigger de novo.
drop trigger if exists bp_plan_resequence_insert on public.bp_plan_nodes;
create trigger bp_plan_resequence_insert after insert on public.bp_plan_nodes
 for each row when (pg_trigger_depth()=0) execute function public.bp_plan_resequence();
drop trigger if exists bp_plan_resequence_update on public.bp_plan_nodes;
create trigger bp_plan_resequence_update after update of sort_order,parent_id on public.bp_plan_nodes
 for each row when (pg_trigger_depth()=0 and (old.sort_order is distinct from new.sort_order or old.parent_id is distinct from new.parent_id))
 execute function public.bp_plan_resequence();
drop trigger if exists bp_plan_resequence_delete on public.bp_plan_nodes;
create trigger bp_plan_resequence_delete after delete on public.bp_plan_nodes
 for each row when (pg_trigger_depth()=0) execute function public.bp_plan_resequence();

notify pgrst,'reload schema';
commit;
