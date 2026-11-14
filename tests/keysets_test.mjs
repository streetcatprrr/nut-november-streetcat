// The dest lock across a keyset rotation (14 Nov): donations locked under the mint's first keyset (no fee), then the mint started
// again on a new keyset (another derivation path, an input fee of 100 ppk) with the first one retired, then a release through the
// app's own code, the partner's amount check, a refund, and one payment from proofs of both keysets. In Node; it starts and stops
// its own patched mint (fake money): NUTSHELL_PY is a Python with Nutshell 0.21.0's dependencies (default python3), DEST_SRC the
// folder that holds the patched `cashu` package (default: ./cashu at the top of the repository, as mint/README.md makes it, or
// audit/.work/mint-dest), PORT (default 3344), DB (default a new SQLite folder; a postgres:// URL works too).
// Nutshell 0.21.0 keeps the first keyset active beside a new derivation path; a rotation has to retire it, which this does in the
// test mint's own database: still taken as input, no longer used for outputs.
// Not covered: the pages through a rotation (the app takes the keyset ids from each proof and the mint's list, which is what is
// exercised here), a rotation while a request is waiting for the partner, more than two keysets.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawn, spawnSync } from 'child_process';
const ROOT = new URL('../', import.meta.url).pathname, APP = ROOT + 'app/', say = (...a) => console.log(...a);
const PY = process.env.NUTSHELL_PY || 'python3', SRC = process.env.DEST_SRC || [ROOT, ROOT + 'audit/.work/mint-dest'].find(d => fs.existsSync(path.join(d, 'cashu/mint/dest.py')));
const PORT = +process.env.PORT || 3344, MINT = `http://127.0.0.1:${PORT}`, TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'keysets-')), DB = process.env.DB || TMP, LOG = path.join(TMP, 'mint.log');
if (!SRC) { say('keysets: needs the patched mint\'s code (DEST_SRC, see mint/README.md)'); process.exit(1); }
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), sleep = ms => new Promise(r => setTimeout(r, ms)), amt = C.amt;
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const sum = ps => ps.reduce((a, p) => a + amt(p.amount), 0), key = () => { const sk = hex(cashu.createRandomSecretKey()); return { sk, pk: C.pubOf(sk) }; }, rnd = () => hex(cashu.createRandomSecretKey());
const fails = async f => { try { await f(); return ''; } catch (e) { return String(e && e.message || e); } };
async function startMint(env){ const out = fs.openSync(LOG, 'a'), p = spawn(PY, ['-m', 'cashu.mint', '--port', String(PORT), '--host', '127.0.0.1'], { cwd: SRC, stdio: ['ignore', out, out],
    env: { ...process.env, PYTHONPATH: SRC, MINT_BACKEND_BOLT11_SAT: 'FakeWallet', FAKEWALLET_BRR: 'TRUE', MINT_PRIVATE_KEY: 'keysets-test', MINT_DATABASE: DB, MINT_MAX_WITNESS_LENGTH: '65536', MINT_LISTEN_HOST: '127.0.0.1', MINT_LISTEN_PORT: String(PORT), ...env } });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(MINT + '/v1/info')).ok) return p; } catch (_) {} await sleep(500); } p.kill(); say(`keysets: the patched mint did not start (${LOG})`); process.exit(1); }
