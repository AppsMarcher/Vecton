const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const section=fs.readFileSync('index.html','utf8').match(/<section id="drePlan-view"[\s\S]*?<\/section>/)[0];
 await page.route('http://localhost/plan-style',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html data-vecton-theme="clear"><body style="height:auto;overflow:auto"><main style="padding:24px">${section}</main></body></html>`}));await page.goto('http://localhost/plan-style');
 for(const file of ['styles.css','src/styles/appearance.css'])await page.addStyleTag({path:path.resolve(file)});
 await page.addScriptTag({path:path.resolve('src/modules/ui/dreTreeModule.js')});
 await page.evaluate(()=>{
  document.querySelector('#drePlan-view').classList.add('active');document.querySelector('#drePlan-view').style.display='block';
  window.nodes=[{code:'3',name:'Receitas',class:'Sintetica',parentCode:'root'},{code:'31',name:'Receita de Máquinas',class:'Analitica',parentCode:'3',origin:'actuals+structure'},{code:'32',name:'Outras Receitas',class:'Analitica',parentCode:'3',origin:'manual'}];window.expanded=new Set(['root']);window.selected='31';window.refreshes=0;
  window.mod=VECTON_DRE_TREE.createDreTreeModule({dreTree:document.querySelector('#dre-tree'),dreNodeForm:document.querySelector('#dre-node-form'),ROOT_DRE_NODE:{code:'root',name:'Demonstrativo de Resultados',class:'Sintetica'},escapeHtml:v=>String(v??''),getDreChildren:code=>window.nodes.filter(n=>n.parentCode===code),findDreNode:code=>window.nodes.find(n=>n.code===code),describeOrigin:v=>v,describeParent:v=>v,getSelectedDreCode:()=>window.selected,setSelectedDreCode:v=>window.selected=v,getExpandedDreCodes:()=>window.expanded,setDragPayload:()=>{},getDragPayload:()=>null,handleDreDrop:()=>{},refreshPlan:async()=>{window.refreshes++;}});window.mod.renderDreTree();window.mod.renderDreEditor();
 });
 await page.locator('#dre-plan-search').fill('maquinas');assert.equal(await page.locator('#dre-tree .tree-row').count(),3);assert.match(await page.locator('#dre-tree').innerText(),/Receita de Máquinas/);assert.doesNotMatch(await page.locator('#dre-tree').innerText(),/Outras Receitas/);
 assert.equal(await page.locator('.tree-bullet.actual').count(),0);assert.equal(await page.locator('.tree-bullet.analytic').count(),1);
 await page.screenshot({path:'artifacts/bp/plan-dre-standard.png',fullPage:true});
 await page.locator('#dre-plan-search').fill('inexistente');assert.equal(await page.locator('#dre-tree').innerText(),'Nenhuma conta encontrada.');
 await page.locator('#dre-plan-search').fill('');await page.locator('#dre-plan-filter').selectOption('Sintetica');assert.equal(await page.locator('.tree-bullet.analytic').count(),0);
 await page.locator('#dre-plan-filter').selectOption('Analitica');assert.equal(await page.locator('.tree-bullet.analytic').count(),2);
 await page.locator('#dre-plan-refresh').click();assert.equal(await page.evaluate(()=>window.refreshes),1);assert.equal(await page.locator('#dre-plan-refresh').isEnabled(),true);
 assert.deepEqual(errors,[]);console.log('Account plans: DRE search with accents and ancestors, class filter, unified colors and refresh OK');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
