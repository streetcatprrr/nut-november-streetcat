// Fuzzing (11 Nov): cases made at random from a seed, thousands of them, each judged by a rule written here and not by hand.
//   A · the app's own readers (app/core.js), in Node: a lock, an invoice and a signed campaign, damaged at random. None may throw,
//       and none may be taken for good unless it still means what the undamaged one meant.
//   B · the mint with the `dest` rule (docs/dest-lock.md), over HTTP: random spends of locked ecash (who signs, where each output
//       goes, how the witness is written). A model of the rule says, before the mint is asked, whether it must accept; every
//       answer is compared with it. At the end the books must balance: all that was locked is still locked or was paid to a partner
//       who signed, and nothing else.
// A failure prints the seed and the case, so it can be run again: SEED=… node tests/fuzz_test.mjs. More cases: FUZZ_A=… FUZZ_B=…
// Needs the patched test mint (MINT, default http://127.0.0.1:3340; fake money). Not a proof: a fuzzer finds what it stumbles on.
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, enc = new TextEncoder(), amt = C.amt, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const SEED = Number(process.env.SEED || Date.now() % 2147483647), NA = Number(process.env.FUZZ_A || 4000), NB = Number(process.env.FUZZ_B || 300);
let st = SEED >>> 0; const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = n => Math.floor(rnd() * n), pick = a => a[int(a.length)], chance = p => rnd() < p, rhex = n => Array.from({ length: n }, () => '0123456789abcdef'[int(16)]).join('');
const weighted = pairs => { let x = rnd() * pairs.reduce((s, [, w]) => s + w, 0); for (const [v, w] of pairs) { if ((x -= w) < 0) return v; } return pairs[0][0]; };
say(`seed ${SEED} · ${NA} damaged inputs for the app's readers · ${NB} random spends at ${MINT}`);
const key = () => { const sk = rhex(64); return { sk, pk: C.pubOf(sk) }; }  /* from the seed, so a run can be made again */, S = key(), A = key(), B = key(), D = key(), X = key();
const FAR = Math.floor(Date.now() / 1000) + 30 * 86400, nonce = () => rhex(64);
const TAGS = [['sigflag', 'SIG_ALL'], ['n_sigs', '2'], ['pubkeys', A.pk, B.pk], ['locktime', String(FAR)], ['refund', D.pk], ['dest', 'pubkeys']];
const lock = (tags = TAGS, data = S.pk) => JSON.stringify(['P2PK', { nonce: nonce(), data, tags }]), pay = (pk, more = {}) => JSON.stringify(['P2PK', { nonce: nonce(), data: pk, ...more }]);

// ---------- damage ----------
const JUNK = [null, true, 0, -1, 1e21, '', ' ', 'x', [], {}, [[]], '\u0000', '02' + 'f'.repeat(64), '__proto__'];
const dmgText = s => { const i = int(s.length + 1), j = int(s.length + 1), c = pick(['"', '[', ']', '{', '}', ',', ':', ' ', '0', 'f', 'A', '\\', 'é', '\n']);
  switch (int(7)) { case 0: return s.slice(0, i) + s.slice(i + 1); case 1: return s.slice(0, i) + c + s.slice(i); case 2: return s.slice(0, i) + c + s.slice(i + 1);
    case 3: return s.slice(0, Math.min(i, j)) + s.slice(Math.max(i, j)); case 4: return s.slice(0, i) + s.slice(j, j + 9) + s.slice(i); case 5: return s.slice(0, i) + s.slice(i).toUpperCase(); default: return c + s; } };
const paths = (v, p = []) => v && typeof v === 'object' ? [p, ...Object.keys(v).flatMap(k => paths(v[k], [...p, k]))] : [p];
const dmgJson = v => { const o = JSON.parse(JSON.stringify(v)), ps = paths(o).filter(p => p.length), p = pick(ps); let at = o; for (const k of p.slice(0, -1)) at = at[k]; const k = p[p.length - 1];
  switch (int(5)) { case 0: at[k] = pick(JUNK); break; case 1: if (Array.isArray(at)) at.splice(Number(k), 1); else delete at[k]; break; case 2: if (Array.isArray(at)) at.splice(Number(k), 0, at[k]); else at[k + 'x'] = at[k]; break;
    case 3: if (typeof at[k] === 'string') at[k] = dmgText(at[k]); else at[k] = pick(JUNK); break; default: if (Array.isArray(at) && at.length > 1) { const m = int(at.length); [at[k], at[m]] = [at[m], at[k]]; } else at[k] = pick(JUNK); } return o; };

