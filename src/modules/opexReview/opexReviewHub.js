(function attachOpexReviewHub(window) {
  "use strict";
  // Tela "Análises e planos de ação": consolidado de análises e ações dos CCs que o usuário pode ler.
  // Filtro, ordenação e paginação acontecem no servidor (nunca busca a organização inteira para filtrar no navegador).
  const A = () => window.VECTON_OPEX_REVIEW_ACTION;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const PERIOD = { month: "Mês", YTD: "YTD", year: "Ano" };
  const ANALYSIS_STATE = { in_analysis: "Em análise", analyzed: "Analisado", cancelled: "Cancelado" };
  const STATUS_OPTIONS = [["", "Todas"], ["in_analysis", "Em análise"], ["analyzed", "Analisado"], ["cancelled", "Cancelado"], ["awaiting_ack", "Aguardando ciência"], ["in_progress", "Em andamento"],
    ["overdue", "Atrasadas"], ["awaiting_validation", "Aguardando validação"], ["adjustments_requested", "Ajustes solicitados"], ["completed", "Concluídas"]];

  const VW = () => window.VECTON_OPEX_REVIEW_VIEWS;
  const GETTERS = {
    type: r => r.type, title: r => r.title, management: r => r.managementName || "", cc: r => `${r.costCenterNumber} ${r.accountNumber}`, responsible: r => r.responsible,
    status: r => (r.type === "action" ? A().statusLabel(r) : ANALYSIS_STATE[r.status] || r.status)
  };
  // Legenda padrão (.cockpit-tip) com o texto completo da célula truncada.
  const tip = (label, value) => `data-tip data-tip-rows='${esc(JSON.stringify([{ label, value: String(value ?? ""), wrap: true }]))}'`;

  function createHubView({ service, root, getCostCenters, openAnalysis, toast, confirm }) {
    let filters = { type: "all", costCenterId: "", year: "", periodType: "", month: "", responsibleUserId: "", status: "", sort: "updated" };
    let items = [], total = 0, cursor = null, loading = false, loadError = false, responsibles = [], requestId = 0, canDelete = false, colSort = null;

    const select = (key, label, options) => `<label class="opex-field"><span>${esc(label)}</span><select data-hub-f="${key}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(filters[key]) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    function table() {
      if (loadError) return '<div class="opex-empty" role="alert">Não foi possível carregar os registros. <button type="button" class="ghost-button" data-hub-retry>Tentar novamente</button></div>';
      if (loading && !items.length) return '<div class="opex-empty" role="status">Carregando registros…</div>';
      if (!items.length) return '<div class="opex-empty" role="status">Nenhum registro encontrado para os filtros selecionados.</div>';
      const arrow = key => filters.sort === key ? " ↓" : "";
      const th = (key, label) => `<th scope="col" data-hub-sort="${key}" class="cockpit-sortable${filters.sort === key ? " cockpit-sort-active" : ""}">${esc(label)}${arrow(key)}</th>`;
      const dateBr = A().dateBr;
      return `<div class="reports-table-wrap"><table class="gap-table opex-hub-table"><thead><tr>${VW().sortTh("Tipo", "type", colSort)}${VW().sortTh("Causa / ação", "title", colSort)}${VW().sortTh("Gestão", "management", colSort)}${VW().sortTh("CC · Conta", "cc", colSort)}${th("period", "Período")}${VW().sortTh("Responsável", "responsible", colSort)}${th("due", "Prazo")}${VW().sortTh("Situação", "status", colSort)}<th scope="col"><span class="cockpit-sr-only">Abrir</span></th></tr></thead>
        <tbody>${VW().sortItems(items, GETTERS, colSort).map(({ r, i }) => `<tr data-hub-row="${i}"><td>${r.type === "analysis" ? "Análise" : "Ação"}</td><td class="gap-name" tabindex="0" ${tip("Causa / ação", r.title)}>${esc(r.title)}${r.monitor ? ' <span class="opex-tag">Monitorar</span>' : ""}</td>
          <td class="gap-name">${esc(r.managementName || "—")}</td><td class="gap-name" tabindex="0" ${tip("CC · Conta", `${r.costCenterNumber} · ${r.accountNumber} ${r.accountName || ""}${r.costCenterName ? ` (${r.costCenterName})` : ""}`)}>${esc(r.costCenterNumber)} · ${esc(r.accountNumber)} ${esc(r.accountName || "")}</td><td class="gap-code">${MONTHS[r.month - 1]}/${r.year} · ${esc(PERIOD[r.periodType])}</td><td class="gap-name">${esc(r.responsible)}</td>
          <td class="gap-code">${r.dueDate ? esc(dateBr(r.dueDate)) : "—"}</td><td>${r.type === "action" ? A().chip(r) : `<span class="opex-chip">${esc(ANALYSIS_STATE[r.status] || r.status)}</span>`}</td><td><span class="opex-row-actions"><button type="button" class="opex-open-btn" data-hub-open>Abrir →</button>${canDelete ? `<button type="button" class="opex-icon-btn" data-hub-delete aria-label="Excluir"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/></svg></button>` : ""}</span></td></tr>`).join("")}</tbody></table></div>
        <div class="opex-foot"><span class="opex-meta">${items.length} de ${total}</span>${cursor ? `<button type="button" class="ghost-button" data-hub-more${loading ? " disabled" : ""}>Carregar mais</button>` : ""}</div>`;
    }
    function render() {
      const keep = root.querySelector("[data-hub-table]");
      if (!keep) {
        const year = new Date().getFullYear();
        const ccs = (getCostCenters?.() || []).slice().sort((a, b) => String(a.number).localeCompare(String(b.number), "pt-BR", { numeric: true }));
        root.innerHTML = `<section class="content-card opex-screen"><div class="panel-header"><h3><span class="opex-title-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg></span>Análises e planos de ação</h3></div>
          <div class="opex-hub-filters">
            ${select("type", "Tipo", [["all", "Análises e ações"], ["analyses", "Somente análises"], ["actions", "Somente ações"]])}
            ${select("costCenterId", "Centro de custo", [["", "Todos"], ...ccs.map(cc => [cc.id, `${cc.number} · ${cc.name}`])])}
            ${select("year", "Ano", [["", "Todos"], ...[year + 1, year, year - 1, year - 2].map(y => [y, String(y)])])}
            ${select("periodType", "Período", [["", "Todos"], ["month", "Mês"], ["YTD", "YTD"], ["year", "Ano"]])}
            ${select("month", "Competência", [["", "Todas"], ...MONTHS.map((m, i) => [i + 1, m])])}
            ${select("responsibleUserId", "Responsável", [["", "Todos"], ...responsibles.map(r => [r.userId, r.name])])}
            ${select("status", "Situação", STATUS_OPTIONS)}
          </div><div data-hub-table></div></section>`;
      }
      root.querySelector("[data-hub-table]").innerHTML = table();
    }
    const payload = () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "" && v != null).map(([k, v]) => [k, ["year", "month"].includes(k) ? Number(v) : v]));
    async function load() {
      const mine = ++requestId;
      loading = true; loadError = false; items = []; cursor = null; render();
      try {
        const result = await service.listRecords(payload(), null);
        if (mine !== requestId) return;
        items = result.items; total = result.total; cursor = result.nextCursor;
      } catch { if (mine !== requestId) return; loadError = true; }
      loading = false; render();
    }
    async function more() {
      if (!cursor || loading) return;
      loading = true; render();
      try {
        const result = await service.listRecords(payload(), cursor);
        items = items.concat(result.items); cursor = result.nextCursor; total = result.total;
      } catch { toast?.("Não foi possível carregar mais registros."); }
      loading = false; render();
    }
    // Exclusão (somente administrador; o servidor repete a checagem). A análise leva as ações dela; nada é apagado fisicamente.
    async function remove(record) {
      const text = record.type === "analysis" ? "Excluir esta análise e todas as ações vinculadas a ela? Os registros deixam de aparecer no app." : "Excluir esta ação? Ela deixa de aparecer no app.";
      if (!(await confirm?.(text))) return;
      try { await service.deleteRecord(record.type, record.id); toast?.("Registro excluído."); await load(); }
      catch (error) { const info = service.parseError(error); toast?.(info.kind === "forbidden" ? "Somente administradores excluem registros." : "Não foi possível excluir o registro."); }
    }
    root.addEventListener("change", event => {
      const f = event.target.closest("[data-hub-f]");
      if (f) { filters[f.dataset.hubF] = f.value; void load(); }
    });
    root.addEventListener("click", event => {
      if (event.target.closest("[data-hub-retry]")) { void load(); return; }
      if (event.target.closest("[data-hub-more]")) { void more(); return; }
      const colTh = event.target.closest("th[data-sort]");
      if (colTh) { colSort = VW().nextSort(colSort, colTh.dataset.sort); render(); return; }
      const sort = event.target.closest("[data-hub-sort]");
      if (sort) { filters.sort = filters.sort === sort.dataset.hubSort ? "updated" : sort.dataset.hubSort; void load(); return; }
      const row = event.target.closest("tr[data-hub-row]");
      if (!row) return;
      const record = items[Number(row.dataset.hubRow)];
      if (event.target.closest("[data-hub-delete]")) { void remove(record); return; }
      openAnalysis(record);
    });
    return {
      async show() {
        root.innerHTML = "";
        try { responsibles = await service.hubResponsibles(); } catch { responsibles = []; }
        try { canDelete = Boolean((await service.thresholds()).canEdit); } catch { canDelete = false; }
        await load();
      }
    };
  }
  window.VECTON_OPEX_REVIEW_HUB = { createHubView };
})(window);
