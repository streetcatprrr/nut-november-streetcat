// Regression tests for the independent audit of 5 Nov (refund-v1 at c165a23; its scripts in nn-audit/audit/, each printing ATTACK WORKED
// or FAILED). Every attack it reproduced must now fail, against the local mint and the app on 8080, with keys made here:
// a01 (funds): a link signed with an attacker's own keys showed "✓ signed by Streetcat", and the attacker, holding both keys of the 2-of-2,
//   could spend the donation before the deadline. Now the donor's page refuses it in red, by every route, before any call to the mint,
//   and the status page flags its ledger in red.
// a07 b (integrity): the status page never checked a ledger campaign's signature. Now: a red line for a broken signature, an unsigned
//   campaign or a key that is not Streetcat's published one; "✓ campaign signed by Streetcat" otherwise.
// a09 (integrity): a split donation released whole was invisible on the status page when its ledger entry left out its parts. Now every
//   sat the mint shows as released must be covered by the clinic's signed declaration for it, or it is flagged in red.
// F5 (robustness): the clinic's paste-certify path signed without core.js lockProblem, and the lock parsers accepted SIG_ALL and more
//   than one refund signature. Now the clinic will not sign such a token, and the status page does not count it.
import { chromium } from 'playwright';
import fs from 'fs';
import { pinBrowser, pin } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey()), total = ps => ps.reduce((s, p) => s + C.amt(p.amount), 0), now = () => Math.floor(Date.now() / 1000);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const mintPlain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const plain = async n => cashu.getEncodedToken({ mint: MINT, proofs: await mintPlain(n) });
const locked = async (n, lock) => w.ops.receive(await plain(n)).asLocked(lock).run(), tokOf = ps => cashu.getEncodedToken({ mint: MINT, proofs: ps });
const lockFor = (c, refundPk) => new cashu.LockBuilder().addMainPubkey([c.streetcat, c.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(Number(c.deadline));
const b64u = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), { auto: false });  /* only the keys named with pin(): an attacker's key is never pinned */
const page = async (path = 'index.html') => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Madrid' }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await c.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} }); const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept());
  p._calls = []; p.on('request', r => { if (r.url().startsWith(MINT)) p._calls.push(new URL(r.url()).pathname); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + path); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(200); } return s; };
