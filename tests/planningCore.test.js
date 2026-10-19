const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../src/modules/planning/planningCore.js'), 'utf8'), sandbox);
const c = sandbox.window.VECTON_PLANNING_CORE;
const lines = [{ id: 'sum', origin: 'formula', formula_name: 'TOTAL', formula_text: '<SUB> * 2' },
  { id: 'a', origin: 'input', formula_name: 'A' }, { id: 'b', origin: 'input', formula_name: 'B' },
  { id: 'sub', origin: 'formula', formula_name: 'SUB', formula_text: '<A> + <B>' }];
assert.equal(c.compile(lines)(l => l.id === 'a' ? 10 : -3).sum, 14);
assert.throws(() => c.compile([...lines, { id: 'cycle', origin: 'formula', formula_name: 'C', formula_text: '<C>' }]), /circular/);
assert.throws(() => c.compile([{ id: 'x', origin: 'formula', formula_name: 'X', formula_text: '<MISSING>' }]), /inexistente/);
for (const text of ['window.alert(1)', '1 2', '<A>foo', '2(3)', '1+', '()', '1;2']) assert.throws(() => c.parseFormula(text), /inválida|ausente|incompleta/);
assert.throws(() => c.evaluate(c.parseFormula('1/(2-2)'), () => 0), /zero/);
assert.equal(c.evaluate(c.parseFormula('-(2+3)*4/2'), () => 0), -10);
assert.equal(c.parseAmount('1.234,56'), 1234.56);
assert.equal(c.parseAmount('-1234.56'), -1234.56);
assert.throws(() => c.parseAmount('12,345'), /inválido/);
assert.throws(() => c.parseAmount('1e7'), /casas/);
for (const value of [100, -100, 0.01, -0.01]) {
  const values = c.distribute(value, 7);
  assert.equal(values.reduce((n, v) => n + Math.round(v * 100), 0), Math.round(value * 100));
}
assert.equal(c.sourcePayload('real:2025').year, 2025);
console.log('Planning core: dependency ordering, grammar, cycles, arithmetic and cents passed.');
