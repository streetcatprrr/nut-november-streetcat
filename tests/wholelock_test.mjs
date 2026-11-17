// Today's lock signed whole (NUT-11 SIG_ALL, app/core.js "today's lock, signed whole", 15 Nov), as the app's own code makes, checks and
// spends it, in Node against the stock local mints (3338, and 3339 with an input fee of 100 ppk: Nutshell 0.21.0, no patch, its
// witness limit of 1 024 characters per input), fake money, no browser. A donation is locked as the app locks one now; Rescue asks for
// part of it (makeRequest); the partner's app checks the transaction it is shown and refuses changed ones, then signs it whole; the
// mint takes it; whoever holds the donation finds the rest and reads from the mint who signed. What the scans by parts found (2.2: a
// 1-sat proof made with a donation's secret, whose signature spent the 1 024-sat proof; 2.12: nothing the partner signed said where
// the money went) is tried as it was found, and refused. Donations made before keep their lock (SIG_INPUTS) and their limit, with
// the bound a request of theirs is now held to; a request can take both kinds.
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3338', FEEMINT = process.env.FEEMINT || 'http://127.0.0.1:3339', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), sleep = ms => new Promise(r => setTimeout(r, ms)), amt = C.amt;
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const sum = ps => ps.reduce((a, p) => a + amt(p.amount), 0), key = () => { const sk = hex(cashu.createRandomSecretKey()); return { sk, pk: C.pubOf(sk) }; }, now = () => Math.floor(Date.now() / 1000);
const fails = async f => { try { await f(); return ''; } catch (e) { return String(e && e.message || e); } };
const call = async (url, path, body) => { const r = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { ok: r.ok, ...j }; };

async function mintAt(url){ const w = new cashu.Wallet(url); await w.loadMint(); const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id);
  const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await sleep(300); } } throw new Error('mint quote never paid'); };
  return { url, w, ks, denoms: Object.keys(ks.keys).map(Number), plain, fee: ps => amt(w.getFeesForProofs(ps)) }; }
const M = await mintAt(MINT); let F = null; try { F = await mintAt(FEEMINT); } catch (_) {}
const sc = key(), cl = key(), camp = (m, until) => ({ name: 'MOCHI', op: 'sterilisation', mint: m.url, streetcat: sc.pk, clinic: cl.pk, deadline: until });
// the lock as the app writes it (index.js lockBuilder), and a donation cut small as the app cuts one (buildOutputs)
const lockOfApp = (c, refundPk, whole = true) => { const b = new cashu.LockBuilder().addMainPubkey([c.streetcat, c.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(Number(c.deadline)); return whole ? b.sigAll() : b; };
async function donate(m, c, n, whole = true){ const d = key(), ins = await m.plain(n + (m === F ? 2 : 0)), total = sum(ins) - m.fee(ins);
  const outs = cashu.OutputData.createP2PKData(lockOfApp(c, d.pk, whole).toOptions(), total, m.ks, C.donationSplit(total, m.denoms));
  const res = await m.w.mint.swap({ inputs: ins.map(p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C })), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) });
  return { ...d, proofs: outs.map((o, i) => o.toProof(res.signatures[i], m.ks)) }; }
const wholeOf = m => ({ sk: sc.sk, keysetId: m.ks.id, denoms: m.denoms, fee: m.fee });
const ask = (m, c, contributions, more = {}) => C.makeRequest({ campaign: c, patient: 'LUNA', procedure: 'spay', date: '2026-11-20', contributions, whole: wholeOf(m), ...more });
const pick = (d, release) => { const plan = C.planRelease(d.proofs, release); return { ref: 'DON-' + d.pk.slice(2, 10).toUpperCase(), release, proofs: plan.inputs }; };
const keysOf = m => ({ [m.ks.id]: m.ks });
async function releaseIt(m, q, i, a){ const k = q.contributions[i], tx = await C.wholeOwn(q, k, sc.sk), wit = C.wholeWitnesses(tx, [C.destSign(tx, sc.sk), C.clinicSigsOf(q, a)[i]]); return { tx, wit, parts: await C.wholeSwap(m.w, tx, wit) }; }

