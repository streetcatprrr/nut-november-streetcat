// One strict reader of a donation's lock (review of 9 Nov, A06), in Node against the local mint. Before, four readers (core.js, two in
// index.js, status.js) built the tags with Object.fromEntries, which keeps the last of a tag given twice, while NUT-11 refuses a tag given
// twice and a mint may read the first. Here: the app's own lock reads clean and is a donation's; a tag given twice, a count or a deadline
// not written as a whole number, a key that is not a point, one key twice (02… and 03… with one x are one Schnorr signer), two refund
// keys, a refund key that is Streetcat's or the partner's, an unknown tag, or tags that are not lists of texts: each is refused, said
// why, without throwing; a campaign whose partner key is Streetcat's own with the other parity is refused; and, asked straight, what the
// local mint does with a lock that says n_sigs twice.
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3338';
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, say = (...a) => console.log(...a), now = () => Math.floor(Date.now() / 1000), enc = new TextEncoder();
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const sc = newSk(), cl = newSk(), donor = newSk(), camp = { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline: now() + 30 * 86400 };
const flip = k => (k.startsWith('02') ? '03' : '02') + k.slice(2);  /* the same x, the other parity: the same Schnorr signer */
const notPoint = (() => { for (let i = 0; ; i++) { const k = '02' + i.toString(16).padStart(64, '0'); if (!C.pointOk(k)) return k; } })();

// the app's own lock, as it locks a donation (index.js lockFor, cashu-ts LockBuilder)
const lockFor = (c, refundPk) => new cashu.LockBuilder().addMainPubkey([c.streetcat, c.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(Number(c.deadline));
const [own] = await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: await plain(MINT.endsWith('3339') ? 5 : 4) })).asLocked(lockFor(camp, C.pubOf(donor))).run();
const L = C.lockOf(own.secret);
check('the app\'s own lock reads clean, with nothing unknown, and is this campaign\'s', !!L && !L.bad && !L.unknown.length && C.lockProblem(L, camp) === '' && L.n === 2 && L.refund.length === 1, JSON.stringify(L && { n: L.n, refund: L.refund.length, tags: JSON.parse(own.secret)[1].tags.map(t => t[0]) }));

// the same lock, written otherwise
const base = JSON.parse(own.secret), tagsOf = () => JSON.parse(JSON.stringify(base[1].tags)), secretWith = tags => JSON.stringify(['P2PK', { ...base[1], tags }]);
const set = (tags, name, ...vals) => tags.map(t => t[0] === name ? [name, ...vals] : t);
const cases = [
  ['n_sigs given twice (1, then the 2 it had)', t => [['n_sigs', '1'], ...t], /the tag n_sigs is given twice/],
  ['locktime given twice', t => [...t, ['locktime', '1']], /the tag locktime is given twice/],
  ['refund given twice', t => [...t, ['refund', C.pubOf(newSk())]], /the tag refund is given twice/],
  ['n_sigs written "02"', t => set(t, 'n_sigs', '02'), /n_sigs is not a whole number/],
  ['n_sigs written "2.0"', t => set(t, 'n_sigs', '2.0'), /n_sigs is not a whole number/],
  ['n_sigs written " 2"', t => set(t, 'n_sigs', ' 2'), /n_sigs is not a whole number/],
  ['n_sigs with two values', t => set(t, 'n_sigs', '2', '2'), /n_sigs is not a whole number/],
  ['locktime written in exponent form', t => set(t, 'locktime', Number(camp.deadline).toExponential()), /locktime is not a whole number/],
  ['a refund key that is not a point', t => set(t, 'refund', notPoint), /a refund key is not a public key/],
  ['a signing key that is not a point', t => set(t, 'pubkeys', notPoint), /a signing key is not a public key/],
  ['a signing key given again with the other parity', t => set(t, 'pubkeys', (t.find(x => x[0] === 'pubkeys') || [])[1], flip(base[1].data)), /one signing key is given twice/],
  ['two refund keys', t => set(t, 'refund', C.pubOf(donor), C.pubOf(newSk())), /more than one refund key/],
  ['Streetcat\'s key as the refund key', t => set(t, 'refund', camp.streetcat), /refund key is Streetcat's or the partner's/],
  ['the partner\'s key, other parity, as the refund key', t => set(t, 'refund', flip(camp.clinic)), /refund key is Streetcat's or the partner's/],
  ['an unknown tag', t => [...t, ['hashlock', 'ab']], /a tag this app does not know \(hashlock\)/],
  ['a tag that is not a list of texts', t => [...t, ['n_sigs_refund', 1]], /a tag is not a list of texts/],
];
for (const [what, change, why] of cases) { const s = secretWith(change(tagsOf())); let l = null, p = '', threw = ''; try { l = C.lockOf(s); p = C.lockProblem(l, camp); } catch (e) { threw = e.message; }
  check(`refused: ${what}`, !threw && why.test(p), threw || p); }
