// Importação do FAT e CPX na lista de formulários do cenário (popover). Os formulários de lançamento são cobertos em planning.browser.test.js.
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
        { id: 'fat', scenario_id: 'scenario', code: 'FAT', name: 'Vendas · Projeção de Faturamento', form_type: 'fat', status: 'released', revision: 1, access_mode: 'write' },
        { id: 'cpx', scenario_id: 'scenario', code: 'CPX', name: 'CAPEX · Investimentos', form_type: 'capex', status: 'released', revision: 1, access_mode: 'write' }
      ];
      const fixture = { version: 1, user_id: 'admin', is_admin: true, scenarios: [scenario], forms, months: Array.from({ length: 12 }, (_, i) => ({ reference_month: i + 1, source_type: 'forms' })),
        cost_centers: [], accounts: [], users: [], access: [], runs: [], lines: [], capex_enabled: true, capex_types: [] };
      window.calls = [];
      window.testModule = VECTON_PLANNING.createPlanningModule({ escapeHtml: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), MONTH_LABELS: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], state: { currentPeriod: { year: 2027 } }, resolveOrganizationId: async () => 'org', openScenarioDreReport: () => {},
        callSupabaseRpc: async (name, args) => {
          calls.push({ name, args });
          if (name === 'planning_context') return JSON.parse(JSON.stringify(fixture));
          if (name === 'planning_fat_import') return window.importResult;
          return { ok: true };
        } });
      return testModule.open(document.getElementById('planning'), scenario, () => {}, { manage: true });
    });
    const buttons = page.locator('.pl-list-row [data-pl="import-form"]');
    assert.equal(await buttons.count(), 2, 'FAT e CPX mostram o botão Importar');
    // CPX: botão sem ação
    await buttons.nth(0).click();
    assert.equal(await page.locator('.pl-import-pop').count(), 0, 'CPX não abre popover');
    // FAT: popover com o template da carga de planejado vendas
    await buttons.nth(1).click();
    assert.equal(await page.locator('.pl-import-pop').count(), 1);
    if (process.env.PLANNING_EXCELJS_LIB) {
      await page.addScriptTag({ path: process.env.PLANNING_EXCELJS_LIB });
      const ExcelJS = require(path.dirname(path.dirname(process.env.PLANNING_EXCELJS_LIB)));
      const send = async rows => {
        const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Meta Vendas'); rows.forEach(r => ws.addRow(r));
        await page.locator('.pl-import-pop [data-imp="file"]').setInputFiles({ name: 'fat.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(await wb.xlsx.writeBuffer()) });
        await page.locator('.pl-import-pop [data-imp="upload"]').click();
      };
      const text = () => page.locator('.pl-import-pop [data-imp="status"]').innerText();
      await page.evaluate(() => { window.importResult = { ok: true, replaced: 0, inserted: 2 }; });
      await send([['cod_produto', 'mes', 'territorio', 'quantidade', 'valor', 'MC1%'], ['0400007', 9, 'SP', 1, '78.863,91', 0.477], ['105132', 10, null, null, 1000, null]]);
      await page.waitForFunction(() => /0 valor\(es\) substituído\(s\) e 2 incluído\(s\)/.test(document.querySelector('.pl-import-pop [data-imp="status"]').innerText));
      assert.deepEqual(await page.evaluate(() => calls.filter(c => c.name === 'planning_fat_import').pop().args.p_rows), [
        { row: 2, cod_produto: '0400007', month: '9', territorio: 'SP', quantidade: '1', valor: '78863.91', mc1: '0.477' },
        { row: 3, cod_produto: '105132', month: '10', territorio: '', quantidade: null, valor: '1000', mc1: null }]);
      await page.evaluate(() => { window.importResult = { ok: false, errors: [{ row: 2, message: 'Linha 2: produto 9 não cadastrado' }] }; });
      await send([['cod_produto', 'mes'], ['9', 1]]);
      await page.waitForFunction(() => /1 erro\(s\) e nada foi importado[\s\S]*Linha 2: produto 9 não cadastrado/.test(document.querySelector('.pl-import-pop [data-imp="status"]').innerText));
      await send([['cod_produto', 'quantidade'], ['9', 1]]);
      await page.waitForFunction(() => /Faltam colunas no cabeçalho: mes/.test(document.querySelector('.pl-import-pop [data-imp="status"]').innerText));
      assert.match(await text(), /Baixe o template e use-o como base/);
    }
    assert.deepEqual(errors, []);
    console.log('Planning import browser: FAT import popover, CPX inert, status panel passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
