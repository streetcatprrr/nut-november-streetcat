// The partner's screen for a request whose amounts do not check against the mint's keys (review of 9 Nov, A04; the check itself is in
// amount_test). By link, in the partner's app: a request that says a 1 024-sat proof is worth 64 is shown with why, in red, marked
// "not valid" in the list, its box cannot be ticked, and "Confirm" refuses it even if the box is forced; one made by an older app (no
// DLEQ proof) is refused the same way; an honest one is checked and can be confirmed. Against the local mint, with fake money.
import { chromium } from 'playwright';
import fs from 'fs';
import { pinBrowser, pin } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a), SHOT = process.env.SHOT_DIR;
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey()), now = () => Math.floor(Date.now() / 1000);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 });
const shot = async name => { if (SHOT) { await clinic.waitForTimeout(1200); await clinic.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };  /* SHOT_DIR=dir: the screens at 390 px @2x */ await ctx.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} });
const clinic = await ctx.newPage(); clinic.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); clinic.on('dialog', d => d.accept()); await clinic.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
await clinic.goto(BASE + 'index.html'); const tab = t => clinic.evaluate(t => window.__vetlock.openTab(t), t), txt = async sel => ((await clinic.textContent(sel)) || '').trim();
const waitText = async (sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(sel).catch(() => ''); if (re.test(s)) return s; await clinic.waitForTimeout(200); } return s; };
await tab('certify'); await clinic.click('#c-new'); await clinic.waitForTimeout(1200); const clinicPk = await txt('#c-pk');

// a campaign signed by Streetcat (a key of this test, pinned next to the published one), and a donation of 1 024 sat in one proof
const sc = newSk(), camp = await C.signCampaign({ name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: clinicPk, deadline: now() + 30 * 86400 }, sc); await pin(camp.streetcat);
const lock = new cashu.LockBuilder().addMainPubkey([camp.streetcat, camp.clinic]).requireMainSignatures(2).addRefundPubkey(C.pubOf(newSk())).lockUntil(Number(camp.deadline));
const A = await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: await plain(MINT.endsWith('3339') ? 1025 : 1024) })).asLocked(lock).run();  /* the fee mint takes 1 sat for the lock */
const made = () => C.makeRequest({ campaign: camp, patient: 'MOCHI', procedure: 'sterilisation', date: '2026-11-09', contributions: [{ release: 1024, proofs: A }] });
const honest = await made(), lie = await made(), old = await made();
lie.contributions[0].proofs[0].amount = 64; lie.contributions[0].release = 64;  /* a changed Rescue app: the same proof, said to be 64 */
for (const p of old.contributions[0].proofs) { delete p.C; delete p.dleq; }  /* what an older app sent */
const open = async q => { await clinic.goto(BASE + 'index.html?role=clinic#q=' + await C.pack(await C.signRequest(q, sc)));  /* by link a request is Streetcat's only if it signed it */ await waitText('#cr-dl', /MOCHI/);
  for (let i = 0; i < 75; i++) { const done = await clinic.evaluate(id => { const r = JSON.parse(localStorage.getItem('vetlock.clinic.requests') || '[]').find(x => x.id === id) || {}; return !!r.amounts || !!(r.problems || []).length; }, q.id); if (done) break; await clinic.waitForTimeout(200); }  /* its amounts are checked apart */
  await clinic.waitForTimeout(400);
  return clinic.evaluate(id => { const e = document.getElementById('cr-warn'), r = JSON.parse(localStorage.getItem('vetlock.clinic.requests') || '[]').find(x => x.id === id) || {};
    return { warn: e.textContent, red: e.classList.contains('bad') || !!e.querySelector('.bad'), box: !document.getElementById('cr-ok').disabled, amounts: r.amounts || null, state: r.state }; }, q.id); };

const L = await open(lie);
check('a request that says a 1 024-sat proof is worth 64: the partner sees why, in red', /^✗ DON-[0-9A-F]+: an amount is false\. Report a problem\.$/m.test(L.warn) && L.red && L.amounts && L.amounts.wrong === 1, L.warn.slice(0, 140));
check('…its box cannot be ticked', !L.box); await shot('a1-partner-amount-lie');
await clinic.evaluate(() => { const b = document.getElementById('cr-ok'); b.disabled = false; b.checked = true; document.getElementById('cr-go').disabled = false; });  /* forced, as a changed page would */
await clinic.click('#cr-go'); const out = await waitText('#cr-out', /cannot be confirmed|CONFIRMED/);
const after = await clinic.evaluate(id => (JSON.parse(localStorage.getItem('vetlock.clinic.requests') || '[]').find(x => x.id === id) || {}).state, lie.id);
check('…and "Confirm" refuses it even with the box forced: nothing is signed', /^Not possible: this request cannot be confirmed: DON-[0-9A-F]+: an amount is false\. Report a problem\./.test(out) && after === 'review', out.slice(0, 120)); await shot('a2-partner-amount-forced');
await tab('work'); await clinic.waitForTimeout(300); if (await clinic.$eval('#w-list', e => e.hidden)) await clinic.click('#w-pend'); await clinic.waitForTimeout(300);  /* Partner's home: a tap on "pending" shows them */
await clinic.waitForFunction(() => document.querySelector('#w-list .item') && !document.querySelector('#w-list [data-typing]'), null, { timeout: 15000 }).catch(() => {});  /* typed in: read once it is written, not while it types (slow under load) */
const row = await clinic.evaluate(id => { const it = [...document.querySelectorAll('#w-list .item')].find(x => x.textContent.includes(id)); return it ? it.textContent : ''; }, lie.id);
check('…and the list marks it "not valid"', /✗ not valid/.test(row), row.slice(0, 120));
const mark = await clinic.evaluate(id => { const it = [...document.querySelectorAll('#w-list .item')].find(x => x.textContent.includes(id)), b = it && it.querySelector('.sub2 .bad'), p = document.createElement('span');
  p.style.color = 'var(--bad)'; document.body.appendChild(p); const want = getComputedStyle(p).color; p.remove(); return { text: b ? b.textContent : '', color: b ? getComputedStyle(b).color : '', want }; }, lie.id);
check('…in red, as every warning, once the list is typed in (it was typed back in grey)', mark.text === '✗ not valid' && mark.color === mark.want, JSON.stringify(mark)); await shot('a3-partner-list-not-valid');

const O = await open(old);
check('a request made by an older app (no DLEQ proof): refused in red, its amounts cannot be checked', /^✗ DON-[0-9A-F]+: amounts can't be checked\. Report a problem\.$/m.test(O.warn) && O.red && !O.box, O.warn.slice(0, 140)); await shot('a4-partner-older-request');

const H = await open(honest);
check('an honest request: every amount checks against the mint\'s keys, nothing in red about it, and its box can be ticked', H.amounts && !H.amounts.problems.length && !/is false|amounts are false|can't be checked|not checked yet/.test(H.warn) && H.box, H.warn.slice(0, 120) || 'no warning');
await clinic.check('#cr-ok'); await clinic.click('#cr-go'); const conf = await waitText('#cr-out', /CONFIRMED|Not possible|Failed/);
check('…and it is confirmed', /CONFIRMED/.test(conf), conf.split('\n')[0]);

await b.close(); say(bad ? `amountui: ${bad} check(s) failed` : 'amountui: every check passed'); process.exit(bad ? 1 : 0);
