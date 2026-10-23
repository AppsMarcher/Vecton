begin;
-- Conta com saldo em lote ou rascunho não pode ser removida do Plano BP.
do $$ begin
 if to_regclass('public.bp_import_batches') is null or to_regclass('public.bp_import_drafts') is null then
  raise exception 'Instale primeiro as cargas BP (303 e 304)';
 end if;
end $$;

create or replace function public.protect_bp_plan_node_with_balances()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.bp_import_batches b where b.organization_id=old.organization_id
   and b.rows @> jsonb_build_array(jsonb_build_object('account_id',old.id)))
  or exists(select 1 from public.bp_import_drafts d where d.organization_id=old.organization_id
   and d.input_rows @> jsonb_build_array(jsonb_build_object('account_id',old.id))) then
  raise exception 'A conta % possui saldos em cargas BP. Exclua os lotes antes de removê-la, ou inative a conta', old.account_code;
 end if;
 return old;
end $$;
revoke all on function public.protect_bp_plan_node_with_balances() from public,anon,authenticated;
drop trigger if exists protect_bp_plan_node_with_balances on public.bp_plan_nodes;
create trigger protect_bp_plan_node_with_balances before delete on public.bp_plan_nodes
 for each row execute function public.protect_bp_plan_node_with_balances();

notify pgrst,'reload schema';
commit;
