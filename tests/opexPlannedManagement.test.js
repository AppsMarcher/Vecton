const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const renderer = app.slice(app.indexOf('function renderOpexScenario('), app.indexOf('const OPEX_STRUCTURE ='));
const filters = app.slice(app.indexOf('function buildOpexCcIdsFilter('), app.indexOf('// ─── OPEX DRILLDOWN'));
const callSites = app.match(/renderOpexScenario\(contentDiv, year, _opexBudgetSource\.slice\("scenario:"\.length\), selectedMgmt, partialMgmts\)/g);
assert.equal(callSites?.length, 2, 'both source changes and report rerenders must pass the selected management');
const centers = [
  { id: 'c1', number: '101', management: 'Comercial' },
  { id: 'c2', number: '102', management: 'Comercial' },
  { id: 'c3', number: '201', management: 'Industrial' }
];
const rows = [
  { cost_center_number: '101', amount: 100 },
  { cost_center_number: '102', amount: 20 },
  { cost_center_number: '201', amount: 900 },
  { cost_center_number: '999', amount: 5 }
];
let allowed = null, loader = () => Promise.resolve(rows);
const context = {
  state: { costCenters: centers }, opexHideZeros: false,
  normalizeCode: value => String(value || '').replace(/\D/g, ''),
  getAllowedCcNumbers: () => allowed,
  fetchScenarioLedgerForYear: (...args) => loader(...args),
  vpSkeletonTable: () => 'loading',
  initFloatingScrollbar: () => {}, initVerticalScrollBounds: () => {}, initAllReportTableResizers: () => {},
  buildOpexRealTableMarkup: scoped => JSON.stringify({ total: scoped.reduce((sum, row) => sum + row.amount, 0), count: scoped.length })
};
vm.createContext(context); vm.runInContext(filters + renderer, context);
const container = () => {
  const inner = { innerHTML: '' };
  return { inner, innerHTML: '', isConnected: true, querySelector: selector => selector === '#opex-budget-table-inner' ? inner : {} };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
async function run(management, partial = null) {
  const node = container(); context.renderOpexScenario(node, 2026, 'fcst-5-7', management, partial); await flush(); return JSON.parse(node.inner.innerHTML);
}
(async () => {
  assert.equal((await run('Comercial')).total, 120);
  assert.equal((await run('Industrial')).total, 900);
  assert.equal((await run('Marcher')).total, 1025);
  assert.equal((await run('Engenharia')).count, 0, 'unknown management must not fall back to consolidated data');
  assert.equal((await run('Comercial', new Map([['Comercial', ['c2']]]))).total, 20);
  allowed = new Set(['102', '201']);
  assert.equal((await run('Comercial')).total, 20, 'selected management intersects permissions, not their union');
  assert.equal((await run('Industrial')).total, 900);
  assert.equal((await run('Marcher')).total, 920, 'permission scope still restricts consolidated calls');
  assert.equal((await run('Comercial', new Map([['Comercial', ['c1']]]))).count, 0);
  allowed = null;
  const pending = new Map();
  loader = scenario => new Promise((resolve, reject) => pending.set(scenario, { resolve, reject }));
  const node = container();
  context.renderOpexScenario(node, 2026, 'old', 'Industrial');
  context.renderOpexScenario(node, 2026, 'new', 'Comercial');
  pending.get('new').resolve(rows); await flush();
  const latest = node.inner.innerHTML;
  pending.get('old').resolve(rows); await flush();
  assert.equal(node.inner.innerHTML, latest, 'late old responses must not overwrite the current filter');
  context.renderOpexScenario(node, 2026, 'old-error', 'Industrial');
  context.renderOpexScenario(node, 2026, 'latest', 'Comercial');
  pending.get('latest').resolve(rows); await flush();
  pending.get('old-error').reject(new Error('old error')); await flush();
  assert.equal(node.inner.innerHTML, latest, 'late errors must not replace successful current data');
  context.renderOpexScenario(node, 2026, 'detached', 'Industrial');
  node.isConnected = false; node.inner.innerHTML = 'unchanged'; pending.get('detached').resolve(rows); await flush();
  assert.equal(node.inner.innerHTML, 'unchanged');
  assert.equal(rows.length, 4, 'cached scenario rows must remain unchanged across management switches');
  console.log('OPEX Planejado: Comercial, Industrial, Marcher, empty management, partial permissions and response races passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
