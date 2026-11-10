// Deadlines (plan step 1), in the three apps against the local mint and two local relays (made-up
// keys, fake money). Two pots of one partner: refunds open in 2 days in one, in 30 in the other. A request for work in 5 days from the
// first: the dates, then in red "✗ Refund window opens …, before the work", the funding checked at the mint now in green, the button
// says "Send anyway", and "Pay from …" offers only the other pot, with its date; chosen, "✓ Refund window opens after the required
// date". With the mint not answering Rescue's phone, the funding is what it said last ("✗ Funding not checked · Last verified at …"):
// the request can still be sent, and tells the partner, whose app asks the mint itself ("✓ Checked at the mint now: n of n still
// locked"); once refunds are open too, it is not sent. Donate shows the invoice's own expiry, and the mint's quote's only when it
// differs. Every screen fits the phone at 320, 375, 390 and 430 px.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1600); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };  /* SHOT_DIR=dir: t1–t4 at 390 px @2x */
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7271 }), startRelay({ port: 7272 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); return p; };
const donor = await page(), clinic = await page(), sc = await page();
for (const p of [donor, clinic, sc]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(200); } return x; };
const lines = p => p.$$eval('#sn-time > div', ds => ds.map(d => ({ t: d.textContent, cls: d.className })));
const linesUntil = async (p, i, re, ms = 30000) => { const t0 = Date.now(); let L = []; while (Date.now() - t0 < ms) { L = await lines(p); if (L[i] && re.test(L[i].t)) return L; await p.waitForTimeout(200); } return L; };
const FIT = [], FITBAD = []; const fits = async (p, label) => { const vs = p.viewportSize(), over = []; for (const wd of [320, 375, 390, 430]) { await p.setViewportSize({ width: wd, height: 740 }); await p.waitForTimeout(80); const o = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${wd}px +${o}`); }
  await p.setViewportSize(vs); FIT.push(label); if (over.length) FITBAD.push(`${label}: ${over.join(', ')}`); };
const D = '\\d{1,2} [A-Z][a-z]{2}', madrid = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(Date.now() + n * 864e5));
const more = async () => { if (await sc.isVisible('#sn-edit')) await sc.click('#sn-edit'); await sc.waitForSelector('#sn-date', { state: 'visible' }); };  /* the date, under "edit" unless the form is open */
const pickPot = async name => { await sc.click('#sn-pot'); await sc.waitForSelector('#spick.on'); await sc.locator('#pp-list button.req', { hasText: name }).first().click(); await sc.waitForSelector('#snew.on'); };

// keys, two pots of one partner (refunds in 2 and in 30 days), a donation in each, sent to Streetcat as it locks
await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1200); const clinicPk = await txt(clinic, '#cs-pk');
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1200);
const dl = {}, mk = async (name, days) => { await tab(sc, 'campaign'); await sc.reload(); await tab(sc, 'campaign'); await sc.fill('#k-name', name); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk);
  const d = new Date(Date.now() + 864e5 * days).toISOString().slice(0, 10); dl[name] = Math.floor(new Date(d + 'T23:59:59Z').getTime() / 1000); await sc.fill('#k-dl', d);
  await sc.click('#k-go'); await waitText(sc, '#k-out', /is ready|cannot|pick another/); await sc.waitForTimeout(1200); return (await txt(sc, '#k-out')).match(/http\S+#c=\S+/)[0]; };
const give = async (link, n) => { await donor.goto(link); await donor.reload(); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(n)); await donor.click('#d-go');
  await waitText(donor, '#d-out', /LOCKED|Failed/); await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000); };
const L2 = await mk('PLAYA DOS', 2), L30 = await mk('PLAYA TREINTA', 30); await give(L2, 100); await give(L30, 100);
const inLedger = () => sc.evaluate(() => Object.values(JSON.parse(localStorage.getItem('vetlock.sc.ledger') || '{}')).reduce((n, L) => n + Object.keys((L && L.entries) || {}).length, 0));
for (let i = 0; i < 90 && await inLedger() < 2; i++) { await sc.evaluate(() => window.__vetlock.scCheck()).catch(() => {}); await sc.waitForTimeout(1000); }
check('both donations reach Rescue\'s pots by relay', await inLedger() === 2);

// a request for work in 5 days, from the pot whose refunds open in 2
await tab(sc, 'scamp'); await sc.click('#sc-new'); await sc.waitForSelector('#snew.on'); await pickPot('PLAYA DOS');
await sc.waitForFunction(() => document.querySelectorAll('#sn-dons input').length >= 1, null, { timeout: 30000 });
await sc.fill('#sn-cat', 'MOCHI'); await sc.fill('#sn-proc', 'sterilisation (spay)'); await sc.fill('#sn-cost', '50'); await more(); await sc.fill('#sn-date', madrid(5)); await sc.dispatchEvent('#sn-date', 'change');
let L = await linesUntil(sc, 1, /before the work/);
check('a request for work in 5 days from the pot whose refunds open in 2: the dates, in grey', L.length >= 3 && new RegExp(`^Required until ${D}: the work on ${D}, 1 day to confirm and a 2-day margin \\(estimates\\)$`).test(L[0].t) && L[0].cls === 'mut', JSON.stringify(L));
check('…then why, in red: "✗ Refund window opens …, before the work"', new RegExp(`^✗ Refund window opens ${D}, before the work$`).test((L[1] || {}).t) && L[1].cls === 'bad', L[1] && L[1].t);
check('…the funding, checked at the mint now, in green', /^✓ Funding checked at the mint at \d{1,2}:\d{2}( [AP]M)?$/.test((L[2] || {}).t) && L[2].cls === 'ok', L[2] && L[2].t);
check('…and the button says "Send anyway"', (await txt(sc, '#sn-go')) === 'Send anyway', await txt(sc, '#sn-go'));
const alts = await sc.$$eval('#sn-alt button', bs => bs.map(b => b.textContent.trim())), pay = alts.filter(a => /^Pay from /.test(a));
check('…"Pay from …" offers only the pot whose refunds open after the required date, with its date; and "Change the date"', alts.includes('Change the date') && pay.length === 1 && new RegExp(`^Pay from PLAYA TREINTA · refunds from ${D}$`).test(pay[0]), JSON.stringify(alts));
await fits(sc, 'New request, before the work'); await shot(sc, 't1-before-the-work');
await sc.locator('#sn-alt button', { hasText: 'Pay from PLAYA TREINTA' }).click(); L = await linesUntil(sc, 1, /^✓/);
check('…chosen: "✓ Refund window opens after the required date", in green, and the button sends to the partner', new RegExp(`^✓ Refund window opens after the required date \\(${D}\\)$`).test((L[1] || {}).t) && L[1].cls === 'ok' && /^Send to /.test(await txt(sc, '#sn-go')) && (await sc.$eval('#sn-alt', e => e.hidden)), JSON.stringify(L));
await shot(sc, 't2-after-the-required-date');

// the mint does not answer Rescue's phone: what it said last, and the request still goes, saying so
await sc.route(MINT + '/**', r => r.abort()); await pickPot('PLAYA TREINTA'); L = await linesUntil(sc, 2, /not checked/);
check('with no answer from the mint: "✗ Funding not checked · Last verified at …", in red, and it can still be sent', /^✗ Funding not checked · Last verified at \d{1,2}:\d{2}( [AP]M)?$/.test((L[2] || {}).t) && L[2].cls === 'bad' && !(await sc.$eval('#sn-go', b => b.disabled)), JSON.stringify(L));
await fits(sc, 'New request, funding not checked'); await shot(sc, 't3-funding-not-checked');
await sc.click('#sn-go'); await sc.waitForFunction(() => window.__vetlock.sreqs().some(r => r.q.patient === 'MOCHI'), null, { timeout: 30000 }).catch(() => {});
const sr = await sc.evaluate(() => window.__vetlock.sreqs().find(r => r.q.patient === 'MOCHI') || null);
check('…sent: it tells the partner, outside what the partner signs, and keeps the dates it was sent with', !!sr && !!sr.q.funding && sr.q.funding.checked === false && !!Date.parse(sr.q.funding.at) && !!sr.timing && sr.timing.level === 'ok' && sr.timing.mintChecked === false, JSON.stringify(sr && { funding: sr.q.funding, timing: sr.timing }));

// the partner's app: what Streetcat's app could not check, and what the mint says now
const showW = async (p, id) => { await p.evaluate(id => { const b = document.getElementById(id); if (b && !b.classList.contains('on')) b.click(); }, id); await p.waitForFunction(() => !document.querySelector('#w-list [style*="max-height"]'), null, { timeout: 15000 }).catch(() => {}); };
await tab(clinic, 'work'); await clinic.click('#w-check'); await waitText(clinic, '#w-n', /^1$/, 60000); await showW(clinic, 'w-pend');
await clinic.locator('#w-list .item', { hasText: /^MOCHI / }).click(); await clinic.waitForSelector('#creq.on');
await waitText(clinic, '#cr-fund', /Checked at the mint/, 30000); const fl = await clinic.$$eval('#cr-fund > div', ds => ds.map(d => ({ t: d.textContent, cls: d.className })));
check('the partner sees, in red: "✗ Streetcat\'s app: funding not checked when sent · last verified at …"', fl.length === 2 && /^✗ Streetcat's app: funding not checked when sent · last verified at \d{1,2}:\d{2}( [AP]M)?$/.test(fl[0].t) && fl[0].cls === 'bad', JSON.stringify(fl));
check('…and its app asks the mint itself, in green: "✓ Checked at the mint now: n of n still locked"', /^✓ Checked at the mint now: (\d+) of \1 still locked$/.test((fl[1] || {}).t) && fl[1].cls === 'ok', JSON.stringify(fl[1]));
await fits(clinic, 'Partner, the request'); await shot(clinic, 't4-partner-funding');

// refunds open too, and the mint still silent: not sent
await tab(sc, 'scamp'); await sc.click('#sc-new'); await sc.waitForSelector('#snew.on'); await pickPot('PLAYA DOS'); await sc.waitForFunction(() => document.querySelectorAll('#sn-dons input').length >= 1, null, { timeout: 30000 });
await sc.fill('#sn-cat', 'TEO'); await sc.fill('#sn-proc', 'castration'); await sc.fill('#sn-cost', '30'); await sc.clock.setFixedTime(new Date((dl['PLAYA DOS'] + 3600) * 1000));
await more(); await sc.fill('#sn-date', madrid(3)); await sc.dispatchEvent('#sn-date', 'change');
L = await linesUntil(sc, 1, /Refunds are open/);
check('refunds open and no answer from the mint: in red, and the button does not send', (L[1] || {}).t === '✗ Refunds are open: donors can take these sats back now' && L[1].cls === 'bad' && (await sc.$eval('#sn-go', b => b.disabled)), JSON.stringify(L));

// Donate: the invoice's own expiry; the mint's quote's only when it differs (the payment held back, so the page keeps waiting)
const unpaid = async r => { if (r.request().method() !== 'GET') return r.continue(); const res = await r.fetch(), j = await res.json(); j.state = 'UNPAID'; if ('paid' in j) j.paid = false; await r.fulfill({ response: res, json: j }); };
const lnStart = async (p, n) => { await p.route('**/v1/mint/quote/bolt11/*', unpaid); await p.goto(L30); await p.reload(); await p.fill('#d-amt', String(n)); await p.click('#d-ln'); return waitText(p, '#d-st', /expires/, 20000); };
const st1 = await lnStart(donor, 21);
check('Donate: "invoice expires …", read from the invoice, and nothing about the mint\'s quote when it ends at the same time', /^waiting for the payment… · invoice expires \d{1,2}:\d{2}( [AP]M)?$/.test(st1), st1);
const donor2 = await page(); await donor2.goto(BASE + 'index.html');
await donor2.route('**/v1/mint/quote/bolt11', async r => { if (r.request().method() !== 'POST') return r.continue(); const res = await r.fetch(), j = await res.json(); j.expiry = Number(j.expiry) + 600; await r.fulfill({ response: res, json: j }); });
const st2 = await lnStart(donor2, 22);
check('…and when the mint\'s quote ends at another time, that too', /^waiting for the payment… · invoice expires \d{1,2}:\d{2}( [AP]M)? · the mint's quote expires \d{1,2}:\d{2}( [AP]M)?$/.test(st2), st2);

check('every screen fits the phone at 320, 375, 390 and 430 px', !FITBAD.length, FITBAD.join('; ') || `${FIT.length} screens`);
await b.close(); for (const r of relays) r.close && r.close();
say(bad ? `timing: ${bad} check(s) failed` : 'timing: every check passed'); process.exit(bad ? 1 : 0);
