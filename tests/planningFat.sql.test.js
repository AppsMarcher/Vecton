const assert = require('node:assert/strict');
const { createDb } = require('./helpers/planningFatDb');
(async () => {
  const T = await createDb();
  const { db, ids, k } = T;
  try {
    await T.loadFat(); await T.loadImport();
    await T.as(ids.admin);
    const months = Array.from({ length: 12 }, () => ({ type: 'forms' }));
    const sid = (await T.write('create', null, { name: 'Budget', year: 2027, months, forms: [] })).id;
    await db.exec('reset role');

    // ---- Task 1: esquema, regiões e modelos
    const f0 = (await db.query("select code,status,name from planning_forms where scenario_id=$1 and form_type='fat'", [sid])).rows;
    assert.deepEqual(f0, [{ code: 'FAT', status: 'draft', name: 'Vendas · Projeção de volumes' }], 'o cenário novo já nasce com o FAT');
    await assert.rejects(db.query("insert into planning_forms(organization_id,scenario_id,code,name,form_type) values($1,$2,'XYZ','x','xyz')", [ids.org, sid]), /check constraint/);

    const regions = (await db.query('select * from planning_fat_regions($1)', [ids.org])).rows;
    assert.deepEqual(regions.map(r => r.label).sort(), ['BA', 'EX', 'Peças', 'SP']);
    const ba = regions.find(r => r.label === 'BA');
    assert.equal(ba.region_key, k['territorio:BA']);
    assert.deepEqual(ba.responsibles, ['A definir', 'PENINHA']);
    const pecas = regions.find(r => r.label === 'Peças');
    assert.equal(pecas.region_key, 'PECAS');
    assert.equal(pecas.territory_id, null);

    assert.equal((await db.query('select planning_fat_seed_models($1,$2) n', [ids.org, sid])).rows[0].n, 11);
    const models = Object.fromEntries((await db.query('select * from planning_fat_models where scenario_id=$1', [sid])).rows.map(m => [m.model_key, m]));
    assert.equal(models['INGRAIN100'].group_name, 'Grãos');
    assert.equal(models['INGRAIN100'].product_ids.length, 2);
    assert.equal(models['INGRAIN90'].group_name, 'Pecuária');
    assert.equal(models['CARGOGRAIN 14000'].group_name, 'Cargograin');
    assert.equal(models['TRANSGRAIN 170'].group_name, 'Transgrain');
    assert.equal(models['TRANSGRAIN 215'].product_ids.length, 1);
    assert.equal(models['TRANSGRAIN IN-65'].product_ids.length, 1);
    assert.equal(models['TRANSGRAIN IN-90'].product_ids.length, 2);
    assert.equal(models['CJ PROTECT SKATE'].group_name, 'Acessórios');
    assert.equal(models['CJ PROTECT SKATE'].product_ids.length, 1);
    assert.deepEqual(Object.values(models).filter(m => m.group_name === 'Acessórios').sort((a, b) => a.sort - b.sort).map(m => m.model_key), ['CJ PROTECT SKATE', 'SELADORA SILO BOLSA', 'ENROLADOR DE BOLSA'], 'ordem do grupo Acessórios');
    assert.equal(models['PECAS'].group_name, 'Linhas complementares');
    assert.equal(models['PECAS'].fat_driven, true);
    assert.equal(models['PECAS'].product_ids.length, 2);
    assert.equal(models['INGRAIN100'].fat_driven, false);

    const coord = async (region, model) => (await db.query('select coordination_name from planning_fat_model_coordination($1,$2,$3,$4)', [ids.org, sid, region, model])).rows[0]?.coordination_name;
    assert.equal(await coord(k['territorio:BA'], 'INGRAIN100'), 'Norte');
    assert.equal(await coord(k['territorio:BA'], 'INGRAIN90'), 'Pecuária');
    assert.equal(await coord(k['territorio:BA'], 'TRANSGRAIN 215'), 'Norte');
    assert.equal(await coord(k['territorio:BA'], 'SELADORA SILO BOLSA'), 'Norte', 'Acessórios segue a linha Grão');
    assert.equal(await coord(k['territorio:EX'], 'INGRAIN90'), 'Exportação');
    assert.equal(await coord('PECAS', 'PECAS'), 'Peças');

    await T.as(ids.writer);
    for (const t of ['planning_fat_volumes', 'planning_fat_premises', 'planning_fat_taxes', 'planning_fat_models', 'planning_fat_access', 'planning_fat_coord_access']) await assert.rejects(db.query(`select * from ${t}`), /permission denied/, t + ' sem leitura direta');
    await db.exec('reset role');

    // ---- Task 2: premissas
    const sale = async (o) => T.sale(o);
    await sale({ year: 2026, month: 9, prod: 'ING100a', terr: 'BA', linha: 'Grão', coord: 'Norte', qty: 2, fat: 106000, mp: 50800 });
    await sale({ year: 2026, month: 8, prod: 'ING100b', terr: 'BA', linha: 'Grão', coord: 'Norte', qty: 1, fat: 53000, mp: 25400 });
    await sale({ year: 2026, month: 10, prod: 'ING100a', terr: 'BA', linha: 'Grão', coord: 'Norte', qty: 5, fat: 999999, mp: 1 });
    await sale({ year: 2026, month: 8, prod: 'ING90', terr: 'BA', linha: 'Pecuária', coord: 'Pecuária', qty: 1, fat: 173000, mp: 76000 });
    await sale({ year: 2026, month: 7, prod: 'ING90', terr: 'BA', linha: 'Pecuária', coord: 'Pecuária', qty: 1, fat: 173000, mp: 76000 });
    await sale({ year: 2026, month: 9, prod: 'PEC1', terr: null, linha: 'Peças', coord: 'Peças', qty: 1, fat: 100000, mp: 36400 });
    await sale({ year: 2026, month: 8, prod: 'PEC2', terr: null, linha: 'Peças', coord: 'Peças', qty: 1, fat: 100000, mp: 36400 });
    const calc = async () => (await db.query("select planning_fat_calc_premises($1,$2,'2026-10-28') r", [ids.org, sid])).rows[0].r;
    const prem = async (region, model) => (await db.query('select * from planning_fat_premises where scenario_id=$1 and region_key=$2 and model_key=$3', [sid, region, model])).rows[0];
    const res = await calc();
    const p1 = await prem(k['territorio:BA'], 'INGRAIN100');
    assert.equal(Number(p1.fat_unit), 53000); assert.equal(Number(p1.mp_unit), 25400); assert.equal(p1.origin, 'local');
    assert.deepEqual(p1.window_months, [202609, 202608]);
    assert.deepEqual((await prem(k['territorio:BA'], 'INGRAIN90')).window_months, [202608, 202607], 'recua até achar 2 meses com venda');
    assert.equal(await prem(k['territorio:SP'], 'INGRAIN100'), undefined, 'sem venda no território não cria premissa local');
    const pm = await prem('marcher', 'INGRAIN100');
    assert.equal(Number(pm.fat_unit), 53000); assert.equal(pm.origin, 'marcher');
    assert.equal(await prem('marcher', 'CARGOGRAIN 14000'), undefined);
    assert.equal(res.pending, 8, 'CARGOGRAIN, os 4 Transgrain e os 3 Acessórios ficam sem premissa');
    const pp = await prem('PECAS', 'PECAS');
    assert.equal(Number(pp.fat_unit), 1); assert.equal(Number(pp.mp_unit), 0.364); assert.deepEqual(pp.window_months, [202609, 202608]);
    assert.deepEqual(res.window_months, [202609, 202608]);
    assert.equal((await db.query('select count(*)::int n from planning_fat_premise_runs where scenario_id=$1', [sid])).rows[0].n, 1);
    await db.query("update planning_fat_premises set adj_fat=60000 where scenario_id=$1 and region_key=$2 and model_key='INGRAIN100'", [sid, k['territorio:BA']]);
    await calc();
    assert.equal(Number((await prem(k['territorio:BA'], 'INGRAIN100')).adj_fat), 60000, 'Atualizar premissas não apaga o ajuste do admin');
    assert.equal(Number((await prem(k['territorio:BA'], 'INGRAIN100')).fat_unit), 53000);

    // ---- Task 3: cálculo para o ledger
    const fatForm = (await db.query("select id from planning_forms where scenario_id=$1 and form_type='fat'", [sid])).rows[0].id;
    await db.query('update planning_fat_premises set adj_fat=null where scenario_id=$1', [sid]);
    const tx = Object.fromEntries((await db.query('select line,ipi::float8 ipi,icms::float8 icms,pis::float8 pis,cofins::float8 cofins from planning_fat_taxes where scenario_id=$1', [sid])).rows.map(r => [r.line, [r.ipi, r.icms, r.pis, r.cofins]]));
    assert.deepEqual(tx, { maq: [0, 4.1, 1, 4.8], tra: [0, 4.1, 1, 4.8], ace: [1.92, 5.64, 1.62, 7.46], pec: [1.92, 5.64, 1.62, 7.46] }, 'percentuais padrão');
    const vol = (region, model, month, amount) => db.query('insert into planning_fat_volumes(organization_id,scenario_id,form_id,region_key,model_key,reference_month,amount) values($1,$2,$3,$4,$5,$6,$7)', [ids.org, sid, fatForm, region, model, month, amount]);
    const calcRows = async (cells = []) => { const r = (await db.query('select account_number a,reference_month m,amount::float8 v from planning_fat_calculate($1,$2::jsonb) order by 1,2', [fatForm, JSON.stringify(cells)])).rows; return Object.fromEntries(r.map(x => [x.a + '/' + x.m, x.v])); };
    await vol(k['territorio:BA'], 'INGRAIN100', 1, 8);
    let rows = await calcRows();
    assert.deepEqual(rows, { '31101001/1': -424000, '31203002/1': 17384, '31203005/1': 4240, '31203004/1': 20352, '412010901/1': 203200 });
    await vol(k['territorio:EX'], 'INGRAIN100', 2, 8);
    rows = await calcRows();
    assert.equal(rows['31101002/2'], -424000, 'Exportação vai na conta Expo, pela média Marcher');
    assert.equal(rows['412010901/2'], 203200);
    assert.equal(Object.keys(rows).filter(x => x.endsWith('/2')).length, 2, 'Exportação não tem imposto');
    await vol(k['territorio:BA'], 'TRANSGRAIN 215', 3, 1);
    assert.equal(Object.keys(await calcRows()).some(x => x.endsWith('/3')), false, 'modelo sem premissa é ignorado');
    await db.query("insert into planning_fat_premises(organization_id,scenario_id,region_key,model_key,fat_unit,mp_unit,origin) values($1,$2,'marcher','TRANSGRAIN 215',62000,33000,'marcher')", [ids.org, sid]);
    rows = await calcRows();
    assert.equal(rows['31101007/3'], -62000); assert.equal(rows['31203002/3'], 2542, 'Transgrain usa a linha tra');
    await vol('PECAS', 'PECAS', 1, 330000);
    await db.query("insert into planning_fat_premises(organization_id,scenario_id,region_key,model_key,fat_unit,mp_unit,origin) values($1,$2,'marcher','SELADORA SILO BOLSA',10000,6000,'marcher')", [ids.org, sid]);
    await vol(k['territorio:BA'], 'SELADORA SILO BOLSA', 8, 2);
    rows = await calcRows();
    assert.deepEqual([rows['31101006/8'], rows['31203001/8'], rows['31203002/8'], rows['31203005/8'], rows['31203004/8'], rows['412010901/8']], [-20000, 384, 1128, 324, 1492, 12000], 'Acessórios vai na conta 31101006 com os percentuais da linha ace');
    assert.equal(rows['31101001/8'], undefined, 'Acessórios não vai na conta de máquinas');
    await db.query("delete from planning_fat_volumes where model_key='SELADORA SILO BOLSA'");
    rows = await calcRows();
    assert.equal(rows['31101006/1'], -330000); assert.equal(rows['31203001/1'], 6336); assert.equal(rows['31203005/1'], 4240 + 5346);
    assert.equal(rows['31203004/1'], 20352 + 24618); assert.equal(rows['412010901/1'], 203200 + 120120);
    assert.equal(rows['31203002/1'], 17384 + 18612, 'soma por conta e mês antes de arredondar');
    await vol(k['territorio:BA'], 'INGRAIN100', 12, 5);
    await db.query("update planning_scenario_months set source_type='real',source_year=2026 where scenario_id=$1 and reference_month=12", [sid]);
    assert.equal(Object.keys(await calcRows()).some(x => x.endsWith('/12')), false, 'mês sem fonte forms não gera linha');
    await vol(k['territorio:BA'], 'INGRAIN100', 5, 0);
    assert.equal(Object.keys(await calcRows()).some(x => x.endsWith('/5')), false, 'valor zero não gera linha');
    await db.query("insert into planning_fat_premises(organization_id,scenario_id,region_key,model_key,fat_unit,mp_unit,origin) values($1,$2,'marcher','TRANSGRAIN IN-65',0.004,0,'marcher')", [ids.org, sid]);
    await vol(k['territorio:BA'], 'TRANSGRAIN IN-65', 4, 1); await vol(k['territorio:SP'], 'TRANSGRAIN IN-65', 4, 1);
    assert.equal((await calcRows())['31101007/4'], -0.01, 'arredonda depois de agrupar');
    rows = await calcRows([{ region_key: k['territorio:BA'], model_key: 'INGRAIN100', month: 1, amount: '10' }]);
    assert.equal(rows['31101001/1'], -530000, 'prévia do rascunho sem gravar');
    assert.equal(Number((await db.query('select amount from planning_fat_volumes where region_key=$1 and model_key=$2 and reference_month=1', [k['territorio:BA'], 'INGRAIN100'])).rows[0].amount), 8);
    await db.query("update planning_fat_premises set adj_fat=60000 where scenario_id=$1 and region_key=$2 and model_key='INGRAIN100'", [sid, k['territorio:BA']]);
    assert.equal((await calcRows())['31101001/1'], -480000, 'o ajuste do admin vence o histórico');
    await db.query('delete from planning_fat_volumes where form_id=$1', [fatForm]);
    await db.query("update planning_fat_premises set adj_fat=null where scenario_id=$1", [sid]);
    await db.query("update planning_scenario_months set source_type='forms',source_year=null where scenario_id=$1", [sid]);

    // ---- Task 4: leitura e escrita
    const write = T.write, ctx = T.ctx;
    const fw = async (action, payload = {}, scenario = sid) => (await db.query('select planning_fat_write($1,$2,$3,$4::jsonb) value', [ids.org, action, scenario, JSON.stringify({ form_id: fatForm, ...payload })])).rows[0].value;
    const fwRev = async (action, payload = {}) => fw(action, { form_revision: (await db.query('select revision from planning_forms where id=$1', [fatForm])).rows[0].revision, ...payload });
    const fr = async (asof = '2026-10-28') => (await db.query('select planning_fat_read($1,$2,$3::date) value', [ids.org, fatForm, asof])).rows[0].value;
    const BA = k['territorio:BA'], EX = k['territorio:EX'], SP = k['territorio:SP']; const NORTE = k['coord:Norte'], EXPO = k['coord:Exportação'], SUL = k['coord:Sul'];
    await T.as(ids.admin);
    const cellv = (region, model, month, amount, version = 0) => ({ region_key: region, model_key: model, month, amount, version });
    await fw('save_access', { access: [{ user_id: ids.writer, coord_key: NORTE, access_mode: 'write' }, { user_id: ids.writer, coord_key: EXPO, access_mode: 'read' }, { user_id: ids.reader, coord_key: NORTE, access_mode: 'read' }, { user_id: ids.outsider, coord_key: SUL, access_mode: 'read' }] });
    await fw('set_status', { status: 'released' });
    // escopo de leitura
    await T.as(ids.outsider);
    assert.deepEqual((await fr()).regions.map(r => r.label), ['SP']);
    await T.as(ids.foreign);
    await assert.rejects(db.query('select planning_fat_read($1,$2,$3::date)', [ids.org, fatForm, '2026-10-28']), /Sem acesso/);
    // escrita
    await T.as(ids.writer);
    assert.equal((await fwRev('save_volumes', { cells: [cellv(BA, 'INGRAIN100', 1, '8')] })).ok, true);
    await assert.rejects(fwRev('save_volumes', { cells: [cellv(EX, 'INGRAIN100', 1, '8')] }), /permiss/);
    await assert.rejects(fwRev('save_volumes', { cells: [cellv(SP, 'INGRAIN100', 1, '8')] }), /permiss/);
    // por coordenação: Norte cobre a linha Grão em BA, não a Pecuária
    await assert.rejects(fwRev('save_volumes', { cells: [cellv(BA, 'INGRAIN90', 1, '3')] }), /permiss/);
    const cm = (await fr()).cell_modes;
    assert.equal(cm.find(c => c.region_key === BA && c.model_key === 'INGRAIN100').mode, 'write');
    assert.equal(cm.some(c => c.region_key === BA && c.model_key === 'INGRAIN90'), false);
    assert.equal(cm.find(c => c.region_key === EX && c.model_key === 'INGRAIN100').mode, 'read');
    let rd = await fr();
    assert.deepEqual(rd.regions.map(r => r.label).sort(), ['BA', 'EX']);
    assert.equal(rd.volumes.filter(v => v.region_key === BA).length, 1);
    assert.equal(rd.regions.find(r => r.label === 'EX').mode, 'read');
    assert.deepEqual(rd.access, [], 'a lista completa de acessos é só do admin');
    assert.deepEqual(rd.coordination.filter(c => c.region_key === BA).map(c => c.line + ':' + c.coordination + ':' + c.responsible).sort(), ['Grão:Norte:PENINHA', 'Outros:Norte:PENINHA', 'Pecuária:Pecuária:A definir'], 'coordenação e responsável por linha');
    assert.equal(rd.premises.some(p => 'calc_fat_unit' in p), false, 'quem não é admin não recebe o valor do histórico nem o ajuste');
    assert.equal(rd.whole, false, 'quem só tem a coordenação Norte não enxerga o todo');
    // conflito e validação não salvam nada
    const conflict = await fwRev('save_volumes', { cells: [cellv(BA, 'INGRAIN100', 1, '9', 0), cellv(BA, 'INGRAIN100', 2, '3', 0)] });
    assert.equal(conflict.ok, false);
    assert.equal((await fr()).volumes.filter(v => v.region_key === BA).length, 1, 'o lote com conflito não salva nada');
    for (const bad of ['-1', '', 'abc', '1.00001']) await assert.rejects(fwRev('save_volumes', { cells: [cellv(BA, 'INGRAIN100', 2, bad, 0)] }), /inválida/);
    await assert.rejects(fwRev('save_volumes', { cells: [cellv(BA, 'INGRAIN100', 2, '1'), cellv(BA, 'INGRAIN100', 2, '2')] }), /repetida/);
    await assert.rejects(fwRev('save_volumes', { cells: [cellv(BA, 'PECAS', 2, '1')] }), /permiss|inválida/);
    await assert.rejects(fwRev('save_volumes', { cells: [cellv(BA, 'INGRAIN100', 2, '1')], form_revision: 0 }), /reabra/);
    assert.equal((await fr()).volumes.filter(v => v.region_key === BA).length, 1);
    assert.equal((await fwRev('save_volumes', { cells: [cellv(BA, 'INGRAIN100', 1, '9', 1)] })).ok, true);
    // leitor e restrições de admin
    await T.as(ids.reader);
    await assert.rejects(fwRev('save_volumes', { cells: [cellv(BA, 'INGRAIN100', 3, '1')] }), /permiss/);
    await T.as(ids.writer);
    for (const [a, extra] of [['save_taxes', { line: 'maq', ipi: 0, icms: 1, pis: 1, cofins: 1, version: 1 }], ['refresh_premises', {}], ['adjust_premise', { region_key: BA, model_key: 'INGRAIN100', adj_fat: 1, version: 1 }], ['set_status', { status: 'draft' }], ['save_access', { access: [] }]]) await assert.rejects(fw(a, extra), /administradores/);
    // taxas, premissas, ajuste
    await T.as(ids.admin);
    await assert.rejects(fw('save_taxes', { line: 'maq', ipi: 0, icms: 5, pis: 1, cofins: 4, version: 99 }), /mudaram/);
    await assert.rejects(fw('save_taxes', { line: 'maq', ipi: 0, icms: -1, pis: 1, cofins: 4, version: 1 }), /inválid/);
    assert.equal((await fw('save_taxes', { line: 'maq', ipi: 0, icms: 5, pis: 1, cofins: 4, version: 1 })).ok, true);
    assert.equal(Number((await fr()).taxes.find(t => t.line === 'maq').icms), 5);
    await fw('save_taxes', { line: 'maq', ipi: 0, icms: 4.1, pis: 1, cofins: 4.8, version: 2 });
    const sys = async fn => { await db.exec('reset role'); const r = await fn(); await T.as(ids.admin); return r; };
    const runsOf = () => sys(async () => (await db.query('select count(*)::int n from planning_fat_premise_runs where scenario_id=$1', [sid])).rows[0].n);
    const runs0 = await runsOf();
    assert.equal((await fw('refresh_premises', { asof: '2026-10-28' })).ok, true);
    assert.equal(await runsOf(), runs0 + 1);
    rd = await fr();
    assert.equal(rd.stale, false); assert.deepEqual(rd.window_months, [202609, 202608]);
    assert.equal((await fr('2026-11-15')).stale, true, 'mês novo fechado depois da janela da última atualização');
    assert.equal(rd.access.length, 4, 'o admin recebe a matriz de acessos');
    assert.equal(rd.whole, true, 'admin enxerga o todo');
    assert.deepEqual(rd.coords.map(c => c.name).sort(), ['Exportação', 'Marcher', 'Norte', 'Pecuária', 'Peças', 'Sul'].sort(), 'coordenações para o admin configurar'); assert.equal(rd.coords[0].name, 'Marcher');
    assert.deepEqual(rd.cell_modes, [], 'o admin não precisa do mapa de células');
    const pBA = rd.premises.find(p => p.region_key === BA && p.model_key === 'INGRAIN100');
    assert.equal(pBA.calc_fat_unit, 53000);
    await fw('adjust_premise', { region_key: BA, model_key: 'INGRAIN100', adj_fat: 60000, adj_mp: null, version: pBA.version });
    const adj = (await fr()).premises.find(p => p.region_key === BA && p.model_key === 'INGRAIN100');
    assert.equal(adj.fat_unit, 60000); assert.equal(adj.adjusted, true); assert.equal(adj.calc_fat_unit, 53000);
    await fw('refresh_premises', { asof: '2026-10-28' });
    assert.equal((await fr()).premises.find(p => p.region_key === BA && p.model_key === 'INGRAIN100').adj_fat, 60000, 'o ajuste sobrevive a Atualizar premissas');
    await fw('clear_adjust', { region_key: BA, model_key: 'INGRAIN100', version: (await fr()).premises.find(p => p.region_key === BA && p.model_key === 'INGRAIN100').version });
    assert.equal((await fr()).premises.find(p => p.region_key === BA && p.model_key === 'INGRAIN100').adjusted, false);
    assert.equal((await fr()).history.some(h => h.region_key === BA && h.model_key === 'INGRAIN100' && h.year === 2026), true, 'colunas de referência 2025 e 2026');
    // 323: a carga de vendas planejadas (arquivo) alimenta os volumes do FAT do mesmo cenário
    const load = rows => T.planned(rows, { scenario: sid });
    await db.exec('reset role');
    await load([{ month: 6, prod: 'ING100a', terr: BA, qty: 3 }, { month: 6, prod: 'ING100b', terr: BA, qty: 2.4 }, { month: 6, prod: 'ING90', terr: BA, qty: 7 }, { month: 6, prod: 'PEC1', valor: 1500 }, { month: 6, prod: 'PEC2', valor: 500.25 }, { month: 6, prod: 'T170', terr: k['territorio:SP'], qty: 4 }]);
    await T.as(ids.admin);
    const pvol = async (r, m, mo) => (await fr()).volumes.find(v => v.region_key === r && v.model_key === m && v.reference_month === mo)?.amount;
    assert.equal(Number(await pvol(BA, 'INGRAIN100', 6)), 5, 'códigos do mesmo modelo somam e a quantidade é arredondada');
    assert.equal(Number(await pvol(BA, 'INGRAIN90', 6)), 7);
    assert.equal(Number(await pvol('PECAS', 'PECAS', 6)), 2000.25, 'Peças recebe a soma do valor (FAT em R$)');
    assert.equal(await pvol(BA, 'INGRAIN100', 7), undefined, 'mês fora do arquivo não é tocado');
    assert.equal(Number(await pvol(BA, 'INGRAIN100', 1)), 9, 'volume digitado em mês fora do arquivo permanece');
    await db.exec('reset role'); await load([{ month: 6, prod: 'ING100a', terr: BA, qty: 10 }]); await T.as(ids.admin);
    assert.equal(Number(await pvol(BA, 'INGRAIN100', 6)), 15, 'o mês é espelhado de novo a partir de todo o planejado carregado');
    assert.equal((await db.query("select count(*)::int n from planning_audit_log where scenario_id=$1 and action='fat_planned_sync'", [sid])).rows[0].n > 0, true, 'a sincronização fica na auditoria');
    await db.exec('reset role'); await db.query('delete from comercial_planejado_ledger_entries'); await db.query('delete from planning_fat_volumes where reference_month=6'); await T.as(ids.admin);
    // 326: valor e %MB vazios na carga são assumidos do cenário (premissas + impostos do FAT); preenchidos, valem os da carga
    await db.exec('reset role');
    const assume = async (prodKey, terr, qtd, valor, mb, scenario = sid) => (await db.query('select valor::float8 v, mb_pct::float8 mb from comercial_planejado_assumir_cenario($1,$2,$3,$4,$5,$6,$7)', [ids.org, scenario, T.prod[prodKey], terr, qtd, valor, mb])).rows[0];
    const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-5, `${msg}: ${a} != ${b}`);
    let a = await assume('ING100a', BA, 2, null, null);
    assert.equal(a.v, 106000, 'valor = quantidade x FAT/un da região'); near(a.mb, (106000 * 0.901 - 50800) / (106000 * 0.901), '%MB = (RL - MP) / RL com os impostos de Máquinas');
    a = await assume('ING100a', BA, 2, 100000, null);
    assert.equal(a.v, 100000, 'valor da carga vale'); near(a.mb, (100000 * 0.901 - 50800) / (100000 * 0.901), '%MB recalculado sobre o valor da carga');
    a = await assume('ING100a', BA, 2, null, 0.5);
    assert.equal(a.v, 106000); assert.equal(a.mb, 0.5, '%MB da carga vale');
    a = await assume('ING100a', EX, 2, null, null);
    assert.equal(a.v, 106000, 'sem premissa local usa a média Marcher'); near(a.mb, (106000 - 50800) / 106000, 'Exportação: RL = valor');
    a = await assume('PEC1', null, null, 1500, null);
    assert.equal(a.v, 1500, 'Peças: o valor é o da carga'); near(a.mb, (1500 * (1 - 0.1664) - 1500 * 0.364) / (1500 * (1 - 0.1664)), 'Peças: %MB pelo MP/FAT da premissa');
    a = await assume('T170', SP, 3, null, null);
    assert.deepEqual(a, { v: null, mb: null }, 'sem premissa nenhuma, nada a assumir');
    a = await assume('T170', SP, 3, 5000, null);
    assert.equal(a.v, 5000);
    a = await assume('ING100a', BA, 2, null, null, null);
    assert.deepEqual(a, { v: null, mb: null }, 'destino sem cenário de planejamento: nada a assumir');
    await T.as(ids.admin);
    // 327: a meta do Painel (razão da carga) acompanha as premissas e os impostos do cenário
    await db.exec('reset role');
    const ledgerRow = async (prodKey) => (await db.query('select valor::float8 v, mb_pct::float8 mb from comercial_planejado_ledger_entries where scenario_id=$1 and produto_id=$2 and reference_month=9', [sid, T.prod[prodKey]])).rows[0];
    await load([{ month: 9, prod: 'ING100a', terr: BA, qty: 2 }, { month: 9, prod: 'ING90', terr: BA, qty: 1, valor: 777, mb: 0.4 }]);
    assert.equal((await ledgerRow('ING100a')).v, 106000, 'a carga sem valor assume o do cenário ao aplicar');
    await db.query("update planning_fat_premises set adj_fat=60000 where scenario_id=$1 and region_key=$2 and model_key='INGRAIN100'", [sid, BA]);
    assert.equal((await ledgerRow('ING100a')).v, 120000, 'ajustar a premissa recalcula o valor da meta');
    assert.equal((await ledgerRow('ING90')).v, 777, 'linha com valor e %MB da carga não é tocada');
    await db.query("update planning_fat_taxes set icms=0,pis=0,cofins=0 where scenario_id=$1 and line='maq'", [sid]);
    near((await ledgerRow('ING100a')).mb, (120000 - 50800) / 120000, '%MB acompanha a mudança de imposto');
    await db.query("update planning_fat_premises set adj_fat=null where scenario_id=$1 and region_key=$2 and model_key='INGRAIN100'", [sid, BA]);
    assert.equal((await ledgerRow('ING100a')).v, 106000, 'limpar o ajuste volta ao histórico');
    await db.query("update planning_fat_taxes set icms=4.1,pis=1,cofins=4.8 where scenario_id=$1 and line='maq'", [sid]);
    await db.query('delete from comercial_planejado_ledger_entries where reference_month=9'); await db.query('delete from planning_fat_volumes where reference_month=9');
    await T.as(ids.admin);
    // 328: o FAT e o Painel são sempre iguais — volume salvo ou apagado no formulário ajusta a meta (razão da carga)
    await db.exec('reset role');
    const SPid = k['territorio:SP'];
    const painelMeta = async (prodKeys, terr, month = 10, col = 'quantidade') => Number((await db.query(`select coalesce(sum(${col}),0)::float8 v from comercial_planejado_ledger_entries where scenario_id=$1 and reference_month=$2 and produto_id=any($3::uuid[]) and territorio_id is not distinct from $4`, [sid, month, prodKeys.map(x => T.prod[x]), terr])).rows[0].v);
    const ing100 = ['ING100a', 'ING100b'];
    const fvol = async (region, model, month = 10) => Number((await db.query('select amount::float8 a from planning_fat_volumes where scenario_id=$1 and region_key=$2 and model_key=$3 and reference_month=$4', [sid, region, model, month])).rows[0]?.a ?? 0);
    await load([{ month: 10, prod: 'ING100a', terr: BA, qty: 3 }, { month: 10, prod: 'ING100b', terr: BA, qty: 2 }]);
    assert.equal(await fvol(BA, 'INGRAIN100'), 5, 'carga -> FAT');
    await db.query("update planning_fat_volumes set amount=10 where scenario_id=$1 and region_key=$2 and model_key='INGRAIN100' and reference_month=10", [sid, BA]);
    assert.equal(await painelMeta(ing100, BA), 10, 'volume maior no FAT sobe a meta do Painel');
    assert.equal(await painelMeta(['ING100a'], BA), 6); assert.equal(await painelMeta(['ING100b'], BA), 4); // mesma proporção da carga (3:2)
    assert.equal((await db.query("select count(*)::int n from comercial_planejado_import_rows where quantidade is not null and reference_month=10 and quantidade in (6,4)")).rows[0].n, 2, 'o ajuste passa pelas linhas de importação');
    assert.equal(await fvol(BA, 'INGRAIN100'), 10, 'sem eco: o FAT segue com o que foi digitado');
    await db.query("update planning_fat_volumes set amount=7 where scenario_id=$1 and region_key=$2 and model_key='INGRAIN100' and reference_month=10", [sid, BA]);
    assert.equal(await painelMeta(ing100, BA), 7, 'volume menor no FAT desce a meta (arredondamento fecha no total)');
    await db.query("insert into planning_fat_volumes(organization_id,scenario_id,form_id,region_key,model_key,reference_month,amount) values($1,$2,$3,$4,'INGRAIN100',10,4)", [ids.org, sid, fatForm, SPid]);
    assert.equal(await painelMeta(ing100, SPid), 4, 'célula nova no FAT cria a meta (lote manual, produto principal do modelo)');
    assert.equal(await painelMeta(['ING100a'], SPid), 4);
    assert.equal(await painelMeta(ing100, SPid, 10, 'valor'), 4 * 53000, 'valor da meta nova assumido do cenário');
    assert.equal((await db.query("select count(*)::int n from comercial_planejado_import_batches where scenario_id=$1 and source_type='manual' and notes='Ajustes do formulário FAT' and status='applied'", [sid])).rows[0].n, 1, 'um lote manual por cenário');
    await db.query("update planning_fat_volumes set amount=0 where scenario_id=$1 and region_key=$2 and model_key='INGRAIN100' and reference_month=10", [sid, BA]);
    assert.equal(await painelMeta(ing100, BA), 0, 'zerar no FAT tira o modelo da meta');
    await db.query("delete from planning_fat_volumes where scenario_id=$1 and region_key=$2 and model_key='INGRAIN100' and reference_month=10", [sid, SPid]);
    assert.equal(await painelMeta(ing100, SPid), 0, 'apagar a célula no FAT tira da meta');
    await db.query("insert into planning_fat_volumes(organization_id,scenario_id,form_id,region_key,model_key,reference_month,amount) values($1,$2,$3,'PECAS','PECAS',10,3000.5)", [ids.org, sid, fatForm]);
    assert.equal(await painelMeta(['PEC1', 'PEC2'], null, 10, 'valor'), 3000.5, 'Peças: o valor do FAT vira a meta em R$');
    await db.query("update planning_fat_volumes set amount=1000 where scenario_id=$1 and region_key='PECAS' and model_key='PECAS' and reference_month=10", [sid]);
    assert.equal(await painelMeta(['PEC1', 'PEC2'], null, 10, 'valor'), 1000);
    await db.query("delete from planning_fat_volumes where scenario_id=$1 and region_key='PECAS' and reference_month=10", [sid]);
    assert.equal(await painelMeta(['PEC1', 'PEC2'], null, 10, 'valor'), 0);
    await db.query('delete from comercial_planejado_ledger_entries where reference_month=10'); await db.query('delete from planning_fat_volumes where reference_month=10');
    await T.as(ids.admin);
    // bloqueio não vale para admin (320)
    await write('lock', sid, { locked: true });
    await assert.rejects(fwRev('save_volumes', { cells: [cellv(BA, 'INGRAIN100', 4, 'abc', 0)] }), /inválida/); // passou do bloqueio e caiu na validação
    await write('lock', sid, { locked: false });
    // planning_write não mexe no FAT
    await assert.rejects(write('save_access', sid, { form_id: fatForm, access: [] }), /operações autorizadas do FAT/);
    await assert.rejects(write('save_form', sid, { code: 'FAT', name: 'Outro' }), /reservado/);
    // 321: admin renomeia o FAT sem mexer em código, status ou revisão
    const revFat = async () => (await db.query('select revision, status, code from planning_forms where id=$1', [fatForm])).rows[0];
    const revBefore = await revFat();
    await write('save_form', sid, { id: fatForm, code: 'FAT', name: 'Vendas · Projeção de Volumes' });
    assert.deepEqual(await revFat(), revBefore);
    assert.equal((await db.query('select name from planning_forms where id=$1', [fatForm])).rows[0].name, 'Vendas · Projeção de Volumes');
    await assert.rejects(write('save_form', sid, { id: fatForm, code: 'XX', name: 'Outro' }), /código do FAT/);
    await assert.rejects(write('save_form', sid, { id: fatForm, code: 'FAT', name: '  ' }), /nome/);
    await T.as(ids.writer);
    await assert.rejects(write('save_form', sid, { id: fatForm, code: 'FAT', name: 'Invasão' }), /Sem permissão/);
    await T.as(ids.admin);
    await db.exec('reset role');

    // ---- Task 5: integração, sobreposição e meta
    const fatLedger = () => sys(async () => (await db.query("select account_number a,reference_month m,amount::float8 v,cost_center_id cc,history h from forecast_ledger_entries where scenario_id=$1 and planning_form_id=$2 order by 1,2", [sid, fatForm])).rows);
    const ledgerOf = (formId) => sys(async () => (await db.query('select count(*)::int n,coalesce(sum(amount),0)::float8 s from forecast_ledger_entries where scenario_id=$1 and planning_form_id=$2', [sid, formId])).rows[0]);
    const calcSys = () => sys(() => calcRows());
    await T.as(ids.admin);
    const setVol = async (region, model, month, amount) => { const cur = (await fr()).volumes.find(v => v.region_key === region && v.model_key === model && v.reference_month === month); return fwRev('save_volumes', { cells: [cellv(region, model, month, String(amount), cur ? cur.row_version : 0)] }); };
    await setVol(BA, 'INGRAIN100', 1, 8); await setVol(EX, 'INGRAIN100', 2, 8); await setVol('PECAS', 'PECAS', 1, 330000);
    await fw('refresh_premises', { asof: '2026-10-28' });
    await fw('set_status', { status: 'draft' });
    await assert.rejects(fw('project'), /Libere/);
    await fw('set_status', { status: 'released' });
    // sem 08 com valor: nada a avisar
    assert.deepEqual((await db.query('select * from planning_fat_overlap($1,$2)', [ids.org, fatForm])).rows, []);
    // formulário 08 (OPEX) com valor na conta de receita
    await db.exec('reset role');
    const acct31101001 = require('node:crypto').randomUUID();
    await db.query("insert into accounts values($1,$2,'31101001','VENDA DE MAQUINAS - NACIONAL',true)", [acct31101001, ids.org]);
    await db.query("insert into dre_plan_nodes(organization_id,account_id,node_class) values($1,$2,'Analitica')", [ids.org, acct31101001]);
    await T.as(ids.admin);
    const o8 = (await write('save_form', sid, { code: '08', name: 'Faturamento | Impostos | Matéria-prima' })).id;
    const o8line = (await write('save_line', sid, { form_id: o8, seq: 1, description: 'VENDA DE MAQUINAS - NACIONAL', origin: 'input', formula_name: 'VENDA', account_id: acct31101001 })).id;
    await write('save_form', sid, { id: o8, code: '08', name: 'Faturamento | Impostos | Matéria-prima', status: 'released' });
    const rev8 = (await db.query('select revision from planning_forms where id=$1', [o8])).rows[0].revision;
    // com o FAT ocupando a chave (conta + mês, sem centro de custo) o servidor recusa lançar no 08; o aviso de integração vale para o que já existia antes
    // FAT em rascunho não integra, então não ocupa a chave: o 08 pode lançar
    const setFat = async st => { await db.exec('reset role'); await db.query("update planning_forms set status=$2 where id=$1", [fatForm, st]); await T.as(ids.admin); };
    await setFat('draft');
    assert.notEqual((await write('save_entries', sid, { form_id: o8, form_revision: rev8, cells: [{ line_id: o8line, cost_center_id: null, month: 1, amount: 777, version: 0 }] })).ok, false, 'FAT em rascunho não bloqueia');
    await db.exec('reset role'); await db.query('delete from planning_entries where form_id=$1', [o8]); await setFat('released');
    await assert.rejects(write('save_entries', sid, { form_id: o8, form_revision: rev8, cells: [{ line_id: o8line, cost_center_id: null, month: 1, amount: 777, version: 0 }] }), /alimentado pelo FAT/);
    await db.exec('reset role');
    await db.query('insert into planning_entries(organization_id,form_id,line_id,cost_center_id,reference_month,amount) values($1,$2,$3,null,1,777)', [ids.org, o8, o8line]);
    await T.as(ids.admin);
    assert.deepEqual((await db.query('select * from planning_fat_overlap($1,$2)', [ids.org, fatForm])).rows, [{ account_number: '31101001', months: [1] }]);
    await T.as(ids.writer);
    assert.equal((await db.query('select * from planning_fat_overlap($1,$2)', [ids.org, fatForm])).rows.length, 1, 'quem lança vê a sobreposição, sem valores');
    await T.as(ids.reader);
    await assert.rejects(db.query('select * from planning_fat_overlap($1,$2)', [ids.org, fatForm]), /permissão/);
    await T.as(ids.admin);
    // integra o OPEX (08) e depois o FAT: cada um preserva o do outro
    await write('project', sid, { form_id: o8 });
    const opexBefore = await ledgerOf(o8);
    assert.equal(opexBefore.n, 1);
    const cpxId = (await ctx(sid)).forms.find(f => f.form_type === 'capex').id;
    await sys(async () => { await db.exec(`select set_config('vecton.planning_write','${sid}',false); insert into forecast_ledger_entries(organization_id,scenario_id,reference_year,reference_month,account_number,cost_center_id,cost_center_number,amount,history,planning_form_id) values('${ids.org}','${sid}',2027,5,'42301001','${ids.cc}','101',100,'CAPEX: CPX','${cpxId}')`); });
    const expected = await calcSys();
    const run1 = await fw('project');
    assert.equal(run1.ok, true); assert.equal(run1.rows_written, Object.keys(expected).length);
    const led = await fatLedger();
    assert.deepEqual(Object.fromEntries(led.map(r => [r.a + '/' + r.m, r.v])), expected);
    assert(led.every(r => r.cc === null && r.h === 'FAT: FAT'), 'sem centro de custo e histórico FAT: FAT');
    assert.equal((await ledgerOf(o8)).n, 0, 'o FAT prevalece: a linha do 08 na mesma chave (conta, mês e sem centro de custo) sai do razão');
    assert.equal((await ledgerOf(cpxId)).n, 1, 'o CPX não é tocado pelo FAT');
    await fw('project');
    assert.deepEqual(await fatLedger(), led, 'reintegrar não duplica');
    await write('project', sid, { form_id: o8 });
    assert.deepEqual(await fatLedger(), led, 'a integração do OPEX preserva as linhas do FAT');
    assert.equal((await sys(async () => (await db.query("select count(*)::int n from planning_runs where initiated_form_id=$1 and status='ok'", [fatForm])).rows[0].n)), 2);
    assert.equal((await sys(async () => (await db.query("select count(*)::int n from planning_audit_log where scenario_id=$1 and action='fat_project'", [sid])).rows[0].n)), 2);
    // meta por modelo
    const meta = await sys(async () => (await db.query('select * from planning_fat_meta where scenario_id=$1', [sid])).rows);
    const mBA = meta.find(m => m.model_key === 'INGRAIN100' && m.territory_id === BA);
    assert.equal(Number(mBA.volume), 8); assert.equal(Number(mBA.fat), 424000); assert.equal(Number(mBA.rl), 382024); assert.equal(Number(mBA.mp), 203200);
    assert.equal(meta.find(m => m.territory_id === EX).coordination_id, k['coord:Exportação']);
    assert.equal(Number(meta.find(m => m.territory_id === EX).rl), 424000, 'Exportação: RL = FAT');
    const mPec = meta.find(m => m.model_key === 'PECAS');
    assert.equal(mPec.territory_id, null); assert.equal(Number(mPec.volume), 1); assert.equal(Number(mPec.fat), 330000); assert.equal(Number(mPec.rl), 275088);
    // mês que deixou de ser formulário sai da integração
    await sys(async () => db.query("update planning_scenario_months set source_type='real',source_year=2026 where scenario_id=$1 and reference_month=2", [sid]));
    await fw('project');
    assert.equal((await fatLedger()).some(r => r.m === 2), false);
    await sys(async () => db.query("update planning_scenario_months set source_type='forms',source_year=null where scenario_id=$1 and reference_month=2", [sid]));
    // modelo sem premissa: pendente, não grava, informa
    await setVol(BA, 'CARGOGRAIN 14000', 1, 2);
    const runP = await fw('project');
    assert.equal(runP.pending, 1); assert.equal((await fatLedger()).length, Object.keys(expected).length);
    await setVol(BA, 'CARGOGRAIN 14000', 1, 0);
    // falha na gravação: o ledger anterior permanece e a execução fica registrada com erro
    await sys(async () => db.query("update planning_fat_taxes set ipi=0 where scenario_id=$1 and line='maq'", [sid]));
    const before = await fatLedger();
    await sys(async () => db.exec("alter table planning_fat_meta add constraint fat_meta_test_fail check(fat<0) not valid"));
    const bad = await fw('project');
    assert.equal(bad.ok, false); assert.deepEqual(await fatLedger(), before, 'erro mantém o ledger anterior');
    assert.equal((await sys(async () => (await db.query("select count(*)::int n from planning_runs where initiated_form_id=$1 and status='error'", [fatForm])).rows[0].n)), 1);
    await sys(async () => db.exec('alter table planning_fat_meta drop constraint fat_meta_test_fail'));
    // botão único: OPEX, CAPEX e FAT
    const all = (await db.query('select planning_integrate_all($1,$2,$3) r', [ids.org, sid, fatForm])).rows[0].r;
    assert.equal(all.ok, true); assert.equal(all.fat.ok, true); assert.equal(all.opex.ok, true);
    assert.deepEqual(await fatLedger(), before);
    assert(all.notes.some(n => /CAPEX/.test(n)), 'o CPX em rascunho é só informado');
    await db.exec('reset role');

    // ---- Task 6: contexto, clonagem e criação do formulário
    await T.as(ids.admin);
    await sys(async () => db.query("update planning_fat_taxes set ipi=2.5 where scenario_id=$1 and line='pec'", [sid]));
    await fw('save_access', { access: [{ user_id: ids.writer, coord_key: NORTE, access_mode: 'write' }, { user_id: ids.reader, coord_key: NORTE, access_mode: 'read' }, { user_id: ids.outsider, coord_key: SUL, access_mode: 'read' }] });
    const sid2 = (await write('create', null, { name: 'Forecast', year: 2028, months, forms: [], base_scenario_id: sid })).id;
    const ff2 = (await ctx(sid2)).forms.find(f => f.form_type === 'fat');
    assert.equal(ff2.code, 'FAT'); assert.equal(ff2.status, 'draft');
    const q = (text, params) => sys(async () => (await db.query(text, params)).rows);
    assert.equal((await q('select count(*)::int n from planning_fat_models where scenario_id=$1', [sid2]))[0].n, 11, 'modelos semeados no cenário novo');
    assert.equal(Number((await q("select ipi from planning_fat_taxes where scenario_id=$1 and line='pec'", [sid2]))[0].ipi), 2.5, 'percentuais herdados do cenário de origem');
    assert.equal((await q('select count(*)::int n from planning_fat_coord_access where form_id=$1', [ff2.id]))[0].n, 0, 'acessos não são copiados por padrão');
    assert.equal((await ctx(sid2)).fat_enabled, true);
    await assert.rejects(write('save_form', sid2, { code: 'FAT', name: 'Outro' }), /reservado/);
    // clonagem com valores e acessos
    const sid3 = (await write('create', null, { name: 'Copia', year: 2029, months, base_scenario_id: sid, forms: [{ source_form_id: fatForm, copy_values: true, copy_access: true, status: 'released' }] })).id;
    const ff3 = (await ctx(sid3)).forms.find(f => f.form_type === 'fat');
    assert.equal(ff3.status, 'released');
    const cnt = async (tbl, where, p) => (await q(`select count(*)::int n from ${tbl} where ${where}`, p))[0].n;
    assert.equal(await cnt('planning_fat_coord_access', 'form_id=$1', [ff3.id]), await cnt('planning_fat_coord_access', 'form_id=$1', [fatForm]));
    assert.equal(await cnt('planning_fat_volumes', 'form_id=$1', [ff3.id]), await cnt('planning_fat_volumes', 'form_id=$1', [fatForm]));
    assert(await cnt('planning_fat_volumes', 'form_id=$1', [ff3.id]) > 0);
    assert.equal(await cnt('planning_fat_premises', 'scenario_id=$1', [sid3]), await cnt('planning_fat_premises', 'scenario_id=$1', [sid]));
    assert.equal(await cnt('forecast_ledger_entries', 'scenario_id=$1 and planning_form_id=$2', [sid3, ff3.id]), 0, 'o ledger nunca é copiado');
    // clonagem sem valores
    const sid4 = (await write('create', null, { name: 'Sem valores', year: 2030, months, base_scenario_id: sid, forms: [{ source_form_id: fatForm, status: 'draft' }] })).id;
    const ff4 = (await ctx(sid4)).forms.find(f => f.form_type === 'fat');
    assert.equal(await cnt('planning_fat_volumes', 'form_id=$1', [ff4.id]), 0); assert.equal(await cnt('planning_fat_coord_access', 'form_id=$1', [ff4.id]), 0);
    assert.equal(await cnt('planning_fat_taxes', 'scenario_id=$1', [sid4]), 4);
    // contexto por pessoa: o FAT só aparece para quem tem acesso
    await fw('set_status', { status: 'released' });
    await T.as(ids.reader);
    assert((await ctx(sid)).forms.some(f => f.form_type === 'fat'), 'quem tem acesso vê o FAT');
    await T.as(ids.admin);
    await fw('save_access', { access: [{ user_id: ids.writer, coord_key: NORTE, access_mode: 'write' }, { user_id: ids.outsider, coord_key: SUL, access_mode: 'read' }] });
    await T.as(ids.reader);
    await assert.rejects(ctx(sid), /Sem acesso ao cenário/, 'sem acesso a nenhum formulário o cenário nem aparece');
    await T.as(ids.admin);
    // excluir o cenário remove tudo do FAT
    await write('delete_scenario', sid4, { confirmation: 'REMOVER' });
    for (const [tbl, col] of [['planning_fat_models', 'scenario_id'], ['planning_fat_taxes', 'scenario_id'], ['planning_fat_premises', 'scenario_id'], ['planning_fat_volumes', 'scenario_id'], ['planning_fat_coord_access', 'form_id']]) assert.equal(await cnt(tbl, `${col}=$1`, [col === 'form_id' ? ff4.id : sid4]), 0, tbl);
    await db.exec('reset role');

    // ---- Revisão final: correções dos achados Importantes
    await T.as(ids.admin);
    // volume de máquina é inteiro; Peças aceita centavos
    await assert.rejects(fw('save_volumes', { form_revision: (await fr()).revision, cells: [{ region_key: SP, model_key: 'INGRAIN100', month: 7, amount: '2.5', version: 0 }] }), /inválida/);
    // 3. copiar estrutura com origem FAT é recusado e não mexe no FAT
    await assert.rejects(write('copy_form', sid, { source_form_id: fatForm, code: 'ZZ', name: 'x' }), /FAT/);
    assert.equal((await q('select status from planning_forms where id=$1', [fatForm]))[0].status, 'released', 'o FAT continua liberado');
    // 4. volume de região sem atribuição vigente não é integrado (nem na conta errada) e é contado
    await sys(async () => db.query('update comercial_atribuicao_responsavel set data_fim=current_date-1 where territorio_id=$1', [EX]));
    const skippedRun = await fw('project');
    assert.equal(skippedRun.ok, true); assert(skippedRun.skipped >= 1, 'a região sem atribuição vigente é contada');
    const ledSkip = await fatLedger();
    assert.equal(ledSkip.some(r => r.m === 2 && (r.a === '31101001' || r.a === '31101002')), false, 'nada do EX vai para o DRE');
    await sys(async () => db.query('update comercial_atribuicao_responsavel set data_fim=null where territorio_id=$1', [EX]));
    // 7. o admin ajusta qualquer premissa, mesmo a que vem da média Marcher ou a de modelo nunca vendido
    assert.equal((await fr()).premises.find(p => p.region_key === SP && p.model_key === 'INGRAIN100'), undefined);
    await fw('adjust_premise', { region_key: SP, model_key: 'INGRAIN100', adj_fat: 70000, adj_mp: null });
    const spAdj = (await fr()).premises.find(p => p.region_key === SP && p.model_key === 'INGRAIN100');
    assert.equal(spAdj.fat_unit, 70000); assert.equal(spAdj.mp_unit, 25400, 'o MP segue a média Marcher'); assert.equal(spAdj.adjusted, true);
    await assert.rejects(fw('adjust_premise', { region_key: BA, model_key: 'CARGOGRAIN 14000', adj_fat: 90000 }), /dois valores/);
    await fw('adjust_premise', { region_key: BA, model_key: 'CARGOGRAIN 14000', adj_fat: 90000, adj_mp: 40000 });
    await setVol(SP, 'INGRAIN100', 6, 1); await setVol(BA, 'CARGOGRAIN 14000', 6, 1);
    const calc6 = await calcSys();
    assert.equal(calc6['31101001/6'], -(70000 + 90000), 'as premissas ajustadas entram no cálculo');
    // 330: a coordenação MARCHER, ou todas as coordenações liberadas, também enxerga o todo
    await fw('save_access', { access: [{ user_id: ids.reader, coord_key: 'MARCHER', access_mode: 'read' }, { user_id: ids.outsider, coord_key: SUL, access_mode: 'read' }, { user_id: ids.outsider, coord_key: NORTE, access_mode: 'read' }] });
    await T.as(ids.reader); assert.equal((await fr()).whole, true, 'MARCHER enxerga o todo');
    await T.as(ids.outsider); assert.equal((await fr()).whole, false, 'só duas coordenações não é o todo');
    await T.as(ids.admin);
    const allCoords = (await fr()).coords.filter(c => c.key !== 'MARCHER').map(c => ({ user_id: ids.outsider, coord_key: c.key, access_mode: 'read' }));
    await fw('save_access', { access: allCoords });
    await T.as(ids.outsider); assert.equal((await fr()).whole, true, 'todas as coordenações individualmente liberadas enxergam o todo');
    await T.as(ids.admin);
    await db.exec('reset role');
    console.log('FAT SQL: schema, regions, models, premises, calculation, read, write, integration, overlap, meta, context, clone, creation and review fixes passed.');
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exit(1); });
