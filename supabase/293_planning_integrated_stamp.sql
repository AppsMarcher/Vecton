-- Carimbo de versão do cenário: data da última integração bem-sucedida (DRE e OPEX leem o mesmo ledger).
-- Os relatórios comparam esse carimbo com o que têm em memória e se atualizam sozinhos.
begin;
alter table public.forecast_scenarios add column if not exists integrated_at timestamptz;

create or replace function public.planning_runs_stamp() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status='ok' then
   perform set_config('vecton.planning_write',new.scenario_id::text,true);
   update public.forecast_scenarios set integrated_at=clock_timestamp() where id=new.scenario_id;
 end if;
 return null;
end $$;
revoke all on function public.planning_runs_stamp() from public,anon,authenticated;
drop trigger if exists planning_runs_stamp on public.planning_runs;
create trigger planning_runs_stamp after insert on public.planning_runs for each row execute function public.planning_runs_stamp();

-- Integrações já feitas: o carimbo parte da última execução bem-sucedida.
do $$declare r record;begin
 for r in select scenario_id,max(started_at) at from public.planning_runs where status='ok' group by scenario_id loop
   perform set_config('vecton.planning_write',r.scenario_id::text,true);
   update public.forecast_scenarios set integrated_at=r.at where id=r.scenario_id and integrated_at is null;
 end loop;
end $$;
commit;
