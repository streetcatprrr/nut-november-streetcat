// Is it the cat of the request?,
// against the local mint and two local test relays (made-up keys, fake money). The photos are drawn here: no real photo is kept with
// the tests. Streetcat's requests carry the cat's photos as caught; the clinic sends each cat's record, with its own photos, by relay.
// On Streetcat's request the record's photos go under the request's, view by view; while one is still on its way it says so. The first
// time the comparison waits for a tap (the cat recognition is 121 MB, and nothing of it is fetched before); then it compares by itself.
// The same drawn cat: nothing points to another cat. Another: a warning in red, in the request's line too. Another of the same
// "coat" (rings of other colours): no warning, which is the limit the app states ("two cats of one coat can look alike to it"). A record
// with one photo of the face or sides: too few to compare. The result is kept with the request: after a reload it is there without the
// recognition. A record signed with another clinic key is not taken as the request's. The record opens from the request, and ← comes
// back. Every screen fits the phone at 320, 375, 390 and 430 px.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1600); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };  /* SHOT_DIR=dir: the screens at 390 px @2x, from the top */
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7261 }), startRelay({ port: 7262 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');

// a drawn cat: kind 0–4, a pattern and colours of its own; views 0–2 its photos as caught (face, sides), 3–5 its record's, at the clinic.
// Measured with the app's recognition: one kind against itself 0.97–0.99; the triangle (2) against the rings (0, 1, 3, 4) about 0.29;
// rings against rings of other colours 0.94–0.97 (look-alikes).
function draws(){ window.__draw = async (kind, view, q = .92) => { const W = 640, H = 480, cv = new OffscreenCanvas(W, H), g = cv.getContext('2d');
  const pal = [['#e08a2e', '#1b1b1b'], ['#8a8f99', '#f2f2f2'], ['#141414', '#f5f1e8'], ['#c9b48a', '#5a3b1f'], ['#f3efe6', '#d0721f']][kind];
  const dx = [0, -30, 28, 14, -18, 4][view], dy = [0, 10, -8, 18, -14, -20][view], rot = [0, -.12, .1, .2, -.22, .05][view], s = [1, .92, .95, .85, 1.06, .9][view];
  g.fillStyle = pal[0]; g.fillRect(0, 0, W, H); g.translate(W / 2 + dx, H / 2 + dy); g.rotate(rot); g.scale(s, s); g.fillStyle = pal[1]; g.strokeStyle = pal[1];
  if (kind === 2) { g.beginPath(); g.moveTo(-180, 150); g.lineTo(0, -170); g.lineTo(180, 150); g.closePath(); g.fill(); }
  else { g.lineWidth = 26; for (let r = 40; r < 400; r += 70) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); } }
  return new Uint8Array(await (await cv.convertToBlob({ type: 'image/jpeg', quality: q })).arrayBuffer()); }; }

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 }), asked = [];
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS); await c.addInitScript(draws); c.on('request', r => asked.push(r.url()));
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); p._asked = asked; return p; };
const donor = await page(), clinic = await page(), sc = await page();
for (const p of [donor, clinic, sc]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(200); } return x; };
const jpeg = async (p, kind, view) => Buffer.from(await p.evaluate(async ([k, v]) => { const b = await window.__draw(k, v); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s); }, [kind, view]), 'base64');
const shoot = async (p, sel, kind, views) => { for (const [slot, view] of Object.entries(views)) { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(`${sel} .shot[data-slot="${slot}"]`)]);
  await fc.setFiles({ name: `IMG_${slot}.JPG`, mimeType: 'image/jpeg', buffer: await jpeg(p, kind, view) }); await p.waitForSelector(`${sel} .shot[data-slot="${slot}"].has`, { timeout: 30000 }); } };
