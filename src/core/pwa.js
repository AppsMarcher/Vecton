(function setupVectonPwa(window) {
  if (!("serviceWorker" in navigator)) return;

  let installPrompt = null;

  // ── Popover "Nova versão disponível" ──────────────────────────────────────
  // Mesmo padrão do ExiladosApp: o SW novo fica em "waiting" (sw.js não dá
  // mais skipWaiting() sozinho) até a pessoa clicar em Atualizar aqui.
  let refreshing = false;
  let bannerMostrado = false;

  function mostrarBannerAtualizacao(registration) {
    if (bannerMostrado || !registration?.waiting) return;
    bannerMostrado = true;

    const el = document.createElement("div");
    el.className = "vp-update-banner";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML = `
      <span>Nova versão disponível.</span>
      <button type="button">Atualizar</button>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));

    el.querySelector("button").addEventListener("click", () => {
      const botao = el.querySelector("button");
      botao.disabled = true;
      botao.textContent = "Atualizando...";
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  function installButton() {
    return document.querySelector("#pwa-install-trigger");
  }

  function hideInstallButton() {
    const button = installButton();
    if (button) button.hidden = true;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    const button = installButton();
    if (button) button.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    hideInstallButton();
  });

  window.addEventListener("DOMContentLoaded", () => {
    const button = installButton();
    if (button) {
      button.addEventListener("click", async () => {
        if (!installPrompt) return;
        button.disabled = true;
        try {
          await installPrompt.prompt();
          await installPrompt.userChoice;
          installPrompt = null;
          hideInstallButton();
        } finally {
          button.disabled = false;
        }
      });
    }

    if (window.matchMedia("(display-mode: standalone)").matches) hideInstallButton();
  });

  window.addEventListener("load", () => {
    // updateViaCache:"none" faz o navegador sempre buscar o sw.js na rede
    // ignorando o cache HTTP (GitHub Pages manda max-age=600) — sem isso o
    // navegador só percebe que o sw.js mudou depois de até 10min, e até lá
    // continua rodando a versão antiga da Service Worker (deploy "sem efeito").
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((registration) => {
      // Um SW já em "waiting" nesta primeira checagem (ex: aba ficou aberta
      // desde antes do deploy) também dispara o popover, não só o evento
      // "updatefound" de uma checagem futura.
      if (registration.waiting && navigator.serviceWorker.controller) {
        mostrarBannerAtualizacao(registration);
      }

      registration.addEventListener("updatefound", () => {
        const novoWorker = registration.installing;
        if (!novoWorker) return;
        novoWorker.addEventListener("statechange", () => {
          // "installed" + já existir um controller = atualização (não a
          // primeira instalação, que não tem ninguém pra avisar ainda).
          if (novoWorker.state === "installed" && navigator.serviceWorker.controller) {
            mostrarBannerAtualizacao(registration);
          }
        });
      });

      registration.update().catch(() => {});
    }).catch((error) => {
      console.debug("PWA: service worker indisponível", error);
    });
  });
})(window);
