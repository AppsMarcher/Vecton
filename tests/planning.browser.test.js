const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLANNING_PLAYWRIGHT_LIB || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<main id="planning"></main>');
    await page.addScriptTag({ path: path.join(__dirname, '../src/modules/planning/planningCore.js') });
    await page.addScriptTag({ path: path.join(__dirname, '../src/modules/planning/planningModule.js') });
    await page.addStyleTag({ path: path.join(__dirname, '../src/modules/planning/planning.css') });
    await page.evaluate(() => {
      const scenario = { id: 'scenario', organization_id: 'org', planning_version: 1, name: 'Budget 2027', reference_year: 2027, status: 'open' };
      const form = { id: 'form', scenario_id: 'scenario', code: '01', name: 'Tecnologia', status: 'released', revision: 1, access_mode: 'write' };
      const fixture = {
        version: 1, user_id: 'writer', is_admin: true, scenarios: [scenario], forms: [form],
        months: Array.from({ length: 12 }, (_, i) => ({ reference_month: i + 1, source_type: 'forms' })),
        cost_centers: [{ id: 'cc', cost_center_name: 'TI', cost_center_number: '101' }],
        accounts: [{ id: 'account', account_number: '42201', account_name: 'Software' }], users: [{ user_id: 'writer', full_name: 'Gestor TI' }], access: [], runs: [],
        lines: [{ id: 'line', form_id: 'form', seq: 1, description: 'Software', origin: 'input', formula_name: 'SOFT', account_id: 'account', style: {} }, { id: 'total', form_id: 'form', seq: 2, description: 'Total', origin: 'formula', formula_name: 'TOTAL', formula_text: '<1>*2', style: {} }]
      };
      let entries = []; window.calls = [];
      window.fixture = fixture;
      window.testModule = VECTON_PLANNING.createPlanningModule({ escapeHtml: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), MONTH_LABELS: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], state: { currentPeriod: { year: 2027 } }, resolveOrganizationId: async () => 'org', openScenarioDreReport: () => {},
        callSupabaseRpc: async (name, args) => {
          calls.push({ name, args });
          if (name === 'planning_context') return JSON.parse(JSON.stringify(fixture));
          if (name === 'planning_read_form') return { entries: JSON.parse(JSON.stringify(entries)), copied: [] };
          if (args.p_action === 'save_entries') { entries = args.p_payload.cells.map(c => ({ ...c, reference_month: c.month, row_version: c.version + 1 })); return { ok: true }; }
          if (args.p_action === 'project') return { ok: true, rows_written: 1 };
          if (args.p_action === 'create') return { id: 'scenario' };
          return { ok: true };
        }
      });
      return testModule.open(document.getElementById('planning'), scenario, () => {});
    });
    await page.getByRole('button', { name: 'Abrir →', exact: true }).click();
    await page.getByRole('textbox', { name: 'Software Jan', exact: true }).fill('1.234,56');
    await page.getByRole('button', { name: 'Salvar valores', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Software Jan', exact: true }).inputValue(), '1.234,56');
    assert.equal(await page.locator('[data-value="total|0"]').innerText(), '2.469,12');
    await page.getByRole('button', { name: 'Integrar no DRE', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    assert.equal(await page.evaluate(() => calls.filter(c => c.args?.p_action === 'project').length), 1);
    await page.getByRole('button', { name: 'Acessos', exact: true }).click();
    assert.equal(await page.locator('[data-access]').count(), 1);
    // A read-only user receives no integration control or configuration tabs.
    await page.evaluate(async () => { fixture.is_admin = false; fixture.forms[0].access_mode = 'read'; await testModule.open(document.getElementById('planning'), fixture.scenarios[0], () => {}); });
    await page.getByRole('button', { name: 'Abrir →', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Integrar no DRE', exact: true }).count(), 0);
    assert.equal(await page.getByRole('textbox', { name: 'Software Jan', exact: true }).isDisabled(), true);
    // Wizard serializes the user's month choices, rather than a fixed 5+7 template.
    await page.evaluate(async () => { fixture.is_admin = true; await testModule.startWizard(document.getElementById('planning'), () => {}); });
    await page.getByLabel('Nome', { exact: true }).fill('Revisão');
    await page.getByRole('button', { name: 'Ícone 4', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar →', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar →', exact: true }).click();
    await page.getByRole('button', { name: 'Real até maio + formulários', exact: true }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continuar →', exact: true }).click();
    await page.getByRole('button', { name: 'Criar cenário', exact: true }).click();
    const created = await page.evaluate(() => calls.find(c => c.args?.p_action === 'create').args.p_payload);
    assert.equal(created.icon, 'vp-icon-dollar');
    assert.equal(created.forms.length, 0);
    assert.equal(created.months.filter(m => m.type === 'real').length, 5);
    assert.equal(created.months.filter(m => m.type === 'forms').length, 7);
    assert.deepEqual(errors, []);
    console.log('Planning browser: editable grid, first-click save, live formulas, publication, access modes and wizard passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