// ---------- the lock ----------
const c1 = camp(M, now() + 30 * 86400), A = await donate(M, c1, 1500), l1 = C.lockOf(A.proofs[0].secret);
check('the lock the app writes now is today\'s lock signed whole: Streetcat + the partner, the donor after the deadline, and ["sigflag","SIG_ALL"]', !C.lockProblem(l1, c1) && C.isWhole(l1) && l1.n === 2 && l1.refund[0] === A.pk, A.proofs.map(p => amt(p.amount)).join('+'));
const old = C.lockOf(JSON.stringify(['P2PK', { nonce: 'aa', data: sc.pk, tags: [['pubkeys', cl.pk], ['n_sigs', '2'], ['locktime', String(c1.deadline)], ['refund', A.pk]] }]));
const odd = C.lockOf(JSON.stringify(['P2PK', { nonce: 'aa', data: sc.pk, tags: [['pubkeys', cl.pk], ['n_sigs', '2'], ['locktime', String(c1.deadline)], ['refund', A.pk], ['sigflag', 'SIG_SOME']] }]));
check('a lock signed proof by proof (every donation made before) is still this campaign\'s; a signature rule the app does not know is not', !C.lockProblem(old, c1) && !C.isWhole(old) && C.lockProblem(odd, c1) === 'unusual signature rule');

// ---------- the request ----------
const q1 = await ask(M, c1, [pick(A, 700)]), k1 = q1.contributions[0], t1 = k1.tx;
check('a request for part of a donation signed whole says its transaction: the keyset, the payment\'s amounts and blinded messages, the rest\'s amounts, a seed', !!t1 && t1.id === M.ks.id && C.requestProblems(q1).length === 0 && t1.pay.reduce((a, n) => a + n, 0) === 700 && t1.payB.length === t1.pay.length && /^[0-9a-f]{64}$/.test(t1.seed) && sum(k1.proofs) - t1.rest.reduce((a, n) => a + n, 0) === 700, JSON.stringify({ pay: t1.pay, rest: t1.rest, proofs: k1.proofs.map(p => p.amount) }));
const opens = []; for (let i = 0; i < t1.pay.length; i++) opens.push(await C.wholePart(sc.sk, t1.seed, i));
check('…and nothing that opens the payment: its outputs\' secrets and blinding factors are worked out from Streetcat\'s key, and are not in the request', !opens.some(o => JSON.stringify(q1).includes(o.secret) || JSON.stringify(q1).includes(o.r.toString(16))) && opens.every((o, i) => o.B_ === t1.payB[i]));

