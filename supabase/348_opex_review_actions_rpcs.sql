begin;

-- Planos de ação de OPEX: criação/atribuição, ciência, andamento, entrega, validação, devolução, reatribuição,
-- alteração de prazo/resultado, listas operacionais ("Minhas ações", pendências de entrada) e posse (migration 348b abaixo).
--
-- Segurança: o executor sem acesso ao CC lê SOMENTE o DTO operacional (opex_action_dto): sem valores, sem causa,
-- sem impacto financeiro, sem ID da análise. Erros: 42501 acesso · 22023 validação · 40001 conflito de versão/ciclo.
-- Idempotente.

-- ---------------------------------------------------------------- helpers
create or replace function public.opex_today()
returns date
language sql stable
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Atraso derivado (nunca gravado): vence no fim do dia local; entrega aguardando validação não é cobrança do executor.
create or replace function public.opex_is_overdue(p_due date, p_status text)
returns boolean
language sql stable
as $$ select p_status in ('awaiting_ack', 'in_progress', 'adjustments_requested') and p_due < public.opex_today() $$;

-- Escopo de leitura de um usuário QUALQUER (a forecast_read_scope() só enxerga auth.uid()).
create or replace function public.opex_user_can_read_cc(p_user uuid, p_org uuid, p_cc uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_profiles u
    where u.user_id = p_user and u.organization_id = p_org and u.is_active
      and (
        u.access_role::text in ('admin', 'super_admin')
        or coalesce(u.additional_access_roles::text[], '{}') && array['admin', 'super_admin']
        or exists (
          select 1 from public.cost_centers c
          where c.id = p_cc and c.organization_id = p_org
            and ((nullif(trim(u.management), '') is not null and trim(c.cost_center_management) = trim(u.management))
                 or trim(c.cost_center_management) = any (coalesce(u.extra_managements, '{}'))
                 or c.id::text = any (coalesce(u.extra_cc_ids::text[], '{}')))
        )
      )
  );
$$;

create or replace function public.opex_user_name(p_org uuid, p_user uuid)
returns text
language sql stable security definer set search_path to 'public'
as $$ select coalesce(nullif(btrim(full_name), ''), split_part(email, '@', 1), 'Usuário') from public.user_profiles where organization_id = p_org and user_id = p_user limit 1 $$;

create or replace function public.opex_is_active_member(p_org uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.user_profiles where organization_id = p_org and user_id = p_user and is_active) $$;

-- Gancho de notificações: a migration 350 substitui este corpo pela emissão real (sino + outbox).
create or replace function public.opex_emit(p_action uuid, p_kind text, p_recipient uuid, p_cycle integer, p_version integer)
returns void
language plpgsql security definer set search_path to 'public'
as $$ begin return; end; $$;

create or replace function public.opex_log_event(p public.opex_action_plans, p_kind text, p_shared_text text, p_audit jsonb, p_idem text)
returns void
language sql security definer set search_path to 'public'
as $$
  insert into public.opex_action_events (organization_id, action_id, kind, actor_user_id, assignment_cycle, action_version, shared_text, audit, idem_key)
  values (p.organization_id, p.id, p_kind, auth.uid(), p.assignment_cycle, p.version, p_shared_text, p_audit, p_idem)
  on conflict do nothing;
$$;

-- ---------------------------------------------------------------- DTO operacional (único formato lido pelo executor)
create or replace function public.opex_action_dto(p public.opex_action_plans, p_with_events boolean)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare me uuid := auth.uid(); is_owner boolean; is_assignee boolean; events jsonb := '[]'::jsonb;
begin
  is_owner := p.owner_user_id = me;
  is_assignee := p.assignee_user_id = me;
  if p_with_events then
    select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'actor', public.opex_user_name(e.organization_id, e.actor_user_id),
        'at', e.created_at, 'text', e.shared_text) order by e.created_at, e.id), '[]'::jsonb)
      into events from public.opex_action_events e where e.action_id = p.id and e.shared_text is not null;
  end if;
  return jsonb_build_object(
    'id', p.id, 'title', p.title, 'expectedResult', p.expected_result, 'dueDate', p.due_date, 'status', p.status,
    'overdue', public.opex_is_overdue(p.due_date, p.status), 'assignmentCycle', p.assignment_cycle, 'version', p.version,
    'owner', jsonb_build_object('id', p.owner_user_id, 'name', public.opex_user_name(p.organization_id, p.owner_user_id)),
    'assignee', jsonb_build_object('id', p.assignee_user_id, 'name', public.opex_user_name(p.organization_id, p.assignee_user_id)),
    'acknowledgedAt', p.acknowledged_at, 'submittedAt', p.submitted_at, 'submitNote', p.submit_note, 'validatedAt', p.validated_at,
    'createdAt', p.created_at, 'events', events,
    'permissions', jsonb_build_object(
      'isOwner', is_owner, 'isAssignee', is_assignee,
      'canAck', is_assignee and p.status = 'awaiting_ack',
      'canSubmit', is_assignee and p.status in ('in_progress', 'adjustments_requested'),
      'canComment', (is_owner or is_assignee) and p.status <> 'completed',
      'canValidate', is_owner and p.status = 'awaiting_validation',
      'canReturn', is_owner and p.status = 'awaiting_validation',
      'canReassign', is_owner and p.status <> 'completed',
      'canEditTerms', is_owner and p.status <> 'completed'));
