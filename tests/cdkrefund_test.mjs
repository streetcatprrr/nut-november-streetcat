// A refund after its deadline at a mint that runs CDK, with the app's own code (app/core.js), in Node, fake money.
// Needs a public test mint that runs cdk-mintd and pays its own quotes:  MINT=https://… node tests/cdkrefund_test.mjs
// Not in the local battery: the local mints are Nutshell. What is tried: a donation locked as the app locks one (signed whole) whose
// deadline is seconds away is refused to the donor before it and given back after it, written the way the app writes a refund for a
// mint that is not Nutshell (signatures on the first input alone); the same through cashu-ts's own receive; a donation locked the
// way they were before 15 Nov; and the mint's record of each. It also says what the mint answers to the witness the app writes for
// Nutshell, which is why the app does not send that one here.
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT, WAIT = Number(process.env.WAIT || 25), say = (...a) => console.log(...a);
if (!MINT) { say('set MINT to a test mint that runs cdk-mintd'); process.exit(2); }
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), sleep = ms => new Promise(r => setTimeout(r, ms)), amt = C.amt;
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const sum = ps => ps.reduce((a, p) => a + amt(p.amount), 0), key = () => { const sk = hex(cashu.createRandomSecretKey()); return { sk, pk: C.pubOf(sk) }; }, now = () => Math.floor(Date.now() / 1000);
const call = async (path, body) => { const r = await fetch(MINT + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, ...j }; };
const why = r => String(r.detail || r.error || r.code || r.status);

const info = await call('/v1/info'), nuts = info.nuts || {};
say(`mint: ${info.name || '?'} · ${info.version || '?'} · ${MINT}`);
check('the mint says it runs CDK and supports NUT-11', /cdk/i.test(String(info.version)) && nuts['11'] && nuts['11'].supported === true, String(info.version));
const w = new cashu.Wallet(MINT); await w.loadMint(); const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), denoms = Object.keys(ks.keys).map(Number), fee = ps => amt(w.getFeesForProofs(ps));
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 60; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await sleep(500); } } throw new Error('mint quote never paid: is this a test mint?'); };
const sc = key(), cl = key(), camp = until => ({ name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: sc.pk, clinic: cl.pk, deadline: until });
// the lock as the app writes it (index.js lockBuilder), and a donation cut as the app cuts one
const lockOfApp = (c, refundPk, whole = true) => { const b = new cashu.LockBuilder().addMainPubkey([c.streetcat, c.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(Number(c.deadline)); return whole ? b.sigAll() : b; };
async function donate(c, n, whole = true){ const d = key(), ins = await plain(n + 4), total = sum(ins) - fee(ins);
  const outs = cashu.OutputData.createP2PKData(lockOfApp(c, d.pk, whole).toOptions(), total, ks, C.donationSplit(total, denoms));
  const res = await w.mint.swap({ inputs: ins.map(p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C })), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) });
  return { ...d, proofs: outs.map((o, i) => o.toProof(res.signatures[i], ks)) }; }
// the donor's refund as the app sends it (index.js): outputs of its own, the witness from core.js; `plain` is how it goes to a mint that is not Nutshell
async function refund(d, isPlain){ const outs = cashu.OutputData.createRandomData(sum(d.proofs) - fee(d.proofs), ks), wit = C.wholeRefundWitnesses(d.proofs, outs, d.sk, isPlain);
  const res = await call('/v1/swap', { inputs: d.proofs.map((p, i) => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(wit[i] ? { witness: wit[i] } : {}) })), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) });
  return res.ok && Array.isArray(res.signatures) ? { ok: true, wit, proofs: outs.map((o, i) => o.toProof(res.signatures[i], ks)) } : { ok: false, wit, why: why(res) }; }
const states = async ps => ((await call('/v1/checkstate', { Ys: ps.map(p => C.yOf(p.secret)) })).states || []).map(s => s.state).join(',');
const spendable = async ps => { const outs = cashu.OutputData.createRandomData(sum(ps) - fee(ps), ks); const r = await call('/v1/swap', { inputs: ps.map(p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C })), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) }); return r.ok ? '' : why(r); };

