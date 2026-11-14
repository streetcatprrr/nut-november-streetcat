// Many spends of dest-locked ecash sent to the patched mint at the same moment (14 Nov), built by hand as a changed client would
// build them (the helpers of destaudit_test). In Node, against the patched test mint (MINT, default http://127.0.0.1:3340), on
// whatever database it runs (SQLite or Postgres: MINT_DATABASE); fake money. K copies per race (default 24), N payments at once
// (default 60).
// R1 the same proofs paid K ways at once: one settles, its witness is the one the mint keeps, nothing else is signed.
// R2 after the deadline, payments and refunds of the same proofs at once: one settles.
// R3 transactions over overlapping proofs at once: no proof is spent by a transaction that failed (all or nothing).
// R4 N independent payments at once: each settles or is refused whole, every input keeps its witness, value is conserved. On
//    Postgres with its default of 100 connections most of a burst of 200 is refused (Nutshell's pool opens up to 150): refused,
//    nothing lost; the same happens without the patch.
// R5 two transactions over different proofs whose outputs share one blinded message, at once: at most one is signed, and the one
//    refused keeps its proofs unspent.
// Not covered: the pages (destflow, destpart), a mint with fees (destfee), the rule case by case (dest_test, fuzz_test).
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3340', K = +process.env.K || 24, N = +process.env.N || 60, say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), sleep = ms => new Promise(r => setTimeout(r, ms)), amt = C.amt;
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const sum = ps => ps.reduce((a, p) => a + amt(p.amount), 0), key = () => { const sk = hex(cashu.createRandomSecretKey()); return { sk, pk: C.pubOf(sk) }; }, rnd = () => hex(cashu.createRandomSecretKey());
if (!C.destMint(await (await fetch(MINT + '/v1/info')).json())) { say(`race: needs the patched mint at ${MINT} (see mint/README.md)`); process.exit(1); }
const w = new cashu.Wallet(MINT); await w.loadMint(); const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id);
const outOf = (a, s, r) => { const b = cashu.blindMessage(enc.encode(s), r); return new cashu.OutputData({ amount: cashu.Amount.from(a), id: ks.id, B_: b.B_.toHex(true) }, b.r, enc.encode(s)); };
const wire = p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(p.witness ? { witness: p.witness } : {}) }), bm = o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ });
const post = async (path, body) => { const r = await fetch(MINT + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, ...j }; };
const rawSwap = (inputs, outs) => post('/v1/swap', { inputs: inputs.map(wire), outputs: outs.map(bm) });
const swapTo = async (inputs, outs) => { const res = await rawSwap(inputs, outs); if (!res.ok) throw new Error(res.detail); return outs.map((o, i) => o.toProof(res.signatures[i], ks)); };
async function plain(n){ const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 100; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await sleep(300); } } throw new Error('mint quote never paid'); }
const textOf = (ins, outs) => ins.map(x => x.secret + x.C).join('') + outs.map(o => String(amt(o.blindedMessage.amount)) + o.blindedMessage.B_).join('');
const opened = outs => outs.map(o => ({ secret: new TextDecoder().decode(o.secret), r: o.blindingFactor.toString(16).padStart(64, '0') })), signed = (ins, outs, sks) => sks.map(sk => cashu.schnorrSignMessage(textOf(ins, outs), sk));
const withWitness = (ins, wit) => ins.map((p, i) => i === 0 ? { ...p, witness: JSON.stringify(wit) } : { ...p, witness: undefined }), ys = ins => ins.map(p => C.yOf(p.secret));
// read after a burst, one at a time and again if the mint is busy, so that the reading is not what fails
const states = async ins => { for (let i = 0; i < 20; i++) { const r = await post('/v1/checkstate', { Ys: ys(ins) }); if (r.ok && Array.isArray(r.states)) return r.states; await sleep(500); } throw new Error('checkstate kept failing'); };
const S = key(), A = key(), now = () => Math.floor(Date.now() / 1000), payTo = k => JSON.stringify(['P2PK', { nonce: rnd(), data: k }]), same = s => { const j = JSON.parse(s); j[1].nonce = rnd(); return JSON.stringify(j); };
// a donation: plain ecash swapped into proofs under one dest lock (Streetcat orders, A is the only payee, D refunds)
const give = async (parts, deadline, D = key()) => { const lock = { streetcat: S.pk, payees: [A.pk], deadline, refund: D.pk }; return { D, lock, don: await swapTo(await plain(parts.reduce((a, b) => a + b, 0)), parts.map(a => outOf(a, C.destSecret(lock)))) }; };
// a payment on the main path: `pay` to A, the rest under the same lock; outs can be given (to share a blinded message)
const payment = (ins, pay, outs) => { const total = sum(ins); outs = outs || [outOf(pay, payTo(A.pk)), ...(total > pay ? [outOf(total - pay, same(ins[0].secret))] : [])];
  return { ins: withWitness(ins, { signatures: signed(ins, outs, [S.sk, A.sk]), outputs: opened(outs), inputs: ys(ins) }), outs }; };
