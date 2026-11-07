// "Already in the records?" (app/catid.js, app/index.js; StreetCat, 6 Nov: «que les avise de posibles redundancias»): on the clinic's new
// record the cat's photos are compared, on this phone, with the clinic's records, and the three most alike are shown in order: a hint,
// never a proof. The photos are drawn here, six patterns, each drawn as the views of its record and once more, moved and turned, as the
// new photo: no real photo is kept with the tests. Checked: with no records nothing is offered and nothing is fetched; it asks before the
// 121 MB come; it shows them coming and the comparing; the drawn cat's record comes first, with its photo; a tile opens that record and ←
// comes back to the new one, its photo kept; a photo added works out only that photo; a new record starts clean and needs no second tap;
// a cat with no record still gets only an order; one record and two say so; if the recognition cannot come it says so in red and a tap
// tries again; nothing goes to another address; and it fits the phone at 390 and 320 px.
import crypto from 'crypto';
import { chromium } from 'playwright';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.waitForTimeout(1600); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };  /* SHOT_DIR=dir: the screens at 390 px @2x */

// a drawn cat: kind 0–5, a pattern and colours of its own; view 0–2 its record's face, left and right side, 3 a new photo of it
function draws(){ window.__draw = async (kind, view, q = .92) => { const W = 640, H = 480, cv = new OffscreenCanvas(W, H), g = cv.getContext('2d');
  const pal = [['#e08a2e', '#1b1b1b'], ['#8a8f99', '#f2f2f2'], ['#141414', '#f5f1e8'], ['#c9b48a', '#5a3b1f'], ['#f3efe6', '#d0721f'], ['#3d3a36', '#b8a07a']][kind];
  const dx = [0, -30, 28, 12][view], dy = [0, 10, -8, 6][view], rot = [0, -.12, .1, .05][view], s = [1, .92, .95, 1.06][view];
  g.fillStyle = pal[0]; g.fillRect(0, 0, W, H); g.translate(W / 2 + dx, H / 2 + dy); g.rotate(rot); g.scale(s, s); g.fillStyle = pal[1]; g.strokeStyle = pal[1];
  if (kind === 0) for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(((i % 3) - 1) * 150, (Math.floor(i / 3) - 1) * 120, 40 + (i % 2) * 18, 0, 7); g.fill(); }
  if (kind === 1) { g.lineWidth = 34; for (let x = -500; x < 500; x += 95) { g.beginPath(); g.moveTo(x, -400); g.lineTo(x + 260, 400); g.stroke(); } }
  if (kind === 2) { g.beginPath(); g.moveTo(-180, 150); g.lineTo(0, -170); g.lineTo(180, 150); g.closePath(); g.fill(); }
  if (kind === 3) for (let y = -4; y < 4; y++) for (let x = -5; x < 5; x++) if ((x + y) & 1) g.fillRect(x * 70, y * 70, 70, 70);
  if (kind === 4) { g.lineWidth = 26; for (let r = 40; r < 400; r += 70) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); } }
  if (kind === 5) { g.beginPath(); g.ellipse(-90, -20, 150, 100, .4, 0, 7); g.fill(); g.beginPath(); g.ellipse(140, 90, 70, 50, -.3, 0, 7); g.fill(); }
  return new Uint8Array(await (await cv.convertToBlob({ type: 'image/jpeg', quality: q })).arrayBuffer()); }; }

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const clinic = async () => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', deviceScaleFactor: SHOT ? 2 : 1 }), asked = [];
  await c.addInitScript(k => { try { localStorage.setItem('vetlock.relays', '[]'); localStorage.setItem('vetlock.clinic.sk', k); } catch (_) {} }, crypto.randomBytes(32).toString('hex'));
  await c.addInitScript(draws); c.on('request', r => asked.push(r.url()));
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html?role=clinic'); await p.waitForTimeout(600); return { c, p, asked }; };
// records signed here with the clinic's key, their photos made small and kept as the app does
const seed = (p, list) => p.evaluate(async list => { const V = window.__vetlock, sk = localStorage.getItem('vetlock.clinic.sk'), SLOTS = ['face', 'left', 'right'];
  for (const [k, name, colony, n] of list) { const photos = [];
    for (let v = 0; v < n; v++) { const s = await V.shrinkPhoto(new Blob([await window.__draw(k, v)], { type: 'image/jpeg' })); await V.keepPhoto(s.sha256, s.bytes); photos.push({ slot: SLOTS[v], sha256: s.sha256, bytes: s.bytes.length, w: s.w, h: s.h }); }
    const rec = await window.scCore.signCat({ name, colony, chip: '941000' + String(27761300 + k * 7919).padStart(9, '0'), sex: k % 2 ? 'female' : 'male', ear: 'left', coat: '', procedure: k % 2 ? 'sterilisation (spay)' : 'sterilisation (neuter)', date: `2026-10-${String(10 + k).padStart(2, '0')}`, notes: '', photos }, sk);
    V.saveCcat({ id: rec.id, rec, to: '02' + 'a'.repeat(64), at: new Date().toISOString(), parts: {}, handed: true }); }
  return V.ccats().length; }, list);
