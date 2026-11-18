const assert = require('node:assert/strict');
const { createOpexDb, NOTIFICATIONS_PRELUDE } = require('./helpers/opexSqlHarness');
const FILES = ['346_opex_review_schema.sql', '347_opex_review_analysis_rpcs.sql', '348_opex_review_actions_rpcs.sql', '350_opex_review_notifications.sql', '351_notification_email_claim.sql'];
(async () => {
  const { db, ids, as, asSuper, fails, uuid } = await createOpexDb(FILES, { prelude: NOTIFICATIONS_PRELUDE });
  try {
    await asSuper();
    const budget = uuid();
    await db.query(`insert into forecast_scenarios(id,organization_id,name,reference_year) values($1,$2,'Budget 2026',2026)`, [budget, ids.org]);
    const q = async (text, params = []) => { await asSuper(); return (await db.query(text, params)).rows; };
    const claim = async (limit, lease, token) => (await q('select id, attempts, claimed_token from notification_email_claim($1,$2,$3)', [limit, lease, token]));
    // itens antigos (sem colunas opex_*) e itens de OPEX convivem
    for (let i = 0; i < 5; i++) await q(`insert into notification_email_outbox(organization_id,recipients,subject,body_text,created_at) values($1,array['x@y.com'],'antigo '||$2::text,'corpo', now() - ($2::int || ' minutes')::interval)`, [ids.org, i]);
    // reserva exclusiva: segunda chamada não recebe o que a primeira reservou
    const t1 = uuid(), t2 = uuid();
    const a = await claim(3, 120, t1), b = await claim(3, 120, t2);
    assert.equal(a.length, 3); assert.equal(b.length, 2);
    assert.equal(new Set([...a, ...b].map(r => r.id)).size, 5, 'nenhum item reservado duas vezes');
    assert.ok(a.every(r => r.attempts === 1), 'tentativa contada na reserva');
    assert.equal((await claim(10, 120, uuid())).length, 0, 'nada sobra enquanto os leases valem');
    // resultado só vale com o token da reserva
    assert.equal((await q('select notification_email_finish($1,$2,$3,$4) r', [a[0].id, t2, 'sent', null]))[0].r, false);
    assert.equal((await q('select notification_email_finish($1,$2,$3,$4) r', [a[0].id, t1, 'sent', null]))[0].r, true);
    assert.equal((await q('select status, sent_at from notification_email_outbox where id=$1', [a[0].id]))[0].status, 'sent');
    assert.equal((await q('select notification_email_finish($1,$2,$3,$4) r', [a[0].id, t1, 'failed', 'x']))[0].r, false, 'reserva encerrada não é reutilizável');
    // falha do provedor: volta para a fila com erro visível; não aparece como enviado
    assert.equal((await q('select notification_email_finish($1,$2,$3,$4) r', [a[1].id, t1, 'pending', 'Resend 500']))[0].r, true);
    const retry = await claim(5, 120, uuid());
    assert.deepEqual(retry.map(r => r.id), [a[1].id]); assert.equal(retry[0].attempts, 2);
    assert.equal((await q('select status, last_error from notification_email_outbox where id=$1', [a[1].id]))[0].last_error, 'Resend 500');
    // worker interrompido: lease expira e o item é reassumido; estourou as tentativas => failed visível
    await q(`update notification_email_outbox set claimed_until = now() - interval '1 minute' where status='pending'`);
    const again = await claim(10, 120, uuid());
    assert.ok(again.length >= 3);
    await q(`update notification_email_outbox set claimed_until = now() - interval '1 minute', attempts = 5 where id=$1`, [again[0].id]);
    await claim(10, 120, uuid());
    assert.equal((await q('select status, last_error from notification_email_outbox where id=$1', [again[0].id]))[0].status, 'failed');
    assert.match((await q('select last_error from notification_email_outbox where id=$1', [again[0].id]))[0].last_error, /esgotadas/);
    // clientes autenticados não chamam as RPCs da fila
    await as(ids.manager);
    await fails(db.query('select * from notification_email_claim(5,60,$1)', [uuid()]), '42501');
    await asSuper();

    // revalidação antes do envio (mensagens operacionais de OPEX)
    const ctx = JSON.stringify({ costCenterId: ids.cc1, accountNumber: '0010', year: 2026, periodType: 'month', month: 9, sourceKey: `scenario:${budget}` });
    const call = async (fn, ...args) => (await db.query(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) r`, args)).rows[0].r;
    await as(ids.manager);
    const act = await call('opex_create_action', ctx, JSON.stringify({ title: 'T', expectedResult: 'R', dueDate: '2099-01-01', assigneeUserId: ids.exec }), uuid());
    const mail = async kind => (await q(`select id from notification_email_outbox where opex_action_id=$1 and opex_kind=$2`, [act.id, kind]))[0]?.id;
    const check = async id => (await q('select opex_email_check($1) r', [id]))[0].r;
    const assignedMail = await mail('assigned');
    assert.equal(await check(assignedMail), null, 'atribuição vigente: envia');
    await as(ids.manager);
    await call('opex_reassign_action', act.id, ids.exec2, 1, uuid());
    assert.equal(await check(assignedMail), 'atribuição substituída', 'e-mail obsoleto é suprimido');
    assert.equal(await check((await q(`select id from notification_email_outbox where opex_kind='unassigned'`))[0].id), null, 'aviso de retirada continua válido');
    await q(`update user_profiles set is_active=false where user_id=$1`, [ids.exec2]);
    assert.equal(await check((await q(`select id from notification_email_outbox where opex_kind='assigned' order by created_at desc limit 1`))[0].id), 'destinatário inativo');
    assert.equal(await check((await q(`select id from notification_email_outbox where opex_action_id is null limit 1`))[0].id), null, 'tipos antigos passam direto');
    console.log('notificationEmailClaim.sql: OK');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exit(1); });
