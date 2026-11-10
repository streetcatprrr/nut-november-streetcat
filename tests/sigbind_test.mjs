// What the mint enforces on a split release: the clinic signs the proofs (NUT-11, SIG_INPUTS)
// and, apart, a statement with the amount. Hypothesis: a Rescue client that holds Streetcat's key and the clinic's valid signatures
// can spend the whole split proof without putting the rest back under the lock. Against the local mint, with fake money. This test
// tells which it is; it does not fix anything. It also measures what the honest app exposes: only the one split proof.
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3338';
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, say = (...a) => console.log(...a), now = () => Math.floor(Date.now() / 1000);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
const amt = C.amt, total = ps => ps.reduce((s, p) => s + amt(p.amount), 0);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const sc = newSk(), cl = newSk(), camp = { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline: now() + 30 * 86400 };
const lockFor = (c, refundPk) => new cashu.LockBuilder().addMainPubkey([c.streetcat, c.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(Number(c.deadline));
const donate = async (c, n) => { const d = newSk(), ps = await plain(n); return { sk: d, proofs: await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: ps })).asLocked(lockFor(c, C.pubOf(d))).run() }; };
const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id);

// a donation of 1024 in one proof; a request for 600 of it: the plan has to split that proof
const A = await donate(camp, 1024); check('the donation is one proof of 1024 sat', A.proofs.length === 1 && amt(A.proofs[0].amount) === 1024, A.proofs.map(p => amt(p.amount)).join('+'));
const plan = C.planRelease(A.proofs, 600); check('the plan for 600 splits it: 600 released, 424 to put back', plan.split && plan.remainder === 424 && total(plan.inputs) === 1024, `remainder ${plan.remainder}`);
const q = await C.makeRequest({ campaign: camp, patient: 'MOCHI', procedure: 'sterilisation', date: '2026-11-08', contributions: [{ ref: await C.donRef(A.proofs.map(p => C.yOf(p.secret))), release: 600, proofs: plan.inputs }] });
const a = await C.certify(q, cl); check('the clinic certifies: the statement says 600, the signatures cover the 1024 proof', (await C.checkAnswer(q, a)).ok && a.statement && C.requestAmount(q) === 600 && a.sigs.length === 1);
// THE DISHONEST CLIENT: Streetcat's key, the clinic's signature, and every output to itself, nothing put back
const sigs = C.clinicSigsByY(q, a), inputs = cashu.signP2PKProofs(plan.inputs.map(p => C.withSig(p, sigs.get(C.yOf(p.secret)))), sc), fee = amt(w.getFeesForProofs(inputs));
let got = null, refused = ''; try { got = await w.ops.receive(inputs).asCustom(cashu.OutputData.createRandomData(1024 - fee, ks)).run(); } catch (e) { refused = e.message || String(e); }
const taken = got ? total(got.filter(p => !C.lockOf(p.secret))) : 0, clientSide = /Custom output data total/.test(refused);  // cashu-ts's own check on a fee mint: the mint was never asked
say(got ? `  the mint ACCEPTED it: ${taken} sat unlocked to Streetcat, 0 sat put back (fee ${fee})` : clientSide ? `  not reached the mint: cashu-ts refused it first (${refused}); run this against the mint without fees` : `  the mint REFUSED it: ${refused}`);
if (clientSide) { say('sigbind: not decided here (the library stopped it before the mint); the mint without fees decides'); process.exit(0); }
check('HYPOTHESIS CONFIRMED (not a bug of this app: what SIG_INPUTS is): the mint does not bind the outputs; a changed client can take the whole proof', !!got && taken === 1024 - fee, got ? `${taken} sat` : refused.slice(0, 80));
// what the honest app exposes: with whole proofs and at most one split, only that proof is at risk
const B = await donate(camp, 1000);  // 512+256+128+64+32+8: many proofs
const pB = C.planRelease(B.proofs, 600); check('a donation in several proofs: the plan takes whole proofs and splits at most one', pB.whole.length >= 1 && (!pB.split || pB.inputs.length === pB.whole.length + 1), `${pB.whole.map(p => amt(p.amount)).join('+')}${pB.split ? ' + split ' + amt(pB.split.amount) : ''}`);
check('…so what a changed client could take beyond the 600 is at most the split proof, not the donation', (pB.split ? amt(pB.split.amount) - pB.part : 0) < total(B.proofs) - 600, `${pB.split ? amt(pB.split.amount) - pB.part : 0} of ${total(B.proofs) - 600} sat not asked for`);
// afterwards: the ledger lets anyone see it. The rest is to be found under derived blinded messages (core.js remainderOutputs); here nothing is
const found = await C.findRemainder(w, plan.split).catch(() => []);
check('and it is detectable afterwards: the rest that should be at the mint is not there (NUT-09 restore finds nothing)', total(found) === 0, `${total(found)} sat found`);
say(bad ? `sigbind: ${bad} check(s) failed` : 'sigbind: every check passed');
process.exit(bad ? 1 : 0);
