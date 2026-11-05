// The donor's private recovery receipt, version 1 (app/index.html in Chromium, local Nutshell mint with fake money). After locking, the
// receipt is a PNG with its data in a tEXt chunk and a check, and three separate steps: download requested, confirmed by the donor,
// verified by opening the saved file. The private key is never drawn (every text the page draws is recorded). Checking a screenshot
// of it, an edited copy or another donation's receipt fails, each with its reason. With a password, the key inside is sealed and the
// receipt needs it. A browser that never had the key reads the receipt in "Take my sats back": what the receipt says and what the mint
// says, apart, with the refund date in UTC and in local time. A receipt made before version 1 still opens. SHOT_DIR=dir saves screens.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import fs from 'fs';
import { pinBrowser, pin } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', TMP = process.env.TMPDIR || '/tmp', SHOT = process.env.SHOT_DIR, say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1, timezoneId: 'Europe/Madrid', acceptDownloads: true }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await c.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} window.__drawn = []; const f = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__drawn.push(String(t)); return f.call(this, t, ...a); }; });
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(200); } return s; };
const shot = async (p, name) => { if (SHOT) { await p.waitForTimeout(1500); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };
const chunks = png => { const out = []; for (let i = 8; i < png.length;) { const n = png.readUInt32BE(i), t = png.toString('latin1', i + 4, i + 8); out.push({ t, data: png.subarray(i + 8, i + 8 + n) }); i += 12 + n; } return out; };

// a campaign (keys made here, unsigned), and a donation locked in the donor's page
const sc = newSk(), cl = newSk(), camp = { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline: Math.floor(Date.now() / 1000) + 30 * 86400 }; await pin(camp.streetcat);  /* the test's own Streetcat key, pinned next to the published one (pin.mjs) */
const donor = await page(), lock = async n => { await tab(donor, 'donate'); await donor.evaluate(() => { const a = document.getElementById('d-again'); if (a) a.click(); }); await donor.fill('#d-camp', JSON.stringify(camp));
  await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(n)); await donor.click('#d-go'); const s = await waitText(donor, '#d-out', /LOCKED|Failed/); return s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop(); };