const stopMint = p => new Promise(r => { p.on('exit', r); p.kill('SIGTERM'); });
const post = async (p, body) => { const r = await fetch(MINT + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, ...j }; };
const wire = p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(p.witness ? { witness: p.witness } : {}) }), bm = o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ });
const textOf = (ins, outs) => ins.map(x => x.secret + x.C).join('') + outs.map(o => String(amt(o.blindedMessage.amount)) + o.blindedMessage.B_).join('');
const opened = outs => outs.map(o => ({ secret: new TextDecoder().decode(o.secret), r: o.blindingFactor.toString(16).padStart(64, '0') })), signed = (ins, outs, sks) => sks.map(sk => cashu.schnorrSignMessage(textOf(ins, outs), sk));
const withWitness = (ins, wit) => ins.map((p, i) => i === 0 ? { ...p, witness: JSON.stringify(wit) } : { ...p, witness: undefined }), ys = ins => ins.map(p => C.yOf(p.secret));
const pow2 = n => { const o = []; for (let b = 1 << 20; b; b >>= 1) if (n & b) o.push(b); return o; };
const S = key(), A = key(), now = () => Math.floor(Date.now() / 1000), payTo = k => JSON.stringify(['P2PK', { nonce: rnd(), data: k }]), same = s => { const j = JSON.parse(s); j[1].nonce = rnd(); return JSON.stringify(j); };
let w, ks;
const wallet = async () => { w = new cashu.Wallet(MINT); await w.loadMint(); ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id); };
const feeOf = ps => amt(w.getFeesForProofs(ps));
const outOf = (a, s) => { const b = cashu.blindMessage(enc.encode(s)); return new cashu.OutputData({ amount: cashu.Amount.from(a), id: ks.id, B_: b.B_.toHex(true) }, b.r, enc.encode(s)); };
const swapTo = async (inputs, outs) => { const res = await post('/v1/swap', { inputs: inputs.map(wire), outputs: outs.map(bm) }); if (!res.ok) throw new Error(res.detail); return await Promise.all(outs.map(async (o, i) => o.toProof(res.signatures[i], await w.keyChain.ensureKeysetKeys(res.signatures[i].id)))); };
async function plain(n){ const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 100; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await sleep(300); } } throw new Error('mint quote never paid'); }
// plain ecash that leaves exactly `total` once the mint's input fee is paid
async function plainFor(total){ for (let extra = 0; extra < 8; extra++) { const p = await plain(total + extra); if (sum(p) - feeOf(p) === total) return p; } throw new Error('no plain amount leaves ' + total + ' after the fee'); }
const campOf = deadline => C.campaignOf({ name: 'LUNA', op: 'sterilisation', mint: MINT, streetcat: S.pk, clinic: A.pk, lock: 'dest', deadline });
const give = async (camp, parts, D = key()) => { const lock = { streetcat: S.pk, payees: C.payeesOf(camp), deadline: camp.deadline, refund: D.pk }, total = parts.reduce((a, b) => a + b, 0); return { D, lock, don: await swapTo(await plainFor(total), parts.map(a => outOf(a, C.destSecret(lock)))) }; };
const adds = x => x.total === x.locked + x.pending + x.released + x.fees + x.refunded + x.unproven + x.unknown;
const brief = x => JSON.stringify({ total: x.total, locked: x.locked, released: x.released, fees: x.fees, refunded: x.refunded, unproven: x.unproven, unknown: x.unknown });

// ---------- before: the first keyset, no fee ----------
let mint = await startMint({ MINT_DERIVATION_PATH: "m/0'/0'/0'", MINT_INPUT_FEE_PPK: '0' }); await wallet();
const ks1 = ks.id, far = campOf(now() + 30 * 86400), soon = campOf(now() + 15);
const X = await give(far, [32, 16, 8, 8]), Y = await give(soon, [16, 16]), Zd = key(), Z = await give(far, [8, 8], Zd);
say(`keysets: locked under ${ks1.slice(0, 10)}: X ${sum(X.don)} sat, Y ${sum(Y.don)} sat (deadline in 15 s), Z ${sum(Z.don)} sat`);
await stopMint(mint);
// ---------- the first keyset retired, as a rotation means ----------
{ const py = DB.startsWith('postgres')
    ? `import asyncio, asyncpg\nasync def m():\n  c = await asyncpg.connect('${DB}'.replace('postgres://', 'postgresql://'))\n  await c.execute("update keysets set active = false where id = $1", '${ks1}')\n  await c.close()\nasyncio.run(m())`
    : `import sqlite3, glob\nfor f in glob.glob('${DB}/*.sqlite3'):\n  c = sqlite3.connect(f); c.execute("update keysets set active = 0 where id = ?", ('${ks1}',)); c.commit(); c.close()`;
  const r = spawnSync(PY, ['-c', py], { encoding: 'utf8' }); if (r.status) { say('keysets: could not retire the first keyset: ' + r.stderr); process.exit(1); } }
