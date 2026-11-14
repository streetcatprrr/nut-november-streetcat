// Where locked ecash may go: the `dest` tag (docs/dest-lock.md), against the patched test mint (mint/: Nutshell 0.21.0 with the patch, fake
// money, port 3340). No browser and no app: this is the rule itself, spoken to the mint over HTTP with the app's own cashu-ts bundle for
// the curve arithmetic. A donor locks ecash to an ordering key (Streetcat) and two payees (clinics); then everything a changed client or
// two signers who agree could try is tried, and has to be refused: outputs not opened, opened falsely, unlocked, locked to a stranger, to
// the ordering key, to a payee who did not sign or with a back door in its tags; the rest put back under another lock; a melt. What is
// allowed is checked too: a payee paid for what it signed, the rest under the very same lock (twice over), the payee rebuilding its
// payment from the mint alone (NUT-07 + NUT-09), and the donor's refund after the deadline, untouched. After the audit of 10 Nov
// (docs/dest-lock.md): the witness is kept with every input, so a proof of the signers' own put first hides nothing from the donor;
// a lock that asks for one signature is refused; a blinding factor is written one way, and (14 Nov) so is an output; a refund's witness may hold anything else,
// and a lock with no refund key never opens to a stranger. Not covered here: the app (tests/dest*_test.mjs), and load.
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;');
const enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), sleep = ms => new Promise(r => setTimeout(r, ms));
const amt = a => (a && typeof a === 'object' && typeof a.toNumber === 'function') ? a.toNumber() : Number(a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
let M = { url: MINT };  // the mint being spoken to: its address, its keyset and a cashu-ts wallet that mints the test ecash
const call = async (path, body) => { const r = await fetch(M.url + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, ...j }; };
const refused = (res, re) => !res.ok && re.test(res.detail || '');

// ---------- the mint ----------
const info = await call('/v1/info'), nut11 = (info.nuts || {})['11'] || {};
check('the mint announces the rule under NUT-11', Array.isArray(nut11.dest) && nut11.dest.includes('pubkeys'), JSON.stringify(nut11));
if (!nut11.dest) { say('dest: this mint does not have the patch (see mint/README.md); nothing else can be tested'); process.exit(1); }
const use = async url => { M = { url }; const ks = (await call('/v1/keys')).keysets.find(k => k.unit === 'sat'); M.kid = ks.id; M.keys = ks.keys; M.w = new cashu.Wallet(url); await M.w.loadMint(); };
await use(MINT);

// ---------- ecash by hand: outputs whose secret and blinding factor we keep, so they can be opened ----------
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
const states = async proofs => (await call('/v1/checkstate', { Ys: proofs.map(p => cashu.hashToCurve(enc.encode(p.secret)).toHex(true)) })).states;
const allState = async (proofs, st) => (await states(proofs)).every(s => s.state === st);

// ---------- the lock ----------
const S = key(), A = key(), B = key(), X = key(), D = key();  // ordering key (Streetcat), two payees (clinics), a stranger, the donor's refund key
const FAR = Math.floor(Date.now() / 1000) + 30 * 86400;
const lockTags = ({ payees = [A.pk, B.pk], locktime = FAR, refund = D.pk, dest = 'pubkeys', sigflag = 'SIG_ALL', n = '2' } = {}) =>
  [...(sigflag ? [['sigflag', sigflag]] : []), ...(n ? [['n_sigs', n]] : []), ['pubkeys', ...payees], ['locktime', String(locktime)], ...(refund ? [['refund', refund]] : []), ...(dest ? [['dest', dest]] : [])];
const locked = (tags, data = S.pk, n = nonce()) => JSON.stringify(['P2PK', { nonce: n, data, tags }]);
const payTo = (pk, tags) => JSON.stringify(['P2PK', { nonce: nonce(), data: pk, ...(tags ? { tags } : {}) }]);
const donate = async (n, tags) => { const r = await swap(await plain(n), pieces(n).map(a => output(a, locked(tags)))); if (!r.ok) throw new Error('could not lock: ' + r.detail); return r.proofs; };
const message = (inputs, outs, quote = '') => inputs.map(p => p.secret + p.C).join('') + outs.map(o => String(o.amount) + o.B_).join('') + quote;
// a spend of `inputs` into `outs`, signed by `signers` over this very transaction, its outputs opened unless told otherwise
const ysOf = ps => ps.map(p => cashu.hashToCurve(enc.encode(p.secret)).toHex(true));
const spend = (inputs, outs, signers, { open = outs.map(o => ({ secret: o.secret, r: rHex(o.r) })), list = ysOf(inputs) } = {}) => {
  const witness = JSON.stringify({ signatures: signers.map(k => cashu.schnorrSignMessage(message(inputs, outs), k.sk)), ...(open ? { outputs: open } : {}), ...(list ? { inputs: list } : {}) });
  return swap(inputs.map((p, i) => i ? p : { ...p, witness }), outs); };
const sum = ps => ps.reduce((a, p) => a + p.amount, 0);

// ---------- what is allowed ----------
const TAGS = lockTags(), don = await donate(100, TAGS), self = a => output(a, locked(TAGS));
check('a donor locks 100 sat to an ordering key and two payees, with `dest`', sum(don) === 100 && await allState(don, 'UNSPENT'), don.map(p => p.amount).join('+'));
const payA = pieces(40).map(a => output(a, payTo(A.pk))), restA = pieces(60).map(self);
const first = await spend(don, [...payA, ...restA], [S, A]);
check('the ordering key and payee A sign: 40 sat to A, 60 sat back under the same lock', first.ok === true && await allState(don, 'SPENT'), first.detail || '');
const rest1 = first.ok ? first.proofs.slice(payA.length) : [];
const kept = await states(don);
check('the mint keeps that spend\'s witness with every one of its inputs, not only the first', don.length > 1 && kept.every(x => x.state === 'SPENT' && !!x.witness && x.witness === kept[0].witness), `${don.length} inputs, ${kept.filter(x => x.witness).length} with the witness`);

// what anyone can read at the mint, and what the payee can do with it alone
const st = (await states(don))[0], wit = JSON.parse(st.witness || '{}'), opened = wit.outputs || [];
const read = opened.map(o => { const s = JSON.parse(o.secret)[1]; return { to: s.data, tags: s.tags || [] }; });
check('the spent proof\'s witness at the mint (NUT-07) says where it went: A\'s key, and the lock again', opened.length === payA.length + restA.length
  && read.slice(0, payA.length).every(x => x.to === A.pk && !x.tags.length) && read.slice(payA.length).every(x => x.to === S.pk && JSON.stringify(x.tags) === JSON.stringify(TAGS)));
const mine = opened.map(o => ({ ...o, B_: cashu.blindMessage(enc.encode(o.secret), BigInt('0x' + o.r)).B_.toHex(true) })).filter(o => JSON.parse(o.secret)[1].data === A.pk);
const restored = await call('/v1/restore', { outputs: mine.map(o => ({ amount: 0, id: M.kid, B_: o.B_ })) });
const claimed = (restored.signatures || []).map((sig, i) => { const o = mine.find(m => m.B_ === restored.outputs[i].B_); return proofOf({ secret: o.secret, r: BigInt('0x' + o.r) }, sig); });
check('payee A rebuilds its payment from the mint alone (NUT-07 + NUT-09), with nothing handed over', sum(claimed) === 40, `${sum(claimed)} sat in ${claimed.length} proofs`);
const stolen = await swap(claimed.map(p => ({ ...p, witness: JSON.stringify({ signatures: [cashu.schnorrSignMessage(p.secret, X.sk)] }) })), pieces(40).map(a => output(a, nonce())));
check('…which is of no use to a stranger who reads the same at the mint', !stolen.ok, stolen.ok ? 'ACCEPTED' : stolen.detail);
const cashed = await swap(claimed.map(p => ({ ...p, witness: JSON.stringify({ signatures: [cashu.schnorrSignMessage(p.secret, A.sk)] }) })), pieces(40).map(a => output(a, nonce())));
check('…and A spends it with its own key, into ordinary ecash', cashed.ok === true && sum(cashed.proofs || []) === 40, cashed.detail || '');

// the rest is under the same rule: it can pay the other payee, and can go nowhere else
const leak = await spend(rest1, pieces(60).map(a => output(a, nonce())), [S, A]);
check('the 60 sat that stayed: the same two signers cannot take them out', refused(leak, /not locked/), leak.ok ? 'ACCEPTED' : leak.detail);
const payB = pieces(20).map(a => output(a, payTo(B.pk, []))), restB = pieces(40).map(self);
const second = await spend(rest1, [...payB, ...restB], [S, B]);
check('…but they can pay payee B 20 sat, and 40 sat stay locked again', second.ok === true, second.detail || '');
const rest2 = second.ok ? second.proofs.slice(payB.length) : [];
const both = await spend(rest2, [output(8, payTo(A.pk)), output(8, payTo(B.pk)), ...pieces(24).map(self)], [S, A, B]);
check('…and both payees can be paid in one spend, when both sign with the ordering key', both.ok === true, both.detail || '');
const rest3 = both.ok ? both.proofs.slice(2) : [];

// ---------- what is refused: one donation, tried every way; it must come out whole ----------
const don2 = await donate(64, TAGS), whole = [output(64, payTo(A.pk))];
const tries = [
  ['outputs not opened in the witness', () => spend(don2, whole, [S, A], { open: null }), /every output must be opened/],
  ['an output that is ordinary ecash', () => spend(don2, [output(64, nonce())], [S, A]), /not locked/],
  ['an output opened as a payment to A, that is in truth ordinary ecash', () => { const o = output(64, nonce()); return spend(don2, [o], [S, A], { open: [{ secret: payTo(A.pk), r: rHex(o.r) }] }); }, /does not match its output/],
  ['an opening with a blinding factor that is not one', () => spend(don2, whole, [S, A], { open: [{ secret: whole[0].secret, r: 'zz' }] }), /malformed opening/],
  ['an opening whose blinding factor is the right number, written in upper case', () => spend(don2, whole, [S, A], { open: [{ secret: whole[0].secret, r: rHex(whole[0].r).toUpperCase() }] }), /malformed opening/],
  ['an opening whose blinding factor has a space in it (Python would read past it)', () => spend(don2, whole, [S, A], { open: [{ secret: whole[0].secret, r: rHex(whole[0].r).slice(0, 62) + ' ' + rHex(whole[0].r).slice(62, 63) }] }), /malformed opening|does not match/],
  ['a payment to A whose output is written in upper case (14 Nov: whoever reads the mint rebuilds it in lower case)', () => spend(don2, whole.map(o => ({ ...o, B_: o.B_.toUpperCase() })), [S, A]), /lower-case hex/],
  ['a payment to A with its key in upper case (11 Nov: a payee is named letter for letter)', () => spend(don2, [output(64, JSON.stringify(['P2PK', { nonce: nonce(), data: A.pk.toUpperCase() }]))], [S, A]), /where the lock does not allow/],
  ['a payment to A with a space before its secret', () => spend(don2, [output(64, ' ' + payTo(A.pk))], [S, A]), /white space/],
  ['an output locked to a stranger', () => spend(don2, [output(64, payTo(X.pk))], [S, A]), /where the lock does not allow/],
  ['an output locked to the ordering key', () => spend(don2, [output(64, payTo(S.pk))], [S, A]), /where the lock does not allow/],
  ['a payment to A that a stranger could also spend (extra pubkeys, n_sigs 1)', () => spend(don2, [output(64, payTo(A.pk, [['pubkeys', X.pk], ['n_sigs', '1']]))], [S, A]), /where the lock does not allow/],
  ['a payment to A that anyone could spend (a locktime already past)', () => spend(don2, [output(64, payTo(A.pk, [['locktime', '1']]))], [S, A]), /where the lock does not allow/],
  ['two payees sign without the ordering key', () => spend(don2, whole, [A, B]), /key in data has not signed/],
  ['the ordering key signs with payee B, and A is paid', () => spend(don2, whole, [S, B]), /paid without its signature/],
  ['the ordering key signs alone and puts it all back', () => spend(don2, [output(64, locked(TAGS))], [S]), /threshold not met/],
  ['more signatures than the lock has keys', () => spend(don2, whole, [S, A, B, X]), /more signatures than keys/],
  ['the rest put back with another refund key', () => spend(don2, [output(64, locked(lockTags({ refund: X.pk })))], [S, A]), /where the lock does not allow/],
  ['the rest put back with an earlier deadline', () => spend(don2, [output(64, locked(lockTags({ locktime: 1 })))], [S, A]), /where the lock does not allow/],
  ['the rest put back without `dest`', () => spend(don2, [output(64, locked(lockTags({ dest: null })))], [S, A]), /where the lock does not allow/],
  ['the rest put back under an HTLC of the same shape', () => spend(don2, [output(64, JSON.stringify(['HTLC', { nonce: nonce(), data: 'a'.repeat(64), tags: TAGS }]))], [S, A]), /not locked/],
  ['the rest put back with the nonce of the proof it came from', () => spend(don2, [output(64, don2[0].secret)], [S, A]), /repeats the nonce of an input/],
  ['two outputs with one secret', () => { const s = payTo(A.pk); return spend(don2, [output(32, s), output(32, s)], [S, A]); }, /two outputs have the same secret/],
  ['an output with a secret that was already spent', () => spend(don2, [output(64, claimed[0].secret)], [S, A]), /already spent/],
  ['signatures made for other outputs', async () => { const other = [output(64, payTo(A.pk))], witness = JSON.stringify({ signatures: [S, A].map(k => cashu.schnorrSignMessage(message(don2, other), k.sk)), outputs: whole.map(o => ({ secret: o.secret, r: rHex(o.r) })) });
    return swap(don2.map((p, i) => i ? p : { ...p, witness }), whole); }, /threshold not met/],
  ['the donor\'s refund key before the deadline', () => spend(don2, [output(64, nonce())], [D]), /threshold not met/],
  ['locked ecash mixed with ordinary ecash in one swap', async () => spend([...don2, ...await plain(1)], [output(64, payTo(A.pk)), output(1, payTo(A.pk))], [S, A]), /ordinary secret/],
];
for (const [what, attempt, re] of tries) { const res = await attempt(); check('refused: ' + what, refused(res, re), res.ok ? 'ACCEPTED' : res.detail); }
// a melt: the signatures cover the quote too, as NUT-11 asks, and it is still refused
const inv = await M.w.createMintQuoteBolt11(32), mq = await call('/v1/melt/quote/bolt11', { request: inv.request, unit: 'sat' });
const meltWitness = JSON.stringify({ signatures: [S, A].map(k => cashu.schnorrSignMessage(message(don2, [], mq.quote), k.sk)) });
const melted = await call('/v1/melt/bolt11', { quote: mq.quote, inputs: don2.map((p, i) => wire(i ? p : { ...p, witness: meltWitness })) });
check('refused: a melt to a Lightning invoice, signed by the ordering key and a payee', mq.ok && refused(melted, /cannot be melted/), melted.ok ? 'ACCEPTED' : melted.detail || JSON.stringify(mq).slice(0, 120));
check('after all of that the donation is whole and unspent', await allState(don2, 'UNSPENT'));
const after = await spend(don2, whole, [S, A]);
check('…and still pays payee A when it is done right', after.ok === true, after.detail || '');

// a lock that is not SIG_ALL, or names a policy the mint does not know, cannot be spent on its main path
const loose = await donate(8, lockTags({ sigflag: null }));
const looseTry = await swap(loose.map(p => ({ ...p, witness: JSON.stringify({ signatures: [S, A].map(k => cashu.schnorrSignMessage(p.secret, k.sk)) }) })), [output(8, nonce())]);
check('refused: a `dest` lock without SIG_ALL, each proof signed on its own', refused(looseTry, /must be SIG_ALL/), looseTry.ok ? 'ACCEPTED' : looseTry.detail);
const odd = await donate(8, lockTags({ dest: 'anywhere' })), oddTry = await spend(odd, [output(8, payTo(A.pk))], [S, A]);
check('refused: a `dest` policy the mint does not know', refused(oddTry, /unknown policy/), oddTry.ok ? 'ACCEPTED' : oddTry.detail);

// a lock that asks for fewer than two signatures: the ordering key alone could move it from the lock to the lock, for the mint's fees
// the witness lists the transaction's inputs (11 Nov): without them a reader who knows one input could not check who signed
{ const many = await donate(7, TAGS), to = () => pieces(7).map(a => output(a, payTo(A.pk))), ys = ysOf(many);
  for (const [what, list] of [['no list of inputs', 0], ['an empty list', []], ['the inputs in another order', [...ys].reverse()], ['one input left out', ys.slice(1)], ['one more than there are', [...ys, ys[0]]], ['the inputs in upper case', ys.map(y => y.toUpperCase())], ['a list that is not one', 'all']]) {
    const res = await spend(many, to(), [S, A], { list }); check('refused: a payment whose witness has ' + what, refused(res, /must list the inputs/) && await allState(many, 'UNSPENT'), res.ok ? 'ACCEPTED' : res.detail); }
  const fair = await spend(many, to(), [S, A]); check('…and with its three inputs listed in order, it is paid', many.length === 3 && fair.ok === true && await allState(many, 'SPENT'), fair.detail || `${many.length} inputs`); }
for (const n of ['1', null]) { const tags = lockTags({ n }), one1 = await donate(8, tags), alone = await spend(one1, [output(8, locked(tags))], [S]), two = await spend(one1, [output(8, payTo(A.pk))], [S, A]);
  check(`refused: a \`dest\` lock ${n ? 'with n_sigs 1' : 'that names no n_sigs'}, the ordering key alone or with a payee`, refused(alone, /at least two signatures/) && refused(two, /at least two signatures/) && await allState(one1, 'UNSPENT'), alone.ok || two.ok ? 'ACCEPTED' : alone.detail); }
// the two signers put a proof of their own first, so that the donor's proof would carry no witness: it carries it all the same
const don7 = await donate(8, TAGS), planted = await donate(1, TAGS), hid = await spend([...planted, ...don7], [output(1, payTo(A.pk)), output(8, locked(TAGS))], [S, A]);
const seen7 = (await states(don7))[0]; let opened7 = []; try { opened7 = JSON.parse(seen7.witness).outputs; } catch (_) {}
check('a proof of the signers\' own put first: the donor\'s proof still says where everything went', hid.ok === true && seen7.state === 'SPENT' && opened7.length === 2 && JSON.parse(opened7[1].secret)[1].data === S.pk, hid.detail || `${opened7.length} outputs opened in the donor's proof's witness`);

// ---------- the refund path is NUT-11's ----------
const SOON = Math.floor(Date.now() / 1000) + 8, don3 = await donate(48, lockTags({ locktime: SOON })), one = don3.slice(0, 1), toPlain = () => [output(one[0].amount, nonce())];
const don8 = await donate(8, lockTags({ locktime: SOON })), don9 = await donate(8, lockTags({ locktime: SOON, refund: null }));
const early = await spend(one, toPlain(), [D], { open: null });
check('before the deadline the donor\'s key cannot spend', Date.now() / 1000 < SOON && !early.ok, early.ok ? 'ACCEPTED' : early.detail);
await sleep(Math.max(0, SOON * 1000 - Date.now()) + 1500);
const late = await spend(one, toPlain(), [S, A]);
check('after the deadline the two signers still cannot take it out', refused(late, /not locked/), late.ok ? 'ACCEPTED' : late.detail);
const back = await spend(one, toPlain(), [D], { open: null });
check('after the deadline the donor takes a proof back as ordinary ecash, with no rule about outputs', back.ok === true, back.detail || '');
const inv2 = await M.w.createMintQuoteBolt11(8), mq2 = await call('/v1/melt/quote/bolt11', { request: inv2.request, unit: 'sat' }), restIn = don3.slice(1);
const refundMelt = await call('/v1/melt/bolt11', { quote: mq2.quote, inputs: restIn.map((p, i) => wire(i ? p : { ...p, witness: JSON.stringify({ signatures: [cashu.schnorrSignMessage(message(restIn, [], mq2.quote), D.sk)] }) })) });
const odd8 = await spend(don8, [output(8, nonce())], [D], { open: 'not a list of outputs' });
check('a refund goes through whatever else its witness holds: only its signatures are read', odd8.ok === true, odd8.detail || '');
const free9 = await swap(don9, [output(8, nonce())]), free9b = await spend(don9, [output(8, nonce())], [X], { open: null });
check('a `dest` lock with a deadline and no refund key does not open to whoever asks after it (NUT-11 would let anyone spend it)', !free9.ok && !free9b.ok && await allState(don9, 'UNSPENT'), free9.ok || free9b.ok ? 'ACCEPTED' : free9.detail);
const paid9 = await spend(don9, [output(8, payTo(A.pk))], [S, A]);
check('…and still pays a payee that signs with the ordering key', paid9.ok === true, paid9.detail || '');
check('…and can melt the rest to a Lightning invoice, as a refund does', refundMelt.ok === true && /PAID/i.test(refundMelt.state || ''), refundMelt.detail || refundMelt.state || '');

// ---------- locks without `dest` are what they were ----------
const don4 = await swap(await plain(8), [output(8, locked(lockTags({ dest: null, sigflag: null })))]);
const oldSpend = await swap(don4.proofs.map(p => ({ ...p, witness: JSON.stringify({ signatures: [S, A].map(k => cashu.schnorrSignMessage(p.secret, k.sk)) }) })), [output(8, nonce())]);
check('today\'s lock (2 signatures, each proof signed on its own, no `dest`) is spent as before', oldSpend.ok === true, oldSpend.detail || '');
const don5 = await swap(await plain(8), [output(8, locked(lockTags({ dest: null })))]), oldAll = await spend(don5.proofs, [output(8, nonce())], [S, A], { open: null });
check('a SIG_ALL lock without `dest` still lets its signers send the ecash anywhere', oldAll.ok === true, oldAll.detail || '');

check('of the first 100 sat: 48 to A, 28 to B, and 24 still under the donor\'s lock', sum(rest3) === 24 && await allState(rest3, 'UNSPENT'), `${sum(rest3)} sat left`);
// ---------- a mint without the patch: why a wallet has to read the announcement ----------
if (process.env.STOCK) { await use(process.env.STOCK); const other = ((await call('/v1/info')).nuts || {})['11'] || {};
  const don6 = await donate(16, TAGS), taken = await spend(don6, [output(16, nonce())], [S, A], { open: null });
  check('a mint without the patch ignores the tag: there the same two signers take the same lock\'s ecash out', !other.dest && taken.ok === true, other.dest ? 'that mint has the patch too' : (taken.detail || ''));
} else say('· not run: the same lock at a mint without the patch (STOCK=its address)');

say(bad ? `dest: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'dest: every check passed'); process.exit(bad ? 1 : 0);