// ---------- A · the app's readers ----------
const camp = { name: 'FUZZ', op: 'sterilisation', mint: MINT, streetcat: S.pk, clinic: A.pk, partners: [B.pk], payees: [A.pk, B.pk], deadline: FAR, lock: 'dest' };
// what a lock says: its kind, its key and its tags. The order of the tags says nothing (the mint reads them by name, and the app
// writes the rest of a donation with that donation's own tags, as they come); the order of the keys inside a tag does.
// The refund key is the donor's own, any key but Streetcat's or a partner's.
const meaning = secret => { const j = JSON.parse(secret); return JSON.stringify([j[0], j[1].data, j[1].tags.map(t => t[0] === 'refund' && t.length === 2 ? 'refund: one key, whoever the donor is' : JSON.stringify(t)).sort(), j.length, Object.keys(j[1]).sort()]); }, MEANS = meaning(lock());
const quote = async sat => (await (await fetch(MINT + '/v1/mint/quote/bolt11', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: sat, unit: 'sat' }) })).json()).request;
const invoice = await quote(2100), INV = C.invoiceExpiry(invoice), signed = await C.signCampaign({ name: 'FUZZ', op: 'sterilisation', mint: MINT, streetcat: S.pk, clinic: A.pk, deadline: FAR, hue: 120 }, S.sk);
const SIGNED = C.canon(C.campSigned(signed)), wrong = { lock: [], invoice: [], campaign: [] }; let counted = 0, read = 0, held = 0;
for (let i = 0; i < NA; i++) { const how = int(3);
  if (how === 0) { const base = lock(), s = chance(0.5) ? dmgText(base) : JSON.stringify(dmgJson(JSON.parse(base))); let p;
    try { p = C.destLockProblem(C.lockOf(s), camp); } catch (e) { wrong.lock.push(`threw "${e.message}" on ${s}`); continue; }
    if (!p) { counted++; let same = false; try { same = meaning(s) === MEANS && typeof JSON.parse(s)[1].nonce === 'string' && JSON.parse(s)[1].nonce.length > 0; } catch (_) {} if (!same) wrong.lock.push(`counted as the campaign's: ${s}`); } }
  else if (how === 1) { const s = dmgText(invoice); let r;
    try { r = C.invoiceExpiry(s); } catch (e) { wrong.invoice.push(`threw "${e.message}" on ${s}`); continue; }
    if (r) { read++; if (s.trim().toLowerCase().replace(/^lightning:/, '') !== invoice.toLowerCase() || r.msat !== INV.msat || r.expires !== INV.expires) wrong.invoice.push(`read as ${r.msat} msat: ${s}`); } }
  else { const c = dmgJson(signed); let r, same = false;
    try { r = await C.campaignSig(c); } catch (e) { wrong.campaign.push(`threw "${e.message}" on ${JSON.stringify(c)}`); continue; }
    if (r === 'signed') { held++; try { same = C.canon(C.campSigned(c)) === SIGNED; } catch (_) {} if (!same) wrong.campaign.push(`signed, and it says something else: ${JSON.stringify(c)}`); } } }
const show = a => a.length ? `${a.length}, the first: ${a[0].slice(0, 400)}` : '';
check(`a lock damaged at random is never counted as the campaign's unless it still says the same, and the check never throws`, !wrong.lock.length, show(wrong.lock) || `${counted} still said the same`);
check(`an invoice damaged at random is never read as another, and the reader never throws`, INV && INV.msat === 2100000 && !wrong.invoice.length, show(wrong.invoice) || `${read} still the same invoice`);
check(`a signed campaign damaged at random is never "signed" unless it still says the same, and the check never throws`, !wrong.campaign.length, show(wrong.campaign) || `${held} still said the same`);