end;
$$;

-- Trava a ação e confirma que o ator está ativo na organização. "Ação indisponível" não revela detalhes a quem não participa.
create or replace function public.opex_lock_action(p_action uuid)
returns public.opex_action_plans
language plpgsql security definer set search_path to 'public'
as $$
declare p public.opex_action_plans;
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into p from public.opex_action_plans where id = p_action and deleted_at is null for update;
  if not found or not public.is_org_member(p.organization_id) then raise exception 'Ação indisponível' using errcode = '42501'; end if;
  return p;
end;
$$;

create or replace function public.opex_check_version(p public.opex_action_plans, p_expected integer)
returns void
language plpgsql
as $$
begin
  if p_expected is distinct from p.version then raise exception 'A ação foi alterada. Recarregue e tente novamente.' using errcode = '40001'; end if;
end;
$$;

-- ---------------------------------------------------------------- executores possíveis
create or replace function public.opex_assignable_users(p_cc uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.cost_centers where id = p_cc;
  if v_org is null or auth.uid() is null or not public.opex_can_write_cc(v_org, p_cc) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('userId', u.user_id, 'name', public.opex_user_name(v_org, u.user_id),
            'hasCcAccess', public.opex_user_can_read_cc(u.user_id, v_org, p_cc)) order by lower(coalesce(u.full_name, u.email)))
          from public.user_profiles u where u.organization_id = v_org and u.is_active), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------- criar e atribuir