// ---------- the partner ----------
const a1 = await C.certify(q1, cl.sk), v1 = await C.checkAnswer(q1, a1);
check('the partner signs it whole, one signature for the donation, and Streetcat\'s app reads it as certified', a1.sigs.length === 1 && v1.ok && /signed whole/.test(v1.text), v1.text);
const change = async (f, re) => { const q = JSON.parse(JSON.stringify(q1)); f(q.contributions[0], q); const p = C.requestProblems(q), why = p.length ? p.join('; ') : await fails(() => C.certify(q, cl.sk)); return re.test(why) ? '' : why || 'signed'; };
const changed = [
  ['says it pays less than it takes', await change(k => { k.release = 600; }, /would take 700 sat of the donation, not 600/)],
  ['pays twice into one output', await change(k => { k.tx.payB = k.tx.payB.map(() => k.tx.payB[0]); }, /same as another's/)],
  ['names an output that is no point', await change(k => { k.tx.payB[0] = '02' + 'f'.repeat(64); }, /not a release signed whole|does not say where its sats go/)],
  ['puts back more than the proof it comes from', await change(k => { k.tx.rest = [...k.tx.rest, 1024]; }, /gives out more than it spends|would take|puts back more/)],
  ['mixes in a proof signed proof by proof', await change(k => { const s = JSON.parse(k.proofs[0].secret); s[1].tags = s[1].tags.filter(t => t[0] !== 'sigflag'); k.proofs[0].secret = JSON.stringify(s); }, /two kinds of lock/)]];
check('changed requests the partner\'s app refuses before it signs: ' + changed.map(x => x[0]).join(', '), changed.every(x => !x[1]), changed.filter(x => x[1]).map(x => x[0] + ': ' + x[1]).join(' · '));
const feeP = C.amountProblems(q1, keysOf(M), M.fee), q1f = JSON.parse(JSON.stringify(q1)), tf = q1f.contributions[0].tx; tf.pay = [...tf.pay.slice(0, -1), tf.pay[tf.pay.length - 1] - 1].filter(n => n > 0);
check('its amounts are checked against the mint\'s keys, and the fee it leaves against the mint\'s own fee', !feeP.length && C.amountProblems(q1f, keysOf(M), M.fee).some(x => /mint fee is false/.test(x)), feeP.join('; '));

// ---------- the release ----------
const { tx: x1, wit: w1, parts: p1 } = await releaseIt(M, q1, 0, a1), pay1 = p1.filter(x => !x.rest), rest1 = p1.filter(x => x.rest);
check('the mint takes it: the payment is plain ecash for Streetcat, the rest goes back under the same lock', pay1.reduce((a, x) => a + x.amount, 0) === 700 && rest1.reduce((a, x) => a + x.amount, 0) === sum(k1.proofs) - 700 && rest1.every(x => C.lockShape(x.proof.secret) === C.lockShape(A.proofs[0].secret)) && pay1.every(x => !C.lockOf(x.proof.secret)), `${pay1.map(x => x.amount).join('+')} paid · ${rest1.map(x => x.amount).join('+')} back`);
check('every witness it wrote is within the mint\'s 1 024 characters; the first one holds the signatures, and every other one names it', w1.every(s => s.length <= 1024) && JSON.parse(w1[0]).signatures.length === 2 && w1.slice(1).every(s => { const j = JSON.parse(s); return !j.signatures && j.t === C.yOf(x1.inputs[0].secret).slice(2, 18); }), w1.map(s => s.length).join(','));
const tr1 = await C.traceDonation(M.w, A.proofs), how1 = await C.wholeSpends(tr1), spent1 = tr1.filter(x => x.state === 'SPENT');
const back1 = tr1.filter(x => x.depth > 0).reduce((a, x) => a + amt(x.proof.amount), 0);
check('whoever holds the donation finds the rest with its token alone, and reads from the mint that Streetcat and the partner signed that very transaction', back1 === sum(rest1.map(x => x.proof)) && spent1.length === k1.proofs.length && spent1.every(x => how1.get(C.yOf(x.proof.secret)) === 'released'), `rest found ${back1} · ${spent1.map(x => how1.get(C.yOf(x.proof.secret))).join(',')}`);
check('Streetcat\'s app tells its own spend from another (an answer lost after the mint took it)', await C.wholeMine(M.w, x1, [sc.pk, cl.pk]) && C.destWhole(x1, await C.destFind(M.w, x1)) && !(await C.wholeMine(M.w, { ...x1, outputs: x1.outputs.slice().reverse() }, [sc.pk, cl.pk])));

// ---------- 2.2: the 1-sat proof made with a donation's secret ----------
async function decoyTry(whole){ const c = camp(M, now() + 30 * 86400), D = await donate(M, c, 1024, whole), real = D.proofs.find(p => amt(p.amount) === 64) || D.proofs[0];
  const b = cashu.blindMessage(enc.encode(real.secret)), q = await M.w.createMintQuoteBolt11(1); let m = null;
  for (let i = 0; i < 40 && !(m && m.signatures); i++) { m = await call(M.url, '/v1/mint/bolt11', { quote: q.quote, outputs: [{ amount: 1, id: M.ks.id, B_: b.B_.toHex(true) }] }); if (!m.signatures) await sleep(300); }
  const s0 = m.signatures[0], decoy = { amount: 1, id: M.ks.id, secret: real.secret, C: cashu.unblindSignature(cashu.pointFromHex(s0.C_), b.r, cashu.pointFromHex(M.ks.keys['1'])).toHex(true), dleq: { e: s0.dleq.e, s: s0.dleq.s, r: b.r.toString(16).padStart(64, '0') } };
  const rq = await ask(M, c, [{ ref: 'DON-DECOY', release: 1, proofs: [decoy] }]).catch(e => e); if (rq instanceof Error) return { why: 'request: ' + rq.message };
  const okAmounts = !C.amountProblems(rq, keysOf(M)).length, an = await C.certify(rq, cl.sk), out = cashu.OutputData.createRandomData(amt(real.amount), M.ks)[0], o = { amount: amt(out.blindedMessage.amount), id: M.ks.id, B_: out.blindedMessage.B_ };
  const witness = whole ? JSON.stringify({ signatures: [C.destSign({ inputs: [{ ...real, amount: amt(real.amount) }], outputs: [o] }, sc.sk), C.clinicSigsOf(rq, an)[0]] })
    : JSON.stringify({ signatures: [cashu.schnorrSignMessage(real.secret, sc.sk), C.clinicSigsByY(rq, an).get(C.yOf(real.secret))] });
  const r = await call(M.url, '/v1/swap', { inputs: [{ id: real.id, amount: amt(real.amount), secret: real.secret, C: real.C, witness }], outputs: [o] });
  return { okAmounts, certified: (await C.checkAnswer(rq, an)).ok, taken: r.ok, why: r.detail || '', amount: amt(real.amount) }; }
const dOld = await decoyTry(false), dNew = await decoyTry(true);
check('2.2 · under the lock as it was, a 1-sat proof made with a donation\'s secret passes the amount check, is certified, and its signature spends the real proof (the limit donations made before keep)', dOld.okAmounts && dOld.certified && dOld.taken, JSON.stringify(dOld));
check('2.2 · signed whole, the partner\'s signature covers that 1-sat proof\'s C as well as its secret: the mint refuses it for the real proof', dNew.okAmounts && dNew.certified && !dNew.taken && /signature|threshold/i.test(dNew.why), JSON.stringify(dNew));

// ---------- 2.12: what Rescue changes after the partner signed ----------
const B = await donate(M, c1, 900), qB = await ask(M, c1, [pick(B, 300)]), aB = await C.certify(qB, cl.sk), xB = await C.wholeOwn(qB, qB.contributions[0], sc.sk), nB = xB.outputs.length - xB.rests.length;
const greedy = { ...xB, outputs: [...xB.outputs.slice(0, nB), ...xB.outputs.slice(nB).map(o => { const b = cashu.blindMessage(enc.encode(hex(cashu.createRandomSecretKey()))); return { amount: o.amount, id: M.ks.id, B_: b.B_.toHex(true) }; })] };
const wG = C.wholeWitnesses(greedy, [C.destSign(greedy, sc.sk), C.clinicSigsOf(qB, aB)[0]]);
const rG = await call(M.url, '/v1/swap', { inputs: greedy.inputs.map((x, i) => ({ id: x.id, amount: x.amount, secret: x.secret, C: x.C, ...(wG[i] ? { witness: wG[i] } : {}) })), outputs: greedy.outputs });
check('2.12 · Rescue keeping the rest for itself after the partner signed (outputs of its own in place of the rest\'s): the mint refuses it', xB.rests.length > 0 && !rG.ok && /signature|threshold/i.test(String(rG.detail)), String(rG.detail));
const { parts: pB } = await releaseIt(M, qB, 0, aB); check('…and takes the transaction the partner signed', pB.filter(x => !x.rest).reduce((a, x) => a + x.amount, 0) === 300);

// ---------- the witness: what does not fit goes on in the next inputs ----------
const G = await donate(M, c1, 4095), qG = await ask(M, c1, [pick(G, 2047)]), aG = await C.certify(qG, cl.sk), { wit: wG2, parts: pG } = await releaseIt(M, qG, 0, aG);
const trG = await C.traceDonation(M.w, G.proofs), howG = await C.wholeSpends(trG), sG = trG.filter(x => x.state === 'SPENT');
check(`a payment of many outputs (${qG.contributions[0].tx.pay.length}) from ${qG.contributions[0].proofs.length} proofs: its witness goes on in the next inputs', the mint takes it, and it reads back as released`, wG2.filter(s => JSON.parse(s).o).length > 1 && wG2.every(s => s.length <= 1024) && pG.filter(x => !x.rest).reduce((a, x) => a + x.amount, 0) === 2047 && sG.every(x => howG.get(C.yOf(x.proof.secret)) === 'released'), wG2.map(s => s.length).join(','));
const big1 = (await donate(M, c1, 20480)).proofs.slice().sort((a, b) => amt(b.amount) - amt(a.amount))[0], tooMany = await fails(() => ask(M, c1, [{ ref: 'DON-ONE', release: amt(big1.amount) - 1, proofs: [big1] }]));
check('one proof whose payment would need more outputs than its witness can say: the request is refused before anyone signs, and says what to do', /takes more outputs than the mint keeps a record of for one proof: ask for a few sats more or less/.test(tooMany), tooMany.slice(0, 160) + ` (${amt(big1.amount)})`);

// ---------- the refund ----------
const cPast = camp(M, now() - 60), R = await donate(M, cPast, 300), routs = cashu.OutputData.createRandomData(sum(R.proofs) - M.fee(R.proofs), M.ks), rw = C.wholeRefundWitnesses(R.proofs, routs, R.sk);
const rr = await M.w.mint.swap({ inputs: R.proofs.map((p, i) => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(rw[i] ? { witness: rw[i] } : {}) })), outputs: routs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) }).catch(e => ({ e }));
const trR = await C.traceDonation(M.w, R.proofs), howR = await C.wholeSpends(trR);
check('after the deadline the donor takes it back, signed whole with its refund key, and the mint\'s record shows it was taken back', !rr.e && trR.every(x => x.state === 'SPENT' && howR.get(C.yOf(x.proof.secret)) === 'refunded') && rw.every(s => !s || s.length <= 1024), rr.e ? String(rr.e.message || rr.e) : rw.map(s => s ? s.length : 0).join(','));
const R2 = await donate(M, cPast, 200), got2 = await M.w.ops.receive(cashu.getEncodedToken({ mint: M.url, proofs: R2.proofs })).privkey(R2.sk).run().catch(e => e), trR2 = await C.traceDonation(M.w, R2.proofs), howR2 = await C.wholeSpends(trR2);
check('…one taken back by another wallet (its witness: the signature alone) is spent, and shown as neither released nor taken back', Array.isArray(got2) && trR2.every(x => x.state === 'SPENT') && trR2.every(x => !howR2.has(C.yOf(x.proof.secret))), got2 instanceof Error ? got2.message : '');
const R3 = await donate(M, c1, 200), r3o = cashu.OutputData.createRandomData(sum(R3.proofs), M.ks), r3w = C.wholeRefundWitnesses(R3.proofs, r3o, R3.sk);
const r3 = await call(M.url, '/v1/swap', { inputs: R3.proofs.map((p, i) => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(r3w[i] ? { witness: r3w[i] } : {}) })), outputs: r3o.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) });
check('…and before the deadline the mint refuses the donor', !r3.ok, String(r3.detail));

