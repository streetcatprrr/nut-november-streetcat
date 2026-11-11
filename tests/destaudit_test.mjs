// What the audit of 10 Nov found in the lock that says where the money may go (`dest`), each thing tried again as it was found: in
// Node, with the app's own code (app/core.js), against the patched test mint (mint/, port 3340), fake money. Three reviewers who had
// not written the code attacked it; none could take a sat, and this is what they could do instead, and can no longer.
// 1. BLOCK A RELEASE. A release's outputs were worked out from the proofs it spent, which the published ledger shows: a stranger had
//    the mint sign them first (a sat each) and the mint refused every release of that donation for ever. They now come from a seed
//    only the request carries. The stranger here signs first everything the old way gave, and the release goes through.
// 2. MISREAD THE MINT. The status page and the donor's app guessed a release from the shape of a witness. A donor taking its money
//    back could make it look released (and paid to a partner); a copy of the witness on a second proof counted a payment twice; a
//    rest put back under a nonce of the sender's own was not found, and shown as fees. A release is now proven by its two
//    signatures, read from the mint, and a rest is followed from the witness wherever it is. The two signers putting a proof of
//    their own first (so that the donor's proof would carry no witness) hide nothing either: the mint keeps it with every input.
// 3. A LOCK THAT IS NOT QUITE THE CAMPAIGN'S. A partner's key written 03… for 02… (one signer to a signature, another key to the
//    mint), the partners in another order, a secret the mint would refuse, a donation under two refund keys: each was taken for a
//    donation and failed later, at the mint or at the partner's button. Each is now refused where the donation comes in.
// 4. READ BACK WHAT IS NOT THERE. Whatever the mint had signed under a transaction's blinded messages was booked as that
//    transaction: with two requests over the same proofs, the second "paid" what the first had. Only the whole of it counts now.
// Not covered here: the pages (destflow, destpay, destpart, intake), a mint with fees (destfee), the mint's rule itself (dest_test).
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), unhex = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16))), sleep = ms => new Promise(r => setTimeout(r, ms)), amt = C.amt;
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const sum = ps => ps.reduce((a, p) => a + amt(p.amount), 0), key = () => { const sk = hex(cashu.createRandomSecretKey()); return { sk, pk: C.pubOf(sk) }; }, rnd = () => hex(cashu.createRandomSecretKey());
const fails = async f => { try { await f(); return ''; } catch (e) { return String(e && e.message || e); } };
if (!C.destMint(await (await fetch(MINT + '/v1/info')).json())) { say(`destaudit: needs the patched mint at ${MINT} (see mint/README.md)`); process.exit(1); }
const w = new cashu.Wallet(MINT); await w.loadMint(); const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), denoms = Object.keys(ks.keys).map(Number), feeOf = ps => amt(w.getFeesForProofs(ps)), dest = { keysetId: ks.id, denoms, fee: feeOf };
const outOf = (a, s) => { const b = cashu.blindMessage(enc.encode(s)); return new cashu.OutputData({ amount: cashu.Amount.from(a), id: ks.id, B_: b.B_.toHex(true) }, b.r, enc.encode(s)); };
const wire = p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(p.witness ? { witness: p.witness } : {}) }), bm = o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ });
const post = async (path, body) => { const r = await fetch(MINT + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { ok: r.ok, ...j }; };
const rawSwap = (inputs, outs) => post('/v1/swap', { inputs: inputs.map(wire), outputs: outs.map(bm) });
const swapTo = async (inputs, outs) => { const res = await rawSwap(inputs, outs); if (!res.ok) throw new Error(res.detail); return outs.map((o, i) => o.toProof(res.signatures[i], ks)); };
async function plain(n){ const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 60; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await sleep(300); } } throw new Error('mint quote never paid'); }
// a spend made by hand, as a changed client or a donor's own wallet would: signed over this very transaction (NUT-11 SIG_ALL)
const textOf = (ins, outs) => ins.map(x => x.secret + x.C).join('') + outs.map(o => String(amt(o.blindedMessage.amount)) + o.blindedMessage.B_).join('');
const opened = outs => outs.map(o => ({ secret: new TextDecoder().decode(o.secret), r: o.blindingFactor.toString(16).padStart(64, '0') })), signed = (ins, outs, sks) => sks.map(sk => cashu.schnorrSignMessage(textOf(ins, outs), sk));
const withWitness = (ins, wit, at = [0]) => ins.map((p, i) => at.includes(i) ? { ...p, witness: JSON.stringify(wit) } : { ...p, witness: undefined }), ys = ins => ins.map(p => C.yOf(p.secret));
const S = key(), A = key(), B = key(), far = () => Math.floor(Date.now() / 1000) + 30 * 86400, payTo = k => JSON.stringify(['P2PK', { nonce: rnd(), data: k }]), same = s => { const j = JSON.parse(s); j[1].nonce = rnd(); return JSON.stringify(j); };
const campOf = (deadline, partners = []) => C.campaignOf({ name: 'LUNA', op: 'sterilisation', mint: MINT, streetcat: S.pk, clinic: A.pk, ...(partners.length ? { partners } : {}), lock: 'dest', deadline });
const give = async (camp, parts, bend = l => l) => { const D = key(), lock = bend({ streetcat: S.pk, payees: C.payeesOf(camp), deadline: camp.deadline, refund: D.pk }); return { D, lock, don: await swapTo(await plain(parts.reduce((a, b) => a + b, 0)), parts.map(a => outOf(a, C.destSecret(lock)))) }; };
const adds = x => x.total === x.locked + x.pending + x.released + x.fees + x.refunded + x.unproven + x.unknown;
const brief = x => JSON.stringify({ locked: x.locked, released: x.released, fees: x.fees, refunded: x.refunded, unproven: x.unproven, unknown: x.unknown, proven: x.txs.length });

