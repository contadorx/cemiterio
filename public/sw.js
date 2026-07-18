const CACHE = "sureya-campo-v1";
const ESSENCIAIS = ["/campo"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // nunca cacheia API nem POST — precisa de rede fresca (e a fila offline cuida das conclusões)
  if (req.method !== "GET" || url.pathname.startsWith("/api/")) return;

  // network-first para navegação (pega versão nova quando há sinal; cai no cache sem sinal)
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/campo")))
    );
    return;
  }

  // demais GETs: cache-first com atualização em segundo plano
  e.respondWith(
    caches.match(req).then((cacheado) => {
      const rede = fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
          return res;
        })
        .catch(() => cacheado);
      return cacheado || rede;
    })
  );
});
