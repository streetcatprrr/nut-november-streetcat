// Donations that went missing (StreetCat, 8 Nov, 04:51: «Creo una campaña, la pago, sale de mi wallet, pero no llega a la campaña en el
// rescue»; 05:01: «Chequéalo tú»). The relays had them; Rescue's app lost them, without a word. Three ways it did, each tried here in the
// three apps (donor, Rescue, partner), against the local mint and two local relays:
//  A. Rescue's storage full of copies of what it had sent (its outbox kept every event, photos too): the donation was read, not saved,
//     and never read again. Now the outbox keeps only how a sent message went, and the donation is in the campaign.
//  B. Rescue's storage full of something it cannot free: the donation cannot be saved. Now that is said in red, and it is asked for
//     again at each check; once there is room, it is in the campaign.
//  C. A donation read before and lost (marked read, not in the ledger): read again once, and in the campaign; and only once.
//  D. A donation locked, and so sent to Streetcat, while the donor's app was sending something else: the outbox was overwritten with
//     the list read before, and the donation never left. Now it goes.
//  E. The partner's app with no room left when Rescue's request comes: said in red, asked for again, taken once there is room.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('the mint did not pay the quote'); };
const relays = [startRelay({ port: 7391 }), startRelay({ port: 7392 })], slow = startRelay({ port: 7393, delay: 4000 }); await Promise.all([...relays, slow].map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(r => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => { say('DIALOG', d.message()); d.accept(); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const front = p => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
// what Rescue's ledger holds: the amount of each donation, by its reference
const ledger = p => p.evaluate(() => { const all = JSON.parse(localStorage.getItem('vetlock.sc.ledger') || '{}'); return Object.values(all).flatMap(L => Object.entries((L && L.entries) || {}).map(([ref, e]) => ({ ref, amount: Number(e.amount) }))); });
const waitLedger = async (p, n, ms = 30000) => { const t0 = Date.now(); let l = []; while (Date.now() - t0 < ms) { await front(p); await p.waitForTimeout(1200); l = await ledger(p); if (l.length >= n) return l; } return l; };
// a check of Rescue's inbox, as each minute's or a return to the app makes one, and the line it shows (with its red parts)
const scNet = async p => { await p.evaluate(() => window.__vetlock.tick()); await p.waitForTimeout(400); return p.$eval('#sc-net', e => ({ text: e.textContent, red: [...e.querySelectorAll('.bad')].map(x => x.textContent) })); };
// room left in this app's storage, in characters, found by trying
const room = p => p.evaluate(() => { let lo = 0, hi = 6e6; while (hi - lo > 500) { const mid = Math.floor((lo + hi) / 2); try { localStorage.setItem('zz.probe', 'a'.repeat(mid)); lo = mid; } catch (_) { hi = mid; } } localStorage.removeItem('zz.probe'); return lo; });

// the three apps, their keys, and a campaign with its partner
const partner = await page(), rescue = await page(), donor = await page();
await tab(partner, 'csettings'); await partner.click('#cs-new'); const clinicPk = await partner.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
await tab(rescue, 'release'); await rescue.click('#s-new'); await rescue.waitForTimeout(800); await rescue.reload(); await rescue.waitForTimeout(500);
await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-camp'); await rescue.waitForSelector('#campaign.on');
await rescue.click('#k-par'); await rescue.waitForSelector('#spick.on'); await rescue.click('#pp-add'); await rescue.fill('#pp-name', 'Clínica Sol'); await rescue.fill('#pp-key', clinicPk); await rescue.click('#pp-save'); await rescue.waitForSelector('#campaign.on');
await rescue.fill('#k-name', 'ROOM TEST'); await rescue.fill('#k-mint', MINT); await rescue.click('#k-go'); const made = await waitText(rescue, '#k-out', /is ready|cannot/, 30000); const L1 = (made.match(/http\S+#c=\S+/) || [])[0];
if (!L1) { say('no campaign link:', made.slice(0, 300)); process.exit(1); }
await tab(rescue, 'home');
// the donor gives; the app sends it to Streetcat by itself as it locks; returns the outbox item the app made for it
const donate = async (n, beforeLock) => { await donor.goto(L1); await donor.reload(); await tab(donor, 'decash'); await donor.fill('#d-token', await plain(n));
  const before = new Set((await donor.evaluate(() => window.__vetlock.outbox())).map(x => x.id)); if (beforeLock) await beforeLock();
  await donor.click('#d-go'); const locked = await waitText(donor, '#d-out', /LOCKED|Failed|✗/, 30000);
  if (!/LOCKED/.test(locked)) throw new Error('not locked: ' + locked.slice(0, 200)); await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000);
  const it = (await donor.evaluate(() => window.__vetlock.outbox())).find(x => !before.has(x.id) && x.t === 'streetcat.donation');
  return it && { ...it, amount: +((locked.match(/LOCKED (\d+) sat/) || [])[1] || 0) }; };  /* what was locked: a mint with fees keeps a sat of it */

// A. Rescue's storage full of what its outbox kept: copies of messages sent long ago (as on StreetCat's phone)
const free0 = await room(rescue);
await rescue.evaluate(free => { const item = n => ({ id: 'photo' + n, ev: { id: 'photo' + n, kind: 1059, content: 'x'.repeat(n) }, relays: ['wss://a', 'wss://b'], label: 'request photo', ref: 'r', t: 'streetcat.request-photo', acked: ['wss://a', 'wss://b'], tries: 1, next: 0, created: Date.now() - 86400e3, state: 'sent' });
  const was = localStorage.getItem('vetlock.outbox') || '[]', base = JSON.parse(was), len0 = JSON.stringify([...base, item(0)]).length, n = free + was.length - len0 - 3000;
  localStorage.setItem('vetlock.outbox', JSON.stringify([...base, item(n)])); }, free0);
const freeA = await room(rescue); check('A · Rescue\'s storage is full of copies its outbox kept (room left for a few thousand characters, not a donation)', freeA < 4000, `${free0} characters of room before, ${freeA} now`);
const dA = await donate(30); const lA = await waitLedger(rescue, 1);
const outA = await rescue.evaluate(() => (localStorage.getItem('vetlock.outbox') || '').length);
check('…the donation is in the campaign: the outbox let go of its copies at the first check', lA.length === 1 && lA[0].ref === dA.ref && lA[0].amount === dA.amount && outA < 5000, `${lA.length} in the ledger · outbox now ${outA} characters`);

// B. Rescue's storage full of something it cannot let go of: said in red at each check, asked for again, and in once there is room
const freeB0 = await room(rescue); await rescue.evaluate(n => localStorage.setItem('zz.filler', 'f'.repeat(n)), freeB0 - 3000);
const dB = await donate(40); await tab(rescue, 'home'); let lineB = { text: '', red: [] }; for (let i = 0; i < 10 && !lineB.red.length; i++) lineB = await scNet(rescue);
check('B · no room to save it: the check says so, in red', lineB.red.some(x => x === `✗ a donation of ${dB.amount} sat to ROOM TEST could not be taken yet: this phone has no room left to save it: the app's storage is full. It is asked for again at the next check.`) && (await ledger(rescue)).length === 1, JSON.stringify(lineB.red));
const lineB2 = await scNet(rescue); check('…and again at the next check, not once and gone', lineB2.red.some(x => x.startsWith(`✗ a donation of ${dB.amount} sat`)), JSON.stringify(lineB2.red));
await rescue.evaluate(() => localStorage.removeItem('zz.filler')); const lB = await waitLedger(rescue, 2); const lineB3 = await scNet(rescue);
check('…room again: it is in the campaign, and the red line is gone', lB.length === 2 && lB.some(x => x.ref === dB.ref && x.amount === dB.amount) && !lineB3.red.length, `${lB.length} in the ledger · ${JSON.stringify(lineB3.red)}`);

// C. a donation the app read before and lost (marked read, not in the ledger, as the version before left it): read again, once
const dC = await donate(50); await rescue.evaluate(({ id, ref }) => { const s = JSON.parse(localStorage.getItem('vetlock.sc.seen') || '[]'); s.push(id, 'p:streetcat.donation:' + ref + ':'); localStorage.setItem('vetlock.sc.seen', JSON.stringify(s)); }, dC);
const before = await rescue.evaluate(() => window.__vetlock.scCheck()); const lC0 = await ledger(rescue);
check('C · a donation marked read and not in the ledger stays out while the app has already read everything again once', lC0.length === 2 && !/donation/.test(before.text.split('\n')[0]), before.text.split('\n')[0]);
await rescue.evaluate(() => localStorage.removeItem('vetlock.sc.reread1'));  /* an app that has not read everything again yet: the version that lost it */
const again = await rescue.evaluate(() => window.__vetlock.scCheck()); const lC = await ledger(rescue);
check('…the first check of this version reads the lost one again: it is in the campaign', lC.length === 3 && lC.some(x => x.ref === dC.ref && x.amount === dC.amount) && /^1 donation · /.test(again.text) && (await rescue.evaluate(() => localStorage.getItem('vetlock.sc.reread1'))) === '1', again.text.split('\n')[0]);
const third = await rescue.evaluate(() => window.__vetlock.scCheck()); check('…and only once: the next check reads nothing again, the campaign has it once', (await ledger(rescue)).length === 3 && !/donation/.test(third.text.split('\n')[0]), third.text.split('\n')[0]);

// D. a donation locked, and so sent to Streetcat by itself, while the donor's app is still sending something else (a relay slow to answer)
let sending = null; const slowSend = async () => { await donor.evaluate(async url => { const R = window.scRelay, C = window.scCore, hex = u => Array.from(u, x => x.toString(16).padStart(2, '0')).join(''); let sk; do { sk = hex(crypto.getRandomValues(new Uint8Array(32))); } while (!/^[0-7]/.test(sk));
    const ev = await R.wrap({ t: 'streetcat.note', v: 1, id: 'slow' }, sk, C.pubOf(sk)), a = JSON.parse(localStorage.getItem('vetlock.outbox') || '[]');
    a.push({ id: ev.id, ev, relays: [url], label: 'slow', ref: 'slow', t: 'streetcat.note', acked: [], tries: 0, next: 0, created: Date.now(), state: 'sending' }); localStorage.setItem('vetlock.outbox', JSON.stringify(a)); }, slow.url);
  sending = donor.evaluate(() => window.__vetlock.flush().then(() => true)); await donor.waitForTimeout(400); };  /* the slow relay holds it about 4 s: the donation locks, and goes, while it waits */
const dD = await donate(60, slowSend); await sending; const lD = await waitLedger(rescue, 4, 40000);
check('D · a donation sent while the app was sending something else goes out, and is in the campaign', !!dD && lD.some(x => x.ref === dD.ref && x.amount === dD.amount), `${lD.length} in the ledger · ${dD ? dD.state : 'no outbox item'}`);
const box = await donor.evaluate(() => window.__vetlock.outbox()); check('…and the donor\'s outbox kept no copy of what went', box.filter(x => x.state === 'sent').every(x => !x.ev), box.map(x => `${x.label}: ${x.state}${x.ev ? ' (copy)' : ''}`).join(' · '));

// E. the partner's app with no room left when Rescue's request comes: said in red, asked for again, taken once there is room
const freeE = await room(partner); await partner.evaluate(n => localStorage.setItem('zz.filler', 'f'.repeat(n)), freeE - 2000);
await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-req'); await rescue.waitForSelector('#snew.on');
await rescue.fill('#sn-cat', 'Mochi'); await rescue.fill('#sn-proc', 'Spay'); await rescue.fill('#sn-cost', '21'); await waitText(rescue, '#sn-cover', /✓|✗/, 30000); await rescue.click('#sn-go'); await rescue.waitForSelector('#sreq.on', { timeout: 30000 });
const qid = (await txt(rescue, '#sq-head .mut')).replace(/^request /, ''); await waitText(rescue, '#sq-steps', /sent · 2 of 2/, 30000);
await tab(partner, 'work'); let lineE = { red: [] }; for (let i = 0; i < 10 && !lineE.red.length; i++) { await partner.evaluate(() => window.__vetlock.tick()); await partner.waitForTimeout(500); lineE = await partner.$eval('#w-net', e => ({ text: e.textContent, red: [...e.querySelectorAll('.bad')].map(x => x.textContent) })); }
check('E · the partner\'s app with no room left: the request is said in red, not lost', lineE.red.some(x => /^✗ a request from Streetcat could not be taken yet: this phone has no room left to save it: the app's storage is full\. It is asked for again at the next check\.$/.test(x)) && !(await partner.evaluate(id => window.__vetlock.creqs().some(r => r.id === id), qid)), JSON.stringify(lineE.red));
await partner.evaluate(() => localStorage.removeItem('zz.filler')); await front(partner);
const cameE = await partner.waitForFunction(id => window.__vetlock.creqs().some(r => r.id === id), qid, { timeout: 20000 }).then(() => true).catch(() => false);
check('…room again: the request is there', cameE);

say(bad ? `room: ${bad} check(s) failed` : 'room: every check passed');
await b.close(); [...relays, slow].forEach(r => r.close && r.close()); process.exit(bad ? 1 : 0);
