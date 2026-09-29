begin;

-- RETENCAO 4,65% passa a ser conta de IMPOSTOS / TAXAS (antes estava direto em Saídas Operacionais).
update public.fc_plan_nodes n
   set parent_id = p.id, updated_at = now()
  from public.fc_plan_nodes p
 where n.seed_key = 'linha-67'
   and p.organization_id = n.organization_id
   and p.seed_key = 'linha-56'
   and n.parent_id is distinct from p.id;

commit;
