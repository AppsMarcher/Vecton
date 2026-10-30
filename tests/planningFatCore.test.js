const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../src/modules/planning/planningFatCore.js'), 'utf8'), sandbox);
const c = sandbox.window.VECTON_PLANNING_FAT_CORE;
const maq = { ipi: 0, icms: 4.1, pis: 1, cofins: 4.8 }, pec = { ipi: 1.92, icms: 5.64, pis: 1.62, cofins: 7.46 };
const prem = { fat_unit: 53000, mp_unit: 25400 };
const J = x => JSON.parse(JSON.stringify(x));

// percentuais
assert.equal(Number(c.taxSum(maq).toFixed(4)), 9.9);
assert.equal(Number(c.taxSum(pec).toFixed(4)), 16.64);

// célula de máquina: os mesmos números do SQL
const m = c.cell(prem, maq, 8);
assert.deepEqual([m.q, m.fat, Math.round(m.rl), m.mp], [8, 424000, 382024, 203200]);
assert.deepEqual(J(c.cell(null, maq, 8)), { q: 8, fat: 0, rl: 0, mp: 0, qp: 0 }, 'sem premissa o volume conta em VOL, mas não tem valor');
assert.equal(c.metric(c.add(c.cell(null, maq, 8), m), 'fat'), 53000, 'volume sem premissa não dilui o FAT por unidade');
assert.equal(c.metric(c.add(c.cell(null, maq, 8), m), 'vol'), 16);
assert.deepEqual(J(c.cell(prem, maq, 0)), { q: 0, fat: 0, rl: 0, mp: 0, qp: 0 });

// Exportação: sem impostos, RL = FAT
const ex = c.cell(prem, maq, 8, { exportation: true });
assert.equal(ex.rl, ex.fat);

// Peças: VOL = 1, o volume digitado é o FAT; RL pelos percentuais e MP pelo MP/FAT
const p = c.cell({ fat_unit: 1, mp_unit: 0.364 }, pec, 330000, { fatDriven: true });
assert.equal(p.q, 1); assert.equal(p.fat, 330000); assert.equal(Math.round(p.rl), 275088); assert.equal(Math.round(p.mp), 120120);

// métricas: valores unitários; MC1% do total usa a soma de RL e MP
assert.equal(c.metric(m, 'vol'), 8); assert.equal(c.metric(m, 'fat'), 53000); assert.equal(Math.round(c.metric(m, 'rl')), 47753); assert.equal(c.metric(m, 'mp'), 25400);
assert.equal(c.metric({ q: 0, fat: 0, rl: 0, mp: 0 }, 'fat'), null, 'sem volume não há valor unitário');
assert.equal(c.metric({ q: 0, fat: 0, rl: 0, mp: 0 }, 'mb'), null);
const a = c.cell({ fat_unit: 100, mp_unit: 50 }, { ipi: 0, icms: 0, pis: 0, cofins: 0 }, 1);
const b = c.cell({ fat_unit: 100, mp_unit: 90 }, { ipi: 0, icms: 0, pis: 0, cofins: 0 }, 3);
const sum = c.add(a, b);
assert.deepEqual([sum.q, sum.fat, sum.rl, sum.mp], [4, 400, 400, 320]);
assert.equal(c.mc1(sum), (400 - 320) / 400, 'MC1% sobre os totais, não a média das MC1%');
assert.notEqual(c.mc1(sum), (c.mc1(a) + c.mc1(b)) / 2);
assert.equal(c.add(a, b) !== a, true, 'add não altera os argumentos'); assert.equal(a.q, 1);

// premissa efetiva: ajuste do admin, depois local, depois Marcher
const rp = (local, marcher) => J(c.resolvePremise(local, marcher));
const marcher = { fat_unit: 51000, mp_unit: 24000, origin: 'marcher' };
assert.deepEqual(rp({ fat_unit: 60000, mp_unit: 25400, adjusted: true, origin: 'local' }, marcher), { fat_unit: 60000, mp_unit: 25400, origin: 'adjusted' });
assert.deepEqual(rp({ fat_unit: 53000, mp_unit: 25400, adjusted: false, origin: 'local' }, marcher), { fat_unit: 53000, mp_unit: 25400, origin: 'local' });
assert.deepEqual(rp(null, marcher), { fat_unit: 51000, mp_unit: 24000, origin: 'marcher' });
assert.deepEqual(rp(null, null), { fat_unit: null, mp_unit: null, origin: null });

// terceiro bloco: Transgrain em 31101007, Exportação em 31101002, e RL = Σ FAT − Σ impostos
const z = () => Array.from({ length: 12 }, () => ({ q: 0, fat: 0, rl: 0, mp: 0 }));
const parts = { maq: z(), tra: z(), exp: z(), pec: z() };
parts.maq[0] = c.cell(prem, maq, 8);
parts.tra[0] = c.cell({ fat_unit: 62000, mp_unit: 33000 }, maq, 1);
parts.exp[1] = c.cell(prem, maq, 8, { exportation: true });
parts.pec[0] = p;
const d = c.dreLines(parts, { maq, tra: maq, pec });
assert.equal(d.accounts['31101001'][0], 424000);
assert.equal(d.accounts['31101007'][0], 62000);
assert.equal(d.accounts['31101002'][1], 424000);
assert.equal(d.accounts['31101006'][0], 330000);
assert.equal(Math.round(d.accounts['31203002'][0]), Math.round(424000 * 0.041 + 62000 * 0.041 + 330000 * 0.0564));
assert.equal(d.accounts['31203002'][1], 0, 'Exportação não tem imposto');
const imp = ['31203001', '31203002', '31203004', '31203005'].reduce((s, k) => s + d.accounts[k][0], 0);
assert.equal(Math.round(d.rl[0]), Math.round(424000 + 62000 + 330000 - imp));
assert.equal(Math.round(d.rl[0]), Math.round(m.rl + c.cell({ fat_unit: 62000, mp_unit: 33000 }, maq, 1).rl + p.rl), 'o bloco fecha com a grade');
assert.equal(d.rl[1], 424000);
assert.equal(Math.round(d.mp[0]), 203200 + 33000 + 120120);
assert.equal(d.mpPct[2], null, 'mês sem receita não tem % MP/RL');
console.log('FAT core: taxes, cells, metrics, premises and DRE block passed.');