let tl = null, threw2 = ''; try { tl = C.lockOf(JSON.stringify(['P2PK', { ...base[1], tags: 'n_sigs' }])); } catch (e) { threw2 = e.message; }
check('…and tags that are not a list: refused, without throwing', !threw2 && !!tl && /its tags are not a list/.test(C.lockProblem(tl, camp)), threw2 || (tl && tl.bad));
check('what is not a P2PK lock is still no lock at all', C.lockOf('a7f3') === null && C.lockOf('["HTLC",{"data":"ab"}]') === null && C.lockProblem(null, camp) === 'not a P2PK lock');

// a campaign whose partner key is Streetcat's own, written with the other parity: one signer twice, so it is refused
let made = ''; try { C.campaignOf({ ...camp, clinic: flip(camp.streetcat) }); } catch (e) { made = e.message; }
check('a campaign whose partner key is Streetcat\'s own with the other parity is refused', /Streetcat's own key/.test(made), made);
check('…and two such keys are one signer to the app', C.sameKey(camp.streetcat, flip(camp.streetcat)) && !C.sameKey(camp.streetcat, camp.clinic));

// asked straight: a lock that says n_sigs twice (first 1, then 2), spent with Streetcat's signature alone
const dup = secretWith([['n_sigs', '1'], ...tagsOf()]), ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id);
const bf = (BigInt('0x' + newSk()) % 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n) || 1n;
const out = new cashu.OutputData({ amount: cashu.Amount.from(4), id: ks.id, B_: cashu.blindMessage(enc.encode(dup), bf).B_.toHex(true) }, bf, enc.encode(dup));
let lockedDup = null, why = ''; try { const res = await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: await plain(MINT.endsWith('3339') ? 5 : 4) })).asCustom([out]).run(); lockedDup = res[0]; } catch (e) { why = e.message; }
if (lockedDup) { const one = cashu.signP2PKProofs([lockedDup], sc); let spent = false, said = '';
  try { const o2 = cashu.OutputData.createRandomData(4 - Number(C.amt(w.getFeesForProofs(one))), ks); await w.mint.swap({ inputs: one.map(p => ({ id: p.id, amount: C.amt(p.amount), secret: p.secret, C: p.C, witness: typeof p.witness === 'string' ? p.witness : JSON.stringify(p.witness) })), outputs: o2.map(o => ({ amount: C.amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) }); spent = true; } catch (e) { said = e.message || String(e); }
  say(`  the local mint, asked to spend it with Streetcat's signature alone: ${spent ? 'ACCEPTED (it read the first n_sigs, 1)' : 'refused (' + said.slice(0, 90) + ')'}`);
  check('…such a lock is refused by the app whatever the mint does with it', /the tag n_sigs is given twice/.test(C.lockProblem(C.lockOf(dup), camp))); }
else say('  (could not make the lock with n_sigs twice at the mint: ' + why.slice(0, 90) + ')');

say(bad ? `lock: ${bad} check(s) failed` : 'lock: every check passed'); process.exit(bad ? 1 : 0);
