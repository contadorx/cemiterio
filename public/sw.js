/* Service worker do Walkstamp.
   Rede primeiro para documentos: uma ferramenta que abre a versão de ontem
   depois de um deploy é pior do que uma que não instala. O cache existe para o
   caso de a rede cair no meio do trabalho, e para os arquivos estáticos.
   Ele NÃO guarda vídeo, áudio, transcrição nem documento gerado: nada disso
   passa por aqui, porque nada disso é uma requisição de rede. */
const CACHE = 'walkstamp-v3';
const ESSENCIAIS = ['/app', '/site.css', '/favicon.svg', '/logo.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENCIAIS)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ns =>
    Promise.all(ns.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // CDN e modelo não passam por aqui
  e.respondWith(
    fetch(req).then(r => {
      const copia = r.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
      return r;
    }).catch(() => caches.match(req).then(r => r || caches.match('/app')))
  );
});
