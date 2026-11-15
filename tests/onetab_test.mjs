// One tab at a time (app/onetab.js, 15 Nov), on the real pages in Chromium. Needs the page server only (8080); no mint, no relay.
// Group 2 of the six scans (14–15 Nov: 2.3, 2.5, 2.15, 2.17, 3.8, 3.14, 3.34, 4.13, 4.14, 4.19, 4.23, 4.26): two tabs of one browser
// wrote over each other's records. Tried as it was found: of 120 records kept at once by two tabs with the app's own code, 8 to 23
// were lost (released ecash among them), and a PIN removed in one tab while the other was being opened with it left the keys sealed
// with no PIN to open them. Now a second tab says the app is open in another, runs nothing of it and writes nothing, and opens it when
// asked once the first is closed; the first, opened again, keeps it; a tab the browser keeps aside lets go of it; a browser slow to
// answer gets the screen, whose button asks again; the status page opens next to the app and only reads. Each check fails on the code
// before but one: a browser without Web Locks runs the app as before.
import { chromium } from 'playwright';
import { pinBrowser } from './pin.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8080/', say = (...a) => console.log(...a), PIN = '48291375';
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})), errors = [];
const ctxOf = async init => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} }); if (init) await c.addInitScript(init); return c; };
const open = async (c, init, path = 'index.html') => { const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); if (init) await p.addInitScript(init);
  await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + path); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim(), raw = (p, k) => p.evaluate(k => localStorage.getItem(k), k);
const runs = p => p.evaluate(() => typeof window.__vetlock === 'object'), waits = async p => !!(await p.$('#one-tab'));
const appIn = (p, ms = 15000) => p.waitForFunction(() => !!window.__vetlock, null, { timeout: ms }).then(() => true, () => false);
const waitText = async (p, s, re, ms = 15000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(100); } return x; };
const isRed = (p, s) => p.evaluate(s => { const e = document.querySelector(s), i = document.createElement('i'); i.style.color = getComputedStyle(document.documentElement).getPropertyValue('--bad').trim(); document.body.appendChild(i); const want = getComputedStyle(i).color; i.remove(); const leaf = [...e.querySelectorAll('*')].find(x => !x.children.length && x.textContent.trim()) || e; return getComputedStyle(leaf).color === want; }, s);
// what a page writes itself to localStorage and IndexedDB (not what this suite's harness sets as each page opens)
const SPY = () => { const harness = k => /^(vetlock\.(relays|holdms|kform|anim)|test\.)/.test(k), w = window.__writes = [];
  for (const m of ['setItem', 'removeItem', 'clear']) { const f = Storage.prototype[m]; Storage.prototype[m] = function (k, ...r) { if (this === window.localStorage && !harness(String(k))) w.push(m + ' ' + k); return f.call(this, k, ...r); }; }
  for (const m of ['put', 'add', 'delete', 'clear']) { const f = IDBObjectStore.prototype[m]; IDBObjectStore.prototype[m] = function (...a) { w.push('IndexedDB ' + m); return f.apply(this, a); }; }
  const o = IDBFactory.prototype.open; IDBFactory.prototype.open = function (...a) { w.push('IndexedDB open ' + a[0]); return o.apply(this, a); }; };

