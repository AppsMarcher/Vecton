begin;

-- Reordenação de linhas de um formulário de planejamento (arrastar e soltar na tela de Estrutura).
-- Recebe a nova ordem completa das linhas (p_order) e renumera seq 1..n numa única operação:
--   * formula_name acompanha a sequência (como a tela já faz: formula_name = String(seq)) — só nas linhas em que
--     os dois eram iguais; nomes personalizados são preservados;
--   * as referências <nome> nas fórmulas são remapeadas ao mesmo tempo (sem colisão entre trocas);
--   * as restrições unique(form_id, seq) e unique(form_id, formula_name) são respeitadas por uma passagem temporária.
-- Mesmas travas de save_line: só administrador, cenário não bloqueado e formulário sem valores salvos.
-- Não altera planning_write. Idempotente.

create or replace function public.planning_reorder_lines(p_org uuid, p_scenario uuid, p_form uuid, p_order uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.forecast_scenarios;
  r record;
  m record;
  new_text text;
  mapping jsonb;
begin
  if auth.uid() is null or not public.is_org_member(p_org) then raise exception 'Sem acesso à organização'; end if;
  if not public.planning_is_admin(p_org) then raise exception 'Sem permissão'; end if;

  select * into s from public.forecast_scenarios where id = p_scenario and organization_id = p_org and planning_version = 1 for update;
  if not found then raise exception 'Cenário de planejamento inválido'; end if;
  if s.status = 'locked' or s.lock_at <= clock_timestamp() then raise exception 'Cenário bloqueado'; end if;
  if not exists (select 1 from public.planning_forms where id = p_form and scenario_id = p_scenario and organization_id = p_org) then
    raise exception 'Formulário inválido';
  end if;
  if exists (select 1 from public.planning_entries where form_id = p_form) then
    raise exception 'Estrutura bloqueada: já existem valores salvos';
  end if;

  -- A nova ordem tem que conter exatamente as linhas do formulário, sem repetição.
  if p_order is null or cardinality(p_order) = 0
     or (select count(*) from unnest(p_order)) <> (select count(distinct x) from unnest(p_order) x)
     or (select count(*) from public.planning_form_lines where form_id = p_form) <> cardinality(p_order)
     or exists (select 1 from unnest(p_order) x where not exists (select 1 from public.planning_form_lines l where l.id = x and l.form_id = p_form)) then
    raise exception 'Ordem inválida: ela deve conter todas as linhas do formulário';
  end if;

  perform set_config('vecton.planning_write', p_scenario::text, true);

  -- Mapeamento antigo -> novo (nome de fórmula e sequência), pela posição em p_order. Guardado antes da passagem temporária.
  select jsonb_agg(jsonb_build_object(
           'id', l.id, 'new_seq', o.pos,
           'old_name', l.formula_name,
           'new_name', case when l.formula_name is not null and l.formula_name = l.seq::text then o.pos::text else l.formula_name end))
    into mapping
    from unnest(p_order) with ordinality as o(id, pos)
    join public.planning_form_lines l on l.id = o.id;

  -- Passagem temporária: libera seq e formula_name para evitar colisão de unique durante a troca.
  update public.planning_form_lines l set seq = l.seq + 1000000,
         formula_name = case when l.formula_name is null then null else '~' || l.id::text end
  where l.form_id = p_form;

  update public.planning_form_lines l set seq = t.new_seq, formula_name = t.new_name
  from jsonb_to_recordset(mapping) as t(id uuid, new_seq integer, old_name text, new_name text)
  where l.id = t.id;

  -- Referências nas fórmulas: troca simultânea via marcador (<@novo>) para nunca reaplicar um mapeamento sobre outro.
  for r in select l.id, l.formula_text from public.planning_form_lines l where l.form_id = p_form and l.origin = 'formula' and l.formula_text is not null loop
    new_text := r.formula_text;
    for m in select t.old_name, t.new_name from jsonb_to_recordset(mapping) as t(id uuid, new_seq integer, old_name text, new_name text) where t.old_name is not null and t.old_name is distinct from t.new_name loop
      new_text := replace(new_text, '<' || m.old_name || '>', '<@' || m.new_name || '>');
    end loop;
    new_text := replace(new_text, '<@', '<');
    if new_text is distinct from r.formula_text then
      update public.planning_form_lines set formula_text = new_text where id = r.id;
    end if;
  end loop;

  perform public.planning_validate_form(p_form);
  update public.planning_forms set revision = revision + 1 where id = p_form;
  insert into public.planning_audit_log(organization_id, scenario_id, actor, action, details)
    values (p_org, p_scenario, auth.uid(), 'reorder_lines', jsonb_build_object('form_id', p_form));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.planning_reorder_lines(uuid, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.planning_reorder_lines(uuid, uuid, uuid, uuid[]) to authenticated;

commit;
