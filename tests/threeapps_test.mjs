// Three apps, one for each. The donors' app, Rescue's and the partner's, each with its
// own storage, by relay only. Rescue's new campaign offers its link, not "open donation page"; the donation reaches Rescue; Rescue's
// request reaches the partner's app as soon as it comes to the front (no button touched), listed by its code (no photo in the list:
// they are in the request when it is opened);
// the confirmation reaches Rescue's app as soon as it comes to the front, and Home lists it under "To release"; a tap opens it, and it
// is released. The partner's list keeps apart a request whose pot's refund date has passed. Against the local mint and two relays.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser, pin } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('the mint did not pay the quote'); };
const relays = [startRelay({ port: 7371 }), startRelay({ port: 7372 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(r => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => { say('DIALOG', d.message()); d.accept(); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const lines = (p, s) => p.$$eval(s + ' button.req', bs => bs.map(b => ({ title: b.querySelector('.title').textContent, subs: [...b.children].slice(1).map(x => x.textContent) })));
const front = p => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));  // one turns to this app: it is in front again
const jpeg = async p => Buffer.from((await p.evaluate(() => { const cv = document.createElement('canvas'); cv.width = 480; cv.height = 360; const g = cv.getContext('2d'); g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, 480, 360); g.fillStyle = '#f2f2f2'; g.beginPath(); g.arc(240, 190, 110, 0, 7); g.fill(); g.fillStyle = '#222'; g.fillRect(190, 160, 20, 20); g.fillRect(270, 160, 20, 20); return cv.toDataURL('image/jpeg', .8); })).split(',')[1], 'base64');

// THE PARTNER'S APP: its clinic key. RESCUE'S APP: Streetcat's key, and a sterilisation pot whose partner is that clinic
const partner = await page(), rescue = await page(), donor = await page();
await tab(partner, 'csettings'); await partner.click('#cs-new'); const clinicPk = await partner.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
await tab(rescue, 'release'); await rescue.click('#s-new'); await rescue.waitForTimeout(800); await rescue.reload(); await rescue.waitForTimeout(500);
await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-camp'); await rescue.waitForSelector('#campaign.on');
await rescue.click('#k-col'); await rescue.waitForSelector('#spick.on'); await rescue.click('#pp-add'); await rescue.fill('#pp-name', 'colony Marina'); await rescue.click('#pp-save'); await rescue.waitForSelector('#campaign.on');
await rescue.click('#k-par'); await rescue.waitForSelector('#spick.on'); await rescue.click('#pp-add'); await rescue.fill('#pp-name', 'Clínica Sol'); await rescue.fill('#pp-key', clinicPk); await rescue.click('#pp-save'); await rescue.waitForSelector('#campaign.on');
await rescue.fill('#k-name', 'TNR SOL'); await rescue.fill('#k-mint', MINT); await rescue.click('#k-go'); const made = await waitText(rescue, '#k-out', /is ready|cannot/, 30000); const L1 = (made.match(/http\S+#c=\S+/) || [])[0];
await rescue.waitForSelector('#k-out .acts:not([hidden])', { timeout: 30000 }); const acts = await rescue.$$eval('#k-out .acts > *', xs => xs.map(x => x.textContent.trim()));
check('Rescue\'s new campaign: its link and its ledger to copy; no "open donation page" (that is the donors\' app)', /is ready/.test(made) && !!L1 && acts.join() === 'copy donation link,copy ledger', acts.join(' | '));
// THE DONORS' APP: a donation, sent to Streetcat by relay; Rescue's app, in front again, has it
await donor.goto(L1); await donor.reload(); await tab(donor, 'decash'); await donor.fill('#d-token', await plain(30)); await donor.click('#d-go');  /* more than the request: a mint with fees takes its sat */ const locked = await waitText(donor, '#d-out', /LOCKED|Failed|✗/, 30000);
await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000);
await tab(rescue, 'home'); await front(rescue); for (let i = 0; i < 40; i++) { await rescue.waitForTimeout(500); if (await rescue.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('vetlock.sc.ledger') || '{}')).length)) break; }
await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); const pots = await lines(rescue, '#kd-pots');
const given = ((pots[0] && pots[0].subs[1]) || '').match(/^(\d+) sat given · (\d+) sat to spend$/);
check('the donation reaches Rescue\'s app by relay (30 sat, less a mint\'s fee if it takes one)', /LOCKED/.test(locked) && pots.length === 1 && !!given && +given[1] >= 27 && +given[1] <= 30 && given[1] === given[2], JSON.stringify(pots.map(p => p.subs[1])));
// RESCUE makes a sterilisation request, with the cat's face
await rescue.click('#kd-req'); await rescue.waitForSelector('#snew.on'); await rescue.fill('#sn-cat', 'Crypto');
const [fc] = await Promise.all([rescue.waitForEvent('filechooser'), rescue.click('#sn-shots .shot[data-slot="face"]')]); await fc.setFiles({ name: 'IMG_face.JPG', mimeType: 'image/jpeg', buffer: await jpeg(rescue) }); await rescue.waitForSelector('#sn-shots .shot[data-slot="face"].has', { timeout: 30000 });
await rescue.fill('#sn-proc', 'Spay'); await rescue.fill('#sn-cost', '21'); await waitText(rescue, '#sn-cover', /✓|✗/, 30000); await rescue.click('#sn-go'); await rescue.waitForSelector('#sreq.on', { timeout: 30000 });
const qid = (await txt(rescue, '#sq-head .mut')).replace(/^request /, ''); await waitText(rescue, '#sq-steps', /sent · 2\/2 relays/, 30000);
// THE PARTNER'S APP, in front again: the request is there at once, no button touched; listed with its face and its code
await tab(partner, 'work'); await partner.waitForTimeout(2000); await front(partner);
const came = await partner.waitForFunction(id => window.__vetlock.creqs().some(r => r.id === id), qid, { timeout: 15000 }).then(() => true).catch(() => false);
check('the partner\'s app, back in front, has the request at once (no "Check for requests")', came);
await partner.waitForTimeout(600); await showW(partner, 'w-pend'); const item = await partner.$$eval('#w-list .item', its => its.map(it => ({ nm: (it.querySelector('.nm') || {}).textContent, sub: (it.querySelector('.sub2') || {}).textContent, img: !!it.querySelector('img') })));
check('…listed by its code first, the one Rescue shows; no photo in the list', item.length === 1 && item[0].nm === 'Crypto · Spay' && item[0].sub === `${qid} · 21 sat · TNR SOL` && !item[0].img, JSON.stringify(item));
await partner.click('#w-list .item'); await partner.waitForSelector('#creq.on'); await partner.check('#cr-ok'); await partner.click('#cr-go'); const conf = await waitText(partner, '#cr-out', /✓ (delivery )?confirmed|✗/, 30000);
check('…confirmed there', /✓ (delivery )?confirmed/.test(conf), conf.split('\n')[0]);
// RESCUE'S APP, in front again: Home lists what is to release, first; a tap opens it, and it is released
await rescue.waitForTimeout(1500); await tab(rescue, 'home'); await front(rescue);
const ready = await rescue.waitForSelector('#h-kinds button.req.torel', { timeout: 20000 }).then(() => true).catch(() => false);
const head = await rescue.$$eval('#h-kinds > .mut', ms => ms.map(m => m.textContent)), torel = await lines(rescue, '#h-kinds');
check('Rescue\'s app, back in front, lists it on Home, first: "To release · 1", the cat, how much from which pot, its code, who confirmed it', ready && head[0] === 'To release · 1' && torel.length === 1 && torel[0].title === 'Crypto · Spay' && torel[0].subs[0] === `21 sat from TNR SOL · ${qid}` && /^✓ confirmed by the clinic · /.test(torel[0].subs[1]), head.join(' | ') + ' · ' + JSON.stringify(torel));
await rescue.click('#h-kinds button.req.torel'); await rescue.waitForSelector('#sreq.on'); const go = await txt(rescue, '#sq-go');
check('…a tap opens it, ready: "Release 21 sat"', go === 'Release 21 sat' && !(await rescue.isDisabled('#sq-go')), go);
await rescue.click('#sq-go'); const rel = await waitText(rescue, '#sq-steps', /✓ released/, 60000); await tab(rescue, 'home'); await rescue.waitForTimeout(400);
check('…released; and Home has nothing left to release', /✓ released/.test(rel) && !(await rescue.$('#h-kinds button.req.torel')) && !(await rescue.$$eval('#h-kinds > .mut', ms => ms.some(m => /^To release/.test(m.textContent)))), rel.replace(/\s+/g, ' ').slice(-50));
// the partner's list keeps apart a request whose pot's refund date has passed (an older one, from another Rescue)
const other = await page(); const oldSc = await other.evaluate(async ({ clinicPk, MINT }) => { const C = window.scCore, R = window.scRelay, hex = u => Array.from(u, x => x.toString(16).padStart(2, '0')).join(''); let sk, dk; do { sk = hex(crypto.getRandomValues(new Uint8Array(32))); dk = hex(crypto.getRandomValues(new Uint8Array(32))); } while (!/^[0-7]/.test(sk) || !/^[0-7]/.test(dk));  /* Streetcat's key, and a donor's for the refund (A06: never Streetcat's or the partner's) */
  const camp = { name: 'TNR VIEJO', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sk), clinic: clinicPk, deadline: Math.floor(Date.now() / 1000) - 3600 };
  const proofs = [{ id: '00ad268c4d1f5826', amount: 16, secret: JSON.stringify(['P2PK', { nonce: hex(crypto.getRandomValues(new Uint8Array(32))), data: camp.streetcat, tags: [['pubkeys', camp.clinic], ['n_sigs', '2'], ['locktime', String(camp.deadline)], ['refund', C.pubOf(dk)]] }]), C: C.pubOf(sk), dleq: { e: hex(crypto.getRandomValues(new Uint8Array(32))), s: hex(crypto.getRandomValues(new Uint8Array(32))), r: hex(crypto.getRandomValues(new Uint8Array(32))) } }];  /* shaped as a mint's signature and its DLEQ proof (A04): only where the request goes in the list is checked here */
  const q = await C.makeRequest({ campaign: camp, patient: 'Viejo', procedure: 'sterilisation', date: '2026-11-06', contributions: [{ release: 16, proofs }] });
  const m = new Map(), box = R.outbox({ get: k => m.get(k) ?? null, set: (k, v) => m.set(k, v) }); await box.add(q, sk, clinicPk, { relays: localStorage.getItem('vetlock.relays').split(',') }); await box.flush(); return camp.streetcat; }, { clinicPk, MINT });
