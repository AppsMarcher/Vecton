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
      await send([['mes', 'territorio', 'cod_produto', 'Quantidade', 'Valor'], [9, 'SP', '0400007', 1, '78.863,91'], [10, null, '105132', null, 1000]]);
      await page.waitForFunction(() => /0 valor\(es\) substituído\(s\) e 2 incluído\(s\)/.test(document.querySelector('.pl-import-pop [data-imp="status"]').innerText));
      assert.deepEqual(await page.evaluate(() => calls.filter(c => c.name === 'planning_fat_import').pop().args.p_rows), [
        { row: 2, cod_produto: '0400007', month: '9', territorio: 'SP', quantidade: '1', valor: '78863.91' },
        { row: 3, cod_produto: '105132', month: '10', territorio: '', quantidade: null, valor: '1000' }]);
      await page.evaluate(() => { window.importResult = { ok: false, errors: [{ row: 2, message: 'Linha 2: produto 9 não cadastrado' }] }; });
      await send([['mes', 'cod_produto'], [1, '9']]);
      await page.waitForFunction(() => /1 erro\(s\) e nada foi importado[\s\S]*Linha 2: produto 9 não cadastrado/.test(document.querySelector('.pl-import-pop [data-imp="status"]').innerText));
      await send([['cod_produto', 'Quantidade'], ['9', 1]]);
      await page.waitForFunction(() => /Faltam colunas no cabeçalho: mes/.test(document.querySelector('.pl-import-pop [data-imp="status"]').innerText));
      assert.match(await text(), /Baixe o template e use-o como base/);
    }
    // Aviso de integração: diz de qual formulário vem cada valor e cabe na janela, sem rolagem horizontal.
    const overlap = await page.evaluate(() => {
      const views = VECTON_PLANNING_FAT_VIEWS.createFatViews({ escapeHtml: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), months: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] });
      const dialog = document.createElement('dialog'); dialog.className = 'pl-dialog'; document.body.appendChild(dialog);
      dialog.innerHTML = views.overlapModal([
        { account_number: '42301001', account_name: 'DEPRECIACAO DE MAQUINAS E EQUIPAMENTOS DA PRODUCAO INDUSTRIAL', form_code: '04', form_name: 'Depreciação | Amortização', cost_center_number: '1101', months: [2, 3, 4, 5] },
        { account_number: '31101001', account_name: 'VENDA DE MAQUINAS - NACIONAL', form_code: '08', form_name: 'Faturamento | Impostos | Matéria-prima', cost_center_number: null, months: [1] }], 'CPX');
      dialog.showModal();
      return { text: dialog.innerText, tables: dialog.querySelectorAll('table').length, overflow: dialog.scrollWidth > dialog.clientWidth };
    });
    assert.match(overlap.text, /04 · Depreciação \| Amortização/);
    assert.match(overlap.text, /42301001/);
    assert.match(overlap.text, /centro de custo 1101/);
    assert.match(overlap.text, /Fev, Mar, Abr, Mai/);
    assert.match(overlap.text, /08 · Faturamento[\s\S]*sem centro de custo/);
    assert.match(overlap.text, /CPX prevalece/);
    assert.equal(overlap.tables, 0, 'sem tabela larga no aviso');
    assert.equal(overlap.overflow, false, 'sem rolagem horizontal no diálogo');
    assert.deepEqual(errors, []);
    console.log('Planning import browser: FAT import popover, CPX inert, status panel passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
