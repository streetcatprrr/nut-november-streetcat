// The `dest` lock as the app's own code makes, checks and spends it (app/core.js, "a lock that says where the money may go"), in Node
// against the patched test mint (mint/, port 3340), fake money, no browser. A donor locks 2 100 sat, cut small as the app cuts a
// donation, to Streetcat's key and a list of two partners. Rescue makes the transaction that pays one of them 1 500 sat (destTx); the
// partner's app checks it before signing (destProblems) and refuses seven changed ones; both sign the whole transaction; the mint takes
// it (destSwap). The transaction is made from a seed only its request carries, so nobody else can know its blinded messages before
// the mint has signed them (audit of 10 Nov); the rest is found in the witness, by whoever holds the donation (destTrace), and the
// release is proven there by its two signatures. The partner then finds its payment
// with nothing handed over (destOutputs) and spends it. A second release pays the other partner out of what was left. And what
// Rescue changes after the partner signed, the mint refuses. A campaign with one partner is a list of one. Not covered: the pages (no
// screen uses this lock yet), a mint with fees, the donor's refund (dest_test spends the refund path by hand).
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), sleep = ms => new Promise(r => setTimeout(r, ms)), amt = C.amt;
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const sum = ps => ps.reduce((a, p) => a + amt(p.amount), 0), key = () => { const sk = hex(cashu.createRandomSecretKey()); return { sk, pk: C.pubOf(sk) }; };

const info = await (await fetch(MINT + '/v1/info')).json();
check('the app reads the mint\'s announcement: this mint enforces the rule, one that says nothing does not', C.destMint(info) && !C.destMint({ nuts: { 11: { supported: true } } }) && !C.destMint(null));
if (!C.destMint(info)) { say('destcore: this mint does not have the patch (see mint/README.md); nothing else can be tested'); process.exit(1); }
const w = new cashu.Wallet(MINT); await w.loadMint();
const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), denoms = Object.keys(ks.keys).map(Number);
const outOf = (a, s) => { const b = cashu.blindMessage(enc.encode(s)); return new cashu.OutputData({ amount: cashu.Amount.from(a), id: ks.id, B_: b.B_.toHex(true) }, b.r, enc.encode(s)); };
const plainOut = a => outOf(a, hex(cashu.createRandomSecretKey()));
const wire = p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(p.witness ? { witness: p.witness } : {}) });
const swapTo = async (inputs, outs) => { const res = await w.mint.swap({ inputs: inputs.map(wire), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) }); return outs.map((o, i) => o.toProof(res.signatures[i], ks)); };
async function plain(n){ const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await sleep(300); } } throw new Error('mint quote never paid'); }
const fails = async f => { try { await f(); return ''; } catch (e) { return String(e && e.message || e); } };

// ---------- the donor locks ----------
const S = key(), A = key(), B = key(), X = key(), D = key(), deadline = Math.floor(Date.now() / 1000) + 30 * 86400;
const camp = { streetcat: S.pk, payees: [A.pk, B.pk], deadline }, lock = { ...camp, refund: D.pk };
const cut = C.donationSplit(2100, denoms), don = await swapTo(await plain(2100), cut.map(a => outOf(a, C.destSecret(lock))));
check('a donation of 2 100 sat is locked, cut as the app cuts one, each proof with the mint\'s DLEQ proof and its r', sum(don) === 2100 && don.every(p => p.dleq && p.dleq.r), `${don.length} proofs, the largest ${Math.max(...don.map(p => amt(p.amount)))}`);
check('the strict reader takes every proof for this campaign\'s: Streetcat orders, two partners can be paid, one refund key', don.every(p => C.destLockProblem(C.lockOf(p.secret), camp) === ''));
const one = C.destSecret({ streetcat: S.pk, payees: [A.pk], deadline, refund: D.pk }), today = C.lockProblem(C.lockOf(one), { streetcat: S.pk, clinic: A.pk, deadline });
check('a campaign with one partner is a list of one', C.destLockProblem(C.lockOf(one), { streetcat: S.pk, payees: [A.pk], deadline }) === '' && /other keys/.test(C.destLockProblem(C.lockOf(one), camp)));
check('a campaign of today\'s kind does not take such a proof for a donation of its own', /where it goes/.test(today), today);
check('a lock is not made with a key twice, with no partner, or with the donor\'s key among the signers', [{ ...lock, payees: [] }, { ...lock, payees: [A.pk, A.pk] }, { ...lock, refund: A.pk }, { ...lock, payees: [S.pk] }].every(l => { try { C.destSecret(l); return false; } catch { return true; } }));