// ---------- B · the mint's rule against a model of it ----------
const w = new cashu.Wallet(MINT); await w.loadMint(); const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), denoms = Object.keys(ks.keys).map(Number).sort((a, b) => b - a);
const info = await (await fetch(MINT + '/v1/info')).json(), rule = !!C.destMint(info), fee = amt(w.getFeesForProofs([{ id: ks.id, amount: 1 }]));
if (!rule || fee) { say(rule ? 'this mint charges input fees: the model here is for a mint without them' : 'this mint does not have the rule: part B needs the patched mint'); check('the mint has the rule and no input fee', false); process.exit(1); }
const pieces = n => { const o = []; for (const s of denoms) while (n >= s) { o.push(s); n -= s; } return o; };
const outOf = (a, s) => { const b = cashu.blindMessage(enc.encode(s)); return { amount: a, secret: s, r: b.r.toString(16).padStart(64, '0'), B_: b.B_.toHex(true), data: new cashu.OutputData({ amount: cashu.Amount.from(a), id: ks.id, B_: b.B_.toHex(true) }, b.r, enc.encode(s)) }; };
const post = async (path, body) => { const r = await fetch(MINT + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, ...j }; };
const wire = p => ({ id: p.id, amount: p.amount, secret: p.secret, C: p.C, ...(p.witness ? { witness: p.witness } : {}) });
const swap = async (ins, outs) => { const res = await post('/v1/swap', { inputs: ins.map(wire), outputs: outs.map(o => ({ amount: o.amount, id: ks.id, B_: o.B_ })) }); if (res.ok) res.proofs = outs.map((o, i) => { const p = o.data.toProof(res.signatures[i], ks); return { id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C }; }); return res; };
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 60; i++) { try { return (await w.mintProofsBolt11(n, q)).map(p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C })); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('the mint quote was never paid'); };
const yOf = s => cashu.hashToCurve(enc.encode(s)).toHex(true), states = async ps => ps.length ? (await post('/v1/checkstate', { Ys: ps.map(p => yOf(p.secret)) })).states : [];
const donate = async (n, each = 32) => { const r = await swap(await plain(n), Array.from({ length: n / each }, () => outOf(each, lock()))); if (!r.ok) throw new Error('could not lock: ' + r.detail); return r.proofs; };
const message = (ins, outs) => ins.map(p => p.secret + p.C).join('') + outs.map(o => String(o.amount) + o.B_).join('');
// where an output may go, and whether the rule allows it
const KINDS = { payA: [() => pay(A.pk), 'A'], payB: [() => pay(B.pk), 'B'], rest: [() => lock(), 'rest'],
  plain: [() => nonce()], payX: [() => pay(X.pk)], payS: [() => pay(S.pk)], payD: [() => pay(D.pk)], payAupper: [() => pay(A.pk.toUpperCase())], payAtagged: [() => pay(A.pk, { tags: [['locktime', '1']] })], payAspace: [() => ' ' + pay(A.pk)],
  restRefund: [() => lock(TAGS.map(t => t[0] === 'refund' ? ['refund', X.pk] : t))], restLater: [() => lock(TAGS.map(t => t[0] === 'locktime' ? ['locktime', String(FAR + 1 + int(9999))] : t))], restNoDest: [() => lock(TAGS.filter(t => t[0] !== 'dest'))],
  restOrder: [() => lock([...TAGS].reverse())], restData: [() => lock(TAGS, X.pk)], restPayee: [() => lock(TAGS.map(t => t[0] === 'pubkeys' ? ['pubkeys', A.pk, B.pk, X.pk] : t))], restOne: [() => lock(TAGS.map(t => t[0] === 'n_sigs' ? ['n_sigs', '1'] : t))] };
