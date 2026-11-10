// A campaign that pays from the lock (`dest`) at a mint that charges input fees, as the app's own code does it (app/core.js), in Node
// against a patched test mint started with MINT_INPUT_FEE_PPK=100 (mint/README.md; here port 3341), fake money. Before 10 Nov the
// fee came out of what was left of the split proof, so a donation released whole could not be released at all. Now it comes out of
// the payment, as it does under today's lock: the donation gives up what the request says, the partner gets that less the mint's fee,
// and what is left of the split proof goes back whole. Two donations; Rescue asks for all of one and part of the other. The
// request says each fee; the partner's app checks it is the mint's own (a request that keeps 1 sat more as "fee" is refused, and one
// whose fee cannot be checked here waits), signs, and the mint takes both transactions; a request made as if the mint charged
// nothing is refused by the mint and moves nothing. What the mint keeps then says what was paid, what the fees were and what is
// still locked. Not covered: the pages at such a mint (destflow_test runs there too), the partner's payout and the donor's refund there.
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3341', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), sleep = ms => new Promise(r => setTimeout(r, ms)), amt = C.amt;
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const sum = ps => ps.reduce((a, p) => a + amt(p.amount), 0), key = () => { const sk = hex(cashu.createRandomSecretKey()); return { sk, pk: C.pubOf(sk) }; };
const fails = async f => { try { await f(); return ''; } catch (e) { return String(e && e.message || e); } }, copy = o => JSON.parse(JSON.stringify(o));
const info = await (await fetch(MINT + '/v1/info')).json();
if (!C.destMint(info)) { say('destfee: this mint does not have the patch (see mint/README.md); nothing can be tested'); process.exit(1); }
const w = new cashu.Wallet(MINT); await w.loadMint();
const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), denoms = Object.keys(ks.keys).map(Number), feeOf = ps => amt(w.getFeesForProofs(ps));
const pieces = n => { const o = []; for (const s of denoms.slice().sort((x, y) => y - x)) while (n >= s) { o.push(s); n -= s; } return o; };
const outOf = (a, s) => { const b = cashu.blindMessage(enc.encode(s)); return new cashu.OutputData({ amount: cashu.Amount.from(a), id: ks.id, B_: b.B_.toHex(true) }, b.r, enc.encode(s)); };
const wire = p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(p.witness ? { witness: p.witness } : {}) });
const swapTo = async (inputs, outs) => { const res = await w.mint.swap({ inputs: inputs.map(wire), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) }); return outs.map((o, i) => o.toProof(res.signatures[i], ks)); };
async function plain(n){ const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await sleep(300); } } throw new Error('mint quote never paid'); }
if (feeOf(await plain(8)) < 1) { say(`destfee: the mint at ${MINT} charges no input fee: start one with MINT_INPUT_FEE_PPK=100`); process.exit(1); }

// ---------- the campaign and two donations (locking costs the mint's fee too: each is what was left) ----------
const S = key(), A = key(), deadline = Math.floor(Date.now() / 1000) + 30 * 86400;
const camp = C.campaignOf({ name: 'LUNA', op: 'sterilisation', mint: MINT, streetcat: S.pk, clinic: A.pk, lock: 'dest', deadline }), rule = { streetcat: S.pk, payees: C.payeesOf(camp), deadline };
const donate = async n => { const ps = await plain(n), lock = { ...rule, refund: key().pk }; return swapTo(ps, C.donationSplit(sum(ps) - feeOf(ps), denoms).map(a => outOf(a, C.destSecret(lock)))); };
const don1 = await donate(2105), don2 = await donate(305), dest = { keysetId: ks.id, denoms, fee: feeOf };
check('two donations are locked at a mint that charges for every proof spent', sum(don1) > 2000 && sum(don2) > 290 && feeOf(don2) >= 1, `${sum(don1)} and ${sum(don2)} sat; spending the second whole costs ${feeOf(don2)} sat`);

// ---------- the request: all of the second donation, 1 500 sat of the first ----------
const plan = C.planRelease(don1, 1500), form = { campaign: camp, patient: 'LUNA', procedure: 'sterilisation (spay)', date: '2026-11-12', contributions: [{ release: 1500, proofs: plan.inputs }, { release: sum(don2), proofs: don2 }] };
const q = await C.makeRequest({ ...form, dest }), sp = C.requestSplit(q), f1 = feeOf(plan.inputs), f2 = feeOf(don2);
check('each donation gives up what the request says; the partner gets that less the mint\'s fee, and what is left of the split proof goes back whole', sp[0].pay === 1500 - f1 && sp[0].rest === plan.remainder && sp[0].fee === f1 && sp[1].pay === sum(don2) - f2 && sp[1].rest === 0 && sp[1].fee === f2 && f1 >= 1 && f2 >= 1,
  sp.map(x => `${x.pay} to the partner + ${x.fee} fee + ${x.rest} back, of ${x.total}`).join(' | '));
