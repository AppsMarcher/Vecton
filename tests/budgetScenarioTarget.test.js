const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// ── Helpers puros (src/core/scenarioSources.js) ─────────────────────────────
const sandbox = { window: {} };
vm.runInNewContext(read('src/core/scenarioSources.js'), sandbox);
const { loadTargetsForYear, pickDefaultLoadTarget } = sandbox.window.VECTON_SCENARIO_SOURCES;
const plain = (v) => JSON.parse(JSON.stringify(v));

const scenarios = [
  { id: 'f26', name: 'Fcst 5+7 2026', reference_year: 2026 },
  { id: 'b26', name: 'Budget 2026', reference_year: 2026 },
  { id: 'b27', name: 'Budget 2027', reference_year: 2027 }
];

assert.deepEqual(plain(loadTargetsForYear(scenarios, 2026).map((s) => s.id)), ['f26', 'b26']);
assert.deepEqual(plain(loadTargetsForYear(scenarios, 2030)), []);
assert.equal(pickDefaultLoadTarget(scenarios, 2026), 'b26', 'prefere o Budget do ano');
assert.equal(pickDefaultLoadTarget(scenarios, 2027), 'b27');
assert.equal(
  pickDefaultLoadTarget([{ id: 'x', name: 'Rev 1 2028', reference_year: 2028 }], 2028),
  'x',
  'sem Budget do ano, usa o primeiro cenário do ano'
);
assert.equal(pickDefaultLoadTarget(scenarios, 2030), '', 'sem cenário no ano, destino vazio');
assert.equal(loadTargetsForYear([{id:'built',reference_year:2026,planning_version:1,kind:'built'}],2026).length,0,'formulários não recebem carga direta');

// ── A tela de carga não oferece mais o "Budget" legado como destino ─────────
const budget = read('src/modules/budget/budgetModule.js');
assert.ok(!/<option value="budget">/.test(budget), 'sem <option value="budget"> na carga');
assert.ok(!/callSupabaseRpc\("apply_budget_import_batch"/.test(budget), 'carga não usa mais apply_budget_import_batch');
assert.ok(/hasScenarioDataForMonth/.test(budget), 'confirmação de sobrescrita por dados existentes');
assert.ok(/scenario_load_log/.test(budget), 'grava histórico simplificado da carga');

// ── Repositório de Cenários: nome com ano e sem card Budget fixo ────────────
const forecast = read('src/modules/forecast/forecastModule.js');
assert.ok(/withYearSuffix\(name, referenceYear\)/.test(forecast), 'createScenario grava o nome com o ano');
assert.ok(!/fc-budget-card/.test(forecast), 'sem card Budget fixo no repositório');
assert.ok(!/data-scenario-id="budget"/.test(forecast), 'sem card Budget fixo no repositório');

console.log('budgetScenarioTarget.test.js ok');
