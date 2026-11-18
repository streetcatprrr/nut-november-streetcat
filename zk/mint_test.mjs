// The proof against a mint: a `dest` spend whose payment stays blinded, carrying a proof instead of its opening.
// Needs the experiment's mint (zk/README.md) and the setup in build/:  MINT=http://127.0.0.1:3342 node mint_test.mjs
// With PLAIN=<a mint that has the dest patch but not this experiment>, the same spend is tried there too and must be refused.
import fs from 'fs';
import { createHash } from 'crypto';
import * as snarkjs from 'snarkjs';
import { inputsOf, findNonce } from './witness.mjs';

const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3342', PLAIN = process.env.PLAIN || '';
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;');
const WASM = 'build/paydest_js/paydest.wasm', ZKEY = 'build/paydest.zkey';
const enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), sleep = ms => new Promise(r => setTimeout(r, ms));
const amt = a => (a && typeof a === 'object' && typeof a.toNumber === 'function') ? a.toNumber() : Number(a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (more ? ' · ' + more : '')); };
let M = { url: MINT };
const call = async (path, body) => { const r = await fetch(M.url + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, ...j }; };
const refused = (res, re) => !res.ok && re.test(res.detail || '');
const use = async url => { M = { url }; const ks = (await call('/v1/keys')).keysets.find(k => k.unit === 'sat'); M.kid = ks.id; M.keys = ks.keys; M.w = new cashu.Wallet(url); await M.w.loadMint(); };

const key = () => { const sk = cashu.createRandomSecretKey(); return { sk, pk: hex(cashu.getPubKeyFromPrivKey(sk)) }; };
const nonce = () => hex(cashu.createRandomSecretKey());
const output = (amount, secret) => { const b = cashu.blindMessage(enc.encode(secret)); return { amount, id: M.kid, secret, r: b.r, B_: b.B_.toHex(true) }; };
const rHex = r => r.toString(16).padStart(64, '0');
const pieces = n => { const out = []; for (let i = 30; i >= 0; i--) if (n & (1 << i)) out.push(1 << i); return out; };
const wire = p => ({ amount: p.amount, id: p.id, secret: p.secret, C: p.C, ...(p.witness ? { witness: p.witness } : {}) });
const proofOf = (o, sig) => ({ amount: amt(sig.amount), id: sig.id, secret: o.secret, C: cashu.unblindSignature(cashu.pointFromHex(sig.C_), o.r, cashu.pointFromHex(M.keys[String(amt(sig.amount))])).toHex(true) });
async function swap(inputs, outs){ const res = await call('/v1/swap', { inputs: inputs.map(wire), outputs: outs.map(o => ({ amount: o.amount, id: o.id, B_: o.B_ })) });
  return res.ok ? { ok: true, proofs: outs.map((o, i) => proofOf(o, res.signatures[i])) } : res; }
async function plain(n){ const q = await M.w.createMintQuoteBolt11(n);
  for (let i = 0; i < 40; i++) { try { return (await M.w.mintProofsBolt11(n, q)).map(p => ({ amount: amt(p.amount), id: p.id, secret: p.secret, C: p.C })); } catch { await sleep(300); } } throw new Error('mint quote never paid'); }
const ysOf = ps => ps.map(p => cashu.hashToCurve(enc.encode(p.secret)).toHex(true));
const message = (inputs, outs) => inputs.map(p => p.secret + p.C).join('') + outs.map(o => String(o.amount) + o.B_).join('');
const sum = ps => ps.reduce((a, p) => a + p.amount, 0);

// the lock: an ordering key, two payees, a stranger, the donor's refund key
const S = key(), A = key(), B = key(), X = key(), D = key();
const TAGS = [['sigflag', 'SIG_ALL'], ['n_sigs', '2'], ['pubkeys', A.pk, B.pk], ['locktime', String(Math.floor(Date.now() / 1000) + 30 * 86400)], ['refund', D.pk], ['dest', 'pubkeys']];
const locked = () => JSON.stringify(['P2PK', { nonce: nonce(), data: S.pk, tags: TAGS }]);
const donate = async n => { const r = await swap(await plain(n), pieces(n).map(a => output(a, locked()))); if (!r.ok) throw new Error('could not lock: ' + r.detail); return r.proofs; };
// an output that pays `pk`, written the one way the circuit knows, with its blinding factor kept
const paying = (amount, pk, r = BigInt('0x' + nonce())) => { const w = inputsOf({ keyHex: pk, nonce: findNonce(pk, nonce()), r }); return { amount, id: M.kid, secret: w.secret, r, B_: w.B_, input: w.input }; };
// the same, left blinded: the proof that it pays `pk` goes in place of its opening
async function hidden(amount, pk){ const o = paying(amount, pk); o.proof = (await snarkjs.groth16.fullProve(o.input, WASM, ZKEY)).proof; return o; }
const entry = (o, pay) => o.proof ? { pay: pay || JSON.parse(o.secret)[1].data, proof: o.proof } : { secret: o.secret, r: rHex(o.r) };
const spend = (inputs, outs, signers, entries = outs.map(o => entry(o))) => {
  const witness = JSON.stringify({ signatures: signers.map(k => cashu.schnorrSignMessage(message(inputs, outs), k.sk)), outputs: entries, inputs: ysOf(inputs) });
  return swap(inputs.map((p, i) => i ? p : { ...p, witness }), outs); };

