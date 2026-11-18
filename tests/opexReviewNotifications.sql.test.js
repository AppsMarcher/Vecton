const assert = require('node:assert/strict');
const { createOpexDb, NOTIFICATIONS_PRELUDE } = require('./helpers/opexSqlHarness');
const FILES = ['346_opex_review_schema.sql', '347_opex_review_analysis_rpcs.sql', '348_opex_review_actions_rpcs.sql', '350_opex_review_notifications.sql'];
(async () => {
  const { db, ids, as, asSuper, fails, uuid } = await createOpexDb(FILES, { prelude: NOTIFICATIONS_PRELUDE });
  try {
    const budget = uuid();
    await asSuper();
    await db.query(`insert into forecast_scenarios(id,organization_id,name,reference_year) values($1,$2,'Budget 2026',2026)`, [budget, ids.org]);
    await db.query(`insert into notification_event_types(kind,label) values('strategic_action_due','x')`);
    await db.query(`insert into notification_settings(organization_id,kind) select id,'strategic_action_due' from organizations`);
    // os 9 tipos são semeados também para organizações já existentes
    const ctx = JSON.stringify({ costCenterId: ids.cc1, accountNumber: '0010', year: 2026, periodType: 'month', month: 9, sourceKey: `scenario:${budget}` });
    const call = async (fn, ...args) => (await db.query(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) r`, args)).rows[0].r;
    const as_ = (user, fn, ...args) => as(user).then(() => call(fn, ...args));
    const fields = (over = {}) => JSON.stringify({ title: 'Renegociar contrato de manutenção', expectedResult: 'Proposta renegociada mantendo o escopo', dueDate: '2027-11-30', assigneeUserId: ids.exec, ...over });
    const notifs = async (where = 'true') => { await asSuper(); return (await db.query(`select kind, target_user_id, title, body, ref_action_id from notifications where ${where} order by created_at, id`)).rows; };
    const outbox = async () => { await asSuper(); return (await db.query('select recipients, subject, body_text, link_path, status from notification_email_outbox order by created_at, id')).rows; };

    // dado financeiro sensível na análise: nunca pode aparecer em sino, e-mail ou log
    await as_(ids.manager, 'opex_save_analysis', ctx, JSON.stringify({ analysisState: 'analyzed', nature: 'recurring', cause: 'SEGREDO-FINANCEIRO', expectedFinancialImpact: 987654.32 }), 0, uuid());
    await asSuper();
    assert.equal((await db.query(`select count(*)::int n from notification_settings where kind like 'opex_action_%' and in_app and email`)).rows[0].n, 18, '9 tipos × 2 organizações já nascem com sino e e-mail ligados');

    // criar/atribuir: 1 sino + 1 e-mail, uma vez só
    const key = uuid();
    const a = await as_(ids.manager, 'opex_create_action', ctx, fields(), key);
    let n = await notifs();
    assert.equal(n.length, 1);
    assert.deepEqual([n[0].kind, n[0].target_user_id, n[0].ref_action_id], ['opex_action_assigned', ids.exec, a.id]);
    let o = await outbox();
    assert.equal(o.length, 1);
    assert.deepEqual(o[0].recipients, ['e@x.com']);
    assert.equal(o[0].subject, 'Vecton — nova ação atribuída a você');
    assert.equal(o[0].link_path, `?acao=${a.id}`);
    assert.match(o[0].body_text, /Gestor Controladoria atribuiu a ação: Renegociar contrato de manutenção\./);
    assert.match(o[0].body_text, /Prazo: 30\/11\/2027/); assert.match(o[0].body_text, /Resultado esperado: Proposta renegociada mantendo o escopo/);
    assert.equal(o[0].status, 'pending');
    await as_(ids.manager, 'opex_create_action', ctx, fields(), key);
    assert.equal((await notifs()).length, 1, 'retry com a mesma chave não duplica'); assert.equal((await outbox()).length, 1);
    // a mesma mutação aplicada duas vezes ao banco também é barrada pela chave do log
    await asSuper();
    await db.query(`select opex_emit($1,'assigned',$2,1,1)`, [a.id, ids.exec]);
    assert.equal((await notifs()).length, 1); assert.equal((await outbox()).length, 1);

    // rollback da atribuição desfaz sino e e-mail
    await asSuper();
    await db.exec('begin');
    await as(ids.manager);
    await call('opex_create_action', ctx, fields({ title: 'Será desfeita' }), uuid());
    await db.exec('rollback');
    assert.equal((await notifs()).length, 1); assert.equal((await outbox()).length, 1);
    await asSuper();
    assert.equal((await db.query(`select count(*)::int n from opex_action_plans`)).rows[0].n, 1);

    // sem dado financeiro em nenhum canal
    await asSuper();
    const blob = JSON.stringify([(await notifs()), await outbox(), (await db.query('select * from opex_notification_log')).rows]);
    assert.doesNotMatch(blob, /SEGREDO|987654|R\$/);

    // sino lido não é ciência; feed traz a referência da ação
    await asSuper();
    await db.query(`insert into notification_reads(notification_id,user_id) select id, $1 from notifications`, [ids.exec]);
    const feed = await as_(ids.exec, 'notifications_feed', 30).then(() => null).catch(() => null);
    await as(ids.exec);
    const feedRows = (await db.query('select * from notifications_feed(30)')).rows;
    assert.equal(feedRows.length, 1); assert.equal(feedRows[0].ref_action_id, a.id); assert.equal(feedRows[0].is_read, true);
    assert.ok(['id', 'kind', 'title', 'body', 'ref_year', 'ref_month', 'target_report_id', 'created_at', 'is_read'].every(c => c in feedRows[0]), 'colunas antigas preservadas');
    await as(ids.exec2); assert.equal((await db.query('select * from notifications_feed(30)')).rows.length, 0);
    await as(ids.outsider); assert.equal((await db.query('select * from notifications_feed(30)')).rows.length, 0);
    await asSuper();
    const pl = (await db.query('select status, acknowledged_at from opex_action_plans where id=$1', [a.id])).rows[0];
    assert.deepEqual([pl.status, pl.acknowledged_at], ['awaiting_ack', null]);

    // ciência avisa o dono; ciclo completo avisa na direção certa
    const acked = await as_(ids.exec, 'opex_ack_action', a.id, 1, 1, uuid());
    assert.deepEqual((await notifs(`kind='opex_action_acknowledged'`)).map(r => r.target_user_id), [ids.manager]);
    const re = await as_(ids.manager, 'opex_reassign_action', a.id, ids.exec2, acked.version, uuid());
    assert.deepEqual((await notifs(`kind='opex_action_unassigned'`)).map(r => r.target_user_id), [ids.exec]);
    assert.deepEqual((await notifs(`kind='opex_action_assigned'`)).map(r => r.target_user_id).sort(), [ids.exec, ids.exec2].sort());
    const t = await as_(ids.manager, 'opex_update_action_terms', a.id, JSON.stringify({ dueDate: '2027-12-15' }), re.version, uuid());
    assert.deepEqual((await notifs(`kind='opex_action_changed'`)).map(r => r.target_user_id), [ids.exec2]);
    const acked2 = await as_(ids.exec2, 'opex_ack_action', a.id, 2, t.version, uuid());
    const sub = await as_(ids.exec2, 'opex_submit_action', a.id, 'Concluída', acked2.version, uuid());
    assert.deepEqual((await notifs(`kind='opex_action_submitted'`)).map(r => r.target_user_id), [ids.manager]);
    const ret = await as_(ids.manager, 'opex_return_action', a.id, 'Ajustar', sub.version, uuid());
    assert.deepEqual((await notifs(`kind='opex_action_returned'`)).map(r => r.target_user_id), [ids.exec2]);
    const sub2 = await as_(ids.exec2, 'opex_submit_action', a.id, 'Agora sim', ret.version, uuid());
    await as_(ids.manager, 'opex_validate_action', a.id, sub2.version, uuid());
    assert.deepEqual((await notifs(`kind='opex_action_validated'`)).map(r => r.target_user_id), [ids.exec2]);
    const subjects = (await outbox()).map(r => r.subject);
    for (const s of ['Vecton — sua responsabilidade foi retirada', 'Vecton — ação atualizada', 'Vecton — entrega aguardando validação', 'Vecton — ajustes solicitados', 'Vecton — entrega validada', 'Vecton — ciência confirmada'])
      assert.ok(subjects.includes(s), `e-mail do evento: ${s}`);
    for (const row of await outbox()) if (row.subject !== 'Vecton — nova ação atribuída a você') assert.doesNotMatch(row.body_text, /atribuiu a ação/, `evento ${row.subject} não repete a mensagem de atribuição`);

    // dono = executor: um evento por destinatário/canal, sem aviso a si mesmo na ciência
    await asSuper(); await db.exec('delete from notifications; delete from notification_email_outbox');
    const self = await as_(ids.manager, 'opex_create_action', JSON.stringify({ ...JSON.parse(ctx), accountNumber: '0020' }), fields({ title: 'Eu mesmo', assigneeUserId: ids.manager }), uuid());
    assert.equal((await notifs()).length, 1); assert.equal((await outbox()).length, 1);
    await as_(ids.manager, 'opex_ack_action', self.id, 1, 1, uuid());
    assert.equal((await notifs(`kind='opex_action_acknowledged'`)).length, 0);

    // sem e-mail cadastrado: sino e ação continuam; fica registrado e o dono é informado
    await asSuper(); await db.exec(`delete from notifications; delete from notification_email_outbox; update user_profiles set email=null where user_id='${ids.exec}'`);
    const noMail = await as_(ids.manager, 'opex_create_action', JSON.stringify({ ...JSON.parse(ctx), accountNumber: '0030' }), fields({ title: 'Sem e-mail' }), uuid());
    assert.equal((await outbox()).length, 0);
    assert.deepEqual((await notifs()).map(r => [r.kind, r.target_user_id]).sort(), [['opex_action_assigned', ids.exec], ['opex_action_changed', ids.manager]].sort());
    await asSuper();
    assert.equal((await db.query(`select status from opex_notification_log where action_id=$1 and channel='email'`, [noMail.id])).rows[0].status, 'no_email');

    // configuração: e-mail desligado = só sino; tipo inativo = nada; destinatário inativo = suprimido
    await asSuper(); await db.exec(`delete from notifications; delete from notification_email_outbox; update notification_settings set email=false where kind='opex_action_assigned'`);
    await as_(ids.manager, 'opex_create_action', JSON.stringify({ ...JSON.parse(ctx), accountNumber: '0040' }), fields({ title: 'Só sino', assigneeUserId: ids.exec2 }), uuid());
    assert.equal((await notifs()).length, 1); assert.equal((await outbox()).length, 0);
    await asSuper(); await db.exec(`delete from notifications; update notification_settings set is_active=false where kind='opex_action_assigned'`);
    await as_(ids.manager, 'opex_create_action', JSON.stringify({ ...JSON.parse(ctx), accountNumber: '0050' }), fields({ title: 'Desligado', assigneeUserId: ids.exec2 }), uuid());
    assert.equal((await notifs()).length, 0);
    console.log('opexReviewNotifications.sql: OK');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exit(1); });