const refund = (ins, D) => { const outs = [outOf(sum(ins), rnd())]; return { ins: withWitness(ins, { signatures: signed(ins, outs, [D.sk]), outputs: opened(outs) }), outs }; };
const go = txs => Promise.all(txs.map(t => rawSwap(t.ins, t.outs)));
const witnessOf = st => { try { return JSON.parse(st.witness); } catch { return null; } };
const reasons = rs => [...new Set(rs.filter(r => !r.ok).map(r => String(r.detail || r.status).slice(0, 60)))].join(' | ');

say(`race: ${MINT}, K=${K}, N=${N}`);
// ---------- R1 ----------
{ const { don } = await give([16, 16], now() + 30 * 86400), txs = Array.from({ length: K }, () => payment(don, 16)), rs = await go(txs), won = rs.map((r, i) => r.ok ? i : -1).filter(i => i >= 0);
  const st = await states(don), w0 = won.length === 1 && JSON.parse(txs[won[0]].ins[0].witness);
  check(`R1 the same two proofs paid ${K} ways at once: exactly one payment settles`, won.length === 1, `settled ${won.length}; refused: ${reasons(rs)}`);
  check('R1 …both proofs SPENT, each with the winning witness (signatures and inputs as sent)', st.length === 2 && st.every(s => s.state === 'SPENT') && st.every(s => { const x = witnessOf(s); return x && w0 && JSON.stringify(x.signatures) === JSON.stringify(w0.signatures) && JSON.stringify(x.inputs) === JSON.stringify(w0.inputs); }), st.map(s => s.state).join(','));
  const signedAgain = await Promise.all(txs.filter((_, i) => !won.includes(i)).slice(0, 4).map(t => post('/v1/restore', { outputs: t.outs.map(bm) })));
  check('R1 …and none of the losing payments\' outputs was signed (NUT-09 restore finds nothing)', signedAgain.every(r => r.ok && (r.signatures || []).length === 0), signedAgain.map(r => (r.signatures || []).length).join(','));
}
// ---------- R2 ----------
{ const { don, D } = await give([16, 16], now() - 60), half = Math.max(1, K >> 1), txs = [...Array.from({ length: half }, () => payment(don, 16)), ...Array.from({ length: half }, () => refund(don, D))];
  const rs = await go(txs.sort(() => Math.random() - .5)), won = rs.filter(r => r.ok).length, st = await states(don);
  check(`R2 after the deadline, ${half} payments and ${half} refunds of the same proofs at once: exactly one settles`, won === 1, `settled ${won}; refused: ${reasons(rs)}`);
  check('R2 …and the proofs are SPENT once', st.length === 2 && st.every(s => s.state === 'SPENT'), st.map(s => s.state).join(','));
}
// ---------- R3 ----------
{ const { don } = await give([8, 8, 8, 8, 8, 8], now() + 30 * 86400), sets = [], txs = [];
  for (let rep = 0; rep < Math.max(1, K >> 3); rep++) for (let i = 0; i < 6; i++) { const ins = [don[i], don[(i + 1) % 6]]; sets.push(ins); txs.push(payment(ins, 8)); }
  const rs = await go(txs), st = await states(don), wins = rs.map((r, i) => r.ok ? i : -1).filter(i => i >= 0), byY = Object.fromEntries(st.map(s => [s.Y, s]));
  const winY = new Set(wins.flatMap(i => ys(sets[i]))), spentY = st.filter(s => s.state === 'SPENT').map(s => s.Y);
  const disjoint = winY.size === wins.length * 2, orphan = spentY.filter(y => !winY.has(y));
  check(`R3 ${txs.length} transactions over overlapping pairs of six proofs at once: no proof in two settled transactions`, disjoint, `settled ${wins.length}`);
  check('R3 …every SPENT proof belongs to a settled transaction (a refused one spent nothing)', orphan.length === 0 && spentY.length === winY.size, `spent ${spentY.length}, in settled ${winY.size}, orphans ${orphan.length}`);
  check('R3 …each settled transaction\'s proofs carry its own witness', wins.every(i => ys(sets[i]).every(y => { const x = witnessOf(byY[y] || {}); return x && JSON.stringify(x.inputs) === JSON.stringify(ys(sets[i])); })));
}
// ---------- R4 ----------
{ const dons = []; for (let i = 0; i < N; i++) dons.push((await give([16], now() + 30 * 86400)).don);
  const txs = dons.map(d => payment(d, 8)), t0 = Date.now(), rs = await go(txs), ms = Date.now() - t0, ok = rs.filter(r => r.ok).length;
  const st = []; for (const d of dons) st.push((await states(d))[0]);
  const bad4 = st.filter((s, i) => rs[i].ok ? !(s && s.state === 'SPENT' && witnessOf(s) && JSON.stringify(witnessOf(s).inputs) === JSON.stringify(ys(dons[i]))) : !(s && s.state === 'UNSPENT'));
  const valueOut = rs.reduce((a, r) => a + (r.ok ? r.signatures.reduce((b, x) => b + amt(x.amount), 0) : 0), 0), valueIn = rs.reduce((a, r, i) => a + (r.ok ? sum(dons[i]) : 0), 0);
  check(`R4 ${N} independent payments at once: all settle`, ok === N, `settled ${ok} in ${ms} ms; refused: ${reasons(rs)}`);
  check('R4 …each settled one SPENT with its own witness, each refused one still UNSPENT', bad4.length === 0, `${bad4.length} wrong`);
  check('R4 …value conserved: signed out equals spent in (no fee)', valueOut === valueIn, `${valueIn} in, ${valueOut} out`);
}
// ---------- R5 ----------
{ const D = key(), dl = now() + 30 * 86400, x = await give([16, 16], dl, D), y = await give([16, 16], dl, D);  /* two donations under the very same lock */
  const restSecret = same(x.don[0].secret), shared = outOf(16, restSecret), twin = outOf(16, restSecret, shared.blindingFactor);  /* the same secret and r: the same B_ */
  const tx = payment(x.don, 16, [outOf(16, payTo(A.pk)), shared]), ty = payment(y.don, 16, [outOf(16, payTo(A.pk)), twin]);
  check('R5 (setup) the two transactions share one blinded message', bm(shared).B_ === bm(twin).B_);
  const rs = await go([tx, ty, tx, ty]), okX = rs[0].ok || rs[2].ok, okY = rs[1].ok || rs[3].ok, sx = await states(x.don), sy = await states(y.don);
  const spentX = sx.every(s => s.state === 'SPENT'), spentY = sy.every(s => s.state === 'SPENT'), unX = sx.every(s => s.state === 'UNSPENT'), unY = sy.every(s => s.state === 'UNSPENT');
  check('R5 two transactions over different proofs with one shared output, at once: at most one is signed', !(okX && okY), `x ${okX}, y ${okY}; refused: ${reasons(rs)}`);
  check('R5 …the refused one keeps its proofs UNSPENT, the signed one has them SPENT', (okX ? spentX : unX) && (okY ? spentY : unY), `x ${sx.map(s => s.state)}, y ${sy.map(s => s.state)}`);
}
say(bad ? `race: ${bad} failed` : 'race: every check passed');
process.exit(bad ? 1 : 0);