// ---------- after: a new keyset, 100 ppk ----------
mint = await startMint({ MINT_DERIVATION_PATH: "m/0'/0'/1'", MINT_INPUT_FEE_PPK: '100' }); await wallet();
const list = (await (await fetch(MINT + '/v1/keysets')).json()).keysets || [], k1 = list.find(k => k.id === ks1), k2 = list.find(k => k.id !== ks1 && k.unit === 'sat');
say(`keysets after the rotation: ${list.map(k => `${k.id.slice(0, 10)} active=${k.active} fee=${k.input_fee_ppk}`).join(' · ')}`);
check('K1 the old keyset is still known, retired, and the new one is active with its fee', !!k1 && k1.active === false && !!k2 && k2.active === true && Number(k2.input_fee_ppk) === 100);
check('K1 …new outputs go to the new keyset (cashu-ts picks the active one)', !!k2 && ks.id === k2.id, `cheapest is ${ks.id.slice(0, 10)}`);
// the partner's check of a request's amounts: the old keyset's keys are fetched by id, as reqAmounts() in index.js does
const keysets = {}; for (const id of new Set(X.don.map(p => String(p.id)))) keysets[id] = await w.keyChain.ensureKeysetKeys(id);
const dest = { keysetId: ks.id, denoms: Object.keys(ks.keys).map(Number), fee: feeOf };
const q = await C.makeRequest({ campaign: far, patient: 'LUNA', procedure: 'spay', date: '2026-11-14', contributions: [{ release: 40, proofs: C.planRelease(X.don, 40).inputs }], dest });
const probs = C.amountProblems(q, keysets, feeOf);
check('K2 a request over proofs of the old keyset: the partner\'s amount check (DLEQ, fee) finds nothing wrong', probs.length === 0, probs.join(' | '));
const a = await C.certify(q, A.sk), tx = await C.reqTx(q, q.contributions[0]); let parts = null;
const err = await fails(async () => { parts = await C.destSwap(w, tx, [C.destSign(tx, S.sk), a.sigs[0]]); });
const x3 = await C.destTrace(w, X.don);
check('K3 released through the app\'s own code: old-keyset proofs in, new-keyset outputs out', !err && C.destWhole(tx, parts) && tx.outputs.every(o => o.id === ks.id), err);
check('K3 …the donation\'s trace adds up and shows the 40 released', adds(x3) && x3.released === 40, brief(x3));
await sleep(Math.max(0, (soon.deadline - now() + 2) * 1000));
{ const fee = feeOf(Y.don), outs = pow2(sum(Y.don) - fee).map(n => outOf(n, rnd())), ins = withWitness(Y.don, { signatures: signed(Y.don, outs, [Y.D.sk]), outputs: opened(outs) });
  const r = await post('/v1/swap', { inputs: ins.map(wire), outputs: outs.map(bm) });
  check('K4 after the deadline the donor takes back proofs of the old keyset, into the new one', r.ok, r.ok ? `fee ${fee}` : String(r.detail)); }
{ const Z2 = await give(far, [16], Zd), ins = [...Z.don, ...Z2.don], fee = feeOf(ins), total = sum(ins), rest = total - fee - 16;  /* the same lock across both keysets */
  const outs = [outOf(16, payTo(A.pk)), ...pow2(rest).map(n => outOf(n, same(ins[0].secret)))], r = await post('/v1/swap', { inputs: withWitness(ins, { signatures: signed(ins, outs, [S.sk, A.sk]), outputs: opened(outs), inputs: ys(ins) }).map(wire), outputs: outs.map(bm) });
  const z = await C.destTrace(w, ins), ids = [...new Set(ins.map(p => p.id))];
  check(`K5 one payment from proofs of both keysets (${ids.length} keysets), fee ${fee}: the mint takes it`, ids.length === 2 && r.ok, r.ok ? '' : String(r.detail));
  check('K5 …and the trace adds up, the fee counted as a fee', adds(z) && z.released === 16 && z.fees === fee, brief(z)); }
await stopMint(mint);
say(bad ? `keysets: ${bad} failed` : 'keysets: every check passed');
process.exit(bad ? 1 : 0);
