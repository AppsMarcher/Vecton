const assert = require('node:assert/strict');
const { createOpexDb } = require('./helpers/opexSqlHarness');
(async () => {
  const { db, ids, as, asSuper, fails, uuid } = await createOpexDb(['346_opex_review_schema.sql', '347_opex_review_analysis_rpcs.sql', '353_opex_review_threshold_direction.sql', '354_opex_review_threshold_under.sql']);
  try {
    const budget = uuid(), forecast = uuid(), foreign = uuid();
    await asSuper();
    await db.query(`insert into forecast_scenarios(id,organization_id,name,reference_year) values($1,$2,'Budget 2026',2026),($3,$2,'Forecast 2026',2026),($4,$5,'Budget 2026',2026)`, [budget, ids.org, forecast, foreign, ids.org2]);
    for (let m = 1; m <= 9; m++) await db.query(`insert into actuals_ledger_entries(organization_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount) values($1,2026,$2,'0010',$3,'1001',1000),($1,2026,$2,'0010',$4,'1002',50)`, [ids.org, m, ids.cc1, ids.cc2]);
    for (const sc of [budget, forecast]) for (let m = 1; m <= 12; m++) await db.query(`insert into forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount) values($1,$2,2026,$3,'0010',$4,'1001',900)`, [ids.org, sc, m, ids.cc1]);
    const ctx = (over = {}) => ({ costCenterId: ids.cc1, accountNumber: '0010', year: 2026, periodType: 'month', month: 9, sourceKey: `scenario:${budget}`, groupName: 'Manutenção', accountName: 'Conta', ...over });
    const call = async (fn, ...args) => (await db.query(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) r`, args)).rows[0].r;
    const save = (c, fields, version, key, user = ids.manager) => as(user).then(() => call('opex_save_analysis', JSON.stringify(c), JSON.stringify(fields), version, key));
    const full = { analysisState: 'analyzed', nature: 'recurring', cause: 'Reajuste contratual', futureEffect: 'Continua', monitor: true };

    // validação
    await fails(save(ctx(), { ...full, cause: '  ' }, 0, 'k0'), '22023');
    await fails(save(ctx(), { ...full, nature: null }, 0, 'k0'), '22023');
    await fails(save(ctx({ sourceKey: `scenario:${foreign}` }), full, 0, 'k0'), '22023');
    // permissões de escrita
    await fails(save(ctx(), full, 0, 'k0', ids.analyst), '42501');
    await fails(save(ctx(), full, 0, 'k0', ids.outsider), '42501');
    await fails(save(ctx(), full, 0, 'k0', ids.exec), '42501');
    await fails(save(ctx({ costCenterId: ids.cc2 }), full, 0, 'k0', ids.manager), '42501');
    // salvar: snapshot vem do servidor, valores do cliente são ignorados
    const first = await save(ctx(), { ...full, actual: 1, comparison: 1, expectedFinancialImpact: 1500.5 }, 0, 'k1');
    assert.equal(first.version, 1); assert.equal(first.snapshot.actual, 1000); assert.equal(first.snapshot.comparison, 900);
    assert.equal(first.snapshot.variance, 100); assert.equal(Number(first.snapshot.variancePct), 11.1111);
    assert.equal(first.expectedFinancialImpact, 1500.5); assert.equal(first.monitor, true); assert.equal(first.dataChangedSinceReview, false);
    // idempotência: mesma chave devolve o original, sem nova revisão
    const again = await save(ctx(), { ...full, cause: 'Outra causa' }, 0, 'k1');
    assert.equal(again.id, first.id); assert.equal(again.cause, 'Reajuste contratual');
    await asSuper();
    assert.equal((await db.query('select count(*)::int n from opex_analysis_revisions')).rows[0].n, 1);
    // conflito de versão
    const second = await save(ctx(), { ...full, cause: 'Reajuste e volume' }, 1, 'k2');
    assert.equal(second.version, 2);
    await fails(save(ctx(), { ...full, cause: 'Atrasada' }, 1, 'k3'), '40001');
    await asSuper();
    assert.equal((await db.query('select count(*)::int n from opex_variance_analyses')).rows[0].n, 1, 'sem duplicatas');
    assert.equal((await db.query('select count(*)::int n from opex_analysis_revisions')).rows[0].n, 2);
    // contextos distintos: mês × YTD × ano são análises separadas, com valores corretos
    const ytd = await save(ctx({ periodType: 'YTD' }), full, 0, 'k4');
    assert.equal(ytd.snapshot.actual, 9000); assert.equal(ytd.snapshot.comparison, 8100); assert.notEqual(ytd.id, first.id);
    const yearBudget = await save(ctx({ periodType: 'year' }), full, 0, 'k5');
    assert.equal(yearBudget.snapshot.actual, null, 'Budget não estima meses futuros: real anual indisponível, nunca R$ 0');
    assert.equal(yearBudget.snapshot.comparison, 10800);
    const yearForecast = await save(ctx({ periodType: 'year', sourceKey: `scenario:${forecast}` }), full, 0, 'k6');
    assert.equal(yearForecast.snapshot.actual, 11700); assert.equal(yearForecast.snapshot.comparison, 10800);
    const noLoad = await save(ctx({ month: 10 }), full, 0, 'k7');
    assert.equal(noLoad.snapshot.actual, null, 'mês sem carga não vira zero');
    // CC distinto mantém identidade própria (mesma conta)
    const other = await save(ctx({ costCenterId: ids.cc2 }), full, 0, 'k8', ids.manager2);
    assert.equal(other.snapshot.actual, 50); assert.equal(other.snapshot.comparison, 0, 'cenário carregado sem orçamento neste CC = base zero (Sem base)');
    // ler: gestor do CC lê; sem acesso e outra org negam
    await as(ids.manager);
    assert.equal((await call('opex_get_analysis', JSON.stringify(ctx()))).cause, 'Reajuste e volume');
    assert.equal((await call('opex_get_analysis', JSON.stringify(ctx({ accountNumber: '0099' })))).found, false);
    await fails(call('opex_get_analysis', JSON.stringify(ctx({ costCenterId: ids.cc2 }))), '42501');
    await as(ids.exec); await fails(call('opex_get_analysis', JSON.stringify(ctx())), '42501');
    await as(ids.analyst); assert.equal((await call('opex_get_analysis', JSON.stringify(ctx()))).canWrite, false);
    // base mudou: nova carga no recorte conta/CC marca a análise sem apagar a versão anterior
    await asSuper();
    await db.query(`insert into actuals_ledger_entries(organization_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount) values($1,2026,9,'0010',$2,'1001',300)`, [ids.org, ids.cc1]);
    await as(ids.manager);
    const changed = await call('opex_get_analysis', JSON.stringify(ctx()));
    assert.equal(changed.dataChangedSinceReview, true); assert.equal(changed.snapshot.actual, 1000, 'histórico preserva o snapshot');
    assert.equal(changed.live.actual, 1300);
    // presença em lote: só CCs autorizados; análise sem causa e sem ação não conta
    await asSuper();
    await db.query(`insert into opex_variance_analyses(organization_id,cost_center_id,cost_center_number_snapshot,account_number,reference_year,period_type,reference_month,comparison_source_key,comparison_source_year,created_by,updated_by)
      values($1,$2,'1001','0777',2026,'month',9,$3,2026,$4,$4)`, [ids.org, ids.cc1, `scenario:${budget}`, ids.admin]);
    const rows = JSON.stringify([{ cc: ids.cc1, account: '0010' }, { cc: ids.cc2, account: '0010' }, { cc: ids.cc1, account: '0777' }]);
    await as(ids.manager);
    const p1 = await call('opex_record_presence', JSON.stringify(ctx()), rows);
    assert.deepEqual(p1.map(r => [r.costCenterId, r.accountNumber, r.analyses, r.actions]), [[ids.cc1, '0010', 1, 0]], 'CC2 e rascunho sem causa/ação ficam de fora');
    await as(ids.outsider); assert.deepEqual(await call('opex_record_presence', JSON.stringify(ctx()), rows), []);
    await as(ids.exec); assert.deepEqual(await call('opex_record_presence', JSON.stringify(ctx()), rows), []);
    await asSuper();
    const analysis0777 = (await db.query(`select id from opex_variance_analyses where account_number='0777'`)).rows[0].id;
    await db.query(`insert into opex_action_plans(organization_id,analysis_id,owner_user_id,assignee_user_id,title,expected_result,due_date,created_by,status) values($1,$2,$3,$4,'x','y','2027-01-01',$3,'completed')`, [ids.org, analysis0777, ids.admin, ids.exec]);
    await as(ids.manager);
    const p2 = await call('opex_record_presence', JSON.stringify(ctx()), rows);
    const r0777 = p2.find(r => r.accountNumber === '0777');
    assert.deepEqual([r0777.analyses, r0777.actions, r0777.open], [0, 1, 0], 'ação concluída continua sendo registro');
    await as(ids.manager); assert.deepEqual(await call('opex_record_presence', JSON.stringify(ctx({ month: 8 })), rows), [], 'outro mês não reaproveita marcador');
    // parâmetros
    await as(ids.manager);
    const th = await call('opex_get_thresholds', ids.org);
    assert.deepEqual([th.redMoney, th.version, th.canEdit, th.direction], [20000, 0, false, 'over']);
    await fails(call('opex_save_thresholds', ids.org, JSON.stringify({ yellowMoney: 1, yellowPct: 1, redMoney: 2, redPct: 2 }), 0), '42501');
    await as(ids.admin);
    const bad = { yellowMoney: 5000, yellowPct: 5, redMoney: 1000, redPct: 10 };
    await fails(call('opex_save_thresholds', ids.org, JSON.stringify(bad), 0), '22023');
    const good = await call('opex_save_thresholds', ids.org, JSON.stringify({ yellowMoney: 5000, yellowPct: 3, redMoney: 15000, redPct: 8 }), 0);
    assert.deepEqual([good.version, good.redMoney, good.canEdit], [1, 15000, true]);
    await fails(call('opex_save_thresholds', ids.org, JSON.stringify({ yellowMoney: 5000, yellowPct: 3, redMoney: 15000, redPct: 8 }), 0), '40001');
    const both = await call('opex_save_thresholds', ids.org, JSON.stringify({ yellowMoney: 5000, yellowPct: 3, redMoney: 15000, redPct: 8, direction: 'both' }), 1);
    assert.equal(both.direction, 'both');
    const under = await call('opex_save_thresholds', ids.org, JSON.stringify({ yellowMoney: 5000, yellowPct: 3, redMoney: 15000, redPct: 8, direction: 'under' }), 2);
    assert.equal(under.direction, 'under');
    await fails(call('opex_save_thresholds', ids.org, JSON.stringify({ yellowMoney: 5000, yellowPct: 3, redMoney: 15000, redPct: 8, direction: 'x' }), 3), '22023');
    await as(ids.inactive); await fails(call('opex_get_thresholds', ids.org), '42501');
    console.log('opexReviewAnalysis.sql: OK');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exit(1); });
