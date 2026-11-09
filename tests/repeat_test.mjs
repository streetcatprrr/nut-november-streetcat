// Repeat and drafts (plan step 2, approved by StreetCat on 8 Nov, 22:11), in Rescue and the partner's app against the local mint and two
// local relays (made-up keys, fake money). A sterilisation request (MOCHI, 50 sat) is confirmed by the partner and released. "Repeat
// request" opens New request with its pot and what it is, and says where it comes from; the cat, photos, cost, date, note and
// donations are chosen again ("Last time: 50 sat on … · check the cost"). Sent, it has a new id and says "Repeated from R-…"; the old
// one is still released and unchanged, and the new one takes none of its proofs. "Repeat a recent one" offers it on a new request.
// "Keep as draft" keeps the form's fields on the kind's screen, reserving nothing; opened, they are back; "Delete draft" removes it.
// With the pot closed, the repeat says so and offers to make a campaign. Every screen fits the phone at 320, 375, 390 and 430 px.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1600); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };  /* SHOT_DIR=dir: p1–p4 at 390 px @2x */
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7281 }), startRelay({ port: 7282 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); return p; };
const donor = await page(), clinic = await page(), sc = await page();
for (const p of [donor, clinic, sc]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(200); } return x; };
const FIT = [], FITBAD = []; const fits = async (p, label) => { const vs = p.viewportSize(), over = []; for (const wd of [320, 375, 390, 430]) { await p.setViewportSize({ width: wd, height: 740 }); await p.waitForTimeout(80); const o = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${wd}px +${o}`); }
  await p.setViewportSize(vs); FIT.push(label); if (over.length) FITBAD.push(`${label}: ${over.join(', ')}`); };
const D = '\\d{1,2} [A-Z][a-z]{2}', madrid = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(Date.now() + n * 864e5));
const sreqs = () => sc.evaluate(() => window.__vetlock.sreqs());
const value = s => sc.$eval(s, e => e.value);

// keys, a pot with a donation sent to Streetcat as it locks
await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1200); const clinicPk = await txt(clinic, '#cs-pk');
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1200);
await tab(sc, 'campaign'); await sc.fill('#k-name', 'PLAYA REPITE'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk); const dlDay = new Date(Date.now() + 864e5 * 30).toISOString().slice(0, 10), DL = Math.floor(new Date(dlDay + 'T23:59:59Z').getTime() / 1000);
await sc.fill('#k-dl', dlDay); await sc.click('#k-go'); await waitText(sc, '#k-out', /is ready|cannot|pick another/); await sc.waitForTimeout(1200); const link = (await txt(sc, '#k-out')).match(/http\S+#c=\S+/)[0];
await donor.goto(link); await donor.reload(); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(100)); await donor.click('#d-go');
await waitText(donor, '#d-out', /LOCKED|Failed/); await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000);
const inLedger = () => sc.evaluate(() => Object.values(JSON.parse(localStorage.getItem('vetlock.sc.ledger') || '{}')).reduce((n, L) => n + Object.keys((L && L.entries) || {}).length, 0));
for (let i = 0; i < 90 && await inLedger() < 1; i++) { await sc.evaluate(() => window.__vetlock.scCheck()).catch(() => {}); await sc.waitForTimeout(1000); }
check('the donation reaches Rescue\'s pot by relay', await inLedger() === 1);

// a request, confirmed by the partner and released
await tab(sc, 'scamp'); await sc.click('#sc-new'); await sc.waitForSelector('#snew.on'); await sc.waitForFunction(() => document.querySelectorAll('#sn-dons input').length >= 1, null, { timeout: 30000 });
await sc.fill('#sn-cat', 'MOCHI'); await sc.fill('#sn-proc', 'sterilisation (spay)'); await sc.fill('#sn-cost', '50'); await sc.fill('#sn-note', 'invoice 118'); await sc.click('#sn-go');
await sc.waitForFunction(() => window.__vetlock.sreqs().some(r => r.q.patient === 'MOCHI'), null, { timeout: 30000 }); const id1 = (await sreqs()).find(r => r.q.patient === 'MOCHI').id;
const showW = async (p, id) => { await p.evaluate(id => { const b = document.getElementById(id); if (b && !b.classList.contains('on')) b.click(); }, id); await p.waitForFunction(() => !document.querySelector('#w-list [style*="max-height"]'), null, { timeout: 15000 }).catch(() => {}); };
await tab(clinic, 'work'); await clinic.click('#w-check'); await waitText(clinic, '#w-n', /^1$/, 60000); await showW(clinic, 'w-pend');
await clinic.locator('#w-list .item', { hasText: /^MOCHI / }).click(); await clinic.waitForSelector('#creq.on'); await clinic.check('#cr-ok'); await clinic.click('#cr-go'); await waitText(clinic, '#cr-out', /CONFIRMED/);
for (let i = 0; i < 60 && (await sreqs()).find(r => r.id === id1).state !== 'certified'; i++) { await sc.evaluate(() => window.__vetlock.scCheck()).catch(() => {}); await sc.waitForTimeout(1000); }
await tab(sc, 'sreq'); await sc.click('#sq-go'); const rel = await waitText(sc, '#sq-out', /RELEASED|Not possible|refused|Interrupted/, 40000);
const old0 = (await sreqs()).find(r => r.id === id1);
check('a request (MOCHI, 50 sat), confirmed by the partner and released', /^RELEASED/.test(rel) && old0.state === 'released', rel.split('\n')[0].slice(0, 80));

// Repeat request
check('the request offers "Repeat request", small, under its steps', (await txt(sc, '#sq-rep')) === 'Repeat request' && await sc.isVisible('#sq-rep'));
await sc.click('#sq-rep'); await sc.waitForSelector('#snew.on'); await sc.waitForFunction(() => document.querySelectorAll('#sn-dons input').length >= 1, null, { timeout: 30000 }).catch(() => {});
const from = await txt(sc, '#sn-from');
check('Repeat request opens New request, saying where it comes from', new RegExp(`^A new request, from ${id1} \\(${D}\\)\\. Check every line before sending\\.$`).test(from), from);
check('…with its pot and what it is', /PLAYA REPITE/.test(await txt(sc, '#sn-pot')) && (await value('#sn-proc')) === 'sterilisation (spay)', await txt(sc, '#sn-pot'));
check('…and not its cat, photos, cost, date, note or donations', (await value('#sn-cat')) === '' && !(await sc.$('#sn-shots .shot img')) && (await value('#sn-cost')) === '' && (await value('#sn-date')) === '' && (await value('#sn-note')) === '' && (await sc.evaluate(() => [...document.querySelectorAll('#sn-dons input')].every(i => !Number(i.value)))));
check('…the cost of last time, to check: "Last time: 50 sat on … · check the cost"', new RegExp(`^Last time: 50 sat on ${D} · check the cost$`).test(await txt(sc, '#sn-last')), await txt(sc, '#sn-last'));
await fits(sc, 'New request, repeated'); await shot(sc, 'p1-repeat');
await sc.fill('#sn-cat', 'TEO'); await sc.fill('#sn-cost', '30'); await sc.waitForTimeout(300); await sc.click('#sn-go');
check('…its date is chosen again: without one, it is not sent', /date/.test(await waitText(sc, '#sn-out', /date/, 5000)) && (await sreqs()).length === 1, await txt(sc, '#sn-out'));
await sc.fill('#sn-date', madrid(3)); await sc.dispatchEvent('#sn-date', 'change'); await sc.click('#sn-go');
await sc.waitForFunction(() => window.__vetlock.sreqs().some(r => r.q.patient === 'TEO'), null, { timeout: 30000 }).catch(() => {});
const all = await sreqs(), r2 = all.find(r => r.q.patient === 'TEO'), old1 = all.find(r => r.id === id1);
const secrets = r => new Set(r.q.contributions.flatMap(k => (k.proofs || []).map(p => p.secret)));
check('sent: a new id, kept with the one it repeats', !!r2 && r2.id !== id1 && r2.from === id1, r2 && `${r2.id} from ${r2.from}`);
check('…the request says "Repeated from R-…"', (await waitText(sc, '#sq-from', /Repeated/)) === `Repeated from ${id1}`);
check('…the old one is still released, and unchanged', old1.state === 'released' && JSON.stringify(old1.q) === JSON.stringify(old0.q));
check('…and the new one takes none of its proofs', !!r2 && secrets(r2).size > 0 && [...secrets(r2)].every(s => !secrets(old1).has(s)));
await fits(sc, 'the repeated request'); await shot(sc, 'p2-repeated-from');

// Repeat a recent one, and drafts
await tab(sc, 'scamp'); await sc.click('#sc-new'); await sc.waitForSelector('#snew.on'); await sc.waitForTimeout(400);
const recent = await sc.$$eval('#sn-recent button', bs => bs.map(b => b.textContent.trim()));
check('a new request offers "Repeat a recent one": the last ones of its kind that differ in colony, partner or what', (await txt(sc, '#sn-recent label')) === 'Repeat a recent one' && recent.length === 1 && recent[0] === 'PLAYA REPITE · sterilisation (spay)', JSON.stringify(recent));
await fits(sc, 'New request, recent ones'); await shot(sc, 'p3-recent');
await sc.locator('#sn-recent button').first().click(); await sc.waitForTimeout(400); check('…a tap repeats it', new RegExp(`^A new request, from ${r2.id} `).test(await txt(sc, '#sn-from')), await txt(sc, '#sn-from'));
const n0 = (await sreqs()).length; await sc.fill('#sn-cost', '40'); await sc.click('#sn-draft'); await sc.waitForSelector('#skind.on');
const rows = await sc.$$eval('#kd-reqs button.req', is => is.map(i => i.textContent));
check('"Keep as draft" keeps it on its kind\'s screen: "Draft · <what>", and when it was kept and its cost', rows.some(t => /^Draft · sterilisation \(spay\)kept \d{1,2}:\d{2}( [AP]M)? · 40 sat$/.test(t)), rows[0]);
check('…a draft is no request: it reserves nothing, and keeps no proofs', (await sreqs()).length === n0 && await sc.evaluate(() => JSON.parse(localStorage.getItem('vetlock.sc.drafts') || '[]').every(d => !('proofs' in d) && !('q' in d) && !('shots' in d))));
await fits(sc, 'the kind with a draft'); await shot(sc, 'p4-draft');
await sc.locator('#kd-reqs button.req', { hasText: /^Draft · / }).first().click(); await sc.waitForSelector('#snew.on');
check('…opened, its fields are back', (await value('#sn-cost')) === '40' && (await value('#sn-proc')) === 'sterilisation (spay)' && await sc.isVisible('#sn-del'));
await sc.click('#sn-del'); await sc.waitForSelector('#skind.on'); check('…and "Delete draft" removes it', !(await sc.$$eval('#kd-reqs button.req', is => is.some(i => /^Draft/.test(i.textContent)))) && (await sc.evaluate(() => JSON.parse(localStorage.getItem('vetlock.sc.drafts') || '[]').length)) === 0);

// the pot closed since: said, and a campaign offered
await sc.clock.setFixedTime(new Date((DL + 3600) * 1000)); await sc.evaluate(id => { window.__vetlock.openSreq ? window.__vetlock.openSreq(id) : null; }, id1);
await tab(sc, 'home'); await tab(sc, 'sreq'); await sc.click('#sq-rep'); await sc.waitForSelector('#snew.on'); await sc.waitForTimeout(400);
const fr = await sc.$$eval('#sn-from > div', ds => ds.map(d => ({ t: d.textContent, cls: d.className })));
check('with its pot closed: "✗ … closed on …. Choose another pot.", in red, and "Make a campaign"', fr.some(l => new RegExp(`^✗ PLAYA REPITE closed on ${D}\\. Choose another pot\\.$`).test(l.t) && /bad/.test(l.cls)) && fr.some(l => /^No open pot for sterilisation · Make a campaign$/.test(l.t)), JSON.stringify(fr));

check('every screen fits the phone at 320, 375, 390 and 430 px', !FITBAD.length, FITBAD.join('; ') || `${FIT.length} screens`);
await b.close(); for (const r of relays) r.close && r.close();
say(bad ? `repeat: ${bad} check(s) failed` : 'repeat: every check passed'); process.exit(bad ? 1 : 0);
