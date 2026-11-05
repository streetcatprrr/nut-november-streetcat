// In person (app/index.html in Chromium, local Nutshell mint with fake money, two local Nostr relays from nostr_relay.mjs): the donor
// shows a locked donation as an animated QR; a volunteer, with a key of their own (never Streetcat's), collects the parts in any order,
// sees the checks, accepts it and shows back a signed acknowledgment ("Not a certification"), which the donor's app verifies and keeps.
// The same donation cannot be accepted twice; one received offline says its spending state was not checked. Forwarded, both reach
// Streetcat's campaign as "in person". The QR the app draws decodes with the app's own jsqr.min.js, and the real scanner reads an
// animated QR from a (fake) camera. The public card is a PNG with no text chunk and refuses a message that looks like a token.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import fs from 'fs';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', TMP = process.env.TMPDIR || '/tmp', say = (...a) => console.log(...a);
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.waitForTimeout(1600); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };  /* after the header's flap */  /* SHOT_DIR=dir: the filled screens at 390 px @2x */
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7221 }), startRelay({ port: 7222 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const launch = async (args = []) => pinBrowser(await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args }));
const outside = new Set();
const page = async (b, o = {}) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: process.env.SHOT_DIR ? 2 : 1 }); await c.grantPermissions(['clipboard-read', 'clipboard-write', ...(o.camera ? ['camera'] : [])], { origin: BASE });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); p.on('request', r => { const u = new URL(r.url()); if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && !/^(data|blob):/.test(r.url()) && !u.pathname.endsWith('/api/v1/prices')) outside.add(u.origin); });  /* the price feed is answered by the test */
  await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); p._ctx = c; return p; };
