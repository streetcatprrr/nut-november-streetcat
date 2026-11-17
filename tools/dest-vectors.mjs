// Worked examples for docs/dest-lock.md, written to docs/dest-vectors.md: one spend the patched test mint accepts and the spends it
// refuses, each with the mint's own answer. Run against the patched test mint (mint/README.md, port 3340, fake money):
//   node tools/dest-vectors.mjs
// The keys are not secret: each private key is the SHA-256 of its label ("dest vector: ordering key" and so on), so anyone can sign
// the examples again. Nonces and blinding factors are random, and C comes from the test mint's own key: a run writes other values.
import fs from 'fs';
import { createHash } from 'crypto';
const APP = new URL('../app/', import.meta.url).pathname, OUT = new URL('../docs/dest-vectors.md', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3340';
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;');
const enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), sleep = ms => new Promise(r => setTimeout(r, ms));
const amt = a => (a && typeof a === 'object' && typeof a.toNumber === 'function') ? a.toNumber() : Number(a);
const call = async (path, body) => { const r = await fetch(MINT + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, ...j }; };
const info = await call('/v1/info'); if (!(((info.nuts || {})['11'] || {}).dest || []).includes('pubkeys')) { console.log('this mint does not announce the rule (mint/README.md)'); process.exit(1); }
const ks = (await call('/v1/keys')).keysets.find(k => k.unit === 'sat'), w = new cashu.Wallet(MINT); await w.loadMint();

const key = label => { const sk = createHash('sha256').update('dest vector: ' + label).digest(); return { label, sk, pk: hex(cashu.getPubKeyFromPrivKey(sk)) }; };
const S = key('ordering key'), A = key('payee A'), B = key('payee B'), X = key('stranger'), D = key('refund key'), D2 = key('another refund key');
const nonce = () => hex(cashu.createRandomSecretKey()), rHex = r => r.toString(16).padStart(64, '0');
const output = (amount, secret) => { const b = cashu.blindMessage(enc.encode(secret)); return { amount, id: ks.id, secret, r: b.r, B_: b.B_.toHex(true) }; };
const wire = p => ({ amount: p.amount, id: p.id, secret: p.secret, C: p.C, ...(p.witness ? { witness: p.witness } : {}) });
const proofOf = (o, sig) => ({ amount: amt(sig.amount), id: sig.id, secret: o.secret, C: cashu.unblindSignature(cashu.pointFromHex(sig.C_), o.r, cashu.pointFromHex(ks.keys[String(amt(sig.amount))])).toHex(true) });
async function plain(n){ const q = await w.createMintQuoteBolt11(n);
  for (let i = 0; i < 40; i++) { try { return (await w.mintProofsBolt11(n, q)).map(p => ({ amount: amt(p.amount), id: p.id, secret: p.secret, C: p.C })); } catch { await sleep(300); } } throw new Error('mint quote never paid'); }
const LOCKTIME = 1800000000;  // 15 Jan 2027, in seconds
const tags = (refund = D.pk) => [['sigflag', 'SIG_ALL'], ['n_sigs', '2'], ['pubkeys', A.pk, B.pk], ['locktime', String(LOCKTIME)], ['refund', refund], ['dest', 'pubkeys']];
const locked = (t = tags()) => JSON.stringify(['P2PK', { nonce: nonce(), data: S.pk, tags: t }]);
const payTo = (pk, t) => JSON.stringify(['P2PK', { nonce: nonce(), data: pk, ...(t ? { tags: t } : {}) }]);
const message = (inputs, outs) => inputs.map(p => p.secret + p.C).join('') + outs.map(o => String(o.amount) + o.B_).join('');
const yOf = p => cashu.hashToCurve(enc.encode(p.secret)).toHex(true);

// 3 sat locked in two proofs (2 + 1)
const mintOuts = [output(2, locked()), output(1, locked())];
const made = await call('/v1/swap', { inputs: (await plain(3)).map(wire), outputs: mintOuts.map(o => ({ amount: o.amount, id: o.id, B_: o.B_ })) });
if (!made.ok) { console.log('could not lock:', made.detail); process.exit(1); }
const inputs = mintOuts.map((o, i) => proofOf(o, made.signatures[i]));

