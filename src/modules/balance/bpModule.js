(function(window){
 "use strict";
 function createModule(d){
  const M=window.VECTON_BP_MODEL,esc=d.escapeHtml,months=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  let mode='actual',origin='actualsLoad',generation=0,busy=false,selected=null,scenario='';
  const money=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  async function all(table,query){const rows=[];for(let offset=0;;offset+=1000){const page=await d.fetch(table,`${query}&limit=1000&offset=${offset}`);rows.push(...page);if(page.length<1000)return rows;}}
  function open(planned){mode=planned?'planned':'actual';origin=planned?'budgetLoad':'actualsLoad';selected=null;scenario='';d.navigate('bpLoad');}
  async function renderLoad(notification='',notificationError=false){
   if(d.getActiveView()!=='bpLoad'||busy)return;
   const root=d.root,token=++generation,user=d.getUserId(),period={...d.getPeriod()},source=mode;
   const current=()=>token===generation&&user===d.getUserId()&&d.getActiveView()==='bpLoad'&&d.isAdmin();
   root.textContent='Carregando Balanço Patrimonial…';
   if(!d.isAdmin()){root.textContent='Acesso restrito aos administradores.';return;}
   try{
    const org=await d.resolveOrganizationId();if(!current())return;
    const scope=`organization_id=eq.${org}&source_type=eq.${source}&reference_year=eq.${period.year}`;
    const [plan,scenarios,finals,drafts]=await Promise.all([
     all('bp_plan_nodes',`organization_id=eq.${org}&select=*&order=sort_order.asc,id.asc`),
     source==='planned'?all('forecast_scenarios',`organization_id=eq.${org}&reference_year=eq.${period.year}&select=id,name&order=id.asc`):[],
     all('bp_import_batches',`${scope}&superseded_at=is.null&select=id,file_name,reference_year,reference_month,scenario_id,applied_at&order=applied_at.desc,id.asc`),
     all('bp_import_drafts',`${scope}&select=id,file_name,reference_year,reference_month,scenario_id,revision,updated_at&order=updated_at.desc,id.asc`)
    ]);if(!current())return;
    const history=[...drafts.map(x=>({...x,draft:true})),...finals].sort((a,b)=>String(b.updated_at||b.applied_at).localeCompare(String(a.updated_at||a.applied_at)));
    if(!history.some(h=>h.id===selected))selected=history[0]?.id||null;
    if(!scenarios.some(s=>s.id===scenario))scenario=scenarios[0]?.id||'';
    root.innerHTML=`<div class="actuals-layout bp-load-layout"><section class="content-card actuals-intake-card"><div class="actuals-intake-header"><div class="actuals-intake-controls"><button class="actuals-period-trigger" data-period><span class="actuals-period-kicker">Período</span><strong>${months[period.month-1]}/${period.year}</strong></button><select class="actuals-mode-select" aria-label="Tipo da carga"><option>Carga completa</option></select></div><button class="ghost-button" data-template>Modelo</button></div>
     <form class="actuals-upload-form">${source==='planned'?`<label class="budget-target-wrap">Cenário de destino<select name="scenario" required>${scenarios.map(s=>`<option value="${esc(s.id)}" ${s.id===scenario?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>`:''}<label class="vecton-file-field">Arquivo<span class="vecton-file-trigger"><span class="vecton-file-btn">Selecionar arquivo</span><span class="vecton-file-name">Nenhum arquivo selecionado</span><input class="vecton-file-native" name="file" type="file" accept=".xlsx,.xls" required></span></label><div class="bp-load-actions"><button class="ghost-button" type="submit">Importar arquivo</button><button class="ghost-button" type="button" data-manual>Novo lote manual</button><button class="ghost-button" type="button" data-back>← Voltar</button></div></form><div class="actuals-upload-feedback ${notificationError?'is-error':''}" data-feedback role="status" aria-live="polite">${esc(notification)}</div></section>
     <section class="content-card actuals-batch-card"><span class="actuals-period-kicker">Histórico</span><h3 class="inline-card-title">Lotes</h3><div class="actuals-batch-list bp-load-history">${history.map(h=>`<button class="actuals-batch-item ${h.id===selected?'active':''}" data-batch="${esc(h.id)}"><div class="actuals-batch-item-head"><strong>${months[h.reference_month-1]}</strong><span class="actuals-badge ${h.draft?'is-warn':'is-ok'}">${h.draft?'Rascunho':'Aplicado'}</span></div><span>Ano base ${h.reference_year}</span><span>${esc(h.file_name)}</span><span>Carga completa${h.scenario_id?' · '+esc(scenarios.find(s=>s.id===h.scenario_id)?.name||'Cenário'):''}</span></button>`).join('')||'<p class="toolbar-note">Nenhuma carga aplicada.</p>'}</div></section>
     <section class="content-card actuals-detail-card" data-detail><p class="toolbar-note">Selecione um lote para consultar os saldos.</p></section></div>`;
    const form=root.querySelector('form'),feedback=root.querySelector('[data-feedback]'),detail=root.querySelector('[data-detail]');
    const run=async work=>{if(busy||!current())return;busy=true;const controls=[...root.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);try{await work();}catch(e){if(current()){feedback.classList.add('is-error');feedback.textContent=e.message;}}finally{busy=false;if(current())controls.forEach(([el,disabled])=>el.disabled=disabled);}};
    const reload=async(message,error=false)=>{busy=false;if(current())await renderLoad(message,error);};
    const save=async(rows,file,batch=null)=>{
     // Sempre grava o plano atual: um snapshot antigo nunca passaria na conferência do servidor.
     const id=await d.rpc('bp_save_draft',{p_org:org,p_id:batch?.draft?batch.id:null,p_revision:batch?.draft?batch.revision:null,p_year:batch?.reference_year||period.year,p_month:batch?.reference_month||period.month,p_source:source,p_scenario:batch?batch.scenario_id:scenario||null,p_file:file,p_rows:rows,p_plan:plan});
     selected=id;return id;
    };
    root.querySelector('[data-period]').onclick=()=>d.openPeriod?.();
    root.querySelector('[data-back]').onclick=()=>d.navigate(origin);
    form.elements.scenario?.addEventListener('change',()=>{scenario=form.elements.scenario.value;});
    form.elements.file.onchange=()=>{root.querySelector('.vecton-file-name').textContent=form.elements.file.files[0]?.name||'Nenhum arquivo selecionado';feedback.textContent='';};
    root.querySelector('[data-template]').onclick=()=>{try{if(!plan.some(n=>n.active&&n.node_class==='Analitica'))throw Error('Cadastre as contas analíticas no Plano BP.');const sheet=window.XLSX.utils.aoa_to_sheet([M.headers,...plan.filter(n=>n.active).map(n=>[String(n.account_code||n.source_name||''),n.name,n.node_class==='Analitica'?0:null,n.node_class==='Analitica'?'ANALITICA':'SINTETICA',n.node_class==='Analitica'?n.group_key:null])]);sheet['!cols']=[{wch:28},{wch:55},{wch:20},{wch:16},{wch:38}];const book=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(book,sheet,'BP');window.XLSX.writeFile(book,'modelo-carga-bp.xlsx');}catch(e){feedback.textContent=e.message;}};
    const ensureScenario=()=>{if(source==='planned'&&!scenario)throw Error('Selecione o cenário de destino.');};
    form.onsubmit=event=>{
     event.preventDefault();
     void run(async()=>{
      ensureScenario();
      const file=form.elements.file.files[0];
      if(!file||file.size>20*1024*1024)throw Error('Selecione um Excel de até 20 MB.');
      const book=window.XLSX.read(await file.arrayBuffer(),{type:'array'});
      if(!current())return;
      const rows=M.parseWorkbook(book,plan,window.XLSX);
      const target=source==='planned'?scenarios.find(s=>s.id===scenario)?.name:'Realizado';
      if(!await d.confirm(`Importar e aplicar os saldos BP de ${months[period.month-1]}/${period.year} — ${target}? A carga completa substituirá o lote anterior deste período e destino.`))return;
      if(!current())return;
      const draftId=await save(rows,file.name);
      if(!current())return;
      feedback.textContent='Aplicando carga BP…';
      try{
       selected=await d.rpc('bp_apply_draft',{p_org:org,p_id:draftId,p_revision:1});
      }catch(error){
       await reload(`Arquivo importado, mas não foi possível confirmar a aplicação automática: ${error.message}. Confira o status do lote; se estiver em rascunho, use Aplicar lote para tentar novamente.`,true);
       return;
      }
      await reload('Arquivo importado e lote aplicado automaticamente.');
     });
    };
    root.querySelector('[data-manual]').onclick=()=>void run(async()=>{ensureScenario();await save([],`Lote manual ${months[period.month-1]}/${period.year}`);await reload('Lote manual criado. Adicione as contas e seus saldos.');});
    root.querySelectorAll('[data-batch]').forEach(button=>button.onclick=()=>{selected=button.dataset.batch;void renderLoad();});
    if(!selected)return;
    const meta=history.find(h=>h.id===selected),table=meta.draft?'bp_import_drafts':'bp_import_batches';
    const [batch]=await d.fetch(table,`organization_id=eq.${org}&id=eq.${meta.id}&select=*`);if(!current())return;if(!batch)throw Error('O lote mudou. Atualize a tela.');batch.draft=meta.draft;
    const rows=batch.draft?batch.input_rows:batch.rows,snapshot=batch.plan_snapshot||plan;
    const check=()=>{try{M.parse([['CONTA','SALDO'],...rows.map(r=>[snapshot.find(n=>n.id===r.account_id)?.account_code||snapshot.find(n=>n.id===r.account_id)?.source_name,r.amount])],plan);return '';}catch(e){return e.message;}};
    const error=check(),status=batch.draft?(error?'Pendente':'Validado'):'Aplicado';
    const summary=[['Ano base',batch.reference_year],['Mês da carga',months[batch.reference_month-1]],['Tipo','Carga completa'],['Origem',batch.file_name],['Linhas',rows.length],['Válidas',rows.filter(r=>r.amount!=null&&Number.isFinite(Number(r.amount))).length],['Erros',error?1:0],['Status',status]];
    detail.innerHTML=`<div class="actuals-detail-head"><div><span class="actuals-period-kicker">Detalhe</span><h3>Ano ${batch.reference_year} • ${months[batch.reference_month-1]} • ${esc(batch.file_name)}</h3></div><div class="actuals-detail-actions"><button class="delete-button secondary-danger" data-delete>Excluir lote</button><button class="ghost-button" data-add>${batch.draft?'Adicionar lançamento':'Editar lote'}</button>${batch.draft?`<button class="ghost-button" data-apply ${error?'disabled':''}>Aplicar lote</button>`:''}</div></div><div class="actuals-summary-grid">${summary.map(([k,v])=>`<div class="actuals-summary-card"><span>${k}</span><strong>${esc(v)}</strong></div>`).join('')}</div><div class="actuals-log-shell"><div class="actuals-log-head"><strong>Log de importação</strong><span>${rows.length} conta(s) no lote.</span></div><div class="actuals-upload-feedback ${error?'is-error':'is-ok'}">${esc(error||'Lote sem erros. O resumo fica concentrado no cabeçalho do lote.')}</div></div><div data-editor></div><div class="actuals-rows-toolbar"><input class="actuals-rows-search" data-search placeholder="Buscar por conta, nome, chave agrupadora…" aria-label="Buscar contas"><span class="actuals-rows-count" data-count></span></div><div class="table-shell actuals-table-shell"><table class="data-table bp-load-table"><colgroup><col class="bp-load-col-index"><col class="bp-load-col-code"><col class="bp-load-col-name"><col class="bp-load-col-group"><col class="bp-load-col-amount"><col class="bp-load-col-status"><col class="bp-load-col-action"></colgroup><thead><tr><th>#</th><th>Conta</th><th>Nome da conta</th><th>Chave agrupadora</th><th>Saldo (R$)</th><th>Status</th><th>Ação</th></tr></thead><tbody data-rows></tbody></table></div>`;
    function drawRows(){const search=detail.querySelector('[data-search]').value.toLocaleLowerCase('pt-BR');const visible=rows.map((r,i)=>({r,i,n:snapshot.find(n=>n.id===r.account_id)})).filter(({n})=>[n?.account_code,n?.name,n?.group_key].join(' ').toLocaleLowerCase('pt-BR').includes(search));detail.querySelector('[data-count]').textContent=`${visible.length} linha(s)`;detail.querySelector('[data-rows]').innerHTML=visible.map(({r,i,n})=>`<tr><td>${i+1}</td><td>${esc(n?.account_code||n?.source_name||'')}</td><td>${esc(n?.name||'Conta não encontrada')}</td><td>${esc(n?.group_key||'')}</td><td>${money(r.amount)}</td><td>${r.amount==null?'Pendente':'Válido'}</td><td>${batch.draft?`<button class="ghost-button" data-edit="${i}">Editar</button> <button class="ghost-button" data-remove="${i}">Excluir</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="7">Nenhuma linha carregada para este lote.</td></tr>';detail.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editor(Number(b.dataset.edit)));detail.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>void run(async()=>{await save(rows.filter((_,i)=>i!==Number(b.dataset.remove)),batch.file_name,batch,snapshot);await reload('Lançamento excluído do rascunho.');}));}
    function editor(index=null){const row=index==null?null:rows[index],shell=detail.querySelector('[data-editor]');shell.innerHTML=`<form class="form-grid bp-load-editor"><label>Conta analítica<select name="account" required>${plan.filter(n=>n.active&&n.node_class==='Analitica'&&(!rows.some(r=>r.account_id===n.id)||n.id===row?.account_id)).map(n=>`<option value="${esc(n.id)}" ${n.id===row?.account_id?'selected':''}>${esc(n.account_code)} · ${esc(n.name)}</option>`).join('')}</select></label><label>Saldo (R$)<input name="amount" required inputmode="decimal" value="${row?esc(String(row.amount??'').replace('.',',')):''}"></label><div class="editor-actions"><button class="ghost-button" type="submit">Salvar lançamento</button><button class="ghost-button" type="button" data-cancel>Cancelar</button></div></form>`;shell.querySelector('[data-cancel]').onclick=()=>{shell.innerHTML='';};shell.querySelector('form').onsubmit=event=>{event.preventDefault();const f=event.target;void run(async()=>{const item={account_id:f.elements.account.value,amount:M.amount(f.elements.amount.value)};if(!item.account_id)throw Error('Selecione uma conta.');const next=rows.slice();if(index==null)next.push(item);else next[index]=item;await save(next,batch.file_name,batch,snapshot);await reload('Lançamento salvo.');});};}
    detail.querySelector('[data-search]').oninput=drawRows;drawRows();
    detail.querySelector('[data-add]').onclick=()=>{if(batch.draft)editor();else void run(async()=>{await save(rows,batch.file_name,batch,snapshot);await reload('Rascunho criado. O fechamento atual permanece até a aplicação.');});};
    detail.querySelector('[data-delete]').onclick=async()=>{if(!await d.confirm(`Excluir ${batch.draft?'o rascunho':'o lote aplicado e seus saldos'} de ${months[batch.reference_month-1]}/${batch.reference_year}?`))return;void run(async()=>{await d.rpc('bp_delete_batch',{p_org:org,p_id:batch.id,p_draft:!!batch.draft,p_revision:batch.revision||null});selected=null;await reload('Lote excluído.');});};
    detail.querySelector('[data-apply]')?.addEventListener('click',async()=>{if(error)return;if(!await d.confirm(`Aplicar os saldos BP de ${months[batch.reference_month-1]}/${batch.reference_year}? O lote anterior deste período e destino será excluído definitivamente.`))return;void run(async()=>{const refreshed=await save(rows,batch.file_name,batch);selected=await d.rpc('bp_apply_draft',{p_org:org,p_id:refreshed,p_revision:batch.revision+1});await reload('Lote aplicado. O lote substituído foi excluído.');});});
   }catch(e){if(token===generation)root.textContent=`Não foi possível carregar o BP: ${e.message}`;}
  }
  const report=window.VECTON_BP_REPORT.createModule(d);
  return{open,renderLoad,renderSelected:report.renderSelected,reset:()=>{generation++;selected=null;scenario='';d.root.innerHTML='';report.reset();}};
 }
 window.VECTON_BP={createModule};
})(window);