create or replace function public.opex_create_action(p_ctx jsonb, p_fields jsonb, p_idem_key text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare c record; a public.opex_variance_analyses; p public.opex_action_plans; prev jsonb;
  v_title text; v_result text; v_due date; v_assignee uuid; result jsonb;
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into c from public.opex_parse_ctx(p_ctx);
  if not public.opex_can_write_cc(c.org, c.cc) then raise exception 'Sem permissão para criar ações neste centro de custo' using errcode = '42501'; end if;
  prev := public.opex_idem_get(c.org, 'create_action', p_idem_key);
  if prev is not null then return prev; end if;
  v_title := nullif(btrim(coalesce(p_fields ->> 'title', '')), '');
  v_result := nullif(btrim(coalesce(p_fields ->> 'expectedResult', '')), '');
  v_due := nullif(p_fields ->> 'dueDate', '')::date;
  v_assignee := nullif(p_fields ->> 'assigneeUserId', '')::uuid;
  if v_title is null or v_result is null or v_due is null or v_assignee is null then raise exception 'Informe o que será feito, o resultado esperado, o prazo e o responsável' using errcode = '22023'; end if;
  if char_length(v_title) > 1000 or char_length(v_result) > 2000 then raise exception 'Texto muito longo' using errcode = '22023'; end if;
  if not public.opex_is_active_member(c.org, v_assignee) then raise exception 'Responsável inválido ou inativo' using errcode = '22023'; end if;

  a := public.opex_ensure_analysis(p_ctx, p_fields, false);
  insert into public.opex_action_plans (organization_id, analysis_id, owner_user_id, assignee_user_id, title, expected_result, due_date, created_by)
  values (c.org, a.id, auth.uid(), v_assignee, v_title, v_result, v_due, auth.uid())
  returning * into p;
  perform public.opex_log_event(p, 'created', 'Ação criada: ' || v_title, jsonb_build_object('assignee', v_assignee, 'dueDate', v_due), null);
  perform public.opex_log_event(p, 'assigned', 'Atribuída a ' || public.opex_user_name(c.org, v_assignee), jsonb_build_object('assignee', v_assignee), null);
  perform public.opex_emit(p.id, 'assigned', v_assignee, p.assignment_cycle, p.version);
  result := public.opex_action_dto(p, true) || jsonb_build_object('analysisVersion', a.version, 'analysisId', a.id);
  perform public.opex_idem_put(c.org, 'create_action', p_idem_key, result);
  return result;
end;
$$;

-- ---------------------------------------------------------------- ler tarefa operacional
create or replace function public.opex_get_action(p_action_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare p public.opex_action_plans; v_cc uuid;
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into p from public.opex_action_plans where id = p_action_id and deleted_at is null;
  if not found or not public.is_org_member(p.organization_id) then raise exception 'Ação indisponível' using errcode = '42501'; end if;
  select cost_center_id into v_cc from public.opex_variance_analyses where id = p.analysis_id;
  if p.owner_user_id <> auth.uid() and p.assignee_user_id <> auth.uid() and not public.opex_can_read_cc(p.organization_id, v_cc) then
    raise exception 'Ação indisponível' using errcode = '42501';
  end if;
  return public.opex_action_dto(p, true);
end;
$$;

-- Ações de uma análise (aba "Plano de ação"): só para quem lê o CC (DTO operacional + contexto já conhecido por ele).
create or replace function public.opex_actions_for_analysis(p_ctx jsonb)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare c record; a public.opex_variance_analyses;
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into c from public.opex_parse_ctx(p_ctx);
  if not public.opex_can_read_cc(c.org, c.cc) then raise exception 'Sem acesso ao centro de custo' using errcode = '42501'; end if;
  select * into a from public.opex_variance_analyses v
   where v.organization_id = c.org and v.cost_center_id = c.cc and v.account_number = c.account and v.reference_year = c.yr
     and v.period_type = c.period and v.reference_month = c.mth and v.comparison_source_key = c.source_key
     and v.comparison_source_year = (select reference_year from public.forecast_scenarios where id = c.scenario)
     and v.scope_key = c.scope_key and v.deleted_at is null;
  if not found then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(public.opex_action_dto(p, false) order by p.created_at, p.id)
                     from public.opex_action_plans p where p.analysis_id = a.id and p.deleted_at is null), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------- ciência
create or replace function public.opex_ack_action(p_action_id uuid, p_cycle integer, p_expected_version integer, p_idem_key text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare p public.opex_action_plans; prev jsonb; result jsonb;
begin
  p := public.opex_lock_action(p_action_id);
  prev := public.opex_idem_get(p.organization_id, 'ack:' || p_action_id, p_idem_key);
  if prev is not null then return prev; end if;
  if p.assignee_user_id <> auth.uid() then raise exception 'Somente o responsável atual confirma ciência' using errcode = '42501'; end if;
  if p_cycle is distinct from p.assignment_cycle then raise exception 'Esta atribuição foi substituída' using errcode = '40001'; end if;
  perform public.opex_check_version(p, p_expected_version);
  if p.status <> 'awaiting_ack' then raise exception 'A ação não está aguardando ciência' using errcode = '22023'; end if;
  update public.opex_action_plans set status = 'in_progress', acknowledged_at = now(), acknowledged_by = auth.uid(),
    version = version + 1, updated_at = now() where id = p.id returning * into p;
  perform public.opex_log_event(p, 'acknowledged', 'Ciência confirmada', null, null);
  if p.owner_user_id <> p.assignee_user_id then perform public.opex_emit(p.id, 'acknowledged', p.owner_user_id, p.assignment_cycle, p.version); end if;
  result := public.opex_action_dto(p, true);
  perform public.opex_idem_put(p.organization_id, 'ack:' || p_action_id, p_idem_key, result);
  return result;
end;
$$;

-- ---------------------------------------------------------------- comentário
create or replace function public.opex_comment_action(p_action_id uuid, p_text text, p_idem_key text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare p public.opex_action_plans; prev jsonb; v_text text; result jsonb;
begin
  p := public.opex_lock_action(p_action_id);
  prev := public.opex_idem_get(p.organization_id, 'comment:' || p_action_id, p_idem_key);
  if prev is not null then return prev; end if;
  if auth.uid() not in (p.owner_user_id, p.assignee_user_id) then raise exception 'Ação indisponível' using errcode = '42501'; end if;
  if p.status = 'completed' then raise exception 'A ação já foi concluída' using errcode = '22023'; end if;
  v_text := nullif(btrim(coalesce(p_text, '')), '');
  if v_text is null or char_length(v_text) > 2000 then raise exception 'Informe um comentário de até 2000 caracteres' using errcode = '22023'; end if;
  perform public.opex_log_event(p, 'comment', v_text, null, null);
  result := public.opex_action_dto(p, true);
  perform public.opex_idem_put(p.organization_id, 'comment:' || p_action_id, p_idem_key, result);
  return result;
end;
$$;

-- ---------------------------------------------------------------- concluir (executor) e pedir validação
create or replace function public.opex_submit_action(p_action_id uuid, p_note text, p_expected_version integer, p_idem_key text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare p public.opex_action_plans; prev jsonb; v_note text; result jsonb;
begin
  p := public.opex_lock_action(p_action_id);
  prev := public.opex_idem_get(p.organization_id, 'submit:' || p_action_id, p_idem_key);
  if prev is not null then return prev; end if;
  if p.assignee_user_id <> auth.uid() then raise exception 'Somente o responsável atual conclui a ação' using errcode = '42501'; end if;
  perform public.opex_check_version(p, p_expected_version);
  if p.status not in ('in_progress', 'adjustments_requested') then raise exception 'A ação não está em andamento' using errcode = '22023'; end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null or char_length(v_note) > 2000 then raise exception 'Descreva a entrega (até 2000 caracteres)' using errcode = '22023'; end if;
  update public.opex_action_plans set status = 'awaiting_validation', submitted_at = now(), submit_note = v_note,
    version = version + 1, updated_at = now() where id = p.id returning * into p;
  perform public.opex_log_event(p, 'submitted', v_note, null, null);
  if p.owner_user_id <> p.assignee_user_id then perform public.opex_emit(p.id, 'submitted', p.owner_user_id, p.assignment_cycle, p.version); end if;
  result := public.opex_action_dto(p, true);
  perform public.opex_idem_put(p.organization_id, 'submit:' || p_action_id, p_idem_key, result);
  return result;
end;
$$;

-- ---------------------------------------------------------------- validar / devolver (dono)
create or replace function public.opex_validate_action(p_action_id uuid, p_expected_version integer, p_idem_key text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare p public.opex_action_plans; prev jsonb; result jsonb;
begin
  p := public.opex_lock_action(p_action_id);
  prev := public.opex_idem_get(p.organization_id, 'validate:' || p_action_id, p_idem_key);
  if prev is not null then return prev; end if;
  if p.owner_user_id <> auth.uid() then raise exception 'Somente o dono do plano valida a entrega' using errcode = '42501'; end if;
  perform public.opex_check_version(p, p_expected_version);
  if p.status <> 'awaiting_validation' then raise exception 'A ação não está aguardando validação' using errcode = '22023'; end if;
  update public.opex_action_plans set status = 'completed', validated_at = now(), validated_by = auth.uid(),
    version = version + 1, updated_at = now() where id = p.id returning * into p;
  perform public.opex_log_event(p, 'validated', 'Entrega validada', null, null);
  if p.owner_user_id <> p.assignee_user_id then perform public.opex_emit(p.id, 'validated', p.assignee_user_id, p.assignment_cycle, p.version); end if;
  result := public.opex_action_dto(p, true);
  perform public.opex_idem_put(p.organization_id, 'validate:' || p_action_id, p_idem_key, result);
  return result;
end;
$$;

create or replace function public.opex_return_action(p_action_id uuid, p_reason text, p_expected_version integer, p_idem_key text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare p public.opex_action_plans; prev jsonb; v_reason text; result jsonb;
begin
  p := public.opex_lock_action(p_action_id);
  prev := public.opex_idem_get(p.organization_id, 'return:' || p_action_id, p_idem_key);
  if prev is not null then return prev; end if;
  if p.owner_user_id <> auth.uid() then raise exception 'Somente o dono do plano devolve a entrega' using errcode = '42501'; end if;
  perform public.opex_check_version(p, p_expected_version);
  if p.status <> 'awaiting_validation' then raise exception 'A ação não está aguardando validação' using errcode = '22023'; end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or char_length(v_reason) > 2000 then raise exception 'Informe a justificativa do ajuste (até 2000 caracteres)' using errcode = '22023'; end if;
  update public.opex_action_plans set status = 'adjustments_requested', version = version + 1, updated_at = now() where id = p.id returning * into p;
  perform public.opex_log_event(p, 'returned', v_reason, null, null);
  if p.owner_user_id <> p.assignee_user_id then perform public.opex_emit(p.id, 'returned', p.assignee_user_id, p.assignment_cycle, p.version); end if;
  result := public.opex_action_dto(p, true);
  perform public.opex_idem_put(p.organization_id, 'return:' || p_action_id, p_idem_key, result);
  return result;
end;
$$;

-- ---------------------------------------------------------------- reatribuir (novo ciclo de ciência)
create or replace function public.opex_reassign_action(p_action_id uuid, p_new_assignee uuid, p_expected_version integer, p_idem_key text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare p public.opex_action_plans; prev jsonb; old_assignee uuid; result jsonb;
begin
  p := public.opex_lock_action(p_action_id);
  prev := public.opex_idem_get(p.organization_id, 'reassign:' || p_action_id, p_idem_key);
  if prev is not null then return prev; end if;
  if p.owner_user_id <> auth.uid() then raise exception 'Somente o dono do plano reatribui' using errcode = '42501'; end if;
  perform public.opex_check_version(p, p_expected_version);
  if p.status = 'completed' then raise exception 'A ação já foi concluída' using errcode = '22023'; end if;
  if p_new_assignee is null or p_new_assignee = p.assignee_user_id then raise exception 'Escolha outro responsável' using errcode = '22023'; end if;
  if not public.opex_is_active_member(p.organization_id, p_new_assignee) then raise exception 'Responsável inválido ou inativo' using errcode = '22023'; end if;
  old_assignee := p.assignee_user_id;
  update public.opex_action_plans set assignee_user_id = p_new_assignee, assignment_cycle = assignment_cycle + 1, status = 'awaiting_ack',
    acknowledged_at = null, acknowledged_by = null, submitted_at = null, submit_note = null,
    version = version + 1, updated_at = now() where id = p.id returning * into p;
  perform public.opex_log_event(p, 'reassigned', 'Reatribuída a ' || public.opex_user_name(p.organization_id, p_new_assignee),
    jsonb_build_object('from', old_assignee, 'to', p_new_assignee), null);
  if old_assignee <> p.owner_user_id then perform public.opex_emit(p.id, 'unassigned', old_assignee, p.assignment_cycle - 1, p.version); end if;
  perform public.opex_emit(p.id, 'assigned', p_new_assignee, p.assignment_cycle, p.version);
  result := public.opex_action_dto(p, true);
  perform public.opex_idem_put(p.organization_id, 'reassign:' || p_action_id, p_idem_key, result);
  return result;
end;
$$;

-- ---------------------------------------------------------------- alterar prazo/resultado esperado (não reinicia a ciência)
create or replace function public.opex_update_action_terms(p_action_id uuid, p_fields jsonb, p_expected_version integer, p_idem_key text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare p public.opex_action_plans; prev jsonb; v_due date; v_result text; v_text text := ''; before_state jsonb; result jsonb; changed boolean := false;
begin
  p := public.opex_lock_action(p_action_id);
  prev := public.opex_idem_get(p.organization_id, 'terms:' || p_action_id, p_idem_key);
  if prev is not null then return prev; end if;
  if p.owner_user_id <> auth.uid() then raise exception 'Somente o dono do plano altera prazo e resultado' using errcode = '42501'; end if;
  perform public.opex_check_version(p, p_expected_version);
  if p.status = 'completed' then raise exception 'A ação já foi concluída' using errcode = '22023'; end if;
  v_due := coalesce(nullif(p_fields ->> 'dueDate', '')::date, p.due_date);
  v_result := coalesce(nullif(btrim(coalesce(p_fields ->> 'expectedResult', '')), ''), p.expected_result);
  if char_length(v_result) > 2000 then raise exception 'Texto muito longo' using errcode = '22023'; end if;
  before_state := jsonb_build_object('dueDate', p.due_date, 'expectedResult', p.expected_result);
  if v_due <> p.due_date then v_text := 'Prazo alterado de ' || to_char(p.due_date, 'DD/MM/YYYY') || ' para ' || to_char(v_due, 'DD/MM/YYYY'); changed := true; end if;
  if v_result <> p.expected_result then v_text := btrim(v_text || case when v_text = '' then '' else '. ' end || 'Resultado esperado atualizado'); changed := true; end if;
  if not changed then return public.opex_action_dto(p, true); end if;
  update public.opex_action_plans set due_date = v_due, expected_result = v_result,
    due_date_version = due_date_version + case when v_due <> due_date then 1 else 0 end,
    version = version + 1, updated_at = now() where id = p.id returning * into p;
  perform public.opex_log_event(p, 'terms_changed', v_text, jsonb_build_object('before', before_state, 'after', jsonb_build_object('dueDate', p.due_date, 'expectedResult', p.expected_result)), null);
  if p.owner_user_id <> p.assignee_user_id then perform public.opex_emit(p.id, 'changed', p.assignee_user_id, p.assignment_cycle, p.version); end if;
  result := public.opex_action_dto(p, true);
  perform public.opex_idem_put(p.organization_id, 'terms:' || p_action_id, p_idem_key, result);
  return result;
end;
$$;

-- ---------------------------------------------------------------- Minhas ações (executor + validações do dono)
create or replace function public.opex_action_dto_by_id(p_id uuid, p_with_events boolean)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$ select public.opex_action_dto(p, p_with_events) from public.opex_action_plans p where p.id = p_id $$;

create or replace function public.opex_my_actions(p_filters jsonb, p_cursor jsonb)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare me uuid := auth.uid(); v_role text := coalesce(p_filters ->> 'role', 'all'); v_status text := nullif(p_filters ->> 'status', '');
  v_overdue boolean := coalesce((p_filters ->> 'overdueOnly')::boolean, false);
  v_limit integer := least(greatest(coalesce((p_filters ->> 'limit')::int, 50), 1), 100);
  c_due date := nullif(p_cursor ->> 'due', '')::date; c_id uuid := nullif(p_cursor ->> 'id', '')::uuid;
  result jsonb;
begin
  if me is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  if v_role not in ('all', 'assignee', 'owner') then raise exception 'Filtro inválido' using errcode = '22023'; end if;
  with base as (
    select p.id, p.due_date, case when p.assignee_user_id = me then 'assignee' else 'owner' end as role
      from public.opex_action_plans p
     where p.deleted_at is null and public.is_org_member(p.organization_id)
       and ((v_role in ('all', 'assignee') and p.assignee_user_id = me) or (v_role in ('all', 'owner') and p.owner_user_id = me and p.status = 'awaiting_validation'))
       and ((v_status is null and p.status <> 'completed') or p.status = v_status)
       and (not v_overdue or public.opex_is_overdue(p.due_date, p.status))
  ), page as (
    select b.*, row_number() over (order by b.due_date, b.id) as rn from (
      select * from base where c_due is null or (due_date, id) > (c_due, c_id) order by due_date, id limit v_limit + 1) b
  )
  select jsonb_build_object(
      'items', coalesce((select jsonb_agg(public.opex_action_dto_by_id(g.id, false) || jsonb_build_object('role', g.role) order by g.rn) from page g where g.rn <= v_limit), '[]'::jsonb),
      'total', (select count(*) from base),
      'nextCursor', case when (select count(*) from page) > v_limit
        then (select jsonb_build_object('due', g.due_date, 'id', g.id) from page g where g.rn = v_limit) else null end)
    into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------- pendências de entrada (popover)
create or replace function public.opex_entry_pending(p_limit integer)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare me uuid := auth.uid(); v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50); today date := public.opex_today(); result jsonb;
begin
  if me is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  with mine as (
    select p.id, p.due_date, p.submitted_at, case
        when p.assignee_user_id = me and p.status = 'awaiting_ack' then 'ack'
        when p.assignee_user_id = me and p.status in ('in_progress', 'adjustments_requested') and p.due_date < today then 'overdue'
        when p.assignee_user_id = me and p.status in ('in_progress', 'adjustments_requested') then 'upcoming'
        when p.owner_user_id = me and p.status = 'awaiting_validation' then 'validate' end as section
    from public.opex_action_plans p
    where p.deleted_at is null and public.is_org_member(p.organization_id) and (p.assignee_user_id = me or p.owner_user_id = me)
  ), ranked as (
    select m.id, m.section,
      row_number() over (partition by m.section order by case when m.section = 'validate' then m.submitted_at::date else m.due_date end, m.submitted_at, m.id) as rn,
      count(*) over (partition by m.section) as section_total
    from mine m where m.section is not null
  )
  select jsonb_build_object(
    'sections', coalesce((select jsonb_object_agg(s.section, jsonb_build_object('total', s.section_total, 'items', s.items))
      from (select r.section, max(r.section_total) as section_total,
              jsonb_agg(public.opex_action_dto_by_id(r.id, false) order by r.rn) filter (where r.rn <= v_limit) as items
            from ranked r group by r.section) s), '{}'::jsonb),
    'total', (select count(*) from ranked))
  into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------- posse automática (dono sem acesso ao CC)
-- Regra: se o dono perde o escopo de escrita no CC (ou é desativado), a posse passa, nesta ordem, para
-- (1) o autor da análise, se ainda puder escrever; (2) um gestor da gestão do CC; (3) um administrador.
-- O executor e o novo dono são avisados; o histórico registra a troca. Nunca troca o executor.
create or replace function public.opex_user_can_write_cc(p_user uuid, p_org uuid, p_cc uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select public.opex_user_can_read_cc(p_user, p_org, p_cc) and exists (
    select 1 from public.user_profiles u
    where u.user_id = p_user and u.organization_id = p_org and u.is_active
      and (u.access_role::text in ('admin', 'super_admin', 'manager')
           or coalesce(u.additional_access_roles::text[], '{}') && array['admin', 'super_admin', 'manager']));
$$;

create or replace function public.opex_resolve_owner(p_action uuid)
returns uuid
language plpgsql stable security definer set search_path to 'public'
as $$
declare p public.opex_action_plans; a public.opex_variance_analyses; v_user uuid;
begin
  select * into p from public.opex_action_plans where id = p_action;
  select * into a from public.opex_variance_analyses where id = p.analysis_id;
  if public.opex_user_can_write_cc(a.created_by, p.organization_id, a.cost_center_id) then return a.created_by; end if;
  select u.user_id into v_user from public.user_profiles u join public.cost_centers c on c.id = a.cost_center_id
   where u.organization_id = p.organization_id and u.is_active and u.access_role::text = 'manager'
     and nullif(trim(u.management), '') is not null and trim(u.management) = trim(c.cost_center_management)
   order by u.created_at nulls last, u.user_id limit 1;
  if v_user is not null then return v_user; end if;
  select u.user_id into v_user from public.user_profiles u
   where u.organization_id = p.organization_id and u.is_active
     and (u.access_role::text in ('admin', 'super_admin') or coalesce(u.additional_access_roles::text[], '{}') && array['admin', 'super_admin'])
   order by u.created_at nulls last, u.user_id limit 1;
  return v_user;
end;
$$;

-- Reconcilia a posse das ações abertas (todas, ou só as de um dono). Retorna quantas trocaram.
create or replace function public.opex_reconcile_owners(p_only_owner uuid default null)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare r record; p public.opex_action_plans; a public.opex_variance_analyses; v_new uuid; v_count integer := 0;
begin
  for r in select id from public.opex_action_plans where deleted_at is null and status <> 'completed' and (p_only_owner is null or owner_user_id = p_only_owner) order by id loop
    select * into p from public.opex_action_plans where id = r.id for update;
    select * into a from public.opex_variance_analyses where id = p.analysis_id;
    if p.status = 'completed' or public.opex_user_can_write_cc(p.owner_user_id, p.organization_id, a.cost_center_id) then continue; end if;
    v_new := public.opex_resolve_owner(p.id);
    if v_new is null or v_new = p.owner_user_id then continue; end if;
    update public.opex_action_plans set owner_user_id = v_new, version = version + 1, updated_at = now() where id = p.id returning * into p;
    perform public.opex_log_event(p, 'owner_changed', 'Dono do plano alterado para ' || public.opex_user_name(p.organization_id, v_new),
      jsonb_build_object('from', r.id, 'to', v_new), null);
    perform public.opex_emit(p.id, 'owner_changed', v_new, p.assignment_cycle, p.version);
    if p.assignee_user_id <> v_new then perform public.opex_emit(p.id, 'owner_changed', p.assignee_user_id, p.assignment_cycle, p.version); end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.opex_profile_changed_reconcile()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public.opex_reconcile_owners(new.user_id);
  return new;
end;
$$;
drop trigger if exists opex_profile_reconcile_owners on public.user_profiles;
create trigger opex_profile_reconcile_owners
  after update of is_active, management, extra_managements, extra_cc_ids, access_role, additional_access_roles on public.user_profiles
  for each row execute function public.opex_profile_changed_reconcile();

-- ---------------------------------------------------------------- candidatos à reatribuição (dono da ação)
-- O DTO operacional não carrega o CC; o dono escolhe o novo executor por aqui. hasCcAccess alimenta o aviso de "sem acesso ao CC".
create or replace function public.opex_assignable_for_action(p_action uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare p public.opex_action_plans; v_cc uuid;
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into p from public.opex_action_plans where id = p_action and deleted_at is null;
  if not found or p.owner_user_id <> auth.uid() or not public.is_org_member(p.organization_id) then raise exception 'Ação indisponível' using errcode = '42501'; end if;
  select cost_center_id into v_cc from public.opex_variance_analyses where id = p.analysis_id;
  return coalesce((select jsonb_agg(jsonb_build_object('userId', u.user_id, 'name', public.opex_user_name(p.organization_id, u.user_id),
            'hasCcAccess', public.opex_user_can_read_cc(u.user_id, p.organization_id, v_cc)) order by lower(coalesce(u.full_name, u.email)))
          from public.user_profiles u where u.organization_id = p.organization_id and u.is_active and u.user_id <> p.assignee_user_id), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------- consolidado (análises e ações) — DTO financeiro, só CCs autorizados
create or replace function public.opex_list_records(p_filters jsonb, p_cursor jsonb)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare me uuid := auth.uid();
  v_type text := coalesce(p_filters ->> 'type', 'all'); v_cc uuid := nullif(p_filters ->> 'costCenterId', '')::uuid;
  v_year integer := nullif(p_filters ->> 'year', '')::integer; v_period text := nullif(p_filters ->> 'periodType', '');
  v_month integer := nullif(p_filters ->> 'month', '')::integer; v_resp uuid := nullif(p_filters ->> 'responsibleUserId', '')::uuid;
  v_status text := nullif(p_filters ->> 'status', ''); v_sort text := coalesce(p_filters ->> 'sort', 'updated');
  v_limit integer := least(greatest(coalesce((p_filters ->> 'limit')::int, 50), 1), 100);
  v_offset integer := greatest(coalesce((p_cursor ->> 'offset')::int, 0), 0);
  result jsonb;
begin
  if me is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  if v_type not in ('all', 'analyses', 'actions') then raise exception 'Filtro inválido' using errcode = '22023'; end if;
  if v_sort not in ('updated', 'due', 'period') then raise exception 'Ordenação inválida' using errcode = '22023'; end if;
  if v_status is not null and v_status not in ('in_analysis', 'analyzed', 'awaiting_ack', 'in_progress', 'overdue', 'awaiting_validation', 'adjustments_requested', 'completed') then
    raise exception 'Filtro inválido' using errcode = '22023';
  end if;
  if v_cc is not null and not exists (select 1 from public.cost_centers c where c.id = v_cc and public.opex_can_read_cc(c.organization_id, c.id)) then
    return jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'nextCursor', null);
  end if;
  with rows_all as (
    select 'analysis'::text as rtype, a.id, a.id as analysis_id, left(a.cause, 200) as title, a.cost_center_id, a.cost_center_number_snapshot as cc_number,
           a.cost_center_name_snapshot as cc_name, a.account_number, a.account_name_snapshot as account_name, a.group_reference,
           a.reference_year, a.period_type, a.reference_month, a.comparison_source_key, a.comparison_source_label, a.comparison_source_year,
           a.updated_by as responsible, null::date as due_date, a.analysis_state as status, false as overdue, a.monitor, a.updated_at,
           a.organization_id, null::int as assignment_cycle
      from public.opex_variance_analyses a
     where a.deleted_at is null and a.cause is not null and public.opex_can_read_cc(a.organization_id, a.cost_center_id)
    union all
    select 'action', p.id, a.id, p.title, a.cost_center_id, a.cost_center_number_snapshot, a.cost_center_name_snapshot, a.account_number, a.account_name_snapshot,
           a.group_reference, a.reference_year, a.period_type, a.reference_month, a.comparison_source_key, a.comparison_source_label, a.comparison_source_year,
           p.assignee_user_id, p.due_date, p.status, public.opex_is_overdue(p.due_date, p.status), false, p.updated_at, p.organization_id, p.assignment_cycle
      from public.opex_action_plans p join public.opex_variance_analyses a on a.id = p.analysis_id
     where p.deleted_at is null and a.deleted_at is null and public.opex_can_read_cc(a.organization_id, a.cost_center_id)
  ), filtered as (
    select * from rows_all r
     where (v_type = 'all' or (v_type = 'analyses' and r.rtype = 'analysis') or (v_type = 'actions' and r.rtype = 'action'))
       and (v_cc is null or r.cost_center_id = v_cc) and (v_year is null or r.reference_year = v_year)
       and (v_period is null or r.period_type = v_period) and (v_month is null or r.reference_month = v_month)
       and (v_resp is null or r.responsible = v_resp)
       and (v_status is null
            or (v_status in ('in_analysis', 'analyzed') and r.rtype = 'analysis' and r.status = v_status)
            or (v_status = 'overdue' and r.rtype = 'action' and r.overdue)
            or (v_status not in ('in_analysis', 'analyzed', 'overdue') and r.rtype = 'action' and r.status = v_status))
  ), page as (
    select f.* from filtered f
     order by case when v_sort = 'due' then f.due_date end asc nulls last,
              case when v_sort = 'period' then f.reference_year * 100 + f.reference_month end desc,
              f.updated_at desc, f.id
     offset v_offset limit v_limit
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('type', g.rtype, 'id', g.id, 'analysisId', g.analysis_id, 'title', g.title,
        'costCenterId', g.cost_center_id, 'costCenterNumber', g.cc_number, 'costCenterName', g.cc_name, 'accountNumber', g.account_number, 'accountName', g.account_name,
        'groupName', g.group_reference, 'year', g.reference_year, 'periodType', g.period_type, 'month', g.reference_month,
        'sourceKey', g.comparison_source_key, 'sourceLabel', g.comparison_source_label, 'sourceYear', g.comparison_source_year,
        'responsible', public.opex_user_name(g.organization_id, g.responsible), 'responsibleUserId', g.responsible, 'dueDate', g.due_date,
        'status', g.status, 'overdue', g.overdue, 'monitor', g.monitor, 'updatedAt', g.updated_at)
        order by case when v_sort = 'due' then g.due_date end asc nulls last, case when v_sort = 'period' then g.reference_year * 100 + g.reference_month end desc, g.updated_at desc, g.id) from page g), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'nextCursor', case when (select count(*) from filtered) > v_offset + v_limit then jsonb_build_object('offset', v_offset + v_limit) else null end)
  into result;
  return result;
end;
$$;

-- Responsáveis presentes nos registros que o usuário pode ler (alimenta o filtro "Responsável" do consolidado).
create or replace function public.opex_hub_responsibles()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('userId', t.user_id, 'name', t.name) order by lower(t.name))
    from (select distinct r.user_id, public.opex_user_name(r.organization_id, r.user_id) as name
            from (select a.organization_id, a.updated_by as user_id from public.opex_variance_analyses a
                   where a.deleted_at is null and a.cause is not null and public.opex_can_read_cc(a.organization_id, a.cost_center_id)
                  union
                  select p.organization_id, p.assignee_user_id from public.opex_action_plans p join public.opex_variance_analyses a on a.id = p.analysis_id
                   where p.deleted_at is null and public.opex_can_read_cc(a.organization_id, a.cost_center_id)) r) t), '[]'::jsonb);
end;
$$;

revoke all on function
  public.opex_today(), public.opex_is_overdue(date, text), public.opex_user_can_read_cc(uuid, uuid, uuid), public.opex_user_name(uuid, uuid),
  public.opex_is_active_member(uuid, uuid), public.opex_emit(uuid, text, uuid, integer, integer),
  public.opex_log_event(public.opex_action_plans, text, text, jsonb, text), public.opex_action_dto(public.opex_action_plans, boolean),
  public.opex_lock_action(uuid), public.opex_check_version(public.opex_action_plans, integer), public.opex_action_dto_by_id(uuid, boolean),
  public.opex_user_can_write_cc(uuid, uuid, uuid), public.opex_resolve_owner(uuid), public.opex_reconcile_owners(uuid), public.opex_profile_changed_reconcile() from public, anon, authenticated;
revoke all on function
  public.opex_assignable_users(uuid), public.opex_create_action(jsonb, jsonb, text), public.opex_get_action(uuid), public.opex_actions_for_analysis(jsonb),
  public.opex_ack_action(uuid, integer, integer, text), public.opex_comment_action(uuid, text, text), public.opex_submit_action(uuid, text, integer, text),
  public.opex_validate_action(uuid, integer, text), public.opex_return_action(uuid, text, integer, text), public.opex_reassign_action(uuid, uuid, integer, text),
  public.opex_update_action_terms(uuid, jsonb, integer, text), public.opex_my_actions(jsonb, jsonb), public.opex_entry_pending(integer),
  public.opex_assignable_for_action(uuid), public.opex_list_records(jsonb, jsonb), public.opex_hub_responsibles() from public, anon;
grant execute on function
  public.opex_assignable_users(uuid), public.opex_create_action(jsonb, jsonb, text), public.opex_get_action(uuid), public.opex_actions_for_analysis(jsonb),
  public.opex_ack_action(uuid, integer, integer, text), public.opex_comment_action(uuid, text, text), public.opex_submit_action(uuid, text, integer, text),
  public.opex_validate_action(uuid, integer, text), public.opex_return_action(uuid, text, integer, text), public.opex_reassign_action(uuid, uuid, integer, text),
  public.opex_update_action_terms(uuid, jsonb, integer, text), public.opex_my_actions(jsonb, jsonb), public.opex_entry_pending(integer),
  public.opex_assignable_for_action(uuid), public.opex_list_records(jsonb, jsonb), public.opex_hub_responsibles() to authenticated;

commit;