// ---------- nothing counted twice ----------
// after the deadline Streetcat and the partner release two whole proofs; the donor takes the rest back, and signs besides its refund a
// text that claims the release's second proof as its own, written in its first witness as if it were its transaction's
const cP2 = camp(M, now() - 60), T = await donate(M, cP2, 600), two = T.proofs.slice().sort((a, b) => amt(b.amount) - amt(a.amount)).slice(0, 2), qT = await ask(M, cP2, [{ ref: 'DON-TWO', release: sum(two), proofs: two }]), aT = await C.certify(qT, cl.sk), { tx: xT } = await releaseIt(M, qT, 0, aT);
const usedT = new Set(xT.inputs.map(x => x.secret)), leftT = T.proofs.filter(p => !usedT.has(p.secret)), oT = cashu.OutputData.createRandomData(sum(leftT) - M.fee(leftT), M.ks), oTw = oT.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ }));
const real = { inputs: leftT, outputs: oTw }, lie = { inputs: [...leftT, xT.inputs[1]], outputs: oTw }, y16s = ps => ps.map(x => C.yOf(x.secret).slice(2, 18));
const wLie = [JSON.stringify({ signatures: [C.destSign(real, T.sk), C.destSign(lie, T.sk)], i: y16s(lie.inputs), o: oTw.map(o => String(o.amount) + o.B_) }), ...leftT.slice(1).map(() => JSON.stringify({ t: y16s(leftT)[0] }))];
const rL = await call(M.url, '/v1/swap', { inputs: leftT.map((p, i) => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, witness: wLie[i] })), outputs: oTw });
const trT = await C.traceDonation(M.w, T.proofs), howT = await C.wholeSpends(trT), relT = xT.inputs.map(x => howT.get(C.yOf(x.secret)));
check('a donor cannot make part of a release read as taken back: each proof\'s own witness says which spend took it, and the release still reads as released', xT.inputs.length === 2 && rL.ok && wLie[0].length <= 1024 && relT.every(h => h === 'released') && !leftT.some(p => howT.get(C.yOf(p.secret)) === 'refunded'), rL.ok ? JSON.stringify(relT) : String(rL.detail));

