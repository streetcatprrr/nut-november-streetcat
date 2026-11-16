// Each proof counts once (group 6 of the six scans, 14–15 Nov: 2.7, 3.5, 4.12, 5.28, 6.1, 6.12), in Chromium and in Node against the
// local mint (3338, fake money). What was found: a proof given twice in a list was traced and added up twice (core.js, the status
// page, the volunteer's receipt), and two donation tokens that share proofs (P; then P and Q) were two donations in Rescue's ledger,
// what they share counted twice in what was given and what there is to spend. Checked now: the traces take each proof once; the
// status page counts a proof repeated inside one token once; the volunteer's screen refuses a donation that holds the same ecash
// twice; and Rescue's ledger takes, of a token that shares proofs with one it holds, only the proofs it does not hold yet.
// On the pages of before, three of the five fail (the trace is tried in Node, on this core.js; "again change nothing" held). Not covered: entries that overlap brought in by Import all from a copy made before.
import { chromium } from 'playwright';
import fs from 'fs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, amt = C.amt, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey()), sum = ps => ps.reduce((a, p) => a + amt(p.amount), 0);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async ({ init, arg, path = 'index.html' } = {}) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(() => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} }); if (init) await c.addInitScript(init, arg);
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + path); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const withKey = (slot, sk) => ({ init: ([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch (_) {} }, arg: [slot, sk] });
const sc = newSk(), cl = newSk(); await b.pin(C.pubOf(sc));
const deadline = Math.floor(Date.now() / 1000) + 30 * 86400, camp = await C.signCampaign({ name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline }, sc);
const lockOf = refundPk => new cashu.LockBuilder().addMainPubkey([camp.streetcat, camp.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(deadline);
const donated = async n => w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: await plain(n) })).asLocked(lockOf(C.pubOf(newSk()))).run();
const tok = ps => cashu.getEncodedToken({ mint: MINT, proofs: ps.map(p => ({ ...p, amount: amt(p.amount) })), memo: 'MOCHI sterilisation' });

// 2.7 · the traces, in Node
{ const d = await donated(13), twice = [...d, d[0]], t = await C.traceDonation(w, twice), dt = await C.destTrace(w, twice);
  check('a list that gives a proof twice is traced once for each proof, and its total counts it once', t.filter(x => x.depth === 0).length === d.length && dt.total === 13 && dt.trace.length === d.length, `${t.filter(x => x.depth === 0).length} rows for ${d.length} proofs · total ${dt.total}`); }

// 3.5, 4.12, 6.12 · Rescue's ledger: a token that shares proofs with one it holds
{ const s = await page(withKey('vetlock.streetcat.sk', sc)); await tab(s, 'release'); const d = await donated(13), first = [d[0]], P = amt(d[0].amount);
  const paste = async t => { await s.fill('#s-token', ''); await s.fill('#s-token', t); await waitText(s, '#s-info', /locked|sat/, 20000); await s.waitForTimeout(1200); };
  const led = () => s.evaluate(async () => Object.values(await window.__vetlock.ledgerAll()).flatMap(L => Object.values(L.entries || {})).map(e => ({ amount: e.amount, token: e.token })));
  await paste(tok(first)); const one = await led(); await paste(tok(d)); const two = await led(); await paste(tok(first)); await paste(tok(d)); const three = await led();
  const ys = two.flatMap(e => w.decodeToken(e.token).proofs.map(p => p.secret));
  check('a donation token that holds proofs of one already in the ledger adds only the proofs the ledger does not hold: nothing is counted twice', one.length === 1 && one[0].amount === P && two.length === 2 && two.reduce((a, e) => a + e.amount, 0) === 13 && new Set(ys).size === ys.length && ys.length === d.length, `${one.map(e => e.amount).join()} → ${two.map(e => e.amount).join(' + ')} sat of 13`);
  check('…and the same tokens again change nothing', JSON.stringify(three) === JSON.stringify(two), `${three.length} entries`);
  await s.context().close(); }

// 6.1 · the volunteer: a donation that holds the same ecash twice
{ const v = await page({ path: 'index.html?role=streetcat' }), d = await donated(21);
  const link = await C.linkFor(BASE + 'index.html?role=streetcat', { t: 'streetcat.handover', v: 1, campaign: C.campaignOf(camp), token: tok([...d, d[0]]) });
  const res = await v.evaluate(t => window.__vetlock.openPayload(t, 'link').then(() => 'ok', e => '✗ ' + (e.message || e)), link.slice(link.indexOf('#'))); await v.waitForTimeout(800);
  const out = await txt(v, '#v-out').catch(() => ''), off = await v.$eval('#v-accept', e => e.disabled || !e.getClientRects().length).catch(() => true);
  check('the volunteer\'s screen does not take a donation that holds the same ecash twice, and says so', /the same ecash is in this donation twice/.test(res + ' ' + out) && off, (res + ' | ' + out).slice(0, 140));
  await v.context().close(); }

// 5.28 · the status page: a proof repeated inside one token
{ const viewer = await page({ path: 'status.html' }); await viewer.waitForFunction(() => !!(window.scCore && document.getElementById('l-src'))); const d = await donated(21);
  const status = async L => { await viewer.evaluate(() => { document.getElementById('l-out').textContent = ''; }); await viewer.evaluate(l => { const ta = document.getElementById('l-src'); ta.value = JSON.stringify(l); ta.dispatchEvent(new Event('input', { bubbles: true })); }, L);
    await waitText(viewer, '#l-out', /Checked|Failed/, 40000); await viewer.waitForTimeout(900); return ((await viewer.textContent('body')) || '').replace(/\s+/g, ' '); };
  const once = await status({ campaign: camp, donations: [tok(d)] }), twice = await status({ campaign: camp, donations: [tok([...d, d[0]])] });
  const lockedOf = t => (t.match(/ (\d+) satLOCKED/) || [])[1] || '';  /* the donation's own line */
  check('the status page counts a proof repeated inside one token once: 21 sat locked, as without the repeat', lockedOf(once) === '21' && lockedOf(twice) === '21', `${lockedOf(once)} sat · with the repeat: ${lockedOf(twice)} sat`);
  await viewer.context().close(); }

say(bad ? `once: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'once: every check passed');
await b.close(); process.exit(bad ? 1 : 0);
