const assert = require('node:assert/strict');
const { createOpexDb } = require('./helpers/opexSqlHarness');
const FILES = ['346_opex_review_schema.sql', '347_opex_review_analysis_rpcs.sql', '348_opex_review_actions_rpcs.sql', '357_opex_review_cancel_delete.sql', '358_opex_review_list_management.sql'];
(async () => {
  const { db, ids, as, asSuper, fails, uuid } = await createOpexDb(FILES);
  try {
    const budget = uuid();
    await asSuper();
    await db.query(`insert into forecast_scenarios(id,organization_id,name,reference_year) values($1,$2,'Budget 2026',2026)`, [budget, ids.org]);
    const call = async (fn, ...args) => (await db.query(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) r`, args)).rows[0].r;
    const as_ = (user, fn, ...args) => as(user).then(() => call(fn, ...args));
    const ctx = (over = {}) => JSON.stringify({ costCenterId: ids.cc1, accountNumber: '0010', year: 2026, periodType: 'month', month: 9, sourceKey: `scenario:${budget}`, groupName: 'Manutenção', accountName: 'Conta', ...over });
    const analysis = (user, over, cause) => as_(user, 'opex_save_analysis', ctx(over), JSON.stringify({ analysisState: 'analyzed', nature: 'recurring', cause }), 0, uuid());
    const action = (user, over, title, due, assignee = ids.exec) => as_(user, 'opex_create_action', ctx(over), JSON.stringify({ title, expectedResult: 'R', dueDate: due, assigneeUserId: assignee }), uuid());
    await analysis(ids.manager, { accountNumber: '0010' }, 'Causa A');
    await analysis(ids.manager, { accountNumber: '0011', periodType: 'YTD' }, 'Causa B');
    await analysis(ids.manager, { accountNumber: '0012', month: 8 }, 'Causa C');
    await analysis(ids.manager2, { costCenterId: ids.cc2, accountNumber: '0020' }, 'Causa Industrial');
    const aLate = await action(ids.manager, { accountNumber: '0010' }, 'Ação vencida', '2000-01-01');
    const aSoon = await action(ids.manager, { accountNumber: '0013' }, 'Ação futura', '2099-02-01', ids.exec2);   // análise só de rascunho (sem causa)
    const aFar = await action(ids.manager, { accountNumber: '0011', periodType: 'YTD' }, 'Ação distante', '2099-06-01');
    const list = async (user, filters = {}, cursor = null) => as_(user, 'opex_list_records', JSON.stringify(filters), cursor && JSON.stringify(cursor));
    const titles = r => r.items.map(i => i.title);

    // escopo: cada um só vê o que seu CC autoriza; sem CC, lista vazia (nunca erro vazando existência)
    const adminAll = await list(ids.admin);
    assert.equal(adminAll.total, 7, '4 análises com causa + 3 ações (o rascunho sem causa não é análise)');
    const mgr = await list(ids.manager);
    assert.ok(mgr.items.every(i => i.costCenterId === ids.cc1)); assert.equal(mgr.total, 6);
    assert.ok(!titles(mgr).some(t => /Industrial/.test(t)));
    assert.deepEqual(titles(await list(ids.manager2)), ['Causa Industrial']);
    assert.equal((await list(ids.analyst)).total, 6, 'quem só lê o CC também vê o consolidado');
    assert.equal((await list(ids.exec)).total, 0); assert.equal((await list(ids.outsider)).total, 0);
    assert.equal((await list(ids.manager, { costCenterId: ids.cc2 })).total, 0, 'CC não autorizado nunca aparece');
    assert.equal((await list(ids.admin, { costCenterId: ids.cc2 })).total, 1);
    await fails(list(ids.manager, { type: 'x' }), '22023'); await fails(list(ids.manager, { status: 'x' }), '22023'); await fails(list(ids.manager, { sort: 'x' }), '22023');

    // tipos de registro separados; análise sem ação não tem prazo
    const analyses = await list(ids.manager, { type: 'analyses' });
    assert.ok(analyses.items.every(i => i.type === 'analysis' && i.dueDate === null));
    const actions = await list(ids.manager, { type: 'actions' });
    assert.deepEqual(titles(actions).sort(), ['Ação distante', 'Ação futura', 'Ação vencida']);
    assert.ok(actions.items.every(i => i.type === 'action' && i.dueDate));
    assert.ok(!JSON.stringify(adminAll).match(/snapshot|expectedFinancialImpact/), 'sem valores financeiros no consolidado');

    // filtros
    assert.deepEqual(titles(await list(ids.manager, { type: 'analyses', periodType: 'YTD' })), ['Causa B']);
    assert.deepEqual(titles(await list(ids.manager, { type: 'analyses', month: 8 })), ['Causa C']);
    assert.equal((await list(ids.manager, { year: 2025 })).total, 0);
    assert.deepEqual(titles(await list(ids.manager, { status: 'overdue' })), ['Ação vencida']);
    assert.deepEqual(titles(await list(ids.manager, { status: 'awaiting_ack', responsibleUserId: ids.exec2 })), ['Ação futura']);
    assert.equal((await list(ids.manager, { status: 'analyzed' })).total, 3);
    assert.equal((await list(ids.manager, { status: 'in_progress' })).total, 0);
    await as_(ids.exec, 'opex_ack_action', aFar.id, 1, 1, uuid());
    assert.deepEqual(titles(await list(ids.manager, { status: 'in_progress' })), ['Ação distante']);
    assert.deepEqual(titles(await list(ids.manager, { responsibleUserId: ids.manager, type: 'analyses' })).length, 3);

    // paginação e ordenação no servidor, sem repetir nem perder itens
    const p1 = await list(ids.admin, { limit: 3 });
    assert.equal(p1.items.length, 3); assert.deepEqual(p1.nextCursor, { offset: 3 }); assert.equal(p1.total, 7);
    const p2 = await list(ids.admin, { limit: 3 }, p1.nextCursor);
    const p3 = await list(ids.admin, { limit: 3 }, p2.nextCursor);
    assert.equal(p3.nextCursor, null);
    const all = [...p1.items, ...p2.items, ...p3.items].map(i => i.id);
    assert.equal(all.length, 7); assert.equal(new Set(all).size, 7);
    const byDue = await list(ids.admin, { sort: 'due' });
    assert.deepEqual(byDue.items.slice(0, 3).map(i => i.title), ['Ação vencida', 'Ação futura', 'Ação distante']);
    assert.ok(byDue.items.slice(3).every(i => i.dueDate === null), 'análises (sem prazo) ao final');

    // responsáveis do filtro: só quem aparece em registros autorizados
    const resp = names => names.map(r => r.name).sort();
    assert.deepEqual(resp(await as_(ids.manager, 'opex_hub_responsibles')), ['Executor Dois', 'Executor Sem CC', 'Gestor Controladoria']);
    assert.deepEqual(resp(await as_(ids.exec, 'opex_hub_responsibles')), []);
    assert.equal((await as_(ids.manager, 'opex_create_action', ctx({ accountNumber: '0099' }), JSON.stringify({ title: 'x', expectedResult: 'y', dueDate: '2099-01-01', assigneeUserId: ids.exec }), uuid())).analysisId.length, 36, 'criar devolve o id da análise ao autor');

    // candidatos à reatribuição: só o dono; flag de acesso ao CC
    const candidates = await as_(ids.manager, 'opex_assignable_for_action', aLate.id);
    const by = Object.fromEntries(candidates.map(c => [c.name, c.hasCcAccess]));
    assert.equal(by['Executor Dois'], false); assert.equal(by['Gestor Controladoria'], true);
    assert.ok(!('Executor Sem CC' in by), 'o executor atual não é candidato');
    await fails(as_(ids.exec, 'opex_assignable_for_action', aLate.id), '42501');
    await fails(as_(ids.admin, 'opex_assignable_for_action', aLate.id), '42501');
    // situação "Cancelado" (aparece na presença para o ícone) e exclusão lógica só por administrador
    const canc = await as_(ids.manager, 'opex_save_analysis', ctx({ accountNumber: '0030' }), JSON.stringify({ analysisState: 'cancelled', cause: 'Lançamento errado' }), 0, uuid());
    assert.equal(canc.analysisState, 'cancelled');
    const pres = await as_(ids.manager, 'opex_record_presence', ctx({ accountNumber: '0030' }), JSON.stringify([{ cc: ids.cc1, account: '0030' }]));
    assert.deepEqual([pres[0].analyses, pres[0].cancelled], [1, 1]);
    const presA = await as_(ids.manager, 'opex_record_presence', ctx({ accountNumber: '0010' }), JSON.stringify([{ cc: ids.cc1, account: '0010' }]));
    assert.equal(presA[0].cancelled, 0);
    assert.deepEqual(titles(await list(ids.manager, { status: 'cancelled' })), ['Lançamento errado']);
    assert.ok((await list(ids.manager)).items.every(i => i.managementName === 'Controladoria'), 'gestão do CC em cada registro');
    const totalBefore = (await list(ids.admin)).total;
    await fails(as_(ids.manager, 'opex_delete_record', 'analysis', canc.id), '42501');
    await fails(as_(ids.exec, 'opex_delete_record', 'action', aLate.id), '42501');
    await fails(as_(ids.admin, 'opex_delete_record', 'x', aLate.id), '22023');
    assert.equal((await as_(ids.admin, 'opex_delete_record', 'action', aFar.id)).deleted, true);
    assert.equal((await list(ids.admin)).total, totalBefore - 1, 'ação excluída some da lista');
    await fails(as_(ids.admin, 'opex_delete_record', 'action', aFar.id), '22023');
    // excluir a análise leva as ações dela junto (aLate pertence à análise 0010)
    const a0010 = (await list(ids.admin, { type: 'analyses' })).items.find(i => i.title === 'Causa A');
    assert.equal((await as_(ids.admin, 'opex_delete_record', 'analysis', a0010.id)).deleted, true);
    const after = await list(ids.admin);
    assert.ok(!titles(after).includes('Causa A') && !titles(after).includes('Ação vencida'));
    await asSuper();
    const kept = (await db.query(`select count(*)::int n, bool_and(deleted_by is not null) who from opex_action_plans where deleted_at is not null`)).rows[0];
    assert.ok(kept.n >= 2 && kept.who, 'nada apagado fisicamente: deleted_at e deleted_by ficam gravados');
    console.log('opexReviewHub.sql: OK');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exit(1); });
