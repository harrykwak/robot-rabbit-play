// Retire only this game's old GitHub Pages cache and move online clients.
const destination = 'https://game.rorabat.com/';
const scope = new URL(self.registration.scope);
const belongsHere = url => url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
const migratedURL = old => destination + old.search + old.hash;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (!name.startsWith('rr-shell-')) continue;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      if (belongsHere(new URL(request.url))) await cache.delete(request);
    }
    if (!(await cache.keys()).length) await caches.delete(name);
  }
  await self.clients.claim();
  for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
    const old = new URL(client.url);
    if (belongsHere(old)) await client.navigate(migratedURL(old)).catch(() => {});
  }
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (!belongsHere(url)) return;
  event.respondWith(event.request.mode === 'navigate'
    ? Response.redirect(migratedURL(url), 302)
    : new Response('Play at ' + destination, { status: 410 }));
});
