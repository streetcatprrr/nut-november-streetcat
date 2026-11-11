// The PIN that locks the private keys kept in the browser (app/vault.js, 11 Nov), on the real pages in Chromium. Needs the page
// server only (8080); no mint, no relay. A partner makes its key and sets a PIN: what the browser keeps of the key is sealed, and
// the app reads it as before. A key made afterwards is sealed as it is written. The same tab opened again asks nothing; another
// tab shows "Keys locked" and nothing of the app runs behind it: a wrong PIN is refused in red, the right one starts the app with
// its keys. "private" shows the key on the page after the PIN, never in a browser dialog. A long list of refund keys is sealed
// in pieces and read back whole. Export all still carries the keys in the clear (it is the backup). A change of PIN cut short is
// finished when the page opens again. The PIN removed, the keys are kept as before. A PIN forgotten: the keys can be erased, said
// in red, and nothing else. The status page opens with the keys locked. Not covered: a phone's own storage limits.
import { chromium } from 'playwright';
import { pinBrowser } from './pin.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8080/', say = (...a) => console.log(...a), PIN = '482913';
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})), ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} });
const errors = [], dialogs = [];
const open = async (path = 'index.html') => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + path); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim(), raw = (p, k) => p.evaluate(k => localStorage.getItem(k), k);
const waitText = async (p, s, re, ms = 20000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(100); } return x; };
const isRed = (p, s) => p.evaluate(s => { const e = document.querySelector(s), i = document.createElement('i'); i.style.color = getComputedStyle(document.documentElement).getPropertyValue('--bad').trim(); document.body.appendChild(i); const want = getComputedStyle(i).color; i.remove(); const leaf = [...e.querySelectorAll('*')].find(x => !x.children.length && x.textContent.trim()) || e; return getComputedStyle(leaf).color === want; }, s);
const skOf = p => p.evaluate(() => window.__vetlock.key('clinic', false));

// a partner's key, kept in the clear as before; then a PIN
const p1 = await open(); await tab(p1, 'csettings'); await p1.click('#cs-new'); const sk1 = await skOf(p1), pk1 = await p1.evaluate(sk => window.__vetlock.pubOf(sk), sk1); await p1.waitForTimeout(1500);  /* the new key shuffles in */
check('with no PIN the key is kept as before, and the settings say "PIN for the keys · off"', /^[0-9a-f]{64}$/.test(sk1) && (await raw(p1, 'vetlock.clinic.sk')) === sk1 && (await txt(p1, '#cs-pin-sum')) === 'PIN for the keys · off' && !(await p1.evaluate(() => window.scVault.on())));
await p1.click('#cs-pin-sum'); await p1.fill('#cs-pin-a', '123'); await p1.fill('#cs-pin-b', '123'); await p1.click('#cs-pin-set'); const short = await txt(p1, '#cs-pin-out');
await p1.fill('#cs-pin-a', PIN); await p1.fill('#cs-pin-b', '482914'); await p1.click('#cs-pin-set'); const differ = await txt(p1, '#cs-pin-out');
check('a PIN too short, or not the same twice, is refused in red and nothing is locked', /^✗ A PIN has 6 characters or more/.test(short) && /^✗ The two PINs are not the same/.test(differ) && await isRed(p1, '#cs-pin-out') && (await raw(p1, 'vetlock.clinic.sk')) === sk1, short + ' | ' + differ);
await p1.fill('#cs-pin-b', PIN); await p1.click('#cs-pin-set'); const set = await waitText(p1, '#cs-pin-out', /✓|✗/), sealed = await raw(p1, 'vetlock.clinic.sk'), meta = JSON.parse(await raw(p1, 'vetlock.pin') || 'null');
check('the PIN set: what the browser keeps of the key is sealed, and the PIN itself is nowhere', /^✓ Keys locked/.test(set) && /^pin1:/.test(sealed) && !sealed.includes(sk1) && !!meta && meta.iter === 600000 && !JSON.stringify(await p1.evaluate(() => ({ ...localStorage, ...sessionStorage }))).includes(PIN) && (await raw(p1, 'vetlock.pin.next')) === null, set + ' · ' + sealed.slice(0, 24) + '…');
check('…the app reads it as before, and says "PIN for the keys · on" with "lock now" and "remove PIN"', (await skOf(p1)) === sk1 && (await txt(p1, '#cs-pk')) === pk1 && (await txt(p1, '#cs-pin-sum')) === 'PIN for the keys · on' && await p1.isVisible('#cs-pin-lock') && await p1.isVisible('#cs-pin-off') && !(await p1.isVisible('#cs-pin-set')));
await p1.click('#cs-new'); const sk2 = await skOf(p1), old = await raw(p1, 'vetlock.clinic.old'), kept = await p1.evaluate(() => window.__vetlock.heldKeys('clinic'));
check('a key made with the PIN on is sealed as it is written, and so is the one it replaces', sk2 !== sk1 && /^pin1:/.test(await raw(p1, 'vetlock.clinic.sk')) && /^pin1:/.test(old) && !old.includes(sk1) && kept.join() === [sk2, sk1].join(), kept.map(k => k.slice(0, 8)).join(' '));
// a long value: in pieces, read back whole
const long = await p1.evaluate(() => { const v = JSON.stringify(Array.from({ length: 900 }, (_, i) => ({ pk: '02' + String(i).padStart(64, '0'), sk: String(i).padStart(64, 'a'), campaign: 'GATOS 🐈 ñ ' + i }))), ok = window.scVault.write('vetlock.donor.keys', v), r = localStorage.getItem('vetlock.donor.keys'); return { ok, n: v.length, pieces: r.slice(5).split('.').length, same: window.scVault.read('vetlock.donor.keys') === v, plain: r.includes('GATOS') }; });
check('a long list of refund keys is sealed in pieces and read back whole', long.ok && long.n > 100000 && long.pieces > 5 && long.same && !long.plain, JSON.stringify(long));
await p1.evaluate(() => localStorage.removeItem('vetlock.donor.keys'));

