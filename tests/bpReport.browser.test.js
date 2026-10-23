const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const source=JSON.parse(fs.readFileSync('artifacts/bp/source-plan.json','utf8'));
const plan=source.map(n=>({id:n.code,account_code:n.code,name:n.name,node_class:n.type==='ANALITICA'?'Analitica':'Sintetica',group_key:n.group_key||null,parent_id:n.parent_code}));
plan.push({id:'pcld',account_code:'1.1.2.02.001',node_class:'Analitica',group_key:'( - ) PCLD'},
 {id:'contingency',account_code:'2.2.9.01.001',node_class:'Analitica',group_key:'Provisão para Contingências'});
const amounts={
 'Caixa e equivalente de Caixa':[7031185.6,8023413],'Contas a Receber - Clientes':[6330118,8921822],'( - ) PCLD':[0,-195950],
 'Estoques':[19031785.7,14936198],'Outros Créditos':[918223.7,503790],'Impostos a Recuperar':[2446978,3762382],
 'Despesas a apropriar':[234671,537278],'Depósitos Judiciais':[70043,112929.4],'Imobilizado':[26000772,26988678.3],
 'Intangível':[2575757,2183544.3],'Propriedades p/ Investimento':[1040000,0],'Contas a Pagar - Fornecedores':[4322146.6,4386037.4],
 'Empréstimos':[363042.7,359499.3],'Impostos e Contribuições':[187942.7,61642.3],'Obrigaçãoes Trabalhistas':[2563915,1657019],
 'Provisões para Comissões':[265907,505618],'Estoques de Terceiros':[2112306,1558569],'Outros Contas a Pagar':[586778,4908],
 'Provisões para JSCP':[293408,0],'Empréstimos NC':[242029.4,509291],'Dividendos a Pagar':[9325757.3,11452553],
 'Provisão para Contingências':[50204.3,160815],'Empréstimos de Acionistas':[14829859,15442546],
 'Capital Subscrito e Realizado':[30249904,30249904],'Reserva Legal':[1422585,1422585],
 'Resultado do Exercício':[999999999,999999999],'Resultados Acumulados':[-689451,-689451],'Ajustes Exercícios Anteriores':[-1307451,-1307451]
};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1040}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://localhost/bp-report-test',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body style="height:auto;overflow:auto"><main style="padding:24px;max-width:1280px;margin:auto"><section id="report"></section></main></body></html>'}));
  await page.goto('http://localhost/bp-report-test');
  for(const p of ['styles.css','src/styles/appearance.css','src/modules/balance/bp.css'])await page.addStyleTag({path:path.resolve(p)});
  for(const p of ['src/modules/balance/bpReportModel.js','src/modules/balance/bpExport.js','src/modules/balance/bpReportModule.js'])await page.addScriptTag({path:path.resolve(p)});
  await page.evaluate(({plan,amounts})=>{
   window.period={year:2026,month:10};window.allowed=true;window.user='u';window.calls=[];window.dreCalls=[];window.waiting=[];window.delay=false;window.missing=false;window.dreMissing=false;window.failure=false;
   const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const closing=(year,month,column,branch)=>{
    const seen=new Set();
    return{id:`${year}-${month}-${branch}`,branch_id:branch,reference_year:year,reference_month:month,rows:plan.filter(n=>n.node_class==='Analitica').map(n=>{
     const value=seen.has(n.group_key)?0:amounts[n.group_key]?.[column]||0;seen.add(n.group_key);return{account_id:n.id,amount:value/2};
    })};
   };
   window.report=window.VECTON_BP_REPORT.createModule({escapeHtml:esc,getUserId:()=>window.user,getPeriod:()=>window.period,canSeeReport:()=>window.allowed,isReportActive:()=>true,resolveOrganizationId:async()=> 'org',
    fetch:async(table,query)=>{window.calls.push({table,query});if(window.failure)throw Error('permission denied');if(/offset=1000/.test(query))return[];if(table==='bp_plan_nodes')return plan;
     if(window.missing)throw Error("PGRST205 Could not find the table 'public.bp_import_batches' in the schema cache");
     return [closing(2026,10,0,'01'),closing(2026,10,0,'02'),closing(2025,12,1,'01'),closing(2025,12,1,'02'),closing(2026,6,0,'01'),closing(2026,6,0,'02'),closing(2026,1,1,'01')];
    },
    getCurrentYear:()=>2026,
    getDreResult:async(year,month)=>{window.dreCalls.push([year,month]);if(window.delay&&year===2026)return new Promise(resolve=>window.waiting.push(resolve));return window.dreMissing?null:year===2026?860651:0;}
   });
   window.report.renderSelected(document.querySelector('#report'),'balanceSheetReal');
  },{plan,amounts});
  await page.locator('.bp-statement-grid').waitFor();
  assert.equal(await page.locator('#report select').count(),0);
  // Exportar: ao lado das datas, sem borda azul; PDF em A4 paisagem, uma página, centralizado.
  assert.equal(await page.locator('.bp-statement-actions [data-bp-export-toggle]').count(),1);
  await page.locator('[data-bp-export-toggle]').click();
  assert.equal(await page.locator('[data-bp-export]').count(),3);
  assert.deepEqual(await page.locator('[data-bp-export]').allInnerTexts(),['Imprimir','Enviar por e-mail','Baixar Excel']);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>{const probe=document.createElement('i');probe.style.cssText='border:1px solid var(--blue)';document.body.append(probe);const blue=getComputedStyle(probe).borderTopColor;probe.remove();return getComputedStyle(document.querySelector('[data-bp-export-toggle]')).borderTopColor===blue;}),false);
  const boxes=await page.evaluate(()=>({d:document.querySelector('.bp-statement-dates').getBoundingClientRect().right,b:document.querySelector('[data-bp-export-toggle]').getBoundingClientRect().left}));
  assert.ok(boxes.d<=boxes.b,'as datas ficam à esquerda do botão');
  const exportModel=await page.evaluate(async()=>{const m=await window.report.read('org',window.period);window.dreCalls.pop();return m;});
  const printHtml=await page.evaluate(m=>window.VECTON_BP_EXPORT.printHtml(m,v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;')),exportModel);
  assert.match(printHtml,/size:A4 landscape/);
  const pdfPage=await browser.newPage();await pdfPage.setContent(printHtml);
  const pdf=await pdfPage.pdf({preferCSSPageSize:true,printBackground:true});
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g)||[]).length,1);
  const media=pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);assert.ok(Number(media[1])>Number(media[2]),'paisagem');
  const sheetBox=await pdfPage.evaluate(()=>{const r=document.querySelector('.sheet').getBoundingClientRect();return{l:r.left,r:innerWidth-r.right};});
  assert.ok(Math.abs(sheetBox.l-sheetBox.r)<2,'centralizado');
  await pdfPage.close();
  assert.equal(await page.locator('.bp-statement-side').count(),2);
  assert.equal(await page.locator('.bp-statement-heading th').allTextContents().then(x=>x.join('|')),'ATIVO|2026|2025|PASSIVO|2026|2025');
  assert.match(await page.locator('.bp-statement-dates').innerText(),/31\/10\/2026.*31\/12\/2025/s);
  assert.deepEqual(await page.evaluate(()=>window.dreCalls),[[2026,10]]);
  assert.equal(await page.locator('[data-bp-line="cash"] td').first().innerText(),'7.031.186');
  assert.equal(await page.locator('[data-bp-line="cash"] td').last().innerText(),'8.023.413');
  assert.equal(await page.locator('[data-bp-line="profitReserve"] th').innerText(),'Reserva de Lucros');
  assert.equal(await page.locator('[data-bp-line="profitReserve"] td').first().innerText(),'860.651');
  assert.equal(await page.locator('[data-bp-line="profitReserve"] td').last().innerText(),'999.999.999');
  assert.equal(await page.locator('[data-bp-line="shareholders"]').locator('xpath=ancestor::section[1]').getAttribute('data-bp-section'),'liabilityNoncurrent');
  assert.equal(await page.locator('[data-bp-line="taxNoncurrent"] td').first().innerText(),'0');
  assert.equal(await page.locator('[data-bp-line="pcld"] td').last().innerText(),'-195.950');
  assert.deepEqual(await page.locator('.bp-statement-asset .bp-statement-grandtotal td').allTextContents(),['65.679.534','65.774.085']);
  assert.deepEqual(await page.locator('.bp-statement-liability .bp-statement-grandtotal td').allTextContents(),['65.679.534','1.065.774.084']);
  const aligned=await page.evaluate(()=>{
   const rect=q=>document.querySelector(q).getBoundingClientRect();
   return Math.abs(rect('[data-bp-section="assetNoncurrent"]').y-rect('[data-bp-section="liabilityNoncurrent"]').y)<1&&Math.abs(rect('.bp-statement-asset .bp-statement-grandtotal').y-rect('.bp-statement-liability .bp-statement-grandtotal').y)<1;
  });assert.equal(aligned,true);
  assert.equal(await page.evaluate(()=>window.calls.some(c=>c.table==='branches')),false);
  assert.equal(await page.evaluate(()=>window.calls.find(c=>c.table==='bp_import_batches').query.includes('reference_month.eq.12')),true);
  fs.mkdirSync('artifacts/bp',{recursive:true});
  await page.screenshot({path:'artifacts/bp/report-final-dark.png',fullPage:true});
  await page.evaluate(()=>document.documentElement.dataset.vectonTheme='clear');
  await page.screenshot({path:'artifacts/bp/report-final-clear.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:'artifacts/bp/report-final-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:1040});
  // Mudar a competência pelo estado do cabeçalho refaz a visão, sem outro seletor.
  await page.evaluate(()=>{window.period.month=6;window.report.renderSelected(document.querySelector('#report'),'balanceSheetReal');});
  await page.locator('.bp-statement-grid').waitFor();
  assert.match(await page.locator('.bp-statement-dates').innerText(),/30\/06\/2026.*31\/12\/2025/s);
  assert.deepEqual(await page.evaluate(()=>window.dreCalls.slice(-1)),[[2026,6]]);
  // Uma requisição antiga não sobrescreve a nova competência.
  await page.evaluate(()=>{window.delay=true;window.period.month=10;window.report.renderSelected(document.querySelector('#report'),'balanceSheetReal');});
  await page.waitForFunction(()=>window.waiting.length===1);
  await page.evaluate(()=>{window.delay=false;window.period.month=6;window.report.renderSelected(document.querySelector('#report'),'balanceSheetReal');});
  await page.locator('.bp-statement-grid').waitFor();
  await page.evaluate(async()=>{window.waiting[0](999);await new Promise(requestAnimationFrame);});
  assert.match(await page.locator('.bp-statement-dates').innerText(),/30\/06\/2026/);
  await page.evaluate(()=>{window.dreMissing=true;window.report.renderSelected(document.querySelector('#report'),'balanceSheetReal');});
  await page.locator('.bp-statement-grid').waitFor();
  assert.equal(await page.locator('[data-bp-line="profitReserve"] td').first().innerText(),'0');
  assert.notEqual(await page.locator('.bp-statement-liability .bp-statement-grandtotal td').first().innerText(),'—');
  assert.equal(await page.locator('[data-bp-line="profitReserve"] td').last().innerText(),'999.999.999');
  assert.equal(await page.locator('.bp-statement-liability .bp-statement-grandtotal td').last().innerText(),'1.065.774.084');
  assert.equal(await page.locator('.bp-statement-notice').count(),0);
  const callsBeforeHistory=await page.evaluate(()=>window.dreCalls.length);
  await page.evaluate(()=>{window.period={year:2025,month:12};window.report.renderSelected(document.querySelector('#report'),'balanceSheetReal');});
  await page.locator('.bp-statement-grid').waitFor();
  assert.equal(await page.locator('[data-bp-line="profitReserve"] td').first().innerText(),'999.999.999');
  assert.notEqual(await page.locator('.bp-statement-liability .bp-statement-grandtotal td').first().innerText(),'—');
  assert.equal(await page.evaluate(()=>window.dreCalls.length),callsBeforeHistory);
  await page.evaluate(()=>{window.period={year:2026,month:6};});
  await page.evaluate(()=>{window.missing=true;window.report.renderSelected(document.querySelector('#report'),'balanceSheetReal');});
  await page.locator('.bp-statement-grid').waitFor();
  assert.equal(await page.locator('[data-bp-line="cash"] td').first().innerText(),'—');
  assert.equal(await page.locator('.bp-statement-notice').count(),0);
  await page.evaluate(()=>{window.failure=true;window.report.renderSelected(document.querySelector('#report'),'balanceSheetReal');});
  await page.locator('[data-bp-retry]').waitFor();assert.match(await page.locator('[role="alert"]').innerText(),/permission denied/);
  await page.evaluate(()=>{window.failure=false;window.missing=false;window.dreMissing=false;});
  await page.locator('[data-bp-retry]').click();await page.locator('.bp-statement-grid').waitFor();
  await page.evaluate(()=>{window.allowed=false;window.report.renderSelected(document.querySelector('#report'),'balanceSheetReal');});
  await page.locator('[role="alert"]').waitFor();assert.match(await page.locator('[role="alert"]').innerText(),/Sem acesso/);
  assert.deepEqual(errors,[]);
  console.log('BP report browser: reference layout, exact dates, consolidated branches, DRE exception, period change, stale reads, missing data, retry and access OK');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
