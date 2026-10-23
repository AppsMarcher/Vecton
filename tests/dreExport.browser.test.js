const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
// Integração do botão Exportar nos DREs DFs Real e Meta (módulo real, dependências simuladas).
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://localhost/dfs',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><div id="panel"></div></body></html>'}));
  await page.goto('http://localhost/dfs');
  for(const p of ['styles.css','src/modules/cashflow/fcDashboard.css','src/modules/reports/dreExport.css'])await page.addStyleTag({path:path.resolve(p)});
  await page.evaluate(()=>{
   window.vpSkeletonTable=()=>'skeleton';window.vpExportIconButtonHtml=a=>`<button class="vp-export-btn" ${a}>Excel</button>`;
   window.VECTON_SCENARIO_SOURCES={chooseSource:()=>({options:[{value:'x',label:'Fcst 5+7 2026'}],value:'x'})};
   window.alerts=[];window.opened=[];window.floating=[];
  });
  for(const p of ['src/modules/reports/dreExport.js','src/modules/reports/reportsDreModule.js'])await page.addScriptTag({path:path.resolve(p)});
  await page.evaluate(()=>{
   const line=(id,label,kind,base)=>({id,label,kind,months:kind==='section'?[]:Array.from({length:12},(_,m)=>base*(m+1)),total:kind==='section'?undefined:base*78,numerator:[]});
   const report=()=>({lines:[line('receitaBruta','Receita Bruta','section',0),line('vendas','Venda de Produtos e Serviços','value',100),line('receitaLiquida','Receita Líquida','subtotal',90)],receitaLiquida:Array(12).fill(90)});
   const deps={escapeHtml:v=>String(v),getCurrentYear:()=>2026,getCurrentPeriodMonth:()=>9,getReportsLoadingYear:()=>null,getReportsErrorMessage:()=>'',
    reportsLedgerCache:new Map([[2026,{rows:[{}]}]]),buildDreGerRealReport:()=>({lines:[line('receitaBruta','( = ) Receita Bruta','result',100),line('impostos','( - ) Impostos s/ Vendas','deduction',-10)],receitaLiquida:Array(12).fill(90)}),buildDreGerRealTableMarkup:()=>'<table class="t"></table>',initDreGerDrilldown(){},buildDreDfsRealReport:report,buildDreDfsRealTableMarkup:()=>'<table class="t"></table>',
    initAllReportTableResizers(){},initFloatingScrollbar:wrap=>{window.floating.push(wrap.className);},isAccessRestricted:()=>false,fetchAllScenarios:async()=>[],fetchRealYears:async()=>[],rowsForSource:async()=>[{}],
    computeDreCompareCell:(l,c,month)=>({isPercent:false,realMonth:1,compareMonth:2,varMonth:-1,varPctMonth:-.5,realYtd:3,compareYtd:4,varYtd:-1,varPctYtd:-.25}),
    alert:async m=>{window.alerts.push(m);},sendEmail:async()=>{},getUserId:()=>'u',getUserName:()=>'Teste'};
   window.dre=window.VECTON_REPORTS_DRE.createReportsDreModule(deps);
   window.open=()=>{const doc={html:'',write(h){this.html+=h;},close(){}};const w={document:doc,focus(){},print(){}};window.opened.push(w);return w;};
  });
  const titles={dreDfsReal:'DRE DFs Real',dreDfsBudget:'DRE DFs Meta',dreGerReal:'DRE Gerencial Real',dreGerBudget:'DRE Gerencial Meta'};
  for(const [id,expectCompare] of [['dreDfsReal',true],['dreDfsBudget',false],['dreGerReal',true],['dreGerBudget',false]]){
   await page.evaluate(id=>{window.panel=document.querySelector('#panel');window.dre.renderSelectedDreReport(window.panel,id);},id);
   await page.locator('.t').waitFor({state:'attached'});
   assert.deepEqual(await page.evaluate(()=>window.floating.splice(0)),['reports-table-wrap'],id+': barra de rolagem flutuante ativada');
   assert.equal(await page.locator('.dre-export [data-dre-exp-toggle]').count(),1,id+': botão Exportar');
   assert.equal(await page.locator('.vp-export-btn').count(),0,id+': sem o botão Excel antigo');
   assert.equal(await page.locator('.dre-export .fc-export-menu').isVisible(),false);
   await page.locator('[data-dre-exp-toggle]').click();
   assert.deepEqual(await page.locator('[data-dre-exp]').allInnerTexts(),['Imprimir','Enviar por e-mail','Baixar Excel']);
   assert.equal(await page.locator('.dre-export .fc-export-menu').isVisible(),true);
   const snapshot=await page.evaluate(()=>window.panel.__dreSnapshot);
   assert.equal(snapshot.title,titles[id]);assert.equal(snapshot.profile,id.startsWith('dreGer')?'ger':'dfs');assert.equal(snapshot.lines.length,id.startsWith('dreGer')?2:3);
   assert.equal(Boolean(snapshot.lines[1].compare),expectCompare);
   await page.locator('[data-dre-exp="print"]').click();
   await page.waitForFunction(()=>window.opened.length>0);
   const html=await page.evaluate(()=>window.opened.pop().document.html);
   assert.match(html,/size:A4 landscape/);assert.match(html,id.startsWith('dreGer')?/Impostos s\/ Vendas/:/Venda de Produtos e Serviços/);assert.match(html,id.startsWith('dreGer')?/Linha Gerencial/:/Linha DFs/);
   assert.equal(await page.locator('.dre-export .fc-export-menu').isVisible(),false);
   await page.locator('[data-dre-exp-toggle]').click();await page.locator('[data-dre-exp="excel"]').click();
   await page.waitForFunction(()=>window.alerts.length>0);
   assert.match(await page.evaluate(()=>window.alerts.pop()),/Excel/);
  }
  assert.deepEqual(errors,[]);
  console.log('DRE export UI: botão Exportar em DFs e Gerencial (Real e Meta), menu recolhido, snapshot e impressão OK');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
