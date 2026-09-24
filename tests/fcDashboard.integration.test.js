const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { matrix } = require('./fixtures/fcDashboardSource');
const library = process.env.FC_XLSX_TEST_LIB || require.resolve('xlsx');
const XLSX = require(library);
const { PGlite } = require(process.env.FC_PGLITE_TEST_LIB || '@electric-sql/pglite');
const org = '10000000-0000-4000-8000-000000000001', otherOrg = '10000000-0000-4000-8000-000000000002';
const admin = '20000000-0000-4000-8000-000000000001', analyst = '20000000-0000-4000-8000-000000000002';
const repo = path.resolve(__dirname, '..');
(async () => {
  const db = new PGlite();
    await db.exec(`create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create table public.organizations(id uuid primary key);
      create table public.user_profiles(organization_id uuid,user_id uuid,is_active boolean,access_role text,additional_access_roles text[] default '{}',extra_report_ids text[] default '{}');
      create function public.is_org_member(target uuid) returns boolean language sql stable security definer as $$select exists(select 1 from user_profiles where organization_id=target and user_id=auth.uid() and is_active)$$;
      insert into auth.users values('${admin}'),('${analyst}'); insert into organizations values('${org}'),('${otherOrg}');
      insert into user_profiles(organization_id,user_id,is_active,access_role) values('${org}','${admin}',true,'admin'),('${org}','${analyst}',true,'analyst');
      select set_config('test.user','${admin}',false);`);
    for (const file of ['219_fc_chart_of_accounts.sql','221_fc_annual_import.sql','222_fc_scenarios.sql','223_fc_shared_scenarios.sql','224_fc_scenario_name_limit.sql','225_fc_delete_scenario.sql']) await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));

  const server = http.createServer((req,res) => {
    const file = path.resolve(repo, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(repo + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (url.includes('/rest/v1/')) {
        const u = new URL(url), endpoint = u.pathname.split('/').pop();
        try {
          let result = [];
          if(endpoint==='delete_fc_scenario') {const b=route.request().postDataJSON();await db.query('select delete_fc_scenario($1,$2)',[b.target_org,b.target_id]);result=null;}
          else if(endpoint==='save_fc_scenario') {const b=route.request().postDataJSON(); result=(await db.query('select save_fc_scenario($1,$2::jsonb) as id',[b.target_org,JSON.stringify(b.payload)])).rows[0].id;}
          else if(endpoint==='fc_scenarios') {const id=u.searchParams.get('id');result=(await db.query(id?'select * from fc_scenarios where id=$1':'select * from fc_scenarios where reference_year=$1 order by created_at desc',[id?id.slice(3):Number(u.searchParams.get('reference_year').slice(3))])).rows;}
          else if (endpoint === 'fc_import_context' || endpoint === 'apply_fc_annual_import') {
            const body = route.request().postDataJSON();
            const query = endpoint === 'fc_import_context' ? 'select fc_import_context($1,$2) as value' : 'select apply_fc_annual_import($1,$2::jsonb) as value';
            result = (await db.query(query,[body.target_org, endpoint === 'fc_import_context' ? body.target_year : JSON.stringify(body.payload)])).rows[0].value;
          } else if (endpoint === 'fc_import_batches' && !u.searchParams.has('reference_year')) result = (await db.query('select * from fc_import_batches where organization_id=$1 order by reference_year desc',[org])).rows;
          else if (endpoint === 'fc_import_batches') result = (await db.query('select * from fc_import_batches where organization_id=$1 and reference_year=$2',[org,Number(u.searchParams.get('reference_year')?.slice(3))])).rows;
          else if (endpoint === 'fc_import_values') result = (await db.query('select account_id,amounts from fc_import_values where batch_id=$1 order by account_id',[u.searchParams.get('batch_id').slice(3)])).rows;
          return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
        } catch(e) { return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message})}); }
      }
      if (url.includes('127.0.0.1')) return route.continue();
      if (url.includes('/xlsx@')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(library, 'utf8') });
      return route.abort(); // Nenhum acesso ao backend real nesta verificação.
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'load' });
    await page.evaluate(({admin,org}) => {
      currentUser = {id:admin};currentSession={access_token:'fixture',expires_at:Date.now()/1000+3600,user:currentUser};organizationIdCache=org;
      state.profile.accessRole = 'admin'; state.currentPeriod = { year: 2026, month: 8 };
      supabaseConfig.projectUrl = location.origin;
      document.body.classList.remove('auth-only'); document.querySelector('#auth-shell').classList.remove('active');
      activeView = 'actualsLoad'; selectedReportId = null;
      renderNavigation(); renderPeriodSummary(); ensureActualsViewShell(); renderActualsCatalog();
    },{admin,org});
    await page.locator('[data-fc-load]').click();
    await page.waitForFunction(() => document.querySelector('[data-fcl-file]') && !document.querySelector('[data-fcl-file]').disabled);
    const downloadEvent=page.waitForEvent('download');
    await page.locator('[data-fcl-template]').click();
    const download=await downloadEvent;
    assert.equal(download.suggestedFilename(),'Modelo-FC-2026.xlsx');
    const downloaded=XLSX.read(fs.readFileSync(await download.path()),{type:'buffer'});
    const templateValid=await page.evaluate(book=>{
      const plan=window.VECTON_FC_STRUCTURE.map(n=>({...n,id:n.seed_key,parent_id:n.parent_key}));
      const report=window.VECTON_FC_SERVICE.parseWorkbook(book,2026,plan,'2026-09-21');
      return {accounts:Object.keys(report.movements).length,net:report.values.net.reduce((a,b)=>a+b,0)};
    },downloaded);
    assert.deepEqual(templateValid,{accounts:76,net:0});
    assert.equal(await page.locator('#fcLoad-view section.fc-panel').count(),3);
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix()), 'FC');
    const buffer = Buffer.from(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}));
    const invalidRows=matrix();invalidRows[2][1]='INVALIDO';
    const invalidBook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(invalidBook,XLSX.utils.aoa_to_sheet(invalidRows),'FC');
    await page.locator('[data-fcl-file]').setInputFiles({name:'FC-invalido.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(invalidBook,{type:'buffer',bookType:'xlsx'}))});
    await page.locator('[data-fcl-validate]').click();
    await page.waitForFunction(()=>document.querySelector('.fc-message')?.textContent.includes('Classificação inválida'));
    assert.equal((await db.query('select count(*)::int as n from fc_import_batches')).rows[0].n,0);
    assert.equal(await page.locator('[data-fcl-apply]').count(),0);
    await page.locator('[data-fcl-file]').setInputFiles({name:'FC-teste.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
    await page.locator('[data-fcl-validate]').click();
    await page.waitForFunction(() => document.querySelector('.fc-message')?.textContent.includes('aplicada.'));
    assert.equal((await db.query('select count(*)::int as n from fc_import_values')).rows[0].n,76);
    const oldId=(await db.query('select id from fc_import_batches')).rows[0].id;
    await page.locator('[data-fcl-file]').setInputFiles({name:'FC-substituto.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
    await page.locator('[data-fcl-validate]').click();
    await page.waitForFunction(() => document.querySelector('.fc-message')?.textContent.includes('aplicada.'));
    assert.equal((await db.query('select count(*)::int as n from fc_import_files where batch_id=$1',[oldId])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int as n from fc_import_batches')).rows[0].n,1);
    await page.locator('[data-fcl-refresh]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-fcl-refresh]').disabled);
    assert.equal(await page.locator('[data-fcl-batch]').count(),1);
    await page.locator('[data-fcl-batch]').click();
    await page.waitForFunction(()=>document.querySelector('#fcLoad-view').textContent.includes('Lote aplicado · 2026'));
    assert.equal(await page.locator('#fcLoad-view tbody tr').count(),76);
    assert.equal(await page.locator('[data-fcl-apply]').count(),0);
    await page.screenshot({path:path.join(repo,'artifacts/fc-load-ui.png'),fullPage:true});
    await page.evaluate(() => {activeView='reports';selectedReportId='cashFlow';renderNavigation();renderReportsView();});
    await page.waitForSelector('[data-fc-curve]');
    await page.locator('[data-fc-period="month"]').click();
    await page.locator('#period-trigger').click();
    await page.locator('#period-month-grid button').filter({ hasText: /^Out$/ }).click();
    assert.match(await page.locator('#reports-view .fc-heading p').innerText(), /Out\/2026/);
    assert.equal(await page.locator('[data-fc-curve]').count(), 1);
    await page.locator('[data-fc-period="year"]').click();
    assert.equal(await page.locator('[data-fc-curve]').count(), 11);
    await page.screenshot({ path: path.join(repo, 'artifacts/fc-dashboard-vecton.png'), fullPage: true });
    await page.locator('[data-fc-detail]').click();
    assert.equal(await page.locator('.fc-detail-analytic').count(), 76);
    assert.equal(await page.locator('[data-fc-edit]').count(),0);
    await page.locator('[data-fc-edit-toggle]').click();
    assert.equal(await page.locator('[data-fc-edit][data-month="0"]').count(),0);
    assert.equal(await page.locator('[data-fc-edit][data-month="8"]').count(),77);
    assert.equal(await page.locator('[data-fc-edit][data-month="11"]').count(),77);
    const field=page.locator('[data-fc-edit="linha-12"][data-month="9"]');
    const original=await field.inputValue();
    await field.fill('9.000.000');await field.press('Tab');
    await page.locator('[data-fc-scenario-name]').fill('Cenário teste');
    await page.locator('[data-fc-save]').click();
    await page.waitForFunction(()=>document.querySelector('.fc-simulation-bar').textContent.includes('Cenário salvo'));
    assert.equal((await db.query('select count(*)::int as n from fc_scenarios')).rows[0].n,1);
    const savedId=(await db.query('select id from fc_scenarios')).rows[0].id;
    await page.locator('[data-fc-scenario]').selectOption('');
    await page.waitForFunction(()=>!document.querySelector('[data-fc-scenario]').disabled);
    assert.equal(await field.inputValue(),original);
    await page.locator('[data-fc-scenario]').selectOption(savedId);
    await page.waitForFunction(()=>!document.querySelector('[data-fc-scenario]').disabled);
    assert.equal(await field.inputValue(),'9.000.000');
    await page.locator('[data-fc-export-toggle]').click();
    assert.equal(await page.locator('.fc-export-menu button').count(),3);
    const exportDownload=page.waitForEvent('download');
    await page.locator('[data-fc-export="excel"]').click();
    const exported=await exportDownload;
    const exportedBook=XLSX.read(fs.readFileSync(await exported.path()),{type:'buffer'});
    const exportedRows=XLSX.utils.sheet_to_json(exportedBook.Sheets['Fluxo de Caixa'],{header:1});
    assert.match(exportedRows[1][0],/Cenário teste/);
    assert.equal(exportedRows.find(r=>r[0]==='Vendas Mercado Local')[10],9000000);
    await page.locator('[data-fc-export-toggle]').click();
    await page.locator('[data-fc-export="email"]').click();
    assert.equal(await page.locator('.fc-email-dialog').isVisible(),true);
    assert.match(await page.locator('.fc-email-dialog').innerText(),/Cenário teste/);
    await page.locator('.fc-email-dialog [data-close]').click();
    await page.context().addInitScript(()=>{window.print=()=>{window.didPrint=true;};});
    await page.locator('[data-fc-export-toggle]').click();
    const popupEvent=page.waitForEvent('popup');
    await page.locator('[data-fc-export="print"]').click();
    const printPage=await popupEvent;
    await printPage.waitForLoadState();
    assert.match(await printPage.locator('body').innerText(),/Cenário teste/);
    assert.match(await printPage.locator('body').innerText(),/9.000.000/);
    await printPage.close();
    await page.screenshot({path:path.join(repo,'artifacts/fc-scenario-ui.png'),fullPage:true});
    await page.locator('[data-fc-delete]').click();
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal((await db.query('select count(*)::int as n from fc_scenarios')).rows[0].n,1);
    await page.locator('[data-fc-delete]').click();
    await page.getByRole('button',{name:'Confirmar',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('[data-fc-scenario]').disabled && document.querySelector('[data-fc-scenario]').value==='');
    assert.equal((await db.query('select count(*)::int as n from fc_scenarios')).rows[0].n,0);
    assert.equal(await page.locator('[data-fc-delete]').count(),0);
    await page.locator('#reports-view [data-fc-back]').click();
    assert.equal(await page.locator('#reports-view .fc-heading h2').innerText(), 'Fluxo de caixa');
    assert.equal(await page.locator('[data-fc-curve]').count(), 11);
    await page.locator('.menu-button[data-view="reports"]').click();
    assert.equal(await page.locator('[data-report-id="cashFlow"]').isVisible(), true);
    await page.evaluate(() => { state.profile.accessRole = 'analyst'; state.profile.extraReportIds = []; applyReportAccess(); });
    assert.equal(await page.locator('[data-report-id="cashFlow"]').isVisible(), false);
    await page.evaluate(() => { selectedReportId = 'cashFlow'; renderReportsView(); });
    assert.match(await page.locator('#reports-view .reports-table-card').innerText(), /não permite/);
    assert.deepEqual(errors, []);
    console.log('FC integration: annual Excel validation, SQL application/replacement, file deletion, persisted dashboard, report catalog, master period picker, detail navigation and role restriction passed.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
