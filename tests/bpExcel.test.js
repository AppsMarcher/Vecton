const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const deps='../artifacts/bp-test-deps/node_modules/';
const ExcelJS=require(deps+'exceljs'),XLSX=require(deps+'xlsx');
const window={};
for(const file of ['bpReportModel.js','bpExport.js'])vm.runInNewContext(fs.readFileSync('src/modules/balance/'+file,'utf8'),{window});
const M=window.VECTON_BP_REPORT_MODEL,E=window.VECTON_BP_EXPORT;
// Um analítico por linha do relatório, com saldo conhecido.
const prefix={assetCurrent:'1.1',assetNoncurrent:'1.2',liabilityCurrent:'2.1',liabilityNoncurrent:'2.2',equity:'2.3'};
const plan=[],rows=[];let n=0;
for(const section of M.SECTIONS)for(const line of section.lines){
  const key=line.id==='taxNoncurrent'||line.id==='taxCurrent'?'Impostos a Recuperar':line.keys[0],id='a'+(++n);
  plan.push({id,account_code:`${prefix[section.id]}.${n}`,group_key:key,node_class:'Analitica',active:true});rows.push({account_id:id,amount:1000+n+.25});
}
const model=M.build(plan,[{branch_id:null,rows}],[{branch_id:null,rows}],{year:2025,month:10},{current:500},2026);
(async()=>{
 const book=E.buildWorkbook(ExcelJS,model);
 const read=new ExcelJS.Workbook();await read.xlsx.load(await book.xlsx.writeBuffer());
 const sheet=read.getWorksheet('BP');
 assert.equal(sheet.pageSetup.orientation,'landscape');assert.equal(sheet.pageSetup.paperSize,9);assert.equal(sheet.pageSetup.horizontalCentered,true);
 assert.equal(sheet.views[0].showGridLines,false);
 assert.match(sheet.headerFooter.oddHeader,/MARCHER BRASIL AGROINDUSTRIAL S\.A\./);assert.match(sheet.headerFooter.oddFooter,/Contador/);
 // Mesmas posições do modelo anexado (BP Excel.xlsx), quando disponível.
 const templatePath='../BP Excel.xlsx';
 if(fs.existsSync(templatePath)){
  const template=XLSX.readFile(templatePath).Sheets.BP;
  for(const [address,cell] of Object.entries(template)){
   if(address[0]==='!'||cell.v===undefined)continue;
   const mine=sheet.getCell(address).value;
   if(cell.t==='s'){if(!/^Obrigaçãoes/.test(cell.v))assert.equal(mine,cell.v,`${address}: texto`);else assert.equal(mine,'Obrigações Trabalhistas');}
   else if(address.endsWith('3')&&/^[DEIJ]3$/.test(address))assert.equal(mine,address[0]==='D'||address[0]==='I'?2025:2024);
   else if(/^[DEIJ]\d+$/.test(address)&&cell.v!==0)assert.equal(typeof mine,'number',`${address}: valor`);
  }
 }
 assert.equal(sheet.getCell('D6').numFmt,'#,##0');assert.equal(sheet.getCell('B3').font.bold,true);assert.equal(sheet.getCell('B6').alignment.indent,2);
 assert.equal(sheet.getCell('B38').value,'TOTAL DO ATIVO');assert.equal(sheet.getCell('G38').value,'TOTAL DO PASSIVO');
 assert.equal(sheet.getCell('D38').border.top.style,'thin');assert.equal(sheet.getCell('D38').border.bottom.style,'thin');
 assert.equal(sheet.getCell('G31').value,'Reserva de Lucros');assert.equal(sheet.getCell('I31').value,model.sections.find(s=>s.id==='equity').lines.find(l=>l.id==='profitReserve').current/100);
 console.log('BP Excel: layout do modelo anexo (posições, fontes, bordas, A4 paisagem, cabeçalho e rodapé) OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