// the same tab again: nothing asked. Another tab: locked
await p1.reload(); await p1.waitForFunction(() => !!window.__vetlock); check('the same tab opened again asks nothing', !(await p1.$('#pin-gate')) && (await skOf(p1)) === sk2 && !errors.length, errors.join(' | '));
const p2 = await open(), gate = await p2.isVisible('#pin-gate'), ran = await p2.evaluate(() => typeof window.__vetlock), said = await txt(p2, '#pin-gate');
check('another tab says "Keys locked", and nothing of the app runs behind it', gate && ran === 'undefined' && /^Keys locked/.test(said) && errors.length === 1 && /locked: the keys wait for the PIN/.test(errors[0]) && (await p2.evaluate(() => window.scVault.read('vetlock.clinic.sk'))) === null && (await p2.evaluate(() => window.scVault.write('vetlock.clinic.sk', 'x'))) === false, said.slice(0, 40) + ' · ' + errors.join(' | '));
await p2.fill('#pin-in', '000000'); await p2.click('#pin-go'); const wrong = await waitText(p2, '#pin-out', /✗/);
check('a wrong PIN is refused in red, and the app stays locked', wrong === '✗ Wrong PIN' && await isRed(p2, '#pin-out') && await p2.isVisible('#pin-gate') && (await p2.evaluate(() => sessionStorage.getItem('vetlock.pin.k'))) === null, wrong);
await p2.fill('#pin-in', PIN); await Promise.all([p2.waitForNavigation(), p2.click('#pin-go')]); await p2.waitForFunction(() => !!window.__vetlock);
check('the right PIN starts the app, with its keys', !(await p2.$('#pin-gate')) && (await skOf(p2)) === sk2 && (await p2.evaluate(() => window.__vetlock.heldKeys('clinic').length)) === 2 && errors.length === 1);

// "private": on the page, after the PIN, never in a dialog
await tab(p2, 'csettings'); const d0 = dialogs.length; await p2.click('#cs-show'); await p2.waitForSelector('#pin-ask'); await p2.fill('#pin-ask-in', '111111'); await p2.click('#pin-ask-go'); const w2 = await waitText(p2, '#pin-ask-out', /✗/), shownEarly = !!(await p2.$('#pin-reveal'));
await p2.fill('#pin-ask-in', PIN); await p2.click('#pin-ask-go'); await p2.waitForSelector('#pin-reveal-key'); const shown = await txt(p2, '#pin-reveal-key'); await p2.click('#pin-reveal-close');
check('"private" asks the PIN again, shows the key on the page and never in a browser dialog', w2 === '✗ Wrong PIN' && !shownEarly && shown === sk2 && dialogs.length === d0 && !(await p2.$('#pin-reveal')), `${dialogs.length - d0} dialogs`);
await p2.click('#cs-show'); await p2.waitForSelector('#pin-ask'); await p2.click('#pin-ask-no'); await p2.waitForTimeout(200);
check('…and walked away from, shows nothing', !(await p2.$('#pin-ask')) && !(await p2.$('#pin-reveal')));
// Export all is the backup: the keys in the clear, as before
await p2.evaluate(() => { window.__vetlock.setRole('clinic'); document.querySelector('nav button[data-t="keys"]').click(); }); await p2.waitForTimeout(300); await p2.click('#x-exp'); await p2.waitForFunction(() => document.getElementById('x-box').value.length > 10, null, { timeout: 15000 }).catch(() => {});
const exp = await p2.evaluate(() => { try { return JSON.parse(document.getElementById('x-box').value); } catch (_) { return null; } });
check('Export all carries the keys in the clear, as before (it is the backup), and nothing of the PIN', !!exp && exp.clinic === sk2 && (exp.clinicOld || []).join() === sk1 && !JSON.stringify(exp).includes('pin1:') && !JSON.stringify(exp).includes('vetlock.pin'), exp ? Object.keys(exp).join(',') : 'no export');
check('…and Keys shows the same PIN panel', (await txt(p2, '#x-pin-sum')) === 'PIN for the keys · on');

