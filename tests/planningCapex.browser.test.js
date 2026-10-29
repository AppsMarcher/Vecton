const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLANNING_PLAYWRIGHT_LIB || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<style>:root{--text:#25334a;--text-soft:#677994;--text-faint:#677994;--panel:white;--panel-alt:#f6f8fc;--line:#d7dfed;--blue:#365fe6}body{font:14px Arial;background:white;margin:0}.reports-card-grid{display:flex;gap:14px;flex-wrap:wrap}.reports-report-card{width:184px;border:1px solid var(--line);border-top:3px solid;padding:16px;border-radius:12px;background:white;text-align:left}.rrc-icon-wrap{display:inline-flex;padding:8px;border:1px solid;border-radius:9px}.rrc-icon-wrap svg{width:18px;height:18px}.reports-report-card strong,.rrc-subtitle{display:block;margin-top:9px}.rrc-subtitle{font-size:12px;color:var(--text-soft)}</style><main id="planning"></main>');
    for(const name of ['planningCore','planningFatCore','planningFatViews','planningViews','planningModule','planningFatModule']) await page.addScriptTag({path:path.join(__dirname,`../src/modules/planning/${name}.js`)});
    await page.addStyleTag({path:path.join(__dirname,'../src/modules/planning/planning.css')});
    await page.evaluate(async()=>{
      const scenario={id:'scenario',name:'Budget 2027',reference_year:2027,status:'open',planning_version:1};
      const form={id:'capex',scenario_id:'scenario',code:'CPX',name:'CAPEX · Investimentos',form_type:'capex',status:'released',revision:1,access_mode:'write'};
      const types=[{id:'machine',name:'Máquinas e equipamentos',annual_rate:10,nature:'depreciation',active:true,row_version:1}];
      const items=[{id:'asset',form_id:'capex',cost_center_id:'production',description:'Centro de usinagem CNC',type_id:'machine',row_version:1}];
      let entries=[{line_id:'asset',cost_center_id:'production',reference_month:3,amount:240000,row_version:1}];
      const context={version:1,capex_enabled:true,is_admin:true,user_id:'admin',scenarios:[scenario],forms:[...Array.from({length:9},(_,i)=>({id:'opex'+i,scenario_id:'scenario',code:String(i+1).padStart(2,'0'),name:'Formulário '+(i+1),form_type:'opex',status:'released',revision:1,access_mode:'write'})),form],capex_types:types,cost_centers:[{id:'production',cost_center_name:'Produção',cost_center_number:'1101',active:true},{id:'admin',cost_center_name:'Administrativo',cost_center_number:'2101',active:true}],months:Array.from({length:12},(_,i)=>({reference_month:i+1,source_type:i===0?'real':'forms'})),accounts:[],users:[{user_id:'writer',full_name:'Gestor'}],access:[],runs:[],lines:[]};
      context.capex_cost_centers=context.cost_centers;
      window.fixture=context;window.calls=[];window.exported=[];
      window.ExcelJS={Workbook:class{constructor(){this.xlsx={writeBuffer:async()=>new Uint8Array()};}addWorksheet(){return{addRow:row=>exported.push(row),getColumn:()=>({})};}}};
      window.testModule=VECTON_PLANNING.createPlanningModule({escapeHtml:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),MONTH_LABELS:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],state:{currentPeriod:{year:2027}},resolveOrganizationId:async()=>'org',openScenarioDreReport:()=>{},callSupabaseRpc:async(name,args)=>{
        calls.push({name,args});
        if(name==='planning_context')return JSON.parse(JSON.stringify(context));
        if(name==='planning_capex_read'){
          const scoped=items.filter(i=>args.p_cc_ids.includes(i.cost_center_id));
          const scopedEntries=entries.filter(e=>scoped.some(i=>i.id===e.line_id));
          const preview=args.p_cells||[];
          const value=Number(preview.find(c=>c.line_id==='asset'&&c.month===3)?.amount??entries.find(c=>c.line_id==='asset'&&c.reference_month===3)?.amount??0);
          return{revision:form.revision,items:JSON.parse(JSON.stringify(scoped)),entries:JSON.parse(JSON.stringify(scopedEntries)),depreciation:scoped.length?Array.from({length:9},(_,i)=>({cost_center_id:'production',account_number:'4110220601',reference_month:i+4,amount:value/120})):[]};
        }
        if(name==='planning_integrate_all')return{ok:true,rows_written:1,notes:[]};
        const p=args.p_payload||{};
        if(name==='planning_capex_write'){
          if(args.p_action==='save_values')entries=p.cells.map(c=>({...c,reference_month:c.month,row_version:c.version+1}));
          if(args.p_action==='save_item'){
            if(p.id){const item=items.find(i=>i.id===p.id);Object.assign(item,{description:p.description,type_id:p.type_id,row_version:item.row_version+1});}
            else items.push({id:'asset'+items.length,form_id:'capex',description:p.description,type_id:p.type_id,cost_center_id:p.cost_center_id,row_version:1});
            form.revision++;
          }
          if(args.p_action==='delete_item'){items.splice(items.findIndex(i=>i.id===p.id),1);form.revision++;}
          if(args.p_action==='save_type'){const t=types.find(t=>t.id===p.id);Object.assign(t,p);}
          return{ok:true,rows_written:9,skipped_items:0};
        }
        if(args.p_action==='save_form'){if(p.id)Object.assign(form,p);else return{id:'new'};}
        return{ok:true};
      }});
      await testModule.open(document.getElementById('planning'),scenario,()=>{},{manage:true});
    });
    assert.deepEqual(await page.locator('.pl-tabs [data-pl="tab"]').allTextContents(),['Formulários','Fontes dos meses','Integrações no DRE']);
    assert.equal(await page.locator('[data-report="capexBudget"]').getAttribute('data-pl'),'report');
    assert.equal(await page.locator('.pl-capex-list .pl-code').innerText(),'CPX');
    assert.equal(await page.locator('.pl-list:not(.pl-capex-list) .pl-list-row').count(),9);
    await page.getByRole('button',{name:'+ Novo formulário',exact:true}).click();assert.equal(await page.locator('#pl-form-code').inputValue(),'10');await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    fs.mkdirSync(path.join(__dirname,'../artifacts/capex'),{recursive:true});
    await page.screenshot({path:path.join(__dirname,'../artifacts/capex/formularios.png'),fullPage:true});
    await page.locator('.pl-capex-list [data-pl="open-form"]').click();
    const addBox=await page.getByRole('button',{name:'+ Investimentos',exact:true}).boundingBox(),ccBox=await page.locator('.pl-cc').boundingBox();assert(addBox.x<ccBox.x);
    assert.equal(await page.locator('.pl-reports').count(),0);
    assert.equal(await page.getByRole('textbox',{name:'Centro de usinagem CNC Jan',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('textbox',{name:'Centro de usinagem CNC Mar',exact:true}).isDisabled(),false);
    await page.getByRole('textbox',{name:'Centro de usinagem CNC Mar',exact:true}).fill('120000');
    await page.waitForFunction(()=>document.querySelector('#pl-capex-preview-state').textContent==='Somente leitura · R$');
    assert.match(await page.locator('#pl-capex-depreciation').innerText(),/1.000,00/);
    await page.getByRole('button',{name:'Salvar valores',exact:true}).click();
    await page.getByRole('button',{name:'Entendi',exact:true}).click();
    assert.equal(await page.getByRole('textbox',{name:'Centro de usinagem CNC Mar',exact:true}).inputValue(),'120.000,00');
    await page.getByRole('button',{name:'Integrar no DRE e OPEX',exact:true}).click();await page.getByRole('button',{name:'Confirmar',exact:true}).click();
    assert.equal(await page.evaluate(()=>calls.filter(c=>c.name==='planning_integrate_all').length),1);
    await page.getByRole('button',{name:'Exportar Excel',exact:true}).click();await page.waitForFunction(()=>exported.length>5);assert.equal(await page.evaluate(()=>exported.some(r=>r[0]==='Total depreciação e amortização do CAPEX')),true);
    await page.getByRole('button',{name:'+ Investimentos',exact:true}).click();await page.locator('#pl-item-name').fill('Bancada');await page.getByRole('button',{name:'Confirmar',exact:true}).click();assert.equal(await page.locator('[data-capex-field="description"]').count(),2);
    await page.locator('[data-capex-field="description"]').first().fill('Bancada revisada');await page.locator('[data-capex-field="description"]').first().press('Tab');await page.waitForFunction(()=>calls.some(c=>c.args?.p_action==='save_item'&&c.args.p_payload.description==='Bancada revisada'));
    await page.screenshot({path:path.join(__dirname,'../artifacts/capex/formulario.png'),fullPage:true});
    await page.locator('.pl-cc summary').click();await page.locator('[data-cc="admin"]').check();assert.equal(await page.getByRole('button',{name:'+ Investimentos',exact:true}).isDisabled(),true);assert.equal(await page.locator('[data-capex-field="description"]').first().isDisabled(),true);
    await page.getByRole('button',{name:'Voltar para o cenário',exact:true}).click();await page.locator('.pl-capex-list [data-pl="open-form"]').click();await page.getByRole('button',{name:'Parâmetros CAPEX',exact:true}).click();assert.match(await page.locator('.pl-app').innerText(),/10,00%/);
    await page.screenshot({path:path.join(__dirname,'../artifacts/capex/parametros.png'),fullPage:true});
    await page.evaluate(async()=>{fixture.is_admin=false;fixture.forms.find(f=>f.form_type==='capex').access_mode='read';fixture.capex_types=fixture.capex_types.map(t=>({id:t.id,name:t.name,active:t.active}));await testModule.open(document.getElementById('planning'),fixture.scenarios[0],()=>{});});
    await page.locator('.pl-capex-list [data-pl="open-form"]').click();assert.equal(await page.getByRole('button',{name:'Integrar no DRE e OPEX',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Parâmetros CAPEX',exact:true}).count(),0);assert.equal(await page.locator('[data-capex-field="description"]').first().isDisabled(),true);
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(__dirname,'../artifacts/capex/mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    assert.deepEqual(errors,[]);console.log('CAPEX browser: separated CPX, header, parameters, scoped grid, preview, editing, save, integration, export, read-only and mobile passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
