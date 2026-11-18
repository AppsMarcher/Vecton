(function attachOpexReviewMyActions(window) {
  "use strict";
  // "Minhas ações": tarefas do executor + entregas dos próprios planos aguardando validação.
  // Funciona para quem NÃO tem acesso ao Cockpit/CC: só lê o DTO operacional; nenhuma coluna ou filtro financeiro.
  const A = () => window.VECTON_OPEX_REVIEW_ACTION;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const FILTERS = [
    ["all", "Pendentes", {}], ["ack", "Aguardando ciência", { status: "awaiting_ack" }], ["progress", "Em andamento", { status: "in_progress" }],
    ["overdue", "Atrasadas", { overdueOnly: true }], ["validate", "Para eu validar", { role: "owner" }], ["completed", "Concluídas", { status: "completed" }]
  ];

  function createMyActionsView({ service, root, toast, confirm, onChanged }) {
    let filter = "all", items = [], total = 0, cursor = null, loading = false, loadError = false, selected = null, detailCtl = null, unavailable = false, pendingFocus = null, requestId = 0, colSort = null;
    const VW = () => window.VECTON_OPEX_REVIEW_VIEWS;
    const GETTERS = { title: a => a.title, owner: a => a.owner.name, due: a => a.dueDate || "", status: a => A().statusLabel(a) };

    function list() {
      const dateBr = A().dateBr;
      if (loadError) return '<div class="opex-empty" role="alert">Não foi possível carregar suas ações. <button type="button" class="ghost-button" data-my-retry>Tentar novamente</button></div>';
      if (loading && !items.length) return '<div class="opex-empty" role="status">Carregando ações…</div>';
      if (!items.length) return '<div class="opex-empty" role="status">Nenhuma ação encontrada.</div>';
      return `<div class="reports-table-wrap"><table class="gap-table opex-my-table"><thead><tr>${VW().sortTh("Ação", "title", colSort)}${VW().sortTh("Atribuída por", "owner", colSort)}${VW().sortTh("Prazo", "due", colSort)}${VW().sortTh("Situação", "status", colSort)}<th scope="col"><span class="cockpit-sr-only">Abrir</span></th></tr></thead>
        <tbody>${VW().sortItems(items, GETTERS, colSort).map(({ r: a }) => `<tr data-my-row="${esc(a.id)}"><td class="gap-name">${esc(a.title)}${a.role === "owner" ? ' <span class="opex-tag">Para validar</span>' : ""}</td><td class="gap-name">${esc(a.owner.name)}</td><td class="gap-code">${esc(dateBr(a.dueDate))}</td><td>${A().chip(a)}</td><td><button type="button" class="opex-open-btn" data-my-open>Abrir →</button></td></tr>`).join("")}</tbody></table></div>
        <div class="opex-foot"><span class="opex-meta">${items.length} de ${total}</span>${cursor ? `<button type="button" class="ghost-button" data-my-more${loading ? " disabled" : ""}>Carregar mais</button>` : ""}</div>`;
    }
    function render() {
      detailCtl?.destroy(); detailCtl = null;
      if (unavailable) {
        root.innerHTML = '<section class="content-card opex-screen"><div class="opex-empty" role="alert">Esta ação não está mais disponível para você.</div><div class="opex-foot"><button type="button" class="ghost-button" data-my-back>Voltar para Minhas ações</button></div></section>';
        return;
      }
      if (selected) {
        root.innerHTML = '<section class="content-card opex-screen"><div class="opex-screen-head">' + window.VECTON_OPEX_REVIEW_VIEWS.backButton('data-my-back', 'Voltar para Minhas ações') + '</div><div data-my-detail></div></section>';
        detailCtl = A().mountActionDetail(root.querySelector("[data-my-detail]"), { service, dto: selected, toast, confirm,
          onChanged: () => { onChanged?.(); void load(true); }, onUnavailable: () => { selected = null; unavailable = true; render(); } });
        return;
      }
      root.innerHTML = `<section class="content-card opex-screen"><div class="panel-header"><h3><span class="opex-title-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8"/></svg></span>Minhas ações</h3></div>
        <div class="opex-filters" role="group" aria-label="Filtro de situação">${FILTERS.map(([id, label]) => `<button type="button" class="period-month-button" data-my-filter="${id}" aria-pressed="${id === filter}">${esc(label)}</button>`).join("")}</div>
        ${list()}</section>`;
    }
    async function load(silent) {
      const mine = ++requestId;
      if (!silent) { loading = true; loadError = false; items = []; cursor = null; render(); }
      try {
        const result = await service.myActions(FILTERS.find(f => f[0] === filter)[2], null);
        if (mine !== requestId) return;
        items = result.items; total = result.total; cursor = result.nextCursor; loadError = false;
      } catch { if (mine !== requestId) return; loadError = true; }
      loading = false;
      if (!selected) render();
    }
    async function more() {
      if (!cursor || loading) return;
      loading = true; render();
      try {
        const result = await service.myActions(FILTERS.find(f => f[0] === filter)[2], cursor);
        items = items.concat(result.items); cursor = result.nextCursor; total = result.total;
      } catch { toast?.("Não foi possível carregar mais ações."); }
      loading = false; render();
    }
    // Abre uma ação específica (deep link do e-mail/sino/popover). Nunca interpreta o link como autorização: o servidor decide.
    async function openAction(id) {
      unavailable = false; selected = null;
      try { selected = await service.getAction(id); }
      catch { unavailable = true; }
      render();
    }
    root.addEventListener("click", async event => {
      if (event.target.closest("[data-my-back]")) { selected = null; unavailable = false; await load(); return; }
      if (event.target.closest("[data-my-retry]")) { await load(); return; }
      if (event.target.closest("[data-my-more]")) { await more(); return; }
      const colTh = event.target.closest("th[data-sort]");
      if (colTh) { colSort = VW().nextSort(colSort, colTh.dataset.sort); render(); return; }
      const f = event.target.closest("[data-my-filter]");
      if (f) { filter = f.dataset.myFilter; await load(); return; }
      const row = event.target.closest("tr[data-my-row]");
      if (row) await openAction(row.dataset.myRow);
    });
    return {
      // Chamado sempre que a tela fica ativa.
      async show() { if (pendingFocus) { const id = pendingFocus; pendingFocus = null; await openAction(id); void load(true); return; } selected = null; unavailable = false; await load(); },
      focus(id) { pendingFocus = id; },
      isShown: () => root.isConnected,
      openAction, refresh: () => load(true)
    };
  }
  window.VECTON_OPEX_REVIEW_MYACTIONS = { createMyActionsView };
})(window);