// 1 · a second tab: the screen, nothing of the app, nothing written
const c1 = await ctxOf(), A = await open(c1); await appIn(A);
const B = await open(c1, SPY); await B.waitForSelector('#one-tab', { timeout: 5000 }).catch(() => {}); await B.waitForTimeout(800);
const sb = await B.evaluate(() => ({ text: (document.getElementById('one-tab') || {}).textContent || '', app: typeof window.__vetlock, gate: !!document.getElementById('pin-gate'), writes: window.__writes || [] }));
check('a second tab of the same browser says the app is open in another one, and nothing of the app runs there', /^Open in another tab/.test(sb.text) && /open in another tab or window of this browser already/.test(sb.text) && /use it there, or close it there and open it here/.test(sb.text) && sb.app === 'undefined' && !sb.gate, sb.text.slice(0, 50) + '… · app ' + sb.app);
const wrote = await B.evaluate(() => window.scVault.write('vetlock.clinic.sk', 'f'.repeat(64)));
check('…it writes nothing (no record, no key, nothing in IndexedDB), and a key written through its vault is refused', sb.writes.length === 0 && wrote === false && (await raw(A, 'vetlock.clinic.sk')) !== 'f'.repeat(64), sb.writes.slice(0, 4).join(', ') + ` · vault ${wrote}`);

// 2 · records kept at once in both tabs, with the app's own functions (as tried before the fix: some were lost)
const burst = (p, tag) => p.evaluate(async tag => { const V = window.__vetlock; if (!V) return 0;
  for (let i = 0; i < 60; i++) { V.saveMelt({ id: tag + i, state: 'pending', pk: '02' + '0'.repeat(64), at: Date.now() }); await new Promise(r => setTimeout(r, Math.random() * 3)); } return 60; }, tag);
const [na, nb] = await Promise.all([burst(A, 'a'), burst(B, 'b')]); await A.waitForTimeout(400);
const kept = await A.evaluate(() => JSON.parse(localStorage.getItem('vetlock.donor.melts') || '[]').length);
check('two tabs keeping records at once: every record the app kept is there (the second keeps none: it does not run)', nb === 0 && kept === na + nb, `${kept} of ${na + nb} kept`);

// 3 · "Open it here" while the other is open; the first opened again; the first closed
await B.click('#one-tab-go', { timeout: 3000 }).catch(() => {}); const refused = await waitText(B, '#one-tab-out', /✗|✓/, 5000);
check('"Open it here" while the other is open: refused, said in red, and the app does not start', refused === '✗ It is still open in the other tab: close it there first.' && await isRed(B, '#one-tab-out').catch(() => false) && !(await runs(B)), refused);
await A.reload(); await appIn(A); await B.waitForTimeout(300);
check('the first tab opened again (a reload: a PIN given, a new version) has the app again; the waiting tab never takes it by itself', await runs(A) && !(await waits(A)) && await waits(B) && !(await runs(B)));
await A.close(); const waited = await waits(B); await B.click('#one-tab-go', { timeout: 3000 }).catch(() => {}); await appIn(B, 10000);
check('the first closed, "Open it here" starts the app in the second (which waited until then), with what the first kept', waited && await runs(B) && !(await waits(B)) && (await B.evaluate(() => window.__vetlock.melts().length)) === kept);
await c1.close();

// 4 · 2.15: a PIN removed in the tab that runs the app while the other is opened with it
const c2 = await ctxOf(), H = await open(c2); await appIn(H);
await tab(H, 'csettings'); await H.click('#cs-new'); const sk = await H.evaluate(() => window.__vetlock.key('clinic', false)); await H.waitForTimeout(1500);
await H.click('#cs-pin-sum'); await H.fill('#cs-pin-a', PIN); await H.fill('#cs-pin-b', PIN); await H.click('#cs-pin-set'); const set = await waitText(H, '#cs-pin-out', /✓|✗/);
const W = await open(c2); await W.waitForTimeout(1200);
check('with a PIN set in the tab that runs the app, a second tab asks for no PIN: it says the app is open in another', /^✓ Keys locked/.test(set) && await waits(W) && !(await W.$('#pin-gate')), set.slice(0, 40));
// the schedule as tried: the PIN removed (what "remove PIN" does once the PIN is checked), and a quarter of the time a key takes to make
// later, the other tab opened with it, by hand behind its screen (what its "Keys locked" did): it read the PIN's record before the change
// and sealed the keys after it, under no PIN at all
const d = await H.evaluate(async pin => { const t = performance.now(); await window.scVault.check(pin); return performance.now() - t; }, PIN);
const pClear = H.evaluate(pin => window.scVault.clear(pin).then(String, e => 'threw: ' + e.message), PIN); await W.waitForTimeout(Math.round(d / 4));
const pUnl = W.evaluate(pin => window.scVault.unlock(pin).then(String, e => 'threw: ' + e.message), PIN);
const [cleared, unl] = await Promise.all([pClear, pUnl]); await H.waitForTimeout(500);
check('…and the PIN removed there while that tab is opened with it: every key is still read, in the clear as before (it was sealed again under no PIN at all)', cleared === 'true' && (await raw(H, 'vetlock.pin')) === null && (await raw(H, 'vetlock.clinic.sk')) === sk && (await H.evaluate(() => window.__vetlock.key('clinic', false))) === sk, `removed ${cleared} · the other tab's unlock ${unl} · slot ${String(await raw(H, 'vetlock.clinic.sk')).slice(0, 10)}…`);
await c2.close();

