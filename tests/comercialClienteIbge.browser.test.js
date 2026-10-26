const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://localhost/cadastro',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html data-vecton-theme="clear"><body><button id="com-clientes-add-btn">+ Novo</button><table><thead><tr><th>Código</th><th>Descrição</th><th>Cidade</th><th>UF</th><th>IBGE</th><th></th></tr></thead><tbody id="com-clientes-table-body"></tbody></table></body></html>'}));
 await page.goto('http://localhost/cadastro');
 for(const file of ['styles.css','src/styles/appearance.css'])await page.addStyleTag({path:path.resolve(file)});
 await page.addScriptTag({path:path.resolve('src/modules/comercial/comercialCadastroModule.js')});
 await page.evaluate(()=>{
  window.consultas=[];
  const geo={SP:[{codigo_ibge:'3550308',municipio:'São Paulo'},{codigo_ibge:'3509502',municipio:'Campinas'}],RS:[{codigo_ibge:'4314902',municipio:'Porto Alegre'}]};
  const ufs=[{value:'SP',label:'SP'},{value:'RS',label:'RS'}];
  const mod=VECTON_COMERCIAL_CADASTRO_MODULE.createCadastroModule({table:'comercial_clientes',idPrefix:'com-clientes',titleSingular:'Cliente',titlePlural:'Clientes',conflictKeys:['codigo'],
   ibgeLookup:{cidade:'cidade',uf:'uf',codigo:'codigo_ibge'},
   fields:[{key:'codigo',label:'Código',required:true},{key:'descricao',label:'Descrição',required:true},{key:'cidade',label:'Cidade'},{key:'uf',label:'UF',type:'select',options:ufs},{key:'codigo_ibge',label:'Código IBGE'}]},
   {escapeHtml:v=>String(v??''),resolveOrganizationId:async()=>'org',fetchAllSupabaseRows:async()=>[],upsertSupabaseRows:async()=>{},insertSupabaseRows:async()=>{},deleteSupabaseRows:async()=>{},appAlert:async()=>{},appConfirm:async()=>true,
    fetchSupabaseRows:async(table,query)=>{window.consultas.push(query);return geo[query.match(/uf=eq\.(\w+)/)[1]]||[];}});
  mod.bindAddButton();
 });
 await page.click('#com-clientes-add-btn');
 const ibge=page.locator('#com-clientes-f-codigo_ibge');
 // cidade (sem acento, caixa diferente) + UF -> preenche
 await page.fill('#com-clientes-f-cidade','sao paulo');await page.selectOption('#com-clientes-f-uf','SP');
 await page.waitForFunction(()=>document.querySelector('#com-clientes-f-codigo_ibge').value==='3550308');
 assert.match(await page.locator('#com-clientes-feedback').innerText(),/preenchido/);
 // troca a cidade: acompanha; troca a UF para onde nao existe: limpa e avisa
 await page.fill('#com-clientes-f-cidade','Campinas');await page.waitForFunction(()=>document.querySelector('#com-clientes-f-codigo_ibge').value==='3509502');
 await page.selectOption('#com-clientes-f-uf','RS');await page.waitForFunction(()=>document.querySelector('#com-clientes-f-codigo_ibge').value==='');
 assert.match(await page.locator('#com-clientes-feedback').innerText(),/não encontrado/);
 // codigo digitado a mao nunca e sobrescrito
 await ibge.fill('9999999');await page.fill('#com-clientes-f-cidade','Porto Alegre');await page.waitForTimeout(600);
 assert.equal(await ibge.inputValue(),'9999999');
 // a lista da UF e buscada uma vez so
 assert.equal(await page.evaluate(()=>window.consultas.filter(q=>q.includes('uf=eq.SP')).length),1);
 await page.screenshot({path:'artifacts/cliente-ibge.png'});
 assert.deepEqual(errors,[]);console.log('Cliente: IBGE preenchido por cidade+UF (sem acento), limpa/avisa se nao achar, nao sobrescreve digitado, 1 consulta por UF OK');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
