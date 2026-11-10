// A request, its confirmation and its release for a campaign that pays its partners straight from the lock (`dest`), as the app's own
// code does them (app/core.js: makeRequest, requestProblems, certify, checkAnswer, reqTx, destSwap, destFind), in Node against the
// patched test mint (mint/, port 3340), fake money, no browser. A campaign with a list of two partners; two donations. Rescue asks the
// second partner for 1 500 sat of the first donation and all of the second. The request says only what each transaction is (the
// keyset and the amounts): the partner's app builds each one itself, checks it as the mint will, and signs it whole. Changed requests
// are refused, a changed transaction does not carry the partner's signature, and the mint refuses what Rescue changes afterwards.
// Released, the partner finds its payment at the mint with the request alone and spends it; the rest is where a rest is looked for.
// Not covered: the pages (destflow_test), a mint with fees, the donor's refund.
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), sleep = ms => new Promise(r => setTimeout(r, ms)), amt = C.amt;
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const sum = ps => ps.reduce((a, p) => a + amt(p.amount), 0), key = () => { const sk = hex(cashu.createRandomSecretKey()); return { sk, pk: C.pubOf(sk) }; };
const fails = async f => { try { await f(); return ''; } catch (e) { return String(e && e.message || e); } }, copy = o => JSON.parse(JSON.stringify(o));

const info = await (await fetch(MINT + '/v1/info')).json();
if (!C.destMint(info)) { say('destreq: this mint does not have the patch (see mint/README.md); nothing can be tested'); process.exit(1); }
const w = new cashu.Wallet(MINT); await w.loadMint();
const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), denoms = Object.keys(ks.keys).map(Number);
const pieces = n => { const o = []; for (const s of denoms.slice().sort((x, y) => y - x)) while (n >= s) { o.push(s); n -= s; } return o; };
const outOf = (a, s) => { const b = cashu.blindMessage(enc.encode(s)); return new cashu.OutputData({ amount: cashu.Amount.from(a), id: ks.id, B_: b.B_.toHex(true) }, b.r, enc.encode(s)); };
const plainOut = a => outOf(a, hex(cashu.createRandomSecretKey()));
const wire = p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(p.witness ? { witness: p.witness } : {}) });
const swapTo = async (inputs, outs) => { const res = await w.mint.swap({ inputs: inputs.map(wire), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) }); return outs.map((o, i) => o.toProof(res.signatures[i], ks)); };
async function plain(n){ const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await sleep(300); } } throw new Error('mint quote never paid'); }

// ---------- the campaign and two donations ----------
const S = key(), A = key(), B = key(), X = key(), deadline = Math.floor(Date.now() / 1000) + 30 * 86400;
const camp = C.campaignOf({ name: 'LUNA', op: 'sterilisation', mint: MINT, streetcat: S.pk, clinic: A.pk, partners: [B.pk], lock: 'dest', deadline }), rule = { streetcat: S.pk, payees: C.payeesOf(camp), deadline };
const donate = async n => { const lock = { ...rule, refund: key().pk }; return swapTo(await plain(n), C.donationSplit(n, denoms).map(a => outOf(a, C.destSecret(lock)))); };  /* one donor, one refund key: one lock */
const don1 = await donate(2100), don2 = await donate(300), dest = { keysetId: ks.id, denoms, fee: ps => amt(w.getFeesForProofs(ps)) };
check('two donations locked for a campaign with two partners (2 100 and 300 sat)', sum(don1) === 2100 && sum(don2) === 300 && [...don1, ...don2].every(p => C.lockProblem(C.lockOf(p.secret), camp) === ''));

