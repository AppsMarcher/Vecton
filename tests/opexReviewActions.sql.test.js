const assert = require('node:assert/strict');
const { createOpexDb } = require('./helpers/opexSqlHarness');
const FILES = ['346_opex_review_schema.sql', '347_opex_review_analysis_rpcs.sql', '348_opex_review_actions_rpcs.sql'];
const keysOf = value => Array.isArray(value) ? value.flatMap(keysOf) : value && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]) : [];
(async () => {
  const { db, ids, as, asSuper, fails, uuid } = await createOpexDb(FILES);
  try {
    const budget = uuid();
    await asSuper();
    await db.query(`insert into forecast_scenarios(id,organization_id,name,reference_year) values($1,$2,'Budget 2026',2026)`, [budget, ids.org]);
    await db.query(`insert into actuals_ledger_entries(organization_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount) values($1,2026,9,'0010',$2,'1001',1000)`, [ids.org, ids.cc1]);
    const ctx = (over = {}) => ({ costCenterId: ids.cc1, accountNumber: '0010', year: 2026, periodType: 'month', month: 9, sourceKey: `scenario:${budget}`, groupName: 'G', accountName: 'Conta', ...over });
    const call = async (fn, ...args) => (await db.query(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) r`, args)).rows[0].r;
    const as_ = (user, fn, ...args) => as(user).then(() => call(fn, ...args));
    const create = (over = {}, user = ids.manager, key = uuid()) => as_(user, 'opex_create_action', JSON.stringify(ctx(over.ctx)), JSON.stringify({ title: 'Renegociar contrato', expectedResult: 'Proposta renegociada', dueDate: '2099-12-30', assigneeUserId: ids.exec, ...over.fields }), key);
    const ack = (id, cycle, version, user = ids.exec, key = uuid()) => as_(user, 'opex_ack_action', id, cycle, version, key);

    // ---- criação: validações e permissões
    await fails(create({ fields: { title: ' ' } }), '22023');
    await fails(create({ fields: { dueDate: '' } }), '22023');
    await fails(create({ fields: { assigneeUserId: ids.inactive } }), '22023');
    await fails(create({}, ids.analyst), '42501');
    await fails(create({}, ids.outsider), '42501');
    await fails(create({ ctx: { costCenterId: ids.cc3 } }), '42501');
    const key1 = uuid();
    const a1 = await create({}, ids.manager, key1);
    assert.equal(a1.status, 'awaiting_ack'); assert.equal(a1.assignmentCycle, 1); assert.equal(a1.version, 1);
    assert.equal(a1.owner.id, ids.manager); assert.equal(a1.assignee.id, ids.exec);
    const again = await create({}, ids.manager, key1);
    assert.equal(again.id, a1.id);
    await asSuper();
    assert.equal((await db.query('select count(*)::int n from opex_action_plans')).rows[0].n, 1, 'retry não duplica');
    assert.equal((await db.query(`select count(*)::int n from opex_action_events where kind='created'`)).rows[0].n, 1);
    assert.equal((await db.query('select analysis_state, cause from opex_variance_analyses')).rows[0].cause, null, 'contexto criado sem fingir causa');

    // ---- DTO restrito do executor sem CC
    const dto = await as_(ids.exec, 'opex_get_action', a1.id);
    const forbidden = keysOf(dto).filter(k => /snapshot|cause|impact|analysis|actual|comparison|variance|financial|ledger|cost|amount|value/i.test(k));
    assert.deepEqual(forbidden, [], 'DTO do executor não tem chave financeira');
    assert.equal(dto.permissions.canAck, true); assert.equal(dto.permissions.canReassign, false);
    await as(ids.exec);
    assert.equal((await db.query('select count(*)::int n from opex_variance_analyses')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from opex_action_plans')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from opex_action_events')).rows[0].n, 0);
    await fails(call('opex_get_analysis', JSON.stringify(ctx())), '42501');
    await fails(call('opex_actions_for_analysis', JSON.stringify(ctx())), '42501');
    // quem não participa e não lê o CC não vê nem a existência da ação
    await fails(as_(ids.exec2, 'opex_get_action', a1.id), '42501');
    await fails(as_(ids.outsider, 'opex_get_action', a1.id), '42501');
    assert.equal((await as_(ids.analyst, 'opex_get_action', a1.id)).id, a1.id, 'quem lê o CC vê a tarefa');
    await fails(as_(ids.admin, 'opex_get_action', uuid()), '42501');

    // ---- ciência
    await fails(ack(a1.id, 1, 1, ids.manager), '42501');
    await fails(ack(a1.id, 2, 1), '40001');
    await fails(ack(a1.id, 1, 9), '40001');
    const ackKey = uuid();
    const acked = await ack(a1.id, 1, 1, ids.exec, ackKey);
    assert.equal(acked.status, 'in_progress'); assert.ok(acked.acknowledgedAt); assert.equal(acked.version, 2);
    assert.equal((await ack(a1.id, 1, 1, ids.exec, ackKey)).version, 2, 'mesma chave devolve o resultado original');
    await fails(ack(a1.id, 1, 2), '22023');

    // ---- comentário
    await as_(ids.exec, 'opex_comment_action', a1.id, 'Iniciei a negociação', uuid());
    await as_(ids.manager, 'opex_comment_action', a1.id, 'Ok', uuid());
    await fails(as_(ids.exec2, 'opex_comment_action', a1.id, 'x', uuid()), '42501');
    await fails(as_(ids.manager, 'opex_comment_action', a1.id, '  ', uuid()), '22023');

    // ---- entrega, devolução, validação
    await fails(as_(ids.exec, 'opex_submit_action', a1.id, ' ', 2, uuid()), '22023');
    await fails(as_(ids.exec, 'opex_submit_action', a1.id, 'feito', 1, uuid()), '40001');
    const sub = await as_(ids.exec, 'opex_submit_action', a1.id, 'Contrato renegociado', 2, uuid());
    assert.equal(sub.status, 'awaiting_validation'); assert.equal(sub.permissions.canSubmit, false);
    await fails(as_(ids.exec, 'opex_validate_action', a1.id, 3, uuid()), '42501');
    await fails(as_(ids.manager, 'opex_validate_action', a1.id, 2, uuid()), '40001');
    await fails(as_(ids.manager, 'opex_return_action', a1.id, '  ', 3, uuid()), '22023');
    const returned = await as_(ids.manager, 'opex_return_action', a1.id, 'Falta anexar a proposta', 3, uuid());
    assert.equal(returned.status, 'adjustments_requested');
    const sub2 = await as_(ids.exec, 'opex_submit_action', a1.id, 'Proposta anexada', 4, uuid());
    const done = await as_(ids.manager, 'opex_validate_action', a1.id, sub2.version, uuid());
    assert.equal(done.status, 'completed'); assert.ok(done.events.some(e => e.kind === 'validated'));
    await fails(as_(ids.manager, 'opex_reassign_action', a1.id, ids.exec2, done.version, uuid()), '22023');
    await fails(as_(ids.exec, 'opex_comment_action', a1.id, 'tarde', uuid()), '22023');
    await asSuper();
    assert.equal((await db.query(`select count(*)::int n from opex_action_events where action_id=$1`, [a1.id])).rows[0].n >= 9, true);

    // ---- reatribuição: novo ciclo, ciência antiga recusada, direitos acompanham o responsável atual
    const a2 = await create({ fields: { title: 'Cortar horas extras' } });
    const a2ack = await ack(a2.id, 1, 1);
    const r1 = await as_(ids.manager, 'opex_reassign_action', a2.id, ids.exec2, a2ack.version, uuid());
    assert.equal(r1.assignmentCycle, 2); assert.equal(r1.status, 'awaiting_ack'); assert.equal(r1.acknowledgedAt, null); assert.equal(r1.assignee.id, ids.exec2);
    await fails(as_(ids.exec, 'opex_get_action', a2.id), '42501');   // antigo executor perde o acesso
    await fails(ack(a2.id, 1, r1.version, ids.exec2), '40001');        // ciência do ciclo antigo
    await fails(as_(ids.manager, 'opex_reassign_action', a2.id, ids.exec2, r1.version, uuid()), '22023');
    await fails(as_(ids.manager, 'opex_reassign_action', a2.id, ids.inactive, r1.version, uuid()), '22023');
    await fails(as_(ids.exec2, 'opex_reassign_action', a2.id, ids.exec, r1.version, uuid()), '42501');
    const r2 = await as_(ids.manager, 'opex_reassign_action', a2.id, ids.exec, r1.version, uuid());
    assert.equal(r2.assignmentCycle, 3);
    await fails(ack(a2.id, 1, r2.version), '40001');                   // mesmo usuário, ciclo antigo
    const ok3 = await ack(a2.id, 3, r2.version);
    assert.equal(ok3.status, 'in_progress');
    await asSuper();
    assert.equal((await db.query(`select count(*)::int n from opex_action_events where action_id=$1 and kind='reassigned'`, [a2.id])).rows[0].n, 2, 'histórico de atribuições preservado');
    assert.equal((await db.query(`select count(*)::int n from opex_action_events where action_id=$1 and kind='acknowledged'`, [a2.id])).rows[0].n, 2, 'histórico de ciência preservado');

    // ---- prazo/resultado: só o dono; não reinicia ciência; registra antes/depois sem expor auditoria ao executor
    await fails(as_(ids.exec, 'opex_update_action_terms', a2.id, JSON.stringify({ dueDate: '2099-01-01' }), ok3.version, uuid()), '42501');
    const t = await as_(ids.manager, 'opex_update_action_terms', a2.id, JSON.stringify({ dueDate: '2099-12-31', expectedResult: 'Novo resultado' }), ok3.version, uuid());
    assert.equal(t.status, 'in_progress'); assert.equal(t.dueDate, '2099-12-31');
    const execView = await as_(ids.exec, 'opex_get_action', a2.id);
    assert.ok(execView.events.some(e => /Prazo alterado de 30\/12\/2099 para 31\/12\/2099/.test(e.text)));
    assert.ok(!JSON.stringify(execView).includes('"audit"'));
    await asSuper();
    assert.equal((await db.query(`select due_date_version from opex_action_plans where id=$1`, [a2.id])).rows[0].due_date_version, 2);
    assert.equal((await db.query(`select audit->'before'->>'dueDate' d from opex_action_events where kind='terms_changed'`)).rows[0].d, '2099-12-30');
    const same = await as_(ids.manager, 'opex_update_action_terms', a2.id, JSON.stringify({ dueDate: '2099-12-31' }), t.version, uuid());
    assert.equal(same.version, t.version, 'sem mudança, sem nova versão');

    // ---- atraso derivado e fim do dia
    const a3 = await create({ fields: { title: 'Atrasada' } });
    await asSuper();
    await db.query(`update opex_action_plans set due_date = (now() at time zone 'America/Sao_Paulo')::date - 1 where id=$1`, [a3.id]);
    assert.equal((await as_(ids.exec, 'opex_get_action', a3.id)).overdue, true, 'awaiting_ack atrasada');
    await asSuper();
    await db.query(`update opex_action_plans set due_date = (now() at time zone 'America/Sao_Paulo')::date where id=$1`, [a3.id]);
    assert.equal((await as_(ids.exec, 'opex_get_action', a3.id)).overdue, false, 'vence só no fim do dia');
    await asSuper();
    await db.query(`update opex_action_plans set status='awaiting_validation', due_date = (now() at time zone 'America/Sao_Paulo')::date - 5 where id=$1`, [a3.id]);
    assert.equal((await as_(ids.exec, 'opex_get_action', a3.id)).overdue, false, 'entregue não é cobrança do executor');

    // ---- Minhas ações e pendências de entrada
    await asSuper();
    await db.exec("alter table opex_action_events disable trigger opex_action_events_immutable; delete from opex_action_events; delete from opex_action_plans; alter table opex_action_events enable trigger opex_action_events_immutable;");
    const mk = async (title, due, status, assignee = ids.exec, owner = ids.manager) => {
      const created = await create({ fields: { title, assigneeUserId: assignee } }, owner);
      await asSuper();
      await db.query(`update opex_action_plans set due_date=(now() at time zone 'America/Sao_Paulo')::date + $2::int, status=$3, submitted_at = case when $3='awaiting_validation' then now() else null end where id=$1`, [created.id, due, status]);
      return created.id;
    };
    const ackLate = await mk('ciencia-atrasada', -10, 'awaiting_ack');
    const ackSoon = await mk('ciencia-proxima', 2, 'awaiting_ack');
    const lateB = await mk('vencida-5', -5, 'in_progress');
    const lateA = await mk('vencida-9', -9, 'adjustments_requested');
    const soonB = await mk('avencer-9', 9, 'in_progress');
    const soonA = await mk('avencer-3', 3, 'in_progress');
    const today = await mk('hoje', 0, 'in_progress');
    const toValidate = await mk('validar', 1, 'awaiting_validation');
    const done2 = await mk('feita', -3, 'completed');
    const pending = await as_(ids.exec, 'opex_entry_pending', 10);
    const titles = section => (pending.sections[section]?.items || []).map(i => i.title);
    assert.deepEqual(titles('ack'), ['ciencia-atrasada', 'ciencia-proxima'], 'ciência por vencimento; atrasada não duplica em vencidas');
    assert.deepEqual(titles('overdue'), ['vencida-9', 'vencida-5'], 'mais atrasada primeiro');
    assert.deepEqual(titles('upcoming'), ['hoje', 'avencer-3', 'avencer-9'], 'hoje não está atrasada');
    assert.equal(pending.sections.validate, undefined, 'entrega aguardando validação não é pendência do executor');
    assert.equal(pending.total, 7, JSON.stringify(Object.fromEntries(Object.entries(pending.sections).map(([k, v]) => [k, v.items.map(i => i.title)]))));
    const ownerPending = await as_(ids.manager, 'opex_entry_pending', 10);
    assert.deepEqual((ownerPending.sections.validate.items || []).map(i => i.title), ['validar']);
    assert.equal((await as_(ids.exec, 'opex_entry_pending', 1)).sections.ack.items.length, 1);
    assert.equal((await as_(ids.exec, 'opex_entry_pending', 1)).sections.ack.total, 2, 'total preservado além do limite');
    const mine = await as_(ids.exec, 'opex_my_actions', JSON.stringify({ limit: 3 }), null);
    assert.equal(mine.items.length, 3); assert.equal(mine.total, 8, 'inclui a própria entrega aguardando validação'); assert.ok(mine.nextCursor);
    assert.deepEqual(mine.items.map(i => i.title), ['ciencia-atrasada', 'vencida-9', 'vencida-5']);
    const next = await as_(ids.exec, 'opex_my_actions', JSON.stringify({ limit: 3 }), JSON.stringify(mine.nextCursor));
    assert.deepEqual(next.items.map(i => i.title), ['hoje', 'validar', 'ciencia-proxima']);
    assert.deepEqual(keysOf(mine).filter(k => /snapshot|cause|impact|actual|cost|financial/i.test(k)), []);
    const ownerList = await as_(ids.manager, 'opex_my_actions', JSON.stringify({ role: 'owner' }), null);
    assert.deepEqual(ownerList.items.map(i => i.title), ['validar']);
    assert.equal((await as_(ids.exec, 'opex_my_actions', JSON.stringify({ status: 'completed' }), null)).items[0].title, 'feita');
    assert.equal((await as_(ids.exec, 'opex_my_actions', JSON.stringify({ overdueOnly: true }), null)).items.length, 3);
    await fails(as_(ids.exec, 'opex_my_actions', JSON.stringify({ role: 'x' }), null), '22023');

    // ---- executores possíveis e usuário desativado
    const users = await as_(ids.manager, 'opex_assignable_users', ids.cc1);
    const byName = Object.fromEntries(users.map(u => [u.name, u.hasCcAccess]));
    assert.equal(byName['Executor Sem CC'], false); assert.equal(byName['Gestor Controladoria'], true); assert.equal(byName['Admin'], true);
    assert.equal(byName['Gestor Industrial'], false);
    assert.ok(!users.some(u => u.name === 'Outra Org'));
    await fails(as_(ids.analyst, 'opex_assignable_users', ids.cc1), '42501');
    await asSuper();
    await db.query(`update user_profiles set is_active=false where user_id=$1`, [ids.exec]);
    await fails(as_(ids.exec, 'opex_get_action', ackSoon), '42501');
    await fails(create({ fields: { assigneeUserId: ids.exec } }), '22023');
    assert.equal((await as_(ids.exec, 'opex_entry_pending', 5)).total, 0, 'usuário desativado não recebe pendências');

    // ---- dono perde o escopo do CC: continua dono da tarefa, mas não lê mais a análise/ledger
    await asSuper();
    await db.query(`update user_profiles set management='Marketing' where user_id=$1`, [ids.manager]);
    await fails(as_(ids.manager, 'opex_get_analysis', JSON.stringify(ctx())), '42501');
    await fails(as_(ids.manager, 'opex_actions_for_analysis', JSON.stringify(ctx())), '42501');
    await asSuper();
    assert.equal((await db.query('select owner_user_id o from opex_action_plans where id=$1', [toValidate])).rows[0].o, ids.admin, 'posse passa automaticamente (ver opexReviewOwnership)');
    await fails(as_(ids.manager, 'opex_get_action', toValidate), '42501');
    await fails(create({}, ids.manager), '42501');
    console.log('opexReviewActions.sql: OK');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exit(1); });
