-- Usuário do lançamento no ledger do cenário (drill down dos DREs e do OPEX Meta).
-- OPEX: quem digitou a célula (planning_entries.updated_by). CAPEX: quem integrou.
begin;
alter table public.forecast_ledger_entries add column if not exists launched_by uuid, add column if not exists launched_by_name text;

create or replace function public.planning_ledger_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
 if new.planning_form_id is not null and new.launched_by is null then
   select e.updated_by into u from public.planning_entries e
     join public.planning_form_lines l on l.id=e.line_id join public.accounts a on a.id=l.account_id
     where e.form_id=new.planning_form_id and e.cost_center_id=new.cost_center_id and e.reference_month=new.reference_month
     and a.organization_id=new.organization_id and a.account_number=new.account_number limit 1;
   new.launched_by:=coalesce(u,auth.uid());
 end if;
 if new.launched_by is not null and new.launched_by_name is null then
   select coalesce(nullif(trim(p.full_name),''),p.email) into new.launched_by_name from public.user_profiles p
     where p.user_id=new.launched_by and p.organization_id=new.organization_id limit 1;
 end if;
 return new;
end $$;
revoke all on function public.planning_ledger_user() from public,anon,authenticated;
drop trigger if exists planning_ledger_user on public.forecast_ledger_entries;
create trigger planning_ledger_user before insert on public.forecast_ledger_entries for each row execute function public.planning_ledger_user();

-- Integrações já feitas: preenche o usuário nas linhas existentes.
do $$declare r record;begin
 for r in select distinct scenario_id from public.forecast_ledger_entries where planning_form_id is not null and launched_by is null loop
   perform set_config('vecton.planning_write',r.scenario_id::text,true);
   update public.forecast_ledger_entries l set launched_by=src.uid,
     launched_by_name=(select coalesce(nullif(trim(p.full_name),''),p.email) from public.user_profiles p where p.user_id=src.uid and p.organization_id=l.organization_id limit 1)
   from (select x.id,coalesce(
       (select e.updated_by from public.planning_entries e join public.planning_form_lines pl on pl.id=e.line_id join public.accounts a on a.id=pl.account_id
         where e.form_id=x.planning_form_id and e.cost_center_id=x.cost_center_id and e.reference_month=x.reference_month
         and a.organization_id=x.organization_id and a.account_number=x.account_number limit 1),
       (select rn.started_by from public.planning_runs rn where rn.scenario_id=x.scenario_id and rn.status='ok'
         and rn.initiated_form_id=x.planning_form_id order by rn.started_at desc limit 1)) uid
     from public.forecast_ledger_entries x where x.scenario_id=r.scenario_id and x.planning_form_id is not null and x.launched_by is null) src
   where l.id=src.id and src.uid is not null;
 end loop;
end $$;
commit;
