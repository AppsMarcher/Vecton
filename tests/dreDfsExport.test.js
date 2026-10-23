const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {chromium}=require('playwright');
const deps='../artifacts/bp-test-deps/node_modules/';
const ExcelJS=require(deps+'exceljs'),XLSX=require(deps+'xlsx');
const window={};
vm.runInNewContext(fs.readFileSync('src/modules/reports/dreDfsExport.js','utf8'),{window});
const E=window.VECTON_DFS_EXPORT;
// Helper real do app: bloco de comparação Mês/Acumulado.
const app=fs.readFileSync('app.js','utf8');
const scope={};
vm.runInNewContext(app.slice(app.indexOf('function computeDreCompareCell('),app.indexOf('// Markup dos 8 <td>'))+'\nthis.fn=computeDreCompareCell;',scope);
const compareCell=scope.fn;
// Mesmas linhas, tipos e ordem do buildDreDfsRealReport.
const spec=[['receitaBruta','Receita Bruta','section'],['vendas','Venda de Produtos e Serviços','value'],['deducoes','Deduções','section'],['impostos','Impostos s/ Vendas','detail'],
 ['receitaLiquida','Receita Líquida','subtotal'],['cpv','Custo dos Produtos Vendidos','section'],['materiais','Matéria-prima','detail'],['demaisCustos','Demais Custos','detail'],
 ['lucroBruto','Lucro Bruto','subtotal'],['despOp','Despesas / Receitas Operacionais','section'],['despComerciais','Despesas Comerciais','detail'],['despGA','Despesas Gerais e Administrativas','detail'],
 ['recFinanceiras','Receitas Financeiras','detail'],['despFinanceiras','Despesas Financeiras','detail'],['outrosResultados','Outros Resultados','detail'],['resultadoOp','Resultado Operacional','subtotal'],
 ['lair','Resultado antes IRPJ/CSLL','subtotal'],['irpj','Provisão para IRPJ / CSLL','detail'],['resultadoExerc','Resultado do Exercício','result'],['resultadoExercPct','Resultado do Exercício %RL','percent'],
 ['ebitda','Ebitda','result'],['ebitdaPct','Ebitda %RL','percent']];
const report=factor=>{
  const lines=spec.map(([id,label,kind],i)=>{
    if(kind==='section')return{id,label,kind,months:[]};
    const months=Array.from({length:12},(_,m)=>kind==='percent'?(m+1)/100*factor:(i+1)*1000.5*(m+1)*factor*(i%2?-1:1));
    return{id,label,kind,months,total:months.reduce((a,b)=>a+b,0),numerator:months};
  });
  return{lines,receitaLiquida:Array(12).fill(1000)};
};
const real=report(1),other=report(.9),byId=new Map(other.lines.map(l=>[l.id,l]));
const snapshot=withCompare=>({title:'DRE DFs Real',year:2026,month:9,sourceLabel:'real',compareLabel:'Fcst 5+7 2026',
  lines:real.lines.map(l=>({id:l.id,label:l.label,kind:l.kind,months:l.months,total:l.total,compare:withCompare?compareCell(l,byId.get(l.id),9,real.receitaLiquida,other.receitaLiquida):null}))});
