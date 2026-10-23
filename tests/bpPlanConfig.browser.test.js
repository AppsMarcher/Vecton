const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const source=JSON.parse(fs.readFileSync('artifacts/bp/source-plan.json','utf8'));
  const rows=source.map((n,i)=>({id:n.code,account_code:n.code,name:n.name,node_class:n.type==='ANALITICA'?'Analitica':'Sintetica',group_key:n.group_key||null,parent_id:n.parent_code,source_name:n.type==='ANALITICA'?n.code:null,sort_order:i+1,active:true,note:''}));
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://localhost/bp-plan-test',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><main style="padding:24px"><h2>Plano de Contas BP</h2><section id="root"></section></main></body></html>'}));
  await page.goto('http://localhost/bp-plan-test');
  for(const p of ['styles.css','src/modules/balance/bp.css'])await page.addStyleTag({path:path.resolve(p)});
  await page.addScriptTag({path:path.resolve('src/modules/params/bpPlanModule.js')});
  await page.evaluate(async rows=>{
   window.rows=rows;window.admin=true;window.user='admin';window.saves=[];
   const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   window.mod=window.VECTON_BP_PLAN.createBpPlanModule({root:document.querySelector('#root'),escapeHtml:esc,isAdmin:()=>window.admin,getCurrentUserId:()=>window.user,getActiveView:()=> 'bpPlan',resolveOrganizationId:async()=> 'org',fetch:async()=>structuredClone(window.rows),confirm:async()=>true,
   update:async(org,id,fields)=>{window.saves.push(fields);Object.assign(window.rows.find(n=>n.id===id),fields);return[window.rows.find(n=>n.id===id)];},insert:async row=>[row],remove:async()=>{}});
   await window.mod.render();
  },rows);
  assert.match(await page.locator('[data-status]').innerText(),/173 contas · 59 sintéticas · 114 analíticas · 26 chaves agrupadoras/);
  await page.locator('[data-search]').fill('1.1.1.02.002');
  await page.locator('.bp-plan-select').filter({hasText:'1.1.1.02.002'}).click();
  assert.equal(await page.locator('[name="account_code"]').inputValue(),'1.1.1.02.002');
  assert.equal(await page.locator('[name="group_key"]').inputValue(),'Caixa e equivalente de Caixa');
  assert.equal(await page.locator('[name="group_key"]').isEnabled(),true);
  await page.locator('[data-search]').fill('Caixa e equivalente de Caixa');
  assert.equal(await page.locator('.bp-plan-select').count(),9); // Quatro analíticas e seus cinco ancestrais.
  await page.locator('[name="note"]').fill('Conferido');
  await page.locator('button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-status]').textContent==='Conta salva.');
  assert.equal(await page.evaluate(()=>window.saves[0].group_key),'Caixa e equivalente de Caixa');
  assert.equal(await page.evaluate(()=>window.saves[0].source_name),'1.1.1.02.002');
  fs.mkdirSync('artifacts/bp',{recursive:true});
  await page.screenshot({path:'artifacts/bp/plan-config-desktop.png',fullPage:true});
  await page.locator('[data-search]').fill('');
  await page.locator('.bp-plan-select').filter({hasText:/^1 · ATIVO/}).click();
  assert.equal(await page.locator('[name="group_key"]').inputValue(),'');
  assert.equal(await page.locator('[name="group_key"]').isDisabled(),true);
  await page.evaluate(async()=>{window.admin=false;await window.mod.render();});
  assert.match(await page.locator('#root').innerText(),/restrito/);
  assert.deepEqual(errors,[]);
  console.log('BP plan UI: 173 source accounts, accounting codes, analytic grouping keys, synthetic guard, search, save and access OK');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
