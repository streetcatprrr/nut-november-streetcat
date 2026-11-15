// A release as Rescue's app makes one (app/index.js releaseScRequest), in Node, for the suites that check what comes after it: a request
// for `amount` of a donation's `proofs`, the partner's confirmation (core.js certify), then the swap. For a donation signed whole (every
// one the app makes since 15 Nov): its one transaction (core.js wholeOwn, wholeWitnesses, wholeSwap). For one made before: Streetcat's
// signature next to the partner's on every proof, and the rest of a split proof back in the outputs derived from it. What comes back:
// the plan, the request and the answer, and what the mint gave (`pay`: plain ecash; `rest`: back under the lock).
export async function releaseLikeApp({ C, cashu, w, campaign, sc, cl, proofs, amount, patient = 'TEO', procedure = 'castration', date = '2026-11-05' }){
  const amt = C.amt, plan = C.planRelease(proofs, amount), ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), fee = ps => amt(w.getFeesForProofs(ps));
  const q = await C.makeRequest({ campaign, patient, procedure, date, contributions: [{ release: amount, proofs: plan.inputs }], whole: { sk: sc, keysetId: ks.id, denoms: Object.keys(ks.keys).map(Number), fee } });
  const a = await C.certify(q, cl), k = q.contributions[0];
  if (C.contribWhole(k)) { const tx = await C.wholeOwn(q, k, sc), parts = await C.wholeSwap(w, tx, C.wholeWitnesses(tx, [C.destSign(tx, sc), C.clinicSigsOf(q, a)[0]]));
    return { plan, q, a, pay: parts.filter(x => !x.rest).map(x => x.proof), rest: parts.filter(x => x.rest).map(x => x.proof) }; }
  const sigs = C.clinicSigsByY(q, a), inputs = cashu.signP2PKProofs(plan.inputs.map(p => C.withSig(p, sigs.get(C.yOf(p.secret)))), sc), bits = n => { const o = []; for (let x = 1; n; x *= 2) { if (n & x) { o.push(x); n -= x; } } return o.reverse(); };
  const back = plan.split ? await C.remainderOutputs(plan.split, bits(plan.remainder), ks.id) : [], restSecrets = new Set(back.map(o => new TextDecoder().decode(o.secret)));
  const got = await w.ops.receive(inputs).asCustom([...cashu.OutputData.createRandomData(amount - fee(inputs), ks), ...back]).run();
  return { plan, q, a, pay: got.filter(p => !restSecrets.has(String(p.secret))), rest: got.filter(p => restSecrets.has(String(p.secret))) }; }
