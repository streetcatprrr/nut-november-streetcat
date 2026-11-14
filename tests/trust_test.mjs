// Who is Streetcat, for the partner and for a volunteer (review of 9 Nov, S1; app/index.html in Chromium, local Nutshell mint with fake
// money, no relay). A request, and a donation handed over in person, name a "Streetcat" key of their own, and anyone can write one. A
// stranger locks ecash of their own to their own key and this clinic's, and makes a request the app's own core.js finds valid; opened by
// link in the Partner's app it says in red that it is not from Streetcat, cannot be confirmed, and nothing is sent back. The same request
// from the pinned Streetcat key can be confirmed. A volunteer's phone refuses the stranger's donation, handed over under a campaign's
// name, and takes the pinned key's. This test pins its own Streetcat key (pin.mjs, by hand); the stranger's is never pinned.
// Not covered here: the same request arriving by relay (index.js clinicCheck drops it before it is kept).
import { chromium } from 'playwright';
import fs from 'fs';
import { pinBrowser, pin } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return cashu.getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const lockFor = (c, refundPk) => new cashu.LockBuilder().addMainPubkey([c.streetcat, c.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(Number(c.deadline));
const locked = async (n, c) => w.ops.receive(await plain(n)).asLocked(lockFor(c, C.pubOf(newSk()))).run();
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), { auto: false });  /* only the key named with pin() */
const page = async role => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); localStorage.setItem('vetlock.role', r); localStorage.setItem('vetlock.anim', 'off'); } catch (_) {} }, role);  /* no relay: nothing here needs one */
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + 'index.html'); return p; };
const txt = async (p, sel) => ((await p.textContent(sel).catch(() => '')) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel); if (re.test(s)) return s; await p.waitForTimeout(150); } return s; };
const open = async (p, link) => { await p.goto(BASE + 'index.html'); await p.goto(link); await p.waitForTimeout(600); };  /* a link opened from outside: the page loads with it */

// the clinic's own key, made in its app; two "Streetcat" keys made here: the test's (pinned) and a stranger's (never pinned)
const clinic = await page('clinic'), clinicPk = await clinic.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', true)));
const good = newSk(), evil = newSk(); pin(C.pubOf(good));
const camp = sk => ({ name: 'TNR NORTE', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sk), clinic: clinicPk, deadline: Math.floor(Date.now() / 1000) + 30 * 86400 });
const request = async sk => { const c = camp(sk); return C.signRequest(await C.makeRequest({ campaign: c, patient: 'MOCHI', procedure: 'sterilisation (spay)', date: new Date().toISOString().slice(0, 10), contributions: [{ proofs: await locked(64, c) }] }), sk); };  /* signed by its sender's key, as the app sends them: one by link or file without it is refused */
const qEvil = await request(evil), qGood = await request(good);
check('the stranger\'s request is one the protocol itself finds valid (core.js): only who it is from is wrong', C.requestProblems(qEvil).length === 0);

// ---------- the Partner's app ----------
await open(clinic, await C.linkFor(BASE + 'index.html?role=clinic', qEvil));
let warn = await waitText(clinic, '#cr-warn', /published key|✗/), from = (await clinic.$$eval('#cr-dl dd, #cr-dl2 dd', ds => ds.map(d => ({ t: d.textContent, bad: d.classList.contains('bad') })))).find(d => /Streetcat/.test(d.t)) || {};
check('a request from another key, opened by link: it says in red that it is not from Streetcat\'s published key', /not from Streetcat's published key: do not confirm it/.test(warn) && await clinic.$eval('#cr-warn', e => e.classList.contains('bad')), warn.split('\n')[0]);
check('…"From" no longer calls that key Streetcat', /^✗ not Streetcat · 0[23][0-9a-f]{8}…$/.test(from.t || '') && from.bad === true, from.t);
check('…its box cannot be ticked, and it cannot be confirmed', await clinic.$eval('#cr-ok', e => e.disabled) && await clinic.$eval('#cr-go', e => e.disabled));
check('…and no "received" goes back to whoever sent it', (await clinic.evaluate(() => window.__vetlock.outbox().length)) === 0);
check('…in the list it is "not valid", in red', await (async () => { await clinic.evaluate(() => window.__vetlock.openTab('work')); await clinic.click('#w-pend'); return /✗ not valid/.test(await waitText(clinic, '#w-list', /MOCHI[\s\S]*→/)); })());  /* the list types itself in at a tap: read once its line is whole (its arrow is the last thing typed), not at the first word (10 Nov: read at "MOCHI ·", it failed one run in two) */
await open(clinic, await C.linkFor(BASE + 'index.html?role=clinic', qGood));
from = (await clinic.$$eval('#cr-dl dd, #cr-dl2 dd', ds => ds.map(d => d.textContent))).find(t => /Streetcat/.test(t)) || '';
const okNow = await (async () => { for (let i = 0; i < 100; i++) { if (!(await clinic.$eval('#cr-ok', e => e.disabled))) return true; await clinic.waitForTimeout(200); } return false; })();  /* once its amounts are checked with the mint */
check('the same request from Streetcat\'s key: "From Streetcat …", and it can be confirmed', /^Streetcat 0[23][0-9a-f]{8}…$/.test(from) && okNow, from + ' · ' + (await txt(clinic, '#cr-warn')).split('\n')[0]);

// ---------- a volunteer's phone ----------
const vol = await page('streetcat'), handover = async sk => { const c = await C.signCampaign(camp(sk), sk); return C.linkFor(BASE + 'index.html?role=streetcat', { t: 'streetcat.handover', v: 1, campaign: { ...C.campSigned(c), sig: c.sig }, token: cashu.getEncodedToken({ mint: MINT, proofs: await locked(21, c), memo: 'TNR NORTE sterilisation' }) }); };
await open(vol, await handover(evil)); let out = await waitText(vol, '#v-out', /accept|Received|Failed/), checks = await txt(vol, '#v-checks');
check('a donation handed over under a campaign\'s name but another key: "Do not accept it", and why', /^Do not accept it\./.test(out) && /not locked with Streetcat's published key/.test(checks) && await vol.$eval('#v-accept', e => e.disabled), out + ' · ' + (checks.match(/it is not locked[^;]*/) || [''])[0]);
await open(vol, await handover(good)); out = await waitText(vol, '#v-out', /accept|Received|Failed/);
check('the same donation under Streetcat\'s key: it can be accepted', /^Received/.test(out) && !(await vol.$eval('#v-accept', e => e.disabled)), out);

await b.close(); say(bad ? `trust: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'trust: every check passed'); process.exit(bad ? 1 : 0);
