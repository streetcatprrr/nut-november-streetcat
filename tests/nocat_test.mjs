// No cat in the photos (13 Nov; index.js and catid.js, catIn), with the app's own cat recognition and no stand-in: here a drawing is
// not a cat (pinBrowser's cats: 'real'). The clinic's new record, with a record on the phone to compare it with: the first photo waits
// for the tap, as before (121 MB, once); then the photo's tile says "✗ no cat" in red in place of its name, the tile not moved, and
// nothing is compared: "✗ No cat in your photos: they cannot be compared.", in red, and no record offered. A photo added after it is
// looked at by itself; the nose, a close-up, is not looked at. It never blocks: the record is signed as before. A new record starts
// with its tiles clean. Rescue's new request, with the recognition on the phone: a photo with no cat says so in its tile too, and its
// send button is as it was. It fits the phone at 320 px. No mint and no relay. (The comparisons' other answers, with the drawings standing
// for cats: match_test.)
import crypto from 'crypto';
import { chromium } from 'playwright';
import { pinBrowser } from './pin.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8080/', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(800); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };  /* SHOT_DIR=dir: the screens at 390 px */

// drawings as in catid_test: kind 0–5, a pattern and colours of its own; view 0–2 a record's face, left and right side, 3 a new photo
function draws(){ window.__draw = async (kind, view, q = .92) => { const W = 640, H = 480, cv = new OffscreenCanvas(W, H), g = cv.getContext('2d');
  const pal = [['#e08a2e', '#1b1b1b'], ['#8a8f99', '#f2f2f2'], ['#141414', '#f5f1e8'], ['#c9b48a', '#5a3b1f'], ['#f3efe6', '#d0721f'], ['#3d3a36', '#b8a07a']][kind];
  const dx = [0, -30, 28, 12][view], dy = [0, 10, -8, 6][view], rot = [0, -.12, .1, .05][view], s = [1, .92, .95, 1.06][view];
  g.fillStyle = pal[0]; g.fillRect(0, 0, W, H); g.translate(W / 2 + dx, H / 2 + dy); g.rotate(rot); g.scale(s, s); g.fillStyle = pal[1]; g.strokeStyle = pal[1];
  if (kind === 0) for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(((i % 3) - 1) * 150, (Math.floor(i / 3) - 1) * 120, 40 + (i % 2) * 18, 0, 7); g.fill(); }
  if (kind === 2) { g.beginPath(); g.moveTo(-180, 150); g.lineTo(0, -170); g.lineTo(180, 150); g.closePath(); g.fill(); }
  if (kind === 4) { g.lineWidth = 26; for (let r = 40; r < 400; r += 70) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); } }
  return new Uint8Array(await (await cv.convertToBlob({ type: 'image/jpeg', quality: q })).arrayBuffer()); }; }

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), { cats: 'real' });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), asked = [];
await c.addInitScript(k => { try { localStorage.setItem('vetlock.relays', '[]'); localStorage.setItem('vetlock.clinic.sk', k); } catch (_) {} }, crypto.randomBytes(32).toString('hex'));
await c.addInitScript(draws); c.on('request', r => asked.push(r.url()));
const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
await p.goto(BASE + 'index.html?role=clinic'); await p.waitForTimeout(600);

const jpeg = async (kind, view) => Buffer.from(await p.evaluate(async ([k, v]) => { const b = await window.__draw(k, v); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s); }, [kind, view]), 'base64');
const shoot = async (sel, slot, buf) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(`${sel} .shot[data-slot="${slot}"]`)]); await fc.setFiles({ name: `IMG_${slot}.JPG`, mimeType: 'image/jpeg', buffer: buf }); await p.waitForSelector(`${sel} .shot[data-slot="${slot}"].has`, { timeout: 30000 }); };
const tile = (sel, slot) => p.$eval(`${sel} .shot[data-slot="${slot}"]`, e => { const s = e.querySelector('span'), t = document.createElement('span'); t.style.color = 'var(--bad)'; document.body.appendChild(t);
  const red = getComputedStyle(s).color === getComputedStyle(t).color; t.remove(); const r = e.getBoundingClientRect(); return { t: s.textContent, red, no: e.classList.contains('nocat'), box: [r.x, r.y, r.width, r.height].map(Math.round).join(',') }; });
const text = sel => p.evaluate(s => (document.querySelector(s).textContent || '').trim(), sel);
const redText = sel => p.evaluate(s => { const e = document.querySelector(s), b = e.querySelector('.bad') || e, t = document.createElement('span'); t.style.color = 'var(--bad)'; document.body.appendChild(t); const ok = getComputedStyle(b).color === getComputedStyle(t).color; t.remove(); return ok; }, sel);
const until = async (fn, ok, ms = 300000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (ok(v)) break; await p.waitForTimeout(100); } return v; };
const engine = u => /\/ai\/[12]\/|catid-worker/.test(u);
const NOCAT = '✗ No cat in your photos: they cannot be compared.';

// a record on this phone, its photos made small and kept as the app does: something to compare the new cat with
await p.evaluate(async () => { const V = window.__vetlock, sk = localStorage.getItem('vetlock.clinic.sk'), photos = [];
  for (const [v, slot] of [[0, 'face'], [1, 'left'], [2, 'right']]) { const s = await V.shrinkPhoto(new Blob([await window.__draw(0, v)], { type: 'image/jpeg' })); await V.keepPhoto(s.sha256, s.bytes); photos.push({ slot, sha256: s.sha256, bytes: s.bytes.length, w: s.w, h: s.h }); }
  const rec = await window.scCore.signCat({ name: 'CARAMEL', colony: 'the old port', chip: '941000027761300', sex: 'male', ear: 'left', coat: '', procedure: 'sterilisation (neuter)', date: '2026-10-10', notes: '', photos }, sk);
  V.saveCcat({ id: rec.id, rec, to: '02' + 'a'.repeat(64), at: new Date().toISOString(), parts: {}, handed: true }); });

