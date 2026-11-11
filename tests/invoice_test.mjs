// Invoices are read, not taken on trust, and a call that gets no answer ends (audit of 10 Nov, A-09). In Node: what core.js reads of the
// local mint's real invoices; a Lightning address that gives an invoice for more than was asked is refused, one for less is paid (the
// rest comes back as change); a server that never answers is given up on. In Chromium: the donor's page says "N sat" beside the mint's
// invoice: a mint whose invoice asks for another amount is refused (by the library the app is built on; checked here so it stays so),
// in red, and nothing is kept to pay. Local mint, two local relays.
import fs from 'fs'; import http from 'http';
import { chromium } from 'playwright';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore; let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const quote = async sat => (await (await fetch(MINT + '/v1/mint/quote/bolt11', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: sat, unit: 'sat' }) })).json()).request;

// 1 · what is read of an invoice
const read = {}; for (const n of [1, 21, 1000, 2100000]) read[n] = C.invoiceExpiry(await quote(n));
check('the amount of the mint\'s invoices is read: 1, 21, 1 000 and 2 100 000 sat', Object.entries(read).every(([n, r]) => r && r.msat === Number(n) * 1000), JSON.stringify(Object.fromEntries(Object.entries(read).map(([n, r]) => [n, r && r.msat]))));
const inv21 = await quote(21), cut = inv21.slice(0, -3) + (inv21.endsWith('qqq') ? 'ppp' : 'qqq');
check('an invoice changed by a letter is not read at all', C.invoiceExpiry(cut) === null && C.invoiceExpiry('lnbc1') === null && C.invoiceExpiry('') === null);

// 2 · a Lightning address: its invoice is for what was asked, or less
const addr = (give) => async (u) => { const url = new URL(u); const j = url.pathname.startsWith('/.well-known') ? { tag: 'payRequest', callback: 'https://pay.example/cb', minSendable: 1000, maxSendable: 100000000 } : { pr: await quote(give(Number(url.searchParams.get('amount')) / 1000)) }; return { ok: true, status: 200, json: async () => j }; };
const fair = await C.lnAddressInvoice('cat@pay.example', 21, { fetch: addr(n => n) }).then(r => C.invoiceExpiry(r.invoice).msat, e => e.message);
const less = await C.lnAddressInvoice('cat@pay.example', 21, { fetch: addr(n => n - 3) }).then(r => C.invoiceExpiry(r.invoice).msat, e => e.message);
const more = await C.lnAddressInvoice('cat@pay.example', 21, { fetch: addr(n => n + 1) }).then(r => 'taken', e => e.message);
check('a Lightning address that gives an invoice for what was asked, or for less, is taken', fair === 21000 && less === 18000, `${fair} · ${less}`);
check('…and one that gives an invoice for more is refused', /gave an invoice for more than was asked/.test(more), more);

// 3 · a server that never answers
const mute = http.createServer(() => {}); await new Promise(r => mute.listen(7461, '127.0.0.1', r));
const t0 = Date.now(), gone = await C.fetchT('http://127.0.0.1:7461/v1/info', {}, 600).then(() => 'answered', e => e.name), took = Date.now() - t0;
check('a call to a server that never answers is given up on, in the time set', /Timeout|Abort/.test(gone) && took >= 500 && took < 3000, `${gone} after ${took} ms`);
const slow = await C.lnAddressInvoice('cat@127.0.0.1:7461', 21, { fetch: (u, o) => C.fetchT(u, o, 600) }).then(() => 'taken', e => e.message);
check('…and a Lightning address on it is said not to be reached', /cannot be reached/.test(slow), slow); mute.closeAllConnections(); mute.close();

// 4 · the donor's page: the mint's invoice is for the amount beside it, or nothing is shown to pay
const relays = [startRelay({ port: 7462 }), startRelay({ port: 7463 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(r => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => { say('DIALOG', d.message()); d.accept(); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const partner = await page(), rescue = await page();
await tab(partner, 'csettings'); await partner.click('#cs-new'); const clinicPk = await partner.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
await tab(rescue, 'release'); await rescue.click('#s-new'); await rescue.waitForTimeout(800); await rescue.reload(); await rescue.waitForTimeout(500);
await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-camp'); await rescue.waitForSelector('#campaign.on');
await rescue.click('#k-par'); await rescue.waitForSelector('#spick.on'); await rescue.click('#pp-add'); await rescue.fill('#pp-name', 'Clínica Sol'); await rescue.fill('#pp-key', clinicPk); await rescue.click('#pp-save'); await rescue.waitForSelector('#campaign.on');
await rescue.fill('#k-name', 'TNR INVOICE'); await rescue.fill('#k-mint', MINT); await rescue.click('#k-go'); const made = await waitText(rescue, '#k-out', /Announced to donors|✗/, 30000);
if (!/Announced to donors/.test(made)) { say('the campaign was not announced:', made.slice(0, 300)); process.exit(1); }
const donor = await page(); await tab(donor, 'donate'); await donor.click('#d-check'); await donor.waitForSelector('#d-reqs button.req', { timeout: 30000 }); await donor.locator('#d-reqs button.req', { hasText: 'TNR INVOICE' }).click(); await waitText(donor, '#d-campinfo', /TNR INVOICE/i, 15000);
const pend = () => donor.evaluate(() => JSON.parse(localStorage.getItem('vetlock.pending') || '[]').length), red = s => donor.evaluate(s => { const e = document.querySelector(s), bad = getComputedStyle(document.documentElement).getPropertyValue('--bad').trim(), probe = document.createElement('i'); probe.style.color = bad; document.body.appendChild(probe); const want = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(e).color === want; }, s);
const other = await quote(2100); let asked = 0;
await donor.route('**/v1/mint/quote/bolt11', async r => { if (r.request().method() !== 'POST') return r.continue(); asked++; const res = await r.fetch(), j = await res.json(); return r.fulfill({ response: res, json: { ...j, request: other } }); });  /* a mint that asks for a hundred times more */
const p0 = await pend(); await donor.fill('#d-amt', '21'); await donor.dispatchEvent('#d-amt', 'input'); await donor.click('#d-ln'); const said = await waitText(donor, '#d-out', /Failed|waiting for the payment/, 20000);
check('a mint whose invoice is not for the amount on screen: refused, in red, and no invoice shown or kept to pay', asked === 1 && /^Failed: .*invoice amount does not match/.test(said) && await red('#d-out') && !(await donor.evaluate(() => document.getElementById('donate').classList.contains('paying'))) && (await pend()) === p0, `${said.slice(0, 90)} · kept ${await pend()}`);
await donor.unroute('**/v1/mint/quote/bolt11'); await donor.click('#d-ln'); const fairSaid = await waitText(donor, '#d-out', /Failed|waiting for the payment|LOCKED/i, 20000);
check('the mint\'s own invoice, for the amount on screen, is shown as before', /waiting for the payment|LOCKED/i.test(fairSaid) || await donor.evaluate(() => document.getElementById('donate').classList.contains('paying') || document.getElementById('donate').classList.contains('done')), fairSaid.slice(0, 80));
await b.close(); await Promise.all(relays.map(r => r.close()));
say(bad ? `invoice: ${bad} check(s) failed` : 'invoice: every check passed'); process.exit(bad ? 1 : 0);