const GOOD = [['payA', 30], ['payB', 14], ['rest', 30]], BADK = Object.keys(KINDS).filter(k => !KINDS[k][1]).map(k => [k, 1]);
const SIGNERS = [[['S', 'A'], 34], [['S', 'A', 'B'], 18], [['S', 'B'], 14], [['S'], 5], [['A', 'B'], 5], [['D'], 3], [['S', 'X'], 3], [['S', 'A', 'X'], 4], [['S', 'A', 'B', 'D'], 3], [['A'], 2], [[], 2], [['S', 'S'], 2], [['S', 'D'], 2], [['X', 'A', 'B'], 2]];
const KEYS = { S, A, B, D, X }, DEFECTS = [['none', 68], ['noInputs', 5], ['reversed', 5], ['extraInput', 3], ['dropOpening', 4], ['wrongR', 4], ['onSecond', 4], ['otherOutputs', 4], ['noWitness', 3]];
let pool = await donate(4096); const START = 4096, paid = { A: 0, B: 0 }, spent = [], mism = []; let accepted = 0, refused = 0, restMade = 0; const whyNot = new Map();
for (let i = 0; i < NB; i++) { if (!pool.length) break;
  const ins = []; for (let n = 1 + int(3), tries = 0; ins.length < n && tries < 9; tries++) { const p = pick(pool); if (!ins.includes(p)) ins.push(p); }
  let parts = pieces(ins.reduce((s, p) => s + p.amount, 0)); for (let n = int(3); n > 0; n--) { const k = int(parts.length); if (parts[k] > 1 && parts.length < 7) parts.splice(k, 1, parts[k] / 2, parts[k] / 2); }
  const allGood = chance(0.72), kinds = parts.map(() => weighted(allGood ? GOOD : [...GOOD, ...BADK.map(([k]) => [k, 4])])), outs = parts.map((a, k) => outOf(a, KINDS[kinds[k]][0]()));
  const who = weighted(SIGNERS), defect = weighted(DEFECTS), sigs = who.map(n => cashu.schnorrSignMessage(message(ins, outs), KEYS[n].sk));
  let W = { signatures: sigs, outputs: outs.map(o => ({ secret: o.secret, r: o.r })), inputs: ins.map(p => yOf(p.secret)) }, at = 0, broken = false;
  if (defect === 'noInputs') { delete W.inputs; broken = true; } else if (defect === 'reversed') { W.inputs.reverse(); broken = ins.length > 1; } else if (defect === 'extraInput') { W.inputs.push(yOf(nonce())); broken = true; }
  else if (defect === 'dropOpening') { W.outputs.pop(); broken = true; } else if (defect === 'wrongR') { W.outputs[int(W.outputs.length)].r = rhex(64); broken = true; }
  else if (defect === 'onSecond') { at = ins.length > 1 ? 1 : 0; broken = ins.length > 1; } else if (defect === 'otherOutputs') { const other = [outOf(1, pay(A.pk))]; W.signatures = who.map(n => cashu.schnorrSignMessage(message(ins, other), KEYS[n].sk)); broken = true; }
  else if (defect === 'noWitness') { W = null; broken = true; }
  const signers = new Set(who.filter(n => 'SAB'.includes(n))), tos = kinds.map(k => KINDS[k][1]);
  const must = !broken && sigs.length <= 3 && signers.has('S') && signers.size >= 2 && tos.every(Boolean) && tos.every(t => t === 'rest' || signers.has(t));
  const res = await swap(ins.map((p, k) => k === at && W ? { ...p, witness: JSON.stringify(W) } : p), outs), told = `#${i}: ${ins.length} in → ${kinds.join(',')} · signed ${who.join('') || 'nobody'} · ${defect}`;
  if (res.ok !== must) { mism.push(`${told} · the model said ${must ? 'accept' : 'refuse'}, the mint ${res.ok ? 'ACCEPTED' : 'refused: ' + res.detail}`); if (!res.ok) continue; }
  if (!res.ok) { refused++; const y = String(res.detail || res.status).replace(/\d+/g, 'N').slice(0, 60); whyNot.set(y, (whyNot.get(y) || 0) + 1); continue; }
  accepted++; pool = pool.filter(p => !ins.includes(p)); spent.push(...ins); res.proofs.forEach((p, k) => { if (tos[k] === 'rest') { pool.push(p); restMade++; } else if (tos[k]) paid[tos[k]] += p.amount; else mism.push(`${told} · ${p.amount} sat LEFT THE LOCK to ${kinds[k]}`); }); }
check(`the mint and the model agree on every random spend`, !mism.length, mism.length ? `${mism.length}, the first: ${mism[0]}` : `${accepted} accepted, ${refused} refused (${[...whyNot].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${n}× ${k}`).join(' · ')})`);
const locked = pool.reduce((s, p) => s + p.amount, 0), unspent = (await states(pool)).every(s => s.state === 'UNSPENT'), gone = (await states(spent)).every(s => s.state === 'SPENT' && s.witness);
check(`the books balance: what was locked is still locked or was paid to a partner who signed`, locked + paid.A + paid.B === START && unspent && gone, `${START} locked · ${locked} still locked in ${pool.length} proofs (${restMade} rests made) · ${paid.A} to one partner, ${paid.B} to the other · every spent proof carries its record: ${gone}`);
check(`the run tried enough of each: spends accepted and refused, payments and rests`, accepted >= Math.min(20, NB / 8) && refused >= Math.min(20, NB / 8) && paid.A + paid.B > 0 && restMade > 0, `${accepted} accepted · ${refused} refused`);
say(bad ? `fuzz: ${bad} check(s) failed · SEED=${SEED}` : `fuzz: every check passed · seed ${SEED}`); process.exit(bad ? 1 : 0);
