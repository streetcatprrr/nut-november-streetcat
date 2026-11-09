// Is every amount in a request real? (review of 9 Nov, A04.) A request names each proof's amount, but the partner's signature (NUT-11,
// SIG_INPUTS) covers only the proof's secret, and the mint checks the real amount, not the request's. So a changed Rescue app could say a
// 1 024-sat proof is worth 64 and, with the partner's signature, take all 1 024. Here: every proof in a request carries the mint's
// signature C and its DLEQ proof (NUT-12), and the partner's app checks each amount against the mint's keys before it can sign
// (core.js amountProblems); a request that lies about an amount, or carries no way to check it, is refused. Also: what the lie would
// allow if it were signed (against the mint, which accepts it), and that the rest of a split donation can still be checked and released.
// Against the local mint, with fake money. Independent of sigbind_test (where the outputs of a split go), which this does not change.
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3338';
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, say = (...a) => console.log(...a), now = () => Math.floor(Date.now() / 1000);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
const amt = C.amt, total = ps => ps.reduce((s, p) => s + amt(p.amount), 0), copy = o => JSON.parse(JSON.stringify(o));
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const sc = newSk(), cl = newSk(), camp = { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline: now() + 30 * 86400 };
const lockFor = (c, refundPk) => new cashu.LockBuilder().addMainPubkey([c.streetcat, c.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(Number(c.deadline));
const donate = async (c, n) => { const d = newSk(), ps = await plain(n); return { sk: d, proofs: await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: ps })).asLocked(lockFor(c, C.pubOf(d))).run() }; };
const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id);
const keysOf = async q => { const o = {}; for (const id of new Set(q.contributions.flatMap(k => k.proofs.map(p => p.id)))) o[id] = await w.keyChain.ensureKeysetKeys(id); return o; };
const request = (proofs, release) => C.makeRequest({ campaign: camp, patient: 'MOCHI', procedure: 'sterilisation', date: '2026-11-09', contributions: [{ release, proofs }] });

// a donation of 1 024 sat in one proof, and a request for all of it
const A = await donate(camp, MINT.endsWith('3339') ? 1025 : 1024); check('the donation is one proof of 1 024 sat', A.proofs.length === 1 && amt(A.proofs[0].amount) === 1024);
const q = await request(A.proofs, 1024), sent = q.contributions[0].proofs[0];
check('a request carries, for each proof, the mint\'s signature (C) and its DLEQ proof with r, so its amount can be checked', /^0[23][0-9a-f]{64}$/.test(sent.C) && !!sent.dleq && ['e', 's', 'r'].every(k => /^[0-9a-f]{1,64}$/.test(sent.dleq[k] || '')), JSON.stringify(Object.keys(sent)));
check('…and an honest request has no problem: its amount checks against the mint\'s keys', !C.requestProblems(q).length && !C.amountProblems(q, await keysOf(q)).length, [...C.requestProblems(q), ...C.amountProblems(q, await keysOf(q))].join('; '));