const b = await launch(), donor = await page(b), vol = await page(b), sc = await page(b);
for (const p of [donor, vol, sc]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(200); } return s; };
const frames = async (p, id) => { for (let i = 0; i < 100; i++) { const f = await p.evaluate(id => window.__vetlock.frames(id), id); if (f.length) return f; await p.waitForTimeout(100); } return []; };
const feed = async (p, parts) => { for (const f of parts) { await p.evaluate(t => window.__vetlock.scanFeed(t), f); await p.waitForTimeout(30); } };
const checks = p => p.$$eval('#v-checks li', xs => xs.map(x => ({ state: x.className, text: x.querySelector('span').firstChild.textContent })));
// a filled screen must fit the phone too: 320, 375, 390 and 430 px wide
const FIT = [], FITBAD = []; const fits = async (p, label) => { const vs = p.viewportSize(), over = []; for (const w of [320, 375, 390, 430]) { await p.setViewportSize({ width: w, height: 740 }); await p.waitForTimeout(80); const o = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${w}px +${o}`); }
  await p.setViewportSize(vs); FIT.push(label); if (over.length) FITBAD.push(`${label}: ${over.join(', ')}`); };

// Streetcat's key, the clinic's key and the campaign
const clinic = await page(b); await clinic.goto(BASE + 'index.html'); await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1000); const clinicPk = await txt(clinic, '#cs-pk');
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1000);
await tab(sc, 'campaign'); await sc.reload(); await tab(sc, 'campaign'); await sc.fill('#k-name', 'MOCHI'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk);
await sc.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await sc.click('#k-go'); await waitText(sc, '#k-out', /is ready|cannot|pick another/); await sc.waitForTimeout(1000);
const link = (await txt(sc, '#k-out')).match(/http\S+#c=\S+/)[0], scPk = await sc.evaluate(() => window.__vetlock.heldKeys('streetcat').map(k => window.__vetlock.pubOf(k))[0]);
const lock = async n => { await donor.goto(link); await donor.reload(); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(n)); await donor.click('#d-go');
  const s = await waitText(donor, '#d-out', /LOCKED|Failed/); if (!/LOCKED/.test(s)) throw new Error(s); return Number(s.match(/LOCKED ([\d ]+) sat/)[1].replace(/ /g, '')); };

// the donor shows the donation as an animated QR
const A = await lock(2100); await donor.click('#d-out a:has-text("hand it over in person")'); const fa = await frames(donor, 'dh-term');
check('the donor\'s handover is an animated QR, in numbered parts', fa.length > 1 && fa.every((f, i) => f.startsWith(`SCQ:${i + 1}/${fa.length}:`)), fa.length + ' parts');
await fits(donor, 'the donor\'s animated QR'); await shot(donor, 'h1-donor-handover-qr'); const part1 = await txt(donor, '#dh-part'); await donor.waitForTimeout(1000); const part2 = await txt(donor, '#dh-part');
check('…which changes by itself', /^part \d+ of \d+/.test(part1) && part1 !== part2, part1 + ' → ' + part2);

// the QR the app draws decodes, with the app's own decoder (jsqr.min.js, from the app's folder)
const dec = await donor.evaluate(async () => { const svg = document.querySelector('#dh-term .qr svg').cloneNode(true); svg.setAttribute('width', '600'); svg.setAttribute('height', '600');
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)); await img.decode();
  const cv = document.createElement('canvas'); cv.width = cv.height = 600; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 600); g.drawImage(img, 0, 0, 600, 600);
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'jsqr.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const r = window.jsQR(g.getImageData(0, 0, 600, 600).data, 600, 600); return r && r.data; });
check('the QR on screen decodes back to one of its parts (app/jsqr.min.js)', fa.includes(dec), String(dec).slice(0, 12) + '…');

// the volunteer: their own key; the parts arrive out of order; four checks; accept and sign
await tab(vol, 'shand'); const volKeys = await vol.evaluate(() => ({ sc: window.__vetlock.heldKeys('streetcat').length, sk: localStorage.getItem('vetlock.volunteer.sk') }));
check('the volunteer has a key of their own and no Streetcat key', volKeys.sk && volKeys.sc === 0);
await vol.click('#v-scan'); await feed(vol, fa.slice().reverse()); await vol.waitForFunction(() => document.querySelectorAll('#v-checks li').length === 4, null, { timeout: 30000 });
const ca = await checks(vol);
check('the volunteer\'s checks: mint signature, conditions, duplicates, spending state', ca.every(x => x.state === 'ok') && ['Mint signature verified', 'Conditions match MOCHI', 'No duplicates', 'Unspent at the mint'].every((t, i) => ca[i].text === t), ca.map(x => x.text).join(' · '));
check('…and "Accept and sign" can be pressed', !(await vol.isDisabled('#v-accept'))); await fits(vol, 'the volunteer\'s checks and token'); await shot(vol, 'h2-volunteer-checks');
await vol.click('#v-accept'); const acc = await waitText(vol, '#v-out', /RECEIVED|✗/);
check('accepted, with the acknowledgment labelled "Not a certification"', /^RECEIVED [\d ]+ sat for MOCHI \(DON-[0-9A-F]{8}\)/.test(acc) && /Not a certification/.test(acc), acc.split('\n')[0]);
await fits(vol, 'the acknowledgment QR'); await shot(vol, 'h3-volunteer-acknowledgment'); const fk = await frames(vol, 'v-term'), ack = await vol.evaluate(() => window.__vetlock.vrecs()[0].ack);
check('the acknowledgment is signed with the volunteer\'s key, not Streetcat\'s', ack.body.volunteer !== scPk && ack.body.note === 'Not a certification' && ack.body.amount === A && await vol.evaluate(a => window.scCore.handoverReceiptOk(a), ack));

// the donor's app reads the acknowledgment back from the volunteer's screen
await donor.click('#dh-scan'); await feed(donor, fk.slice().reverse()); const got = await waitText(donor, '#dh-out', /RECEIVED|✗|not/);
check('the donor\'s app verifies the acknowledgment and keeps it', /^✓ RECEIVED by volunteer/.test(got) && /Not a certification/.test(got) && (await donor.evaluate(() => JSON.parse(localStorage.getItem('vetlock.donor.acks') || '[]').length)) === 1, got.split('\n')[0]);
await fits(donor, 'the donor\'s acknowledgment'); await shot(donor, 'h4-donor-acknowledged'); const forged = await donor.evaluate(async a => { a = JSON.parse(JSON.stringify(a)); a.body.amount += 1000; return window.scCore.handoverReceiptOk(a); }, ack); check('…and an acknowledgment changed afterwards does not verify', forged === false);

// the same donation again; then one received offline
await tab(vol, 'shand'); await vol.click('#v-scan'); await feed(vol, fa); await vol.waitForFunction(() => document.querySelectorAll('#v-checks li').length === 4, null, { timeout: 30000 });
const again = await checks(vol); check('the same donation again: "Already received", and it cannot be accepted', again[2].text === 'Already received' && again[2].state === 'bad' && await vol.isDisabled('#v-accept'));
const B = await lock(21); await donor.click('#d-out a:has-text("hand it over in person")'); const fb = await frames(donor, 'dh-term');
await vol._ctx.setOffline(true); await tab(vol, 'shand'); await vol.click('#v-scan'); await feed(vol, fb); await vol.waitForFunction(() => document.querySelectorAll('#v-checks li').length === 4, null, { timeout: 30000 });
const off = await checks(vol); check('offline: the mint signature is still checked, the spending state is said not to be', off[0].state === 'ok' && off[3].state === 'warn' && off[3].text === 'Spending state not checked', off.map(x => x.text).join(' · '));
await vol.click('#v-accept'); await waitText(vol, '#v-out', /RECEIVED|✗/); check('…and it is listed as received offline', /received offline/.test(await txt(vol, '#v-list')));
await vol._ctx.setOffline(false);

// forwarded to Streetcat
await tab(vol, 'shand'); await vol.click('#v-fwd'); const fw = await waitText(vol, '#v-out', /Forwarded|✗/);
check('the volunteer forwards both to Streetcat by relay', /^Forwarded/.test(fw) && (await vol.evaluate(() => window.__vetlock.outbox().filter(x => x.state === 'sent').length)) === 2, fw);
await tab(sc, 'home'); await sc.click('#h-list .item'); await sc.locator('#h-list .row2 button', { hasText: 'donations and requests' }).click(); await sc.click('#sc-check'); await waitText(sc, '#sc-net', /donation|checked/);
const subs = await sc.$$eval('#sc-dons .item .sub2', xs => xs.map(x => x.textContent));
check('Streetcat\'s campaign lists both, "in person"', subs.length === 2 && subs.every(s => / · in person$/.test(s)), subs.join(' | ')); await fits(sc, 'Streetcat\'s campaign'); await fits(vol, 'the volunteer\'s list'); await shot(sc, 'h5-streetcat-in-person'); await shot(vol, 'h6-volunteer-list');

// the card: a PNG with no text chunk; a message that looks like a token is refused
await tab(donor, 'dcard'); await donor.waitForSelector('#dk-img img', { timeout: 20000 });
const png = await donor.evaluate(async () => { const r = await fetch(document.querySelector('#dk-img img').src); return Array.from(new Uint8Array(await r.arrayBuffer())); });
const chunks = []; for (let i = 8; i < png.length;) { const n = ((png[i] << 24) | (png[i + 1] << 16) | (png[i + 2] << 8) | png[i + 3]) >>> 0, t = String.fromCharCode(...png.slice(i + 4, i + 8)); chunks.push(t); i += 12 + n; }
const W = (png[16] << 24 | png[17] << 16 | png[18] << 8 | png[19]) >>> 0, H = (png[20] << 24 | png[21] << 16 | png[22] << 8 | png[23]) >>> 0;
check('the card is a 1080 × 1350 PNG with no text chunk (tEXt, iTXt, zTXt)', W === 1080 && H === 1350 && !chunks.some(t => /^(tEXt|iTXt|zTXt|eXIf)$/.test(t)), [...new Set(chunks)].join(' '));
await donor.fill('#dk-msg', await plain(8)); const refused = await waitText(donor, '#dk-out', /looks like/, 5000);
check('a token typed as the message is not put on the card', /looks like a token, a key or an invoice/.test(refused));
await donor.fill('#dk-msg', 'for Mochi, from the corner shop'); await donor.waitForTimeout(900); check('…an ordinary message is', (await txt(donor, '#dk-out')) === ''); await fits(donor, 'the card'); await shot(donor, 'h7-donor-card');
check('these filled screens fit at 320, 375, 390 and 430 px', !FITBAD.length, FITBAD.length ? 'wider: ' + FITBAD.join(' · ') : FIT.join(' · '));
await b.close();

// the real scanner, with a camera: Chromium's fake camera plays an animated QR (donation A's parts, as the donor's phone shows them)
const QR = new Function(fs.readFileSync(new URL('../app/qrcode.min.js', import.meta.url), 'utf8') + ';return qrcode;')();
const video = `${TMP}/handover-qr.y4m`; { const S = 600, fd = fs.openSync(video, 'w'), uv = Buffer.alloc(S * S / 2, 128); fs.writeSync(fd, `YUV4MPEG2 W${S} H${S} F10:1 Ip A1:1 C420jpeg\n`);
  for (const t of fa) { const q = QR(0, 'M'); q.addData(t, 'Byte'); q.make(); const m = q.getModuleCount(), s = Math.floor(S / (m + 8)), o = (S - s * (m + 8)) >> 1, Y = Buffer.alloc(S * S, 235);
    for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) if (q.isDark(r, c)) for (let d = 0; d < s; d++) { const row = o + (r + 4) * s + d; Y.fill(16, row * S + o + (c + 4) * s, row * S + o + (c + 5) * s); }
    for (let k = 0; k < 4; k++) { fs.writeSync(fd, 'FRAME\n'); fs.writeSync(fd, Y); fs.writeSync(fd, uv); } } fs.closeSync(fd); }
const cam = await launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + video]), vol2 = await page(cam, { camera: true });
await vol2.goto(BASE + 'index.html'); await tab(vol2, 'shand'); await vol2.click('#v-scan');
const seen = await vol2.waitForFunction(() => document.querySelectorAll('#v-checks li').length === 4 || /not available/.test(document.getElementById('scan-msg').textContent), null, { timeout: 60000 }).then(() => vol2.evaluate(() => ({ n: document.querySelectorAll('#v-checks li').length, msg: document.getElementById('scan-msg').textContent, overlay: !document.getElementById('scan').hidden }))).catch(() => null);
const c2 = seen && seen.n === 4 ? await checks(vol2) : [];
check('the camera scanner collects every part of the animated QR and closes', c2.length === 4 && c2.every(x => x.state === 'ok') && !seen.overlay, seen ? (seen.n === 4 ? c2.map(x => x.text).join(' · ') : seen.msg) : 'timed out');
await cam.close(); try { fs.unlinkSync(video); } catch (_) {}
check('nothing was loaded from outside (no CDN): only the app, the local mint and the relays', outside.size === 0, [...outside].join(' '));

await Promise.all(relays.map(r => r.close()));
say(bad ? `handover: ${bad} check(s) failed` : 'handover: every check passed'); process.exit(bad ? 1 : 0);
