// The clinic's settings and the "Ready for offline" checklist (app/index.html in Chromium; no mint needed). The key backup is a file
// encrypted with a password (PBKDF2-SHA256 and AES-GCM): it must not hold the key in the clear; a wrong password changes nothing; the
// right one, on a phone that never had the key, brings back the same key and the older ones kept with it. The checklist says what the
// clinic still needs to confirm without coverage, and turns ready once the app has saved itself (service worker) and the key is there.
import { chromium } from 'playwright';
import fs from 'fs';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', TMP = process.env.TMPDIR || '/tmp', say = (...a) => console.log(...a);
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.waitForTimeout(1600); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };  /* after the header's flap */  /* SHOT_DIR=dir: the filled screens at 390 px @2x */
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async (sw = 'block') => { const c = await b.newContext({ serviceWorkers: sw, viewport: { width: 390, height: 844 }, deviceScaleFactor: process.env.SHOT_DIR ? 2 : 1, acceptDownloads: true }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(150); } return s; };
const PW = 'corner shop cats 2026';

// a clinic phone: its key, a backup refused for a short or mistyped password, then saved
const A = await page(); await tab(A, 'csettings'); check('no key yet', (await txt(A, '#cs-pk')) === '— (none yet)');
await A.click('#cs-new'); await A.waitForTimeout(900); const pk1 = await txt(A, '#cs-pk'); await A.click('#cs-new'); await A.waitForTimeout(900); const pk2 = await txt(A, '#cs-pk');
check('a second key keeps the first one on the phone', /^0[23][0-9a-f]{64}$/.test(pk2) && pk1 !== pk2 && /\+ 1 older key kept/.test(await txt(A, '#cs-pk-old')));
await A.fill('#cs-pw', 'short'); await A.fill('#cs-pw2', 'short'); await A.click('#cs-save'); check('a password under 10 characters is refused', /10 characters or more/.test(await waitText(A, '#cs-out', /characters/)));
await A.fill('#cs-pw', PW); await A.fill('#cs-pw2', PW + 'x'); await A.click('#cs-save'); check('two different passwords are refused', /not the same/.test(await waitText(A, '#cs-out', /same/)));
await A.fill('#cs-pw2', PW); const [dl] = await Promise.all([A.waitForEvent('download'), A.click('#cs-save')]); const file = `${TMP}/clinic-key-backup.json`; await dl.saveAs(file);
const raw = fs.readFileSync(file, 'utf8'), J = JSON.parse(raw), sks = await A.evaluate(() => [localStorage.getItem('vetlock.clinic.sk'), ...JSON.parse(localStorage.getItem('vetlock.clinic.old') || '[]')]);
check('the backup is a file named for the clinic key, with its public key only', /^clinic-key-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()) && J.t === 'streetcat.key-backup' && J.pub === pk2, dl.suggestedFilename());
check('…and no private key in it, in any form', sks.length === 2 && sks.every(k => /^[0-9a-f]{64}$/.test(k) && !raw.toLowerCase().includes(k) && !raw.includes(Buffer.from(k, 'hex').toString('base64').slice(0, 20))));
check('…encrypted with PBKDF2-SHA256 (310 000 rounds) and AES-GCM', J.kdf.name === 'PBKDF2' && J.kdf.hash === 'SHA-256' && J.kdf.iterations === 310000 && J.cipher.name === 'AES-GCM' && J.data.length > 100);
check('the settings screen never shows the private key', !(await A.evaluate(ks => ks.some(k => document.body.innerText.includes(k)), sks)));

// another phone: the wrong password changes nothing; the right one brings both keys back
const B = await page(); await tab(B, 'csettings');
const restore = async (p, pw) => { await p.fill('#cs-pw', pw); await p.evaluate(() => { document.getElementById('cs-out').textContent = ''; }); const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#cs-restore')]); await fc.setFiles(file); return waitText(p, '#cs-out', /Restored|wrong|not|could/); };
const wrong = await restore(B, 'not the password'); check('a wrong password: nothing changes', /wrong password, or the file is damaged: nothing was changed/.test(wrong) && (await txt(B, '#cs-pk')) === '— (none yet)');
const right = await restore(B, PW); await shot(B, 's1-clinic-settings-restored'); check('the right password brings back the same key, and the older one', /^Restored: 2 keys/.test(right) && (await txt(B, '#cs-pk')) === pk2 && /\+ 1 older key kept/.test(await txt(B, '#cs-pk-old')), right);
const same = await B.evaluate(() => [localStorage.getItem('vetlock.clinic.sk'), ...JSON.parse(localStorage.getItem('vetlock.clinic.old') || '[]')]); check('…exactly the keys the first phone holds', JSON.stringify(same.slice().sort()) === JSON.stringify(sks.slice().sort()));
const damaged = JSON.parse(raw); damaged.data = damaged.data.slice(0, -8) + 'AAAAAAAA'; fs.writeFileSync(file, JSON.stringify(damaged)); const dmg = await restore(B, PW);
check('a damaged file is refused and nothing changes', /nothing was changed/.test(dmg) && (await txt(B, '#cs-pk')) === pk2);

// Ready for offline: a phone that saves the app (service worker allowed)
const O = await page('allow'); await tab(O, 'coffline'); await O.waitForSelector('#co-list li');
const first = await O.$$eval('#co-list li', xs => xs.map(x => x.className + ' ' + x.querySelector('span').firstChild.textContent));
check('first, it says what is missing: the key', first.some(x => x === 'bad No clinic key on this phone') && /^Not ready for offline use · \d+ to fix$/.test(await txt(O, '#co-sum')), first.join(' | '));
await O.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); }, null, { timeout: 30000 }); await O.reload(); await O.waitForTimeout(800);
await tab(O, 'csettings'); await O.click('#cs-new'); await O.waitForTimeout(700); await tab(O, 'coffline'); await O.click('#co-again'); await O.waitForTimeout(600);
const after = await O.$$eval('#co-list li', xs => xs.map(x => x.className + ' ' + x.querySelector('span').firstChild.textContent)), sum = await txt(O, '#co-sum');
await shot(O, 's2-clinic-ready-offline'); check('with the app saved and the key there: ready', after[0] === 'ok The app is saved on this phone' && after.some(x => x === 'ok This phone holds the clinic key') && sum === 'Ready for offline use ✓', sum + ' · ' + after.join(' | '));
check('…and not installed is a warning, with the reason', after.some(x => x === 'warn Not installed on the home screen'));
await tab(O, 'work'); const wl = await waitText(O, '#w-offline', /^ready for offline ✓$/, 8000);  /* it is worked out again each time the screen opens */ check('the clinic\'s home links to it, with its state', wl === 'ready for offline ✓', wl);
const cached = await O.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const q of await (await caches.open(k)).keys()) out.push(new URL(q.url).pathname.split('/').pop()); return out; });
check('the saved app includes its code, the scanner and the relay code', ['index.js', 'status.js', 'jsqr.min.js', 'relay.js', 'nostr-bundle.js', 'core.js'].every(f => cached.includes(f)), cached.length + ' files');

await b.close(); try { fs.unlinkSync(file); } catch (_) {}
say(bad ? `settings: ${bad} check(s) failed` : 'settings: every check passed'); process.exit(bad ? 1 : 0);
