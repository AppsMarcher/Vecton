(function(window){
  'use strict';
  const months=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const paths={print:'<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',email:'<path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/>',excel:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'};
  const icon=type=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[type]}</svg>`;
  function menu(disabled){return `<div class="fc-export"><button type="button" class="ghost-button" data-fc-export-toggle aria-haspopup="true" aria-expanded="false" ${disabled?'disabled':''}>${icon('print')}Exportar</button><div class="fc-export-menu" hidden>${[['print','Imprimir'],['email','Enviar por e-mail'],['excel','Baixar Excel']].map(([key,label])=>`<button type="button" data-fc-export="${key}">${icon(key)}${label}</button>`).join('')}</div></div>`;}
  function dataset(ctx){
    const r=ctx.report, selection=window.VECTON_FC_MODEL.select(r,ctx.type,ctx.month);
    const indexes=ctx.detail?months.map((_,i)=>i):Array.from({length:selection.end-selection.start},(_,i)=>selection.start+i);
    const rows=[];
    const add=(label,values,position=false,initial=false)=>rows.push([label,...indexes.map(i=>values[i]),position?(initial?values[indexes[0]]:values[indexes.at(-1)]):indexes.reduce((sum,i)=>sum+values[i],0)]);
    add('Máquinas vendidas',r.quantities);
    add('Saldo inicial',[r.opening,...r.values.balance.slice(0,11)],true,true);
    const visit=parent=>r.structure.filter(n=>n.parent_key===parent).sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name,'pt-BR')).forEach(n=>{add(n.name,r.values[n.seed_key]);visit(n.seed_key);});
    visit(null);add('Geração líquida de caixa',r.values.net);add('Saldo final',r.values.balance,true);
    return {header:['Atividade',...indexes.map(i=>`${months[i]}/${r.year} · ${r.kinds[i]}`),ctx.detail||ctx.type==='year'?String(r.year):'Período'],rows};
  }
  function bind(root,getContext,deps){
    const toggle=root.querySelector('[data-fc-export-toggle]'), popup=root.querySelector('.fc-export-menu');
    const close=()=>{popup.hidden=true;toggle.setAttribute('aria-expanded','false');};
    toggle.onclick=()=>{popup.hidden=!popup.hidden;toggle.setAttribute('aria-expanded',String(!popup.hidden));};
    root.addEventListener('click',e=>{if(!e.target.closest('.fc-export'))close();});
    root.addEventListener('keydown',e=>{if(e.key==='Escape'){close();toggle.focus();}});
    toggle.parentElement.addEventListener('focusout',e=>{if(!toggle.parentElement.contains(e.relatedTarget))close();});
    root.querySelectorAll('[data-fc-export]').forEach(button=>button.onclick=async()=>{
      close();const ctx=getContext();if(!ctx.report)return;
      const esc=deps.escapeHtml, data=dataset(ctx), title=`Fluxo de Caixa${ctx.detail?' detalhado':''} — ${ctx.period}`, scenario=ctx.scenario+(ctx.dirty?' · Alterações não salvas':''), filename=`Fluxo-de-Caixa-${ctx.report.year}-${ctx.type}-${ctx.month}`;
      const table=`<table><thead><tr>${data.header.map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row=>`<tr>${row.map((v,i)=>i?`<td>${Number(v).toLocaleString('pt-BR',{maximumFractionDigits:0})}</td>`:`<th>${esc(v)}</th>`).join('')}</tr>`).join('')}</tbody></table>`;
      const charts=ctx.detail?'':Array.from(root.querySelectorAll('.fc-trend svg,.fc-bridge svg')).map(svg=>`<div class="chart">${svg.outerHTML}</div>`).join('');
      const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:7mm}body{font:10px Arial;color:#172033}h1{font-size:20px}table{border-collapse:collapse;width:100%;font-size:8px}th,td{padding:5px;border-bottom:1px solid #ddd;text-align:right;white-space:nowrap}th:first-child{text-align:left;white-space:normal;min-width:160px}thead{display:table-header-group}tr{break-inside:avoid}.chart{display:inline-block;width:48%;vertical-align:top;break-inside:avoid}svg{width:100%;height:auto}svg text{fill:#334155;font:11px Arial}.fc-grid-line{stroke:#ddd}.fc-crosshair{display:none}</style></head><body><h1>${esc(title)}</h1><p>${esc(scenario)} · Valores em R$ · Máquinas vendidas em unidades</p>${charts}${table}</body></html>`;
      try {
        if(button.dataset.fcExport==='excel'){
          if(!window.XLSX)throw new Error('O gerador de Excel não está disponível. Atualize a página.');
          const X=window.XLSX, book=X.utils.book_new(),sheet=X.utils.aoa_to_sheet([[title],[scenario],['Valores em R$ · Máquinas vendidas em unidades'],[],data.header,...data.rows]);
          sheet['!cols']=[{wch:48},...data.header.slice(1).map(()=>({wch:22}))];
          for(let r=5;r<data.rows.length+5;r++)for(let c=1;c<data.header.length;c++)sheet[X.utils.encode_cell({r,c})].z='#,##0';
          X.utils.book_append_sheet(book,sheet,'Fluxo de Caixa');X.writeFile(book,filename+'.xlsx');
        }else if(button.dataset.fcExport==='print'){
          const page=window.open('','_blank');if(!page)throw new Error('Libere pop-ups para imprimir o relatório.');
          page.document.write(html);page.document.close();page.focus();setTimeout(()=>page.print(),400);
        }else email({html,title,scenario,filename:filename+'.pdf'},deps,toggle);
      }catch(e){await deps.alert(e.message);}
    });
  }
  function email(report,deps,focus){
    const session=deps.getUserId(),esc=deps.escapeHtml,dialog=document.createElement('dialog');dialog.className='fc-email-dialog';
    dialog.innerHTML=`<form><h3>Enviar por e-mail</h3><p>${esc(report.title)} · ${esc(report.scenario)}</p><label>Para<input name="to" required placeholder="email@empresa.com, outro@empresa.com"></label><label>Cc<input name="cc" placeholder="Opcional"></label><label>Assunto<input name="subject" required value="${esc(report.title)}"></label><p>Anexo: ${esc(report.filename)}</p><label>Mensagem<textarea name="body" rows="5">Olá,\n\nSegue em anexo o ${esc(report.title)}.\nCenário: ${esc(report.scenario)}.</textarea></label><p role="status"></p><div class="fc-email-actions"><button type="button" class="ghost-button" data-close>Cancelar</button><button class="primary-button" type="submit">Enviar</button></div></form>`;
    document.body.appendChild(dialog);dialog.showModal();const form=dialog.querySelector('form'),status=dialog.querySelector('[role=status]');
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>{dialog.remove();focus.focus();};
    form.onsubmit=async event=>{
      event.preventDefault();const fields=new FormData(form),parse=v=>String(v||'').split(/[,;]/).map(v=>v.trim()).filter(Boolean),to=parse(fields.get('to')),cc=parse(fields.get('cc'));
      if(!to.length||to.concat(cc).some(v=>!/^\S+@[^\s@]+\.[^\s@]+$/.test(v))){status.textContent='Informe destinatários válidos, separados por vírgula.';return;}
      if(session!==deps.getUserId()){status.textContent='A sessão mudou. Reabra o relatório.';return;}
      const controls=[...form.querySelectorAll('input,textarea,button')];controls.forEach(el=>el.disabled=true);status.textContent='Gerando PDF e enviando e-mail…';
      try{await deps.sendEmail({to,cc:cc.length?cc:undefined,subject:String(fields.get('subject')).trim(),body_text:String(fields.get('body')),filename:report.filename,html:report.html});status.textContent='E-mail enviado com sucesso.';dialog.querySelector('[data-close]').disabled=false;dialog.querySelector('[data-close]').textContent='Fechar';}
      catch(e){status.textContent=e.message||'Falha no envio.';controls.forEach(el=>el.disabled=false);}
    };
  }
  window.VECTON_FC_EXPORT={menu,bind,dataset};
})(window);