// a spend: 1 sat paid to `to`, 2 sat back under `rest`; signed by `signers`; `edit` changes the witness before it is sent
async function spend({ to = A.pk, payTags, rest = tags(), signers = [S, A], edit = x => x } = {}){
  const outs = [output(1, payTo(to, payTags)), output(2, locked(rest))], msg = message(inputs, outs);
  const witness = edit({ signatures: signers.map(k => cashu.schnorrSignMessage(msg, k.sk)), outputs: outs.map(o => ({ secret: o.secret, r: rHex(o.r) })), inputs: inputs.map(yOf) });
  const body = { inputs: inputs.map((p, i) => wire(i ? p : { ...p, witness: JSON.stringify(witness) })), outputs: outs.map(o => ({ amount: o.amount, id: o.id, B_: o.B_ })) };
  const res = await call('/v1/swap', body); return { outs, msg, witness, body, res, signers: signers.map(k => k.label) }; }

const refused = [];
const no = async (title, o) => { const x = await spend(o); if (x.res.ok) { console.log('✗ accepted, and should not be:', title); process.exit(1); } refused.push({ title, ...x }); console.log('✓ refused ·', title, '·', x.res.detail); };
await no('The outputs are not opened', { edit: ({ outputs, ...x }) => x });
await no('An output is opened with another blinding factor', { edit: x => ({ ...x, outputs: [{ ...x.outputs[0], r: '0'.repeat(63) + '1' }, x.outputs[1]] }) });
await no('The payment goes to a key the lock does not name', { to: X.pk, signers: [S, X] });
await no('The payment goes to a payee who did not sign', { to: B.pk, signers: [S, A] });
await no('The ordering key did not sign', { signers: [A, B] });
await no('The payment carries tags', { payTags: [['locktime', '1'], ['refund', X.pk]] });
await no('The rest goes back under another lock (another refund key)', { rest: tags(D2.pk) });
await no('The witness does not list every input', { edit: x => ({ ...x, inputs: x.inputs.slice(0, 1) }) });
const ok = await spend(); if (!ok.res.ok) { console.log('✗ the valid spend was refused:', ok.res.detail); process.exit(1); }
const kept = (await call('/v1/checkstate', { Ys: inputs.map(yOf) })).states;
console.log('✓ accepted · 1 sat to payee A, 2 sat back under the lock ·', kept.map(s => s.state).join(' '), '· witness kept with', kept.filter(s => s.witness === kept[0].witness && s.witness).length, 'of', kept.length, 'inputs');

const J = x => '```json\n' + JSON.stringify(x, null, 1) + '\n```\n';
let md = '# Worked examples for the `dest` tag\n\n'
  + 'Written by `tools/dest-vectors.mjs` against the patched test mint (`mint/`, Nutshell 0.21.0, fake money). They go with\n[`dest-lock.md`](dest-lock.md): one spend the mint accepts, and the spends it refuses, each with the mint\'s own answer.\n\n'
  + 'The keys are not secret. Each private key is the SHA-256 of the text `dest vector: ` followed by its label, so every\nsignature here can be made again. `C` comes from the test mint\'s own key and the nonces are random: another run writes other values.\n\n'
  + '## Keys\n\n| label | public key |\n|---|---|\n' + [S, A, B, X, D, D2].map(k => `| ${k.label} | \`${k.pk}\` |`).join('\n') + '\n\n'
  + '## The lock\n\n3 sat in two proofs, locked to the ordering key and two payees, with a refund key after the deadline.\n\n' + J(JSON.parse(inputs[0].secret))
  + '\nThe inputs, as the mint signed them:\n\n' + J(inputs)
  + '\n## A spend the mint accepts\n\n1 sat to payee A, who signs with the ordering key, and 2 sat back under the same lock.\n\n'
  + 'The message both sign (NUT-11 `SIG_ALL`: every input\'s `secret` and `C`, then every output\'s `amount` and `B_`):\n\n```\n' + ok.msg + '\n```\n\n'
  + 'The outputs:\n\n' + J(ok.body.outputs) + '\nThe witness of the first input (signatures by: ' + ok.signers.join(', ') + '):\n\n' + J(ok.witness)
  + '\nAfter it, NUT-07 answers for the inputs: `' + kept.map(s => s.state).join('`, `') + '`, and returns that witness for each of them.\n\n'
  + '## Spends the mint refuses\n\nThe same inputs each time; a refused spend spends nothing. Only what differs from the accepted spend is said.\n\n'
  + refused.map(x => `### ${x.title}\n\nSigned by: ${x.signers.join(', ')}. The mint answers ${x.res.status}:\n\n> ${x.res.detail}\n\nThe witness sent:\n\n` + J(x.witness) + '\nIts outputs opened:\n\n' + J(x.outs.map(o => ({ amount: o.amount, B_: o.B_, secret: JSON.parse(o.secret), r: rHex(o.r) })))).join('\n');
fs.writeFileSync(OUT, md); console.log('written', OUT, md.length, 'characters');