// ---------- a deadline far away: the donor is refused ----------
const far = await donate(camp(now() + 30 * 86400), 64), rFar = await refund(far, true);
check('with the deadline a month away, the mint refuses the donor', !rFar.ok && /^UNSPENT(,UNSPENT)*$/.test(await states(far.proofs)), rFar.why || 'taken!');

// ---------- a deadline seconds away: refused before, given back after ----------
const until = now() + WAIT, cSoon = camp(until), A = await donate(cSoon, 300), B = await donate(cSoon, 100), O = await donate(cSoon, 100, false), N = await donate(cSoon, 64);
const lock = C.lockOf(A.proofs[0].secret);
check('the donation is locked as the app locks one: signed whole, Streetcat + the partner, the donor after the deadline', !C.lockProblem(lock, cSoon) && C.isWhole(lock) && lock.refund[0] === A.pk, A.proofs.map(p => amt(p.amount)).join('+'));
if (now() < until - 3) { const early = await refund(A, true); check('before its deadline, the mint refuses the donor', !early.ok, early.why || 'taken!'); }
else say('  (the deadline came too soon to try the refusal before it: run with WAIT=60)');
say(`  waiting for the deadline (${Math.max(0, until - now())} s, and 12 s more for the mint's clock)…`); await sleep((Math.max(0, until - now()) + 12) * 1000);

// what the app writes for Nutshell (the signed text in every proof's witness): not sent to this kind of mint by the app; said here, not judged
if (C.wholeWitnesses) { const rich = await refund(N, false); say(`  the witness the app writes for Nutshell, sent here: ${rich.ok ? 'taken' : 'refused · ' + rich.why}`); }
else say('  (run with a stand-in for core.js that writes the plain witness only: the witness for Nutshell is not sent)');

const rA = await refund(A, true);
check('after its deadline the donor takes the donation back, written as NUT-11 writes it (signatures on the first input alone)', rA.ok && Object.keys(JSON.parse(rA.wit[0])).join() === 'signatures' && rA.wit.slice(1).every(x => x === null), rA.ok ? `${sum(rA.proofs)} sat` : rA.why);
if (rA.ok) {
  check('the mint shows the donation spent', /^SPENT(,SPENT)*$/.test(await states(A.proofs)), await states(A.proofs));
  const s = await spendable(rA.proofs); check('what came back is plain ecash the donor can spend', s === '', s);
  const again = await refund(A, true); check('and it cannot be taken back twice', !again.ok, again.why || 'taken!');
}
// the same donation, taken back by cashu-ts itself (another wallet holding the receipt's key)
const gotB = await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: B.proofs })).privkey(B.sk).run().catch(e => e);
check('another wallet with the refund key takes one back too (cashu-ts receive)', Array.isArray(gotB) && sum(gotB) === sum(B.proofs) - fee(B.proofs), gotB instanceof Error ? gotB.message : '');
// a donation made before 15 Nov: signed proof by proof
const gotO = await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: O.proofs })).privkey(O.sk).run().catch(e => e);
check('a donation locked the earlier way (signed proof by proof) is taken back after its deadline too', !C.isWhole(C.lockOf(O.proofs[0].secret)) && Array.isArray(gotO) && sum(gotO) === sum(O.proofs) - fee(O.proofs), gotO instanceof Error ? gotO.message : '');
// someone who is not the donor
const thief = key(), rT = await refund({ ...far, sk: thief.sk }, true), late = await donate(cSoon, 64), rL = await refund({ ...late, sk: thief.sk }, true);
check('a key that is not the donor\'s takes nothing back, before or after the deadline', !rT.ok && !rL.ok, [rT.why, rL.why].join(' | '));

say(bad ? `cdkrefund: ${bad} check(s) failed` : 'cdkrefund: every check passed'); process.exit(bad ? 1 : 0);