// ---------- donations made before: their lock, the bound, and requests of both kinds ----------
const O = await donate(M, c1, 1500, false), qO = await ask(M, c1, [pick(O, 700)]), aO = await C.certify(qO, cl.sk), vO = await C.checkAnswer(qO, aO);
check('a donation made before (signed proof by proof) is asked for, signed proof by proof and read as before', !qO.contributions[0].tx && aO.sigs.length === qO.contributions[0].proofs.length && vO.ok && /all \d+ proofs? signed with/.test(vO.text), vO.text);
const qO2 = JSON.parse(JSON.stringify(qO)); qO2.contributions[0].proofs.push(...O.proofs.filter(p => !qO.contributions[0].proofs.some(x => x.secret === p.secret)).map(p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, dleq: p.dleq })));
check('…a request of such a donation that names more proofs than paying it needs is refused (what a certification of it could release beyond its amount stays under its largest proof)', C.requestProblems(qO2).some(x => /more than paying it needs/.test(x)), C.requestProblems(qO2).join('; '));
const W2 = await donate(M, c1, 800), qM = await ask(M, c1, [pick(O, 200), pick(W2, 500)]), aM = await C.certify(qM, cl.sk), vM = await C.checkAnswer(qM, aM), layout = C.clinicSigsOf(qM, aM);
check('a request may take both kinds: proof by proof for the one, whole for the other, in the request\'s order', vM.ok && Array.isArray(layout[0]) && layout[0].length === qM.contributions[0].proofs.length && typeof layout[1] === 'string' && C.clinicSigsByY(qM, aM).size === qM.contributions[0].proofs.length && /every donation signed/.test(vM.text), vM.text);
const vBad = await C.checkAnswer(qM, { ...aM, sigs: [...aM.sigs.slice(0, -1), C.clinicSigsOf(q1, a1)[0]] });
check('…and an answer with another transaction\'s signature in place of the whole one is not certified', !vBad.ok && /Partly signed/.test(vBad.text), vBad.text);

