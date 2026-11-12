// Donate as it starts, from whatever it shows. Donate is the donor's first screen, so the header's arrow did not show there. Now, over Donate's start — Streetcat's
// open requests listed, an invoice waiting to be paid, a donation made (LOCKED) — the arrow shows, and it, the phone's back, the role in
// the header and "donate again" all go back to Donate as it starts. An invoice left waiting stays below ("resume") and is finished by
// itself if it is paid; one that expires unpaid goes. The list closes when Donate is left. Local mint, two local relays.
import { chromium } from 'playwright';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const viaMore = async (p, sel) => { const id = await p.$eval(sel, e => (e.closest('.sheet') || {}).id || '').catch(() => ''); if (id && !(await p.isVisible(sel))) { await p.click(`[data-sheet="${id}"]`); await p.waitForSelector(`#${id}.open`); } };  // a control behind "···": tapped open first, as a person does
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const relays = [startRelay({ port: 7381 }), startRelay({ port: 7382 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(r => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => { say('DIALOG', d.message()); d.accept(); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const waitFor = async (p, fn, arg, ms = 15000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true).catch(() => false);
// how Donate looks: its arrow, a donation shown, an invoice watched, the list, the amount, what waits below
const look = p => p.evaluate(() => { const d = document.getElementById('donate'), $ = id => document.getElementById(id);
  return { on: d.classList.contains('on'), arrow: !$('hd-back').hidden, done: d.classList.contains('done'), paying: d.classList.contains('paying'), list: !$('d-reqs').hidden, camp: !$('d-campinfo').hidden, campText: $('d-campinfo').textContent.trim(), out: $('d-out').textContent.trim(), amt: $('d-amt').value, pend: $('d-pend').textContent.trim(), aside: !!(history.state && history.state.aside) }; });
const plain = l => l.on && !l.arrow && !l.done && !l.paying && !l.list && !l.out && !l.amt;

// Rescue makes a campaign (announced on the relays); the partner's key for it
const partner = await page(), rescue = await page();
await tab(partner, 'csettings'); await partner.click('#cs-new'); const clinicPk = await partner.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
await tab(rescue, 'release'); await rescue.click('#s-new'); await rescue.waitForTimeout(800); await rescue.reload(); await rescue.waitForTimeout(500);
await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-camp'); await rescue.waitForSelector('#campaign.on');
await rescue.click('#k-par'); await rescue.waitForSelector('#spick.on'); await rescue.click('#pp-add'); await rescue.fill('#pp-name', 'Clínica Sol'); await rescue.fill('#pp-key', clinicPk); await rescue.click('#pp-save'); await rescue.waitForSelector('#campaign.on');
await rescue.fill('#k-name', 'TNR FOREST'); await rescue.fill('#k-mint', MINT); await rescue.click('#k-go'); const made = await waitText(rescue, '#k-out', /Announced to donors|✗/, 30000);
if (!/Announced to donors/.test(made)) { say('the campaign was not announced:', made.slice(0, 300)); process.exit(1); }

// 1 · Donate as it starts: no arrow
const donor = await page(); await tab(donor, 'donate'); await donor.waitForTimeout(400);
check('Donate as it starts: no arrow (it is the donor\'s first screen)', plain(await look(donor)), JSON.stringify(await look(donor)));

// 2 · the list of Streetcat's open requests: the arrow closes it, the phone's back closes it, leaving Donate closes it
await donor.click('#d-check'); await donor.waitForSelector('#d-reqs button.req', { timeout: 30000 }); const l2 = await look(donor);
check('the list of open requests shows over the campaign, with the arrow', l2.list && !l2.camp && l2.arrow, JSON.stringify(l2));
await donor.click('#hd-back'); await waitFor(donor, () => document.getElementById('d-reqs').hidden); const l2b = await look(donor);
check('…the arrow closes it: Donate as it starts', plain(l2b) && l2b.camp, JSON.stringify(l2b));
await donor.click('#d-check'); await donor.waitForSelector('#d-reqs button.req', { timeout: 30000 }); await donor.evaluate(() => history.back()); await waitFor(donor, () => document.getElementById('d-reqs').hidden); const l2c = await look(donor);
check('…so does the phone\'s back, and the app stays on Donate', plain(l2c), JSON.stringify(l2c));
await donor.click('#d-check'); await donor.waitForSelector('#d-reqs button.req', { timeout: 30000 }); await tab(donor, 'refund'); await tab(donor, 'donate'); await donor.waitForTimeout(300); const l2d = await look(donor);
check('…and leaving Donate closes it: it is not there when Donate is back', !l2d.list && l2d.camp, JSON.stringify(l2d));

// 3 · an invoice waiting (a wallet that does not pay): skipped with the arrow, kept below
await donor.click('#d-check'); await donor.waitForSelector('#d-reqs button.req', { timeout: 30000 }); await donor.locator('#d-reqs button.req', { hasText: 'TNR FOREST' }).click(); await waitText(donor, '#d-campinfo', /TNR FOREST/i, 15000);
await donor.route('**/v1/mint/quote/bolt11/*', async r => { const res = await r.fetch(), j = await res.json(); return r.fulfill({ response: res, json: { ...j, state: 'UNPAID', paid: false } }); });  /* the wallet has not paid */
await donor.fill('#d-amt', '21'); await donor.dispatchEvent('#d-amt', 'input'); await donor.click('#d-ln'); await donor.waitForSelector('#donate.paying', { timeout: 15000 }); await waitText(donor, '#d-out', /waiting for the payment/, 15000); const l3 = await look(donor);
check('an invoice waiting to be paid: the arrow shows', l3.paying && l3.arrow && /waiting for the payment/.test(l3.out), JSON.stringify({ ...l3, out: l3.out.slice(0, 60) }));
await donor.click('#hd-back'); await waitFor(donor, () => !document.getElementById('donate').classList.contains('paying')); const l3b = await look(donor);
check('…the arrow skips it: Donate as it starts, the invoice kept below to resume', plain(l3b) && /Unfinished Lightning donation: TNR FOREST · 21 sat/.test(l3b.pend) && /resume/.test(l3b.pend), JSON.stringify(l3b));
await donor.evaluate(() => window.__vetlock.tick()); await donor.waitForTimeout(800); const l3c = await look(donor);
check('…while the wallet has not paid, the check of each minute leaves it there and Donate as it is', plain(l3c) && /Unfinished Lightning donation/.test(l3c.pend), JSON.stringify(l3c));

// 4 · the wallet pays after all: the next check locks the donation and shows it
await donor.unroute('**/v1/mint/quote/bolt11/*'); await donor.evaluate(() => window.__vetlock.tick()); const locked4 = await waitText(donor, '#d-out', /LOCKED 21 sat for TNR FOREST/, 30000); const l4 = await look(donor);
check('the wallet pays after all: the next check locks the donation by itself and shows it', /LOCKED 21 sat for TNR FOREST/.test(locked4) && l4.done && l4.arrow && !/Unfinished/.test(l4.pend), JSON.stringify({ ...l4, out: l4.out.slice(0, 60) }));

// 5 · a donation made: the arrow, the phone's back and "donate again" each go back to Donate as it starts
await donor.click('#hd-back'); await waitFor(donor, () => !document.getElementById('donate').classList.contains('done')); const l5 = await look(donor);
check('a donation shown: the arrow goes back to Donate as it starts, for a new donation', plain(l5) && l5.camp, JSON.stringify(l5));
const give = async () => { await donor.fill('#d-amt', '8'); await donor.dispatchEvent('#d-amt', 'input'); await donor.click('#d-ln'); return waitText(donor, '#d-out', /LOCKED 8 sat/, 30000); };
await give(); await donor.evaluate(() => history.back()); await waitFor(donor, () => !document.getElementById('donate').classList.contains('done')); const l5b = await look(donor);
check('…the phone\'s back does the same, and the app stays on Donate', plain(l5b), JSON.stringify(l5b));
await give(); await viaMore(donor, '#d-again'); await donor.click('#d-again'); await waitFor(donor, () => !document.getElementById('donate').classList.contains('done')); const l5c = await look(donor);
check('…and so does "donate again"', plain(l5c), JSON.stringify(l5c));
await give(); await donor.click('#hd-roles button[data-r="donor"]'); await waitFor(donor, () => !document.getElementById('donate').classList.contains('done')); const l5d = await look(donor);
check('…and the role in the header (Donor), as it goes back to a role\'s first screen', plain(l5d), JSON.stringify(l5d));
const keys5 = await donor.evaluate(() => JSON.parse(localStorage.getItem('vetlock.donor.keys') || '[]').length).catch(() => -1);
check('…the donations made are all kept for their refund (Take my sats back)', keys5 >= 4, `${keys5} refund keys in this browser`);

// 6 · an invoice skipped that expires unpaid goes from below at the next check: nothing was charged
await donor.route('**/v1/mint/quote/bolt11/*', async r => { const res = await r.fetch(), j = await res.json(); return r.fulfill({ response: res, json: { ...j, state: 'UNPAID', paid: false } }); });
await donor.fill('#d-amt', '13'); await donor.dispatchEvent('#d-amt', 'input'); await donor.click('#d-ln'); await donor.waitForSelector('#donate.paying', { timeout: 15000 }); await donor.click('#hd-back'); await waitFor(donor, () => !document.getElementById('donate').classList.contains('paying'));
await donor.evaluate(() => { const a = JSON.parse(localStorage.getItem('vetlock.pending') || '[]'); a.forEach(p => { p.expiry = Math.floor(Date.now() / 1000) - 3600; }); localStorage.setItem('vetlock.pending', JSON.stringify(a)); });  /* an hour past its expiry */
await donor.evaluate(() => window.__vetlock.tick()); await donor.waitForTimeout(1200); const l6 = await look(donor), left6 = await donor.evaluate(() => JSON.parse(localStorage.getItem('vetlock.pending') || '[]').length);
check('an invoice skipped and expired unpaid goes at the next check: nothing was charged, nothing waits below', plain(l6) && !l6.pend && left6 === 0, JSON.stringify({ ...l6, pending: left6 }));
await donor.unroute('**/v1/mint/quote/bolt11/*');

// 7 · the app closed and opened again: a campaign picked from the list, with an invoice waiting
const unpaid = p => p.route('**/v1/mint/quote/bolt11/*', async r => { const res = await r.fetch(), j = await res.json(); return r.fulfill({ response: res, json: { ...j, state: 'UNPAID', paid: false } }); });
const prices = p => p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
await unpaid(donor); await donor.click('#d-check'); await donor.waitForSelector('#d-reqs button.req', { timeout: 30000 }); await donor.locator('#d-reqs button.req', { hasText: 'TNR FOREST' }).click(); await waitText(donor, '#d-campinfo', /TNR FOREST/i, 15000);
await donor.fill('#d-amt', '21'); await donor.dispatchEvent('#d-amt', 'input'); await donor.click('#d-ln'); await donor.waitForSelector('#donate.paying', { timeout: 15000 }); await waitText(donor, '#d-out', /waiting for the payment/, 15000);
const url7 = donor.url(); check('a campaign picked from the list goes in the address marked as picked', /#c=[A-Za-z0-9_-]+&pick=1$/.test(url7), url7.slice(-24));
await donor.reload(); await donor.waitForSelector('#donate.paying', { timeout: 15000 }).catch(() => {}); await waitText(donor, '#d-campinfo', /TNR FOREST/i, 15000); const l7a = await look(donor);
check('…a reload in the same session (back from the wallet app) brings back the invoice and its campaign', l7a.paying && /waiting for the payment/.test(l7a.out) && /TNR FOREST/i.test(l7a.campText), JSON.stringify({ ...l7a, out: l7a.out.slice(0, 50) }));
const again = await donor.context().newPage(); again.on('pageerror', e => say('PAGEERROR', e.message)); await prices(again); await unpaid(again);
await again.goto(url7); await again.waitForTimeout(2500); const l7b = await look(again);  /* a new session at the same address, as a phone reopening the app where it was; after the first check */
check('closed and opened again: Donate starts with nothing chosen (no campaign, no invoice, the mark gone from the address)', plain(l7b) && !l7b.campText && !/#c=/.test(again.url()), JSON.stringify({ ...l7b, url: again.url().slice(-24) }));
check('…the unfinished invoice waits below, to resume', /Unfinished Lightning donation: TNR FOREST · 21 sat/.test(l7b.pend) && /resume/.test(l7b.pend), l7b.pend);
await again.click('#d-check'); await again.waitForSelector('#d-reqs button.req', { timeout: 30000 }); const l7c = await look(again), n7 = await again.$$eval('#d-reqs button.req', bs => bs.length);
check('…until Check for requests, which lists the open requests as always', l7c.list && n7 >= 1, `${n7} listed`);
const outside = await donor.context().newPage(); await prices(outside); await unpaid(outside); await outside.goto(url7.replace(/&pick=1$/, '')); const t7 = await waitText(outside, '#d-campinfo', /TNR FOREST/i, 15000);
check('a donation link opened from outside still opens its campaign, in a new session too', /TNR FOREST/i.test(t7), t7.slice(0, 40));
// 8 · the iPhone's home-screen app (navigator.standalone) opens no link from outside, so a campaign in its address when it opens is where it
// was left, or the link its icon was made with: nothing chosen, even with no mark; but back from the wallet app while an invoice of this session is on screen, it stays
const app = await donor.context().newPage(); app.on('pageerror', e => say('PAGEERROR', e.message)); await app.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }));
await prices(app); await unpaid(app); await app.goto(url7.replace(/&pick=1$/, '')); await app.waitForTimeout(2500); const l8a = await look(app);
check('the iPhone app opened at a campaign\'s address with no mark (as its icon may be): Donate starts with nothing chosen, the address cleared', plain(l8a) && !l8a.campText && !/#c=/.test(app.url()), JSON.stringify({ ...l8a, url: app.url().slice(-24) }));
await app.click('#d-check'); await app.waitForSelector('#d-reqs button.req', { timeout: 30000 }); await app.locator('#d-reqs button.req', { hasText: 'TNR FOREST' }).click(); await waitText(app, '#d-campinfo', /TNR FOREST/i, 15000);
await app.fill('#d-amt', '21'); await app.dispatchEvent('#d-amt', 'input'); await app.click('#d-ln'); await app.waitForSelector('#donate.paying', { timeout: 15000 }); await waitText(app, '#d-out', /waiting for the payment/, 15000);
await app.reload(); await app.waitForSelector('#donate.paying', { timeout: 15000 }).catch(() => {}); await waitText(app, '#d-campinfo', /TNR FOREST/i, 15000); const l8b = await look(app);
check('…but back from the wallet app while paying (the same session), the invoice and its campaign stay', l8b.paying && /waiting for the payment/.test(l8b.out) && /TNR FOREST/i.test(l8b.campText), JSON.stringify({ ...l8b, out: l8b.out.slice(0, 50) }));
await again.close(); await outside.close(); await app.close(); await donor.unroute('**/v1/mint/quote/bolt11/*');

say(bad ? `donorback: ${bad} check(s) failed` : 'donorback: every check passed');
await b.close(); relays.forEach(r => r.close && r.close()); process.exit(bad ? 1 : 0);
