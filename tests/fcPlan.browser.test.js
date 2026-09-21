const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const seed = require('./fixtures/fcPlanSeed.json');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('http://localhost/fc-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><body style="height:auto;overflow:auto"><main style="padding:24px"><h2>Plano de Contas FC</h2><section id="fcPlan-view"></section></main></body></html>' }));
    await page.goto('http://localhost/fc-test');
    await page.addStyleTag({ path: path.join(__dirname, '../styles.css') });
    await page.addScriptTag({ path: path.join(__dirname, '../src/modules/params/fcPlanModule.js') });
    await page.evaluate(async seed => {
      window.rows = seed.map(n => ({ ...n, id: n.seed_key, parent_id: n.parent_key, organization_id: 'org', active: true }));
      window.failSave = false; window.admin = true; window.readCount = 0;
      window.mod = window.VECTON_FC_PLAN.createFcPlanModule({
        root: document.querySelector('#fcPlan-view'), isAdmin: () => window.admin,
        getCurrentUserId: () => 'user', getActiveView: () => 'fcPlan', resolveOrganizationId: async () => 'org',
        escapeHtml: v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
        fetch: async () => { window.readCount++; return structuredClone(window.rows); },
        insert: async row => { if (window.failSave) throw Error('Falha de gravação'); window.rows.push(row); return [structuredClone(row)]; },
        update: async (org, id, fields) => { if (window.failSave) throw Error('Falha de gravação'); const row = window.rows.find(n => n.id === id); Object.assign(row, fields); return [structuredClone(row)]; },
        remove: async (org, id) => { window.rows = window.rows.filter(n => n.id !== id); }, confirm: async () => true
      });
      await window.mod.render();
    }, seed);
    const field = name => page.locator(`#fc-plan-form [name="${name}"]`);
    assert.match(await page.locator('#fc-plan-status').innerText(), /76 contas analíticas/);
    assert.equal(await page.locator('.fc-plan-select').count(), 84);
    await page.locator('.fc-plan-select').filter({ hasText: /^COMISSOES DLL/ }).click();
    assert.equal(await field('parent_id').inputValue(), 'linha-30');
    assert.equal(await field('source_name').inputValue(), 'COMISSOES DLL');
    await page.locator('#fc-plan-search').fill('COMISSOES DLL');
    assert.equal(await page.locator('.fc-plan-select').count(), 4); // conta + 3 ancestrais
    await page.locator('#fc-plan-search').fill('');
    await page.locator('#fc-plan-add').click();
    await field('name').fill('Nova conta <teste>');
    await field('source_name').fill('CONTA TESTE');
    await field('parent_id').selectOption('financeiro');
    await page.locator('#fc-plan-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#fc-plan-status').textContent === 'Conta salva.');
    assert.equal(await page.locator('.fc-plan-select').count(), 85);
    await field('name').fill('Nome revisado');
    await page.evaluate(() => { window.failSave = true; });
    await page.locator('#fc-plan-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#fc-plan-status').textContent.includes('Falha de gravação'));
    assert.equal(await field('name').inputValue(), 'Nome revisado'); // não perde edição na falha
    assert.equal(await page.locator('.fc-plan-select').filter({ hasText: 'Nome revisado' }).count(), 0);
    await page.evaluate(() => { window.failSave = false; });
    await page.locator('#fc-plan-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#fc-plan-status').textContent === 'Conta salva.');
    await page.locator('#fc-plan-refresh').click();
    await page.waitForFunction(() => document.querySelector('#fc-plan-status').textContent.includes('77 contas analíticas'));
    assert.equal(await field('name').inputValue(), 'Nome revisado');
    await page.locator('#fc-plan-delete').click();
    await page.waitForFunction(() => document.querySelector('#fc-plan-status').textContent === 'Conta removida.');
    assert.equal(await page.locator('.fc-plan-select').count(), 84);
    await page.locator('.fc-plan-select').filter({ has: page.locator('strong', { hasText: /^COMISSOES$/ }) }).click();
    await page.locator('#fc-plan-delete').click();
    assert.match(await page.locator('#fc-plan-status').innerText(), /filhas/);
    await page.locator('.fc-plan-select').filter({ has: page.locator('strong', { hasText: /^MATERIAL DE SEGURANCA - PRODUCAO$/ }) }).locator('..').dragTo(page.locator('.fc-plan-select').filter({ has: page.locator('strong', { hasText: /^COMISSOES$/ }) }).locator('..'), { sourcePosition: { x: 4, y: 10 }, targetPosition: { x: 4, y: 10 } });
    await page.waitForFunction(() => window.rows.find(n => n.id === 'linha-29').parent_id === 'linha-30', null, {timeout:3000});
    await field('parent_id').selectOption('saidas');
    await page.locator('#fc-plan-form button[type="submit"]').click();
    await page.waitForFunction(() => window.rows.find(n => n.id === 'linha-29').parent_id === 'saidas');
    await page.screenshot({ path: path.join(__dirname, '../artifacts/fc-plan-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(__dirname, '../artifacts/fc-plan-mobile.png'), fullPage: true });
    await page.evaluate(async () => { window.admin = false; await window.mod.render(); });
    assert.match(await page.locator('#fcPlan-view').innerText(), /Acesso restrito/);
    assert.equal(await page.locator('.fc-plan-select').count(), 0);
    assert.deepEqual(errors, []);
    console.log('FC browser: CRUD, search, parent, drag/drop, failed save, reload, responsive layout and access checks passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
