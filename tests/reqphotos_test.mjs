// The cat's photos in Streetcat's request (StreetCat, 6 Nov: «para ver que realmente se está certificando el gato que es»), against
// the local mint and two local test relays (made-up keys, fake money). The photos are drawn here: no real photo
// is kept with the tests. Streetcat takes three photos of the cat as caught (face, sides), each made small on its phone; the request
// names them, and they follow it by relay, in parts, encrypted to the clinic's key. The clinic gets the request and its photos whole
// (the very bytes Streetcat took) and sees them, to check it is this cat; a tap shows one big. In person, by QR, the request comes
// without them ("on their way"); they arrive by relay once the clinic has a connection, and a box it ticked stays ticked. A file
// carries them. Every screen with photos fits the phone at 320, 375, 390 and 430 px.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
import fs from 'fs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1600); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };  /* SHOT_DIR=dir: the screens at 390 px @2x, from the top (scrolled, the sticky header would be drawn halfway down) */
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7231 }), startRelay({ port: 7232 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');

// a drawn cat: kind, a pattern and colours of its own; view 0–2 its face, left and right side
function draws(){ window.__draw = async (kind, view, q = .92) => { const W = 640, H = 480, cv = new OffscreenCanvas(W, H), g = cv.getContext('2d');
  const pal = [['#e08a2e', '#1b1b1b'], ['#8a8f99', '#f2f2f2'], ['#141414', '#f5f1e8'], ['#c9b48a', '#5a3b1f'], ['#f3efe6', '#d0721f']][kind];
  const dx = [0, -30, 28][view], dy = [0, 10, -8][view], rot = [0, -.12, .1][view], s = [1, .92, .95][view];
  g.fillStyle = pal[0]; g.fillRect(0, 0, W, H); g.translate(W / 2 + dx, H / 2 + dy); g.rotate(rot); g.scale(s, s); g.fillStyle = pal[1]; g.strokeStyle = pal[1];
  if (kind === 2) { g.beginPath(); g.moveTo(-180, 150); g.lineTo(0, -170); g.lineTo(180, 150); g.closePath(); g.fill(); }
  else { g.lineWidth = 26; for (let r = 40; r < 400; r += 70) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); } }
  return new Uint8Array(await (await cv.convertToBlob({ type: 'image/jpeg', quality: q })).arrayBuffer()); }; }

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1, acceptDownloads: true });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS); await c.addInitScript(draws);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); p._ctx = c; return p; };
const donor = await page(), clinic = await page(), sc = await page(), phone2 = await page();
for (const p of [donor, clinic, sc, phone2]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(200); } return x; };
const jpeg = async (p, kind, view) => Buffer.from(await p.evaluate(async ([k, v]) => { const b = await window.__draw(k, v); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s); }, [kind, view]), 'base64');
const shoot = async (p, kind) => { for (const [slot, view] of [['face', 0], ['left', 1], ['right', 2]]) { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(`#sn-shots .shot[data-slot="${slot}"]`)]);
  await fc.setFiles({ name: `IMG_${slot}.JPG`, mimeType: 'image/jpeg', buffer: await jpeg(p, kind, view) }); await p.waitForSelector(`#sn-shots .shot[data-slot="${slot}"].has`, { timeout: 30000 }); } };