const engine = u => /\/ai\/[12]\/|catid-worker/.test(u);
const line = p => txt(p, '#sq-match-st'), red = (p, s) => p.$eval(s, e => e.classList.contains('bad')), green = (p, s) => p.$eval(s, e => { const t = document.createElement('span'); t.style.color = 'var(--ok)'; document.body.appendChild(t); const ok = getComputedStyle(e).color === getComputedStyle(t).color; t.remove(); return ok; });
const recTl = p => p.$eval('#sq-rec-tl', e => ({ t: e.textContent, bad: e.classList.contains('bad') })).catch(() => ({ t: '', bad: false }));
const imgs = (p, box) => p.$$eval(box + ' button', bs => bs.map(b => b.querySelector('img') && b.querySelector('img').src ? 'img' : (b.querySelector('.wait') || {}).textContent || '?').join());
const FIT = [], FITBAD = []; const fits = async (p, label) => { const vs = p.viewportSize(), over = []; for (const wd of [320, 375, 390, 430]) { await p.setViewportSize({ width: wd, height: 740 }); await p.waitForTimeout(80); const o = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${wd}px +${o}`); }
  await p.setViewportSize(vs); FIT.push(label); if (over.length) FITBAD.push(`${label}: ${over.join(', ')}`); };
const openReq = async name => { await tab(sc, 'scamp'); await sc.locator('#sc-reqs .item', { hasText: new RegExp('^' + name + ' ') }).click(); await sc.waitForSelector('#sreq.on'); await sc.waitForTimeout(400); };
const until = async (p, re, ms = 300000) => { const seen = new Set(), t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await line(p); seen.add(s); if (re.test(s)) break; await p.waitForTimeout(40); } return { s, seen: [...seen] }; };
const SAME = /^Nothing points to another cat\.$/, OTHER = /^✗ It may be another cat\.$/;  /* short, in green or in red */

// keys, a campaign, four donations sent to Streetcat
await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1200); const clinicPk = await txt(clinic, '#cs-pk');
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1200);
await tab(sc, 'campaign'); await sc.reload(); await tab(sc, 'campaign'); await sc.fill('#k-name', 'MARINA'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk);
await sc.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await sc.click('#k-go'); await waitText(sc, '#k-out', /is ready|cannot|pick another/); await sc.waitForTimeout(1200);
const link = (await txt(sc, '#k-out')).match(/http\S+#c=\S+/)[0];
for (let i = 0; i < 4; i++) { await donor.goto(link); await donor.reload(); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(100)); await donor.click('#d-go');
  await waitText(donor, '#d-out', /LOCKED|Failed/); await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000); }
await tab(sc, 'home'); await sc.click('#h-kinds button.tile'); await sc.click('#kd-pots button.req'); await sc.locator('#kd-pots .row2 button', { hasText: 'donations and requests' }).click(); await sc.click('#sc-check'); await waitText(sc, '#sc-net', /donation|checked/);
/* all four in the campaign before the requests: one check can come before the last donation is on the relays (it goes by itself as it locks, 8 Nov) */
const inLedger = () => sc.evaluate(() => Object.values(JSON.parse(localStorage.getItem('vetlock.sc.ledger') || '{}')).reduce((n, L) => n + Object.keys((L && L.entries) || {}).length, 0));
/* up to 90 s (30 s was too short once in a loaded battery, 9 Nov 03:40: the run crashed later, picking a donation that had not come yet);
   if they never all come, it is said here, as a failed check, not as a timeout further on */
for (let i = 0; i < 90 && await inLedger() < 4; i++) { await sc.evaluate(() => window.__vetlock.scCheck()).catch(() => {}); await sc.waitForTimeout(1000); }
{ const n = await inLedger(); if (n < 4) { check('the four donations reach Rescue\'s campaign by relay, as they lock', false, `${n} of 4 after 90 s`); await b.close(); for (const r of relays) r.close && r.close(); process.exit(1); } }

// four requests, each with its cat's photos as caught; and each cat's record from the clinic, with the cat's photos at the clinic
const CAT = { face: 0, left: 1, right: 2 }, VET = { face: 3, left: 4, right: 5 };
const CATS = [{ name: 'MOCHI', kind: 2, rec: 2, views: VET }, { name: 'TEO', kind: 0, rec: 2, views: VET }, { name: 'LUNA', kind: 0, rec: 1, views: VET }, { name: 'PIP', kind: 2, rec: 2, views: { face: 3 } }];
for (const c of CATS) { await tab(sc, 'scamp'); await sc.click('#sc-new'); await sc.waitForFunction(() => document.querySelectorAll('#sn-dons input').length >= 1, null, { timeout: 30000 });
  await sc.fill('#sn-cat', c.name); await sc.fill('#sn-proc', 'sterilisation (spay)'); await sc.locator('#sn-dons .item', { hasText: /(^|\D)[1-9][\d ]* sat available/ }).first().locator('button', { hasText: 'all' }).click();
  await shoot(sc, '#sn-shots', c.kind, CAT); await sc.click('#sn-go');
  await sc.waitForFunction(n => window.__vetlock.sreqs().some(r => r.q.patient === n), c.name, { timeout: 30000 }); c.id = await sc.evaluate(n => window.__vetlock.sreqs().find(r => r.q.patient === n).id, c.name);
  await sc.waitForFunction(id => (document.querySelector('#sq-head .mut') || {}).textContent === 'request ' + id && /photos sent/.test(document.getElementById('sq-steps').textContent), c.id, { timeout: 60000 }); }
await tab(clinic, 'work'); await clinic.click('#w-check'); await waitText(clinic, '#w-n', /^4$/, 60000);
// the clinic's "Check the cat": on the record made from a request, Streetcat's
// photos at once, and the same hint as on Streetcat's side, before signing
const reqPicsAt = async id => { for (let i = 0; i < 30; i++) { if (await clinic.evaluate(async id => { const V = window.__vetlock, r = V.creqs().find(x => x.id === id); if (!r || !(r.q.photos || []).length) return false; for (const p of r.q.photos) if (!(await V.photoHere(p.sha256))) return false; return true; }, id)) return true;
  await tab(clinic, 'work'); await clinic.click('#w-check'); await clinic.waitForTimeout(1500); } return false; };
const SAMEQ = 'Nothing points to another cat.', OTHERQ = '✗ It may be another cat.';  /* short, in green or in red */
for (const c of CATS) { const looks = c.name === 'MOCHI' || c.name === 'TEO'; if (looks) await reqPicsAt(c.id);
  await tab(clinic, 'work'); await showW(clinic, 'w-pend'); await clinic.locator('#w-list .item', { hasText: new RegExp('^' + c.name + ' ') }).click(); await clinic.waitForSelector('#creq.on'); await clinic.click('#cr-cat-a'); await clinic.waitForSelector('#catnew.on');
  await shoot(clinic, '#cn-shots', c.rec, c.views);
  if (c.name === 'MOCHI') { await clinic.waitForFunction(() => document.querySelectorAll('#cn-req-pics img[src]').length === 3, null, { timeout: 15000 }).catch(() => {}); const offer = await txt(clinic, '#cn-like-st');
    check("the clinic's Check the cat: Streetcat's photos at once, under the clinic's own, and the recognition offered, not fetched", (await clinic.$$eval('#cn-req-pics img[src]', x => x.length)) === 3 && offer === "Its photos can be compared with Streetcat's, here on this phone. The cat recognition comes once: 121 MB." && !clinic._asked.some(engine), offer);
    await shot(clinic, 'm-clinic-check-offered'); await clinic.click('#cn-like-go'); }
  if (looks) { const said = await waitText(clinic, '#cn-req-st', /[Nn]othing points|✗/, 300000), redq = await clinic.$$eval('#cn-req-st .bad', e => e.length > 0), greenq = await clinic.evaluate(() => { const t = document.createElement('span'); t.style.color = 'var(--ok)'; document.body.appendChild(t); const ok = getComputedStyle(document.getElementById('cn-req-st')).color === getComputedStyle(t).color; t.remove(); return ok; });
    if (c.name === 'MOCHI') check("…a tap: the same cat as in Streetcat's photos: «Nothing points to another cat.», in green", said === SAMEQ && !redq && greenq, said);
    else check("…another cat than in Streetcat's photos: a brief warning, in red, before signing", said === OTHERQ && redq && !greenq, said);
    await fits(clinic, `the clinic's Check the cat (${c.name})`); await shot(clinic, 'm-clinic-check-' + c.name.toLowerCase()); }
  await clinic.click('#cn-go'); await waitText(clinic, '#cn-out', /SIGNED|✗/, 30000);
  c.rec_id = await clinic.evaluate(id => window.__vetlock.ccats().find(x => x.rec.statement.request === id).id, c.id); }
await tab(sc, 'cats'); const allIn = () => sc.evaluate(async n => { const V = window.__vetlock, s = V.scats(); if (s.length < n) return false; for (const x of s) for (const p of x.rec.statement.photos) if (!(await V.photoHere(p.sha256))) return false; return true; }, CATS.length);
for (let i = 0; i < 30 && !(await allIn()); i++) { await sc.click('#ca-check'); await sc.waitForTimeout(1500); }
check('the four records come to Streetcat by relay, with their photos', await allIn());

// 1) MOCHI's request, before the cat recognition is on this phone: one of the record's photos is still on its way
const [A, B, C2, D] = CATS, recA = await sc.evaluate(id => window.__vetlock.scats().find(x => x.id === id).rec.statement, A.rec_id), leftA = recA.photos.find(p => p.slot === 'left').sha256;
const idb = (p, fn, arg) => p.evaluate(([fn, arg]) => new Promise((res, rej) => { const q = indexedDB.open('streetcat'); q.onsuccess = () => { const t = q.result.transaction('photos', fn === 'get' ? 'readonly' : 'readwrite'), s = t.objectStore('photos');
  const g = fn === 'get' ? s.get(arg) : s.delete(arg); t.oncomplete = () => { if (fn !== 'get') return res(true); const v = g.result; if (!v) return res(null); const u = new Uint8Array(v); let x = ''; for (let i = 0; i < u.length; i += 8192) x += String.fromCharCode(...u.subarray(i, i + 8192)); res(btoa(x)); }; t.onerror = () => rej(t.error); }; q.onerror = () => rej(q.error); }), [fn, arg]);
await idb(sc, 'del', leftA); await openReq('MOCHI');
check('MOCHI\'s request: the record\'s photos under its own, view by view, named', (await txt(sc, '#sq-pics-l')) === 'When caught · your photos' && (await txt(sc, '#sq-rec-l')) === 'At the clinic, asleep · MOCHI\'s record'
  && (await imgs(sc, '#sq-pics')) === 'img,img,img' && (await imgs(sc, '#sq-rec-pics')) === 'img,on its way,img', `${await imgs(sc, '#sq-pics')} | ${await imgs(sc, '#sq-rec-pics')}`);
check('…one of them still on its way: it says so, and compares nothing', (await line(sc)) === 'Its photos are on their way: they come by relay, with a connection.' && await sc.isHidden('#sq-match-get'), await line(sc));
await sc.evaluate(([sha, b64]) => window.__vetlock.keepPhoto(sha, Uint8Array.from(atob(b64), c => c.charCodeAt(0))), [leftA, await idb(clinic, 'get', leftA)]); await openReq('MOCHI');
const tl0 = await recTl(sc);
check('…with all of them here, it offers to compare them, and fetches nothing yet (the recognition is 121 MB)', (await line(sc)) === 'They can also be compared here, on this phone, by the cat recognition: 121 MB, once.' && await sc.isVisible('#sq-match-go') && !sc._asked.some(engine), await line(sc));
check('…and the request\'s line says its record has come', /^✓ its record from the clinic · /.test(tl0.t) && !tl0.bad, tl0.t);
await fits(sc, 'a request with its record'); await shot(sc, 'm1-request-record');

// 2) a tap: the recognition comes, then the same drawn cat
await sc.click('#sq-match-go'); const r2 = await until(sc, /^Nothing points|^✗/);
check('a tap: the recognition comes, showing it come, and the same cat: nothing points to another cat', SAME.test(r2.s) && r2.seen.some(s => /^getting the cat recognition/.test(s)) && sc._asked.some(engine), `${r2.s} | ${r2.seen.filter(s => /getting|comparing/.test(s)).slice(0, 3).join(' / ')}`);
check('…in green, not in red, and no ✓', !(await red(sc, '#sq-match-st')) && await green(sc, '#sq-match-st') && !/✓/.test(r2.s));
await fits(sc, 'the same cat'); await shot(sc, 'm2-same-cat');

// 3) TEO: the record shows another cat: by itself now, in red, and in the request's line
await openReq('TEO'); const r3 = await until(sc, /^Nothing points|^✗/, 120000), tl3 = await recTl(sc);
check('another cat in the record: compared by itself, a warning in red', OTHER.test(r3.s) && await red(sc, '#sq-match-st'), r3.s);
check('…and the request\'s line says it, in red', tl3.t === '✗ its record from the clinic: may not be the same cat' && tl3.bad, tl3.t);
await fits(sc, 'another cat'); await shot(sc, 'm3-another-cat');

// 4) LUNA: rings of other colours, a look-alike: no warning, which is the limit the app states
await openReq('LUNA'); const r4 = await until(sc, /^Nothing points|^✗/, 120000);
check('a look-alike (the same pattern in other colours) is not caught: the limit it states', SAME.test(r4.s), r4.s);

// 5) PIP: one photo of the face in the record: too few
await openReq('PIP');
check('a record with one photo of the face or sides: too few to compare', (await line(sc)) === 'Too few photos in the record to compare them here: look at them, and at the chip.' && (await imgs(sc, '#sq-rec-pics')) === 'img,no photo,no photo', `${await line(sc)} | ${await imgs(sc, '#sq-rec-pics')}`);

// 6) the record opens from the request, and ← comes back
await openReq('MOCHI'); await sc.click('#sq-rec-a'); await sc.waitForSelector('#cat.on');
const t6 = await txt(sc, '#c1-head .title'); await sc.click('#hd-back'); await sc.waitForSelector('#sreq.on');
check('"MOCHI\'s record: chip, notes" opens the record, and ← comes back to the request', (await txt(sc, '#sq-rec-a')) === 'MOCHI\'s record: chip, notes' && t6 === 'MOCHI' && (await txt(sc, '#sq-head .mut')) === 'request ' + A.id, t6);

// 7) kept with the request: after a reload, the warning is there without the recognition
const n0 = sc._asked.filter(engine).length; await sc.reload(); await sc.waitForTimeout(800); await openReq('TEO'); await sc.waitForTimeout(600);
check('after a reload, the warning is kept with the request, without fetching the recognition again', OTHER.test(await line(sc)) && sc._asked.filter(engine).length === n0 && !(await sc.evaluate(() => CATID.loaded())), await line(sc));

// 8) a record signed with another clinic key, naming MOCHI's request, is not taken as its record
await sc.evaluate(async id => { const C = window.scCore, r = window.__vetlock.sreqs().find(x => x.id === id), sk = Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
  const { photos, ...rec } = await C.signCat({ name: 'NOT MOCHI', procedure: 'sterilisation (spay)', date: r.q.date, photos: [] }, sk, { request: id, campaign: r.q.campaign, signed: new Date(Date.now() + 60000).toISOString() });
  const all = JSON.parse(localStorage.getItem('vetlock.sc.cats') || '[]'); all.push({ id: rec.id, rec, from: rec.statement.clinic, at: new Date().toISOString(), via: 'file' }); localStorage.setItem('vetlock.sc.cats', JSON.stringify(all)); }, A.id);
await openReq('MOCHI');
check('a record signed with another clinic key, naming the request, is not taken as its record', (await txt(sc, '#sq-rec-l')) === 'At the clinic, asleep · MOCHI\'s record' && SAME.test(await line(sc)), await txt(sc, '#sq-rec-l'));

check('every screen fits the phone at 320, 375, 390 and 430 px', FITBAD.length === 0, FITBAD.join(' | ') || `${FIT.length} screens`);
await b.close(); for (const r of relays) r.close && r.close(); say(bad ? `match: ${bad} check(s) failed` : 'match: every check passed'); process.exit(bad ? 1 : 0);

// the partner's home shows its requests only once one of its two numbers is tapped (9 Nov): show that one (if not shown) and wait for it typed in
async function showW(p, id){ await p.evaluate(id => { const b = document.getElementById(id); if (b && !b.classList.contains('on')) b.click(); }, id); await p.waitForFunction(() => !document.querySelector('#w-list [style*="max-height"]'), null, { timeout: 15000 }).catch(() => {}); }