// 1) the first photo: the tap, then no cat
await p.evaluate(() => window.__vetlock.openCatnew(null)); await p.waitForTimeout(300); const before = await tile('#cn-shots', 'face');
await shoot('#cn-shots', 'face', await jpeg(2, 3)); await p.waitForSelector('#cn-like-go', { timeout: 10000 });
check('the first photo waits for the tap, as before, and nothing is fetched', /^Its photos can be compared with your 1 record/.test(await text('#cn-like-st')) && !asked.some(engine), await text('#cn-like-st'));
await p.click('#cn-like-go'); const said = await until(() => text('#cn-like-st'), s => /^✗/.test(s));
const face = await tile('#cn-shots', 'face'), recs = await p.evaluate(() => ({ hidden: document.getElementById('cn-recs').hidden, n: document.querySelectorAll('#cn-like-list button').length }));
check('a tap: the recognition comes and finds no cat in the drawing: «' + NOCAT + '», in red', said === NOCAT && await redText('#cn-like-st') && asked.some(engine), said);
check('…and no record is offered: nothing was compared', recs.hidden && recs.n === 0, JSON.stringify(recs));
check('…and the photo\'s tile says "✗ no cat" in red, in place of its name', face.t === '✗ no cat' && face.red && face.no, `${face.t} · red ${face.red}`);
check('…and the tile has not moved, nor changed its size', face.box === before.box, `${before.box} → ${face.box}`);

// 2) a photo added after it is looked at by itself; the nose is not looked at
await shoot('#cn-shots', 'left', await jpeg(2, 1)); const left = await until(() => tile('#cn-shots', 'left'), t => t.no, 120000);
check('a photo added after it is looked at by itself, with no tap: its tile too', left.t === '✗ no cat' && left.red && !(await p.isVisible('#cn-like-go')) && (await text('#cn-like-st')) === NOCAT, `${left.t} · ${await text('#cn-like-st')}`);
await shoot('#cn-shots', 'nose', await jpeg(2, 2)); await until(() => text('#cn-like-st'), s => s === NOCAT, 60000); await p.waitForTimeout(1500); const nose = await tile('#cn-shots', 'nose');
check('the nose, a close-up, is not looked at: its tile keeps its name', nose.t === 'nose' && !nose.no, nose.t); await shot(p, 'nc1-record-no-cat');
await p.setViewportSize({ width: 320, height: 740 }); await p.waitForTimeout(300);
const over = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth), small = await tile('#cn-shots', 'left');
check('…and it fits the phone at 320 px, the red words inside their tile', over <= 0 && await p.$eval('#cn-shots .shot[data-slot="left"]', e => { const s = e.querySelector('span').getBoundingClientRect(), r = e.getBoundingClientRect(); return s.left >= r.left - .5 && s.right <= r.right + .5 && s.top >= r.top - .5; }), `${over} px over · ${small.box}`);
await p.setViewportSize({ width: 390, height: 844 });

// 3) it never blocks: the record is signed as before
await p.evaluate(() => { const d = document.getElementById('cn-name'); if (d.closest('[hidden]')) document.getElementById('cn-edit').click(); }); await p.fill('#cn-name', 'SHADOW');
await p.click('#cn-go'); const out = await until(() => text('#cn-out'), s => /SIGNED|✗/.test(s), 30000);
check('it never blocks: the record with no cat in its photos is signed as before', /SIGNED/.test(out) && await p.evaluate(() => window.__vetlock.ccats().some(x => x.rec.statement.name === 'SHADOW')), out.replace(/\s+/g, ' ').slice(0, 60));

// 4) a new record starts with its tiles clean
await p.evaluate(() => window.__vetlock.openCatnew(null)); await p.waitForTimeout(300);
const clean = await p.$$eval('#cn-shots .shot', bs => bs.map(b => b.querySelector('span').textContent + (b.classList.contains('nocat') ? '!' : '')).join(','));
check('a new record starts with its tiles clean: their names, nothing in red', clean === 'face,left side,right side,nose', clean);

// 5) Rescue's new request, with the recognition on this phone: a photo with no cat says so in its tile too
await p.evaluate(() => { window.__vetlock.setRole('streetcat'); window.__vetlock.openTab('snew'); }); await p.waitForSelector('#sn-shots', { state: 'visible', timeout: 10000 });
const go0 = await p.isDisabled('#sn-go'); await shoot('#sn-shots', 'face', await jpeg(4, 3)); const sn = await until(() => tile('#sn-shots', 'face'), t => t.no, 120000);
check('Rescue\'s new request, the recognition here: the photo\'s tile says "✗ no cat" in red, and its send button is as it was', sn.t === '✗ no cat' && sn.red && (await p.isDisabled('#sn-go')) === go0, `${sn.t} · red ${sn.red}`); await shot(p, 'nc2-request-no-cat');

check('no page error', !errs.length, errs.join(' | ').slice(0, 200));
await b.close(); say(bad ? `nocat: ${bad} check(s) failed` : 'nocat: every check passed'); process.exit(bad ? 1 : 0);
