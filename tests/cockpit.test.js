const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'src/modules/cockpit/cockpitAggregate.js'), 'utf8'), context);
const D = context.window.VECTON_COCKPIT_DATA;
const { buildSource } = require('./fixtures/cockpitSource.js').TEST_COCKPIT_SOURCE;
const filters = { management: 'Controladoria', year: 2026, month: 9, periodType: 'YTD' };
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.00001, `${a} != ${b}`);
for (const management of ['Controladoria', 'Industrial', 'Comercial']) {
  for (const periodType of ['month', 'YTD', 'year']) {
    const data = D.aggregate({ ...filters, management, periodType }, buildSource(management));
    close(data.expenseGroups.reduce((s, r) => s + r.actual, 0), data.opex.actual);
    close(data.expenseGroups.reduce((s, r) => s + r.budget, 0), data.opex.budget);
    close(data.headcountByArea.reduce((s, r) => s + r.actual, 0), data.headcount.actual);
    close(data.headcountByArea.reduce((s, r) => s + r.budget, 0), data.headcount.budget);
    close(data.headcountByArea.reduce((s, r) => s + r.opex, 0), data.opex.actual);
    close(data.expenseComposition.reduce((s, r) => s + r.share, 0), 1);
    close(data.opexPerHeadcount.actual, data.opex.actual / (periodType === 'month' ? 1 : periodType === 'year' ? 12 : 9) / data.headcount.average);
    assert.equal(data.monthlyOpex[9].actual, null);
    assert.ok(data.topOpexDeviations.every((r, i, rows) => !i || Math.abs(rows[i - 1].variance) >= Math.abs(r.variance)));
  }
}
const source = buildSource();
const ytd = D.aggregate(filters, source);
close(ytd.opex.actual, 49500);
close(ytd.headcount.average, 32 / 9);
close(ytd.opexPerHeadcount.actual, 49500 / 32);
close(ytd.efficiencyIndicators[0].value, 49500 / 900000);
close(D.aggregate({ ...filters, periodType: 'year' }, source).opex.actual, 49500 + (11000 + 12100 + 13200) + 1800);
const missing = buildSource();
missing.actualRows = missing.actualRows.filter(row => row.reference_month !== 4);
assert.equal(D.aggregate(filters, missing).opex.actual, null);
assert.equal(D.aggregate(filters, missing).topOpexDeviations.length, 0);
const missingHc = buildSource();
missingHc.headcountRows = missingHc.headcountRows.filter(row => row.reference_month !== 4);
assert.equal(D.aggregate(filters, missingHc).opexPerHeadcount.actual, null);
assert.equal(D.aggregate(filters, { ...source, actualRows: [], comparisonRows: [], headcountRows: [], comparisonHeadcountRows: [] }), null);
assert.equal(D.aggregate(filters, { ...source, hasForecast: false }).opex.forecast, null);
close(D.aggregate({ ...filters, management: 'Marcher' }, source).headcountByArea[0].actual, 4);
(async () => {
  let calls = 0;
  const service = D.createService(async () => { calls++; return null; });
  await Promise.all([service.load(filters), service.load(filters)]);
  assert.equal(calls, 1, 'concurrent identical requests should share a loader');
  const browser = await chromium.launch({ headless: true, channel: process.env.COCKPIT_BROWSER_CHANNEL || "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1400 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '').replace('class="auth-only"', '');
    await page.setContent(html);
    await page.addStyleTag({ path: path.join(root, 'styles.css') });
    for (const file of ['cockpitAggregate', 'cockpitFormat', 'cockpitWidgets', 'cockpitModule']) await page.addScriptTag({ path: path.join(root, `src/modules/cockpit/${file}.js`) });
    await page.addScriptTag({ path: path.join(root, 'tests/fixtures/cockpitSource.js') });
    await page.evaluate(() => {
      document.querySelector('#auth-shell').classList.remove('active');
      document.querySelector('#market-ticker').hidden = true;
      document.querySelector('#view-kicker').textContent = 'Módulo Vecton';
      document.querySelector('#view-title').textContent = 'Controladoria e Finanças';
      document.querySelector('#period-trigger-label').textContent = 'Set/2026';
      document.querySelector('#dashboard-view').classList.remove('active');
      document.querySelector('#cockpit-view').classList.add('active');
      document.querySelector('.header-select:not(.header-select-small)')?.remove();
      window.testPeriod = { year: 2026, month: 9 };
      window.testMode = 'normal';
      window.testView = 'cockpit';
      window.testModule = VECTON_COCKPIT.createCockpitModule({
        getActiveView: () => testView, getPeriod: () => testPeriod, canAccess: () => true,
        getManagementAccess: selected => ({ options: ['Controladoria', 'Industrial', 'Comercial'], selected, locked: false }),
        service: VECTON_COCKPIT_DATA.createService(async filters => {
          if (testMode === 'error') throw new Error('test');
          await new Promise(resolve => setTimeout(resolve, filters.management === 'Comercial' ? 100 : 10));
          return filters.year === 2026 ? { ...VECTON_COCKPIT_DATA.aggregate(filters, TEST_COCKPIT_SOURCE.buildSource(filters.management)), source: 'test' } : null;
        })
      });
      testModule.render();
    });
    await page.waitForSelector('.cockpit-areas-panel .cockpit-table');
    assert.equal(await page.locator('[aria-label="Gestão"]').count(), 1);
    assert.equal(await page.locator('.cockpit-kpis .kpi-card').count(), 4);
    await page.selectOption('[aria-label="Gestão"]', 'Comercial');
    await page.selectOption('[aria-label="Gestão"]', 'Industrial');
    await page.waitForTimeout(140);
    assert.match(await page.locator('.cockpit-kpis').innerText(), /Industrial/);
    assert.match(await page.locator('[data-cockpit-widget="areas"]').innerText(), /Produção/);
    await page.locator('.cockpit-trend g[tabindex]').first().focus();
    assert.match(await page.locator('#cockpit-tip').innerText(), /Real.*Forecast favorito.*%/s);
    await page.selectOption('[aria-label="Gestão"]', 'Controladoria');
    await page.waitForTimeout(30);
    await page.screenshot({ path: path.join(root, 'artifacts/cockpit-desktop.png'), fullPage: false });
    await page.evaluate(async () => { testPeriod.year = 2025; await testModule.render(); });
    assert.match(await page.locator('.cockpit-status').innerText(), /Nenhum dado disponível/);
    await page.evaluate(async () => { testMode = 'error'; testPeriod.year = 2026; await testModule.render(); });
    assert.match(await page.locator('.cockpit-status').innerText(), /Não foi possível/);
    await page.addScriptTag({ path: path.join(root, 'tests/fixtures/cockpitSource.js') });
    await page.evaluate(() => { testMode = 'normal'; });
    await page.click('[data-cockpit-retry]');
    await page.waitForSelector('.cockpit-areas-panel .cockpit-table');
    await page.setViewportSize({ width: 390, height: 2400 });
    await page.addScriptTag({ path: path.join(root, 'tests/fixtures/cockpitSource.js') });
    await page.evaluate(() => {
      const host = document.createElement('div'); host.id = 'vmob-screen'; document.body.append(host);
      window.savedPickerParent = document.querySelector('.period-picker').parentNode;
      document.querySelector('.app-layout').style.display = 'none';
      testModule.mount(host);
    });
    await page.waitForTimeout(30);
    assert.equal(await page.locator('#vmob-screen [aria-label="Gestão"]').count(), 1);
    assert.equal(await page.locator('#vmob-screen .period-picker').count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile must not overflow the viewport');
    await page.screenshot({ path: path.join(root, 'artifacts/cockpit-mobile.png'), fullPage: false });
    await page.evaluate(() => testModule.unmount());
    assert.ok(await page.evaluate(() => document.querySelector('.period-picker').parentNode === savedPickerParent));
    assert.deepEqual(errors, []);
    console.log('Cockpit: aggregates, filter races, error/retry, empty, keyboard tooltips, desktop/mobile and mount lifecycle passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
