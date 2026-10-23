const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const window = {};
vm.runInNewContext(fs.readFileSync('src/modules/balance/bpModel.js', 'utf8'), { window });
const M = window.VECTON_BP_MODEL;
const plan = [
  { id: 'root', parent_id: null, node_class: 'Sintetica', active: true },
  { id: 'group', parent_id: 'root', node_class: 'Sintetica', active: true },
  { id: 'cash', source_name: '1.1', parent_id: 'group', node_class: 'Analitica', active: true },
  { id: 'reducer', source_name: '1.2', parent_id: 'group', node_class: 'Analitica', active: true }
];
const rows = M.parse([M.headers, ['1.1', 'Caixa', '1.234,56'], ['1.2', 'Redutora', -20.1]], plan);
assert.equal(rows[0].account_id, 'cash');
assert.equal(rows[0].amount, 1234.56);
const sums = M.totals(plan, rows);
assert.equal(sums.get('root'), 1214.46);
assert.equal(sums.get('group'), 1214.46);
assert.equal(M.totals(plan, [{ account_id: 'cash', amount: 0.1 }, { account_id: 'reducer', amount: 0.2 }]).get('root'), 0.3);
for (const value of ['', 'abc', '1,234,56', '1.234', 'Infinity', NaN]) assert.throws(() => M.amount(value));
assert.throws(() => M.parse([M.headers, ['1.1', '', 1]], plan), /todas/);
assert.throws(() => M.parse([M.headers, ['1.1', '', 1], ['1.1', '', 2]], plan), /duplicada/);
assert.throws(() => M.parse([M.headers, ['missing', '', 1]], plan), /inexistente/);
assert.throws(() => M.parse([M.headers, ['1.1', '', null], ['1.2', '', 2]], plan), /saldo/);
assert.throws(() => M.parse([['Conta', 'Valor']], plan), /modelo BP/);
assert.throws(() => M.totals([{ id: 'loop', parent_id: 'loop' }], [{ account_id: 'loop', amount: 1 }]), /Ciclo/);
console.log('BP model: OK');