// ---------- 1. the stranger signs first everything that could be worked out from the donation ----------
{ const camp = campOf(far()), { don } = await give(camp, [32, 16, 8, 8]), N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n, cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let at = 0; for (const x of a) { o.set(x, at); at += x.length; } return o; }, sha = async b => new Uint8Array(await crypto.subtle.digest('SHA-256', b)), big = b => BigInt('0x' + hex(b));
  // the payment's outputs as they were derived before the audit (from the proof's secret and the r in its DLEQ, both in the published ledger)
  const oldPay = async (p, i) => { const base = cat(unhex(String(p.dleq.r).padStart(64, '0')), enc.encode(p.secret), new Uint8Array([i])), nonce = hex(await sha(cat(enc.encode('streetcat/dest-pay/v1/nonce\n'), base))); let bf = big(await sha(cat(enc.encode('streetcat/dest-pay/v1/r\n'), base))) % N; if (bf === 0n) bf = 1n;
    return cashu.blindMessage(enc.encode(JSON.stringify(['P2PK', { nonce, data: A.pk }])), bf).B_.toHex(true); };
  let took = 0; for (const p of don) { for (const B_ of [await oldPay(p, 0), (await C.remainderPart(p, 0)).B_]) { const mine = await plain(1), res = await post('/v1/swap', { inputs: mine.map(wire), outputs: [{ amount: 1, id: ks.id, B_ }] }); if (res.ok) took++; } }
  const q = await C.makeRequest({ campaign: camp, patient: 'LUNA', procedure: 'spay', date: '2026-11-12', contributions: [{ release: 40, proofs: C.planRelease(don, 40).inputs }], dest }), a = await C.certify(q, A.sk), tx = await C.reqTx(q, q.contributions[0]);
  const went = await fails(() => C.destSwap(w, tx, [C.destSign(tx, S.sk), a.sigs[0]]));
  check('a stranger has the mint sign first every output that could be worked out from the donation (as the ledger shows it): the release goes through all the same', took === don.length * 2 && went === '', `${took} blinded messages signed first for ${took} sat · ${went || 'the mint took the release'}`);
  const x = await C.destTrace(w, don);
  check('…and the stranger\'s sats, under the lock where a rest used to be looked for, are counted as nothing of this donation', adds(x) && x.released === 40 && x.locked === 24 && x.txs.length === 1, brief(x));
  const q2 = await C.makeRequest({ campaign: camp, patient: 'LUNA', procedure: 'spay', date: '2026-11-12', contributions: [{ release: 8, proofs: C.planRelease(don.slice(2), 8).inputs }], dest }), t2 = await C.reqTx(q2, q2.contributions[0]);
  const noSeed = JSON.parse(JSON.stringify(q2)); delete noSeed.contributions[0].tx.seed; const oneSeed = await C.makeRequest({ campaign: camp, patient: 'LUNA', procedure: 'spay', date: '2026-11-12', contributions: [{ release: 8, proofs: [don[2]] }, { release: 8, proofs: [don[3]] }], dest }); oneSeed.contributions[1].tx.seed = oneSeed.contributions[0].tx.seed;
  check('a request says its seed, each donation its own; without one, or with one for two, it is refused', /^[0-9a-f]{64}$/.test(q2.contributions[0].tx.seed) && !C.requestProblems(q2).length && /does not say where its sats go/.test(C.requestProblems(noSeed).join()) && /same as another/.test(C.requestProblems(oneSeed).join()) && !t2.outputs.some(o => tx.outputs.some(y => y.B_ === o.B_))); }

