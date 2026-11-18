(function attachOverlayQueue(window) {
  "use strict";
  // Fila de overlays da inicialização autenticada: nunca dois pop-ups/modais concorrentes (ex.: pendências de ações e Novidades).
  // Cada item roda quando chega a sua vez (menor `priority` primeiro) e só termina quando o overlay é fechado.
  // `gate()` adia a exibição enquanto houver formulário com alterações não salvas (não cobrir o que o usuário está editando).
  function createOverlayQueue({ gate, gatePollMs = 1500 } = {}) {
    const items = []; let draining = false;
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function drain() {
      if (draining) return;
      draining = true;
      try {
        while (items.length) {
          items.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
          const item = items.shift();
          try {
            while (gate && gate()) await sleep(gatePollMs);
            await item.run();
          } catch (error) { console.error(`Overlay "${item.name}" falhou:`, error); }
        }
      } finally { draining = false; }
    }
    let seq = 0;
    return {
      /** run: () => Promise resolvida quando o overlay fecha (ou imediatamente se não houver nada a mostrar). */
      enqueue(name, priority, run) { items.push({ name, priority, run, seq: seq++ }); setTimeout(drain, 0); },
      size: () => items.length
    };
  }
  window.VECTON_OVERLAY_QUEUE = { createOverlayQueue };
})(window);