const tokA = await lock(21), skA = await donor.evaluate(t => JSON.parse(localStorage.getItem('vetlock.donor.keys')).find(k => k.lockedToken === t).sk, tokA);
check('the locked screen offers the private receipt, and shows no private key', /Save your private receipt/.test(await txt(donor, '#d-out')) && !(await donor.evaluate(sk => document.body.innerText.includes(sk), skA)) && /not saved yet/.test(await txt(donor, '#d-out .rc-st')));
await shot(donor, 'p1-donor-receipt-to-save');
// 1) download requested
const [dl] = await Promise.all([donor.waitForEvent('download'), donor.click('#d-out .rcpt button:has-text("save private receipt")')]); const file = `${TMP}/receipt-A.png`; await dl.saveAs(file); const png = fs.readFileSync(file);
check('saving asks for a download: a PNG named for the donation', /^streetcat-receipt-DON-[0-9A-F]{8}\.png$/.test(dl.suggestedFilename()) && png.subarray(1, 4).toString() === 'PNG' && /download requested · not confirmed yet/.test(await txt(donor, '#d-out .rc-st')), dl.suggestedFilename());
const ch = chunks(png), te = ch.filter(c => c.t === 'tEXt'), body = te.length === 1 ? te[0].data : Buffer.alloc(0), z = body.indexOf(0), kw = body.subarray(0, z).toString('latin1'), J = JSON.parse(body.subarray(z + 1).toString('latin1') || '{}');
check('its data is in one tEXt chunk, as JSON version 1', kw === 'streetcat.recovery-receipt' && J.format === 'streetcat.recovery-receipt' && J.version === 1 && J.donation.token === tokA && J.refund.key === skA && J.refund.pub === C.pubOf(skA) && /^DON-[0-9A-F]{8}$/.test(J.donation.ref) && J.donation.amount === 21, Object.keys(J).join(','));
check('…with a check: the first 16 hex of the SHA-256 of the rest, canonical', J.check === (await C.sha256hex(C.canon((({ check, ...r }) => r)(J)))).slice(0, 16), J.check);
const drawn = await donor.evaluate(() => window.__drawn), pieces = Array.from({ length: 57 }, (_, i) => skA.slice(i, i + 8));
check('the private key is never drawn on the picture', drawn.length > 10 && !drawn.some(t => pieces.some(p => t.toLowerCase().includes(p))) && drawn.some(t => t === 'PRIVATE · DO NOT SHARE') && drawn.some(t => t.startsWith('Refund opens ')), drawn.find(t => t.startsWith('Refund opens ')) || '');
// 2) confirmed by the donor; 3) verified by opening the saved file, and the wrong files refused
await donor.click('#d-out .rcpt button:has-text("confirm")'); check('confirming needs the box ticked', /download requested/.test(await txt(donor, '#d-out .rc-st')));
await donor.check('#d-out .rcpt .rc-conf input[type=checkbox]'); await donor.click('#d-out .rcpt button:has-text("confirm")'); check('…then it is confirmed, and not yet checked', /saved · not checked yet/.test(await txt(donor, '#d-out .rc-st')));
const verify = async (bytes, name = 'receipt.png') => { await donor.evaluate(() => { const s = document.querySelector('#d-out .rc-st'); s.textContent = ''; }); const [fc] = await Promise.all([donor.waitForEvent('filechooser'), donor.click('#d-out .rcpt button:has-text("check the saved file")')]); await fc.setFiles({ name, mimeType: name.endsWith('.png') ? 'image/png' : 'application/json', buffer: bytes }); return waitText(donor, '#d-out .rc-st', /.+/, 10000); };
const screenshot = Buffer.from(await donor.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d').drawImage(img, 0, 0); const bl = await new Promise(r => cv.toBlob(r, 'image/png')); return Array.from(new Uint8Array(await bl.arrayBuffer())); }, png.toString('base64')));
check('a screenshot of the receipt (the picture without its data) is refused', /✗ this picture holds no receipt: a screenshot or a photo of the receipt does not carry it/.test(await verify(screenshot)));
const edited = JSON.stringify({ ...J, donation: { ...J.donation, amount: 2100 } }); check('an edited copy is refused: its check does not match', /✗ its check does not match: the file is damaged or was edited/.test(await verify(Buffer.from(edited), 'receipt.json')));
const tokB = await lock(8), rB = await donor.evaluate(t => window.__vetlock.receiptOf(t), tokB);  /* another donation, for the checks below */
// verified at last with the real file
const okv = await (async () => { const p = await page(); await tab(p, 'donate'); await p.fill('#d-camp', JSON.stringify(camp)); await p.evaluate(() => { window.__vetlock.openTab('decash'); }); await p.fill('#d-token', await plain(3)); await p.click('#d-go'); await waitText(p, '#d-out', /LOCKED|Failed/);
  const [d1] = await Promise.all([p.waitForEvent('download'), p.click('#d-out .rcpt button:has-text("save private receipt")')]); const f1 = `${TMP}/receipt-C.png`; await d1.saveAs(f1);
  await p.check('#d-out .rcpt .rc-conf input[type=checkbox]'); await p.click('#d-out .rcpt button:has-text("confirm")');
  const pick = async (buf, name) => { await p.evaluate(() => { document.querySelector('#d-out .rc-st').textContent = ''; }); const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#d-out .rcpt button:has-text("check the saved file")')]); await fc.setFiles({ name, mimeType: 'application/json', buffer: buf }); return waitText(p, '#d-out .rc-st', /.+/, 10000); };
  const other = await pick(Buffer.from(JSON.stringify(rB)), 'other.json'), good = await pick(fs.readFileSync(f1), 'receipt.png'); await shot(p, 'p2-donor-receipt-verified');
  await p.evaluate(() => { document.querySelector('#d-out .rcpt details').open = true; }); const [q1, q2] = await p.$$('#d-out .rcpt details input[type=password]'); await q1.fill('a password after all'); await q2.fill('a password after all');  /* a password only now */
  await p.click('#d-out .rcpt button:has-text("use this password")'); const later = await waitText(p, '#d-out .rc-st', /protected with your password/); await p.close(); fs.unlinkSync(f1); return { other, good, later }; })();
check('another donation\'s receipt is refused, by its code', /✗ this receipt is for another donation \(DON-[0-9A-F]{8}\)/.test(okv.other), okv.other.slice(0, 70));
check('the saved file itself: "Backup verified"', /^✓ Backup verified · /.test(okv.good), okv.good);
check('a password set after saving names the copy saved before, which has none and still works', /The copy saved before has no password and still works: delete it once this one is saved\./.test(okv.later), okv.later.slice(0, 64) + '…');

// a password: the key inside is sealed; the receipt needs it
const pp = await page(); await tab(pp, 'donate'); await pp.fill('#d-camp', JSON.stringify(camp)); await pp.evaluate(() => { window.__vetlock.openTab('decash'); }); await pp.fill('#d-token', await plain(13)); await pp.click('#d-go'); const sp = await waitText(pp, '#d-out', /LOCKED|Failed/), tokP = sp.match(/cashuB[A-Za-z0-9_\-=]+/g).pop();
await pp.evaluate(() => { document.querySelector('#d-out .rcpt details').open = true; }); const [p1, p2] = await pp.$$('#d-out .rcpt details input[type=password]'); await p1.fill('short'); await p2.fill('short'); await pp.click('#d-out .rcpt button:has-text("use this password")');
check('a password under 10 characters is refused', /10 characters or more/.test(await txt(pp, '#d-out .rc-st')));
const PW = 'mochi gets spayed 2026'; await p1.fill(PW); await p2.fill(PW); await pp.click('#d-out .rcpt button:has-text("use this password")'); const first = await waitText(pp, '#d-out .rc-st', /protected with your password/);
check('a password before anything was saved: no copy saved before to warn about', /protected with your password$/.test(first), first);
const [dp] = await Promise.all([pp.waitForEvent('download'), pp.click('#d-out .rcpt button:has-text("save private receipt")')]); const fp = `${TMP}/receipt-P.png`; await dp.saveAs(fp); const pngP = fs.readFileSync(fp);
const tP = chunks(pngP).find(c => c.t === 'tEXt').data, JP = JSON.parse(tP.subarray(tP.indexOf(0) + 1).toString('latin1')), skP = await pp.evaluate(t => JSON.parse(localStorage.getItem('vetlock.donor.keys')).find(k => k.lockedToken === t).sk, tokP);
check('with a password, the key inside is sealed: not in the file in any form', !JP.refund.key && JP.refund.sealed && JP.refund.sealed.kdf.iterations === 310000 && !pngP.toString('latin1').includes(skP) && (await pp.evaluate(() => window.__drawn)).some(t => /Protected with a password/.test(t)));

// recovery in a browser that never had the key (Europe/Madrid)
const fresh = await page(); await tab(fresh, 'refund'); const openFile = async (p, buf, name) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#r-open')]); await fc.setFiles({ name, mimeType: 'image/png', buffer: buf }); return waitText(p, '#r-info', /Checked with the mint|cannot read/, 20000); };
let info = await openFile(fresh, png, 'receipt.png'); await fresh.waitForTimeout(800); info = await txt(fresh, '#r-info');
check('the receipt opens where the key never was: what it says…', /Saved in the receipt/.test(info) && /MOCHI · 21 sat · DON-[0-9A-F]{8}/.test(info) && /receipt version 1 · check ✓/.test(info) && /refund key 0[23][0-9a-f]{8}… · the one in the lock ✓/.test(info));
check('…the refund date in UTC and in local time', /refund opens \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC \((\d{1,2} [A-Z][a-z]{2}, )?\d{2}:\d{2} CET in Madrid\)/.test(info), (info.match(/refund opens [^\n]*/) || [''])[0]);
check('…and, apart, what the mint says', /Checked with the mint · /.test(info) && /mint signature ✓ on every proof \(DLEQ\)/.test(info) && /21 sat still locked/.test(info) && /Refund not available yet/.test(info) && /It opens /.test(info));
check('…with what can come back at most, before any invoice', /you receive at most about \d+ sat by Lightning, or \d+ sat as ecash/.test(info)); await shot(fresh, 'p3-recovery-not-yet');
info = await openFile(fresh, pngP, 'receipt.png'); check('a password-protected receipt asks for its password', !(await fresh.isHidden('#r-pw')));
await fresh.fill('#r-pass', 'not the password'); await fresh.click('#r-unlock'); check('…a wrong one does not open it', /wrong password, or the receipt is damaged/.test(await waitText(fresh, '#r-out', /wrong|unlocked/)));
await fresh.evaluate(() => { document.getElementById('r-out').textContent = ''; }); await fresh.fill('#r-pass', PW); await fresh.click('#r-unlock'); check('…the right one does', /^unlocked/.test(await waitText(fresh, '#r-out', /unlocked|wrong/)) && await fresh.isHidden('#r-pw'));
const old = JSON.stringify({ campaign: camp, lockedToken: tokB, refundKey: rB.refund.key, created: new Date().toISOString() }); await fresh.fill('#r-receipt', old); info = await waitText(fresh, '#r-info', /Checked with the mint/, 20000);
check('a receipt made before version 1 still opens, said to have no integrity check', /a receipt made before version 1: no integrity check/.test(info) && /8 sat still locked/.test(info));

await b.close(); for (const f of [file, fp]) try { fs.unlinkSync(f); } catch (_) {}
say(bad ? `receipt: ${bad} check(s) failed` : 'receipt: every check passed'); process.exit(bad ? 1 : 0);
