const CACHE_PREFIX = "vecton-static-";
const CACHE_NAME = `${CACHE_PREFIX}20260828e`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles.css?v=20260828b",
  "./fav-icon.png",
  "./assets/msn-message.mp3?v=20260804b",
  "./assets/icq.mp3?v=20260804a",
  "./assets/msn-wizz.mp3?v=20260804a",
  "./assets/pwa-icon-192.png",
  "./assets/pwa-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  // Sem skipWaiting() automático: um SW novo instala e fica em "waiting" até
  // o usuário confirmar no popover "Nova versão disponível" (pwa.js manda a
  // mensagem abaixo) — evita trocar o app debaixo da pessoa no meio do uso.
  // Na PRIMEIRA instalação (sem controller ainda) o navegador ativa sozinho,
  // sem precisar disso.
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // cache:"reload" ignora o cache HTTP do navegador (o GitHub Pages manda
    // Cache-Control: max-age=600 no index.html — sem isso, o fetch "de rede"
    // aqui embaixo podia devolver uma resposta de até 10min atrás, com os
    // ?v=... antigos dos <script>/<link>, e a SW então persistia ESSA versão
    // velha na própria Cache API como fallback — dois níveis de cache
    // conspirando pra nunca pegar o deploy novo, mesmo com F5/Ctrl+Shift+R).
    event.respondWith(
      fetch(request, { cache: "reload" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  if (!["script", "style", "image", "font", "audio", "manifest"].includes(request.destination)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const update = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached || update;
    })
  );
});
