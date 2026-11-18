const assert = require('node:assert/strict');
const { createOpexDb } = require('./helpers/opexSqlHarness');
(async () => {
  const { db, ids, as, asSuper, uuid } = await createOpexDb(['346_opex_review_schema.sql', '347_opex_review_analysis_rpcs.sql', '348_opex_review_actions_rpcs.sql']);
  try {
    const budget = uuid();
    await asSuper();
    await db.query(`insert into forecast_scenarios(id,organization_id,name,reference_year) values($1,$2,'Budget 2026',2026)`, [budget, ids.org]);
    const ctx = JSON.stringify({ costCenterId: ids.cc1, accountNumber: '0010', year: 2026, periodType: 'month', month: 9, sourceKey: `scenario:${budget}` });
    const call = async (fn, ...args) => (await db.query(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) r`, args)).rows[0].r;
    const create = async user => { await as(user); return call('opex_create_action', ctx, JSON.stringify({ title: 'Ação', expectedResult: 'Res', dueDate: '2099-12-31', assigneeUserId: ids.exec }), uuid()); };
    const owner = async id => { await asSuper(); return (await db.query('select owner_user_id o, version v from opex_action_plans where id=$1', [id])).rows[0]; };
    const events = async id => { await asSuper(); return (await db.query(`select count(*)::int n from opex_action_events where action_id=$1 and kind='owner_changed'`, [id])).rows[0].n; };
    const sql = async text => { await asSuper(); await db.exec(text); };

    // A análise e a ação são criadas pelo gestor da Controladoria.
    const act = await create(ids.manager);
    assert.equal((await owner(act.id)).o, ids.manager);
    // Nada muda enquanto o dono mantém o escopo (idempotente).
    await asSuper(); assert.equal(await call('opex_reconcile_owners'), 0);
    // Dono perde o escopo: a posse volta ao autor da análise se ainda puder; aqui o autor é o próprio dono, então vai ao gestor da gestão (nenhum) e depois admin.
    await sql(`update user_profiles set management='Marketing' where user_id='${ids.manager}'`);
    assert.equal((await owner(act.id)).o, ids.admin, 'sem outro gestor da gestão, cai para administrador');
    assert.equal(await events(act.id), 1);
    // Executor intacto e ciclo não muda; versão sobe (controle otimista).
    await asSuper();
    const row = (await db.query('select assignee_user_id a, assignment_cycle c, version v from opex_action_plans where id=$1', [act.id])).rows[0];
    assert.deepEqual([row.a, row.c], [ids.exec, 1]); assert.equal(row.v, 2);
    // Rodar de novo não gera outro evento.
    assert.equal(await call('opex_reconcile_owners'), 0); assert.equal(await events(act.id), 1);

    // Prioridade 1: autor da análise com escopo reassume (autor = manager2 com escopo no CC2, dono = manager2 desativado depois).
    await sql(`update user_profiles set management='Controladoria' where user_id='${ids.manager}'`);
    const ctx2 = JSON.stringify({ costCenterId: ids.cc2, accountNumber: '0010', year: 2026, periodType: 'month', month: 9, sourceKey: `scenario:${budget}` });
    await as(ids.manager2);
    const act2 = await call('opex_create_action', ctx2, JSON.stringify({ title: 'CC2', expectedResult: 'Res', dueDate: '2099-12-31', assigneeUserId: ids.exec }), uuid());
    // Admin edita a análise? A autoria é de manager2: se o dono mudar para outro e perder o escopo, o autor volta se tiver escopo.
    await sql(`update opex_action_plans set owner_user_id='${ids.admin}' where id='${act2.id}'`);
    await sql(`update user_profiles set is_active=false where user_id='${ids.admin}'`);
    assert.equal((await owner(act2.id)).o, ids.manager2, 'autor da análise com escopo reassume');
    // Gestor da gestão do CC (prioridade 2): autor desativado -> outro gestor da gestão Industrial.
    await sql(`update user_profiles set is_active=true where user_id='${ids.admin}'`);
    const m3 = uuid();
    await sql(`insert into user_profiles(organization_id,user_id,full_name,email,access_role,management) values('${ids.org}','${m3}','Outro Industrial','m3i@x.com','manager','Industrial')`);
    await sql(`update user_profiles set is_active=false where user_id='${ids.manager2}'`);
    assert.equal((await owner(act2.id)).o, m3, 'gestor da gestão do CC assume quando o autor não pode');
    // Sem ninguém elegível a posse não muda (nada de dono nulo).
    await sql(`update user_profiles set is_active=false where user_id in ('${m3}','${ids.admin}','${ids.manager}')`);
    assert.equal((await owner(act2.id)).o, m3);
    console.log('opexReviewOwnership.sql: OK');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exit(1); });
