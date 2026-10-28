/* global self, caches, fetch, URL, location, Response, Headers */
// NUHUD mobile : l'app s'ouvre même hors ligne. Coquille de l'app en cache ; données chiffrées : réseau d'abord,
// dernière copie connue sinon (elle reste chiffrée dans le cache), marquée `x-nuhud-offline` pour l'afficher.
const CACHE = 'nuhud-v2'
self.addEventListener('install', (e) => {
  // la coquille et ses fichiers (noms avec empreinte, lus dans index.html) : l'app s'ouvre hors ligne dès la 1re visite
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png'])
      const html = await (await fetch('./index.html', { cache: 'no-store' })).text()
      await c.addAll([...new Set(html.match(/\.\/assets\/[^"']+/g) ?? [])])
    })
  )
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('nuhud-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

/** Copie servie depuis le cache, signalée comme telle à l'app. */
async function offline(hit) {
  const headers = new Headers(hit.headers)
  headers.set('x-nuhud-offline', '1')
  return new Response(await hit.blob(), { status: hit.status, headers })
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  // data.json?t=… : une seule entrée de cache, quelle que soit la requête
  const isData = url.pathname.endsWith('/data.json')
  const key = isData ? new URL('./data.json', location.href).href : e.request
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(key, copy))
        }
        return res
      })
      .catch(async () => {
        const hit = await caches.match(key, { ignoreSearch: true })
        if (hit) return isData ? offline(hit) : hit
        return isData ? new Response('', { status: 503 }) : caches.match('./index.html')
      })
  )
})
