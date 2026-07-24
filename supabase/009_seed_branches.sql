begin;

with target_org as (
  select id
  from public.organizations
  where name = 'Marcher Brasil'
  limit 1
),
seed_rows (branch_code, branch_name, origin, note) as (
  values
    ('01', 'Matriz Gravatai', 'seed', ''),
    ('02', 'Filial MT', 'seed', '')
)
insert into public.branches (organization_id, branch_code, branch_name, origin, note)
select target_org.id, seed_rows.branch_code, seed_rows.branch_name, seed_rows.origin, seed_rows.note
from seed_rows
cross join target_org
on conflict (organization_id, branch_code) do update
set branch_name = excluded.branch_name,
    origin = excluded.origin,
    note = excluded.note;

commit;
