const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '../src/modules/reports/reportsBuilderModule.js'), 'utf8');

// O Budget antigo não é mais uma fonte nem uma opção do seletor "Cenário".
assert.ok(!/budget_ledger_entries/.test(src), 'construtor não lê mais o ledger de Budget antigo');
assert.ok(!/id: "hc_budget"/.test(src) && !/id: "budget"/.test(src), 'DATA_SOURCES sem budget/hc_budget');
assert.ok(!/<option value="budget"/.test(src), 'seletor sem a opção fixa Budget');
assert.ok(!/loadType: "orcado"/.test(src), 'construtor não lê mais o headcount orçado antigo');

// Fontes legadas "budget"/"hc_budget" viram o cenário "Budget {ano}".
const start = src.indexOf('async function resolveLegacyBudgetSource');
const end = src.indexOf('async function fetchSourceYear');
assert.ok(start > 0 && end > start, 'resolveLegacyBudgetSource não encontrada');
const calls = [];
const context = {
  fetchScenariosForYear: async (year) => {
    calls.push(year);
    return year === 2026 ? [{ id: 'f26', name: 'Fcst 5+7 2026' }, { id: 'b26', name: 'Budget 2026' }] : [];
  }
};
vm.createContext(context);
vm.runInContext(src.slice(start, end), context);

(async () => {
  assert.equal(await context.resolveLegacyBudgetSource('budget', 2026), 'scenario:b26');
  assert.equal(await context.resolveLegacyBudgetSource('hc_budget', 2026), 'hcscenario:b26');
  assert.equal(await context.resolveLegacyBudgetSource('budget', 2027), null, 'sem Budget no ano -> sem fonte');
  assert.deepEqual([...calls], [2026, 2026, 2027]);
  console.log('reportsBuilderBudget.test.js ok');
})().catch((error) => { console.error(error); process.exitCode = 1; });
