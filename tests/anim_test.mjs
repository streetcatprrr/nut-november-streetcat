// Coloured texts move. No mint
// and no relay needed: made-up keys. The keys of the campaign form type themselves in, cursor ahead, and land; drawn again on the
// same screen they do not type again; a tap shuffles them and they land; a red line never moves; what is pasted into a field types
// itself over the field, in its colours, and goes, the field keeping it. With vetlock.anim off (the other suites) nothing moves.
import { chromium } from 'playwright';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), { form: 'short', anim: true });
const page = async (still = false) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }); if (still) await c.addInitScript(() => { try { localStorage.setItem('vetlock.anim', 'off'); } catch (_) {} });
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t);
const keysNow = p => p.$$eval('#k-keys .kk', ks => ks.map(k => ({ text: k.textContent, typing: !!k.closest('[data-typing]') || !!k.querySelector('[data-typing]') || k.hasAttribute('data-typing'), cur: !!k.querySelector('.cur') })));
const until = async (p, fn, arg, ms = 4000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

// a browser with Streetcat's key and the clinic's (made with the texts still, then let move)
const p = await page(); await p.evaluate(() => localStorage.setItem('vetlock.anim', 'off')); await p.reload(); await tab(p, 'csettings'); await p.click('#cs-new'); await p.waitForTimeout(500); await tab(p, 'release'); await p.click('#s-new'); await p.waitForTimeout(500);
const real = await p.evaluate(() => [window.__vetlock.pubOf(window.__vetlock.key('streetcat', false)), window.__vetlock.pubOf(window.__vetlock.key('clinic', false))]);
await p.evaluate(() => localStorage.removeItem('vetlock.anim')); await p.reload(); await tab(p, 'home'); await p.waitForTimeout(300);

// the keys come onto the screen typing themselves in, then land, and the cursor goes
await p.click('#h-new'); await p.waitForTimeout(120); const k0 = await keysNow(p);
check('the keys come onto the screen typing themselves in, cursor ahead', k0.length === 2 && k0.some(k => k.cur || k.typing) && k0.some(k => !real.includes(k.text)), k0.map(k => `${k.text.slice(0, 8)}… ${k.cur ? 'cursor' : ''}`).join(' · '));
const landed = await until(p, r => [...document.querySelectorAll('#k-keys .kk')].map(k => k.textContent).join() === r.join() && !document.querySelector('#k-keys .cur, #k-keys [data-typing]'), real);
check('…and land, whole, and the cursor goes', landed, (await keysNow(p)).map(k => k.text.slice(0, 10)).join(' · '));

// drawn again on the same screen: no typing
await p.fill('#k-name', 'MOCHI'); await p.evaluate(() => { const c = document.getElementById('k-c'); c.dispatchEvent(new Event('input')); }); await p.waitForTimeout(80); const k1 = await keysNow(p);
check('drawn again on the same screen, they do not type again', k1.every(k => !k.cur && !k.typing) && k1.map(k => k.text).join() === real.join());

// a tap shuffles the coloured texts of the screen; they land again
await p.click('#k-more summary'); await p.waitForTimeout(90); const k2 = await keysNow(p);
check('a tap shuffles the keys on the screen', k2.length === 2 && k2.some(k => !real.includes(k.text)) && k2.every(k => /^[0-9a-f]{66}$/.test(k.text)), k2.map(k => k.text.slice(0, 8) + '…').join(' · '));
check('…and they land again', await until(p, r => [...document.querySelectorAll('#k-keys .kk')].map(k => k.textContent).join() === r.join(), real, 3000));

// what is pasted types itself over its field, in its colours, and goes; the field keeps it
await p.evaluate(() => document.getElementById('k-c').scrollIntoView({ block: 'center' })); await p.waitForTimeout(150);  /* the field is lower now (the fold): on screen before pasting, as a user has it; a scroll ends the overlay */
const pasted = await p.evaluate(k => { const f = document.getElementById('k-c'); f.focus(); f.value = k; const dt = new DataTransfer(); dt.setData('text/plain', k); f.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return f.value; }, real[1]);
await p.waitForTimeout(250); const over = await p.evaluate(() => { const o = document.querySelector('.paste-over'); return o ? { cur: !!o.querySelector('.cur'), text: o.textContent, key: (o.querySelector('.key') || { dataset: {} }).dataset.role || '' } : null; });
check('a pasted key types itself over its field, cursor ahead, in the clinic\'s colour', !!over && over.cur && over.text.length < 66 && over.key === 'clinic', over ? `${over.text.length} of 66 · ${over.key}` : 'no overlay');
check('…then goes, and the field keeps it', await until(p, () => !document.querySelector('.paste-over'), null, 4000) && pasted === real[1] && (await p.inputValue('#k-c')) === real[1]);

// a red line never moves: a browser without Streetcat's key
const n = await page(); await tab(n, 'campaign'); await n.waitForTimeout(400); const red0 = await n.textContent('#k-keys');
await n.evaluate(() => { document.getElementById('k-more').open = true; }); await n.fill('#k-name', 'X'); await n.click('#k-c'); await n.waitForTimeout(60); const red1 = await n.textContent('#k-keys'), typingRed = await n.$$eval('#k-keys [data-typing]', e => e.length);
check('a red line never moves', /^✗ This browser does not hold Streetcat's key/.test(red0) && red0 === red1 && !typingRed && await n.$eval('#k-keys', e => e.classList.contains('bad')), red1.slice(0, 60));

// still: with vetlock.anim off nothing types nor shuffles
const s = await page(true); await tab(s, 'csettings'); await s.click('#cs-new'); await s.waitForTimeout(300); await tab(s, 'release'); await s.click('#s-new'); await s.waitForTimeout(300); await s.reload(); await tab(s, 'home');
await s.click('#h-new'); await s.waitForTimeout(60); const sk = await s.$$eval('#k-keys .kk', ks => ks.map(k => ({ t: k.textContent, cur: !!k.querySelector('.cur') })));
check('with vetlock.anim off (the other suites), the keys are just there', sk.length === 2 && sk.every(k => /^[0-9a-f]{66}$/.test(k.t) && !k.cur));

await b.close(); say(bad ? `anim: ${bad} check(s) failed` : 'anim: every check passed'); process.exit(bad ? 1 : 0);