// ---------- at a mint with fees ----------
if (!F) check('the fee mint (3339) answers', false, FEEMINT);
else { const cf = camp(F, now() + 30 * 86400), H = await donate(F, cf, 2000), qH = await ask(F, cf, [pick(H, 1000)]), kH = qH.contributions[0], feeH = F.fee(kH.proofs), aH = await C.certify(qH, cl.sk), { parts: pH } = await releaseIt(F, qH, 0, aH);
  check(`at a mint that charges ${feeH} sat to spend these proofs: the request leaves exactly that, the partner's app finds it is the mint's fee, and the mint takes it`, feeH > 0 && !C.amountProblems(qH, keysOf(F), F.fee).length && pH.filter(x => !x.rest).reduce((a, x) => a + x.amount, 0) === 1000 - feeH && C.requestSplit(qH)[0].fee === feeH, `${pH.filter(x => !x.rest).map(x => x.amount).join('+')} paid`); }

// ---------- the witness NUT-11 writes, for a mint that is not Nutshell (16 Nov, found with real sats at Minibits) ----------
// cdk-mintd refuses a swap whose inputs carry this app's own witnesses. There the spend goes with the signatures on the first input
// and nothing on the others; tried here against Nutshell, which takes that too. The app still tells its own spend by the signatures.
{ const P = await donate(M, c1, 900), qP = await ask(M, c1, [pick(P, 700)]), aP = await C.certify(qP, cl.sk), kP = qP.contributions[0], txP = await C.wholeOwn(qP, kP, sc.sk), witP = C.wholeWitnesses(txP, [C.destSign(txP, sc.sk), C.clinicSigsOf(qP, aP)[0]], true);
  const shape = witP.length === txP.inputs.length && Object.keys(JSON.parse(witP[0])).join() === 'signatures' && JSON.parse(witP[0]).signatures.length === 2 && witP.slice(1).every(x => x === null);
  let partsP = [], whyP = ''; try { partsP = await C.wholeSwap(M.w, txP, witP); } catch (e) { whyP = String(e.message || e); }
  check('the spend as NUT-11 writes it (signatures on the first input, no witness on the others): the mint takes it, the payment and the rest are what was asked', shape && !whyP && partsP.filter(x => !x.rest).reduce((n, x) => n + x.amount, 0) === 700 && C.destWhole(txP, partsP), whyP || witP.map(x => x ? x.length : 0).join(','));
  check('…and Streetcat\'s app still tells it is its own spend, from the signatures in the mint\'s record, and that another transaction is not', await C.wholeMine(M.w, txP, [sc.pk, cl.pk]) && !(await C.wholeMine(M.w, { ...txP, outputs: txP.outputs.slice().reverse() }, [sc.pk, cl.pk])));
  // who signed, where the mint's record gives the signatures alone: the spend's text is kept beside it (the ledger), and the signatures
  // in the mint's record are over that text or they are not (17 Nov)
  const trP = await C.traceDonation(M.w, P.proofs), spentP = trP.filter(x => x.state === 'SPENT'), textP = C.wholeText(txP), alone = await C.wholeSpends(trP), withText = await C.wholeSpends(trP, [textP]);
  const other = { ...textP, o: textP.o.map((v, i) => i ? v : String(Number(v.slice(0, -66)) + 1) + v.slice(-66)) }, withOther = await C.wholeSpends(trP, [other]), junk = await C.wholeSpends(trP, [{ i: ['zz'], o: 7 }, null, 'x', { i: textP.i, o: textP.o, r: [-1] }]);
  check('such a spend, read from the mint alone, is neither released nor taken back; with its text kept beside it, the mint\'s signatures show Streetcat and the partner signed it', spentP.length === kP.proofs.length && spentP.every(x => !alone.has(C.yOf(x.proof.secret))) && spentP.every(x => withText.get(C.yOf(x.proof.secret)) === 'released'), `${spentP.length} spent · alone ${alone.size} · with its text ${withText.size}`);
  check('…and a text that is not the one signed (one sat more in an output), or one that is no text at all, proves nothing', spentP.every(x => !withOther.has(C.yOf(x.proof.secret))) && junk.size === 0 && C.textOk(textP) !== null && C.textOk({ i: [], o: [] }) === null);
  const RP = await donate(M, cPast, 300), rpo = cashu.OutputData.createRandomData(sum(RP.proofs) - M.fee(RP.proofs), M.ks), rpw = C.wholeRefundWitnesses(RP.proofs, rpo, RP.sk, true);
  const rpr = await M.w.mint.swap({ inputs: RP.proofs.map((p, i) => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(rpw[i] ? { witness: rpw[i] } : {}) })), outputs: rpo.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) }).catch(e => ({ e }));
  check('a refund written the same way is taken too', !rpr.e && Object.keys(JSON.parse(rpw[0])).join() === 'signatures' && rpw.slice(1).every(x => x === null), rpr.e ? String(rpr.e.message || rpr.e) : ''); }

say(bad ? `wholelock: ${bad} check(s) failed` : 'wholelock: every check passed'); process.exit(bad ? 1 : 0);
