const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLANNING_PLAYWRIGHT_LIB || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<main id="planning"></main>');
    await page.addScriptTag({ path: path.join(__dirname, '../src/modules/reports/opexCcPicker.js') });
    await page.addScriptTag({ path: path.join(__dirname, '../src/modules/planning/planningCore.js') });
    await page.addScriptTag({ path: path.join(__dirname, '../src/modules/planning/planningFatCore.js') });
    await page.addScriptTag({ path: path.join(__dirname, '../src/modules/planning/planningFatViews.js') });
    await page.addScriptTag({ path: path.join(__dirname, '../src/modules/planning/planningImportModule.js') });
    await page.addScriptTag({ path: path.join(__dirname, '../src/modules/planning/planningViews.js') });
    await page.addScriptTag({ path: path.join(__dirname, '../src/modules/planning/planningModule.js') });
    await page.addScriptTag({ path: path.join(__dirname, '../src/modules/planning/planningFatModule.js') });
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
          if (name === 'planning_import_entries') return window.importResult;
          if (name === 'planning_key_conflicts') return window.keyConflicts || [];
          if (name === 'planning_read_form') return { entries: JSON.parse(JSON.stringify(entries)), copied: [] };
          if (args.p_action === 'save_entries') { entries = args.p_payload.cells.map(c => ({ ...c, reference_month: c.month, row_version: c.version + 1 })); return { ok: true }; }
          if (name === 'planning_integrate_all') return { ok: true, rows_written: 1, notes: [] };
          if (args.p_action === 'project') return { ok: true, rows_written: 1 };
          if (args.p_action === 'create') return { id: 'scenario' };
          return { ok: true };
        }
      });
      return testModule.open(document.getElementById('planning'), scenario, () => {}, { manage: true });
    });
    // Sem centro de custo: o administrador desmarca todos os centros e lança valores sem centro de custo.
    await page.getByRole('button', { name: 'Abrir →', exact: true }).click();
    await page.locator('.opex-cc-trigger').click();
    await page.locator('.opex-cc-pop input[data-all]').uncheck();
    assert.match(await page.locator('.opex-cc-pop .opex-cc-count').innerText(), /sem centro de custo/i);
    await page.locator('.opex-cc-pop [data-apply]').click();
    await page.waitForFunction(() => calls.some(c => c.name === 'planning_read_form' && c.args.p_cc_ids.length === 0));
    assert.equal(await page.locator('.opex-cc-trigger').innerText(), 'Sem centro de custo');
    const noCcCell = page.getByRole('textbox', { name: 'Software Jan', exact: true });
    assert.equal(await noCcCell.isDisabled(), false, 'grade editável sem centro de custo');
    await noCcCell.fill('10'); await noCcCell.blur();
    await page.getByRole('button', { name: 'Salvar valores', exact: true }).click();
    await page.getByRole('button', { name: 'Entendi', exact: true }).click();
    assert.equal(await page.evaluate(() => calls.filter(c => c.args?.p_action === 'save_entries').pop().args.p_payload.cells[0].cost_center_id), null);
    // Conflito com o FAT/CPX: o aviso bloqueia o salvamento.
    await noCcCell.fill('20'); await noCcCell.blur();
    await page.evaluate(() => { window.keyConflicts = [{ account_number: '42201', month: 1, cost_center_number: null, source: 'FAT' }]; window.savesBefore = calls.filter(c => c.args?.p_action === 'save_entries').length; });
    await page.getByRole('button', { name: 'Salvar valores', exact: true }).click();
    assert.match(await page.locator('dialog').innerText(), /FAT e o CPX prevalecem[\s\S]*Conta 42201 · Jan · sem centro de custo · alimentado pelo FAT/);
    assert.equal(await page.evaluate(() => calls.filter(c => c.args?.p_action === 'save_entries').length === savesBefore), true, 'nada foi salvo');
    await page.getByRole('button', { name: 'Entendi', exact: true }).click();
    await page.evaluate(() => { window.keyConflicts = []; });
    await page.getByRole('button', { name: 'Descartar', exact: true }).click();
    await page.locator('[data-pl="index"]').click();
    // Importar: popover com template, seleção e envio; o envio só confere o arquivo e informa o status.
    await page.getByRole('button', { name: 'Importar', exact: true }).click();
    assert.equal(await page.locator('.pl-import-pop [data-imp="template"]').count(), 1);
    assert.equal(await page.locator('.pl-import-pop [data-imp="pick"]').count(), 1);
    assert.equal(await page.locator('.pl-import-pop [data-imp="upload"]').isDisabled(), true);
    assert.match(await page.locator('.pl-import-pop [data-imp="status"]').innerText(), /Baixe o template/);
    await page.locator('.pl-import-pop [data-imp="file"]').setInputFiles({ name: 'x.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('nao e excel') });
    assert.equal(await page.locator('.pl-import-pop [data-imp="upload"]').isDisabled(), false);
    await page.locator('.pl-import-pop [data-imp="upload"]').click();
    await page.waitForFunction(() => /Não foi possível importar|indisponível/.test(document.querySelector('.pl-import-pop [data-imp="status"]').innerText));
    if (process.env.PLANNING_EXCELJS_LIB) {
      await page.addScriptTag({ path: process.env.PLANNING_EXCELJS_LIB });
      const ExcelJS = require(path.dirname(path.dirname(process.env.PLANNING_EXCELJS_LIB)));
      const book = async rows => { const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('x'); rows.forEach(r => ws.addRow(r)); return Buffer.from(await wb.xlsx.writeBuffer()); };
      const send = async rows => { await page.locator('.pl-import-pop [data-imp="file"]').setInputFiles({ name: 'a.xlsx', mimeType: 'application/octet-stream', buffer: await book(rows) }); await page.locator('.pl-import-pop [data-imp="upload"]').click(); };
      const status = () => page.locator('.pl-import-pop [data-imp="status"]');
      await send([['Conta', 'Valor'], ['42201', 1]]);
      await page.waitForFunction(() => /Faltam colunas no cabeçalho: Mês/.test(document.querySelector('.pl-import-pop [data-imp="status"]').innerText));
      await page.evaluate(() => { window.importResult = { ok: true, replaced: 1, inserted: 2 }; });
      await send([['conta', 'MÊS', 'valor', 'centro de custo'], ['42201', 1, '1.234,56', '101'], [], ['42201', '02', 10, null]]);
      await page.waitForFunction(() => /1 valor\(es\) substituído\(s\) e 2 incluído\(s\)/.test(document.querySelector('.pl-import-pop [data-imp="status"]').innerText));
      assert.deepEqual(await page.evaluate(() => calls.filter(c => c.name === 'planning_import_entries').pop().args.p_rows),
        [{ row: 2, account: '42201', month: '1', amount: '1234.56', cost_center: '101' }, { row: 4, account: '42201', month: '02', amount: '10', cost_center: null }]);
      await page.evaluate(() => { window.importResult = { ok: true, replaced: 0, inserted: 1 }; });
      { const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('x'); ws.addRow(['Conta', 'Mês', 'Valor']); ws.addRow(['42201', 1, { formula: '10*12', result: 120 }]);
        await page.locator('.pl-import-pop [data-imp="file"]').setInputFiles({ name: 'f.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(await wb.xlsx.writeBuffer()) }); await page.locator('.pl-import-pop [data-imp="upload"]').click(); }
      await page.waitForFunction(() => /0 valor\(es\) substituído\(s\) e 1 incluído\(s\)/.test(document.querySelector('.pl-import-pop [data-imp="status"]').innerText));
      assert.equal(await page.evaluate(() => calls.filter(c => c.name === 'planning_import_entries').pop().args.p_rows[0].amount), '120', 'célula com fórmula usa o resultado');
      await page.evaluate(() => { window.importResult = { ok: false, errors: [{ row: 3, message: 'Linha 3: conta 9 não cadastrada' }] }; });
      await send([['Conta', 'Mês', 'Valor'], ['9', 1, 5]]);
      await page.waitForFunction(() => /1 erro\(s\) e nada foi importado[\s\S]*Linha 3: conta 9 não cadastrada/.test(document.querySelector('.pl-import-pop [data-imp="status"]').innerText));
      assert.match(await status().innerText(), /Corrija as linhas indicadas/);
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.pl-import-pop').count(), 0);
    await page.getByRole('button', { name: 'Abrir →', exact: true }).click();
    await page.getByRole('textbox', { name: 'Software Jan', exact: true }).fill('1.234,56');
    await page.getByRole('button', { name: 'Salvar valores', exact: true }).click();
    await page.getByRole('button', { name: 'Entendi', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Software Jan', exact: true }).inputValue(), '1.234,56');
    assert.equal(await page.locator('[data-value="total|0"]').innerText(), '2.469,12');
    await page.getByRole('button', { name: 'Integrar no DRE e OPEX', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    assert.equal(await page.evaluate(() => calls.filter(c => c.name === 'planning_integrate_all').length), 1);
    // Mudar a sequência de uma linha não invalida as fórmulas que a usam (renumeradas junto).
    await page.getByRole('button', { name: 'Estrutura', exact: true }).click();
    await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
    await page.locator('#pl-line-seq').fill('5');
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    assert.equal(await page.evaluate(() => calls.filter(c => c.args?.p_action === 'save_line').map(c => c.args.p_payload.seq)[0]), 5);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.getByRole('button', { name: 'Acessos', exact: true }).click();
    assert.equal(await page.locator('[data-access]').count(), 1);
    // A read-only user receives no integration control or configuration tabs.
    await page.evaluate(async () => { fixture.is_admin = false; fixture.forms[0].access_mode = 'read'; await testModule.open(document.getElementById('planning'), fixture.scenarios[0], () => {}); });
    await page.getByRole('button', { name: 'Abrir →', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Integrar no DRE e OPEX', exact: true }).count(), 0);
    assert.equal(await page.getByRole('textbox', { name: 'Software Jan', exact: true }).isDisabled(), true);
    // Wizard serializes the user's month choices, from the chosen start month.
    await page.evaluate(async () => { fixture.is_admin = true; await testModule.startWizard(document.getElementById('planning'), () => {}); });
    await page.getByLabel('Nome', { exact: true }).fill('Revisão');
    await page.getByRole('button', { name: 'Ícone 4', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar →', exact: true }).click();
    await page.locator('#pl-from').selectOption('6');
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Continuar →', exact: true }).click();
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
