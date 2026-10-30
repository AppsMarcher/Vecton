// Integração com conflito entre o formulário 04 e o CPX: o administrador zera os valores em conflito e integra; os demais só são informados.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLANNING_PLAYWRIGHT_LIB || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<main id="planning"></main>');
    for (const f of ['reports/opexCcPicker', 'planning/planningCore', 'planning/planningFatCore', 'planning/planningFatViews', 'planning/planningImportModule', 'planning/planningViews', 'planning/planningModule', 'planning/planningFatModule'])
      await page.addScriptTag({ path: path.join(__dirname, `../src/modules/${f}.js`) });
    await page.addStyleTag({ path: path.join(__dirname, '../src/modules/planning/planning.css') });
    await page.evaluate(() => {
      const scenario = { id: 'scenario', organization_id: 'org', planning_version: 1, name: 'Budget 2027', reference_year: 2027, status: 'open' };
      const forms = [
        { id: 'f04', scenario_id: 'scenario', code: '04', name: 'Depreciação | Amortização', form_type: 'opex', status: 'released', revision: 1, access_mode: 'write' },
        { id: 'cpx', scenario_id: 'scenario', code: 'CPX', name: 'CAPEX · Investimentos', form_type: 'capex', status: 'released', revision: 1, access_mode: 'write' }];
      window.fixture = { version: 1, user_id: 'admin', is_admin: true, scenarios: [scenario], forms, months: Array.from({ length: 12 }, (_, i) => ({ reference_month: i + 1, source_type: 'forms' })),
        cost_centers: [{ id: 'cc', cost_center_name: 'ADM', cost_center_number: '10001' }], accounts: [], users: [], access: [], runs: [], lines: [], capex_enabled: true, capex_types: [] };
      window.calls = []; window.cpxOverlap = [];
      window.testModule = VECTON_PLANNING.createPlanningModule({ escapeHtml: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), MONTH_LABELS: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], state: { currentPeriod: { year: 2027 } }, resolveOrganizationId: async () => 'org', openScenarioDreReport: () => {},
        callSupabaseRpc: async (name, args) => {
          calls.push({ name, args });
          if (name === 'planning_context') return JSON.parse(JSON.stringify(fixture));
          if (name === 'planning_read_form') return { entries: [], copied: [] };
          if (name === 'planning_fat_overlap') return [];
          if (name === 'planning_capex_overlap') return window.cpxOverlap;
          if (name === 'planning_zero_conflicts') return 2;
          if (name === 'planning_integrate_all') return { ok: true, rows_written: 1, notes: [] };
          return { ok: true };
        } });
      return testModule.open(document.getElementById('planning'), fixture.scenarios[0], () => {}, { manage: true });
    });
    const conflict = [{ account_number: '42301001', account_name: 'DEPRECIACAO ADM.', form_code: '04', form_name: 'Depreciação | Amortização', cost_center_number: '10001', months: [2, 3, 4, 5] }];
    const names = () => page.evaluate(() => calls.map(c => c.name));
    const open04 = async () => { await page.getByRole('button', { name: 'Abrir →', exact: true }).first().click(); await page.getByRole('button', { name: 'Integrar no DRE e OPEX', exact: true }).click(); };

    // sem conflito: confirma e integra, sem zerar nada
    await open04();
    assert.equal(await page.getByRole('button', { name: 'Confirmar', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await page.waitForFunction(() => calls.some(c => c.name === 'planning_integrate_all'));
    assert.equal((await names()).includes('planning_zero_conflicts'), false, 'sem conflito não zera');

    // com conflito, administrador: o botão diz o que acontece e zera antes de integrar
    await page.evaluate(c => { window.cpxOverlap = c; calls.length = 0; }, conflict);
    await page.locator('[data-pl="index"]').click();
    await open04();
    const text = await page.locator('dialog[open]').innerText();
    assert.match(text, /04 · Depreciação \| Amortização/);
    assert.match(text, /serão zerados no formulário de origem/);
    assert.equal(await page.getByRole('button', { name: 'Integrar mesmo assim' }).count(), 0, 'o "mesmo assim" deixou de existir');
    await page.getByRole('button', { name: 'Zerar estes valores e integrar', exact: true }).click();
    await page.waitForFunction(() => calls.some(c => c.name === 'planning_integrate_all'));
    const order = (await names()).filter(n => n === 'planning_zero_conflicts' || n === 'planning_integrate_all');
    assert.deepEqual(order, ['planning_zero_conflicts', 'planning_integrate_all'], 'zera e depois integra');
    assert.equal(await page.evaluate(() => calls.find(c => c.name === 'planning_zero_conflicts').args.p_scenario), 'scenario');

    // com conflito, quem não é administrador: só é informado e não integra
    await page.evaluate(() => { fixture.is_admin = false; calls.length = 0; });
    await page.evaluate(() => testModule.open(document.getElementById('planning'), fixture.scenarios[0], () => {}, { manage: false }));
    await open04();
    const info = await page.locator('dialog[open]').innerText();
    assert.match(info, /Peça a um administrador/);
    assert.equal(await page.getByRole('button', { name: 'Zerar estes valores e integrar' }).count(), 0);
    await page.getByRole('button', { name: 'Entendi', exact: true }).click();
    assert.equal((await names()).includes('planning_integrate_all'), false, 'não integra');
    assert.deepEqual(errors, []);
    console.log('Planning import (integração com conflito): zerar e integrar, sem "mesmo assim", não administrador só informado passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
