const assert = require('node:assert/strict');
const { createOpexDb, NOTIFICATIONS_PRELUDE } = require('./helpers/opexSqlHarness');
const FILES = ['346_opex_review_schema.sql', '347_opex_review_analysis_rpcs.sql', '348_opex_review_actions_rpcs.sql', '350_opex_review_notifications.sql', '352_opex_review_reminders.sql'];
(async () => {
  const { db, ids, as, asSuper, uuid } = await createOpexDb(FILES, { prelude: NOTIFICATIONS_PRELUDE });
  try {
    const budget = uuid();
    await asSuper();
    await db.query(`insert into forecast_scenarios(id,organization_id,name,reference_year) values($1,$2,'Budget 2026',2026)`, [budget, ids.org]);
    const call = async (fn, ...args) => (await db.query(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) r`, args)).rows[0].r;
    const create = async (account, title, due, assignee, owner = ids.manager) => {
      await as(owner);
      const ctx = JSON.stringify({ costCenterId: ids.cc1, accountNumber: account, year: 2026, periodType: 'month', month: 9, sourceKey: `scenario:${budget}` });
      const a = await call('opex_create_action', ctx, JSON.stringify({ title, expectedResult: 'R', dueDate: due, assigneeUserId: assignee }), uuid());
      await asSuper();
      return a.id;
    };
    const kinds = async id => { await asSuper(); return (await db.query(`select kind, target_user_id t from notifications where ref_action_id=$1 and kind in ('opex_action_due_soon','opex_action_overdue') order by kind, t`, [id])).rows; };
    // quarta-feira 2027-03-10 08:00 BRT = 11:00 UTC; prazos relativos a esse dia
    const NOW = '2027-03-10T11:00:00Z';
    const soon = await create('0010', 'Vence em 3 dias', '2027-03-13', ids.exec);
    const tomorrow = await create('0011', 'Vence amanhã', '2027-03-11', ids.exec);
    const far = await create('0012', 'Vence em 4 dias', '2027-03-14', ids.exec);
    const today = await create('0013', 'Vence hoje', '2027-03-10', ids.exec);
    const late = await create('0014', 'Vencida', '2027-03-09', ids.exec);
    const lateSelf = await create('0015', 'Vencida e do próprio dono', '2027-03-01', ids.manager);
    const delivered = await create('0016', 'Entregue', '2027-03-01', ids.exec);
    await asSuper();
    await db.query(`update opex_action_plans set status='awaiting_validation' where id=$1`, [delivered]);

    const run = async now => { await asSuper(); return call('opex_run_reminders', now); };
    const first = await run(NOW);
    assert.ok(first > 0);
    assert.deepEqual((await kinds(soon)).map(r => r.kind), ['opex_action_due_soon']);
    assert.deepEqual((await kinds(tomorrow)).map(r => r.kind), ['opex_action_due_soon']);
    assert.deepEqual(await kinds(far), [], 'fora da janela de 3 dias');
    assert.deepEqual((await kinds(today)).map(r => r.kind), ['opex_action_due_soon'], 'hoje ainda não está vencida');
    assert.deepEqual((await kinds(late)).map(r => [r.kind, r.t]).sort(), [['opex_action_overdue', ids.exec], ['opex_action_overdue', ids.manager]].sort(), 'atraso avisa executor e dono');
    assert.deepEqual((await kinds(lateSelf)).map(r => r.kind), ['opex_action_overdue'], 'dono = executor: um aviso só');
    assert.deepEqual(await kinds(delivered), [], 'aguardando validação não é cobrança do executor');
    // reexecução no mesmo dia (login/polling) não duplica; o e-mail também sai uma vez só; não depende de usuário logado
    assert.equal(await run(NOW), 0);
    assert.equal(await run('2027-03-10T14:30:00Z'), 0);
    await asSuper();
    assert.equal((await db.query(`select count(*)::int n from notification_email_outbox where opex_kind in ('due_soon','overdue')`)).rows[0].n, 6);
    // dia seguinte: "far" entra na janela; as já avisadas não repetem
    assert.ok(await run('2027-03-11T11:00:00Z') >= 1);
    assert.deepEqual((await kinds(far)).map(r => r.kind), ['opex_action_due_soon']);
    assert.equal((await kinds(soon)).length, 1);
    // fim de semana não executa; prazo de sábado é cobrado na segunda
    const sat = await create('0017', 'Vence sábado', '2027-03-13', ids.exec2);
    assert.equal(await run('2027-03-13T11:00:00Z'), 0, 'sábado');
    assert.equal(await run('2027-03-14T11:00:00Z'), 0, 'domingo');
    await run('2027-03-15T11:00:00Z');
    assert.ok((await kinds(sat)).some(r => r.kind === 'opex_action_overdue'));
    // novo prazo reabre a elegibilidade
    const before = (await kinds(tomorrow)).filter(r => r.kind === 'opex_action_due_soon').length;
    await as(ids.manager);
    await call('opex_update_action_terms', tomorrow, JSON.stringify({ dueDate: '2027-03-18' }), 1, uuid());
    await asSuper();
    await run('2027-03-16T11:00:00Z');
    assert.equal((await kinds(tomorrow)).filter(r => r.kind === 'opex_action_due_soon').length, before + 1, 'novo prazo = novo aviso');
    // concluída para de ser cobrada
    await asSuper();
    await db.query(`update opex_action_plans set status='completed' where id=$1`, [late]);
    const lateBefore = (await kinds(late)).length;
    await run('2027-03-17T11:00:00Z');
    assert.equal((await kinds(late)).length, lateBefore, 'concluída não é cobrada');
    console.log('opexReviewReminders.sql: OK');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exit(1); });
