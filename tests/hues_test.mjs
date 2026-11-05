// The colours of TnR and Tnr2 (no mint needed). Both were made before links carried their colour, so each browser used to give them the
// first free one: StreetCat's Safari showed Tnr2 in cyan, but he chose yellow for it. Now a fixed table gives TnR 345 (pink) and Tnr2 100
// (yellow), keyed by name and deadline (5 Nov 2026 23:59:59 UTC, 1793923199, as in campaigns/tnr2.json), on both pages: in a fresh
// browser, and in one whose colour registry already holds other colours for them. No other campaign is ever given 345 or 100, unless
// its own signed link carries it.
import { chromium } from 'playwright';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const SC = '0294637dacb6799343eacb4654700ad781694838b8b6db80551d17af001b194121', CL = '021c817eb6c0870959e902e3ce5eecce57460e8d48218a509f7febf4050794796e', D = 1793923199;
const TNR = { name: 'TnR', op: 'sterilisation', mint: 'https://mint.minibits.cash/Bitcoin', streetcat: SC, clinic: CL, deadline: D }, TNR2 = { ...TNR, name: 'Tnr2' };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async (path, registry) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); if (r) localStorage.setItem('vetlock.campcolors', JSON.stringify(r)); } catch (_) {} }, registry || null);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + path); return p; };
const hues = p => p.evaluate(([a, b]) => [window.__vetlock.campHue(a), window.__vetlock.campHue(b)], [TNR, TNR2]);
// the status page: the campaign's colour, from a ledger with no donations (nothing is asked of the mint)
const statusHue = async (registry, c) => { const p = await page('status.html', registry); await p.waitForFunction(() => !!(window.scCore && document.getElementById('l-src')));
  await p.evaluate(l => { const ta = document.getElementById('l-src'); ta.value = JSON.stringify(l); ta.dispatchEvent(new Event('input', { bubbles: true })); }, { campaign: c, donations: [] });
  await p.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 20000 }); const h = await p.evaluate(() => getComputedStyle(document.body).getPropertyValue('--ch').trim()); await p.context().close(); return Number(h); };

const fresh = await page('index.html'); let [a, t2] = await hues(fresh);
check('a fresh browser: TnR is pink (345) and Tnr2 yellow (100)', a === 345 && t2 === 100, `${a} · ${t2}`);
const wrong = { 'tnr2|1793923199': { h: 200, own: false }, 'tnr|1793923199': { h: 295, own: true }, 'mochi|1800000000': { h: 100, own: false } };  /* Tnr2 cyan, as in StreetCat's Safari */
const old = await page('index.html', wrong); [a, t2] = await hues(old);
const mochi = await old.evaluate(() => window.__vetlock.campHue({ name: 'MOCHI', deadline: 1800000000 }));
check('a browser whose registry held other colours for them: TnR pink, Tnr2 yellow again, and a campaign that had yellow gives way', a === 345 && t2 === 100 && mochi !== 100 && mochi !== 345, `${a} · ${t2} · MOCHI ${mochi}`);
check('the status page: Tnr2 yellow and TnR pink, fresh and with the old registry', await statusHue(null, TNR2) === 100 && await statusHue(null, TNR) === 345 && await statusHue(wrong, TNR2) === 100 && await statusHue(wrong, TNR) === 345);
check('Tnr2 as its ledger file carries it (hue 100) is yellow too', await statusHue(wrong, { ...TNR2, hue: 100 }) === 100);
// new campaigns: never 345 or 100, however many there are
const many = await page('index.html'); const got = await many.evaluate(() => { const out = []; for (let i = 0; i < 20; i++) { const h = window.__vetlock.newCampHue(); out.push(h); window.__vetlock.campHue({ name: 'C' + i, deadline: 1800000000 + i, hue: h }); } return out; });
const unsigned = await many.evaluate(() => Array.from({ length: 12 }, (_, i) => window.__vetlock.campHue({ name: 'U' + i, deadline: 1810000000 + i })));
check('a new campaign never gets 345 or 100 (20 made in one browser), nor does one without its own colour', !got.some(h => h === 345 || h === 100) && !unsigned.some(h => h === 345 || h === 100), got.join(',') + ' / ' + unsigned.join(','));
check('the status page never gives 345 or 100 to a campaign without its own colour', ![await statusHue(null, { ...TNR, name: 'Other' }), await statusHue(wrong, { ...TNR, name: 'Other 2' })].some(h => h === 345 || h === 100));
const own = await many.evaluate(() => window.__vetlock.campHue({ name: 'Tnr', deadline: 1794009599, hue: 345 }));
check('a campaign whose own signed link carries 345 keeps it (today\'s test "Tnr"): the colour is its own', own === 345);

await b.close(); say(bad ? `hues: ${bad} check(s) failed` : 'hues: every check passed'); process.exit(bad ? 1 : 0);
