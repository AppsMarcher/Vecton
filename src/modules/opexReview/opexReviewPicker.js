(function attachOpexReviewPicker(window) {
  "use strict";
  // Seletor de pessoa (substitui o <select> nativo): permite marcar com símbolo + legenda padrão (.cockpit-tip) quem
  // não tem acesso ao centro de custo, algo que um <option> nativo não consegue exibir.
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const NO_CC_TIP = "Sem acesso ao centro de custo";
  const ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 5l6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const marker = () => `<span class="opex-picker-flag" role="img" tabindex="-1" aria-label="${NO_CC_TIP}" data-tip data-tip-rows='${esc(JSON.stringify([{ label: "Acesso", value: NO_CC_TIP }]))}'>${ICON}</span>`;

  /**
   * @param host elemento onde o seletor é montado (o conteúdo é substituído)
   * @param opts { users:[{userId,name,hasCcAccess}], value, onChange(userId, user|null), disabled?, inputName? }
   */
  function mountPicker(host, opts) {
    const users = opts.users || [];
    let value = opts.value || "";
    let open = false, active = -1;
    const byId = id => users.find(u => u.userId === id) || null;

    function paint() {
      const sel = byId(value);
      host.innerHTML = `<div class="opex-picker">
        <button type="button" class="opex-picker-btn" aria-haspopup="listbox" aria-expanded="${open}"${opts.disabled ? " disabled" : ""}>
          <span class="opex-picker-label${sel ? "" : " is-empty"}">${esc(sel ? sel.name : "Selecione")}</span>${sel && !sel.hasCcAccess ? marker() : ""}<span class="opex-picker-caret" aria-hidden="true">▾</span>
        </button>
        <ul class="opex-picker-list" role="listbox"${open ? "" : " hidden"}>
          ${users.map((u, i) => `<li role="option" tabindex="-1" data-id="${esc(u.userId)}" aria-selected="${u.userId === value}"${i === active ? ' class="is-active"' : ""}><span>${esc(u.name)}</span>${u.hasCcAccess ? "" : marker()}</li>`).join("")}
        </ul>
        ${opts.inputName ? `<input type="hidden" data-in="${esc(opts.inputName)}" value="${esc(value)}">` : ""}
      </div>`;
      if (open) {
        const list = host.querySelector(".opex-picker-list");
        const target = list.querySelector(".is-active") || list.querySelector('[aria-selected="true"]');
        target?.scrollIntoView?.({ block: "nearest" });
        list.scrollIntoView?.({ block: "nearest" });
      }
    }
    function setOpen(next, focusBtn) {
      open = next; active = next ? Math.max(users.findIndex(u => u.userId === value), 0) : -1;
      paint();
      if (next) { host.querySelector(".opex-picker-list")?.focus?.(); host.querySelector(`.opex-picker-list li:nth-child(${active + 1})`)?.focus?.(); }
      else if (focusBtn) host.querySelector(".opex-picker-btn")?.focus();
    }
    function pick(id) {
      value = id; open = false; active = -1; paint();
      host.querySelector(".opex-picker-btn")?.focus();
      opts.onChange?.(value, byId(value));
    }
    host.addEventListener("click", event => {
      if (event.target.closest(".opex-picker-btn")) { setOpen(!open, false); return; }
      const li = event.target.closest(".opex-picker-list li");
      if (li) pick(li.dataset.id);
    });
    host.addEventListener("keydown", event => {
      const onBtn = event.target.closest(".opex-picker-btn"), onItem = event.target.closest(".opex-picker-list li");
      if (!onBtn && !onItem) return;
      if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false, true); return; }
      if (onBtn && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOpen(true); return; }
      if (onItem) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          active = Math.min(users.length - 1, Math.max(0, active + (event.key === "ArrowDown" ? 1 : -1)));
          host.querySelectorAll(".opex-picker-list li").forEach((li, i) => li.classList.toggle("is-active", i === active));
          host.querySelectorAll(".opex-picker-list li")[active]?.focus();
        } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(onItem.dataset.id); }
      }
    });
    const outside = event => {
      if (!host.isConnected) { document.removeEventListener("pointerdown", outside, true); return; }
      if (open && !host.contains(event.target)) setOpen(false, false);
    };
    document.addEventListener("pointerdown", outside, true);
    paint();
    return { get value() { return value; }, destroy() { document.removeEventListener("pointerdown", outside, true); } };
  }
  window.VECTON_OPEX_REVIEW_PICKER = { mountPicker, NO_CC_TIP };
})(window);
