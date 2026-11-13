// What holds money or a key is never dropped for being old or many (review of 9 Nov, A01/A02), and nothing is taken for kept that the
// phone's storage refused. Before, the lists kept only their last 50, 60, 40 or 30 entries, open ones too: released ecash not moved yet,
// Rescue's payments to its Lightning address still waiting for the mint, the donor's refunds by Lightning not settled (or failed, their
// ecash still good), and payment requests to a Cashu wallet still waiting (each holds the key its payment comes to). Now what is open
// stays, however many; only the oldest of what is finished goes past that number. And a swap's record stays until what came back is
// kept where it goes: a release whose copy the storage refuses is said in red, its token stays on screen, and the page asks the mint
// for it again each time it opens, until it can keep it; with no room even for the record, nothing goes to the mint; and a donation is
// not started when its refund key cannot be saved. The storage refusing is made in the page (setItem throws QuotaExceededError for the
// keys the test names, as a full phone does). Chromium, the local mint (MINT, default 3338).
import fs from 'fs';
import { chromium } from 'playwright';
import { pinBrowser, pin } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338';
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, say = (...a) => console.log(...a), now = () => Math.floor(Date.now() / 1000);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
// a page whose storage refuses the keys listed in sessionStorage 'zz.refuse' (kept across reloads of the tab), as a full phone does
const page = async (role, sk) => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await c.addInitScript(([k, r]) => { const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, v) { let no = []; try { no = JSON.parse(sessionStorage.getItem('zz.refuse') || '[]'); } catch (_) {}
      if (this === localStorage && no.includes(key)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return set.call(this, key, v); };
    try { if (k) localStorage.setItem(r === 'clinic' ? 'vetlock.clinic.sk' : 'vetlock.streetcat.sk', k); } catch (_) {} }, [sk, role]);
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('PAGEERROR', role, e.message); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html' + (role ? '?role=' + role : '')); await p.waitForTimeout(600); return p; };
const refuse = (p, keys) => p.evaluate(k => sessionStorage.setItem('zz.refuse', JSON.stringify(k)), keys);
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t);
const text = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await text(p, sel); if (re.test(s)) return s; await p.waitForTimeout(200); } return text(p, sel); };
const red = (p, sel) => p.evaluate(s => document.querySelector(s).classList.contains('bad'), sel);

