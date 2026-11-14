// Service worker mínimo: permite instalar la app y usarla sin conexión.
const CACHE = 'voces-v2';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './icon.svg', './manifest.webmanifest'])));
});
self.addEventListener('activate', (e) => {
  // Las copias de versiones anteriores de la app («voces-v1»…) se pasan a la actual antes de borrarlas: así la app
  // instalada sigue abriendo sin conexión aunque la última visita con red la sirviera aún el SW anterior. Solo lo del
  // propio sitio y que llegó bien (lo de fuera, como el modelo que copiaba la versión 1, no se pasa). Las demás cachés
  // se quedan (la del modelo que escucha la letra, «transformers-cache»).
  e.waitUntil(
    (async () => {
      const actual = await caches.open(CACHE);
      for (const k of await caches.keys()) {
        if (!k.startsWith('voces-') || k === CACHE) continue;
        const vieja = await caches.open(k);
        for (const q of await vieja.keys()) {
          if (new URL(q.url).origin !== self.location.origin || (await actual.match(q))) continue;
          const r = await vieja.match(q);
          if (r && r.status === 200) await actual.put(q, r);
        }
        await caches.delete(k);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Lo de otros sitios (el modelo de Hugging Face, el motor de jsDelivr, el servidor) va directo a la red: sin copia
  // aquí y, si falla, sin nada en su lugar (quien lo pide sabe qué hacer sin conexión).
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        // Solo se guarda lo que llega bien y entero.
        if (res.status === 200) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      // Sin conexión, lo guardado. La página de la app sustituye a otra página (al abrirla), nunca a un archivo.
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? await caches.match('./index.html') : Response.error())),
  );
});
