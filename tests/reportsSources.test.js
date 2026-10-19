const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const begin = app.indexOf('// BEGIN rowsForSource');
const end = app.indexOf('// END rowsForSource');
assert.ok(begin >= 0 && end > begin, 'bloco rowsForSource não encontrado no app.js');
const block = app.slice(begin, end);

const scenarioSandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'src/core/scenarioSources.js'), 'utf8'), scenarioSandbox);

const calls = [];
const scenarioList = [
  { id: 's26', name: 'Fcst 5+7 2026', reference_year: 2026, is_default: true },
  { id: 'b27', name: 'Budget 2027', reference_year: 2027, is_default: false }
];
const context = {
  window: scenarioSandbox.window,
  reportsLedgerCache: new Map(),
  fetchAllScenarios: async () => scenarioList,
  fetchScenarioReportRowsForYear: async (id, year) => { calls.push(['scenarioRows', id, year]); return [{ id, year }]; },
  fetchActualsReportRowsForYear: async (year) => { calls.push(['realRows', year]); return [{ real: year }]; },
  fetchScenarioLedgerFullForYear: async (id, year) => { calls.push(['scenarioFull', id, year]); return []; },
  fetchActualsLedgerFullForYear: async (year) => { calls.push(['realFull', year]); return []; },
  fetchBudgetLedgerFullForYear: async (year) => { calls.push(['budgetFull', year]); return []; }
};
vm.createContext(context);
vm.runInContext(block, context);
const plain = (v) => JSON.parse(JSON.stringify(v));

(async () => {
  // Cenário de 2026 com o toggle em 2027: lê os dados do ANO DO CENÁRIO.
  let rows = await context.rowsForSource('scenario:s26', 2027);
  assert.deepEqual(calls.pop(), ['scenarioRows', 's26', 2026]);
  assert.deepEqual(plain(rows), [{ id: 's26', year: 2026 }]);

  // Real de outro ano: consulta o Real daquele ano, não o do toggle.
  rows = await context.rowsForSource('real:2026', 2027);
  assert.deepEqual(calls.pop(), ['realRows', 2026]);
  assert.deepEqual(plain(rows), [{ real: 2026 }]);

  // Real com cache do ano: não consulta de novo.
  context.reportsLedgerCache.set(2027, { rows: [{ cached: true }] });
  rows = await context.rowsForSource('real:2027', 2027);
  assert.equal(calls.length, 0);
  assert.deepEqual(plain(rows), [{ cached: true }]);

  // Valor legado "budget" vira "Budget {ano do toggle}".
  rows = await context.rowsForSource('budget', 2027);
  assert.deepEqual(calls.pop(), ['scenarioRows', 'b27', 2027]);

  // Legado sem Budget do ano: vazio, sem erro.
  rows = await context.rowsForSource('budget', 2030);
  assert.deepEqual(plain(rows), []);
  assert.equal(calls.length, 0);

  // Valor inválido: vazio.
  assert.deepEqual(plain(await context.rowsForSource('xyz', 2027)), []);

  // Ano da fonte
  assert.equal(await context.scenarioYearForSource('scenario:s26', 2027), 2026);
  assert.equal(await context.scenarioYearForSource('real:2025', 2027), 2025);
  assert.equal(await context.scenarioYearForSource('scenario:desconhecido', 2027), 2027);

  // Drilldown usa o ano da fonte, não o do toggle.
  await (await context.ledgerFullFetcherForSource('scenario:s26'))(2027);
  assert.deepEqual(calls.pop(), ['scenarioFull', 's26', 2026]);
  await (await context.ledgerFullFetcherForSource('real:2026'))(2027);
  assert.deepEqual(calls.pop(), ['realFull', 2026]);
  await (await context.ledgerFullFetcherForSource('real'))(2027);
  assert.deepEqual(calls.pop(), ['realFull', 2027]);

  console.log('reportsSources.test.js ok');
})().catch((error) => { console.error(error); process.exitCode = 1; });