// 1) the lists, in the app (no mint needed)
{ const p = await page('');
  const r = await p.evaluate(() => { const V = window.__vetlock, at = new Date().toISOString(), out = {};
    for (let i = 0; i < 120; i++) V.addReleased({ token: 'cashuBopen' + i, amount: 1, at });  /* released, not moved yet */
    for (let i = 0; i < 70; i++) V.addReleased({ token: 'cashuBpaid' + i, amount: 1, paid: 'x@y.z', at });  /* already paid out */
    const rel = V.releasedList(); out.rel = { open: rel.filter(x => !x.paid).length, paid: rel.filter(x => x.paid).length, firstOpen: rel.some(x => x.token === 'cashuBopen0'), lastPaid: rel.some(x => x.token === 'cashuBpaid69'), firstPaid: rel.some(x => x.token === 'cashuBpaid0') };
    for (let i = 0; i < 80; i++) V.savePayout({ id: 'pp' + i, quote: 'q' + i, state: 'pending', token: 't' + i, amount: 1, at });
    for (let i = 0; i < 70; i++) V.savePayout({ id: 'pd' + i, quote: 'qd' + i, state: i % 7 ? 'paid' : 'failed', token: 'td' + i, amount: 1, at });
    const pay = V.payouts(); out.pay = { pending: pay.filter(x => x.state === 'pending').length, done: pay.filter(x => x.state !== 'pending').length, firstPending: pay.some(x => x.id === 'pp0') };
    for (let i = 0; i < 50; i++) V.saveMelt({ id: 'mp' + i, quote: 'm' + i, state: 'pending', token: 'cashuBm' + i, amount: 1, at });
    for (let i = 0; i < 10; i++) V.saveMelt({ id: 'mf' + i, quote: 'f' + i, state: 'failed', token: 'cashuBf' + i, amount: 1, at });  /* failed: its ecash is still good */
    for (let i = 0; i < 60; i++) V.saveMelt({ id: 'md' + i, quote: 'd' + i, state: 'paid', token: 'cashuBd' + i, amount: 1, at });
    const ml = V.melts(); out.melt = { pending: ml.filter(x => x.state === 'pending').length, failed: ml.filter(x => x.state === 'failed').length, paid: ml.filter(x => x.state === 'paid').length, firstPending: ml.some(x => x.id === 'mp0') };
    const sk = 'ab'.repeat(32), camp = { name: 'X', mint: 'http://127.0.0.1:3338', streetcat: '02' + 'cd'.repeat(32), clinic: '03' + 'ef'.repeat(32), deadline: Math.floor(Date.now() / 1000) + 86400 };
    for (let i = 0; i < 45; i++) V.saveWreq({ id: 'wo' + i, sk, pk: '02' + '11'.repeat(32), c: camp, amount: 0, relays: [], created: Date.now(), state: 'waiting', seen: [] });
    for (let i = 0; i < 40; i++) V.saveWreq({ id: 'wd' + i, sk, pk: '02' + '11'.repeat(32), c: camp, amount: 0, relays: [], created: Date.now(), state: 'done', seen: [] });
    const wr = V.wreqs(); out.wreq = { waiting: wr.filter(x => x.state === 'waiting').length, done: wr.filter(x => x.state !== 'waiting').length, firstWaiting: wr.some(x => x.id === 'wo0') };
    return out; });
  await p.reload(); await p.waitForTimeout(600); await p.evaluate(() => window.__vetlock.openTab('release')); const shown = await p.evaluate(() => { const box = document.getElementById('s-saved'); return box ? [...box.querySelectorAll('button')].filter(x => /sat/.test(x.textContent)).length : -1; });
  check('released ecash not moved yet: all 120 kept (before: the last 50, open ones too)', r.rel.open === 120 && r.rel.firstOpen, JSON.stringify(r.rel));
  check('…only the oldest of what was already paid out goes, past 50', r.rel.paid === 50 && r.rel.lastPaid && !r.rel.firstPaid, JSON.stringify(r.rel));
  check('…and every one not moved yet is on screen to copy, not only the newest 10 ("forget all" never forgets one not shown)', shown === 120, 'shown ' + shown);
  check('Rescue\'s payments still waiting for the mint: all 80 kept; finished ones, the last 60', r.pay.pending === 80 && r.pay.firstPending && r.pay.done === 60, JSON.stringify(r.pay));
  check('the donor\'s refunds by Lightning not settled, or failed (their ecash still good): all kept; settled ones, the last 40', r.melt.pending === 50 && r.melt.failed === 10 && r.melt.firstPending && r.melt.paid === 40, JSON.stringify(r.melt));
  check('payment requests to a Cashu wallet still waiting (each holds its key): all 45 kept; finished ones, the last 30', r.wreq.waiting === 45 && r.wreq.firstWaiting && r.wreq.done === 30, JSON.stringify(r.wreq));
  await refuse(p, ['vetlock.released']);
  const full = await p.evaluate(() => { const V = window.__vetlock, saved = V.addReleased({ token: 'cashuBfull', amount: 21, at: new Date().toISOString() }); return { saved, there: V.releasedList().some(x => x.token === 'cashuBfull') }; });
  check('with the storage full, keeping a released token says it could not (false): it is not taken for kept', full.saved === false && !full.there, JSON.stringify(full));
  await p.context().close(); }

// 2) a real release, on the mint, whose copy the phone's storage refuses
const scSk = newSk(), scPk = C.pubOf(scSk), clSk = newSk(), clPk = C.pubOf(clSk); await pin(scPk);
const camp = await C.signCampaign({ name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: scPk, clinic: clPk, deadline: now() + 30 * 86400 }, scSk);
const w = new cashu.Wallet(MINT); await w.loadMint();
const mintPlain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const lockedTok = async n => { const lock = new cashu.LockBuilder().addMainPubkey([scPk, clPk]).requireMainSignatures(2).addRefundPubkey(C.pubOf(newSk())).lockUntil(Number(camp.deadline));
  const locked = await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: await mintPlain(n) })).asLocked(lock).run(); return cashu.getEncodedToken({ mint: MINT, proofs: locked, memo: 'MOCHI sterilisation — vet-certified donation' }); };
const cl = await page('clinic', clSk), sc = await page('streetcat', scSk);
// What the partner's "Certify a token" did, before it was removed (review of 12 Nov: it signed any pasted token, with no request): its key
// signs every proof of a donation locked to it. Release still takes a token certified that way, so this test makes one in the page.
const certifyIn = (p, tok, memo = 'the operation was done') => p.evaluate(async ([t, m]) => { const V = window.__vetlock, { dec } = await V.decodeTok(t), info = V.lockInfo(dec.proofs), want = info.pubkeys.map(k => String(k).toLowerCase()), sk = V.heldKeys('clinic').find(k => want.includes(V.pubOf(k)));
  return sk ? cashu.getEncodedToken({ mint: dec.mint, proofs: cashu.signP2PKProofs(dec.proofs, sk), memo: `${(dec.memo || 'donation').split(' ')[0]} · certified: ${m} · signed by clinic ${V.pubOf(sk).slice(0, 10)}` }) : null; }, [tok, memo]);
