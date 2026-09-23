/* Modelo demonstrativo do mockup. Valores em milhões de reais.
   Mantém as identidades de caixa e preserva meses Real na simulação. */
window.MOCKUP_CASH = (() => {
  const months=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const target=[12.2,11.4,9.8,11.8,12.4,13.2,12.6,12.6,15.8,18,19.6,22];
  let previous=12.6;
  const base=target.map((closing,i)=>{
    const receipt=[28,31,29,35,33,39,37,39.48,42,43,44,46][i];
    const payment=i===8?-32.4:-receipt*.77;
    const investment=-4.8;
    const financing=closing-previous-receipt-payment-investment;
    previous=closing;
    return {receipt,payment,investment,financing,quantity:[93,103,97,117,110,130,123,132,140,143,147,153][i]};
  });
  let working=structuredClone(base);
  const scenarios=[];
  const calculate=()=>{
    let opening=12.6;
    return working.map((row,i)=>{
      const operating=row.receipt+row.payment;
      const net=operating+row.investment+row.financing;
      const closing=opening+net;
      const result={...row,opening,operating,net,closing,month:months[i],classification:i<8?'Real':'Fcst'};
      opening=closing;
      return result;
    });
  };
  return {
    months,calculate,scenarios,
    update(index,key,value){if(index<8||!['receipt','payment','investment','financing','quantity'].includes(key)||!Number.isFinite(value))return false;if(key==='quantity'&&(!Number.isInteger(value)||value<0))return false;working[index][key]=value;return true;},
    reset(){working=structuredClone(base);},
    save(name){scenarios.push({name,rows:structuredClone(working)});},
    open(index){working=structuredClone(scenarios[index]?.rows||base);},
    summarize(period,month){const all=calculate(),end=months.indexOf(month),rows=period==='Ano'?all:period==='YTD'?all.slice(0,end+1):[all[end]];return {rows,opening:rows[0].opening,closing:rows.at(-1).closing,min:Math.min(...rows.map(r=>r.closing)),...Object.fromEntries(['receipt','payment','operating','investment','financing','net','quantity'].map(k=>[k,rows.reduce((sum,r)=>sum+r[k],0)]))};}
  };
})();
