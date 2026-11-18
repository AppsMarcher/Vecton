(function attachModalScrim(window) {
  "use strict";
  // Padrão do app: qualquer popover/modal central abre com o fundo esmaecido e desfocado, sem o módulo precisar pedir.
  // Vale para: .ger-audit-popover, .vp-popover, .pl-import-pop e qualquer [role="dialog"][aria-modal="true"].
  // Modais que já trazem a própria camada de fundo (overlay/backdrop fixo) e <dialog> nativo (::backdrop) são
  // padronizados por CSS em styles.css ("Padrão de popover"); aqui eles são ignorados para não escurecer duas vezes.
  const SELECTOR = '.ger-audit-popover, .vp-popover, .pl-import-pop, [role="dialog"][aria-modal="true"]:not(.vmob-period-modal)';
  let scrim = null;
  let frame = 0;

  const visible = el => el.isConnected && !el.hidden && el.getClientRects().length > 0;
  const hasOwnBackdrop = el => {
    if (el.closest("dialog")) return true;
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).position === "fixed") return true;
    }
    return false;
  };
  const zOf = el => { const z = parseInt(getComputedStyle(el).zIndex, 10); return Number.isFinite(z) ? z : 0; };

  function sweep() {
    frame = 0;
    const open = [...document.querySelectorAll(SELECTOR)].filter(el => visible(el) && !hasOwnBackdrop(el));
    if (!open.length) { scrim?.remove(); scrim = null; return; }
    const topZ = open.reduce((max, el) => Math.max(max, zOf(el)), 0);
    if (!scrim) { scrim = document.createElement("div"); scrim.className = "vp-scrim"; scrim.setAttribute("aria-hidden", "true"); document.body.appendChild(scrim); }
    scrim.style.zIndex = String(Math.max(topZ - 1, 1));
  }
  const schedule = () => { if (!frame) frame = window.requestAnimationFrame(sweep); };

  function start() {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    schedule();
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start, { once: true });
  window.VECTON_MODAL_SCRIM = { refresh: sweep };
})(window);
