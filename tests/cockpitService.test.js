const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildSource } = require('./fixtures/cockpitSource.js').TEST_COCKPIT_SOURCE;
const context = { window: {} };
for (const file of ['cockpitAggregate', 'cockpitService']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../src/modules/cockpit/${file}.js`), 'utf8'), context);
const filters = { management: 'Controladoria', year: 2026, month: 9, periodType: 'YTD' }, source = buildSource();
let favorite = { id: 'favorite-1', name: 'Revisão setembro' }, organization = 'org-a', user = 'user-a', failTable = '', missingHc = false, noTotals = false;
const calls = [];
const deps = {
  isConfigured: () => true, resolveOrganizationId: async () => organization, getSessionKey: () => user,
  getState: () => ({ costCenters: source.costCenters, dreNodes: source.accountNames }),
  getOpexStructure: () => [{ groups: source.groups.map(group => ({ label: group.name, accounts: group.accounts })) }],
  getPersonnelAccounts: () => new Set(['101']), getRevenueAccounts: () => ['301', '302'],
  getManagementAccess: selected => ({ options: ['Controladoria'], selected, centers: [source.costCenters[0]] }),
  isMissingRelationError: error => error.message === 'missing relation',
  buildDreReport: (year, rows) => ({ receitaLiquida: Array.from({ length: 12 }, (_, i) => -rows.filter(row => row.reference_month === i + 1).reduce((total, row) => total + Number(row.amount), 0)) }),
  readRows: async (table, query) => {
    calls.push({ table, query }); assert.match(query, new RegExp(`organization_id=eq.${organization}`));
    if (table === failTable) throw new Error('403 forbidden');
    if (table === 'forecast_scenarios') return favorite ? [favorite] : [];
    if (table === 'forecast_headcount_entries' && missingHc) throw new Error('missing relation');
    const decoded = decodeURIComponent(query);
    if (table.endsWith('monthly_account_totals')) {
      assert.ok(!decoded.includes('cost_center'));
      return noTotals ? [] : Array.from({ length: 12 }, (_, i) => ({ account_number: '301', reference_month: i + 1, total_amount: -100000 }));
    }
    if (table.endsWith('ledger_entries') && decoded.includes('"301"')) {
      assert.ok(!decoded.includes('cost_center'), 'revenue fallback must not transfer CC detail');
      return Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, account_number: '301', reference_month: i + 1, amount: -100000 }));
    }
    if (table.endsWith('ledger_entries')) {
      assert.ok(decoded.includes('cost_center_id.in.("cc1")'));
      assert.ok(decoded.includes('cost_center_number.in.("100")'));
      assert.ok(!decoded.includes('"cc2"'), 'partial access must restrict queries');
      // Deliberately overbroad response checks the additional client-side scope guard.
      return table === 'actuals_ledger_entries' ? source.actualRows : source.comparisonRows;
    }
    assert.ok(decoded.includes('cost_center_number=in.("100")'));
    assert.ok(!decoded.includes('matricula') && !decoded.includes('colab'), 'counting requires no PII');
    return table === 'headcount_entries' && decoded.includes('load_type=eq.realizado') ? source.headcountRows : source.comparisonHeadcountRows;
  }
};
(async () => {
  const service = context.window.VECTON_COCKPIT_SERVICE.createCockpitService(deps);
  const first = await service.load(filters);
  assert.equal(first.source, 'supabase'); assert.equal(first.comparisonLabel, 'Revisão setembro');
  assert.equal(first.opex.actual, 45000); assert.equal(first.headcount.actual, 2);
  assert.equal(first.headcountByArea.length, 1); assert.equal(first.headcountByArea[0].opex, first.opex.actual);
  assert.equal(first.efficiencyIndicators[0].value, 45000 / 900000);
  const count = calls.length;
  await Promise.all([service.load({ ...filters, month: 8 }), service.load({ ...filters, periodType: 'month' })]);
  assert.equal(calls.length, count, 'filters reuse year sources');
  await assert.rejects(service.load({ ...filters, management: 'Industrial' }), /não autorizada/); assert.equal(calls.length, count);
  favorite = { id: 'favorite-2', name: 'Nova revisão' }; service.invalidate();
  assert.equal((await service.load(filters)).comparisonLabel, 'Nova revisão');
  assert.ok(calls.some(call => call.query.includes('scenario_id=eq.favorite-2')));
  favorite = null; service.invalidate();
  const budget = await service.load(filters); assert.equal(budget.comparisonLabel, 'Budget'); assert.equal(budget.opex.forecast, null);
  assert.ok(calls.some(call => call.query.includes('load_type=eq.orcado')));
  organization = 'org-b'; user = 'user-b'; const before = calls.length; await service.load(filters); assert.ok(calls.length > before);
  failTable = 'actuals_ledger_entries'; service.invalidate(); await assert.rejects(service.load(filters), /403 forbidden/);
  failTable = ''; favorite = { id: 'favorite-3', name: 'Revisão' }; missingHc = true; service.invalidate();
  const missing = await service.load(filters); assert.equal(missing.headcount.budget, null); assert.equal(missing.opex.actual, 45000);
  noTotals = true; service.invalidate(); assert.equal((await service.load(filters)).efficiencyIndicators[0].value, 45000 / 900000);
  console.log('Cockpit service: favorite, scope, PII, cache, sessions, missing HC, revenue fallback and errors passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
