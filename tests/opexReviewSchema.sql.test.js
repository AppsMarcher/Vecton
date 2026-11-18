const assert = require('node:assert/strict');
const { createOpexDb } = require('./helpers/opexSqlHarness');
(async () => {
  const { db, ids, as, asSuper, fails, uuid } = await createOpexDb();
  try {
    const row = (cc, extra = {}) => ({ id: uuid(), org: ids.org, cc, acct: '0010', year: 2026, pt: 'month', month: 9, src: 'scenario:a', ...extra });
    const insert = async r => db.query(`insert into opex_variance_analyses(id,organization_id,cost_center_id,cost_center_number_snapshot,account_number,reference_year,period_type,reference_month,comparison_source_key,comparison_source_year,created_by,updated_by)
      values($1,$2,$3,'1001',$4,$5,$6,$7,$8,2026,$9,$9)`, [r.id, r.org, r.cc, r.acct, r.year, r.pt, r.month, r.src, ids.admin]);
    await asSuper();
    const a1 = row(ids.cc1); await insert(a1);
    // unicidade da chave lógica corrente; outra conta/CC/mês/fonte é permitido
    await fails(insert(row(ids.cc1)), '23505');
    await insert(row(ids.cc2)); await insert(row(ids.cc1, { acct: '0011' })); await insert(row(ids.cc1, { month: 10 })); await insert(row(ids.cc1, { src: 'scenario:b' }));
    // contas com zeros à esquerda ficam distintas de sem zeros
    await insert(row(ids.cc1, { acct: '10' }));
    await db.query('update opex_variance_analyses set deleted_at=now() where id=$1', [a1.id]);
    await insert(row(ids.cc1)); // permitido após arquivar a anterior
    // leitura direta pelo escopo
    const count = async user => { await as(user); return (await db.query('select count(*)::int n from opex_variance_analyses')).rows[0].n; };
    assert.ok(await count(ids.admin) >= 5);
    assert.ok(await count(ids.manager) > 0, 'gestor com escopo lê CC1');
    const mgrCcs = (await db.query('select distinct cost_center_id from opex_variance_analyses')).rows.map(r => r.cost_center_id);
    assert.deepEqual(mgrCcs, [ids.cc1], 'gestor de Controladoria só enxerga o CC1');
    assert.equal(await count(ids.outsider), 0, 'gestor sem escopo não lê');
    assert.equal(await count(ids.exec), 0, 'executor sem CC não lê a tabela');
    assert.equal(await count(ids.inactive), 0, 'usuário inativo/outra org não lê');
    // escrita direta negada ao cliente
    await as(ids.admin);
    await fails(db.query(`insert into opex_variance_analyses(organization_id,cost_center_id,cost_center_number_snapshot,account_number,reference_year,period_type,reference_month,comparison_source_key,comparison_source_year,created_by,updated_by)
      values($1,$2,'1001','9',2026,'month',1,'x',2026,$3,$3)`, [ids.org, ids.cc1, ids.admin]), '42501');
    // anon sem acesso
    await db.exec('reset role; set role anon;');
    await fails(db.query('select 1 from opex_variance_analyses'), '42501');
    await asSuper();
    // helpers de escopo
    const can = async (fn, user, cc) => { await as(user); return (await db.query(`select ${fn}($1,$2) v`, [ids.org, cc])).rows[0].v; };
    assert.equal(await can('opex_can_write_cc', ids.admin, ids.cc2), true);
    assert.equal(await can('opex_can_write_cc', ids.manager, ids.cc1), true);
    assert.equal(await can('opex_can_write_cc', ids.manager, ids.cc2), false);
    assert.equal(await can('opex_can_write_cc', ids.outsider, ids.cc1), false);
    assert.equal(await can('opex_can_write_cc', ids.analyst, ids.cc1), false, 'analista lê mas não escreve');
    assert.equal(await can('opex_can_read_cc', ids.analyst, ids.cc1), true);
    assert.equal(await can('opex_can_read_cc', ids.exec, ids.cc1), false);
    // eventos imutáveis
    await asSuper();
    const act = uuid();
    const anId = (await db.query('select id from opex_variance_analyses limit 1')).rows[0].id;
    await db.query(`insert into opex_action_plans(id,organization_id,analysis_id,owner_user_id,assignee_user_id,title,expected_result,due_date,created_by)
      values($1,$2,$3,$4,$5,'t','r','2027-01-01',$4)`, [act, ids.org, anId, ids.admin, ids.exec]);
    const ev = uuid();
    await db.query(`insert into opex_action_events(id,organization_id,action_id,kind) values($1,$2,$3,'created')`, [ev, ids.org, act]);
    await fails(db.query(`update opex_action_events set kind='x' where id=$1`, [ev]), '42501');
    await fails(db.query(`delete from opex_action_events where id=$1`, [ev]), '42501');
    // estado inválido e prazos
    await fails(db.query(`update opex_action_plans set status='atrasada' where id=$1`, [act]), '23514');
    // thresholds: vermelho < amarelo rejeitado
    await fails(db.query(`insert into opex_variance_thresholds(organization_id,yellow_money,red_money) values($1,5000,1000)`, [ids.org]), '23514');
    await fails(db.query(`insert into opex_variance_thresholds(organization_id,yellow_pct) values($1,0)`, [ids.org]), '23514');
    console.log('opexReviewSchema.sql: OK');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exit(1); });
