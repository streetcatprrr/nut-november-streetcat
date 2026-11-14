// The app offline: its pages, code, font and icons are kept on the phone, so a clinic can open it and certify without coverage.
// One version at a time (review of 9 Nov: each file used to come from the network on its own, so a connection lost half way could leave
// the new page with the old code). A version is BUILD (tools/stamp-sw.mjs: a hash of the files below, so any change makes a new one):
// all of its files are fetched into its own cache before it is used, and if one cannot be fetched it is not used at all; the app's
// files are then served from that cache, and a new version waits until the page says it is a good moment (index.js: nothing under way)
// and opens again in it. The first version a phone gets is used at once. Nothing else is touched: the mint, the prices and every other
// address go to the network as before.
// The cat recognition is kept apart (ai/1/: its engine and two models, 48 MB; ai/2/: two more, for the face, 72 MB; these files never
// change), and only once the clinic or Streetcat has asked for it, so a donor's phone never downloads it: from that copy first, then the
// network. Offline setup can fill that copy ahead of time (catid.js, keep(), under the same name).
const BUILD = '91b596fe68a1';
const CACHE = 'streetcat-app-' + BUILD, AI = 'streetcat-ai-1';
const SHELL = ['index.html', 'index.js', 'status.html', 'status.js', 'fit.js', 'cashu-bundle.js', 'core.js', 'nostr-bundle.js', 'relay.js', 'vault.js', 'qrcode.min.js', 'jsqr.min.js', 'catid.js', 'catid-worker.js', 'fonts/DepartureMono-Regular.woff2', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(f => new Request(f, { cache: 'reload' }))))  /* whole, from the network, or not at all */
  .catch(err => caches.delete(CACHE).then(() => { throw err; }))  /* a version that could not be fetched whole leaves nothing behind */
  .then(() => { if (!self.registration.active) return self.skipWaiting(); })); });  /* the first one: nothing to wait for */
self.addEventListener('message', e => { if (e.data && e.data.type === 'take') self.skipWaiting();  /* the page: a good moment (index.js) */
  else if (e.data && e.data.type === 'build' && e.ports && e.ports[0]) e.ports[0].postMessage(BUILD); });  /* the version this phone runs, for Keys and Settings */
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith('streetcat-app-') && k !== CACHE) || (k.startsWith('streetcat-ai-') && k !== AI)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const SCOPE = new URL('./', self.location).pathname, OWN = new Set(SHELL.map(f => SCOPE + f)), AIDIR = SCOPE + 'ai/';  // ai/1/ and ai/2/
const PAGES = new Set(['', 'index.html', 'donate', 'clinic', 'streetcat', 'status', 'status.html'].map(p => SCOPE + p));  /* the app's pages; any other address (a ledger file) goes to the network */
self.addEventListener('fetch', e => { const r = e.request, u = new URL(r.url), page = r.mode === 'navigate';
  if (r.method !== 'GET' || u.origin !== self.location.origin) return;
  if (u.pathname.startsWith(AIDIR)) return e.respondWith(caches.open(AI).then(c => c.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok && res.type === 'basic' && !res.redirected) c.put(r, res.clone()).catch(() => {}); return res; }))));
  if (!(page ? PAGES.has(u.pathname) : OWN.has(u.pathname) && !u.search)) return;  // only the pages and the files above (a file asked for with a query goes to the network, as before)
  const file = page ? (/\/status(\.html)?$/.test(u.pathname) ? 'status.html' : 'index.html') : u.pathname.slice(SCOPE.length);  /* /donate, /clinic and /streetcat are the app page */
  e.respondWith(caches.open(CACHE).then(c => c.match(file)).then(hit => hit || fetch(r)).catch(() => Response.error())); });  /* this version's copy; the network only if it lacks one */