(async()=>{
 for(const withCompare of [false,true]){
  const read=new ExcelJS.Workbook();await read.xlsx.load(await E.buildWorkbook(ExcelJS,snapshot(withCompare)).xlsx.writeBuffer());
  const sheet=read.getWorksheet('DRE DFs');
  assert.equal(sheet.views[0].showGridLines,false);
  assert.equal(sheet.getCell('C1').value,'jan');assert.equal(sheet.getCell('N1').value,'dez');assert.equal(sheet.getCell('O1').value,2026);assert.equal(sheet.getCell('C2').value,'real');
  assert.equal(sheet.getCell('C1').font.bold,true);assert.equal(sheet.getCell('C2').font.italic,true);assert.equal(sheet.getCell('C2').font.color.argb,'FF0070C0');
  // Estrutura do modelo anexo (DRE DFs.xlsx), sem a linha "Volumes de Vendas": rótulos 2 linhas acima.
  const templatePath='../DRE DFs.xlsx';
  if(fs.existsSync(templatePath)){
   const template=XLSX.readFile(templatePath).Sheets['DRE DFs'];
   const norm=v=>String(v).trim().replace('IRJP','IRPJ');
   for(const [address,cell] of Object.entries(template)){
    if(address[0]==='!'||cell.v===undefined||!/^B\d+$/.test(address))continue;
    const row=Number(address.slice(1));if(row<6)continue;
    assert.equal(norm(sheet.getCell('B'+(row-2)).value),norm(cell.v),'B'+(row-2));
    if(/^(Receita Líquida|Lucro Bruto|Resultado Operacional|Resultado do Exercício)$/.test(norm(cell.v)))assert.equal(sheet.getCell('B'+(row-2)).fill.fgColor.argb,'FFF2F2F2',address+' faixa');
   }
  }
  assert.equal(sheet.getCell('B4').value,'Receita Bruta');assert.equal(sheet.getCell('B5').value,'Venda de Produtos e Serviços');
  assert.equal(sheet.getCell('C5').numFmt,'#,##0');assert.equal(sheet.getCell('B5').alignment.indent,1);assert.equal(sheet.getCell('B5').font.bold,true);
  assert.equal(sheet.getCell('C5').value,real.lines[1].months[0]);assert.equal(sheet.getCell('O5').value,real.lines[1].total);
  assert.equal(sheet.getCell('B35').value,'Ebitda %RL');assert.equal(sheet.getCell('C35').numFmt,'0.0%');
  assert.equal(sheet.getRow(6).height,7.5);
  if(withCompare){
   assert.equal(sheet.getCell('Q1').value,'Mês');assert.equal(sheet.getCell('V1').value,'Acumulado');
   assert.deepEqual(['Q','R','S','T'].map(c=>sheet.getCell(c+'2').value),['Real','Fcst 5+7 2026','Var R$','Var %']);
   const c=compareCell(real.lines[1],byId.get('vendas'),9,real.receitaLiquida,other.receitaLiquida);
   assert.equal(sheet.getCell('Q5').value,c.realMonth);assert.equal(sheet.getCell('R5').value,c.compareMonth);assert.equal(sheet.getCell('S5').value,c.varMonth);
   assert.equal(sheet.getCell('V5').value,c.realYtd);assert.equal(sheet.getCell('T5').numFmt,'0.0%');
  }else assert.equal(sheet.getCell('Q1').value,null);
 }
 // PDF: mesma visão da tela, A4 paisagem, uma página, centralizado.
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const withCompare of [true,false]){
   const html=E.printHtml(snapshot(withCompare),v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;'));
   assert.match(html,/size:A4 landscape/);
   assert.match(html,/Ricardo Guimarães Filho<br>Contador/);
   const page=await browser.newPage();await page.setContent(html);
   const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});
   assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g)||[]).length,1);
   const media=pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);assert.ok(Number(media[1])>Number(media[2]),'paisagem');
   await page.setViewportSize({width:1123,height:794});
   const box=await page.evaluate(()=>{const s=document.querySelector('.sheet').getBoundingClientRect(),t=document.querySelector('table');return{l:s.left,r:innerWidth-s.right,overflow:t.scrollWidth-t.clientWidth};});
   assert.ok(Math.abs(box.l-box.r)<2,'centralizado');assert.ok(box.overflow<=1,'tabela cabe na largura');
   assert.ok(await page.evaluate(()=>document.querySelector('.signature').getBoundingClientRect().top>document.querySelector('table').getBoundingClientRect().bottom),'assinatura abaixo da tabela');
   assert.equal(await page.locator('thead .group').count(),withCompare?3:1);
   if(withCompare)await page.screenshot({path:process.env.DFS_SHOT||'nul'}).catch(()=>{});
   await page.close();
  }
 }finally{await browser.close();}
 console.log('DRE DFs export: Excel no modelo anexo (com e sem comparação) e PDF A4 paisagem em uma página OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