// THE LIE: the same proof, said to be worth 64 sat (a changed Rescue app). It looks like any request; only the mint's keys tell
const lie = copy(q); lie.contributions[0].proofs[0].amount = 64; lie.contributions[0].release = 64;
const lp = C.amountProblems(lie, await keysOf(lie));
check('a request that says the 1 024-sat proof is worth 64 sat: nothing else looks wrong, but its amount does not check against the mint\'s keys', !C.requestProblems(lie).length && lp.length === 1 && /: an amount is false\. Report a problem\./.test(lp[0]), lp.join('; '));
const odd = copy(q); odd.contributions[0].proofs[0].amount = 1000; odd.contributions[0].release = 1000;
check('…and one that names an amount the mint has no key for (1 000 sat): refused the same way, without stopping the check', C.amountProblems(odd, await keysOf(odd)).length === 1);
check('…and with no keys for its keyset on the phone (offline, never fetched): said apart, so it cannot be confirmed yet', /amounts not checked yet \(no connection\?\)/.test(C.amountProblems(q, {}).join(' ')));
// what an older app sends, or a changed one that takes the proof of its amount away: refused before the keys are even asked
for (const [what, cut] of [['C', p => { delete p.C; }], ['the DLEQ proof', p => { delete p.dleq; }], ['r', p => { delete p.dleq.r; }], ['a C that is not a point', p => { p.C = 'zz' + p.C.slice(2); }]]) {
  const x = copy(q); cut(x.contributions[0].proofs[0]); const pr = C.requestProblems(x);
  check(`…a request without ${what}: refused, its amounts cannot be checked`, pr.length === 1 && /amounts can't be checked\. Report a problem\./.test(pr[0]), pr.join('; ')); }
let made = ''; try { await request(A.proofs.map(({ dleq, ...p }) => p), 1024); } catch (e) { made = e.message; }
check('Rescue\'s app does not make a request from a proof that carries no DLEQ proof (the partner could not check it)', /DLEQ/.test(made), made);

// WHAT THE LIE WOULD ALLOW if the partner signed it: its signature on the secret is good for the real proof, so with Streetcat's key a
// changed client takes all 1 024 sat (the mint checks the proof, not the request). This is why the amount is checked before signing.
const a = await C.certify(lie, cl), sigs = C.clinicSigsByY(lie, a), inputs = cashu.signP2PKProofs(A.proofs.map(p => C.withSig(p, sigs.get(C.yOf(p.secret)))), sc), fee = amt(w.getFeesForProofs(inputs));
const outs = cashu.OutputData.createRandomData(1024 - fee, ks); let res = null, why = '';
const wire = { inputs: inputs.map(p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, witness: typeof p.witness === 'string' ? p.witness : JSON.stringify(p.witness) })), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) };
try { res = await w.mint.swap(wire); } catch (e) { why = e.message || String(e); }  /* straight to the mint, as a changed client would: no library check in between */
const taken = res && res.signatures ? res.signatures.reduce((s, x) => s + amt(x.amount), 0) : 0;
check('…what it would allow, signed: the mint accepts the 1 024-sat proof with the partner\'s signature on the "64 sat" request, and pays out all of it', taken === 1024 - fee, res ? `${taken} sat out, fee ${fee}; the partner had confirmed 64` : why.slice(0, 100));

// a split donation: released in part, its rest put back under the lock (as the app does), found again at the mint and checkable, so a
// later request for what is left passes the partner's check too
const D = await donate(camp, 2100), plan = C.planRelease(D.proofs, 1500);
const qd = await request(plan.inputs, 1500); check('a request for 1 500 of a 2 100-sat donation checks against the mint\'s keys', !C.requestProblems(qd).length && !C.amountProblems(qd, await keysOf(qd)).length);
const ad = await C.certify(qd, cl), sd = C.clinicSigsByY(qd, ad), din = cashu.signP2PKProofs(plan.inputs.map(p => C.withSig(p, sd.get(C.yOf(p.secret)))), sc), dfee = amt(w.getFeesForProofs(din));
const bits = n => { const o = []; for (let x = 1; n; x *= 2) { if (n & x) { o.push(x); n -= x; } } return o.reverse(); }, back = plan.split ? await C.remainderOutputs(plan.split, bits(plan.remainder), ks.id) : [];
await w.ops.receive(din).asCustom([...cashu.OutputData.createRandomData(1500 - dfee, ks), ...back]).run();
const rest = plan.split ? await C.findRemainder(w, plan.split) : [];
check('…its rest, found again at the mint, carries DLEQ proofs with r (so it can be checked, and split again)', !plan.split || (rest.length > 0 && total(rest) === plan.remainder && rest.every(p => p.dleq && p.dleq.r)), plan.split ? `${total(rest)} sat in ${rest.length} proofs` : 'no split');
const left = [...D.proofs.filter(p => !plan.inputs.includes(p)), ...rest], ql = await request(left, total(left));
check('…and a later request for what is left of it checks too', !C.requestProblems(ql).length && !C.amountProblems(ql, await keysOf(ql)).length, `${total(left)} sat in ${left.length} proofs`);

say(bad ? `amount: ${bad} check(s) failed` : 'amount: every check passed'); process.exit(bad ? 1 : 0);
