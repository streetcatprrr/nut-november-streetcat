// The browser security policy (app/vercel.json): the pages are served here with the headers Vercel sends, by a small static server of
// this test on port 8090, and every screen of every role is opened, a donation is locked, the scanner and the card are drawn and the
// status page reads a ledger, while the page records every policy violation. None is allowed. The policy is the production one with
// one addition for this test only: the local mint and relays (http:// and ws:// on 127.0.0.1) in connect-src. Also checked: no inline
// script and no inline event handler is left in the pages (so the policy needs no hashes), and vercel.json carries every directive.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { pinBrowser, rewrite } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, PORT = 8090, BASE = `http://127.0.0.1:${PORT}/`, MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const V = JSON.parse(fs.readFileSync(APP + 'vercel.json', 'utf8')), H = Object.fromEntries(((V.headers || []).find(h => h.source === '/(.*)') || { headers: [] }).headers.map(h => [h.key, h.value]));
const CSP = H['Content-Security-Policy'] || '', dir = Object.fromEntries(CSP.split(';').map(x => x.trim()).filter(Boolean).map(x => { const [k, ...v] = x.split(/\s+/); return [k, v]; }));
const want = { 'default-src': ["'self'"], 'script-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'"], 'img-src': ["'self'", 'data:', 'blob:'], 'connect-src': ["'self'", 'https:', 'wss:'], 'font-src': ["'self'"], 'worker-src': ["'self'"], 'manifest-src': ["'self'"], 'object-src': ["'none'"], 'base-uri': ["'none'"], 'frame-ancestors': ["'none'"], 'form-action': ["'none'"] };
const missing = Object.entries(want).filter(([k, v]) => JSON.stringify(dir[k]) !== JSON.stringify(v)).map(([k]) => k);
check('vercel.json sends the policy with every page, with every directive as decided', !missing.length && !/unsafe-eval/.test(CSP), missing.length ? 'not as decided: ' + missing.join(', ') : Object.keys(dir).length + ' directives');
for (const page of ['index.html', 'status.html']) { const html = fs.readFileSync(APP + page, 'utf8'), inline = (html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).length, handlers = (html.match(/\son[a-z]+\s*=\s*["']/g) || []).length;
  check(`${page} has no inline script and no inline event handler (nothing to hash)`, !inline && !handlers, `${inline} inline script(s), ${handlers} handler(s)`); }
// the static server, with Vercel's headers (and the test's addition for the local mint and relays)
const TEST_CSP = CSP.replace("connect-src 'self' https: wss:", "connect-src 'self' https: wss: http://127.0.0.1:* ws://127.0.0.1:*");
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => { const u = new URL(req.url, BASE), f = path.join(APP, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname)); if (!f.startsWith(APP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', ...H, 'Content-Security-Policy': TEST_CSP }); if (f === APP + 'core.js') return res.end(rewrite(fs.readFileSync(f, 'utf8')));  /* the test's keys pinned (pin.mjs), for the service worker too */
  fs.createReadStream(f).pipe(res); });
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})); const seen = [];
const page = async () => { const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
  await c.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} document.addEventListener('securitypolicyviolation', e => { (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${e.blockedURI || ''} ${e.sourceFile ? e.sourceFile.split('/').pop() + ':' + e.lineNumber : ''}`.trim()); }); });
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) seen.push(m.text().slice(0, 160)); });
  await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(200); } return s; };
const violations = async p => (await p.evaluate(() => window.__csp || [])).concat(seen.splice(0));

// every screen of every role
const sc = await page(); await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(800);
const clinic = await page(); await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(800); const clinicPk = await txt(clinic, '#cs-pk');
for (const t of ['donate', 'refund', 'dhand', 'dcard', 'work', 'creq', 'certify', 'csettings', 'coffline', 'keys', 'home', 'scamp', 'snew', 'sreq', 'shand', 'release', 'campaign']) { await tab(sc, t); await sc.waitForTimeout(250); }
check('every screen opens under the policy, with no violation', !(await violations(sc)).length, (await violations(sc)).join(' | '));
// a campaign, a donation locked, its card drawn, the scanner opened (it loads jsqr.min.js), the service worker registered
await tab(sc, 'campaign'); await sc.reload(); await tab(sc, 'campaign'); await sc.fill('#k-name', 'MOCHI'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk); await sc.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await sc.click('#k-go'); await waitText(sc, '#k-out', /is ready|cannot/); await sc.waitForTimeout(800);
const link = (await txt(sc, '#k-out')).match(/http\S+#c=\S+/)[0], donor = await page(); await donor.goto(link); await donor.reload(); await donor.waitForTimeout(1500);
await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(21)); await donor.click('#d-go'); const locked = await waitText(donor, '#d-out', /LOCKED|Failed/);
/* the "Pay with ecash" screen above also drew its payment request (QR, Nostr key) under the policy */
await donor.click('#d-out a:has-text("share a card")'); await donor.waitForSelector('#dk-img img', { timeout: 20000 }); await tab(donor, 'shand'); await donor.click('#v-scan'); await donor.waitForTimeout(1500); await donor.evaluate(() => window.__vetlock.scanEnd());
const jsqr = await donor.evaluate(() => typeof window.jsQR === 'function'), sw = await donor.evaluate(async () => { for (let i = 0; i < 30; i++) { const r = await navigator.serviceWorker.getRegistration(); if (r && r.active) return true; await new Promise(x => setTimeout(x, 200)); } return false; });
check('a donation is locked, its card drawn, the scanner loaded and the app saved offline, with no violation', /LOCKED 21 sat/.test(locked) && jsqr && sw && !(await violations(donor)).length, (await violations(donor)).join(' | ') || `scanner ${jsqr} · service worker ${sw}`);
// the status page reads a ledger
const L = { campaign: JSON.parse(Buffer.from(link.split('#c=')[1], 'base64url').toString()), donations: [locked.match(/cashuB[A-Za-z0-9_\-=]+/g).pop()] };  /* a version 1 ledger with the donation just locked */
const viewer = await page(); await viewer.route('**/campaigns/mochi.json', r => r.fulfill({ json: L })); await viewer.goto(BASE + 'status.html?l=campaigns/mochi.json');
await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 40000 }); await viewer.waitForTimeout(800);
const vs = await violations(viewer), lo = (await txt(viewer, '#l-out')).split('\n')[0]; check('the status page reads a ledger under the policy and checks its donation at the mint, with no violation', !vs.length && /^Checked 1 donation/.test(lo), vs.join(' | ') || lo);
// and the policy really bites: a script injected inline is refused
const blocked = await viewer.evaluate(() => new Promise(res => { document.addEventListener('securitypolicyviolation', e => res(e.violatedDirective), { once: true }); const s = document.createElement('script'); s.textContent = 'window.__ran = 1'; document.body.appendChild(s); setTimeout(() => res(window.__ran ? 'ran' : 'none'), 1000); }));
check('…and the policy is in force: an inline script added to the page does not run', /^script-src/.test(blocked), blocked);

await b.close(); server.close(); say(bad ? `csp: ${bad} check(s) failed` : 'csp: every check passed'); process.exit(bad ? 1 : 0);