const certified = await certifyIn(cl, await lockedTok(21));
check('(the clinic certifies a 21 sat donation)', !!certified);
let swaps = 0; await sc.route('**/v1/swap', r => { swaps++; return r.continue(); });
const V = p => p.evaluate(() => ({ kept: window.__vetlock.releasedList().filter(x => !x.paid).length, flights: window.__vetlock.flights().length }));
await tab(sc, 'release'); await sc.fill('#s-token', certified); await waitText(sc, '#s-info', /certified|signed|Signed/);

// a) not even the swap's record can be written: nothing goes to the mint
await refuse(sc, ['vetlock.inflight']); let s0 = swaps; await sc.click('#s-go');
const o1 = await waitText(sc, '#s-out', /RELEASED|Not possible|refused|Interrupted|Failed/);
check('no room for the swap\'s record: nothing is sent to the mint, and it says so in red', swaps === s0 && /could not write the operation down first/.test(o1) && await red(sc, '#s-out'), o1.slice(0, 140));

// b) the swap goes through, but its copy cannot be kept
await refuse(sc, ['vetlock.released']); s0 = swaps; await sc.click('#s-go');
const o2 = await waitText(sc, '#s-out', /RELEASED|Not possible|refused|Interrupted/), v2 = await V(sc);
const copy = await sc.evaluate(() => { const b = document.querySelector('#s-out .row1 button'); return b ? b.textContent.trim() : ''; });
check('released, but its copy refused: said in red, never "this browser keeps a copy"', swaps === s0 + 1 && /RELEASED/.test(o2) && /could not keep a copy/.test(o2) && !/keeps a copy/.test(o2) && await red(sc, '#s-out'), o2.slice(0, 160));
check('…its token stays on screen to copy, and the swap\'s record stays (nothing kept under Release yet)', !!copy && v2.kept === 0 && v2.flights === 1, `button "${copy}" · ${JSON.stringify(v2)}`);

// c) opened again, still full: the mint hands it back, it still cannot be kept: in red, and the record still stays
await sc.reload(); await sc.waitForFunction(() => !document.getElementById('recovered').hidden, null, { timeout: 30000 }).catch(() => {});
const r3 = await sc.evaluate(() => { const d = document.querySelector('#recovered .out'); return d ? { text: d.textContent, red: d.classList.contains('bad') } : null; }), v3 = await V(sc);
check('opened again, still full: recovered from the mint, said in red that it could not be kept, record kept for next time', !!r3 && r3.red && /could not keep it/.test(r3.text) && v3.kept === 0 && v3.flights === 1, `${JSON.stringify(r3 && r3.text.split('\n')[0])} · ${JSON.stringify(v3)}`);

// d) opened again with room: kept under Release, and only then the record goes
await refuse(sc, []); await sc.reload(); await sc.waitForFunction(() => !document.getElementById('recovered').hidden, null, { timeout: 30000 }).catch(() => {});
const r4 = await sc.evaluate(() => { const d = document.querySelector('#recovered .out'); return d ? { text: d.textContent, red: d.classList.contains('bad') } : null; }), v4 = await V(sc);
check('opened again with room: kept under Release, and only then its record goes', !!r4 && !r4.red && /^release: \d+ sat/.test(r4.text) && v4.kept === 1 && v4.flights === 0, `${JSON.stringify(r4 && r4.text.split('\n')[0])} · ${JSON.stringify(v4)}`);
const back = await sc.evaluate(() => window.__vetlock.releasedList().find(x => !x.paid)); const state = back ? (await w.checkProofsStates(w.decodeToken(back.token).proofs)).map(s => s.state) : [];
check('…and what it keeps is live ecash at the mint', state.length > 0 && state.every(s => s === 'UNSPENT'), state.join(','));

// 3) a donation is not started when its refund key cannot be saved
const dn = await page('donor'); let dswaps = 0; await dn.route('**/v1/swap', r => { dswaps++; return r.continue(); });
await tab(dn, 'donate'); await dn.fill('#d-camp', JSON.stringify(camp)); await dn.waitForTimeout(300); await refuse(dn, ['vetlock.donor.keys']);
await tab(dn, 'decash'); await dn.fill('#d-token', cashu.getEncodedToken({ mint: MINT, proofs: await mintPlain(8) })); await dn.click('#d-go');
const o5 = await waitText(dn, '#de-out', /LOCKED|Failed|Not possible|could not/, 30000);
check('no room for the refund key: nothing is swapped or paid, and it says so in red', dswaps === 0 && /could not save the key that takes these sats back/.test(o5) && await red(dn, '#de-out'), o5.slice(0, 160));

say(bad ? `retention: ${bad} check(s) failed` : 'retention: every check passed');
await b.close(); process.exit(bad ? 1 : 0);
