// Inspeção do protótipo em navegador. Não acessa o Vecton de produção.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const errors=[],external=[],overflow=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:8093/')){external.push(r.request().url());return r.abort();}return r.continue();});
  try{
    await page.goto('http://127.0.0.1:8093/mockup-clear/');
    await page.waitForSelector('h1');
    const screens=await page.evaluate(()=>VECTON_MOCKUP.screens.map(s=>({id:s.id,kind:s.kind})));
    const realViews=await page.evaluate(()=>Object.keys(VECTON_CORE_CONSTANTS.VIEW_HEADER_METADATA));
    const reportIds=[...fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').matchAll(/data-report-id="([^"]+)"/g)].map(m=>m[1]);
    const covered=new Set(screens.map(s=>s.id));
    for(const id of [...realViews,...reportIds])assert.ok(covered.has(id),'View/relatório sem mockup: '+id);
    fs.mkdirSync(path.join(__dirname,'previews'),{recursive:true});
    for(const theme of ['clear','dark']){
      await page.locator(`[data-theme-choice="${theme}"]`).first().click();
      for(const width of [1440,1280,390]){
        await page.setViewportSize({width,height:width===390?844:1000});
        for(const s of screens){
          await page.evaluate(id=>VECTON_MOCKUP.navigate(id),s.id);
          assert.ok(await page.locator('h1').count(),s.id+' must have a title');
          if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))overflow.push(`${theme}/${width}/${s.id}`);
          if(width!==1280&&['dashboard','comercialPainel','strategic','cashFlow','login','rpsComercial','dreGerReal','screenIndex'].includes(s.id))await page.screenshot({path:path.join(__dirname,'previews',`${s.id}-${theme}-${width}.png`),fullPage:true});
        }
      }
      await page.setViewportSize({width:1440,height:1000});
      await page.evaluate(()=>VECTON_MOCKUP.navigate('dashboard'));
    }
    await page.locator('[data-theme-choice="clear"]').click();
    await page.locator('[data-action="search"]').click();
    await page.locator('[data-global-search]').fill('A3');
    assert.ok(await page.locator('.search-results button').count()>=4);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>VECTON_MOCKUP.navigate('comProdutos'));
    await page.locator('[data-action="newRecord"]').click();
    for(const [i,v] of ['MOCK-001','Produto de avaliação','Máquinas','Grãos'].entries())await page.locator(`[name="f${i}"]`).fill(v);
    await page.locator('dialog button[type="submit"]').click();
    assert.ok(await page.getByText('Produto de avaliação',{exact:true}).count());
    await page.locator('[data-table-search]').fill('NENHUM-REGISTRO');
    assert.ok(await page.locator('#no-search-results').isVisible());
    await page.evaluate(()=>VECTON_MOCKUP.navigate('dashboard'));
    await page.locator('[data-drill]').first().click();
    assert.ok(await page.locator('dialog').isVisible());
    await page.keyboard.press('Escape');
    await page.locator('[data-action="review"]').first().click();
    for(const state of ['loading','empty','noResults','error']){
      await page.locator('[data-ui-state]').selectOption(state);
      assert.ok(await page.locator('.state-panel').isVisible());
    }
    await page.locator('[data-action="retry"]').click();
    assert.ok(await page.locator('.kpis').count());
    await page.evaluate(()=>VECTON_MOCKUP.navigate('messages'));
    await page.locator('[name="message"]').fill('Mensagem de avaliação');
    await page.locator('[data-chat-form] button').click();
    assert.ok(await page.getByText('Mensagem de avaliação',{exact:false}).count());
    await page.evaluate(()=>VECTON_MOCKUP.navigate('importReview'));
    assert.ok(await page.locator('[data-action="applyImport"]').isDisabled());
    await page.locator('[data-action="validate"]').click();
    assert.ok(await page.locator('[data-action="applyImport"]').isEnabled());
    await page.locator('[data-action="applyImport"]').click();
    assert.ok(await page.getByText('Aplicação concluída',{exact:true}).count());
    await page.keyboard.press('Escape');
    await page.evaluate(()=>VECTON_MOCKUP.navigate('fcDetail'));
    const original=await page.evaluate(()=>MOCKUP_CASH.calculate().map(r=>r.closing));
    await page.locator('[data-fc-input="receipt"][data-fc-month="8"]').fill('43,00');
    await page.locator('[data-fc-input="receipt"][data-fc-month="8"]').press('Tab');
    const changed=await page.evaluate(()=>MOCKUP_CASH.calculate().map(r=>r.closing));
    assert.deepEqual(changed.slice(0,8),original.slice(0,8),'Real deve permanecer intacto');
    for(let i=8;i<12;i++)assert.ok(Math.abs(changed[i]-original[i]-1)<1e-8,'Saldo deve propagar a alteração');
    await page.locator('[data-action="saveFc"]').click();
    await page.locator('[name="f0"]').fill('Cenário de avaliação');
    await page.locator('dialog button[type="submit"]').click();
    assert.ok(await page.getByText('Cenário de avaliação',{exact:true}).count());
    await page.locator('[data-action="cashOpen:0"]').click();
    assert.equal(await page.locator('[data-fc-input="receipt"][data-fc-month="8"]').inputValue(),'43,00');
    await page.evaluate(()=>MOCKUP_CASH.reset());
    await page.evaluate(()=>VECTON_MOCKUP.navigate('dashboard'));
    await page.locator('[data-theme-choice="dark"]').click();
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    const result={screens:screens.length,productionViewsCovered:realViews.length,productionReportsCovered:new Set(reportIds).size,viewports:[1440,1280,390],themes:['clear','dark'],renders:screens.length*6,errors,external,overflow};
    fs.writeFileSync(path.join(__dirname,'review-results.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
    assert.deepEqual(errors,[],'Erros JS');assert.deepEqual(external,[],'Requisições externas');assert.deepEqual(overflow,[],'Overflow de página');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