// the status page, in a tab where the PIN was not given
const p3 = await open('status.html'); await p3.waitForTimeout(800); check('the status page opens with the keys locked, and reads none', errors.length === 1 && (await p3.evaluate(() => window.scVault.locked() && window.scVault.read('vetlock.clinic.sk') === null)), errors.slice(1).join(' | ')); await p3.close();

// a change cut short: written down whole, finished when the page opens again
const state = await p2.evaluate(() => { const S = window.scVault.SLOTS, slots = {}; for (const k of S) { const v = localStorage.getItem(k); if (v != null) slots[k] = v; } return { meta: JSON.parse(localStorage.getItem('vetlock.pin')), slots }; });
await p2.evaluate(({ state, sk2, sk1 }) => { localStorage.setItem('vetlock.pin.next', JSON.stringify(state)); localStorage.removeItem('vetlock.pin'); localStorage.setItem('vetlock.clinic.sk', sk2); localStorage.setItem('vetlock.clinic.old', JSON.stringify([sk1])); }, { state, sk2, sk1 });
await p2.reload(); await p2.waitForFunction(() => !!window.__vetlock);
check('a change of PIN cut short (the keys still in the clear, the PIN not yet written) is finished as the page opens', (await raw(p2, 'vetlock.pin.next')) === null && /^pin1:/.test(await raw(p2, 'vetlock.clinic.sk')) && /^pin1:/.test(await raw(p2, 'vetlock.clinic.old')) && !!(await raw(p2, 'vetlock.pin')) && (await skOf(p2)) === sk2);

// the PIN removed: as before
await tab(p2, 'csettings'); await p2.click('#cs-pin-sum'); await p2.click('#cs-pin-off'); await p2.waitForSelector('#pin-ask'); await p2.fill('#pin-ask-in', PIN); await p2.click('#pin-ask-go'); const off = await waitText(p2, '#cs-pin-out', /removed|✗/);
check('the PIN removed after asking for it: the keys are kept in the clear as before', /^PIN removed/.test(off) && (await raw(p2, 'vetlock.clinic.sk')) === sk2 && (await raw(p2, 'vetlock.clinic.old')) === JSON.stringify([sk1]) && (await raw(p2, 'vetlock.pin')) === null && (await txt(p2, '#cs-pin-sum')) === 'PIN for the keys · off' && (await skOf(p2)) === sk2, off);

// a PIN forgotten
await p2.fill('#cs-pin-a', PIN); await p2.fill('#cs-pin-b', PIN); await p2.click('#cs-pin-set'); await waitText(p2, '#cs-pin-out', /✓|✗/); await p2.click('#cs-pin-lock'); await p2.waitForSelector('#pin-gate');
check('"lock now" locks this tab too', await p2.isVisible('#pin-gate') && (await p2.evaluate(() => typeof window.__vetlock)) === 'undefined');
const d1 = dialogs.length; await p2.click('#pin-lost'); const lost = await txt(p2, '#pin-out'), lostRed = await isRed(p2, '#pin-out'); await Promise.all([p2.waitForNavigation(), p2.click('#pin-erase')]); await p2.waitForFunction(() => !!window.__vetlock);
check('a PIN forgotten: said in red that the keys cannot be read; erased only after being asked, and the app starts with none', /^✗ Without the PIN the keys here cannot be read/.test(lost) && lostRed && dialogs.length === d1 + 1 && /Erase the keys in this browser\?/.test(dialogs[d1]) && (await skOf(p2)) === null && (await raw(p2, 'vetlock.pin')) === null && (await raw(p2, 'vetlock.clinic.old')) === null, lost);
say(bad ? `pin: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'pin: every check passed'); await b.close(); process.exit(bad ? 1 : 0);
