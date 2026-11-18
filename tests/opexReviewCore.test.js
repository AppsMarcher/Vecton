const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/opexReview/opexReviewCore.js'), 'utf8'), context);
const C = context.window.VECTON_OPEX_REVIEW_CORE;
assert.equal(C.DEFAULT_THRESHOLDS.direction, 'over');
const T = { ...C.DEFAULT_THRESHOLDS, direction: 'both' };
const lvl = (actual, comparison) => C.classifyVariance({ actual, comparison }, T).level;
// direção "over": só acima da meta sinaliza; abaixo é sempre verde
const O = C.DEFAULT_THRESHOLDS;
const over = (actual, comparison) => C.classifyVariance({ actual, comparison }, O).level;
assert.equal(over(120000, 100000), 'red');
assert.equal(over(80000, 100000), 'green');
assert.equal(over(95, 100), 'green');
assert.equal(over(105, 100), 'yellow');
assert.equal(over(100, 100), 'green');
assert.equal(over(-1000, 0), 'green');
assert.equal(over(500, 0), 'red');
assert.equal(C.classifyVariance({ actual: 80000, comparison: 100000 }, O).pct, 20); // % continua informada
assert.equal(C.validateThresholds({ ...O, direction: 'x' }).ok, false);
const under = (actual, comparison) => C.classifyVariance({ actual, comparison }, { ...O, direction: 'under' }).level;
assert.equal(under(80000, 100000), 'red');
assert.equal(under(120000, 100000), 'green');
assert.equal(under(100, 100), 'green');
assert.equal(under(-500, 0), 'red');
assert.equal(under(500, 0), 'green');

// limites exatos (R$ e %)
assert.equal(lvl(120000, 100000), 'red');          // 20000,00 exatos
assert.equal(lvl(1019999.99, 1000000), 'yellow'); // 19999,99 e ~2%
assert.equal(lvl(1010000, 1000000), 'yellow');     // 10000 exatos, 1%
assert.equal(lvl(1009999.99, 1000000), 'green');
assert.equal(lvl(110, 100), 'red');                // 10% exatos, R$ 10
assert.equal(lvl(105, 100), 'yellow');             // 5% exatos
assert.equal(lvl(104.99, 100), 'green');
// OR e prioridade do vermelho
assert.equal(lvl(2000100, 2000000), 'green');
assert.equal(lvl(2020000, 2000000), 'red');        // R$ >= 20000 mesmo com 1%
assert.equal(lvl(1000010, 1000000), 'green');
// os dois sentidos
assert.equal(lvl(80000, 100000), 'red');
assert.equal(lvl(95, 100), 'yellow');
// denominador negativo usa valor absoluto
assert.equal(C.classifyVariance({ actual: -900, comparison: -1000 }, T).pct, 10);
assert.equal(lvl(-900, -1000), 'red');
// zero/zero, sem base, ausentes
assert.equal(lvl(0, 0), 'green');
const noBase = C.classifyVariance({ actual: 500, comparison: 0 }, T);
assert.equal(noBase.level, 'red'); assert.equal(noBase.noBase, true); assert.equal(noBase.pct, null);
assert.equal(lvl(null, 100), null); assert.equal(lvl(100, undefined), null); assert.equal(lvl(NaN, 100), null);
// centavos
const cents = C.classifyVariance({ actual: 20000.01, comparison: 0.01 }, T);
assert.equal(cents.level, 'red');

// thresholds
assert.equal(C.validateThresholds(T).ok, true);
assert.equal(C.validateThresholds({ ...T, redMoney: 9999 }).ok, false);
assert.equal(C.validateThresholds({ ...T, redPct: 4 }).ok, false);
assert.equal(C.validateThresholds({ ...T, yellowMoney: 0 }).ok, false);
assert.equal(C.validateThresholds({ ...T, yellowPct: -1 }).ok, false);
assert.equal(C.validateThresholds({ ...T, redMoney: Infinity }).ok, false);
assert.equal(C.validateThresholds({ ...T, redPct: NaN }).ok, false);
assert.equal(C.validateThresholds({ ...T, redMoney: T.yellowMoney }).ok, true);

// atraso
const act = (due, status) => ({ due_date: due, status });
assert.equal(C.isOverdue(act('2027-11-30', 'in_progress'), '2027-11-30'), false);
assert.equal(C.isOverdue(act('2027-11-29', 'in_progress'), '2027-11-30'), true);
assert.equal(C.isOverdue(act('2027-11-29', 'awaiting_ack'), '2027-11-30'), true);
assert.equal(C.isOverdue(act('2027-11-29', 'adjustments_requested'), '2027-11-30'), true);
assert.equal(C.isOverdue(act('2027-11-29', 'awaiting_validation'), '2027-11-30'), false);
assert.equal(C.isOverdue(act('2027-11-29', 'completed'), '2027-11-30'), false);
assert.equal(C.actionStatusLabel(act('2027-11-29', 'awaiting_ack'), '2027-11-30'), 'Aguardando ciência · atrasada');
assert.equal(C.actionStatusLabel(act('2027-12-01', 'in_progress'), '2027-11-30'), 'Em andamento');
assert.equal(C.actionStatusLabel(act('2027-11-29', 'completed'), '2027-11-30'), 'Concluída');

// chave de contexto
const ctx = { organizationId: 'o', costCenterId: 'c1', accountNumber: '0010', year: 2026, periodType: 'YTD', month: 9, sourceKey: 'scenario:x', sourceYear: 2026, scopeKey: '' };
assert.ok(C.contextKey(ctx).includes('0010'));
assert.notEqual(C.contextKey(ctx), C.contextKey({ ...ctx, costCenterId: 'c2' }));
assert.notEqual(C.contextKey(ctx), C.contextKey({ ...ctx, periodType: 'month' }));
assert.notEqual(C.contextKey(ctx), C.contextKey({ ...ctx, month: 10 }));
assert.notEqual(C.contextKey(ctx), C.contextKey({ ...ctx, sourceKey: 'scenario:y' }));
assert.equal(C.contextKey(ctx), C.contextKey({ ...ctx, groupName: 'Renomeado' }));

// transições
assert.equal(C.canTransition('awaiting_ack', 'ack'), true);
assert.equal(C.canTransition('in_progress', 'ack'), false);
assert.equal(C.canTransition('in_progress', 'submit'), true);
assert.equal(C.canTransition('adjustments_requested', 'submit'), true);
assert.equal(C.canTransition('awaiting_ack', 'submit'), false);
assert.equal(C.canTransition('awaiting_validation', 'validate'), true);
assert.equal(C.canTransition('awaiting_validation', 'return'), true);
assert.equal(C.canTransition('completed', 'validate'), false);
assert.equal(C.canTransition('completed', 'reassign'), false);
assert.equal(C.canTransition('in_progress', 'reassign'), true);
console.log('opexReviewCore: OK');
