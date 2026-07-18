/**
 * Service worker — o mínimo necessário para o Android oferecer "instalar",
 * mais notificação para quando chegar mensagem de família.
 *
 * Não faz cache agressivo de propósito: a agenda muda durante o dia e uma
 * página velha em cache seria pior que esperar a rede.
 */
const VERSAO = "zm-v5";
// Só ícones. NUNCA guardar página nem código aqui — ver a explicação no fetch.
const ESSENCIAIS = ["/icon-192.png", "/icon-512.png"];
const PAGINA_OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll([...ESSENCIAIS, PAGINA_OFFLINE])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/**
 * POR QUE NÃO GUARDAMOS PÁGINAS EM CACHE
 *
 * O Next.js gera arquivos de código com nome versionado a cada publicação
 * (ex.: main-a1b2c3.js). A página HTML aponta para os nomes da versão dela.
 *
 * Guardar a PÁGINA em cache quebra o app depois de cada publicação: o celular
 * abre o HTML velho, que pede arquivos de código que não existem mais no
 * servidor — e o resultado é a tela branca com "client-side exception".
 *
 * Então a regra aqui é:
 *   · página (navegação) → SEMPRE da rede. Sem rede, mostra o aviso de offline.
 *   · código e imagens do Next → cache é seguro (o nome muda a cada versão).
 *   · API → nunca passa por aqui.
 */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const ehPagina =
    e.request.mode === "navigate" ||
    (e.request.headers.get("accept") || "").includes("text/html");

  // ---- PÁGINA: sempre rede. Nunca serve HTML velho.
  if (ehPagina) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(PAGINA_OFFLINE).then(
          (r) =>
            r ||
            new Response(
              "<meta charset='utf-8'><p style='font:17px system-ui;padding:24px'>" +
                "Sem internet agora. Assim que o sinal voltar, é só recarregar.</p>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } }
            )
        )
      )
    );
    return;
  }

  // ---- RSC (dados de navegação do Next): também sempre da rede
  if (url.searchParams.has("_rsc") || (e.request.headers.get("rsc") || "") === "1") {
    e.respondWith(fetch(e.request));
    return;
  }

  // ---- CÓDIGO E IMAGENS: cache primeiro (nome versionado, então é seguro)
  const ehEstatico =
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname);

  if (ehEstatico) {
    e.respondWith(
      caches.match(e.request).then(
        (cacheado) =>
          cacheado ||
          fetch(e.request).then((r) => {
            if (r.ok) {
              const copia = r.clone();
              caches.open(VERSAO).then((c) => c.put(e.request, copia));
            }
            return r;
          })
      )
    );
    return;
  }

  // ---- o resto: rede, sem guardar
  e.respondWith(fetch(e.request));
});

// Permite forçar a atualização do service worker pelo app
self.addEventListener("message", (e) => {
  if (e.data === "atualizar") self.skipWaiting();
});

// ---------------------------------------------------------------- notificações
self.addEventListener("push", (e) => {
  let dados = { titulo: "Zelo & Memória", corpo: "Você tem uma mensagem nova.", url: "/painel/conversas" };
  try { if (e.data) dados = { ...dados, ...e.data.json() }; } catch {}

  e.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/icon-192.png",
      badge: "/icon-notificacao.png",
      tag: dados.tag || "mensagem",
      renotify: true,
      data: { url: dados.url },
      vibrate: [120, 60, 120],
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = e.notification.data?.url || "/painel/conversas";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.includes(destino) && "focus" in j) return j.focus();
      }
      return self.clients.openWindow(destino);
    })
  );
});
