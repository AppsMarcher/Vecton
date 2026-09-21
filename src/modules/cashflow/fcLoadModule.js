(function(window) {
  "use strict";
  function createLoadModule(deps) {
    const root = deps.root, esc = deps.escapeHtml;
    let key = "", context = null, draft = null, file = null, busy = false, message = "", failed = false, version = 0;
    let batches = [], selected = null, showDraft = false;
    const amount = v => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
    const currentKey = () => `${deps.getUserId() || ""}:${deps.getPeriod().year}`;
    const canUse = () => deps.getUserId() && deps.canManage();
    function reset() { version++; batches = []; selected = null; showDraft = false; key = ""; context = null; draft = null; file = null; busy = false; message = ""; root.innerHTML = ""; }
    async function render() {
      if (deps.getActiveView() !== "fcLoad") return;
      if (!canUse()) { reset(); root.textContent = "Seu perfil não permite carregar Fluxo de Caixa."; return; }
      if (key !== currentKey()) { reset(); key = currentKey(); await refresh(); return; }
      draw();
    }
    async function refresh() {
      const token = ++version, target = key;
      busy = true; failed = false; message = "Consultando a carga anual e o Plano de Contas FC…"; context = null; draft = null; draw();
      try {
        const [result, history] = await Promise.all([deps.service.context(Number(deps.getPeriod().year)), deps.service.history()]);
        if (token !== version || target !== currentKey()) return;
        context = result; batches = history; selected = null; showDraft = false; message = "";
      } catch(e) { if (token === version) { failed = true; message = `Não foi possível consultar a carga FC. ${e.message}`; } }
      finally { if (token === version && target === currentKey()) { busy = false; draw(); } }
    }
    async function validate() {
      if (!file || busy || !canUse()) return;
      const token = ++version, target = key, year = Number(deps.getPeriod().year);
      busy = true; draft = null; failed = false; message = "Validando os 12 meses e os vínculos das contas…"; draw();
      try {
        const ctx = await deps.service.context(year);
        const result = await deps.service.prepare(file, year, ctx);
        if (token !== version || target !== currentKey()) return;
        context = ctx; draft = result; showDraft = true; selected = null; message = "Arquivo validado. Aplicando automaticamente…";
      } catch(e) { if (token === version) { failed = true; message = e.message; } }
      finally { if (token === version && target === currentKey()) { busy = false; draw(); } }
      if (token === version && target === currentKey() && draft && !failed) await apply();
    }
    async function apply() {
      if (!draft || busy || !canUse()) return;
      const selected = draft, target = key;
      if (target !== currentKey() || draft !== selected || busy || !canUse()) return;
      const token = ++version; busy = true; failed = false; message = "Aplicando carga anual…"; draw();
      try {
        await deps.service.apply(selected);
        if (token !== version || target !== currentKey()) return;
        draft = null; file = null; showDraft = false; deps.onApplied(selected.payload.year);
        context = { ...context, batch: { id: selected.payload.id, reference_year: selected.payload.year, file_name: selected.payload.file_name, applied_at: new Date().toISOString() } };
        batches = [context.batch, ...batches.filter(b => b.reference_year !== selected.payload.year)].sort((a,b)=>b.reference_year-a.reference_year);
        setAppliedDetail(selected.report, context.batch);
        message = `Carga de ${selected.payload.year} aplicada. O relatório de Fluxo de Caixa já pode ser consultado.`;
      } catch(e) { if (token === version) { failed = true; message = `Não foi possível confirmar a aplicação. ${e.message} Você pode tentar novamente; a mesma solicitação não duplica dados.`; } }
      finally { if (token === version && target === currentKey()) { busy = false; draw(); } }
    }
    function setAppliedDetail(report, batch) { selected = { report, batch }; }
    async function selectBatch(id) {
      if (busy || !canUse()) return;
      const batch = batches.find(b=>b.id===id);
      if (!batch) return;
      const token=++version, target=key;
      busy=true; failed=false; message="Carregando detalhe do lote…"; draw();
      try {
        const result=await deps.service.load(batch.reference_year);
        if (token!==version || target!==currentKey()) return;
        if (!result || result.batch.id!==id) throw new Error("Este lote foi substituído. Atualize o histórico.");
        selected=result; showDraft=false; message="";
      } catch(e) { if(token===version) {failed=true; message=e.message;} }
      finally {if(token===version && target===currentKey()) {busy=false;draw();}}
    }
    function downloadTemplate() {
      if (busy || !context || !canUse()) return;
      try {
        const year=Number(deps.getPeriod().year);
        const book=window.VECTON_FC_SERVICE.template(context.plan,year,context.today);
        window.XLSX.writeFile(book,`Modelo-FC-${year}.xlsx`);
      } catch(e) {failed=true;message=e.message;draw();}
    }
    function draw() {
      if (deps.getActiveView() !== "fcLoad" || !canUse()) return;
      const year = Number(deps.getPeriod().year), report = showDraft ? draft?.report : selected?.report;
      const detailYear = report?.year || year;
      root.innerHTML = `<div class="fc-dashboard">
        <div class="fc-heading"><div><h2>Carga do Fluxo de Caixa</h2><p>Janeiro a dezembro de ${year} · Empresa inteira · Carga completa</p></div><button type="button" class="ghost-button" data-fcl-period>${year} · Alterar ano</button></div>
        <div class="fc-load-top"><section class="fc-panel content-card actuals-intake-card"><header><div><small class="fc-eyebrow">ARQUIVO</small><h3>Fluxo de Caixa · Carga anual</h3></div><button class="ghost-button" type="button" data-fcl-template ${busy || !context ? "disabled" : ""}><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>Modelo</button></header>
          <p class="toolbar-note">Estrutura do FC.xls/FC.xlsx, independentemente do nome. Real, Fcst e Bud vêm do arquivo. Contas ausentes e células vazias serão zero. Ao importar, a carga será aplicada automaticamente se não houver erros.</p>
          <div class="fc-actions"><button type="button" class="vecton-file-btn" data-fcl-choose ${busy || !context ? "disabled" : ""}>Selecionar arquivo</button><input type="file" accept=".xls,.xlsx" data-fcl-file hidden ${busy || !context ? "disabled" : ""}><span class="toolbar-note">${file ? esc(file.name) : "Nenhum arquivo selecionado"}</span></div><div class="editor-actions"><button class="primary-button" type="button" data-fcl-validate ${busy || !file || !context ? "disabled" : ""}>Importar arquivo</button><button class="ghost-button" type="button" data-fcl-back>← Voltar</button></div>
          <p class="toolbar-note">${context?.batch ? `Carga atual: ${esc(context.batch.file_name)} · ${new Date(context.batch.applied_at).toLocaleString("pt-BR")}. Ao aplicar, o ano inteiro será substituído e o arquivo anterior será excluído.` : "Nenhuma carga aplicada para este ano."}</p>
        </section>
        <section class="fc-panel content-card actuals-batch-card"><header class="card-toolbar"><div><p class="section-kicker">Histórico</p><h4 class="inline-card-title">Lotes</h4></div><button class="ghost-button" type="button" data-fcl-refresh ${busy ? "disabled" : ""}>Atualizar</button></header><div class="actuals-batch-list fc-batches">${batches.length ? batches.map(b => `<button type="button" class="actuals-batch-item ${selected?.batch.id === b.id && !showDraft ? "active" : ""}" data-fcl-batch="${esc(b.id)}" ${busy ? "disabled" : ""}><div class="actuals-batch-item-head"><strong>${b.reference_year}</strong><span class="actuals-badge is-ok">Aplicado</span></div><span>Ano base ${b.reference_year}</span><span>${esc(b.file_name)}</span><span>Carga anual completa · ${new Date(b.applied_at).toLocaleString("pt-BR")}</span></button>`).join("") : '<p class="toolbar-note">Nenhum lote aplicado.</p>'}</div><p class="toolbar-note">Um lote vigente por ano. Ao substituir, o lote e o arquivo anteriores são excluídos.</p></section></div>

        <section class="fc-panel content-card actuals-detail-card"><header class="actuals-detail-head"><div class="editor-header actuals-detail-title"><p class="section-kicker">Detalhe</p><h3>${report ? `${showDraft ? "Conferência" : "Lote aplicado"} · ${detailYear}` : "Selecione um lote"}</h3></div>${showDraft && draft ? `<button class="primary-button" data-fcl-apply type="button" ${busy ? "disabled" : ""}>${busy ? "Aplicando…" : "Tentar aplicar novamente"}</button>` : draft ? `<button class="ghost-button" type="button" data-fcl-draft>Ver arquivo validado</button>` : ""}</header>
          <div class="actuals-log-shell"><div class="actuals-log-head"><strong>Log de importação</strong><span>${report ? `${report.structure.filter(n=>n.node_class==='Analitica').length} contas analíticas` : "Sem lote carregado."}</span></div><div class="fc-message ${failed ? "actuals-error-item" : report && !busy ? "actuals-success-box" : "actuals-empty"}" role="${failed ? "alert" : "status"}" aria-live="polite">${esc(message || (report ? "Lote sem erros. Confira as contas e os valores abaixo." : "Sem lote selecionado."))}</div></div>
          ${report ? `
          <p class="toolbar-note">${esc(showDraft ? draft.payload.file_name : selected.batch.file_name)}</p>
          <p class="toolbar-note">${report.structure.filter(n=>n.node_class==='Analitica').length} contas analíticas · ${report.kinds.filter(v=>v==='Real').length} Real · ${report.kinds.filter(v=>v==='Fcst').length} Fcst · ${report.kinds.filter(v=>v==='Bud').length} Bud</p>
          <div class="actuals-summary-grid fc-load-summary">${[["Saldo inicial",report.opening],["Geração líquida",report.values.net.reduce((a,b)=>a+b,0)],["Saldo final",report.values.balance[11]]].map(([label,value])=>`<div class="actuals-summary-card"><span>${label}</span><strong>R$ ${amount(value)}</strong></div>`).join("")}</div>
          <div class="table-shell actuals-table-shell fc-table-scroll fc-detail-scroll" tabindex="0"><table class="data-table"><thead><tr><th>Conta / grupo</th>${report.kinds.map((kind,i)=>`<th>${i+1}/${detailYear}<small>${kind}</small></th>`).join("")}</tr></thead><tbody>${report.structure.filter(n=>n.node_class==='Analitica').sort((a,b)=>a.sort_order-b.sort_order).map(n=>`<tr><th>${esc(n.name)}<small>${esc(report.structure.find(p=>p.seed_key===n.parent_key)?.name || "")}</small></th>${report.movements[n.seed_key].map(v=>`<td>${amount(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="toolbar-note">Valores em R$. Subtotais e saldos são calculados; não são somados novamente como contas.</p>` : `<p class="toolbar-note">Selecione um lote no histórico para consultar as contas e os 12 meses, ou valide um arquivo para conferir uma nova carga.</p>`}</section>
      </div>`;
      const q = selector => root.querySelector(selector);

      q("[data-fcl-back]").onclick = deps.goBack;
      q("[data-fcl-template]").onclick = downloadTemplate;
      q("[data-fcl-draft]")?.addEventListener("click",()=>{showDraft=true;draw();});
      root.querySelectorAll("[data-fcl-batch]").forEach(button=>button.onclick=()=>{void selectBatch(button.dataset.fclBatch);});
      q("[data-fcl-period]").onclick = deps.openPeriod;
      q("[data-fcl-refresh]").onclick = () => { if (!busy) void refresh(); };
      q("[data-fcl-choose]").onclick = () => q("[data-fcl-file]").click();
      q("[data-fcl-file]").onchange = event => { file = event.target.files[0] || null; draft = null; showDraft = false; message = ""; failed = false; draw(); };
      q("[data-fcl-validate]").onclick = () => { void validate(); };
      q("[data-fcl-apply]")?.addEventListener("click", () => { void apply(); });
    }
    return { render, reset };
  }
  window.VECTON_FC_LOAD = { createLoadModule };
})(window);