// ---------- 2. the reading of the mint ----------
{ const camp = campOf(far()), { don } = await give(camp, [32, 16, 8, 8]), ins = [don[0], don[1]], outs = [outOf(32, payTo(A.pk)), outOf(8, payTo(A.pk)), outOf(8, same(don[0].secret))];
  const res = await rawSwap(withWitness(ins, { signatures: signed(ins, outs, [S.sk, A.sk]), outputs: opened(outs), inputs: ys(ins) }, [0, 1]), outs), x = await C.destTrace(w, don);
  check('a copy of the witness on the second proof: its payment is counted once, and a rest under a nonce of the sender\'s own is found (40 paid, 24 locked)', res.ok && adds(x) && x.released === 40 && x.paid[A.pk] === 40 && x.locked === 24 && !x.refunded && !x.unproven && x.trace.some(t => t.depth === 1 && t.state === 'UNSPENT' && amt(t.proof.amount) === 8), brief(x)); }
{ const camp = campOf(far()), { don } = await give(camp, [32, 16, 8, 8]), ins = [don[0]], outs = [outOf(8, payTo(A.pk)), outOf(16, same(don[0].secret)), outOf(8, same(don[0].secret))];
  const res = await rawSwap(withWitness(ins, { signatures: signed(ins, outs, [S.sk, A.sk]), outputs: opened(outs) }), outs), x = await C.destTrace(w, don);
  check('a client that leaves the inputs out of the witness: the mint refuses it (since 11 Nov), and all of it is still locked', !res.ok && /must list the inputs/.test(res.detail || '') && adds(x) && x.released === 0 && x.unproven === 0 && x.locked === 64, (res.detail || 'ACCEPTED') + ' · ' + brief(x)); }
{ const camp = campOf(Math.floor(Date.now() / 1000) + 5), { don, D } = await give(camp, [32, 16, 8, 8]); await sleep(7000); const X = key();
  const o1 = [outOf(32, payTo(X.pk)), outOf(16, rnd())], i1 = [don[0], don[1]], r1 = await rawSwap(withWitness(i1, { signatures: signed(i1, o1, [D.sk]), outputs: opened(o1) }), o1), x1 = await C.destTrace(w, don);
  check('a donor who takes its money back and opens its outputs in the witness: taken back, not released, and nothing "paid"', r1.ok && adds(x1) && x1.released === 0 && x1.refunded === 48 && x1.locked === 16 && !Object.keys(x1.paid).length && !x1.unproven, brief(x1));
  const o2 = [outOf(8, payTo(A.pk))], i2 = [don[2]], r2 = await rawSwap(withWitness(i2, { signatures: signed(i2, o2, [D.sk]), outputs: opened(o2), inputs: ys(i2) }), o2), x2 = await C.destTrace(w, don);
  check('…and one who pays a partner after the deadline, naming the inputs as a release does: still no release (Streetcat\'s signature is not there)', r2.ok && adds(x2) && x2.released === 0 && !x2.txs.length && x2.loose[A.pk] === 8 && x2.unproven === 8 && x2.refunded === 48, brief(x2)); }
{ const camp = campOf(far()), { don } = await give(camp, [64]), planted = await swapTo(await plain(1), [outOf(1, same(don[0].secret))]), ins = [planted[0], don[0]], outs = [outOf(1, payTo(A.pk)), outOf(64, same(don[0].secret))];
  const res = await rawSwap(withWitness(ins, { signatures: signed(ins, outs, [S.sk, A.sk]), outputs: opened(outs), inputs: ys(ins) }), outs), st = (await w.checkProofsStates(don))[0], x = await C.destTrace(w, don);
  check('the two signers put a proof of their own first: the donor\'s proof still carries the witness, and its 64 sat are found under the lock', res.ok && st.state === 'SPENT' && !!st.witness && x.locked === 64 && x.released === 0 && x.trace.some(t => t.depth === 1 && t.state === 'UNSPENT' && amt(t.proof.amount) === 64), brief(x)); }
{ const camp = campOf(far(), [B.pk]), { don } = await give(camp, [32, 16, 8, 8]), ins = [don[0], don[2]], outs = [outOf(16, payTo(A.pk)), outOf(16, payTo(B.pk)), outOf(8, same(don[0].secret))];
  const res = await rawSwap(withWitness(ins, { signatures: signed(ins, outs, [S.sk, A.sk, B.sk]), outputs: opened(outs), inputs: ys(ins) }), outs), x = await C.destTrace(w, don);
  check('two partners paid in one spend, both signed: proven, each with its sum', res.ok && adds(x) && x.paid[A.pk] === 16 && x.paid[B.pk] === 16 && x.locked === 32 && x.txs.length === 1, brief(x));
  const i2 = [don[1]], o2 = [outOf(16, payTo(A.pk))], r2 = await rawSwap(withWitness(i2, { signatures: signed(i2, o2, [S.sk, A.sk]), outputs: opened(o2), inputs: ys([don[1], don[3]]) }), o2), x2 = await C.destTrace(w, don);
  check('a witness that names an input it did not have: the mint refuses it (since 11 Nov), and nothing more is released', !r2.ok && /must list the inputs/.test(r2.detail || '') && adds(x2) && x2.released === 32 && x2.unproven === 0 && x2.locked === 32 && x2.txs.length === 1, (r2.detail || 'ACCEPTED') + ' · ' + brief(x2)); }