check('a donation released whole can be asked for (before, its fee had nothing to come out of)', C.requestAmount(q) === 1500 + sum(don2) && !C.requestProblems(q).length, C.requestProblems(q).join('; '));
check('nothing is asked that would leave the partner nothing after the fee', /nothing would be left to pay the partner/.test(await fails(() => C.makeRequest({ ...form, contributions: [{ release: 1, proofs: [don2.slice().sort((a, b) => amt(a.amount) - amt(b.amount)).find(p => amt(p.amount) > 1)] }], dest }))));

// ---------- the partner's app ----------
const keysets = { [ks.id]: ks }, okAmounts = C.amountProblems(q, keysets, feeOf);
check('the partner\'s app finds every amount the mint\'s, and each fee the mint\'s own', !okAmounts.length && okAmounts.wrong === 0, okAmounts.join('; '));
const edit = f => { const t = copy(q); f(t); return t; };
const greedy = edit(t => { t.contributions[0].tx.pay = pieces(sp[0].pay - 1); }), g = C.amountProblems(greedy, keysets, feeOf);
check('a request that keeps 1 sat more as "fee" reads well line by line, and is refused: the fee is not the mint\'s', !C.requestProblems(greedy).length && /the mint fee is false\. Report a problem\./.test(g.join('; ')) && g.wrong === 1, g.join('; ') || 'NOTHING FOUND');
const blind = C.amountProblems(q, keysets, () => null);
check('with the mint\'s fee not known on the phone it is not confirmed yet, and is not called false', /amounts not checked yet/.test(blind.join('; ')) && blind.wrong === 0 && blind.unchecked > 0, blind.join('; '));
const more = edit(t => { t.contributions[0].tx.rest = pieces(plan.remainder - 8); }), moreWhy = C.requestProblems(more).join('; ');
check('one that would take more of the donation than it says is refused', /would take 1508 sat of the donation, not 1500/.test(moreWhy), moreWhy || 'NOTHING FOUND');
const a = await C.certify(q, A.sk), v = await C.checkAnswer(q, a), txs = await Promise.all(q.contributions.map(k => C.reqTx(q, k)));
check('the partner confirms, and Rescue\'s app takes the confirmation', v.ok && txs[0].pay === sp[0].pay && txs[0].fee === f1 && txs[1].fee === f2, v.text);

// ---------- the mint ----------
const free = await C.makeRequest({ ...form, dest: { ...dest, fee: () => 0 } }), aFree = await C.certify(free, A.sk), tFree = await C.reqTx(free, free.contributions[1]);
const refused = await fails(() => C.destSwap(w, tFree, [C.destSign(tFree, S.sk), aFree.sigs[1]])), still = (await w.checkProofsStates(don2)).every(x => x.state === 'UNSPENT');
check('a request made as if the mint charged nothing: the mint refuses its transaction, and nothing moves', /not balanced/.test(refused) && still, refused || 'ACCEPTED');
const done = []; for (let i = 0; i < txs.length; i++) done.push(await C.destSwap(w, txs[i], [C.destSign(txs[i], S.sk), a.sigs[i]]));
const paidOf = parts => sum(parts.filter(x => !x.rest && x.to === A.pk).map(x => x.proof)), restOf = parts => sum(parts.filter(x => x.rest).map(x => x.proof));
check('with both signatures the mint takes both transactions: the partner is paid what the request said less each fee, and the rest is back whole', paidOf(done[0]) === 1500 - f1 && paidOf(done[1]) === sum(don2) - f2 && restOf(done[0]) === plan.remainder && restOf(done[1]) === 0, `${paidOf(done[0])} + ${paidOf(done[1])} paid, ${restOf(done[0])} back`);
const backAt = (await C.destTrace(w, don1)).trace.filter(x => x.depth === 1);
check('the rest is where the donor and the status page look for a rest: in the witness', sum(backAt.map(x => x.proof)) === plan.remainder && backAt.every(x => x.state === 'UNSPENT'));

// ---------- what the mint keeps says ----------
const t2 = await C.destTrace(w, don2), t1 = await C.destTrace(w, don1);
check('the donation released whole, read from the mint alone: paid to the partner, the fee apart, nothing taken back, nothing locked', t2.released === sum(don2) - f2 && t2.fees === f2 && t2.refunded === 0 && t2.locked === 0 && t2.refunds === false && t2.paid[A.pk] === t2.released, `${t2.released} paid · ${t2.fees} fee · ${t2.refunded} taken back · ${t2.locked} locked`);
check('the one released in part: what was paid, its fee, and what is still locked (the proofs never touched and the rest put back)', t1.released === 1500 - f1 && t1.fees === f1 && t1.refunded === 0 && t1.locked === sum(don1) - 1500, `${t1.released} paid · ${t1.fees} fee · ${t1.locked} locked of ${sum(don1)}`);
say(bad ? `destfee: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'destfee: every check passed'); process.exit(bad ? 1 : 0);
