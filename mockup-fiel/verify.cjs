const { chromium }=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[],failures=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8093/'))external.push(r.url());});
  fs.mkdirSync(path.join(__dirname,'previews'),{recursive:true});
  try{
    await page.goto('http://127.0.0.1:8093/mockup-fiel/');
    const frame=page.frames()[1];
    await frame.waitForFunction(()=>window.VECTON_ORIGINAL_PREVIEW&&window.PREVIEW_FIXTURES?.catalog);
    await page.waitForTimeout(300);
    const screens=await frame.evaluate(()=>VECTON_ORIGINAL_PREVIEW.screens);
    const result=[];
    const signature=()=>{
      const root=document.querySelector('.content-view.active')||document.body;
      return {headings:[...root.querySelectorAll('h1,h2,h3,h4,thead th')].map(e=>e.textContent.trim()),svg:root.querySelectorAll('svg').length,tables:root.querySelectorAll('table').length,paths:[...root.querySelectorAll('svg path')].map(e=>e.getAttribute('d'))};
    };
    for(const s of screens){
      if(s.id==='profile'||s.id==='login')continue;
      try{
        await frame.evaluate(id=>VECTON_ORIGINAL_PREVIEW.navigate(id),s.id);
        await page.waitForTimeout(180);
        await page.locator('#dark').click();
        await page.waitForTimeout(250);
        const dark=await frame.evaluate(signature);
        await page.locator('#clear').click();
        await page.waitForTimeout(250);
        const clear=await frame.evaluate(signature);
        assert.deepEqual(clear,dark,'Estrutura não pode mudar entre temas');
        const text=await frame.locator('.content-view.active').innerText();
        if(!text.trim())failures.push({id:s.id,error:'Tela sem conteúdo'});
        result.push({id:s.id,headings:clear.headings.slice(0,10),tables:clear.tables,svg:clear.svg,unchanged:true});
        if(['dashboard','cockpit','rps','rpsComercial','strategic','planning','report:comercialPainel','report:cashFlow','report:dreGerReal','report:comercialMapaGeografico','report:comercialPecasGeo'].includes(s.id)){
          await page.screenshot({path:path.join(__dirname,'previews',s.id.replace(':','-')+'-clear.png')});
          await page.locator('#dark').click();
          await page.waitForTimeout(250);
          await page.screenshot({path:path.join(__dirname,'previews',s.id.replace(':','-')+'-dark.png')});
          await page.locator('#clear').click();
          await page.waitForTimeout(250);
        }
      }catch(e){failures.push({id:s.id,error:e.message.slice(0,400)});}
    }
    await frame.evaluate(()=>VECTON_ORIGINAL_PREVIEW.navigate('strategic'));
    await page.waitForTimeout(150);
    const a3=frame.locator('[data-action="open-detail"]').first();
    if(await a3.count()){
      await a3.click();await page.waitForTimeout(200);
      await page.screenshot({path:path.join(__dirname,'previews','a3-detail-clear.png')});
    }
    await frame.evaluate(()=>VECTON_ORIGINAL_PREVIEW.navigate('report:cashFlow'));
    await page.waitForTimeout(150);
    await frame.locator('[data-fc-detail]').click();
    assert.equal(await frame.locator('.fc-detail-analytic').count(),76);
    await page.screenshot({path:path.join(__dirname,'previews','fc-detail-clear.png')});
    await frame.evaluate(()=>VECTON_ORIGINAL_PREVIEW.navigate('login'));
    await page.screenshot({path:path.join(__dirname,'previews','login-clear.png')});
    await page.setViewportSize({width:1280,height:900});
    await frame.evaluate(()=>VECTON_ORIGINAL_PREVIEW.navigate('dashboard'));
    await page.screenshot({path:path.join(__dirname,'previews','dashboard-clear-1280.png')});
    const report={screenCount:result.length,structureUnchanged:result.every(r=>r.unchanged),productionRenderers:true,errors,external,failures,screens:result};
    fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({...report,screens:undefined},null,2));
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failures,[]);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
