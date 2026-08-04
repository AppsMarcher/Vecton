(function setupVectonPwa(window) {
  if (!("serviceWorker" in navigator)) return;

  let installPrompt = null;

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
      registration.update().catch(() => {});
    }).catch((error) => {
      console.debug("PWA: service worker indisponível", error);
    });
  });
})(window);
