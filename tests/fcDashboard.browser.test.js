const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { matrix } = require('./fixtures/fcDashboardSource');
const library = process.env.FC_XLSX_TEST_LIB || require.resolve('xlsx');
const XLSX = require(library);
const rows = matrix();
const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'FC 2026');
const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('http://localhost/fc-dashboard', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><body style="height:auto;overflow:auto"><main style="padding:24px"><div id="test-header">Referência: Ago/2026</div><div id="report"></div></main></body></html>' }));
    await page.goto('http://localhost/fc-dashboard');
    for (const f of ['styles.css', 'src/modules/cashflow/fcDashboard.css']) await page.addStyleTag({ path: path.join(__dirname, '..', f) });
    await page.addScriptTag({ path: library });
    for (const f of ['fcStructure', 'fcModel', 'fcExport', 'fcDashboard']) await page.addScriptTag({ path: path.join(__dirname, '../src/modules/cashflow', f + '.js') });
    await page.evaluate(rows => {
      window.fixtureReport = window.VECTON_FC_MODEL.parseMatrix(rows,2026,new Date(2026,8,21));
      window.period = { year: 2026, month: 8 }; window.allowed = true; window.user = 'a';
      window.fc = window.VECTON_FC_DASHBOARD.createDashboard({
        escapeHtml: v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
        service: { load: async year => window.user === "a" && year === 2026 ? { report: window.fixtureReport, batch: { file_name: "FC-teste.xlsx", applied_at: "2026-09-21T12:00:00Z" } } : null },
        getPeriod: () => window.period, getUserId: () => window.user, canAccess: () => window.allowed, isActive: () => true
      });
      window.draw = () => window.fc.renderSelected(document.querySelector('#report'), 'cashFlow'); window.draw();
    }, rows.map(row => row.map(v => v instanceof Date ? (v.getMonth()+1)+"/"+v.getFullYear() : v)));
    await page.waitForSelector('[data-fc-curve]', {timeout:3000});
    assert.equal(await page.locator('[data-fc-curve]').count(), 11);
    assert.equal(await page.locator('[data-forecast-zone]').count(), 4);
    assert.equal(await page.locator('.fc-simulation-bar').count(),0);
    assert.equal(await page.locator('.fc-header-controls [data-fc-scenario]').count(),1);
    assert.match(await page.locator('[data-fc-rank]').last().innerText(), /Demais saídas/);
    await page.locator('.fc-trend svg').focus();
    await page.keyboard.press('ArrowRight');
    assert.match(await page.locator('.fc-chart-tip').innerText(), /Fev · Real/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.fc-chart-tip').isVisible(), false);
    assert.equal(await page.locator('.fc-trend .fc-svg-value').count(), 0);
    assert.equal(await page.locator('.fc-dashboard').getByText('Comparativo', { exact: true }).count(), 0);
    await page.locator('[data-fc-detail]').click();
    assert.equal(await page.locator('.fc-detail-scroll thead th').count(), 14);
    assert.equal(await page.locator('.fc-detail-analytic').count(), 76);
    assert.match(await page.locator('.fc-detail-scroll thead').innerText(), /Dez\s+Bud/);
    await page.locator('[data-fc-back]').click();
    await page.evaluate(() => { window.period.month = 10; window.draw(); });
    await page.locator('[data-fc-period="month"]').click();
    assert.equal(await page.locator('[data-fc-curve]').count(), 1);
    assert.equal((await page.locator('.fc-kpi strong').first().innerText()).includes('—'), false);
    await page.locator('[data-fc-period="YTD"]').click();
    assert.equal(await page.locator('[data-fc-curve]').count(), 9);
    await page.locator('[data-fc-period="year"]').click();
    await page.screenshot({ path: path.join(__dirname, '../artifacts/fc-dashboard-ui.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('.fc-trend svg').viewBox.baseVal.width < 450);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(__dirname, '../artifacts/fc-dashboard-ui-mobile.png'), fullPage: true });
    await page.locator('[data-fc-detail]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => { window.period.year = 2025; window.draw(); });
    assert.match(await page.locator('.fc-heading p').innerText(), /2025/);
    assert.equal(await page.locator('.fc-empty').count(), 0);
    await page.evaluate(() => { window.user = 'b'; window.period.year = 2026; window.draw(); });
    assert.match(await page.locator('.fc-load-status').innerText(), /Nenhuma carga/);
    await page.evaluate(() => { window.allowed = false; window.draw(); });
    assert.match(await page.locator('#report').innerText(), /não permite/);
    assert.deepEqual(errors, []);
    console.log('FC dashboard browser: persisted annual data, periods, annual chart, detail, tooltip, responsive layout and session isolation passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