const imgs = (p, box) => p.$$eval(box + ' button', bs => bs.filter(b => { const i = b.querySelector('img'); return i && i.src; }).length);
const FIT = [], FITBAD = []; const fits = async (p, label) => { const vs = p.viewportSize(), over = []; for (const wd of [320, 375, 390, 430]) { await p.setViewportSize({ width: wd, height: 740 }); await p.waitForTimeout(80); const o = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${wd}px +${o}`); }
  await p.setViewportSize(vs); FIT.push(label); if (over.length) FITBAD.push(`${label}: ${over.join(', ')}`); };

// keys, a campaign, a donation sent to Streetcat (as in requests_test.mjs)
await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1200); const clinicPk = await txt(clinic, '#cs-pk');
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1200);
await tab(sc, 'campaign'); await sc.reload(); await tab(sc, 'campaign'); await sc.fill('#k-name', 'MOCHI'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk);
await sc.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await sc.click('#k-go'); await waitText(sc, '#k-out', /is ready|cannot|pick another/); await sc.waitForTimeout(1200);
const link = (await txt(sc, '#k-out')).match(/http\S+#c=\S+/)[0];
for (const n of [2100, 300, 210]) { await donor.goto(link);  /* the third pays the request saved as a file (4) */ await donor.reload(); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(n)); await donor.click('#d-go');
  await waitText(donor, '#d-out', /LOCKED|Failed/); await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000); }
await tab(sc, 'home'); await sc.click('#h-kinds button.tile'); await sc.click('#kd-pots button.req'); await sc.locator('#kd-pots .row2 button', { hasText: 'donations and requests' }).click(); await sc.click('#sc-check'); await waitText(sc, '#sc-net', /donation|checked/);

// 1) Streetcat's request with three photos of the cat as caught
await sc.click('#sc-new'); await sc.waitForFunction(() => document.querySelectorAll('#sn-dons input').length === 3, null, { timeout: 30000 });
const dons = await sc.$$eval('#sn-dons .item', xs => xs.map(x => ({ ref: x.querySelector('.nm').textContent, avail: Number(x.querySelector('.sub2').textContent.match(/^([\d ]+) sat/)[1].replace(/ /g, '')) })));
const smalls = dons.filter(d => d.avail < 1000).sort((x, y) => y.avail - x.avail), bigRef = dons.find(d => d.avail > 1000).ref, smallRef = smalls[0].ref, spareRef = smalls[1].ref;
check('the new request offers three photos of the cat, under "Photos", with no text under them (StreetCat, 9 Nov, 14:07)', (await sc.$$eval('#sn-shots .shot', bs => bs.map(b => b.dataset.slot).join())) === 'face,left,right' && (await sc.evaluate(() => document.getElementById('sn-shots').previousElementSibling.textContent.trim())) === 'Photos' && !(await sc.$('#sn-shots-st')));
await sc.fill('#sn-cat', 'MOCHI'); await sc.fill('#sn-proc', 'sterilisation (spay)'); await shoot(sc, 2);
await sc.fill('#sn-use-' + bigRef, '1500');
check('…taken, each shows in its place, and still no line under them', (await sc.$$eval('#sn-shots .shot.has img', xs => xs.length)) === 3 && !(await sc.$('#sn-shots-st')));
await fits(sc, 'the new request with photos'); await shot(sc, 'q1-new-request-photos');
await sc.click('#sn-go'); const sent = await waitText(sc, '#sq-steps', /its 3 photos sent/, 60000);
const q1 = await sc.evaluate(() => window.__vetlock.sreqs().find(r => r.q.patient === 'MOCHI').q);
check('the request names them by SHA-256 (face, sides), and they go to the clinic by relay, in parts', (q1.photos || []).map(p => p.slot).join() === 'face,left,right' && q1.photos.every(p => /^[0-9a-f]{64}$/.test(p.sha256)) && /its 3 photos sent/.test(sent), sent.split('\n').slice(0, 3).join(' | '));
check('…and Streetcat\'s request shows them', (await imgs(sc, '#sq-pics')) === 3); await fits(sc, 'Streetcat\'s request with photos'); await shot(sc, 'q2-streetcat-request-photos');

// 2) the clinic: the request and its photos, whole
await tab(clinic, 'work'); await clinic.click('#w-check'); await waitText(clinic, '#w-n', /^1$/); await showW(clinic, 'w-pend'); await clinic.click('#w-list .item');
await clinic.waitForFunction(() => document.querySelectorAll('#cr-pics img[src]').length === 3, null, { timeout: 20000 }).catch(() => {});
const whole = await clinic.evaluate(shas => Promise.all(shas.map(s => window.__vetlock.photoHere(s))), q1.photos.map(p => p.sha256));
check('the clinic gets the request with its three photos, whole (each the one its SHA-256 says)', (await imgs(clinic, '#cr-pics')) === 3 && whole.every(Boolean), whole.join());
check('…and sees them, under "Photos from Streetcat", with no text under them (StreetCat, 9 Nov, 14:09)', (await txt(clinic, '#cr-pics-st')) === '' && (await txt(clinic, '#cr-pics-box label')) === 'Photos from Streetcat' && await clinic.isVisible('#cr-pics-box'));
await clinic.click('#cr-pics button:nth-child(2)'); const big = await clinic.$eval('#cr-pics button:nth-child(2)', b => b.classList.contains('big') && getComputedStyle(b).order === '-1');
await clinic.click('#cr-pics button:nth-child(2)'); const small = await clinic.$eval('#cr-pics button:nth-child(2)', b => !b.classList.contains('big'));
check('a tap shows a photo big, first; a second tap, small again', big && small); await fits(clinic, 'the clinic\'s request with photos'); await shot(clinic, 'q3-clinic-request-photos');

// 3) in person, by QR, with the clinic offline: the request without its photos, which come once it has a connection
await clinic._ctx.setOffline(true);
await tab(sc, 'scamp'); await sc.click('#sc-new'); await sc.waitForSelector('#sn-use-' + smallRef, { timeout: 30000 });
await sc.fill('#sn-cat', 'TEO'); await sc.fill('#sn-proc', 'castration'); await shoot(sc, 4); await sc.fill('#sn-use-' + smallRef, '100'); await sc.click('#sn-go'); await waitText(sc, '#sq-steps', /its 3 photos sent/, 60000);
await sc.click('#sq-qra'); await sc.waitForSelector('#sq-term .qr'); const fq = await sc.evaluate(() => window.__vetlock.frames('sq-term'));  /* sent by relay: its small "Clinic offline? Show it as QR" */
await tab(clinic, 'work'); await clinic.click('#w-open'); await clinic.click('#w-scan'); for (const f of fq.slice().reverse()) { await clinic.evaluate(t => window.__vetlock.scanFeed(t), f); await clinic.waitForTimeout(30); }
const dl2 = await waitText(clinic, '#cr-dl', /TEO/); await clinic.waitForTimeout(400);
check('in person, by QR, the request comes without its photos: "on their way"', /in person, by QR/.test(dl2) && (await txt(clinic, '#cr-pics-st')) === '3 of 3 on their way: they come by relay, with a connection.' && (await imgs(clinic, '#cr-pics')) === 0, await txt(clinic, '#cr-pics-st'));
await shot(clinic, 'q4-clinic-qr-photos-on-their-way'); await clinic.check('#cr-ok');
await clinic._ctx.setOffline(false); await clinic.evaluate(() => window.__vetlock.tick());
const came = await clinic.waitForFunction(() => document.querySelectorAll('#cr-pics img[src]').length === 3, null, { timeout: 30000 }).then(() => true, () => false);
check('…with a connection they arrive by relay, and the ticked box stays ticked', came && await clinic.isChecked('#cr-ok') && (await txt(clinic, '#cr-pics-st')) === '', await txt(clinic, '#cr-pics-st'));

// 4) a file carries the photos: another phone sees them at once, with no relay. A request no relay took offers the file (one that went
// by relay offers only its small QR link), so this one is made with Streetcat's relays pointed where nothing listens
await sc.evaluate(() => localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:7239'));
await tab(sc, 'scamp'); await sc.click('#sc-new'); await sc.waitForSelector('#sn-use-' + spareRef, { timeout: 30000 });
await sc.fill('#sn-cat', 'PIP'); await sc.fill('#sn-proc', 'castration'); await shoot(sc, 3); await sc.fill('#sn-use-' + spareRef, '100'); await sc.click('#sn-go');
await sc.waitForSelector('#sq-file', { state: 'visible', timeout: 30000 });
const [file] = await Promise.all([sc.waitForEvent('download'), sc.click('#sq-file')]); const ftext = fs.readFileSync(await file.path(), 'utf8'), fj = JSON.parse(ftext);
await sc.evaluate(r => localStorage.setItem('vetlock.relays', r), RELAYS);
await phone2.evaluate(t => window.__vetlock.openPayload(t, 'file'), ftext); await phone2.waitForFunction(() => document.querySelectorAll('#cr-pics img[src]').length === 3, null, { timeout: 10000 }).catch(() => {});
check('a request saved as a file carries its photos: another phone sees them at once', Object.keys(fj.photoData || {}).sort().join() === 'face,left,right' && (await imgs(phone2, '#cr-pics')) === 3 && !(await phone2.evaluate(() => window.__vetlock.creqs().some(r => 'photoData' in r.q))), `${Math.round(ftext.length / 1000)} kB`);
check('every screen with photos fits the phone at 320, 375, 390 and 430 px', !FITBAD.length, FITBAD.join(' | ') || FIT.length + ' screens');

await b.close(); for (const r of relays) try { r.close(); } catch (_) {}
say(bad ? `reqphotos: ${bad} check(s) failed` : 'reqphotos: every check passed'); process.exit(bad ? 1 : 0);

// the partner's home shows its requests only once one of its two numbers is tapped (9 Nov): show that one (if not shown) and wait for it typed in
async function showW(p, id){ await p.evaluate(id => { const b = document.getElementById(id); if (b && !b.classList.contains('on')) b.click(); }, id); await p.waitForFunction(() => !document.querySelector('#w-list [style*="max-height"]'), null, { timeout: 15000 }).catch(() => {}); }
