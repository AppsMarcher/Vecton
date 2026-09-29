begin;

-- RETENCAO 4,65% passa a ser conta de IMPOSTOS / TAXAS (antes estava direto em Saídas Operacionais).
update public.fc_plan_nodes n
   set parent_id = p.id, updated_at = now()
  from public.fc_plan_nodes p
 where n.seed_key = 'linha-67'
   and p.organization_id = n.organization_id
   and p.seed_key = 'linha-56'
   and n.parent_id is distinct from p.id;

-- Cargas e cenários guardam uma cópia do plano; a tela lê essa cópia, então ela também é corrigida.
create function pg_temp.fc_fix_plan(plan jsonb) returns jsonb language sql as $$
  select jsonb_agg(
    case when e->>'seed_key' = 'linha-67'
      then jsonb_set(e, '{parent_id}', (select x->'id' from jsonb_array_elements(plan) x where x->>'seed_key' = 'linha-56'))
      else e end
    order by ord)
  from jsonb_array_elements(plan) with ordinality t(e, ord)
$$;

update public.fc_import_batches
   set plan_snapshot = pg_temp.fc_fix_plan(plan_snapshot)
 where exists (select 1 from jsonb_array_elements(plan_snapshot) x where x->>'seed_key' = 'linha-56')
   and exists (select 1 from jsonb_array_elements(plan_snapshot) x where x->>'seed_key' = 'linha-67');

update public.fc_scenarios
   set report_data = jsonb_set(report_data, '{plan}', pg_temp.fc_fix_plan(report_data->'plan'))
 where jsonb_typeof(report_data->'plan') = 'array'
   and exists (select 1 from jsonb_array_elements(report_data->'plan') x where x->>'seed_key' = 'linha-56')
   and exists (select 1 from jsonb_array_elements(report_data->'plan') x where x->>'seed_key' = 'linha-67');

commit;