// ---------- Rescue makes the transaction, the partner checks it and both sign ----------
const plan = C.planRelease(don, 1500), tx = await C.destTx({ proofs: plan.inputs, pay: 1500, payee: A.pk, keysetId: ks.id, denoms });
const seenIt = C.destProblems(tx, camp, { payee: A.pk, pay: 1500 });
check('Rescue\'s transaction for 1 500 sat: the partner\'s app finds nothing wrong, 1 500 to it and the rest under the same lock', !seenIt.length && seenIt.paid === 1500 && seenIt.rest === plan.remainder && seenIt.fee === 0, seenIt.join('; ') || `${plan.inputs.length} proofs in, ${tx.outputs.length} outputs, ${seenIt.rest} sat back`);
const again = await C.destBuild({ inputs: plan.inputs, payee: A.pk, ...tx.spec }), anew = await C.destTx({ proofs: plan.inputs, pay: 1500, payee: A.pk, keysetId: ks.id, denoms });
check('built again from what a request says of it (its seed with it) it is the same transaction, letter for letter', /^[0-9a-f]{64}$/.test(tx.spec.seed) && C.destMessage(again) === C.destMessage(tx) && JSON.stringify(again.open) === JSON.stringify(tx.open));
check('made anew from the same proofs it shares no blinded message with it: nobody who knows the donation can have the mint sign its outputs first', anew.spec.seed !== tx.spec.seed && !anew.outputs.some(o => tx.outputs.some(x => x.B_ === o.B_)) && anew.outputs.length === tx.outputs.length);
check('without its seed it is not a transaction at all', /not a payment under the lock/.test(await fails(() => C.destBuild({ inputs: plan.inputs, payee: A.pk, id: ks.id, pay: tx.spec.pay, rest: tx.spec.rest }))));
const edit = f => { const t = JSON.parse(JSON.stringify(tx)); f(t); return t; }, reopen = (t, i, secret) => { const b = cashu.blindMessage(enc.encode(secret)); t.open[i] = { secret, r: b.r.toString(16).padStart(64, '0') }; t.outputs[i].B_ = b.B_.toHex(true); };
const last = tx.outputs.length - 1, changed = [
  ['one that pays 1 sat less', await C.destTx({ proofs: plan.inputs, pay: 1499, payee: A.pk, keysetId: ks.id, denoms }), /pays 1499 sat, not 1500/],
  ['one that pays the other partner', await C.destTx({ proofs: plan.inputs, pay: 1500, payee: B.pk, keysetId: ks.id, denoms }), /somewhere else/],
  ['one whose rest goes back under another refund key', edit(t => reopen(t, last, C.destSecret({ ...lock, refund: X.pk }))), /somewhere else/],
  ['one whose payment a stranger could also spend', edit(t => reopen(t, 0, JSON.stringify(['P2PK', { nonce: 'ab'.repeat(16), data: A.pk, tags: [['pubkeys', X.pk], ['n_sigs', '1']] }]))), /somewhere else/],
  ['one with an output that is not what its opening says', edit(t => { t.open[0].r = t.open[last].r; }), /not what it is said to be/],
  ['one with an output left unopened', edit(t => { t.open.pop(); }), /not every output is opened/],
  ['one with its outputs written in upper case (14 Nov: the mint\'s rule asks for them as they are rebuilt, in lower case)', edit(t => t.outputs.forEach(o => { o.B_ = o.B_.toUpperCase(); })), /not what it is said to be/],
];
for (const [what, t, re] of changed) { const p = C.destProblems(t, camp, { payee: A.pk, pay: 1500 }); check('the partner\'s app refuses ' + what, re.test(p.join('; ')), p.join('; ') || 'NOTHING FOUND'); }
check('…and one that would pay a key that is not a partner of the campaign', /not a partner/.test(C.destProblems(tx, camp, { payee: X.pk, pay: 1500 }).join('; ')));
check('…and proofs of another campaign', /not this campaign's/.test(C.destProblems(tx, { ...camp, deadline: deadline + 1 }, { payee: A.pk, pay: 1500 }).join('; ')));
const sA = C.destSign(tx, A.sk), sS = C.destSign(tx, S.sk);
check('each signature is on this very transaction, and on no changed one', C.destSigned(tx, sA, A.pk) && C.destSigned(tx, sS, S.pk) && !C.destSigned(changed[0][1], sA, A.pk) && !C.destSigned(tx, sA, B.pk));

// ---------- the mint ----------
const refusedAlone = await fails(() => C.destSwap(w, tx, [sS])), refusedOther = await fails(() => C.destSwap(w, changed[0][1], [C.destSign(changed[0][1], S.sk), sA]));
check('the mint refuses it with Streetcat\'s signature alone', /threshold not met/.test(refusedAlone), refusedAlone || 'ACCEPTED');
check('the mint refuses what Rescue changed after the partner signed (1 sat less to the partner)', /threshold not met/.test(refusedOther), refusedOther || 'ACCEPTED');
const parts = await C.destSwap(w, tx, [sS, sA]), paid = parts.filter(x => !x.rest), rest = parts.filter(x => x.rest);
check('with both signatures the mint takes it: 1 500 sat locked to the partner\'s key, the rest under the donor\'s lock', sum(paid) === 1500 && paid.every(x => x.to === A.pk) && sum(rest) === plan.remainder && rest.every(x => x.to === '') && C.destWhole(tx, parts), `${sum(paid)} + ${sum(rest)}`);
const wits = (await w.checkProofsStates(plan.inputs)).map(x => { try { return JSON.parse(x.witness); } catch { return null; } });
check('the mint keeps the witness with every proof spent, and it names the transaction\'s inputs', wits.every(x => x && x.outputs.length === tx.outputs.length) && JSON.stringify(wits[0].inputs) === JSON.stringify(plan.inputs.map(p => C.yOf(p.secret))), `${wits.filter(Boolean).length} of ${plan.inputs.length} proofs carry it`);
const found = plan.split ? await C.findRemainder(w, plan.split) : [];
check('the rest is not where anyone could work it out from the proof (a stranger could put a sat there first)', !!plan.split && !found.length, `${sum(found)} sat there`);
const t = await C.destTrace(w, don), spent = t.trace.filter(x => x.depth === 0 && x.how === 'released'), back = t.trace.filter(x => x.depth === 1);
check('the donation read from the mint alone: one release, proven by its two signatures; what was spent, what was put back (found in the witness), what is still locked', t.txs.length === 1 && t.txs[0].inputs.length === plan.inputs.length && t.txs[0].paid[A.pk] === 1500 && t.released === 1500 && t.fees === 0 && spent.length === plan.inputs.length && sum(back.map(x => x.proof)) === plan.remainder && back.map(x => x.proof.secret).sort().join() === rest.map(x => x.proof.secret).sort().join() && back.every(x => x.state === 'UNSPENT') && t.locked === 600 && !t.refunded && !t.unproven && !t.unknown, `${t.locked} sat still locked`);

// ---------- the partner needs nobody to hand its payment over ----------
const st = (await w.checkProofsStates([plan.inputs[0]]))[0], mine = (await C.destOutputs(w, st.witness, plan.inputs[0].secret)).filter(x => !x.rest && x.to === A.pk);
check('from the mint alone (NUT-07 + NUT-09) the partner finds its 1 500 sat', sum(mine) === 1500 && mine.every(x => C.lockOf(x.proof.secret).main.join() === A.pk), `${mine.length} proofs`);
const cashed = await swapTo(mine.map(x => ({ ...x.proof, witness: JSON.stringify({ signatures: [cashu.schnorrSignMessage(x.proof.secret, A.sk)] }) })), C.donationSplit(1500, denoms).map(plainOut));
check('…and spends them with its own key', sum(cashed) === 1500);

// ---------- a second release, out of what was left, to the other partner ----------
const left = [...don.filter(p => !plan.inputs.includes(p)), ...rest.map(x => x.proof)], plan2 = C.planRelease(left, 400), tx2 = await C.destTx({ proofs: plan2.inputs, pay: 400, payee: B.pk, keysetId: ks.id, denoms });
const seen2 = C.destProblems(tx2, camp, { payee: B.pk, pay: 400 });
check('what was left is one lock still: 400 sat of it for the other partner, checked by its app', sum(left) === 600 && !seen2.length, seen2.join('; '));
const parts2 = await C.destSwap(w, tx2, [C.destSign(tx2, S.sk), C.destSign(tx2, B.sk)]), paid2 = sum(parts2.filter(x => !x.rest && x.to === B.pk)), rest2 = sum(parts2.filter(x => x.rest));
check('…paid to it, and 200 sat still under the donor\'s lock', paid2 === 400 && 600 - sum(plan2.inputs) + rest2 === 200, `${paid2} paid, ${600 - sum(plan2.inputs) + rest2} left`);

say(bad ? `destcore: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'destcore: every check passed'); process.exit(bad ? 1 : 0);
