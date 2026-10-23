const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const window = {};
vm.runInNewContext(fs.readFileSync('src/modules/balance/bpReportModel.js','utf8'),{window});
const M = window.VECTON_BP_REPORT_MODEL;
const node = (id,code,key,type='Analitica') => ({id,account_code:code,group_key:key,node_class:type});
const plan = [node('cash','1.1.1.01','Caixa e equivalente de Caixa'),node('tax','1.2.1.01','Impostos a Recuperar'),
  node('shareholder','2.1.6.05.001','Empréstimos de Acionistas'),node('reserve','2.3.2.03.003','Resultado do Exercício'),
  node('capital','2.3.1.01.001','Capital Subscrito e Realizado'),node('syn','1.1',null,'Sintetica')];
const batch = (branch,cash,extra=[]) => ({branch_id:branch,rows:[{account_id:'cash',amount:cash},{account_id:'reserve',amount:999999},...extra]});
const model = M.build(plan,[batch('01',100,[{account_id:'syn',amount:5000},{account_id:'shareholder',amount:20},{account_id:'capital',amount:200}]),batch('02',50)],
  [batch('01',80)],{year:2026,month:10},{current:30,previous:-10});
assert.equal(model.current.date,'31/10/2026');assert.equal(model.previous.date,'31/12/2025');
const line = id => model.sections.flatMap(s=>s.lines).find(l=>l.id===id);
assert.equal(line('cash').current,15000); // consolida filiais sem duplicar sintéticas
assert.equal(line('profitReserve').current,3000); // DRE substitui o saldo BP, não soma
assert.equal(line('profitReserve').previous,0); // ignora tanto o saldo BP quanto eventual resultado DRE anterior
assert.equal(line('profitReserve').label,'Reserva de Lucros');
assert.equal(model.sections.flatMap(s=>s.lines).some(l=>l.label==='Resultado do Exercício'),false);
assert.equal(model.sections.find(s=>s.id==='liabilityNoncurrent').current,2000); // conforme imagem
assert.equal(line('taxNoncurrent').current,0);assert.equal(line('taxCurrent').current,0);
assert.equal(model.asset.current,15000);assert.equal(model.liability.current,25000);
assert.equal(M.periods({year:2024,month:2}).current.date,'29/02/2024');
assert.equal(M.periods({year:2026,month:1}).previous.date,'31/12/2025');
assert.throws(()=>M.periods({year:2026,month:13}),/inválida/);
const noCurrent = M.build(plan,[],[batch('01',80)],{year:2026,month:10},{previous:0});
assert.equal(noCurrent.asset.current,null);assert.equal(noCurrent.liability.current,null);assert.equal(noCurrent.asset.previous,8000);
assert.equal(noCurrent.liability.previous,0);

const missingDre = M.build(plan,[batch('01',10)],[],{year:2026,month:10});
assert.equal(missingDre.liability.current,0);assert.equal(missingDre.asset.current,1000);
assert.throws(()=>M.build(plan,[batch('01',1),batch('01',2)],[],{year:2026,month:10}),/sobrepostos/);
assert.throws(()=>M.build(plan,[batch(null,1),batch('02',2)],[],{year:2026,month:10}),/sobrepostos/);
assert.throws(()=>M.aggregate([{rows:[{account_id:'unknown',amount:1}]}],plan),/sem cadastro/);
assert.throws(()=>M.aggregate([{rows:[{account_id:'cash',amount:null}]}],plan),/ausente/);
assert.equal(M.aggregate([batch('01',.1),batch('02',.2)],plan).values.get('cash'),30);
// Executa os helpers reais do app: 51401001 é calculada, nunca lida como lançamento.
const app=fs.readFileSync('app.js','utf8');
const buildSource=app.slice(app.indexOf('function buildDreSocRealReport('),app.indexOf('// ─── DRE GERENCIAL REAL'));
const resultCallback=app.match(/getDreResult: async \(year, month\) => \{([\s\S]*?)\n  \},/)[1];
const dreNodes=[{code:'3',class:'Analitica',parentCode:null,name:'Receita'},{code:'4',class:'Analitica',parentCode:null,name:'Custo'},
  {code:'51401001',class:'Analitica',parentCode:null,name:'Resultado'}];
const scope={ROOT_DRE_NODE:{code:'ROOT'},normalizeCode:String,extractMonthFromDate:()=>1,
  getDreChildren:code=>dreNodes.filter(n=>n.parentCode===(code==='ROOT'?null:code)),
  zeroMonthArray:()=>Array(12).fill(0),sumMonthArrays:arrays=>Array.from({length:12},(_,m)=>arrays.reduce((sum,a)=>sum+a[m],0)),
  fetchActualsReportRowsForYear:async year=>year===2026 ? [
    {account_number:'3',reference_month:1,amount:100},{account_number:'4',reference_month:1,amount:-40},
    {account_number:'3',reference_month:2,amount:200},{account_number:'3',reference_month:11,amount:500},
    {account_number:'51401001',reference_month:1,amount:99999}
  ] : [{account_number:'3',reference_month:1,amount:80},{account_number:'3',reference_month:12,amount:20}]};
vm.createContext(scope);vm.runInContext(buildSource+`\nthis.getResult=async(year,month)=>{${resultCallback}};`,scope);
(async()=>{
 assert.equal(await scope.getResult(2026,10),260);
 assert.equal(await scope.getResult(2026,12),760);
 assert.equal(await scope.getResult(2025,12),100);
 console.log('BP report: closing dates, consolidation, keys, totals, missing data and actual DRE YTD exception OK');
})().catch(error=>{console.error(error);process.exitCode=1;});

const historic=M.build(plan,[batch('01',10)],[],{year:2025,month:12},{current:999},2026);
assert.equal(historic.sections.find(s=>s.id==='equity').lines.find(l=>l.id==='profitReserve').current,0);
assert.equal(historic.liability.current,0);