const jpeg = async (p, kind, view, q) => Buffer.from(await p.evaluate(async ([k, v, q]) => { const b = await window.__draw(k, v, q); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s); }, [kind, view, q]), 'base64');
const shoot = async (p, slot, buf) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(`#cn-shots .shot[data-slot="${slot}"]`)]); await fc.setFiles({ name: `IMG_${slot}.JPG`, mimeType: 'image/jpeg', buffer: buf }); await p.waitForSelector(`#cn-shots .shot[data-slot="${slot}"].has`, { timeout: 30000 }); };
const st = async p => ((await p.textContent('#cn-like-st')) || '').trim();
const tiles = p => p.$$eval('#cn-like-list button', bs => bs.map(b => ({ name: b.querySelector('.nm').textContent, alt: (b.querySelector('img') || {}).alt || '', src: !!(b.querySelector('img') || {}).src })));
const until = async (p, re, ms = 300000) => { const seen = new Set(), t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await st(p); seen.add(s); if (re.test(s)) break; await p.waitForTimeout(40); } return { s, seen: [...seen] }; };
const tab = p => p.evaluate(() => { const on = document.querySelector('nav button.on'); return on ? on.dataset.t : ''; });
const kept = p => p.evaluate(() => new Promise(res => { const r = indexedDB.open('streetcat-catid'); r.onsuccess = () => { const q = r.result.transaction('vec').objectStore('vec').count(); q.onsuccess = () => res(q.result); q.onerror = () => res(-1); }; r.onerror = () => res(-1); }));
const over = p => p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
const engine = u => /\/ai\/[12]\/|catid-worker/.test(u), DONE = /Only an order/;

// 1) no records yet: nothing is offered and nothing is fetched
const A = await clinic(), p = A.p;
await p.evaluate(() => window.__vetlock.openTab('work')); await p.click('#w-cats'); await p.click('#ca-new'); await p.waitForTimeout(300);
await shoot(p, 'face', await jpeg(p, 0, 3, .8)); await p.waitForTimeout(300);
check('with no records yet, nothing is offered and nothing is fetched', await p.isHidden('#cn-like') && !A.asked.some(engine));

// 2) five records, then a new photo of MOCHI: it asks first
const REC = [[0, 'CARAMEL', 'the old port', 3], [1, 'SOCKS', 'the marina', 3], [2, 'MOCHI', 'the bakery', 2], [3, 'PEPPER', 'the old port', 3], [4, 'LUNA', 'the marina', 1]];
say(`(${await seed(p, REC)} records with ${REC.reduce((s, r) => s + r[3], 0)} drawn photos)`);
await p.evaluate(() => window.__vetlock.openCatnew(null)); await shoot(p, 'face', await jpeg(p, 2, 3, .8)); await p.waitForSelector('#cn-like-go', { timeout: 10000 });
check('with records there, it asks before the cat recognition comes, saying what it compares and how big it is', (await st(p)) === 'Its photos can be compared with your 5 records, here on this phone. The cat recognition comes once: 121 MB.' && !A.asked.some(engine), await st(p));
await shot(p, 'like-1-ask');

// 3) a tap: it comes, it compares, the three most alike
const t0 = Date.now(); await p.click('#cn-like-go'); const run = await until(p, DONE); const secs = ((Date.now() - t0) / 1000).toFixed(1);
await p.waitForFunction(() => document.querySelectorAll('#cn-like-list img[src]').length === document.querySelectorAll('#cn-like-list button').length, null, { timeout: 10000 }).catch(() => {});
const T = await tiles(p);
check('…on a tap it shows the 121 MB coming, then the records compared photo by photo', run.seen.some(s => /^getting the cat recognition(…|: \d+ of 121 MB)$/.test(s)) && run.seen.some(s => /^comparing with your 5 records: \d+ of 12 photos$/.test(s)), run.seen.filter(s => !DONE.test(s)).slice(0, 3).join(' | ') + ' …');
check("the three records most like it, the drawn cat's own first, with its photo", T.length === 3 && T[0].name === 'MOCHI' && /^MOCHI, /.test(T[0].alt) && T.every(t => t.src), T.map(t => t.name).join(' · ') + ` · in ${secs} s`);
check('…said to be only an order, worked out on this phone', run.s === 'The 3 of your 5 records that look most like it, worked out on this phone. Only an order, not a match: open one to compare the chip.', run.s);
check('every photo was worked out once and kept: the 12 of the records and the new one', (await kept(p)) === 13, `${await kept(p)} kept`);
check('…and it fits the phone at 390 px', (await over(p)) <= 0, `${await over(p)} px over`);
await shot(p, 'like-2-match');