// 5 · a tab the browser keeps aside to show again (back/forward cache). This Chromium keeps none that holds a Web Lock (tried: the lock
// goes, the page opens again from the start), so the browser's own events are sent to it
const c3 = await ctxOf(), K1 = await open(c3); await appIn(K1); const K2 = await open(c3); await K2.waitForSelector('#one-tab', { timeout: 5000 }).catch(() => {});
await K1.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
const aside = await K1.evaluate(async () => ({ vault: window.scVault.write('vetlock.clinic.sk', 'e'.repeat(64)), ledger: await window.__vetlock.ledgerSet('x|1', { DONx: { token: 't', amount: 1 } }).then(r => r, () => 'threw') }));
await K2.click('#one-tab-go', { timeout: 3000 }).catch(() => {}); await appIn(K2, 10000);
check('a tab the browser keeps aside lets go of the app and writes nothing more (its vault and its ledger refuse); another can take it', aside.vault === false && aside.ledger === false && await runs(K2), JSON.stringify(aside));
await K1.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))).catch(() => {}); await K1.waitForSelector('#one-tab', { timeout: 10000 }).catch(() => {});
check('…and back from there it opens again from the start: now it is the one that waits', await waits(K1) && !(await runs(K1)));

// 6 · the status page next to the app
const S = await open(c3, null, 'status.html'); await S.waitForTimeout(800);
check('the status page opens next to the app, says nothing of another tab, and writes nothing (its vault only reads)', !(await waits(S)) && (await S.evaluate(() => window.scVault.write('vetlock.clinic.sk', 'x'))) === false && await runs(K2));
await c3.close();

// 7 · a browser that does not answer at once
const c4 = await ctxOf(() => { const real = LockManager.prototype.request; let first = true; LockManager.prototype.request = function (...a) { if (first) { first = false; return new Promise(() => {}); } return real.apply(this, a); }; });
const L = await open(c4), early = await waits(L); await L.waitForSelector('#one-tab', { timeout: 6000 }).catch(() => {}); const late = await waits(L);
await L.click('#one-tab-go', { timeout: 3000 }).catch(() => {}); await appIn(L, 10000);
check('a browser that does not answer at once: after a moment the screen, and its button asks again and starts the app', !early && late && await runs(L) && !(await waits(L)), `screen at once ${early}, later ${late}`);
await c4.close();

// 8 · a browser without Web Locks
const c5 = await ctxOf(() => { try { Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true }); } catch (_) {} });
const N1 = await open(c5), N2 = await open(c5); await appIn(N1); await appIn(N2);
check('a browser without Web Locks runs the app as before, in each tab (nothing to keep it to one)', await runs(N1) && await runs(N2) && !(await waits(N1)) && !(await waits(N2)));
await c5.close();

check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '));
say(bad ? `onetab: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'onetab: every check passed'); await b.close(); process.exit(bad ? 1 : 0);
