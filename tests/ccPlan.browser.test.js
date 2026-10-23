const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const section=fs.readFileSync('index.html','utf8').match(/<section id="ccPlan-view"[\s\S]*?<\/section>/)[0];
 await page.route('http://localhost/plan-style',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html data-vecton-theme="clear"><body style="height:auto;overflow:auto"><main style="padding:24px">${section}</main></body></html>`}));await page.goto('http://localhost/plan-style');
 for(const file of ['styles.css','src/styles/appearance.css'])await page.addStyleTag({path:path.resolve(file)});
 await page.evaluate(()=>window.VECTON_CORE_CONSTANTS={COST_CENTER_MANAGEMENT_OPTIONS:['Diretoria','Industrial']});
 await page.addScriptTag({path:path.resolve('src/modules/ui/ccTreeModule.js')});
 await page.evaluate(()=>{
  document.querySelector('#ccPlan-view').classList.add('active');document.querySelector('#ccPlan-view').style.display='block';
  window.nodes=[{code:'3',name:'Receitas',class:'Sintetica',parentCode:'root'},{code:'31',name:'Receita de Máquinas',class:'Analitica',parentCode:'3',origin:'actuals+structure'},{code:'32',name:'Outras Receitas',class:'Analitica',parentCode:'3',origin:'manual'}];window.expanded=new Set(['root']);window.selected='31';window.refreshes=0;
  window.mod=VECTON_CC_TREE.createCcTreeModule({ccTree:document.querySelector('#cc-tree'),ccNodeForm:document.querySelector('#cc-node-form'),ROOT_CC_NODE:{code:'root',name:'Demonstrativo de Resultados',class:'Sintetica'},escapeHtml:v=>String(v??''),getCcChildren:code=>window.nodes.filter(n=>n.parentCode===code),findCcNode:code=>window.nodes.find(n=>n.code===code),getLinkedCostCenter:code=>code==='31'?{management:'Industrial'}:null,getManagements:()=>[{name:'Industrial'}],describeCcParent:v=>v,getSelectedCcCode:()=>window.selected,setSelectedCcCode:v=>window.selected=v,getExpandedCcCodes:()=>window.expanded,setDragPayload:()=>{},getDragPayload:()=>null,handleCcDrop:()=>{},refreshPlan:async()=>{window.refreshes++;}});window.mod.renderCcTree();window.mod.renderCcEditor();
 });
 await page.locator('#cc-plan-search').fill('maquinas');assert.equal(await page.locator('#cc-tree .tree-row').count(),3);assert.match(await page.locator('#cc-tree').innerText(),/Receita de Máquinas/);assert.doesNotMatch(await page.locator('#cc-tree').innerText(),/Outras Receitas/);
 assert.equal(await page.locator('.tree-bullet.actual').count(),0);assert.equal(await page.locator('.tree-bullet.analytic').count(),1);
 fs.mkdirSync('artifacts/cc',{recursive:true});
 await page.screenshot({path:'artifacts/cc/plan-standard.png',fullPage:true});
 await page.locator('#cc-plan-search').fill('inexistente');assert.equal(await page.locator('#cc-tree').innerText(),'Nenhum centro de custos encontrado.');
 await page.locator('#cc-plan-search').fill('');await page.locator('#cc-plan-filter').selectOption('Sintetica');assert.equal(await page.locator('.tree-bullet.analytic').count(),0);
 await page.locator('#cc-plan-filter').selectOption('Analitica');assert.equal(await page.locator('.tree-bullet.analytic').count(),2);
 await page.locator('#cc-plan-refresh').click();assert.equal(await page.evaluate(()=>window.refreshes),1);assert.equal(await page.locator('#cc-plan-refresh').isEnabled(),true);
 await page.locator('#cc-plan-filter').selectOption('');await page.locator('#cc-plan-search').fill('industrial');assert.match(await page.locator('#cc-tree').innerText(),/Receita de Máquinas/);assert.equal(await page.locator('.tree-bullet.analytic').count(),1);
 await page.locator('#cc-tree .tree-row').filter({hasText:/31 - Receita/}).click();assert.equal(await page.locator('#cc-node-management').inputValue(),'Industrial');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('Cost center plan: search with accents and ancestors, class filter, unified colors and refresh OK');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
