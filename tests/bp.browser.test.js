const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const XLSX = require(process.env.BP_XLSX_TEST_LIB || '../artifacts/bp-test-deps/node_modules/xlsx');
const plan = [
  { id: 'a', account_code: '1', name: 'Ativo', node_class: 'Sintetica', parent_id: null, active: true, sort_order: 10, seed_key: 'ativo' },
  { id: 'c', account_code: '1.1', group_key: 'Caixa e equivalente de Caixa', name: 'Caixa', source_name: '1.1', node_class: 'Analitica', parent_id: 'a', active: true, sort_order: 10 },
  { id: 'p', account_code: '2', name: 'Passivo e Patrimônio Líquido', node_class: 'Sintetica', parent_id: null, active: true, sort_order: 20, seed_key: 'passivo-pl' },
  { id: 's', account_code: '2.1', group_key: 'Capital Subscrito e Realizado', name: 'Capital', source_name: '2.1', node_class: 'Analitica', parent_id: 'p', active: true, sort_order: 10 }
];
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('http://localhost/bp-test', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><main style="padding:24px"><h2>Balanço Patrimonial</h2><section id="plan"></section><section id="load"></section><section id="report"></section></main></body></html>' }));
    await page.goto('http://localhost/bp-test');
    for (const file of ['styles.css', 'src/modules/balance/bp.css', 'src/styles/appearance.css']) await page.addStyleTag({ path: path.resolve(file) });
    await page.addScriptTag({ path: require.resolve(process.env.BP_XLSX_BROWSER_LIB || '../artifacts/bp-test-deps/node_modules/xlsx/dist/xlsx.full.min.js') });
    for (const file of ['src/modules/params/bpPlanModule.js', 'src/modules/balance/bpModel.js', 'src/modules/balance/bpReportModel.js', 'src/modules/balance/bpReportModule.js', 'src/modules/balance/bpModule.js']) await page.addScriptTag({ path: path.resolve(file) });
    await page.evaluate(()=>document.documentElement.dataset.vectonTheme='clear');
    await page.evaluate(async plan => {
      window.plan = plan; window.admin = true; window.active = 'bpPlan'; window.calls = []; window.fail = false; window.dbDrafts=[]; window.dbFinals=[]; window.user = 'admin'; window.period = { year: 2026, month: 2 };
      const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      window.planModule = window.VECTON_BP_PLAN.createBpPlanModule({ root: document.querySelector('#plan'), escapeHtml: esc, isAdmin: () => window.admin, getCurrentUserId: () => window.user, getActiveView: () => window.active,
        resolveOrganizationId: async () => 'org', fetch: async () => structuredClone(window.plan), confirm: async () => true,
        update: async (org, id, fields) => { Object.assign(window.plan.find(n => n.id === id), fields); return [window.plan.find(n => n.id === id)]; }, insert: async row => { window.plan.push(row); return [row]; }, remove: async () => {} });
      window.mod = window.VECTON_BP.createModule({ root: document.querySelector('#load'), escapeHtml: esc, isAdmin: () => window.admin, getUserId: () => window.user, getPeriod: () => window.period, getActiveView: () => window.active,
        resolveOrganizationId: async () => 'org', getDreResult: async () => 0, confirm: async () => window.confirmResult !== false, canSeeReport: () => window.admin, isReportActive: () => window.active === 'reports', navigate: view => { window.active = view; void window.mod.renderLoad(); },
        fetch: async (table, query) => { if (/offset=1000/.test(query)) return []; if (table === 'bp_plan_nodes') return structuredClone(window.plan); if (table === 'branches') return [{ id: 'branch', code: '01', name: 'Matriz' }]; if (table === 'forecast_scenarios') return [{ id: 'scenario', name: 'Budget 2026' }];
          if(table==='bp_import_drafts')return structuredClone(window.dbDrafts.filter(x=>!query.includes('&id=eq.')||query.includes('&id=eq.'+x.id+'&'))); if(table==='bp_import_batches'&&window.active==='bpLoad')return structuredClone(window.dbFinals.filter(x=>!query.includes('&id=eq.')||query.includes('&id=eq.'+x.id+'&'))); if (table === 'bp_import_batches' && query.includes('superseded_at=is.null')) return [
            { branch_id: 'branch', reference_year: 2026, reference_month: 2, rows: [{ account_id: 'c', amount: 200 }, { account_id: 's', amount: 200 }] },
            { branch_id: 'branch', reference_year: 2025, reference_month: 12, rows: [{ account_id: 'c', amount: 100 }, { account_id: 's', amount: 200 }] }
          ]; return []; },
        rpc: async (name,payload)=>{
          if(name==='bp_save_draft'){const existing=window.dbDrafts.find(x=>x.id===payload.p_id);if(existing){existing.input_rows=payload.p_rows;existing.revision++;return existing.id;}const id='draft'+(Date.now());window.dbDrafts.push({id,organization_id:'org',reference_year:payload.p_year,reference_month:payload.p_month,source_type:payload.p_source,scenario_id:payload.p_scenario,file_name:payload.p_file,plan_snapshot:payload.p_plan,input_rows:payload.p_rows,revision:1,updated_at:new Date().toISOString()});window.calls.push(payload);return id;}
          if(name==='bp_apply_draft'){if(window.fail)throw Error('Falha simulada');const draft=window.dbDrafts.find(x=>x.id===payload.p_id);const id='final'+Date.now();window.dbFinals=window.dbFinals.filter(x=>x.source_type!==draft.source_type);window.dbFinals.push({...draft,id,rows:draft.input_rows,applied_at:new Date().toISOString()});window.dbDrafts=[];return id;}
          if(name==='bp_delete_batch'){window.dbDrafts=window.dbDrafts.filter(x=>x.id!==payload.p_id);window.dbFinals=window.dbFinals.filter(x=>x.id!==payload.p_id);return null;}
        }
      });
      await window.planModule.render();
    }, plan);
    assert.equal(await page.locator('.bp-plan-select').count(), 4);
    await page.locator('.bp-plan-select').filter({ hasText: /^1.1 · Caixa/ }).click();
    await page.locator('#bp-plan-form [name="name"]').fill('Caixa e Bancos');
    await page.locator('#bp-plan-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('[data-status]').textContent === 'Conta salva.');
    await page.evaluate(() => { document.querySelector('#plan').hidden = true; window.mod.open(false); });
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-template]').click()]);
    const template = XLSX.readFile(await download.path());
    const templateRows = XLSX.utils.sheet_to_json(template.Sheets.BP, { header: 1 });
    assert.deepEqual(templateRows[0], ['CONTA', 'NOME DA CONTA', 'SALDO', 'TIPO_CONTA', 'CHAVE-AGRUPADORA']);
    assert.equal(templateRows[1][0], '1');
    assert.equal(templateRows[2][0], '1.1');
    assert.equal(templateRows[2][3], 'ANALITICA');
    assert.equal(await page.locator('#load select[name="branch"]').count(), 0);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['CONTA', 'NOME DA CONTA', 'SALDO', 'TIPO_CONTA'], ['1','ATIVO',9999,'SINTETICA'], ['1.1', 'Caixa', 200,'ANALITICA'], ['2','PASSIVO',9999,'SINTETICA'], ['2.1', 'Capital', 200,'ANALITICA']]), 'Balancete');
    const file = { name: 'bp.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) };
    await page.locator('#load input[type="file"]').setInputFiles(file);
    await page.evaluate(()=>{window.confirmResult=false;});
    await page.locator('#load button[type="submit"]').click();
    assert.equal(await page.evaluate(()=>window.dbDrafts.length+window.dbFinals.length),0);
    await page.evaluate(()=>{window.confirmResult=true;window.fail=true;});
    await page.locator('#load button[type="submit"]').click();
    await page.locator('[data-apply]').waitFor();
    assert.match(await page.locator('[data-feedback]').innerText(), /não foi possível confirmar a aplicação automática/);
    assert.equal(await page.locator('[data-feedback]').evaluate(el=>el.classList.contains('is-error')),true);
    assert.equal(await page.evaluate(()=>window.dbDrafts.length),1);
    await page.evaluate(() => { window.fail = true; });
    await page.locator('[data-apply]').click();
    await page.waitForFunction(() => document.querySelector('[data-feedback]').textContent === 'Falha simulada');
    assert.equal(await page.locator('[data-apply]').isEnabled(), true);
    await page.evaluate(() => { window.fail = false; });
    await page.locator('[data-apply]').click();
    await page.waitForFunction(() => document.querySelector('[data-feedback]')?.textContent === 'Lote aplicado. O lote substituído foi excluído.');
    assert.equal(await page.evaluate(() => window.calls[0].p_source), 'actual');
    assert.equal(await page.evaluate(() => window.calls[0].p_scenario), null);
    assert.equal(await page.evaluate(() => window.calls[0].p_rows.length), 2);
    await page.screenshot({ path: 'artifacts/bp/load-actual-ready.png', fullPage: true });
    await page.locator('#load [data-search]').fill('Capital');assert.equal(await page.locator('[data-rows] tr').count(),1);
    await page.locator('#load [data-search]').fill('');
    await page.locator('#load [data-add]').click();await page.locator('[data-edit="0"]').waitFor();
    await page.locator('[data-edit="0"]').click();await page.locator('[data-editor] input[name="amount"]').fill('250,25');
    await page.locator('[data-editor] button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-feedback]').textContent==='Lançamento salvo.');
    await page.locator('[data-apply]').click();await page.waitForFunction(()=>document.querySelector('[data-feedback]').textContent.startsWith('Lote aplicado.'));
    assert.equal(await page.evaluate(()=>window.dbFinals.filter(x=>x.source_type==='actual').length),1);
    await page.screenshot({path:'artifacts/bp/load-actual-ready.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'artifacts/bp/load-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(() => window.mod.open(true));
    await page.locator('#load select[name="scenario"]').selectOption('scenario');
    await page.locator('#load input[type="file"]').setInputFiles(file);
    await page.locator('#load button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-feedback]')?.textContent==='Arquivo importado e lote aplicado automaticamente.');
    await page.waitForFunction(() => window.calls.some(x=>x.p_source==='planned'));
    assert.equal(await page.evaluate(() => window.calls.find(x=>x.p_source==='planned').p_source), 'planned');
    assert.equal(await page.evaluate(() => window.calls.find(x=>x.p_source==='planned').p_scenario), 'scenario');
    assert.equal(await page.locator('[data-apply]').count(),0);
    assert.equal(await page.evaluate(()=>window.dbDrafts.length),0);
    await page.locator('[data-manual]').click();await page.locator('#load [data-add]').waitFor();
    assert.equal(await page.locator('[data-apply]').isDisabled(),true);
    await page.locator('#load [data-add]').click();await page.locator('[data-editor] select[name="account"]').selectOption('c');await page.locator('[data-editor] input[name="amount"]').fill('0');
    await page.locator('[data-editor] button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-feedback]').textContent==='Lançamento salvo.');
    assert.equal(await page.locator('[data-apply]').isDisabled(),false);
    await page.locator('#load [data-delete]').click();await page.waitForFunction(()=>document.querySelector('[data-feedback]').textContent==='Lote excluído.');
    assert.equal(await page.evaluate(()=>window.dbDrafts.length),0);
    await page.evaluate(() => { document.querySelector('#load').hidden = true; window.active = 'reports'; window.mod.renderSelected(document.querySelector('#report'), 'balanceSheetReal'); });
    await page.waitForFunction(() => document.querySelector('.bp-statement-grid table'));
    assert.match(await page.locator('.bp-statement-grid').innerText(), /Caixa e equivalente de Caixa/);
    assert.match(await page.locator('.bp-statement-grid').innerText(), /100/);
    assert.match(await page.locator('.bp-statement-grid').innerText(), /200/);
    fs.mkdirSync('artifacts/bp', { recursive: true });
    await page.screenshot({ path: 'artifacts/bp/report-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: 'artifacts/bp/report-mobile.png', fullPage: true });
    await page.evaluate(async () => { document.querySelector('#report').hidden = true; document.querySelector('#load').hidden = false; window.active = 'bpLoad'; window.admin = false; await window.mod.renderLoad(); });
    assert.match(await page.locator('#load').innerText(), /restrito/);
    assert.deepEqual(errors, []);
    console.log('BP browser: plan editor, real Excel, retry, actual/planned destinations, report and access OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
