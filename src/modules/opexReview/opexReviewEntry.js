(function attachOpexReviewEntry(window) {
  "use strict";
  // Popover de pendências na entrada do Vecton: ciência pendente, vencidas, a vencer e entregas para o dono validar.
  // Fechar ou abrir uma ação NÃO confirma ciência; só o botão "Ciente" (validado no banco para o executor e ciclo atuais) confirma.
  const A = () => window.VECTON_OPEX_REVIEW_ACTION;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const SECTIONS = [["ack", "Aguardando ciência"], ["overdue", "Vencidas"], ["upcoming", "A vencer"], ["validate", "Entregas para você validar"]];
  const LIMIT = 10;

  function createEntryPopover({ service, toast, openAction, openMyActions }) {
    /** Resolve quando o popover fecha (ou de imediato quando não há pendências — nesse caso nada abre). */
    async function run() {
      let pending;
      try { pending = await service.entryPending(LIMIT); } catch { return; }
      if (!pending || !pending.total) return;
      const sections = pending.sections || {};
      const state = Object.fromEntries(SECTIONS.map(([id]) => [id, { total: sections[id]?.total || 0, items: (sections[id]?.items || []).slice() }]));
      await new Promise(resolve => {
        const root = document.createElement("div");
        root.className = "ger-audit-popover opex-entry-pop";
        root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Suas ações pendentes"); root.tabIndex = -1;
        const origin = document.activeElement;
        document.body.appendChild(root);
        let closed = false, busyId = null;
        const totalLeft = () => SECTIONS.reduce((n, [id]) => n + state[id].total, 0);
        const close = () => { if (closed) return; closed = true; document.removeEventListener("keydown", onKey, true); root.remove(); origin?.focus?.(); resolve(); };
        const onKey = event => { if (event.key === "Escape") { event.stopPropagation(); close(); } };
        document.addEventListener("keydown", onKey, true);
        function render() {
          const dateBr = A().dateBr;
          const hidden = SECTIONS.reduce((n, [id]) => n + Math.max(0, state[id].total - state[id].items.length), 0);
          root.innerHTML = `<div class="gap-header"><span class="gap-title">Suas ações · ${totalLeft()} pendente${totalLeft() === 1 ? "" : "s"}</span><button class="gap-close" type="button" aria-label="Fechar" data-entry-close>✕</button></div>
            <div class="opex-body">${SECTIONS.filter(([id]) => state[id].items.length).map(([id, label]) => `<section class="opex-entry-section" data-section="${id}"><h4>${esc(label)} <span class="opex-meta">${state[id].total}</span></h4>
              <ul class="opex-entry-list">${state[id].items.map(a => `<li data-item="${esc(a.id)}"><div class="opex-entry-main"><strong>${esc(a.title)}</strong><span class="opex-meta">Atribuída por ${esc(a.owner.name)} · Prazo ${esc(dateBr(a.dueDate))}${a.overdue ? " · vencida" : ""}</span></div>${A().chip(a)}
                <div class="opex-entry-actions"><button type="button" class="opex-open-btn" data-entry-open>Abrir ação →</button>${id === "ack" ? `<button type="button" class="ghost-button opex-primary" data-entry-ack${busyId === a.id ? " disabled" : ""}>Ciente</button>` : ""}</div></li>`).join("")}</ul></section>`).join("")}
              ${hidden ? `<p class="opex-meta">Há mais ${hidden} ação${hidden === 1 ? "" : "ões"} pendente${hidden === 1 ? "" : "s"} além das exibidas.</p>` : ""}
              <div class="opex-foot"><button type="button" class="ghost-button" data-entry-all>Ver minhas ações</button><button type="button" class="ghost-button" data-entry-close>Fechar</button></div></div>`;
        }
        root.addEventListener("click", async event => {
          if (event.target.closest("[data-entry-close]")) { close(); return; }
          if (event.target.closest("[data-entry-all]")) { close(); openMyActions?.(); return; }
          const li = event.target.closest("li[data-item]");
          if (!li) return;
          const id = li.dataset.item;
          if (event.target.closest("[data-entry-open]")) { close(); openAction?.(id); return; }
          if (event.target.closest("[data-entry-ack]") && busyId !== id) {
            const sec = state.ack, dto = sec.items.find(a => a.id === id);
            busyId = id; render();
            try {
              await service.mutate("ack", dto, null);
              sec.items = sec.items.filter(a => a.id !== id); sec.total = Math.max(0, sec.total - 1);
              toast?.("Ciência confirmada.");
            } catch (error) {
              const info = service.parseError(error);
              toast?.(info.kind === "conflict" ? "Esta atribuição mudou. Abra a ação para conferir." : `Não foi possível confirmar: ${info.message}`);
            }
            busyId = null;
            if (!totalLeft()) { close(); return; }
            render();
          }
        });
        render();
        root.focus();
      });
    }
    return { run };
  }
  window.VECTON_OPEX_REVIEW_ENTRY = { createEntryPopover };
})(window);