// ---------- Rescue's request ----------
const plan = C.planRelease(don1, 1500), form = { campaign: camp, patient: 'LUNA', procedure: 'sterilisation (spay)', date: '2026-11-12', contributions: [{ release: 1500, proofs: plan.inputs }, { release: 300, proofs: don2 }] };
const q = await C.makeRequest({ ...form, payee: B.pk, dest }), split = C.requestSplit(q);
check('the request asks the second partner and says, of each donation, what its transaction is: a keyset, amounts and a seed of its own, no more', q.payee === B.pk && C.askedOf(q) === B.pk && q.contributions.every(k => Object.keys(k.tx).sort().join() === 'id,pay,rest,seed' && k.tx.id === ks.id && /^[0-9a-f]{64}$/.test(k.tx.seed)) && new Set(q.contributions.map(k => k.tx.seed)).size === q.contributions.length, JSON.stringify({ ...q.contributions[0].tx, seed: q.contributions[0].tx.seed.slice(0, 8) + '…' }));
check('…1 500 sat of the first, its rest back under the lock; the second whole', split[0].pay === 1500 && split[0].rest === plan.remainder && split[0].fee === 0 && split[1].pay === 300 && split[1].rest === 0, split.map(x => `${x.pay} + ${x.rest} of ${x.total}`).join(' | '));
check('with no partner said it asks the campaign\'s first', (await C.makeRequest({ ...form, dest })).payee === A.pk);
check('it is not made for a key that is not a partner, nor without the mint\'s keyset', /not one of this campaign's partners/.test(await fails(() => C.makeRequest({ ...form, payee: X.pk, dest }))) && /keyset/.test(await fails(() => C.makeRequest({ ...form, payee: B.pk }))));
const size = JSON.stringify(q).length, whole = JSON.stringify({ ...q, contributions: await Promise.all(q.contributions.map(async k => { const t = await C.reqTx(q, k); return { ...k, tx: { outputs: t.outputs, open: t.open } }; })) }).length;
check('saying the transactions keeps it small (a request also goes by QR)', size < whole, `${size} characters; with every output written out, ${whole}`);

// ---------- the partner's app ----------
const feeOf = ps => amt(w.getFeesForProofs(ps));  /* what this mint charges to spend them: nothing here (destfee_test runs at one that does) */
check('the partner\'s app finds nothing wrong in it, every amount is the mint\'s, and it leaves the mint no more than its fee', !C.requestProblems(q).length && !C.amountProblems(q, { [ks.id]: ks }, feeOf).length, C.requestProblems(q).join('; '));
const edit = f => { const t = copy(q); f(t); return t; };
const refused = [
  ['one that would take more of the donation than it says', edit(t => { t.contributions[0].tx.rest = pieces(plan.remainder - 8); }), /would take 1508 sat of the donation, not 1500/],
  ['one that asks a key that is not a partner', edit(t => { t.payee = X.pk; }), /does not ask one of this campaign's partners/],
  ['one that gives out more than it spends', edit(t => { t.contributions[1].tx.rest = [64]; }), /gives out more than it spends/],
  ['one that does not say where a donation goes', edit(t => { delete t.contributions[1].tx; }), /does not say where its sats go/],
  ['one whose amounts are not whole numbers', edit(t => { t.contributions[1].tx.pay = [299.5, 0.5]; }), /does not say where its sats go/],
];
for (const [what, t, re] of refused) { const p = C.requestProblems(t); check('it refuses ' + what, re.test(p.join('; ')), p.join('; ') || 'NOTHING FOUND'); }
const short = C.amountProblems(edit(t => { t.contributions[0].tx.pay = pieces(1499); }), { [ks.id]: ks }, feeOf);
check('it refuses one that would pay 1 sat less than it says: the sat left over is not a fee of this mint', /the mint fee is false\. Report a problem\./.test(short.join('; ')) && short.wrong === 1, short.join('; ') || 'NOTHING FOUND');
// two donations' proofs in one transaction: every line of the request reads well, but they are two locks (one donor's rest would go under another's)
const mixed = edit(t => { const [a, b] = t.contributions, x = a.proofs.pop(); a.release = sum(a.proofs); a.tx = { ...a.tx, pay: pieces(a.release), rest: [] }; b.proofs = [...b.proofs, x]; b.tx = { ...b.tx, pay: pieces(300), rest: pieces(x.amount) }; });
const mixedWhy = await fails(() => C.certify(mixed, B.sk));
check('…and signs nothing when two donations\' proofs are put in one transaction, though every line of it reads well', !C.requestProblems(mixed).length && /not under one lock/.test(mixedWhy), mixedWhy || 'SIGNED');
check('the campaign\'s other partner cannot confirm it: it asks the second', /this key is not/.test(await fails(() => C.certify(q, A.sk))));
const a = await C.certify(q, B.sk, '2026-11-12T10:00:00.000Z');
check('the partner asked confirms: one signature for each donation, and its declaration names it as the one that declares', a.sigs.length === 2 && a.statement.clinic === B.pk && a.statement.campaign.lock === 'dest' && a.statement.amount === 1800);
const txs = await Promise.all(q.contributions.map(k => C.reqTx(q, k)));
check('each signature is on the whole transaction its app built from the request, where 1 500 and 300 sat go to its key', txs.every((t, i) => C.destSigned(t, a.sigs[i], B.pk)) && txs[0].pay === 1500 && txs[1].pay === 300 && txs.every((t, i) => !C.destProblems(t, rule, { payee: B.pk, pay: q.contributions[i].release }).length));

// ---------- Rescue checks the answer ----------
const v = await C.checkAnswer(q, a);
check('Rescue\'s app takes the confirmation', v.ok && v.proofs === 2 && v.signed === 2 && /payments signed whole/.test(v.text), v.text);
const less = edit(t => { const x = t.contributions[0].tx; x.pay = pieces(1499); x.rest = pieces(plan.remainder + 1); t.contributions[0].release = 1499; });
const vLess = await C.checkAnswer(less, a);
check('…and not for a request changed afterwards (1 sat less to the partner): the signature is on another transaction', !vLess.ok, vLess.text);
const vA = await C.checkAnswer(q, { ...a, sigs: txs.map(t => C.destSign(t, A.sk)) });
check('…nor one whose transactions the other partner signed', !vA.ok && vA.other === 2, vA.text);
const rep = await C.report(q, B.sk, 'postponed', 'the cat was not brought'), vRep = await C.checkAnswer(q, rep), vRepA = await C.checkAnswer(q, await C.report({ ...q, payee: A.pk }, A.sk, 'postponed'));
check('a problem is reported by the partner asked, and by no other', vRep.ok && vRep.kind === 'report' && !vRepA.ok, vRep.text);
check('its declaration is one the published ledger takes: signed by a partner of the campaign\'s list', await C.certificateOk(camp, a) && !(await C.certificateOk(camp, { ...a, statement: { ...a.statement, clinic: X.pk } })) && !(await C.certificateOk({ ...camp, partners: [] }, a)));

// ---------- the release: one transaction per donation ----------
check('before it is sent the mint knows nothing of it', (await C.destFind(w, txs[0])).length === 0);
const tLess = await C.reqTx(less, less.contributions[0]), refusedLess = await fails(() => C.destSwap(w, tLess, [C.destSign(tLess, S.sk), a.sigs[0]]));
check('the mint refuses what Rescue changes after the partner signed', /threshold not met/.test(refusedLess), refusedLess || 'ACCEPTED');
const done = []; for (let i = 0; i < txs.length; i++) done.push(await C.destSwap(w, txs[i], [C.destSign(txs[i], S.sk), a.sigs[i]]));
const paidOf = parts => parts.filter(x => !x.rest && x.to === B.pk), restOf = parts => parts.filter(x => x.rest);
check('with Streetcat\'s signature next to the partner\'s the mint takes both: 1 800 sat locked to the partner\'s key alone', sum(paidOf(done[0])) === 1500 && sum(paidOf(done[1])) === 300 && sum(restOf(done[0])) === plan.remainder && !restOf(done[1]).length, `${sum(paidOf(done[0]))} + ${sum(paidOf(done[1]))} paid, ${sum(restOf(done[0]))} back`);
const again = await fails(() => C.destSwap(w, txs[0], [C.destSign(txs[0], S.sk), a.sigs[0]]));
check('sent twice it is paid once', !!again, again || 'ACCEPTED TWICE');
const lost = await C.destFind(w, txs[0]);
check('…and what the mint did with it can be asked again (an answer lost on the way): the same parts', sum(paidOf(lost)) === 1500 && sum(restOf(lost)) === plan.remainder && lost.map(x => x.proof.secret).sort().join() === done[0].map(x => x.proof.secret).sort().join());
const found = await C.findRemainder(w, plan.split), read = await C.destTrace(w, don1), backThere = read.trace.filter(x => x.depth === 1);
check('the rest is where the donor and the status page look for one: in the witness (and nowhere a stranger could work out)', !found.length && sum(backThere.map(x => x.proof)) === plan.remainder && backThere.map(x => x.proof.secret).sort().join() === restOf(done[0]).map(x => x.proof.secret).sort().join() && read.txs.length === 1, `${sum(backThere.map(x => x.proof))} sat`);

// ---------- the partner is paid with nothing handed over ----------
const mine = []; for (const k of q.contributions) mine.push(...paidOf(await C.destFind(w, await C.reqTx(q, k))));
check('the partner finds its 1 800 sat at the mint with the request alone (NUT-09)', sum(mine) === 1800 && mine.every(x => C.lockOf(x.proof.secret).main.join() === B.pk), `${mine.length} proofs`);
const stolen = await fails(() => swapTo(mine.map(x => ({ ...x.proof, witness: JSON.stringify({ signatures: [cashu.schnorrSignMessage(x.proof.secret, S.sk)] }) })), pieces(1800).map(plainOut)));
check('Streetcat\'s key cannot spend them', !!stolen, stolen || 'SPENT');
const cashed = await swapTo(mine.map(x => ({ ...x.proof, witness: JSON.stringify({ signatures: [cashu.schnorrSignMessage(x.proof.secret, B.sk)] }) })), pieces(1800).map(plainOut));
check('the partner\'s key does', sum(cashed) === 1800);

// ---------- a campaign of today's kind is as it was ----------
const old = C.campaignOf({ name: 'MOCHI', mint: MINT, streetcat: S.pk, clinic: A.pk, deadline }), oldDon = await swapTo(await plain(64), [outOf(64, JSON.stringify(['P2PK', { nonce: hex(cashu.createRandomSecretKey()), data: S.pk, tags: [['pubkeys', A.pk], ['n_sigs', '2'], ['locktime', String(deadline)], ['refund', key().pk]] }]))]);
const oq = await C.makeRequest({ campaign: old, patient: 'MOCHI', procedure: 'spay', date: '2026-11-12', contributions: [{ proofs: oldDon }] }), oa = await C.certify(oq, A.sk), ov = await C.checkAnswer(oq, oa);
check('a request of a campaign of today\'s kind carries none of this, and is signed proof by proof as before', oq.payee === undefined && oq.contributions[0].tx === undefined && C.askedOf(oq) === A.pk && ov.ok && /all 1 proof signed/.test(ov.text) && await C.certificateOk(old, oa), ov.text);

say(bad ? `destreq: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'destreq: every check passed'); process.exit(bad ? 1 : 0);