// 4) a tile opens that record; ← comes back to the new one, as it was
await p.click('#cn-like-list button'); await p.waitForTimeout(400); const opened = { tab: await tab(p), head: ((await p.textContent('#c1-head')) || '').trim() };
await p.click('#hd-back'); await p.waitForTimeout(400);
check('a tile opens that record, and ← comes back to the new record with its photo and the three tiles', opened.tab === 'cat' && /MOCHI/.test(opened.head) && (await tab(p)) === 'catnew' && await p.isVisible('#cn-shots .shot[data-slot="face"].has') && (await tiles(p)).length === 3, `${opened.tab} “${opened.head.slice(0, 30)}” → ${await tab(p)}`);

// 5) a second photo: only that one is worked out
const k0 = await kept(p), t1 = Date.now(); await shoot(p, 'left', await jpeg(p, 2, 1, .75)); const run2 = await until(p, DONE, 120000), T2 = await tiles(p), k1 = await kept(p);
check("a second photo works out only that one, and the drawn cat's record stays first", k1 === k0 + 1 && T2.length === 3 && T2[0].name === 'MOCHI' && DONE.test(run2.s), `kept ${k0} → ${k1} · ${T2.map(t => t.name).join(' · ')} · in ${((Date.now() - t1) / 1000).toFixed(1)} s`);

// 6) a new record starts clean; a cat with no record gets only an order too
await p.evaluate(() => window.__vetlock.openCatnew(null)); await p.waitForTimeout(200); const clean = await p.isHidden('#cn-like') && !(await tiles(p)).length;
await shoot(p, 'face', await jpeg(p, 5, 3, .8)); const run3 = await until(p, DONE, 120000), T3 = await tiles(p);
check('a new record starts clean, and its photo is compared with no second tap', clean && !run3.seen.some(s => /comes once/.test(s)) && T3.length === 3, T3.map(t => t.name).join(' · '));
check('a cat with no record gets the same: only an order, never a match', run3.s === run.s, run3.s);
await shot(p, 'like-3-new');
await p.setViewportSize({ width: 320, height: 740 }); await p.waitForTimeout(400);
check('…and it fits at 320 px', (await over(p)) <= 0, `${await over(p)} px over`);
const other = [...new Set(A.asked.filter(u => !u.startsWith(BASE) && !/\/api\/v1\/prices/.test(u)).map(u => new URL(u).host))];
check("nothing went to another address: the recognition came from the app's own, and no photo left the phone", !other.length && A.asked.includes(BASE + 'ai/1/dinov2-small-q8.onnx'), other.join(', ') || 'only ' + BASE);
await A.c.close();

// 7) one record, then two; and a recognition that cannot come
const B = await clinic(), q = B.p; await seed(q, [[3, 'PEPPER', 'the old port', 3]]);
await q.evaluate(() => window.__vetlock.openCatnew(null)); await shoot(q, 'face', await jpeg(q, 3, 3, .8)); await q.waitForSelector('#cn-like-go', { timeout: 10000 });
await B.c.route('**/ai/1/dinov2-small-q8.onnx', r => r.abort('internetdisconnected'));
await q.click('#cn-like-go'); const fail = await until(q, /^✗/, 120000);
const red = await q.evaluate(() => { const s = document.getElementById('cn-like-st'), t = document.createElement('span'); t.className = 'bad'; document.body.appendChild(t); const ok = getComputedStyle(s).color === getComputedStyle(t).color; t.remove(); return ok; });
check('if the cat recognition cannot come, it says so in red, with the button to try again', /^✗ the cat recognition did not come: /.test(fail.s) && red && await q.isVisible('#cn-like-go'), fail.s.slice(0, 120));
await B.c.unroute('**/ai/1/dinov2-small-q8.onnx'); await q.click('#cn-like-go'); const r1 = await until(q, DONE);
check('…and a tap, with it there, compares: with one record, that record, said so', (await tiles(q)).length === 1 && r1.s === 'Your only record, worked out on this phone. Only an order, not a match: open one to compare the chip.' && !(await q.evaluate(() => document.getElementById('cn-like-st').classList.contains('bad'))), r1.s);
await seed(q, [[1, 'SOCKS', 'the marina', 2]]); await shoot(q, 'left', await jpeg(q, 3, 1, .75)); const r2 = await until(q, DONE, 120000), T4 = await tiles(q);
check('with two records: both, the most alike first', T4.length === 2 && T4[0].name === 'PEPPER' && r2.s === 'Your 2 records, the most alike first, worked out on this phone. Only an order, not a match: open one to compare the chip.', T4.map(t => t.name).join(' · ') + ' · ' + r2.s);

await b.close(); say(bad ? `catid: ${bad} check(s) failed` : 'catid: every check passed'); process.exit(bad ? 1 : 0);