await pin(oldSc);  /* that key was made by hand, not by the app: pinned here, as a Streetcat key of this test (review of 9 Nov, S1: the partner takes requests only from Streetcat's published key) */
await tab(partner, 'work'); await front(partner); await partner.waitForFunction(() => window.__vetlock.creqs().length === 2, null, { timeout: 15000 }).catch(() => {}); await partner.waitForTimeout(600);
const grps = () => partner.$$eval('#w-list > *', xs => xs.map(x => x.classList.contains('grp') ? '# ' + x.textContent : (x.querySelector('.nm') || {}).textContent));
await showW(partner, 'w-pend'); const gPend = await grps(); await showW(partner, 'w-dn'); const groups = [...gPend, ...await grps()];  /* pending, then done: each behind its number */
check('the partner\'s list keeps apart a request whose refund date has passed', groups.join(' / ') === '# To review · refund date passed / Viejo · sterilisation / # Done / Crypto · Spay', groups.join(' / '));
say(bad ? `threeapps: ${bad} check(s) failed` : 'threeapps: every check passed');
await b.close(); relays.forEach(r => r.close && r.close()); process.exit(bad ? 1 : 0);

// the partner's home shows its requests only once one of its two numbers is tapped (9 Nov): show that one (if not shown) and wait for it typed in
async function showW(p, id){ await p.evaluate(id => { const b = document.getElementById(id); if (b && !b.classList.contains('on')) b.click(); }, id); await p.waitForFunction(() => !document.querySelector('#w-list [style*="max-height"]'), null, { timeout: 15000 }).catch(() => {}); }