// ---------- 3. a lock that is not quite the campaign's ----------
{ const camp = campOf(far(), [B.pk]), flip = k => (k.startsWith('02') ? '03' : '02') + k.slice(2);
  const bent = await give(camp, [8], l => ({ ...l, payees: [flip(A.pk), B.pk] })), turned = await give(camp, [8], l => ({ ...l, payees: [B.pk, A.pk] })), right = await give(camp, [8]);
  const said = d => C.lockProblem(C.lockOf(d.don[0].secret), camp);
  check('a partner\'s key written 03… for 02…, or the partners in another order: not a donation of this campaign (the mint could not pay from the first; the app would not file the second with its campaign)', /not written as the campaign writes them/.test(said(bent)) && /not written as the campaign writes them/.test(said(turned)) && said(right) === '', said(bent));
  const odd = [JSON.stringify(['P2PK', JSON.parse(right.don[0].secret)[1], 'more']), JSON.stringify(['P2PK', (({ nonce, ...d }) => d)(JSON.parse(right.don[0].secret)[1])]), JSON.stringify(['P2PK', { ...JSON.parse(right.don[0].secret)[1], also: 1 }]), JSON.stringify(['P2PK', { ...JSON.parse(right.don[0].secret)[1], nonce: 7 }])];
  check('a secret the mint would refuse (a third element, no nonce, another field, a nonce that is a number) is not read as a good lock', odd.every(s0 => /not written as a lock is/.test((C.lockOf(s0) || {}).bad || '')) && !C.lockOf(right.don[0].secret).bad, odd.map(s0 => (C.lockOf(s0) || {}).bad || 'READ AS GOOD').join(' | ').slice(0, 120));
  const D2 = key(), two = [...right.don, ...await swapTo(await plain(8), [outOf(8, C.destSecret({ ...right.lock, refund: D2.pk }))])];
  const why = await fails(() => C.makeRequest({ campaign: camp, patient: 'LUNA', procedure: 'spay', date: '2026-11-12', contributions: [{ release: 16, proofs: two }], dest }));
  check('a donation whose proofs are under two refund keys cannot be asked for: said where the request is made, not at the partner\'s button', /not under one lock/.test(why), why || 'MADE'); }

// ---------- 4. what is read back from the mint is that very transaction, or nothing ----------
{ const camp = campOf(far()), { don } = await give(camp, [32, 16, 8, 8]), mk = async n => { const q = await C.makeRequest({ campaign: camp, patient: 'LUNA', procedure: 'spay', date: '2026-11-12', contributions: [{ release: n, proofs: C.planRelease(don, n).inputs }], dest }); return { q, a: await C.certify(q, A.sk), tx: await C.reqTx(q, q.contributions[0]) }; };
  const one = await mk(40), other = await mk(32), parts = await C.destSwap(w, one.tx, [C.destSign(one.tx, S.sk), one.a.sigs[0]]);
  const back = await C.destFind(w, one.tx), elsewhere = await C.destFind(w, other.tx);
  check('two requests over the same proofs: the first is paid and read back whole; nothing of it is read back as the second', C.destWhole(one.tx, parts) && C.destWhole(one.tx, back) && !elsewhere.length && !C.destWhole(other.tx, elsewhere), `${back.length} parts of the first, ${elsewhere.length} of the second`);
  check('…and a part of a transaction is not the transaction', !C.destWhole(one.tx, back.slice(1)) && !C.destWhole(one.tx, back.map((x, i) => i ? x : { ...x, amount: x.amount + 1 })) && !C.destWhole(one.tx, [])); }

say(bad ? `destaudit: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'destaudit: every check passed'); process.exit(bad ? 1 : 0);