const isRed = (p, sel, re) => p.evaluate(([sel, src]) => { const probe = document.body.appendChild(document.createElement('i')); probe.style.color = 'var(--bad)'; const want = getComputedStyle(probe).color; probe.remove(); const re = new RegExp(src);
  const hits = [...document.querySelectorAll(sel + ', ' + sel + ' *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && re.test(n.nodeValue))); return hits.length > 0 && hits.every(e => getComputedStyle(e).color === want); }, [sel, re.source]);

// ---------- a01: a link signed with the attacker's own keys ----------
const atkSc = newSk(), atkCl = newSk(), fake = await C.signCampaign({ name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(atkSc), clinic: C.pubOf(atkCl), deadline: now() + 30 * 86400 }, atkSc);
check('a01: (the attacker\'s link carries a valid signature, made with the attacker\'s own key)', await C.campaignSig(fake) === 'signed');
const donor = await page(); await donor.goto(BASE + 'index.html#c=' + b64u(fake)); await donor.reload();
const info = await waitText(donor, '#d-campinfo', /published key|signed by|not signed/); await donor.waitForTimeout(2500);
check('a01: the donor\'s page says in red that it is not from Streetcat\'s published key, never "signed by Streetcat", and greys out paying',
  /This link is not from Streetcat's published key\. Do not donate through it\./.test(await txt(donor, '#d-campinfo')) && !/signed by Streetcat/.test(await txt(donor, '#d-campinfo')) && await isRed(donor, '#d-campinfo', /not from Streetcat's published key/) && await donor.evaluate(() => document.getElementById('donate').classList.contains('sigbad')), info.split('\n').pop());
donor._calls.length = 0; const tok = await plain(2100);
const viaLink = await donor.evaluate(() => { const a = document.getElementById('d-toecash'), cs = getComputedStyle(a), grey = Number(cs.opacity) < .5 && cs.pointerEvents === 'none'; a.click(); return grey && !document.getElementById('decash').classList.contains('on'); });  /* "Pay with ecash" is greyed out and does not open */
await donor.fill('#d-amt', '2100'); await donor.evaluate(() => document.getElementById('d-ln').click()); await donor.waitForTimeout(1200); const viaLn = await txt(donor, '#d-out');
await donor.evaluate(() => window.__vetlock.openTab('decash')); const viaWallet = await waitText(donor, '#dw-state', /Failed|Not possible|waiting/, 10000);  /* the ecash screen opened anyway: its payment request is refused */
await donor.fill('#d-token', tok); await donor.evaluate(() => document.getElementById('d-go').click()); const viaEcash = await waitText(donor, '#de-out', /LOCKED|Failed|Not possible/);  /* and so is ecash pasted there */
check('a01: …and it locks nothing by any route (ecash, Lightning, a Cashu wallet): no call to the mint at all', viaLink && /^Failed: This link is not from Streetcat's published key/.test(viaEcash) && /published key/.test(viaLn) && /published key/.test(viaWallet) && donor._calls.length === 0, `${donor._calls.length} mint calls`);
check('a01: (the attacker\'s plain ecash was never swapped: the mint says it is unspent)', (await w.checkProofsStates(w.decodeToken(tok).proofs)).every(s => s.state === 'UNSPENT'));

// ---------- a07 b: the status page checks the ledger's campaign ----------
const viewer = await page('status.html'); await viewer.waitForFunction(() => !!(window.scCore && document.getElementById('l-src')));
const status = async L => { await viewer.evaluate(() => { document.getElementById('l-out').textContent = ''; }); await viewer.evaluate(l => { const ta = document.getElementById('l-src'); ta.value = JSON.stringify(l); ta.dispatchEvent(new Event('input', { bubbles: true })); }, L);
  await waitText(viewer, '#l-out', /Checked|Failed/, 40000); await viewer.waitForTimeout(900); return { out: await txt(viewer, '#c-trust'), shown: await viewer.isVisible('#c-trust'), list: await txt(viewer, '#list').catch(() => ''), note: await txt(viewer, '#tot-note').catch(() => '') }; };  /* the campaign's line stays in view under it */
const sc = newSk(), cl = newSk(); await pin(C.pubOf(sc));  /* this test's Streetcat key, pinned next to the published one */
const camp = await C.signCampaign({ name: 'TEO', op: 'castration', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline: now() + 30 * 86400 }, sc), { sig, ...unsignedCamp } = camp;
const ledger = (c, entries = [], certificates = []) => ({ v: 2, campaign: c, clinicKeySource: '', published: new Date().toISOString(), donations: entries.flatMap(e => [e.token, ...(e.remainders || [])]), entries, certificates });
let s = await status(ledger(fake)); check('a07b / a01: a ledger whose campaign is not from Streetcat\'s published key gets a red warning', /✗ This campaign is not from Streetcat's published key\. Do not trust its ledger\./.test(s.out) && s.shown && await isRed(viewer, '#c-trust', /not from Streetcat's published key/), s.out.split('\n').pop());
s = await status(ledger({ ...camp, clinic: C.pubOf(newSk()) })); check('a07b: a ledger whose campaign signature is broken gets a red warning', /✗ The campaign's signature does not match/.test(s.out) && s.shown && await isRed(viewer, '#c-trust', /signature does not match/), s.out.split('\n').pop());
s = await status(ledger(unsignedCamp)); check('a07b: a ledger whose campaign is not signed gets a red warning', /This campaign is not signed: trust this ledger only if it came from Streetcat itself\./.test(s.out) && s.shown && await isRed(viewer, '#c-trust', /This campaign is not signed/), s.out.split('\n').pop());
s = await status(ledger(camp)); check('a07b: a ledger whose campaign Streetcat\'s published key signed says so, and no warning', /✓ campaign signed by Streetcat/.test(s.out) && s.shown && !/✗|not signed/.test(s.out), s.out.split('\n').pop());
check('the status page says what comes from the mint, and what relies on Streetcat\'s ledger', /Every state comes from the mint, not from Streetcat; what the sats paid for comes from Streetcat's ledger, and counts only where the clinic signed it\./.test(s.out));

// ---------- a09: a donation released whole, beyond what the clinic declared ----------
const divert = async n => { const ps = await locked(n, lockFor(camp, C.pubOf(newSk()))), got = await w.ops.receive(cashu.signP2PKProofs(cashu.signP2PKProofs(ps, cl), sc)).run(); return { ps, got }; };  /* released whole: both signatures, nothing put back */
const entryOf = async (ps, parts = []) => ({ ref: await C.donRef(ps.map(p => C.yOf(p.secret))), amount: total(ps), date: '2026-11-04', token: tokOf(ps), parts, remainders: [] });
const certOf = async (ps, release) => { const q = await C.makeRequest({ campaign: camp, patient: 'TEO', procedure: 'castration', date: '2026-11-04', contributions: [{ release, proofs: ps }] }), a = await C.certify(q, cl); return { cert: { statement: a.statement, sig: a.sig }, request: q.id }; };
const D = await divert(2100), nD = total(D.ps), E = await entryOf(D.ps);
s = await status(ledger(camp, [E])); check('a09 (B): released whole with no parts in the ledger: flagged in red, not "2100 sat RELEASED" alone', new RegExp(`✗ the mint shows ${nD} sat released from it, but the ledger has no declaration by the clinic for it: ${nD} sat not accounted for`).test(s.list) && await isRed(viewer, '#list', /not accounted for/) && new RegExp(`${nD} sat released without the clinic's declaration for it`).test(s.note), s.list.split('\n').find(x => /✗/.test(x)) || s.list.slice(0, 80));
const part = { request: 'R-1', patient: 'TEO', procedure: 'castration', date: '2026-11-04', amount: 1500 };
s = await status(ledger(camp, [await entryOf(D.ps, [part])])); check('a09 (A): with parts of 1 500 sat but no declaration by the clinic: flagged in red', new RegExp(`✗ the mint shows ${nD} sat released from it, but the ledger's 1500 sat for procedures carry no declaration signed by the clinic`).test(s.list) && await isRed(viewer, '#list', /carry no declaration/), s.list.split('\n').find(x => /✗/.test(x)) || '');
const k1 = await certOf(D.ps, 1500); s = await status(ledger(camp, [await entryOf(D.ps, [{ ...part, request: k1.request }])], [k1.cert]));
check('a09 (C): the clinic declared 1 500 sat, the mint shows it all released: flagged in red, with what is not accounted for', new RegExp(`✗ the mint shows ${nD} sat released from it, but the clinic declared 1500 sat of it: ${nD - 1500} sat not accounted for`).test(s.list), s.list.split('\n').find(x => /✗/.test(x)) || '');
const F = await divert(800), nF = total(F.ps), k2 = await certOf(F.ps, nF); s = await status(ledger(camp, [await entryOf(F.ps, [{ ...part, amount: nF, request: k2.request }])], [k2.cert]));
check('a09 (D): a release the clinic declared in full: not flagged', /RELEASED/.test(s.list) && !/✗/.test(s.list) && !/without the clinic's declaration/.test(s.note), s.list.slice(0, 80));

// ---------- F5: locks with unusual rules ----------
const clinic = await page(); await tab(clinic, 'certify'); await clinic.click('#c-new'); await clinic.waitForTimeout(900); const clinicPk = await txt(clinic, '#c-pk'), scF = newSk(), d = now() + 30 * 86400;
const base = () => new cashu.LockBuilder().addMainPubkey([C.pubOf(scF), clinicPk]).requireMainSignatures(2).lockUntil(d);
const certifyTry = async t => { await clinic.fill('#c-token', ''); await clinic.fill('#c-token', t); const i = await waitText(clinic, '#c-info', /names|cannot|✗/, 15000); await clinic.evaluate(() => { document.getElementById('c-out').textContent = ''; }); await clinic.click('#c-go'); return { info: i, out: await waitText(clinic, '#c-out', /CERTIFIED|Failed|Not possible/, 15000) }; };
const sigAll = tokOf(await locked(21, base().addRefundPubkey(C.pubOf(newSk())).sigAll()));
let r = await certifyTry(sigAll); check('F5: a token locked with SIG_ALL: unreadable as a donation, and the clinic does not sign it', /cannot read token: its lock has an unusual signature rule \(SIG_ALL\)/.test(r.info) && /^Failed: its lock has an unusual signature rule/.test(r.out) && !/CERTIFIED/.test(r.out), r.out.slice(0, 90));
r = await certifyTry(tokOf(await locked(13, base().addRefundPubkey([C.pubOf(newSk()), C.pubOf(newSk())]).requireRefundSignatures(2))));
check('F5: a token whose refund needs two signatures: refused the same way', /unusual refund rule/.test(r.info) && /^Failed: its lock has an unusual refund rule/.test(r.out), r.out.slice(0, 90));
r = await certifyTry(tokOf(await locked(8, base()))); check('F5: a token with no refund key: the paste path runs lockProblem and does not sign it', /^Failed: this token's lock is not a donation's lock \(no refund key: anyone could take it after the deadline\): it was not signed/.test(r.out), r.out.slice(0, 120));
const campF = { name: 'F5', op: 'test', mint: MINT, streetcat: C.pubOf(scF), clinic: clinicPk, deadline: d }; await pin(campF.streetcat); s = await status(ledger(campF, [{ ref: 'DON-00000000', amount: 21, date: '2026-11-04', token: sigAll, parts: [], remainders: [] }]));
check('F5: the status page does not count a SIG_ALL lock either', /NOT COUNTED/.test(s.list) && /lock: unusual signature rule/.test(s.list), (s.list.match(/lock: [^\n]*/) || [''])[0]);

await b.close(); say(bad ? `audit: ${bad} check(s) failed` : 'audit: every check passed'); process.exit(bad ? 1 : 0);