await use(MINT);
const info = await call('/v1/info'), nut11 = (info.nuts || {})['11'] || {};
const print = createHash('sha256').update(fs.readFileSync('build/vkey.json')).digest('hex');
check('the mint announces the key it checks proofs with', nut11.dest_zk === print, String(nut11.dest_zk).slice(0, 16));
if (!nut11.dest_zk) { console.log('this mint does not take proofs: nothing else can be tested'); process.exit(1); }

const don = await donate(100), rest = () => pieces(92).map(a => output(a, locked()));
const t0 = Date.now(); const payA = await hidden(8, A.pk); const proveMs = Date.now() - t0;
const payX = await hidden(8, X.pk);
const other = { ...paying(8, A.pk), proof: payA.proof };

// ---------- what must be refused ----------
let r = await spend(don, [payX, ...rest()], [S, A]);
check('refused: a blinded payment to a key the lock does not list', refused(r, /does not allow/), r.detail);
let o = [payX, ...rest()]; r = await spend(don, o, [S, A], o.map((x, i) => i ? entry(x) : entry(x, A.pk)));
check('refused: a stranger\'s output shown as paying a payee', refused(r, /does not show/), r.detail);
o = [payA, ...rest()]; r = await spend(don, o, [S, B], o.map((x, i) => i ? entry(x) : entry(x, B.pk)));
check('refused: one payee\'s proof shown for the other payee', refused(r, /does not show/), r.detail);
r = await spend(don, [payA, ...rest()], [S, B]);
check('refused: a payee paid blind without its signature', refused(r, /without its signature/), r.detail);
r = await spend(don, [other, ...rest()], [S, A]);
check('refused: a proof made for one output, shown for another to the same payee', refused(r, /does not show/), r.detail);
const forged = { ...payA, proof: { ...payA.proof, pi_a: payA.proof.pi_c, pi_c: payA.proof.pi_a } };
r = await spend(don, [forged, ...rest()], [S, A]);
check('refused: a proof with two of its parts swapped', refused(r, /does not show/), r.detail);
o = [payA, ...rest()]; r = await spend(don, o, [S, A], o.map((x, i) => i ? entry(x) : { pay: A.pk, proof: payA.proof, secret: payA.secret }));
check('refused: an entry that is neither an opening nor a proof', refused(r, /malformed witness/), r.detail);
o = [payA, ...rest()]; r = await spend(don, o, [S, A], o.map(() => ({ pay: A.pk, proof: payA.proof })));
check('refused: what stays under the lock shown as a payment', refused(r, /does not show/), r.detail);
if (PLAIN) { const here = M; await use(PLAIN); const d2 = await donate(100); r = await spend(d2, [{ ...payA, id: M.kid }, ...rest()], [S, A]);
  check('refused where the experiment is not installed', !r.ok, r.detail); M = here; }

// ---------- what is allowed ----------
o = [payA, ...rest()]; const t1 = Date.now(); r = await spend(don, o, [S, A]); const swapMs = Date.now() - t1;
check('a payment left blinded, with its proof, is accepted', r.ok === true, r.detail || '');
if (r.ok) {
  const mine = r.proofs.slice(0, 1), back = r.proofs.slice(1);
  check('the payee holds 8 and 92 stay under the lock', sum(mine) === 8 && sum(back) === 92);
  const st = (await call('/v1/checkstate', { Ys: ysOf(don) })).states;
  const kept = st.map(s => s.witness || '').join('');
  check('the mint\'s record of the spend holds the proof and the payee', st.every(s => s.state === 'SPENT') && kept.includes(A.pk) && kept.includes('pi_a'));
  check('and neither the payment\'s secret nor its blinding factor', !kept.includes(JSON.parse(payA.secret)[1].nonce) && !kept.includes(rHex(payA.r)));
  // the money is really the payee's: it spends it with its own signature, into ordinary ecash
  const outs = pieces(8).map(a => output(a, nonce()));
  const signed = mine.map(p => ({ ...p, witness: JSON.stringify({ signatures: [cashu.schnorrSignMessage(p.secret, A.sk)] }) }));
  let s = await swap(mine, outs); check('refused: the blinded payment spent without the payee\'s signature', !s.ok, s.detail);
  s = await swap(signed, outs); check('the payee spends its payment', s.ok === true, s.detail || '');
  // and what stayed under the lock still obeys it
  const again = await spend(back, pieces(92).map(a => output(a, nonce())), [S, A]);
  check('refused: the rest taken out of the lock afterwards', !again.ok, again.detail);
}
console.log(JSON.stringify({ proveMs, swapMs }));
console.log(bad ? `${bad} check(s) failed` : 'every check passed'); process.exit(bad ? 1 : 0);
