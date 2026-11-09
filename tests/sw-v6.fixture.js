// The service worker as it was until this version (main at 5c0c19a, cache streetcat-app-v6): each file from the network first, copied one by one. tests/swupdate_test.mjs installs it first, then publishes this version over it, as a phone gets it.
// The app offline: its pages, code, font and icons are kept on the phone, so a clinic can open it and certify without coverage.
// Everything of this site comes from the network first (so a new version is there at once) and from this copy only when there
// is no network. Nothing else is touched: the mint, the prices and every other address go to the network as before.
// The cat recognition is kept apart (ai/1/: its engine and two models, 48 MB; ai/2/: two more, for the face, 72 MB; these files never change),
// and only once the clinic or Streetcat has asked for it, so a donor's phone never downloads it: from that copy first, then the network.
// Offline setup can fill that copy ahead of time (catid.js, keep(), under the same name).
const CACHE = 'streetcat-app-v6', AI = 'streetcat-ai-1';
const SHELL = ['index.html', 'index.js', 'status.html', 'status.js', 'fit.js', 'cashu-bundle.js', 'core.js', 'nostr-bundle.js', 'relay.js', 'qrcode.min.js', 'jsqr.min.js', 'catid.js', 'catid-worker.js', 'fonts/DepartureMono-Regular.woff2', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith('streetcat-app-') && k !== CACHE) || (k.startsWith('streetcat-ai-') && k !== AI)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const SCOPE = new URL('./', self.location).pathname, OWN = new Set(SHELL.map(f => SCOPE + f)), AIDIR = SCOPE + 'ai/';  // ai/1/ and ai/2/
self.addEventListener('fetch', e => { const r = e.request, u = new URL(r.url), page = r.mode === 'navigate';
  if (r.method !== 'GET' || u.origin !== self.location.origin) return;
  if (u.pathname.startsWith(AIDIR)) return e.respondWith(caches.open(AI).then(c => c.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok && res.type === 'basic' && !res.redirected) c.put(r, res.clone()).catch(() => {}); return res; }))));
  if (!(page || OWN.has(u.pathname))) return;  // only the pages and the files above
  const fallback = /\/status(\.html)?$/.test(u.pathname) ? 'status.html' : 'index.html';  // /donate, /clinic and /streetcat are the app page
  e.respondWith(fetch(r).then(res => { if (res.ok && res.type === 'basic' && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)).catch(() => {}); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: page }).then(hit => hit || (page ? caches.match(fallback) : undefined)).then(hit => hit || Response.error()))); });
