// Streetcat's donation protocol, with no interface: what travels between donor, Streetcat and clinic, and how each side checks it.
// - Keys derived from a campaign key: one signs declarations, one carries messages. The spending keys sign nothing but spends.
// - DON- codes for donations.
// - The request Streetcat sends the clinic, and the clinic's answer: its signatures and its signed declaration, or a signed report.
// - One packing for every way they travel: a link, a file, a relay message.
// - The published ledger, donation by donation (version 2).
// - Split donations: the part of a proof that is not released goes back under the same lock, in proofs derived from that proof,
//   so the donor (or anyone holding the published token) can find it at the mint with NUT-09 restore.
// - The signed acknowledgment a volunteer gives a donor who hands a donation over in person.
// - The cat's record the clinic signs (name, microchip, procedure, photos), and its photos in parts small enough for a relay.
// Used by the pages in the browser and by the tests in Node. Needs cashu-bundle.js loaded first (window.cashu).
(function (root) {
'use strict';
const cashu = root.cashu; if (!cashu) throw new Error('core.js needs cashu-bundle.js first');
const enc = new TextEncoder(), dec = new TextDecoder();
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const unhex = s => { s = String(s || ''); if (s.length % 2 || /[^0-9a-f]/i.test(s)) throw new Error('not hex'); return Uint8Array.from(s.match(/../g) || [], h => parseInt(h, 16)); };
const concat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { out.set(x, i); i += x.length; } return out; };
const sha256 = async b => new Uint8Array(await root.crypto.subtle.digest('SHA-256', typeof b === 'string' ? enc.encode(b) : b));
const sha256hex = async b => hex(await sha256(b));
// canonical JSON: keys sorted, no spaces, so the same statement always gives the same bytes to sign
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);
const amt = a => (a && typeof a === 'object' && typeof a.toNumber === 'function') ? a.toNumber() : Number(a);  // cashu-ts may hand back Amount objects
const lc = k => String(k || '').toLowerCase();
const PUB = /^0[23][0-9a-f]{64}$/i, SK = /^[0-9a-f]{64}$/i, DAY = /^\d{4}-\d{2}-\d{2}$/;
// a public key is 33 bytes in hex AND a point of the curve: about half of all such strings are not one, and ecash locked to one could only
// ever be refunded (7 Nov: a key copied while it was still shuffling on screen looks like one)
const pointOk = k => { if (!PUB.test(String(k || ''))) return false; try { cashu.pointFromHex(lc(k)); return true; } catch (_) { return false; } };
const yOf = secret => cashu.hashToCurve(enc.encode(secret)).toHex(true).toLowerCase();
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;  // the order of secp256k1
const G = () => cashu.pointFromHex('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
const big = b => BigInt('0x' + (hex(b) || '0'));
const pubOf = sk => hex(cashu.getPubKeyFromPrivKey(unhex(sk)));
const verify = (sig, msg, pk) => { try { return !!cashu.schnorrVerifyMessage(sig, msg, pk); } catch (_) { return false; } };

// ---------- keys derived from a campaign key ----------
// k' = k + t and K' = K + t·G, with t = SHA-256(tag ‖ K) mod n and K the compressed public key in the campaign. Anyone who knows K
// can compute K' (so a campaign needs no new keys announced); only the holder of k can compute k'. The spending key k itself then
// signs nothing but NUT-11 spends: declarations, reports, acknowledgments and messages are signed with derived keys, one per tag.
// They separate purposes, not compromise (review of 9 Nov, A07): t is public, so whoever learns a derived private key k' learns
// k = k' − t, the spending key. A derived private key is as secret as the key it comes from: the app works it out when it signs and
// keeps it nowhere; it is never exported, shown or logged, and must never be handed to another app (a Nostr client, say) as if it
// were less sensitive.
const TAG = { statement: 'streetcat/statement/v1', messaging: 'streetcat/messaging/v1', ledger: 'streetcat/ledger/v1' };
async function tweak(tag, pk){ if (!PUB.test(pk)) throw new Error('not a public key'); const t = big(await sha256(concat(enc.encode(tag), unhex(lc(pk))))) % N; if (t === 0n) throw new Error('unusable key'); return t; }
async function derivedPub(tag, pk){ return cashu.pointFromHex(lc(pk)).add(G().multiply(await tweak(tag, pk))).toHex(true); }
async function derivedSk(tag, sk){ if (!SK.test(sk)) throw new Error('not a private key'); const d = (BigInt('0x' + sk) + await tweak(tag, pubOf(sk))) % N; if (d === 0n) throw new Error('unusable key'); return d.toString(16).padStart(64, '0'); }

// ---------- DON- codes ----------
// a donation's code comes from its proofs' Y values (which reveal nothing that could spend them): the same donation always has the same code
const donRef = async ys => 'DON-' + (await sha256hex([...ys].map(lc).sort().join(''))).slice(0, 8).toUpperCase();

// ---------- locks ----------
// THE LOCK, read strictly (review of 9 Nov, A06): one reader for every way in (a request, a token pasted or sent by a wallet, a receipt,
// the status page), where there were four that each kept the last of a tag given twice (Object.fromEntries) while NUT-11 refuses a tag
// given twice and a mint may read the first. Refused, and said why (`bad`): a tag given twice, a count or a deadline not written as a
// whole number, a key that is not a point, one key twice by its x coordinate (a Schnorr signature cannot tell 02… from 03…, so two of
// them are one signer counted twice), tags that are not lists of texts. A secret that is not a P2PK lock at all is null.
const P2PK_TAGS = ['sigflag', 'n_sigs', 'pubkeys', 'locktime', 'refund', 'n_sigs_refund', 'dest'], WHOLE = /^(0|[1-9][0-9]{0,14})$/;  // dest: see "a lock that says where the money may go", below
const xOnly = k => lc(k).slice(2), sameKey = (a, b) => !!a && !!b && xOnly(a) === xOnly(b);
function lockOf(secret){ let s; try { s = JSON.parse(secret); } catch (_) { return null; }
  if (!Array.isArray(s) || s[0] !== 'P2PK' || !s[1] || typeof s[1] !== 'object' || typeof s[1].data !== 'string') return null;
  const d = s[1], t = Object.create(null), why = [], tags = d.tags == null ? [] : d.tags;  /* no prototype: a tag named __proto__ is a tag like any other, and is listed as unknown */
  /* audit of 10 Nov: the mint refuses every spend, the donor's refund too, of a secret with a third element, another field, or a nonce that is missing or no text; read as a lock here, one such proof made every release that took it fail at the mint */
  if (s.length !== 2 || Array.isArray(d) || typeof d.nonce !== 'string' || !d.nonce || !d.data || Object.keys(d).some(k => k !== 'nonce' && k !== 'data' && k !== 'tags')) why.push('it is not written as a lock is: the mint would refuse it');
  if (!Array.isArray(tags)) why.push('its tags are not a list');
  else for (const x of tags) { if (!Array.isArray(x) || !x.length || !x.every(v => typeof v === 'string' && v)) { why.push('a tag is not a list of texts'); continue; }
    if (Object.prototype.hasOwnProperty.call(t, x[0])) why.push(`the tag ${x[0]} is given twice`); else t[x[0]] = x.slice(1); }
  const whole = (k, dflt) => { const v = t[k]; if (v === undefined) return dflt; if (v.length !== 1 || !WHOLE.test(v[0])) { why.push(`its ${k} is not a whole number`); return NaN; } return Number(v[0]); };
  /* fuzzing of 11 Nov: a key with capital letters in it is the same key to a signature, and passed here; the mint with the `dest` rule pays a partner by its key letter for letter, so nothing could ever be paid from such a donation */
  const keys = (list, what) => { if (list.some(k => !pointOk(k))) why.push(`${what} is not a public key`); else if (list.some(k => k !== lc(k))) why.push(`${what} is written with capital letters: the mint could not pay from it`); return list.map(lc); };
  const main = keys([d.data, ...(t.pubkeys || [])], 'a signing key'), refund = keys(t.refund || [], 'a refund key');
  if (new Set(main.map(xOnly)).size !== main.length) why.push('one signing key is given twice');
  if (new Set(refund.map(xOnly)).size !== refund.length) why.push('one refund key is given twice');
  const n = whole('n_sigs', 1), nRefund = whole('n_sigs_refund', 1), locktime = whole('locktime', 0);
  const sigflag = t.sigflag === undefined ? 'SIG_INPUTS' : t.sigflag.length === 1 ? t.sigflag[0] : '';
  const dest = t.dest === undefined ? '' : t.dest.length === 1 ? t.dest[0] : '?';  /* '' none · 'pubkeys' · anything else: not known here */
  return { main, n, refund, nRefund, locktime, sigflag, dest, unknown: Object.keys(t).filter(k => !P2PK_TAGS.includes(k)), bad: why[0] || '' }; }
// what a campaign promises: Streetcat and the clinic sign together; one refund key, the donor's, opens after the deadline. Signed proof
// by proof (SIG_INPUTS, every donation made before 15 Nov) or whole (SIG_ALL, every one since: "today's lock, signed whole", below)
function lockProblem(l, c){ if (c && c.lock === 'dest') return destLockProblem(l, { streetcat: c.streetcat, payees: payeesOf(c), deadline: c.deadline });  /* a campaign that says where its money may go: its own reader, below */
  if (!l) return 'not a P2PK lock'; if (l.bad) return l.bad;
  const want = [c.streetcat, c.clinic].map(xOnly).sort();
  if (l.main.map(xOnly).sort().join() !== want.join()) return 'locked to other keys than Streetcat + the clinic'; if (l.n !== 2) return `needs ${l.n} signature(s), not 2`;
  if (l.locktime !== Number(c.deadline)) return 'its deadline is not the campaign deadline'; if (!l.refund.length) return 'no refund key: anyone could take it after the deadline';
  if (l.refund.length !== 1) return 'more than one refund key: only the donor may take it back';
  if (want.includes(xOnly(l.refund[0]))) return 'its refund key is Streetcat\'s or the partner\'s: only the donor may take it back';
  if (l.nRefund !== 1) return 'unusual refund rule'; if (l.dest) return 'a rule about where it goes that this campaign does not have'; if (l.sigflag !== 'SIG_INPUTS' && l.sigflag !== 'SIG_ALL') return 'unusual signature rule';
  if (l.unknown.length) return `a tag this app does not know (${l.unknown[0]})`; return ''; }
const CAMP =['name', 'op', 'mint', 'streetcat', 'clinic', 'deadline'];
// What a campaign (a pot) pays for, the colony it is for, and its partner: who confirms the spending, by name and by what it is. The partner's key is the campaign's "clinic" key, as before: a clinic, a shop, or another. All four are
// optional and kept only when valid; the campaign's signature covers them, so a campaign made before is the same campaign, and checks
// as it did. Neither the campaign's id nor the partner's certificate name them.
const TYPES = ['sterilisation', 'vet', 'food', 'other'], PKINDS = ['clinic', 'shop', 'other'];
const word = (v, n = 60) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
function campaignOf(c){ if (!c || typeof c !== 'object') throw new Error('no campaign'); const o = {}; for (const k of CAMP) if (c[k] != null && c[k] !== '') o[k] = c[k];
  o.name = String(o.name || '').trim(); if (o.op != null) o.op = String(o.op); o.mint = String(o.mint || '').trim().replace(/\/+$/, ''); o.deadline = Number(o.deadline); o.streetcat = lc(o.streetcat); o.clinic = lc(o.clinic);
  if (!o.name || !o.mint || !pointOk(o.streetcat) || !pointOk(o.clinic) || !Number.isInteger(o.deadline)) throw new Error('the campaign is incomplete');
  if (o.name.length > 200 || (o.op != null && o.op.length > 200) || o.mint.length > 300) throw new Error('the campaign\'s name, operation or mint is too long to be one');  /* audit of 10 Nov: a name of a million letters deflates to 7 kB in a message, and three such filled Rescue's storage */
  if (sameKey(o.streetcat, o.clinic)) throw new Error('the partner key is Streetcat\'s own key: the partner signs with its own');  /* one signer twice (A06) */
  if (TYPES.includes(c.type)) o.type = c.type; if (PKINDS.includes(c.pkind)) o.pkind = c.pkind; if (word(c.colony)) o.colony = word(c.colony); if (word(c.partner)) o.partner = word(c.partner);
  // A campaign whose donations say where they may go (lock: 'dest', see "a lock that says where the money may go", below) can have a
  // list of partners. The first is still `clinic`, as everywhere; `partners` are the others. Both are signed with the
  // rest and are part of the campaign's id. Eight partners at most: more would not fit in a proof's secret (1 024 characters at the mint).
  const more = c.partners == null ? [] : c.partners;
  if (c.lock === 'dest') { o.lock = 'dest'; if (!Array.isArray(more) || more.length > 7 || more.some(k => !pointOk(k)) || new Set([o.streetcat, o.clinic, ...more].map(xOnly)).size !== more.length + 2) throw new Error('the campaign\'s partners are not public keys, each once, eight at most');
    if (more.length) o.partners = more.map(lc); }
  else if (!Array.isArray(more) || more.length) throw new Error('a list of partners needs the lock that says where the money may go');
  return o; }
const payeesOf = c => [lc(c.clinic), ...(c.lock === 'dest' && Array.isArray(c.partners) ? c.partners.map(lc) : [])];  /* who a campaign's money can be paid to */
const campShort = c => ({ name: c.name, mint: c.mint, streetcat: c.streetcat, clinic: c.clinic, deadline: c.deadline, ...(c.lock === 'dest' ? { lock: 'dest', ...(c.partners && c.partners.length ? { partners: c.partners } : {}) } : {}) });
// Streetcat's published key: a donation link and a ledger must name it (both pages check). Confirmed on 5 Nov (it is also in
// campaigns/tnr2.json). Another key, if there is ever one, is added in this one line.
const STREETCAT_KEYS = ['0294637dacb6799343eacb4654700ad781694838b8b6db80551d17af001b194121'];
const published = k => STREETCAT_KEYS.includes(lc(k));  /* an empty list is nobody's key, not everybody's (audit of 10 Nov: it used to pin nothing) */
// a campaign's id: a hash of what makes it (its name, mint, both keys and deadline). The ledger is published under it (relay.js).
const campaignId = async c => 'streetcat:' + (await sha256hex(canon(campShort(campaignOf(c))))).slice(0, 20);
// ---------- campaigns signed by Streetcat ----------
// A donation link is text anyone can write: one carrying someone else's keys would lock donors' sats to them. So a campaign carries a
// BIP-340 signature over "streetcat/campaign/v1", a newline and its canonical JSON (name, op, mint, Streetcat's and the clinic's keys,
// the deadline, its colour, where to send tokens), made with the statement key derived from the campaign's Streetcat key: only the
// holder of that key can make it, and anyone can check it from the link alone. Links made before carry none: they open, unsigned.
const CAMP_SIG = 'streetcat/campaign/v1\n';
const campSigned = c => { const o = campaignOf(c); if (c.hue != null && c.hue !== '') o.hue = Number(c.hue); if (c.to != null && String(c.to).trim()) o.to = String(c.to).trim(); return o; };
async function signCampaign(c, sk){ const o = campSigned(c); if (!SK.test(sk || '') || pubOf(sk) !== o.streetcat) throw new Error('this is not the campaign\'s Streetcat key');
  return { ...o, sig: cashu.schnorrSignMessage(CAMP_SIG + canon(o), await derivedSk(TAG.statement, lc(sk))) }; }
// 'signed', 'unsigned' (no signature at all) or 'broken' (a signature that does not match: the link was changed after it was signed)
async function campaignSig(c){ if (!c || c.sig == null || c.sig === '') return 'unsigned';
  try { const o = campSigned(c); return /^[0-9a-f]{128}$/i.test(String(c.sig)) && verify(String(c.sig), CAMP_SIG + canon(o), await derivedPub(TAG.statement, o.streetcat)) ? 'signed' : 'broken'; } catch (_) { return 'broken'; } }

// A request is text anyone can write too, when it comes by link, file or QR and not through the relay (whose seal says who sent it):
// one naming Streetcat's published key and real proofs from the public ledger would have a partner sign for work nobody asked of it.
// So a request carries Streetcat's signature over "streetcat/request/v1", a newline and its canonical JSON, made with the same derived
// key as a campaign's. 'signed', 'unsigned' or 'broken', as for a campaign. (Independent review, 11 Nov.)
const REQ_SIG = 'streetcat/request/v1\n', reqBody = q => { const { sig, ...o } = q; return o; };
async function signRequest(q, sk){ const c = campaignOf(q.campaign); if (!SK.test(sk || '') || pubOf(sk) !== c.streetcat) throw new Error('this is not the campaign\'s Streetcat key');
  return { ...reqBody(q), sig: cashu.schnorrSignMessage(REQ_SIG + canon(reqBody(q)), await derivedSk(TAG.statement, lc(sk))) }; }
async function requestSig(q){ if (!q || q.sig == null || q.sig === '') return 'unsigned';
  try { return /^[0-9a-f]{128}$/i.test(String(q.sig)) && verify(String(q.sig), REQ_SIG + canon(reqBody(q)), await derivedPub(TAG.statement, campaignOf(q.campaign).streetcat)) ? 'signed' : 'broken'; } catch (_) { return 'broken'; } }
const REQ_TEXT = { patient: 120, procedure: 200, note: 2000 }, reqTooLong = q => Object.entries(REQ_TEXT).filter(([k, n]) => String(q[k] == null ? '' : q[k]).length > n).map(([k]) => k);  /* a link is as long as its writer likes: these are not */

// ---------- the request: Streetcat → clinic ----------
// One procedure, and what of each donation pays for it: all of it, or a part (a split donation). Only the proofs that pay are sent; of
// each, what signing needs (its secret, amount and keyset) and what shows its amount is real: the mint's signature C and its DLEQ proof
// (NUT-12, with r). Under today's lock as it was (NUT-11 SIG_INPUTS) the clinic's signature covers only the secret and the mint pays out
// what the proof is really worth, so an amount the request merely says could be a lie (review of 9 Nov, A04: a 1 024-sat proof said to
// be 64): the clinic's app checks every amount against the mint's keys (amountProblems) before it can sign, and a request without that
// proof is refused. (A real 1-sat proof made with the same secret passes that check: finding 2.2, closed for every donation since 15 Nov
// by the lock signed whole, below.)
// Streetcat keeps the full tokens.
const newId = () => 'R-' + hex(root.crypto.getRandomValues(new Uint8Array(5))).toUpperCase();
// A request of this kind has the partner sign each proof's secret. A campaign locked with `dest` ("a lock that says where the money may
// go", below) has the partner sign the whole transaction instead, one per donation (each donation has its own lock). Its request names
// the partner it asks (`payee`: the campaign's partner, or one of its list) and says, with each donation's proofs, what that
// transaction is (`tx`: the keyset of its outputs and their amounts, `pay` to the partner and `rest` back under the lock). Nothing
// else goes into it (destBuild), so the partner's app builds the very transaction it signs from what it was shown, and Streetcat's
// builds the same one to send it: there is no output the partner did not make itself.
const askedOf = q => { const c = q && q.campaign; return lc(c && c.lock === 'dest' && q.payee ? q.payee : c && c.clinic); };  /* the partner a request asks */
const destOf = c => ({ streetcat: c.streetcat, payees: payeesOf(c), deadline: c.deadline });
const reqTx = (q, k) => destBuild({ inputs: k && k.proofs, payee: askedOf(q), id: k && k.tx && k.tx.id, pay: k && k.tx && k.tx.pay, rest: (k && k.tx && k.tx.rest) || [], seed: k && k.tx && k.tx.seed });
const wholes = a => Array.isArray(a) && a.length <= 64 && a.every(n => Number.isInteger(n) && n > 0), sumOf = a => a.reduce((s, n) => s + n, 0);
const slim = p => ({ id: String(p.id), amount: amt(p.amount), secret: String(p.secret), C: String(p.C || ''), ...(p.dleq ? { dleq: { e: String(p.dleq.e || ''), s: String(p.dleq.s || ''), r: String(p.dleq.r || '') } } : {}) });
const SCALAR = /^[0-9a-f]{1,64}$/i, CPOINT = /^0[23][0-9a-f]{64}$/i;
const amountCheckable = p => !!p && CPOINT.test(String(p.C || '')) && !!p.dleq && typeof p.dleq === 'object' && ['e', 's', 'r'].every(k => SCALAR.test(String(p.dleq[k] || '')));
// the clinic's check that every proof is worth what the request says: the mint's DLEQ proof for the key of that amount. `keysets`: the
// campaign mint's keys by keyset id (fetched by the app, or kept for offline). A proof the mint did not sign for that amount is named
// apart from one whose keys are not on this phone (to be checked again); either way the request cannot be confirmed.
// `feeOf` (a campaign that pays from the lock): what the mint charges to spend these proofs, or null when it is not known here. What a
// request's amounts leave over between what it spends and what it gives out has to be exactly that: the mint refuses a spend that
// leaves anything else, so no sat could be lost that way, but a request that said "1 sat mint fee" at a mint that charges none
// would be one the partner signs for nothing.
function amountProblems(q, keysets, feeOf){ const p = []; let W = 0, N = 0, X = 0; const dest = !!(q && q.campaign && q.campaign.lock === 'dest');
  for (const k of (q && q.contributions) || []) { const ps = Array.isArray(k.proofs) ? k.proofs : []; let wrong = 0, nokeys = 0, nocheck = 0; const D = typeof feeOf === 'function' && (dest || contribWhole(k));  /* a transaction the request spells out: dest, or signed whole */
    for (const x of ps) { if (!amountCheckable(x)) { nocheck++; continue; } const ks = keysets && keysets[x.id]; if (!ks || !ks.keys) { nokeys++; continue; }
      let ok = false; try { ok = cashu.hasValidDleq({ id: String(x.id), amount: amt(x.amount), secret: String(x.secret), C: x.C, dleq: x.dleq }, ks); } catch (_) {}  /* an amount with no key in the keyset throws: not worth it */
      if (!ok) wrong++; }
    if (nocheck) p.push(NOCHECK(k));
    if (wrong) p.push(`${k.ref || 'a donation'}: ${wrong === 1 ? 'an amount is' : wrong + ' amounts are'} false. Report a problem.`);  /* short, in red: the mint's signature does not match the amount */
    if (nokeys) p.push(`${k.ref || 'a donation'}: amounts not checked yet (no connection?)`);  /* the mint's keys are not on this phone: checked again */
    if (D && !wrong && !nocheck) { const t = k.tx || {}, left = ps.reduce((s, x) => s + amt(x.amount), 0) - (wholes(t.pay) ? sumOf(t.pay) : 0) - (wholes(t.rest) ? sumOf(t.rest) : 0); let want = null; try { want = feeOf(ps); } catch (_) {}
      if (want == null || !Number.isInteger(Number(want))) { if (!nokeys) { p.push(`${k.ref || 'a donation'}: amounts not checked yet (no connection?)`); nokeys = 1; } }
      else if (Number(want) !== left) { p.push(`${k.ref || 'a donation'}: the mint fee is false. Report a problem.`); wrong = 1; } }
    W += wrong; N += nokeys; X += nocheck; }
  return Object.assign(p, { wrong: W, unchecked: N, uncheckable: X }); }  /* the counts: a lie (wrong), keys missing for now (unchecked), no way to check (uncheckable) */
const NOCHECK = k => `${k.ref || 'a donation'}: amounts can't be checked. Report a problem.`;  /* a proof carries no DLEQ proof (an older app's request, or changed): reported, Streetcat asks again */
// The cat as Streetcat caught it: up to three photos, face
// and sides, made small on its phone, named here by SHA-256; the photos themselves travel apart (by relay in parts, or in a file), so the
// clinic can check it is this cat. Optional: a request without photos is as before, and an older app ignores them.
const REQ_SLOTS = ['face', 'left', 'right'];
const reqPhotosOk = ps => Array.isArray(ps) && ps.length >= 1 && ps.length <= REQ_SLOTS.length && new Set(ps.map(x => x && x.slot)).size === ps.length
  && ps.every(x => x && REQ_SLOTS.includes(x.slot) && SHA.test(String(x.sha256)) && Number.isInteger(x.bytes) && x.bytes >= 1 && x.bytes <= CAT_PHOTO_MAX && Number.isInteger(x.w) && Number.isInteger(x.h));
// `payee` and `dest` are for a campaign that pays straight from the lock: the partner asked (the campaign's first when not said) and what
// the mint gives to build on, { keysetId, denoms, fee: proofs => the mint's input fee for them }. `whole`, for donations signed whole
// (today's lock since 15 Nov): the same, and Streetcat's key, { sk, keysetId, denoms, fee }: their payment is worked out from it.
async function makeRequest({ campaign, patient, procedure, date, note = '', contributions, photos = [], payee, dest, whole, id = newId(), created = new Date().toISOString() }){
  const c = campaignOf(campaign), D = c.lock === 'dest', to = D ? lc(payee || c.clinic) : '';
  if (D && !payeesOf(c).includes(to)) throw new Error('the partner asked is not one of this campaign\'s partners');
  if (D && !(dest && dest.keysetId)) throw new Error('a request of this campaign says where every sat goes: it needs the mint\'s keyset');
  if (!String(patient || '').trim() || !String(procedure || '').trim() || !DAY.test(String(date || ''))) throw new Error('a request needs the cat, the procedure and the date');
  { const long = reqTooLong({ patient, procedure, note }); if (long.length) throw new Error(`too long: ${long.join(', ')}`); }
  const ph = (photos || []).map(x => ({ slot: x.slot, sha256: lc(x.sha256), bytes: x.bytes, w: x.w, h: x.h })); if (ph.length && !reqPhotosOk(ph)) throw new Error('the photos of the cat are not valid');
  if (!Array.isArray(contributions) || !contributions.length) throw new Error('a request needs at least one donation');
  const out = [], seen = new Set();
  for (const k of contributions) { let proofs = (k.proofs || []).map(slim), tx = null; if (!proofs.length) throw new Error('a donation without proofs');
    for (const p of proofs) { const bad = lockProblem(lockOf(p.secret), c); if (bad) throw new Error(`a donation is not this campaign's: ${bad}`); const y = yOf(p.secret); if (seen.has(y)) throw new Error('the same proof twice'); seen.add(y);
      if (!amountCheckable(p)) throw new Error('a donation\'s proof carries no DLEQ proof from the mint, so the partner could not check its amount: it cannot be asked for'); }
    const total = proofs.reduce((s, p) => s + p.amount, 0), release = k.release == null ? total : Number(k.release);
    if (!Number.isInteger(release) || release < 1 || release > total) throw new Error(`proofs of ${total} sat cannot pay ${k.release} sat`);
    if (D) { const t = await destTx({ proofs, pay: release, payee: to, keysetId: dest.keysetId, denoms: dest.denoms, fee: dest.fee ? Number(dest.fee(proofs)) || 0 : 0 }); proofs = t.inputs; tx = t.spec;  /* the proofs in the transaction's order */
      const no = destProblems(t, destOf(c), { payee: to, pay: release - t.fee }); if (no.length) throw new Error(`a donation cannot be asked for: ${no[0]}`); }  /* what the partner's app will check before it signs, checked here first (audit of 10 Nov: a donation with two refund keys made a request that failed only at the partner's button) */
    else { const W = proofs.map(p => isWhole(lockOf(p.secret))); if (W.some(Boolean) && !W.every(Boolean)) throw new Error('a donation\'s proofs are under two kinds of lock');
      if (W[0]) { if (!(whole && whole.keysetId && SK.test(String(whole.sk || '')))) throw new Error('a request for donations signed whole needs the mint\'s keyset and Streetcat\'s key');
        const t = await wholeTx({ proofs, pay: release, sk: whole.sk, keysetId: whole.keysetId, denoms: whole.denoms, fee: whole.fee ? Number(whole.fee(proofs)) || 0 : 0 }); proofs = t.inputs; tx = t.spec;  /* the proofs in the transaction's order */
        const no = wholeProblems(t, c, { pay: release - t.fee }); if (no.length) throw new Error(`a donation cannot be asked for: ${no[0]}`);
        if (!wholeWitnesses(t, ['0'.repeat(128), '0'.repeat(128)])) throw new Error(`${k.ref || 'a donation'}: paying ${release} sat out of it takes more outputs than the mint keeps a record of for ${proofs.length === 1 ? 'one proof' : proofs.length + ' proofs'}: ask for a few sats more or less`); }
      else if (total - release >= Math.max(...proofs.map(p => p.amount))) throw new Error(`proofs of ${total} sat for ${release}: more than this payment needs`); }  /* signed proof by proof: see requestProblems */
    out.push({ ref: k.ref || await donRef(proofs.map(p => yOf(p.secret))), release, proofs, ...(tx ? { tx } : {}) }); }
  return { t: 'streetcat.request', v: 1, id, campaign: c, ...(D ? { payee: to } : {}), patient: String(patient).trim(), procedure: String(procedure).trim(), date: String(date), ...(note ? { note: String(note) } : {}), ...(ph.length ? { photos: ph } : {}), contributions: out, created }; }
// what a clinic's app checks before it shows a request (it is just text anyone could write)
function requestProblems(q){ if (!q || q.t !== 'streetcat.request') return ['this is not a Streetcat request']; if (q.v !== 1) return [`it was made by another version of the app (format ${q.v})`];
  let c; try { c = campaignOf(q.campaign); } catch (e) { return [e.message]; } const p = [], D = c.lock === 'dest';
  if (D && !payeesOf(c).includes(lc(q.payee))) p.push('it does not ask one of this campaign\'s partners');
  if (!/^R-[0-9A-F]{10}$/.test(String(q.id))) p.push('it has no valid request number');
  if (!String(q.patient || '').trim() || !String(q.procedure || '').trim() || !DAY.test(String(q.date || ''))) p.push('the cat, the procedure or the date is missing');
  { const long = reqTooLong(q); if (long.length) p.push(`its ${long.join(' and its ')} is too long`); }
  if (!Array.isArray(q.contributions) || !q.contributions.length) p.push('it names no donation');
  if (q.photos !== undefined && !reqPhotosOk(q.photos)) p.push('its photos of the cat are not valid');
  const seen = new Set(), seeds = new Set(), seenB = new Set();
  for (const k of q.contributions || []) { const ps = Array.isArray(k.proofs) ? k.proofs : []; if (!ps.length) { p.push(`${k.ref || 'a donation'} has no proofs`); continue; }
    const bad = [...new Set(ps.map(x => lockProblem(lockOf(x.secret), c)).filter(Boolean))]; if (bad.length) p.push(`${k.ref || 'a donation'}: ${bad.join('; ')}`);
    for (const x of ps) { let y = ''; try { y = yOf(x.secret); } catch (_) {} if (!y || seen.has(y)) p.push(`${k.ref || 'a donation'}: a proof listed twice`); seen.add(y); }
    if (ps.some(x => !amountCheckable(x))) p.push(NOCHECK(k));
    const total = ps.reduce((s, x) => s + amt(x.amount), 0); if (!Number.isInteger(k.release) || k.release < 1 || k.release > total) p.push(`${k.ref || 'a donation'}: it cannot pay ${k.release} sat out of ${total}`);
    if (D) { const t = k.tx || {}, rest = t.rest == null ? [] : t.rest;  /* what its transaction is: read here, built and checked whole before it is signed (certify) */
      if (typeof t.id !== 'string' || !t.id || !wholes(t.pay) || !t.pay.length || !wholes(rest) || !/^[0-9a-f]{64}$/.test(String(t.seed || ''))) p.push(`${k.ref || 'a donation'}: it does not say where its sats go`);
      else if (seeds.has(t.seed)) p.push(`${k.ref || 'a donation'}: its payment would be the same as another's`);  /* one seed, one set of outputs: the mint would sign only the first */
      else if (sumOf(t.pay) + sumOf(rest) > total) p.push(`${k.ref || 'a donation'}: it gives out more than it spends`);
      /* what the donation gives up is what does not go back under its lock: the payment and the mint's fee (what its amounts leave over; whether that is the mint's own fee is checked with the mint's keys, amountProblems) */
      else if (total - sumOf(rest) !== k.release) p.push(`${k.ref || 'a donation'}: it would take ${total - sumOf(rest)} sat of the donation, not ${k.release}`);
      if (typeof t.seed === 'string') seeds.add(t.seed); }
    else { const W = ps.map(x => isWhole(lockOf(String(x && x.secret))));
      // signed whole (since 15 Nov): what its transaction is, read here and built and checked whole before it is signed (certify). The
      // payment is Streetcat's, in outputs only Streetcat can open; what goes back is the rest of the last proof, where its donor looks.
      if (W.some(Boolean) && !W.every(Boolean)) p.push(`${k.ref || 'a donation'}: its proofs are under two kinds of lock`);
      else if (W[0]) { const t = k.tx || {}, rest = t.rest == null ? [] : t.rest, last = ps[ps.length - 1] || {};
        if (typeof t.id !== 'string' || !t.id || !wholes(t.pay) || !t.pay.length || !Array.isArray(t.payB) || t.payB.length !== t.pay.length || !t.payB.every(b => /^0[23][0-9a-f]{64}$/.test(String(b))) || !wholes(rest) || !SEED.test(String(t.seed || ''))) p.push(`${k.ref || 'a donation'}: it does not say where its sats go`);
        else if (new Set(t.payB).size !== t.payB.length || t.payB.some(b => seenB.has(b)) || seeds.has(t.seed)) p.push(`${k.ref || 'a donation'}: its payment would be the same as another's`);
        else if (sumOf(t.pay) + sumOf(rest) > total) p.push(`${k.ref || 'a donation'}: it gives out more than it spends`);
        else if (total - sumOf(rest) !== k.release) p.push(`${k.ref || 'a donation'}: it would take ${total - sumOf(rest)} sat of the donation, not ${k.release}`);
        else if (rest.length && (sumOf(rest) >= amt(last.amount) || rest.length > remainderSlots(last.amount))) p.push(`${k.ref || 'a donation'}: what it puts back is more than the proof it comes from`);
        if (Array.isArray(t.payB)) t.payB.forEach(b => seenB.add(String(b))); if (typeof t.seed === 'string') seeds.add(t.seed); }
      // TODAY'S LOCK AS IT WAS (SIG_INPUTS, donations made before 15 Nov): a signature on a proof's secret lets Streetcat's app take that
      // proof whole, whatever the request says it pays. So a request may name no more proofs than paying it needs: what they hold
      // beyond the payment is less than the largest of them (planRelease: whole proofs and one split, whose rest is all that is over).
      // The 1-sat proof made with a donation's secret (2.2) cannot be told from here: those donations keep that limit (README).
      else if (Number.isInteger(k.release) && total - k.release >= Math.max(...ps.map(x => amt(x.amount)))) p.push(`${k.ref || 'a donation'}: it names proofs of ${total} sat to pay ${k.release}: more than paying it needs`); } }
  return [...new Set(p)]; }
// what a request of a campaign that pays from the lock does with each donation, for the partner to see: paid to it, back under the lock, the mint's fee
const requestSplit = q => (q.contributions || []).map(k => { const total = (k.proofs || []).reduce((s, x) => s + amt(x.amount), 0), t = k.tx || {}, pay = wholes(t.pay) ? sumOf(t.pay) : 0, rest = wholes(t.rest) ? sumOf(t.rest) : 0; return { ref: k.ref, total, pay, rest, fee: total - pay - rest }; });
const requestAmount = q => q.contributions.reduce((s, k) => s + Number(k.release), 0);

// ---------- the answer: clinic → Streetcat ----------
// "certified": the clinic's NUT-11 signature on every proof (its half of the 2-of-2), and a declaration signed apart, with its derived
// statement key, naming the campaign, the request, the cat, the procedure, the date and exactly those proofs. Or "report": a signed
// note that the procedure was not done as asked. Either way the clinic's app signs only what it was shown.
const STMT = 'streetcat/clinic-certificate/v1\n', REPORT = 'streetcat/clinic-report/v1\n', REASONS = ['postponed', 'wrong-data', 'other'];
// The vet's invoice or a photo can back the declaration: only the file's SHA-256 goes in (evidence: { sha256, kind }); the file itself
// never leaves the clinic's device, and anyone given it later can check it against the published declaration. Older declarations have none.
const EVIDENCE = ['invoice', 'photo'];
const evidenceOk = e => !!e && typeof e === 'object' && Object.keys(e).sort().join() === 'kind,sha256' && /^[0-9a-f]{64}$/.test(e.sha256) && EVIDENCE.includes(e.kind);
// Who took a delivery in, as the partner writes it (optional): a short line of plain text, the partner's word, checked against nothing.
// The declaration never holds it: Streetcat publishes declarations in the campaign's public ledger. It holds only the line's
// fingerprint, salted, so that a list of names cannot find it there; the line and its salt travel with the answer, end to end
// encrypted to Streetcat (relay.js) or handed over by link, file or QR. Streetcat's app shows the line only when it gives the
// fingerprint the partner signed (checkAnswer: received 'ok'). One too long, empty or with control characters is not signed (certify).
const RECV_MAX = 60, RECV = 'streetcat/received/v1\n', receivedByOk = s => typeof s === 'string' && s.length >= 1 && s.length <= RECV_MAX && s === s.trim() && !/[\u0000-\u001f\u007f\u2028\u2029]/.test(s)
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);  /* half a character is not one: two lines would give one fingerprint (review of 12 Nov) */
const receivedOk = x => !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).join() === 'sha256' && /^[0-9a-f]{64}$/.test(x.sha256);
const receivedHash = (text, salt) => sha256hex(new TextEncoder().encode(RECV + salt + '\n' + text));
const statementOf = (q, signed, evidence, photos, received) => ({ type: 'streetcat/clinic-certificate', v: 1, campaign: campShort(campaignOf(q.campaign)), request: q.id, patient: q.patient, procedure: q.procedure, date: q.date,
  contributions: q.contributions.map(k => ({ ref: k.ref, release: Number(k.release), proofs: k.proofs.map(p => yOf(p.secret)) })), amount: requestAmount(q), clinic: askedOf(q), signed, ...(evidence ? { evidence: { sha256: evidence.sha256, kind: evidence.kind } } : {}), ...(photos && photos.length ? { photos: ansPhotos(photos) } : {}), ...(received ? { received: { sha256: received.sha256 } } : {}) });  /* clinic: the partner asked, the campaign's own unless its request names another of its list */
async function certify(q, clinicSk, signed = new Date().toISOString(), evidence = null, photos = null, receivedBy = null){ const bad = requestProblems(q); if (bad.length) throw new Error('not a valid request: ' + bad.join('; '));
  if (pubOf(clinicSk) !== askedOf(q)) throw new Error(`this key is not ${q.campaign.name}'s clinic key`); if (evidence && !evidenceOk(evidence)) throw new Error('the file\'s fingerprint is not a SHA-256 of an invoice or a photo');
  if (photos && photos.length && !ansPhotosOk(ansPhotos(photos))) throw new Error('the photos of the delivery are not valid');
  if (receivedBy != null && !receivedByOk(receivedBy)) throw new Error(`who received it: a line of 1 to ${RECV_MAX} characters`);
  const salt = receivedBy != null ? hex(root.crypto.getRandomValues(new Uint8Array(16))) : '', received = receivedBy != null ? { sha256: await receivedHash(receivedBy, salt) } : null;
  const c = campaignOf(q.campaign), statement = statementOf(q, signed, evidence, photos, received), sig = cashu.schnorrSignMessage(STMT + canon(statement), await derivedSk(TAG.statement, clinicSk)); let sigs;
  // a campaign that pays from the lock: each donation's transaction is built here, checked as the mint will check it (it pays this
  // partner what the request says, the rest stays under the same lock, nothing goes anywhere else), and signed whole (NUT-11 SIG_ALL)
  if (c.lock === 'dest') { sigs = []; for (const k of q.contributions) { const tx = await reqTx(q, k), no = destProblems(tx, destOf(c), { payee: askedOf(q), pay: k.release - tx.fee }); if (no.length) throw new Error(`not a valid request: ${k.ref || 'a donation'}: ${no.join('; ')}`); sigs.push(destSign(tx, clinicSk)); } }
  // today's lock: a donation signed whole gets one signature, on its whole transaction, built here from the request and checked first;
  // one made before, a signature on each proof's secret (NUT-11 SIG_INPUTS). In the request's order, as checkAnswer reads them.
  else { sigs = []; for (const k of q.contributions) { if (!contribWhole(k)) { for (const p of k.proofs) sigs.push(cashu.schnorrSignMessage(p.secret, clinicSk)); continue; }
    const tx = await reqWhole(q, k), no = wholeProblems(tx, c, { pay: k.release - tx.fee }); if (no.length) throw new Error(`not a valid request: ${k.ref || 'a donation'}: ${no.join('; ')}`); sigs.push(destSign(tx, clinicSk)); } }
  return { t: 'streetcat.answer', v: 1, id: q.id, kind: 'certified', statement, sig, sigs, ...(received ? { receivedBy: { text: receivedBy, salt } } : {}) }; }
async function report(q, clinicSk, reason, note = '', signed = new Date().toISOString()){ if (pubOf(clinicSk) !== askedOf(q)) throw new Error(`this key is not ${q.campaign.name}'s clinic key`);
  if (!REASONS.includes(reason)) throw new Error('reason: ' + REASONS.join(', '));
  const statement = { type: 'streetcat/clinic-report', v: 1, campaign: campShort(campaignOf(q.campaign)), request: q.id, reason, note: String(note || '').slice(0, 500), clinic: askedOf(q), signed };
  return { t: 'streetcat.answer', v: 1, id: q.id, kind: 'report', statement, sig: cashu.schnorrSignMessage(REPORT + canon(statement), await derivedSk(TAG.statement, clinicSk)) }; }
// Streetcat's check of an answer to its own request q: "certified" only when every proof carries a valid signature from the campaign's
// clinic key AND the declaration is signed with the clinic's statement key and names exactly this request and these proofs
async function checkAnswer(q, a){ const v = { ok: false, kind: a && a.kind, proofs: 0, signed: 0, other: 0, statement: 'missing', text: '' };
  if (!a || a.t !== 'streetcat.answer' || a.v !== 1 || a.id !== q.id) { v.text = '✗ this is not the answer to this request'; return v; }
  const c = campaignOf(q.campaign), me = askedOf(q), D = c.lock === 'dest', spk = await derivedPub(TAG.statement, me), st = a.statement, who = !c.pkind || c.pkind === 'clinic' ? 'clinic' : 'partner';  /* a shop or another partner: its key is the partner's; `me`: the partner asked */
  if (a.kind === 'report') { const good = !!st && st.type === 'streetcat/clinic-report' && st.request === q.id && lc(st.clinic) === me && canon(st.campaign) === canon(campShort(c)) && verify(a.sig, REPORT + canon(st), spk);
    v.statement = good ? 'ok' : 'badsig'; v.ok = good; v.text = good ? `the ${who} reports a problem (${st.reason})${st.note ? ': ' + st.note : ''}` : `✗ a report that is not signed with ${c.name}'s ${who} key`; return v; }
  if (a.kind !== 'certified') { v.text = '✗ an answer of an unknown kind'; return v; }
  const want = statementOf(q, st && st.signed, st && evidenceOk(st.evidence) ? st.evidence : null, st && ansPhotosOk(st.photos) ? st.photos : null, st && receivedOk(st.received) ? st.received : null),  /* its photos too, and the fingerprint of who received it: named, signed */ signedBy = !!st && verify(a.sig, STMT + canon(st), spk), same = !!st && canon(st) === canon(want);
  v.statement = !st ? 'missing' : !signedBy ? (lc(st.clinic) !== me ? 'otherkey' : 'badsig') : !same ? 'mismatch' : 'ok';
  const proofs = q.contributions.flatMap(k => k.proofs);
  // a campaign that pays from the lock: one signature per donation, on the whole transaction its request says (built here anew)
  if (D) { v.proofs = q.contributions.length; for (let i = 0; i < q.contributions.length; i++) { const s = (a.sigs || [])[i]; if (!s) continue; let tx = null; try { tx = await reqTx(q, q.contributions[i]); } catch (_) {} if (tx && destSigned(tx, s, me)) v.signed++; else v.other++; } }
  // today's lock: one signature per donation signed whole, on its whole transaction (built here anew), and one per proof of a donation made before
  else { let i = 0; for (const k of q.contributions) { if (!contribWhole(k)) { for (const p of k.proofs) { v.proofs++; const s = (a.sigs || [])[i++]; if (!s) continue; if (verify(s, p.secret, c.clinic)) v.signed++; else v.other++; } continue; }
    v.proofs++; const s = (a.sigs || [])[i++]; if (!s) continue; let tx = null; try { tx = await reqWhole(q, k); } catch (_) {} if (tx && destSigned(tx, s, c.clinic)) v.signed++; else v.other++; } }
  const nw = D ? 0 : q.contributions.filter(contribWhole).length, allWhole = D || nw === q.contributions.length;
  v.ok = v.proofs > 0 && v.signed === v.proofs && v.statement === 'ok';
  v.text = v.ok ? (allWhole ? `✓ certified: ${v.proofs === 1 ? 'its payment' : 'all ' + v.proofs + ' payments'} signed whole with ${c.name}'s ${who} key, and its declaration names exactly ${v.proofs === 1 ? 'it' : 'them'}` : nw ? `✓ certified: every donation signed with ${c.name}'s ${who} key (${nw} signed whole, the others proof by proof), and its declaration names exactly them` : `✓ certified: all ${v.proofs} proof${v.proofs === 1 ? '' : 's'} signed with ${c.name}'s ${who} key, and its declaration names exactly them`)
    : v.signed && v.signed < v.proofs ? `✗ Partly signed (${v.signed} of ${v.proofs}) — not certified`
    : v.other && !v.signed ? `✗ Signed with a key that is not ${c.name}'s ${who} key — not certified`
    : v.statement !== 'ok' ? `✗ its declaration ${({ missing: 'is missing', badsig: `is not signed with ${c.name}'s ${who} key`, otherkey: `names another ${who} key`, mismatch: 'does not match this request' })[v.statement]} — not certified` : '✗ not certified';
  // who received it: read only when its line and salt give the fingerprint the declaration signed; otherwise not shown (the
  // confirmation itself stands or falls on its own: a name is a note, not the work)
  v.received = 'none'; v.receivedBy = null;
  if ((st && st.received) || a.receivedBy) { const x = a.receivedBy, good = !!st && receivedOk(st.received) && !!x && typeof x === 'object' && receivedByOk(x.text) && /^[0-9a-f]{32}$/.test(String(x.salt)) && await receivedHash(x.text, x.salt) === st.received.sha256;
    v.received = good ? 'ok' : !x ? 'missing' : 'mismatch'; if (good) v.receivedBy = x.text; }
  return v; }
// the clinic's signatures by proof (Y), to put into the full proofs Streetcat kept (their witness), next to Streetcat's own: those of
// donations made before 15 Nov (a donation signed whole has one signature, for its whole transaction: clinicSigsOf)
const clinicSigsByY = (q, a) => { const m = new Map(); let i = 0; for (const k of q.contributions) { if (contribWhole(k)) { i++; continue; } for (const p of k.proofs) m.set(yOf(p.secret), a.sigs[i++]); } return m; };
const clinicSigsOf = (q, a) => { let i = 0; return q.contributions.map(k => contribWhole(k) ? a.sigs[i++] : k.proofs.map(() => a.sigs[i++])); };  /* per donation: its one signature, or its proofs' */
const withSig = (p, sig) => { let have = []; try { have = cashu.getP2PKWitnessSignatures(p.witness); } catch (_) {} return { ...p, witness: JSON.stringify({ signatures: [...have, sig] }) }; };

// ---------- packing: one format whether it goes by link, file or relay ----------
// JSON, compressed (deflate-raw) and written in base64url after a version prefix; plain JSON (a file) is read too. Unpacking stops at
// 1 MB, so a link cannot be made to expand without end.
const LIMIT = 1 << 20;
const b64u = { enc: b => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return root.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: s => { const t = root.atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(t, ch => ch.charCodeAt(0)); } };
async function through(bytes, Kind){ const cs = new Kind('deflate-raw'), w = cs.writable.getWriter(); w.write(bytes).catch(() => {}); w.close().catch(() => {});
  const r = cs.readable.getReader(), parts = []; let n = 0; for (;;) { const { done, value } = await r.read(); if (done) break; n += value.length; if (n > LIMIT) { r.cancel().catch(() => {}); throw new Error('too large'); } parts.push(value); }
  return concat(...parts); }
async function pack(obj){ const j = enc.encode(JSON.stringify(obj)); if (root.CompressionStream) { try { return 'sc1.' + b64u.enc(await through(j, root.CompressionStream)); } catch (_) {} } return 'sc0.' + b64u.enc(j); }
async function unpack(text){ let s = String(text || '').trim(); const m = s.match(/#(?:q|a|h)=([^&\s]+)/); if (m) s = decodeURIComponent(m[1]);
  if (s.length > 4 * LIMIT) throw new Error('too large');
  if (s.startsWith('{')) return JSON.parse(s);
  if (s.startsWith('sc1.')) { if (!root.DecompressionStream) throw new Error('this browser cannot read compressed links'); return JSON.parse(dec.decode(await through(b64u.dec(s.slice(4)), root.DecompressionStream))); }
  if (s.startsWith('sc0.')) return JSON.parse(dec.decode(b64u.dec(s.slice(4))));
  throw new Error('this is not a Streetcat request or answer'); }
// a link opens the app on the right screen: #q= a request (for the clinic), #a= an answer (for Streetcat), #h= a handover
const linkFor = async (base, obj) => String(base).split('#')[0] + '#' + ({ 'streetcat.request': 'q', 'streetcat.answer': 'a', 'streetcat.handover': 'h' }[obj.t] || 'a') + '=' + await pack(obj);

// ---------- split donations: what is not released goes back under the same lock ----------
// A proof is spent whole. When only part of it pays for a procedure, the rest goes back in new proofs under exactly the same lock (the
// same keys and deadline, the same donor refund key). Their secrets and blinding factors are hashes of the proof's secret and of r, the
// blinding factor the mint never saw (it travels in the token's DLEQ, NUT-12). So whoever holds the original token (the donor, or anyone
// reading the published ledger) can rebuild their blinded messages and ask the mint for them (NUT-09 restore) without trusting Streetcat
// to publish anything; and the mint, which never saw r, cannot link them to the proof they came from.
// Trust: under today's lock as it was (SIG_INPUTS) the clinic's signatures do not bind the outputs, so it is Streetcat's app that puts
// the rest back; anyone can check afterwards that it did, because the rest must be at the mint under these derived blinded messages.
// Signed whole (since 15 Nov), the clinic signs these very outputs.
const REM = 'streetcat/remainder/v1';
async function remainderPart(proof, i){ const r = proof.dleq && proof.dleq.r; if (!r) throw new Error('this proof carries no DLEQ blinding factor, so a remainder could not be found again: it can only be released whole');
  const base = concat(unhex(String(r).padStart(64, '0')), enc.encode(proof.secret), new Uint8Array([i]));
  const nonce = hex(await sha256(concat(enc.encode(REM + '/nonce\n'), base)));
  let bf = big(await sha256(concat(enc.encode(REM + '/r\n'), base))) % N; if (bf === 0n) bf = 1n;
  const s = JSON.parse(proof.secret); s[1] = { ...s[1], nonce }; const secret = JSON.stringify(s);  // the same lock, a new nonce
  return { secret, r: bf, B_: cashu.blindMessage(enc.encode(secret), bf).B_.toHex(true) }; }
const remainderSlots = amount => { const a = amt(amount); return a > 1 ? Math.ceil(Math.log2(a)) : 0; };  // a rest is smaller than its proof: at most this many pieces
// which proofs pay `amount` out of a donation: whole proofs, largest first, then at most one proof split
// How a donation is cut when it is locked: a release takes whole proofs and splits at most one, and the
// mint does not bind what a split proof's rest becomes under the lock as it was (SIG_INPUTS), so the piece that is split is what a
// changed Rescue client could take beyond the amount confirmed (signed whole, since 15 Nov, it cannot). Cut small, that piece is small: no proof holds more than a tenth of the donation (the largest
// denomination the mint has at or under that), the rest in the usual powers of two; about a dozen proofs, never more than twenty-odd.
// `denoms` are the mint's denominations (its keyset's amounts); without them, powers of two.
function donationSplit(amount, denoms){ amount = Number(amount); if (!(amount > 0)) return [];
  const ds = (denoms && denoms.length ? denoms.map(Number).filter(d => d > 0) : Array.from({ length: 40 }, (_, i) => 2 ** i)).sort((a, b) => b - a);
  const cap = ds.find(d => d <= Math.max(1, Math.floor(amount / 10))) || ds[ds.length - 1], out = []; let left = amount;
  while (left >= cap) { out.push(cap); left -= cap; }
  for (const d of ds) while (d <= left && d < cap) { out.push(d); left -= d; }
  return left ? null : out; }  /* null: the mint's denominations cannot make this amount */
function planRelease(proofs, amount){ amount = Number(amount); const ps = proofs.slice().sort((a, b) => amt(b.amount) - amt(a.amount)); let need = amount; const whole = [], rest = [];
  if (!Number.isInteger(amount) || amount < 1) throw new Error('nothing to release');
  for (const p of ps) { if (amt(p.amount) <= need) { whole.push(p); need -= amt(p.amount); } else rest.push(p); }
  if (!need) return { whole, split: null, part: 0, remainder: 0, inputs: whole };
  const split = rest.filter(p => amt(p.amount) > need).sort((a, b) => amt(a.amount) - amt(b.amount))[0]; if (!split) throw new Error(`these proofs cannot pay ${amount} sat`);
  return { whole, split, part: need, remainder: amt(split.amount) - need, inputs: [...whole, split] }; }
// the outputs that put the rest of `proof` back: `amounts` is the rest in the mint's denominations, one output per slot
async function remainderOutputs(proof, amounts, keysetId){ const out = [];
  for (let i = 0; i < amounts.length; i++) { const p = await remainderPart(proof, i); out.push(new cashu.OutputData({ amount: cashu.Amount.from(amounts[i]), id: keysetId, B_: p.B_ }, p.r, enc.encode(p.secret))); }
  return out; }
// what came back from `proof` when only part of it was released, asked of the mint slot by slot (NUT-09); empty if it went whole.
// A restore request names each blinded message with amount 0, as cashu-ts does for its own restores: the mint finds them by B_.
// For many proofs at once: Y of a proof → the proofs its rest went back in (one restore request per 200 slots).
async function findRemainders(w, proofs){ const slots = [];
  for (const p of proofs) { const n = remainderSlots(p.amount); if (!n || !(p.dleq && p.dleq.r)) continue; for (let i = 0; i < n; i++) slots.push({ y: yOf(p.secret), part: await remainderPart(p, i), id: p.id }); }
  const out = new Map();
  for (let at = 0; at < slots.length; at += 200) { const chunk = slots.slice(at, at + 200), id = w.keysetId || chunk[0].id;
    const res = await w.mint.restore({ outputs: chunk.map(s => ({ amount: 0, id, B_: s.part.B_ })) }), sigs = new Map((res.outputs || []).map((o, i) => [o.B_, (res.signatures || [])[i]]));
    for (const s of chunk) { const sig = sigs.get(s.part.B_); if (!sig) continue; const keys = await w.keyChain.ensureKeysetKeys(sig.id);
      const pr = new cashu.OutputData({ amount: sig.amount, id: sig.id, B_: s.part.B_ }, s.part.r, enc.encode(s.part.secret)).toProof(sig, keys); if (!out.has(s.y)) out.set(s.y, []); out.get(s.y).push(pr); } }
  return out; }
const findRemainder = async (w, proof) => (await findRemainders(w, [proof])).get(yOf(proof.secret)) || [];
// every proof of a donation as the mint sees it, the rest of what was released in part followed down: each with its state, its
// witness, how deep it is (0: the donation's own proofs) and how much of it went back under the lock (`putBack`)
// each proof once, whatever the list handed in repeats (six scans, 15 Nov, 2.7: a proof given twice was traced and counted twice)
const onceEach = proofs => { const u = new Set(); return (proofs || []).filter(p => { const y = yOf(p.secret); if (u.has(y)) return false; u.add(y); return true; }); };
async function traceDonation(w, proofs, depth = 0){ proofs = onceEach(proofs); const states = await w.checkProofsStates(proofs), byY = new Map(states.map(s => [lc(s.Y), s])), out = [];
  const spent = proofs.filter(p => (byY.get(yOf(p.secret)) || {}).state === 'SPENT'), rest = spent.length && depth < 48 ? await findRemainders(w, spent) : new Map();  /* each piece of a rest is at most half the proof it comes from, so no chain is longer than a proof has bits (the limit was 8: a rest of a rest nine deep was not found) */
  for (const p of proofs) { const s = byY.get(yOf(p.secret)) || {}, back = rest.get(yOf(p.secret)) || [];
    out.push({ proof: p, state: s.state || 'UNKNOWN', witness: s.witness || null, depth, putBack: back.reduce((a, x) => a + amt(x.amount), 0) });
    if (back.length) out.push(...await traceDonation(w, back, depth + 1)); }
  return out; }

// ---------- a lock that says where the money may go: `dest` (docs/dest-lock.md; experimental, 10 Nov) ----------
// Under the lock above the two signers together can send the money anywhere: signed proof by proof (as it was) their signatures decide
// nothing about the outputs, and signed whole (since 15 Nov) they fix them, but nothing says where they may go.
// A mint that knows the tag ["dest","pubkeys"] refuses a spend unless every output is opened in the witness and is either a payment
// to a partner that signed that very transaction, or the same lock again. Streetcat's key (the lock's data) has to sign and can never
// be paid. The partners that can be paid are the lock's pubkeys: one, or a list. A mint that does not announce the rule ignores the tag, and any two of the
// keys could send the ecash anywhere: nothing is locked this way unless destMint says its mint enforces it.
const DEST = 'pubkeys', PAY = 'streetcat/dest-pay/v2';
const destMint = info => { const n = info && info.nuts && info.nuts['11']; return !!n && Array.isArray(n.dest) && n.dest.includes(DEST); };
// the secret of one proof of a donation: `streetcat` orders, `payees` are the partners, `refund` is the donor's key for after `deadline`
function destSecret({ streetcat, payees, deadline, refund }, nonce = hex(root.crypto.getRandomValues(new Uint8Array(32)))){ const keys = [streetcat, ...(Array.isArray(payees) ? payees : []), refund];
  if (keys.length < 3 || keys.some(k => !pointOk(k)) || new Set(keys.map(xOnly)).size !== keys.length || !Number.isInteger(Number(deadline)) || Number(deadline) < 1)
    throw new Error('a lock needs Streetcat\'s key, at least one partner, the donor\'s refund key (each key once) and a deadline');
  return JSON.stringify(['P2PK', { nonce, data: lc(streetcat), tags: [['sigflag', 'SIG_ALL'], ['n_sigs', '2'], ['pubkeys', ...payees.map(lc)], ['locktime', String(Number(deadline))], ['refund', lc(refund)], ['dest', DEST]] }]); }
// what such a campaign promises, read with the strict reader above (lockOf). `c`: { streetcat, payees, deadline }
function destLockProblem(l, c){ if (!l) return 'not a P2PK lock'; if (l.bad) return l.bad;
  const pay = ((c && c.payees) || []).map(xOnly).sort(); if (!pay.length) return 'the campaign names no partner';
  if (!l.dest) return 'no rule about where it goes: its signers could send it anywhere'; if (l.dest !== DEST) return 'a rule about where it goes that this app does not know';
  if (l.sigflag !== 'SIG_ALL') return 'its signatures would not cover where it goes';
  if (xOnly(l.main[0]) !== xOnly(c.streetcat)) return 'the key that orders is not Streetcat\'s';
  if (l.main.slice(1).map(xOnly).sort().join() !== pay.join()) return 'it could pay other keys than the campaign\'s partners';
  /* audit of 10 Nov: the mint pays a partner by its key as the lock writes it, and this app as the campaign writes it. The same point written 03… for 02… is one signer to a signature, and passed here; the mint then refused every payment from it. The order is the campaign's too: the app files a donation by its lock's keys as written (index.js lockId) */
  if (l.main[0] !== lc(c.streetcat) || l.main.slice(1).join() !== ((c && c.payees) || []).map(lc).join()) return 'its keys are not written as the campaign writes them (their order, or 02… for 03…): the mint could not pay from it';
  if (l.n !== 2) return `needs ${l.n} signature(s), not 2`; if (l.locktime !== Number(c.deadline)) return 'its deadline is not the campaign deadline';
  if (!l.refund.length) return 'no refund key: anyone could take it after the deadline'; if (l.refund.length !== 1) return 'more than one refund key: only the donor may take it back';
  if (l.main.map(xOnly).includes(xOnly(l.refund[0]))) return 'its refund key is Streetcat\'s or a partner\'s: only the donor may take it back';
  if (l.nRefund !== 1) return 'unusual refund rule'; if (l.unknown.length) return `a tag this app does not know (${l.unknown[0]})`; return ''; }
// a lock without its nonce (its kind, data and tags as written: the mint compares them exactly), and a secret's nonce
const lockShape = s => { try { const j = JSON.parse(s); return canon([j[0], j[1].data, j[1].tags == null ? [] : j[1].tags]); } catch (_) { return ''; } };
const nonceOf = s => { try { return String(JSON.parse(s)[1].nonce || ''); } catch (_) { return ''; } };
// a payment as the mint takes one: a P2PK secret with a nonce, a key and no tags (nobody else could ever spend it). The key it pays, or ''.
const payKey = s => { try { const j = JSON.parse(s), d = Array.isArray(j) && j.length === 2 && j[0] === 'P2PK' ? j[1] : null;
  return d && typeof d === 'object' && !Array.isArray(d) && typeof d.data === 'string' && typeof d.nonce === 'string' && d.nonce && (d.tags == null || (Array.isArray(d.tags) && !d.tags.length)) && Object.keys(d).every(k => k === 'nonce' || k === 'data' || k === 'tags') ? lc(d.data) : ''; } catch (_) { return ''; } };
const piecesOf = (n, denoms) => { const sizes = (denoms && denoms.length ? denoms.map(Number).filter(d => d > 0) : Array.from({ length: 40 }, (_, i) => 2 ** i)).sort((a, b) => b - a), out = [];
  for (const s of sizes) while (n >= s) { out.push(s); n -= s; } if (n) throw new Error('the mint\'s denominations cannot make this amount'); return out; };
// THE OUTPUTS OF A RELEASE COME FROM A SEED THAT ONLY ITS REQUEST CARRIES (audit of 10 Nov). Before, they were worked out from the proofs
// spent (their secret and the r in their DLEQ), which the published ledger shows to everyone: anyone could work out the blinded messages
// a release would use and have the mint sign them first with a sat of their own, and the mint never signs one twice ("outputs already
// signed"): for a few sats a stranger could block every release of a donation until its deadline. The seed is 32 random bytes made
// with the request, which travels sealed to the partner alone; Streetcat's app and the partner's build the same transaction from it,
// letter for letter, and nobody else can know its blinded messages before the mint has signed them. Nothing has to be found again by
// working it out: the partner has the request; the donor and the status page read where the rest went in the witness (destTrace).
// A payment is locked to the partner's key alone (no tags: the mint refuses a payment that anyone else could also spend); a rest goes
// back under the very lock it came from, with a new nonce.
const SEED = /^[0-9a-f]{64}$/, newSeed = () => hex(root.crypto.getRandomValues(new Uint8Array(32)));
async function destPart(seed, kind, i, secretOf){ if (!SEED.test(String(seed || ''))) throw new Error('this is not a payment under the lock');
  const base = concat(unhex(seed), enc.encode(kind), new Uint8Array([i >> 8, i & 255]));
  const nonce = hex(await sha256(concat(enc.encode(PAY + '/nonce\n'), base))); let bf = big(await sha256(concat(enc.encode(PAY + '/r\n'), base))) % N; if (bf === 0n) bf = 1n;
  const secret = secretOf(nonce); return { secret, r: bf, B_: cashu.blindMessage(enc.encode(secret), bf).B_.toHex(true) }; }
// One donation's part of a release, as one transaction (a SIG_ALL spend takes one lock, and each donation has its own refund key):
// `proofs` are the proofs that pay (planRelease: whole ones and at most one split), `pay` what goes to `payee`. `pay` is what the
// donation gives up; the mint's input fee (`fee`) comes out of it, as it comes out of a release under today's lock, so the partner
// gets pay - fee and what is left of the split proof goes back whole under the same lock (a donor's rest is never what pays a fee;
// before 10 Nov the fee came out of the rest, and a donation released whole had none to pay it with). Outputs: the payment's first,
// then the rest's.
async function destTx({ proofs, pay, payee, keysetId, denoms, fee = 0, seed = newSeed() }){ pay = Number(pay); if (!pointOk(payee)) throw new Error('the partner\'s key is not a public key');
  const plan = planRelease(proofs, pay); if (plan.inputs.length !== proofs.length) throw new Error('more proofs than this payment needs');
  if (!Number.isInteger(fee) || fee < 0 || pay - fee < 1) throw new Error('nothing would be left to pay the partner after the mint\'s fee');
  const spec = { id: String(keysetId), pay: piecesOf(pay - fee, denoms), rest: plan.remainder ? piecesOf(plan.remainder, denoms) : [], seed };  /* all a request has to say of it */
  return { ...await destBuild({ inputs: plan.inputs, payee, ...spec }), spec }; }
// The transaction itself, from what a request says of it: the proofs it spends, in their order, who is paid, the keyset of its outputs,
// their amounts (`pay` to the partner, `rest` back under the lock) and its seed. Whoever is given these few things builds the same
// transaction, letter for letter: the partner's app the one it signs, Streetcat's the one it sends.
async function destBuild({ inputs, payee, id, pay, rest = [], seed }){ if (!pointOk(payee)) throw new Error('the partner\'s key is not a public key');
  const ins = (Array.isArray(inputs) ? inputs : []).map(slim); if (!ins.length || typeof id !== 'string' || !id || !wholes(pay) || !pay.length || !wholes(rest) || !SEED.test(String(seed || ''))) throw new Error('this is not a payment under the lock');
  const parts = [], same = JSON.parse(ins[0].secret); for (let i = 0; i < pay.length; i++) parts.push({ amount: pay[i], ...await destPart(seed, 'pay', i, nonce => JSON.stringify(['P2PK', { nonce, data: lc(payee) }])) });
  for (let i = 0; i < rest.length; i++) parts.push({ amount: rest[i], ...await destPart(seed, 'rest', i, nonce => JSON.stringify([same[0], { ...same[1], nonce }])) });  /* the same lock, a new nonce */
  return { inputs: ins, outputs: parts.map(x => ({ amount: x.amount, id, B_: x.B_ })), open: parts.map(x => ({ secret: x.secret, r: x.r.toString(16).padStart(64, '0') })), pay: sumOf(pay), rest: sumOf(rest), fee: ins.reduce((t, x) => t + x.amount, 0) - sumOf(pay) - sumOf(rest), payee: lc(payee) }; }
// What the partner's app checks before it signs such a transaction, and Streetcat's before it sends one: the mint's own rule (so a
// refusal is known before anything is signed) and that it pays `pay` sat to `payee`, no more and no less. The partner signs the whole
// transaction, so this is where it sees what it signs. `c`: { streetcat, payees, deadline }. The list carries what it found: paid, rest, fee.
function destProblems(tx, c, { payee, pay }){ const p = [], ins = tx && Array.isArray(tx.inputs) ? tx.inputs : [], outs = tx && Array.isArray(tx.outputs) ? tx.outputs : [], open = tx && Array.isArray(tx.open) ? tx.open : [];
  let paid = 0, rest = 0, total = 0, given = 0; if (!ins.length || !outs.length) return Object.assign(['it spends nothing'], { paid, rest, fee: 0 });
  const lock = lockShape(ins[0].secret), nonces = new Set(ins.map(x => nonceOf(x.secret))), seen = new Set();
  for (const x of ins) { const bad = destLockProblem(lockOf(x.secret), c); if (bad) p.push('a proof is not this campaign\'s: ' + bad); else if (lockShape(x.secret) !== lock) p.push('its proofs are not under one lock'); total += amt(x.amount); }
  if (!pointOk(payee) || !((c && c.payees) || []).some(k => sameKey(k, payee))) p.push('the one to be paid is not a partner of this campaign');
  if (outs.length !== open.length) p.push('not every output is opened');
  else outs.forEach((o, i) => { const s = String((open[i] || {}).secret || ''), a = amt(o.amount); given += a; let B = ''; try { B = cashu.blindMessage(enc.encode(s), BigInt('0x' + open[i].r)).B_.toHex(true); } catch (_) {}
    if (!s || !B || B !== o.B_ || !Number.isInteger(a) || a < 1) { p.push('an output is not what it is said to be'); return; }  /* B_ written as rebuilt, in lower case: the mint's rule asks it (14 Nov) */ if (seen.has(s)) { p.push('two outputs have one secret'); return; } seen.add(s);
    if (lockShape(s) === lock) { if (nonces.has(nonceOf(s))) p.push('what stays locked repeats a proof it comes from'); else rest += a; return; }
    if (payKey(s) && payKey(s) === lc(payee)) paid += a; else p.push('an output goes somewhere else than to the partner or back under the lock'); });
  if (!p.length && paid !== Number(pay)) p.push(`it pays ${paid} sat, not ${pay}`);
  if (!p.length && given > total) p.push('it gives out more than it spends');
  return Object.assign([...new Set(p)], { paid, rest, fee: total - given }); }
// NUT-11's SIG_ALL message for a swap: every input's secret and C, then every output's amount and B_. Both keys sign this text.
const destMessage = tx => tx.inputs.map(x => x.secret + x.C).join('') + tx.outputs.map(o => String(amt(o.amount)) + o.B_).join('');
const destSign = (tx, sk) => cashu.schnorrSignMessage(destMessage(tx), sk);
const destSigned = (tx, sig, pk) => verify(sig, destMessage(tx), pk);
const destParts = async (w, parts) => { const out = [];  /* proofs from opened outputs and the mint's signatures: amount, DLEQ and r with each; `to`: the key a payment pays ('' for a rest, and for an output that is no payment) */
  for (const x of parts) { const keys = await w.keyChain.ensureKeysetKeys(x.sig.id), pr = new cashu.OutputData({ amount: x.sig.amount, id: x.sig.id, B_: x.B_ }, x.r, enc.encode(x.secret)).toProof(x.sig, keys);
    const rest = lockShape(x.secret) === x.lock; out.push({ proof: pr, amount: amt(x.sig.amount), rest, to: rest ? '' : payKey(x.secret), B_: lc(x.B_) }); }
  return out; };
// The swap itself. cashu-ts writes its own witnesses, so the transaction goes as it is: the first input carries both signatures, the
// opened outputs and, for whoever reads the mint afterwards, the transaction's inputs (`inputs`: each one's Y, in order). The mint does
// not read that list; with it anyone who holds the donation can write the signed text again and check both signatures (destTrace), so a
// release is proven by the mint's record and nobody else's spend can be taken for one. What comes back, part by part: `to` (a key), `rest` (true: back under the lock), its amount and its proof, with
// the mint's DLEQ proof and r, which a later request for what is left needs.
async function destSwap(w, tx, sigs){ const witness = JSON.stringify({ signatures: sigs, outputs: tx.open, inputs: tx.inputs.map(x => yOf(x.secret)) }), lock = lockShape(tx.inputs[0].secret);
  const res = await w.mint.swap({ inputs: tx.inputs.map((x, i) => ({ id: x.id, amount: amt(x.amount), secret: x.secret, C: x.C, ...(i ? {} : { witness }) })), outputs: tx.outputs });
  if (!res || !Array.isArray(res.signatures) || res.signatures.length !== tx.outputs.length) throw new Error('the mint did not answer with a signature for every output');
  return destParts(w, tx.outputs.map((o, i) => ({ secret: tx.open[i].secret, r: BigInt('0x' + tx.open[i].r), B_: o.B_, sig: res.signatures[i], lock }))); }
// Is what the mint signed (destSwap, destFind) this very transaction: every output of it, each for its amount? Asked before a
// transaction read back from the mint is booked as done (audit of 10 Nov: anything found under its blinded messages was taken for it).
const destWhole = (tx, parts) => !!tx && Array.isArray(parts) && parts.length === tx.outputs.length && parts.every((x, i) => x.B_ === lc(tx.outputs[i].B_) && x.amount === amt(tx.outputs[i].amount));
// What the mint has signed of a transaction, asked by its outputs (NUT-09), part by part as destSwap gives them; nothing when it was
// never taken. The partner finds its payment this way, with the request alone (it built the transaction itself, so it holds every
// output's secret and r: nobody has to hand the payment over); and Streetcat's app what became of a release whose answer was lost.
async function destFind(w, tx){ const lock = lockShape(tx.inputs[0].secret), found = [];
  for (let at = 0; at < tx.outputs.length; at += 200) { const chunk = tx.outputs.slice(at, at + 200).map((o, i) => ({ o, x: tx.open[at + i] }));
    const res = await w.mint.restore({ outputs: chunk.map(c => ({ amount: 0, id: c.o.id, B_: c.o.B_ })) }), sigs = new Map((res.outputs || []).map((b, i) => [b.B_, (res.signatures || [])[i]]));
    for (const c of chunk) { const sig = sigs.get(c.o.B_); if (sig) found.push({ secret: c.x.secret, r: BigInt('0x' + c.x.r), B_: c.o.B_, sig, lock }); } }
  return destParts(w, found); }
// Where a spent proof under `dest` went, from what the mint keeps: the opened outputs in its witness (NUT-07) and the mint's
// signatures for their blinded messages (NUT-09), which carry the amounts. The partner needs nobody to hand its payment over, nor
// the donor to find what is left; and the status page reads from it how much went to which key. `lockSecret`: the spent proof's secret.
async function destOutputs(w, witness, lockSecret){ let o = null; try { o = JSON.parse(witness).outputs; } catch (_) {} if (!Array.isArray(o) || !o.length) return [];
  const lock = lockShape(lockSecret), parts = [], found = [];
  for (const x of o) { try { if (!x || typeof x.secret !== 'string' || !/^[0-9a-f]{64}$/.test(String(x.r))) continue; const secret = x.secret, r = BigInt('0x' + x.r); parts.push({ secret, r, B_: cashu.blindMessage(enc.encode(secret), r).B_.toHex(true), lock }); } catch (_) {} }
  for (let at = 0; at < parts.length; at += 200) { const chunk = parts.slice(at, at + 200), id = w.keysetId || w.keyChain.getCheapestKeyset().id;
    const res = await w.mint.restore({ outputs: chunk.map(s => ({ amount: 0, id, B_: s.B_ })) }), sigs = new Map((res.outputs || []).map((b, i) => [b.B_, (res.signatures || [])[i]]));
    for (const s of chunk) { const sig = sigs.get(s.B_); if (sig) found.push({ ...s, sig }); } }
  return destParts(w, found); }
// What became of a donation under `dest`, from the mint alone: how much is still locked, how much was paid to which partner, what the
// mint kept in fees and how much went back to its donor. Under SIG_ALL only a transaction's first proof carries a witness and its
// signatures are on the whole transaction, so who signed cannot be read proof by proof, as under today's lock. It is read transaction
// by transaction instead (audit of 10 Nov: before, a release was guessed from the shape of the witness):
// · A RELEASE IS PROVEN. Its witness names its inputs (destSwap) and opens its outputs, so the signed text can be written again here;
//   a spend counts as a release only when Streetcat's key and every partner it pays have signed that text, which is the mint's own
//   rule. Then its inputs, its payments, its rest and its fee are exact.
// · WHAT STAYS LOCKED IS FOLLOWED FROM THE WITNESS, wherever it was put: a rest is any opened output under the same lock. Nothing is
//   looked for where it could be worked out from the proofs: a stranger can put a sat there (see destPart).
// · NOTHING IS COUNTED TWICE: an opened output counts once, whichever proofs carry a copy of the witness (the mint reads only the first).
// · ANY OTHER SPEND IS NOT A RELEASE. With a signature and no payment to a partner it went the one other way the mint allows, back to
//   its donor after the deadline (`refunded`); a donor who opens its outputs, or pays a stranger, cannot make that look like a release.
//   One that pays a partner without the two signatures shown (a client that leaves the inputs out, or a donor paying a partner after
//   the deadline) is `unproven`: said as it is, never as a release.
// Each proof of `trace` gets `how` (locked · pending · nostate · released · refunded · unproven · unknown) and `left`, how much of it
// left the lock (its amount less what went back under it), so the sums by state add up to the donation.
// A witness's signatures are read as the mint reads them: Python's bytes.fromhex() skips ASCII whitespace, so the mint takes a
// signature with spaces or line breaks in it (Daybreak, 14 Nov: this side did not, and a release the mint took could be shown
// "not proven"). Each one is still checked against its key and this very transaction: what is dropped is never part of a signature.
const sigClean = g => String(g).replace(/[\t\n\v\f\r ]+/g, '');
const witnessClean = w => { try { const j = JSON.parse(w); if (j && typeof j === 'object' && Array.isArray(j.signatures)) return JSON.stringify({ ...j, signatures: j.signatures.map(g => typeof g === 'string' ? sigClean(g) : g) }); } catch (_) {} return w; };
// WAS IT THIS VERY TRANSACTION, AND AN AUTHORIZED ONE, that spent a donation (six scans, 15 Nov, 2.9, 3.2 and 3.13)? Asked of the
// witness the mint keeps with the transaction's first input (NUT-07), before a payment found under its outputs is booked or sent
// on: it names these inputs, in order; it opens these outputs; and `keys` (Streetcat's and the partner's it pays) each signed this
// transaction's text. Its outputs found signed say less (whoever knows them could have had them signed with other ecash), and so do
// spent inputs with these outputs opened (a donor taking its donation back after the deadline can open them too).
const destProven = (tx, witness, keys) => { let j = null; try { j = JSON.parse(witness); } catch (_) {} if (!tx || !j || typeof j !== 'object' || !Array.isArray(j.outputs) || !Array.isArray(j.inputs) || !Array.isArray(j.signatures) || !Array.isArray(keys) || !keys.length) return false;
  if (j.inputs.length !== tx.inputs.length || !tx.inputs.every((x, i) => lc(j.inputs[i]) === yOf(x.secret))) return false;
  if (j.outputs.length !== tx.open.length || !tx.open.every((x, i) => j.outputs[i] && j.outputs[i].secret === x.secret && String(j.outputs[i].r) === String(x.r))) return false;
  const sigs = j.signatures.filter(g => typeof g === 'string').map(sigClean).slice(0, 32), text = destMessage(tx); return keys.every(k => sigs.some(g => { try { return verify(g, text, k); } catch (_) { return false; } })); };
async function destTrace(w, proofs){ const trace = [], bySecret = new Map(), opened = new Map(), read = new Map(), witOf = x => { try { const j = JSON.parse(x.witness); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch (_) { return null; } };
  for (let layer = (proofs || []).slice(), depth = 0; layer.length && depth < 64; depth++) { const states = await w.checkProofsStates(layer), stateOf = new Map(states.map(t => [lc(t.Y), t])), more = [];
    for (const p of layer) { if (bySecret.has(p.secret)) continue; const t = stateOf.get(yOf(p.secret)) || {}, x = { proof: p, state: t.state || 'UNKNOWN', witness: t.witness || null, depth }; bySecret.set(p.secret, x); trace.push(x);
      if (x.state !== 'SPENT' || !x.witness) continue; let outs = read.get(x.witness); if (!outs) { outs = await destOutputs(w, x.witness, p.secret); read.set(x.witness, outs); } opened.set(p.secret, outs);  /* the mint keeps one spend's witness with every input: it is asked about once */
      for (const o of outs) if (o.rest && !bySecret.has(o.proof.secret) && !more.some(m => m.secret === o.proof.secret)) more.push(o.proof); }
    layer = more; }
  const lock = lockOf(proofs[0] && proofs[0].secret), keys = lock && !lock.bad ? lock.main : [], byY = new Map(trace.map(x => [yOf(x.proof.secret), x])), counted = new Set(), paid = {}, loose = {}, txs = [];
  let released = 0, fees = 0, refunds = false, carry = 0;
  for (const x of trace) { x.left = amt(x.proof.amount); x.how = x.state === 'UNSPENT' ? 'locked' : x.state === 'PENDING' ? 'pending' : x.state === 'SPENT' ? '' : 'nostate'; }
  const sigsOf = wit => (Array.isArray(wit.signatures) ? wit.signatures : []).filter(g => typeof g === 'string').map(sigClean).slice(0, 32);
  // the releases: signed by Streetcat and by every partner paid, on this very transaction
  for (const x of trace) { if (x.state !== 'SPENT' || x.how || !x.witness || !keys.length) continue; const wit = witOf(x); if (!wit || !Array.isArray(wit.inputs) || !Array.isArray(wit.outputs)) continue;
    const outs = opened.get(x.proof.secret) || [], ins = wit.inputs.slice(0, 2000).map(y => byY.get(lc(y)));
    if (!ins.length || ins[0] !== x || ins.some(i => !i || i.state !== 'SPENT' || i.how) || new Set(ins).size !== ins.length || !outs.length || outs.length !== wit.outputs.length) continue;
    const text = ins.map(i => i.proof.secret + i.proof.C).join('') + outs.map(o => String(o.amount) + o.B_).join(''), sigs = sigsOf(wit), signers = keys.filter(k => sigs.some(g => verify(g, text, k)));
    if (!signers.includes(keys[0]) || signers.length < lock.n || !outs.every(o => o.rest || (!!o.to && o.to !== keys[0] && signers.includes(o.to)))) continue;
    const tx = { first: yOf(x.proof.secret), inputs: ins.map(i => yOf(i.proof.secret)), paid: {}, rest: 0, fee: 0 }; let inSum = 0, outSum = 0;
    for (const i of ins) { i.how = 'released'; inSum += amt(i.proof.amount); }
    for (const o of outs) { counted.add(o.proof.secret); outSum += o.amount; if (o.rest) tx.rest += o.amount; else { tx.paid[o.to] = (tx.paid[o.to] || 0) + o.amount; paid[o.to] = (paid[o.to] || 0) + o.amount; released += o.amount; } }
    tx.fee = inSum - outSum; fees += tx.fee; txs.push(tx);
    let back = tx.rest; for (let k = ins.length - 1; k >= 0 && back > 0; k--) { const cut = Math.min(back, ins[k].left); ins[k].left -= cut; back -= cut; } }  /* what went back is taken off the last inputs: the one that was split */
  // every other spend: what it put back under the lock stays locked; the rest of it left, and not as a release
  const takeBack = (x, n) => { n += carry; const cut = Math.min(n, x.left); x.left -= cut; carry = n - cut; };  /* more put back than one proof held: off the next ones */
  for (const x of trace) { if (x.state !== 'SPENT' || x.how) continue; const wit = x.witness ? witOf(x) : null, outs = (wit && opened.get(x.proof.secret)) || [], fresh = outs.filter(o => !counted.has(o.proof.secret)); let back = 0, gave = false;
    for (const o of fresh) { counted.add(o.proof.secret); if (o.rest) back += o.amount; else if (o.to && keys.slice(1).includes(o.to)) { loose[o.to] = (loose[o.to] || 0) + o.amount; gave = true; } }
    takeBack(x, back); if (!wit || (outs.length && !fresh.length)) continue;  /* no witness, or a copy of one counted before: it went as the donation's others did (below) */
    x.how = gave ? 'unproven' : sigsOf(wit).length ? 'refunded' : ''; if (x.how === 'refunded') refunds = true; }
  const some = trace.some(x => x.how === 'unproven');
  for (const x of trace) if (x.state === 'SPENT' && !x.how) { takeBack(x, 0); x.how = refunds ? 'refunded' : some ? 'unproven' : 'unknown'; }
  const sumOfHow = (...h) => trace.filter(x => h.includes(x.how)).reduce((a, x) => a + x.left, 0), total = onceEach(proofs).reduce((a, p) => a + amt(p.amount), 0);
  return { trace, txs, total, locked: sumOfHow('locked'), pending: sumOfHow('pending', 'nostate'), released, paid, fees, refunds, refunded: sumOfHow('refunded'), unproven: sumOfHow('unproven'), loose, unknown: sumOfHow('unknown') }; }

// ---------- today's lock, signed whole: SIG_ALL (15 Nov) ----------
// Under today's lock as it was (SIG_INPUTS), the partner's signature covers a proof's secret and nothing else. The scans by parts of
// 14–15 Nov found what came of it (2.2 and 2.12, critical, both tried here at a local mint): a mint signs any number of proofs with one
// secret, so whoever knows a donation's secret (the public ledger shows it) can have a 1-sat proof made with it, and the partner's
// signature on that proof, checked and confirmed for 1 sat, spends the 1 024-sat one; and nothing the partner signs says where the money
// goes, so what leaves the lock from a proof paid in part is up to Streetcat's app. Every donation made from now on is locked the same
// way with one tag more, ["sigflag","SIG_ALL"] (NUT-11): a signature covers the whole transaction, every input's secret and C and every
// output's amount and B_. A signature made over one proof spends no other, and the partner signs exactly what leaves the lock and what
// goes back under it. Any mint that knows NUT-11 enforces it; the keys, the deadline and the donor's refund are as before. Donations
// made before keep their lock, and a request of theirs is held to a bound (requestProblems).
// Each donation is one transaction (a SIG_ALL spend takes one lock; each donation has its own refund key): the proofs that pay
// (planRelease: whole ones, the one split last), and as outputs first the payment, plain ecash for Streetcat's app, which pays the
// partner as before, then the rest of the split proof back under the same lock, in the outputs worked out from that proof
// (remainderPart: its donor still finds them with the token alone). The payment's outputs come from Streetcat's key and a seed in the
// request: the partner is shown their amounts and blinded messages, which is what it signs, and nobody but Streetcat can open them;
// its app works them out again from its key and the request, so an answer lost once the mint paid loses nothing.
const PAYW = 'streetcat/release-pay/v1';
const isWhole = l => !!l && l.sigflag === 'SIG_ALL' && !l.dest;  /* today's lock signed whole (a `dest` lock is SIG_ALL too, and has its own reader) */
const contribWhole = k => { const ps = k && Array.isArray(k.proofs) ? k.proofs : []; return ps.length > 0 && ps.every(p => isWhole(lockOf(String(p && p.secret)))); };
const wholeIn = q => !!q && !(q.campaign && q.campaign.lock === 'dest') && Array.isArray(q.contributions) && q.contributions.some(contribWhole);
// one output of a payment: its secret, blinding factor and blinded message, from Streetcat's key, the seed and its place
async function wholePart(sk, seed, i){ if (!SK.test(String(sk || '')) || !SEED.test(String(seed || ''))) throw new Error('this is not the payment of a release');
  const base = concat(unhex(lc(sk)), unhex(seed), new Uint8Array([i >> 8, i & 255]));
  const secret = hex(await sha256(concat(enc.encode(PAYW + '/secret\n'), base))); let r = big(await sha256(concat(enc.encode(PAYW + '/r\n'), base))) % N; if (r === 0n) r = 1n;
  return { secret, r, B_: cashu.blindMessage(enc.encode(secret), r).B_.toHex(true) }; }
// The transaction, from what a request says of it: the proofs it spends, in their order (the split one last), the keyset of its
// outputs, the payment's amounts and blinded messages (`pay`, `payB`) and the rest's amounts (`rest`: its outputs are worked out from
// the last proof). Whoever has these builds the same transaction: the partner's app the one it signs, Streetcat's the one it sends.
async function wholeBuild({ inputs, id, pay, payB, rest = [] }){ const ins = (Array.isArray(inputs) ? inputs : []).map(slim);
  if (!ins.length || typeof id !== 'string' || !id || !wholes(pay) || !pay.length || !Array.isArray(payB) || payB.length !== pay.length || !payB.every(b => /^0[23][0-9a-f]{64}$/.test(String(b)) && pointOk(b)) || !wholes(rest)) throw new Error('this is not a release signed whole');
  const outputs = pay.map((a, i) => ({ amount: a, id, B_: payB[i] })), rests = [];
  for (let j = 0; j < rest.length; j++) { const x = await remainderPart(ins[ins.length - 1], j); rests.push({ secret: x.secret, r: x.r.toString(16).padStart(64, '0') }); outputs.push({ amount: rest[j], id, B_: x.B_ }); }
  return { inputs: ins, outputs, rests, pay: sumOf(pay), rest: sumOf(rest), fee: ins.reduce((t, x) => t + x.amount, 0) - sumOf(pay) - sumOf(rest) }; }
const reqWhole = (q, k) => { const t = (k && k.tx) || {}; return wholeBuild({ inputs: k && k.proofs, id: t.id, pay: t.pay, payB: t.payB, rest: t.rest || [] }); };
// What a request says of one donation (makeRequest): `proofs` are the ones that pay (planRelease), `pay` what the donation gives up
// (the mint's input fee comes out of it, as it always has), `sk` Streetcat's key. All the request carries of it: `spec`.
async function wholeTx({ proofs, pay, sk, keysetId, denoms, fee = 0, seed = newSeed() }){ pay = Number(pay);
  const plan = planRelease(proofs, pay); if (plan.inputs.length !== proofs.length) throw new Error('more proofs than this payment needs');
  if (!Number.isInteger(fee) || fee < 0 || pay - fee < 1) throw new Error('nothing would be left to pay after the mint\'s fee');
  const amounts = piecesOf(pay - fee, denoms), payB = []; for (let i = 0; i < amounts.length; i++) payB.push((await wholePart(sk, seed, i)).B_);
  const spec = { id: String(keysetId), pay: amounts, payB, rest: plan.remainder ? piecesOf(plan.remainder, denoms) : [], seed };
  return { ...await wholeBuild({ inputs: plan.inputs, ...spec }), spec }; }
// What the partner's app checks before it signs such a transaction, and Streetcat's before it asks for it: its proofs are this
// campaign's, signed whole and under one lock; what goes back is the rest of the last one, in no more outputs than its donor's app
// looks for (findRemainders); and it pays `pay` sat, no more and no less. `c`: the campaign.
function wholeProblems(tx, c, { pay }){ const p = [], ins = tx && Array.isArray(tx.inputs) ? tx.inputs : [], outs = tx && Array.isArray(tx.outputs) ? tx.outputs : [];
  if (!ins.length || !outs.length) return ['it spends nothing']; const shape = lockShape(ins[0].secret), last = ins[ins.length - 1], n = (tx.rests || []).length;
  for (const x of ins) { const l = lockOf(x.secret), bad = lockProblem(l, c); if (bad) p.push('a proof is not this campaign\'s: ' + bad); else if (!isWhole(l)) p.push('a proof is not signed whole'); else if (lockShape(x.secret) !== shape) p.push('its proofs are not under one lock'); }
  if (new Set(outs.map(o => o.B_)).size !== outs.length) p.push('two of its outputs are one');
  if (n && (tx.rest >= amt(last.amount) || n > remainderSlots(last.amount))) p.push('what goes back under the lock is more than the proof it comes from');
  if (!p.length && tx.pay !== Number(pay)) p.push(`it pays ${tx.pay} sat, not ${pay}`);
  if (!p.length && tx.fee < 0) p.push('it gives out more than it spends');
  return [...new Set(p)]; }
// THE WITNESS OF SUCH A SPEND. The mint reads the signatures of the first input's witness and nothing else. Whoever reads the mint
// afterwards (the status page, a donor's app) has the donation's proofs and needs the signed text to check who signed, so the witness
// gives it back: the inputs in their order (`i`: 16 hex digits of each one's Y, after its 02 or 03), the payment's outputs as the text
// writes them (`o`: amount and B_ together) and the rest's amounts (`r`: its outputs are worked out from the last input). Every other
// input's witness names the first (`t`: its 16 digits), so that the mint's own record says which spend took each proof, and a text
// that claims a proof another spend took is not read (a donor's refund made to claim a release's proof, tried in wholelock_test).
// A mint keeps at most 1 024 characters of witness per input (Nutshell's default; one more is refused), so what does not fit in the
// first one goes on in the next inputs' witnesses, in the order of `i`: `i` and `o` only, as JSON (a mint refuses one that is not).
// A refund writes all its outputs in `o`. null: it does not fit.
// `plain` (16 Nov, found with real sats at Minibits): a mint that is not Nutshell reads a witness strictly. cdk-mintd refuses the whole
// swap when an input's witness has no `signatures` ("data did not match any variant of untagged enum Witness"), and keeps of one
// only what NUT-11 names. So there the spend goes as NUT-11 writes it: the signatures on the first input and no witness on the
// others. The mint's record then cannot give the signed text back; who signed is read another way (the ledger's record of the spend).
const WIT_MAX = 1024, y16 = secret => xOnly(yOf(secret)).slice(0, 16);
function wholeWitnesses(tx, sigs, plain){ if (plain) return [JSON.stringify({ signatures: sigs }), ...tx.inputs.slice(1).map(() => null)];
  const n = tx.inputs.length, nr = (tx.rests || []).length, R = tx.outputs.slice(tx.outputs.length - nr).map(o => amt(o.amount)), first = y16(tx.inputs[0].secret);
  const items = [...tx.inputs.map(x => ['i', y16(x.secret)]), ...tx.outputs.slice(0, tx.outputs.length - nr).map(o => ['o', String(amt(o.amount)) + o.B_])], out = []; let at = 0;
  for (let k = 0; k < n; k++) { const w = k ? { t: first } : { signatures: sigs, ...(R.length ? { r: R } : {}) };
    for (; at < items.length; at++) { const [key, v] = items[at]; (w[key] = w[key] || []).push(v); if (JSON.stringify(w).length > WIT_MAX) { w[key].pop(); if (!w[key].length) delete w[key]; break; } }
    if (JSON.stringify(w).length > WIT_MAX) return null; out.push(JSON.stringify(w)); }
  return at < items.length ? null : out; }
// WHO SIGNED A SPEND of a donation signed whole, from the mint's record (NUT-07). `trace`: the donation's proofs as traceDonation
// gives them, the rest of each followed (proof, state, witness). A spend is RELEASED when its witness gives back the very text the
// mint checked and both keys of the lock signed it; REFUNDED when its refund key did. Anything else is neither, and is said as it is
// (not proven): a spend made by another wallet, whose witness holds the signatures alone, cannot be read back. Each proof's own
// witness says which spend took it (the first input's text, or `t`); NOTHING IS COUNTED TWICE: an input two of them claim all the same
// is neither's. Y → 'released' | 'refunded'.
// THE TEXT OF A SPEND, KEPT BESIDE IT (17 Nov). A mint that is not Nutshell keeps of a witness the signatures alone (wholeWitnesses,
// `plain`), so its record cannot give the signed text back. Streetcat's ledger carries it with the part it paid: `i`, `o` and `r` as
// a witness would (wholeText). It is only a text: the signatures are still the mint's record's, and they are over this text or they
// are not, so a ledger that writes another one proves nothing. `texts`: such records, for the spends whose witness has no text.
const TEXT_I = /^[0-9a-f]{16}$/, TEXT_O = /^[1-9][0-9]{0,15}0[23][0-9a-f]{64}$/;
function wholeText(tx){ const nr = (tx.rests || []).length; return { i: tx.inputs.map(x => y16(x.secret)), o: tx.outputs.slice(0, tx.outputs.length - nr).map(o => String(amt(o.amount)) + o.B_), r: tx.outputs.slice(tx.outputs.length - nr).map(o => amt(o.amount)) }; }
// a text as it comes from a file anyone can write: its lists as they must be, or null
function textOk(t){ const list = (a, re) => Array.isArray(a) && a.length <= 2000 && a.every(v => typeof v === 'string' && re.test(v)); if (!t || typeof t !== 'object' || !list(t.i, TEXT_I) || !t.i.length || !list(t.o == null ? [] : t.o, TEXT_O)) return null;
  const r = t.r == null ? [] : t.r; if (!Array.isArray(r) || r.length > 64 || !r.every(n => Number.isSafeInteger(n) && n > 0)) return null; return { i: t.i.slice(), o: (t.o || []).slice(), r: r.slice() }; }
async function wholeSpends(trace, texts = []){ const spent = (trace || []).filter(x => x && x.proof && x.state === 'SPENT'), by16 = new Map(), twice = new Set(), txs = [];
  const told = new Map(); for (const t of Array.isArray(texts) ? texts.slice(0, 5000) : []) { const k = textOk(t); if (k && !told.has(k.i[0])) told.set(k.i[0], k); }
  for (const x of spent) { const k = y16(x.proof.secret); if (by16.has(k)) twice.add(k); else by16.set(k, x); }
  const wit = x => { try { const j = JSON.parse(witnessClean(x.witness || '')); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch (_) { return null; } };
  const list = (a, re) => a == null ? [] : Array.isArray(a) && a.length <= 2000 && a.every(v => typeof v === 'string' && re.test(v)) ? a : null, I16 = /^[0-9a-f]{16}$/, O = /^[1-9][0-9]{0,15}0[23][0-9a-f]{64}$/;
  for (const x of spent) { const w0 = wit(x), l = lockOf(x.proof.secret); if (!w0 || !Array.isArray(w0.signatures) || !isWhole(l) || l.bad) continue;
    /* the witness gives no text (a mint that keeps the signatures alone): the one kept beside this spend, if any, is tried in its place */
    const kept = w0.i == null && w0.o == null && w0.r == null ? told.get(y16(x.proof.secret)) : null;
    let ins = kept ? kept.i : list(w0.i, I16), outs = kept ? kept.o : list(w0.o, O); const R = kept ? kept.r : w0.r == null ? [] : w0.r;
    if (!ins || !outs || !ins.length || ins[0] !== y16(x.proof.secret) || twice.has(ins[0]) || !wholes(R)) continue; ins = ins.slice(); outs = outs.slice();
    const tx = [x]; let ok = true;
    for (let k = 1; k < ins.length && ok && k < 2000; k++) { const e = by16.get(ins[k]); if (!e || twice.has(ins[k]) || tx.includes(e) || lockShape(e.proof.secret) !== lockShape(x.proof.secret)) { ok = false; break; }
      tx.push(e); if (kept) { if (e.witness && wit(e) && Object.keys(wit(e)).some(f => f !== 'signatures')) { ok = false; break; } continue; }  /* told beside it: the other inputs carry no witness of their own */
      const wk = e.witness ? wit(e) : null, mi = wk && list(wk.i, I16), mo = wk && list(wk.o, O);
      if (!wk || wk.t !== ins[0] || wk.signatures !== undefined || !mi || !mo) { ok = false; break; } ins.push(...mi); outs.push(...mo); }  /* its own witness names this spend's first input, or it was not this spend's */
    if (!ok || tx.length !== ins.length || (!outs.length && !R.length)) continue;
    let text = tx.map(e => e.proof.secret + e.proof.C).join('') + outs.join('');
    try { for (let j = 0; j < R.length; j++) text += String(R[j]) + (await remainderPart(tx[tx.length - 1].proof, j)).B_; } catch (_) { continue; }
    const sigs = w0.signatures.filter(g => typeof g === 'string').slice(0, 32), by = k => sigs.some(g => verify(g, text, k));
    const how = l.main.filter(by).length >= l.n ? 'released' : l.refund.filter(by).length >= Math.max(1, l.nRefund) ? 'refunded' : '';
    if (how) txs.push({ how, ins: tx }); }
  const claims = new Map(); for (const t of txs) for (const e of t.ins) claims.set(e, (claims.get(e) || 0) + 1);
  const out = new Map(); for (const t of txs) if (t.ins.every(e => claims.get(e) === 1)) for (const e of t.ins) out.set(yOf(e.proof.secret), t.how);
  return out; }
// Streetcat's side of one donation's transaction: built from the request as the partner built it, with the openings of its payment
// worked out again from Streetcat's key and checked against what the request says (that key's payment, or it is not sent), then the rest's
async function wholeOwn(q, k, sk){ const t = (k && k.tx) || {}, tx = await reqWhole(q, k), open = [];
  for (let i = 0; i < t.pay.length; i++) { const x = await wholePart(sk, t.seed, i); if (x.B_ !== tx.outputs[i].B_) throw new Error('this request\'s payment was not worked out from this Streetcat key'); open.push({ secret: x.secret, r: x.r.toString(16).padStart(64, '0') }); }
  return { ...tx, open: [...open, ...tx.rests] }; }
// The swap: both signatures on the first input with what the text is (wholeWitnesses), and the mint's signatures opened into proofs
// with what Streetcat holds (`open`): the payment's plain, the rest's under the lock. What comes back, part by part as destSwap gives it.
// A lost answer is asked about with destFind (the mint's signatures by the outputs, NUT-09) and destWhole, as for `dest`.
async function wholeSwap(w, tx, witnesses){ if (!Array.isArray(witnesses) || witnesses.length !== tx.inputs.length || !witnesses[0]) throw new Error('no witness for this transaction');
  const res = await w.mint.swap({ inputs: tx.inputs.map((x, i) => ({ id: x.id, amount: amt(x.amount), secret: x.secret, C: x.C, ...(witnesses[i] ? { witness: witnesses[i] } : {}) })), outputs: tx.outputs.map(o => ({ amount: amt(o.amount), id: o.id, B_: o.B_ })) });
  if (!res || !Array.isArray(res.signatures) || res.signatures.length !== tx.outputs.length) throw new Error('the mint did not answer with a signature for every output');
  const lock = lockShape(tx.inputs[0].secret); return destParts(w, tx.outputs.map((o, i) => ({ secret: tx.open[i].secret, r: BigInt('0x' + tx.open[i].r), B_: o.B_, sig: res.signatures[i], lock }))); }
// Was it this very transaction that spent these inputs? The mint keeps each input's witness as it was sent (NUT-07): the first one's
// must be this transaction's word for word but for its signatures, which must include `keys`' over this very text; the others' word
// for word. True, false, or it throws (no answer).
async function wholeMine(w, tx, keys){ const st = await w.checkProofsStates(tx.inputs); if (st.length !== tx.inputs.length || !st.every(x => x.state === 'SPENT')) return false;
  const strip = s => { try { const j = JSON.parse(witnessClean(s || '')); if (!j || typeof j !== 'object' || Array.isArray(j)) return null; const { signatures, ...o } = j; return { o: canon(o), sigs: Array.isArray(signatures) ? signatures : [] }; } catch (_) { return null; } };
  /* the signatures say it: they are over this transaction's whole text, its inputs and its outputs, so `keys`' signatures in the mint's
     record are this spend's and no other's. What else the record keeps of the witness is the mint's business (cdk-mintd keeps the
     signatures alone), and is no longer compared word for word (16 Nov) */
  const a = strip(st[0].witness); if (!a) return false;
  const text = destMessage(tx); return keys.every(k => a.sigs.some(g => typeof g === 'string' && verify(g, text, k))); }
// A donor's refund of a donation signed whole, after its deadline: its proofs (all under its lock) and the outputs it gives them
// (OutputData: plain ecash for the donor), signed whole with the refund key, with a witness that gives the text back (every output in
// `o`) so that the status page can show it was taken back; when that does not fit, the signature alone, which is all the mint needs.
function wholeRefundWitnesses(proofs, outs, sk, plain){ const tx = { inputs: proofs.map(slim), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })), rests: [] };
  const sig = cashu.schnorrSignMessage(destMessage(tx), sk); return (!plain && wholeWitnesses(tx, [sig])) || [JSON.stringify({ signatures: [sig] }), ...proofs.slice(1).map(() => null)]; }

// ---------- the published ledger, version 2 ----------
// Each donation by its code: amount, date, what each part paid for, and the tokens of whatever was put back. The clinic's signed
// declarations go with it, so anyone can check them. Version 1 readers keep working: "donations" lists every locked token.
async function ledgerEntry({ token, proofs, date, parts = [], remainders = [] }){ const ys = proofs.map(p => yOf(p.secret));
  return { ref: await donRef(ys), amount: proofs.reduce((s, p) => s + amt(p.amount), 0), date: String(date || '').slice(0, 10), token, parts: parts.map(x => ({ request: x.request, patient: x.patient, procedure: x.procedure, date: x.date, amount: Number(x.amount), ...(textOk(x.tx) ? { tx: textOk(x.tx) } : {}) })), remainders }; }
function ledgerV2({ campaign, clinicKeySource = '', entries = [], certificates = [], published = new Date().toISOString() }){ const c = campaignOf(campaign);
  return { v: 2, campaign: { ...c, ...(campaign.hue != null ? { hue: campaign.hue } : {}), ...(campaign.to ? { to: campaign.to } : {}), ...(campaign.sig ? { sig: campaign.sig } : {}) }, clinicKeySource, published, donations: entries.flatMap(e => [e.token, ...(e.remainders || [])]), entries, certificates: certificates.map(x => ({ statement: x.statement, sig: x.sig })) }; }
// a declaration from a ledger: is it signed with the campaign's clinic statement key?
const certificateOk = async (c, x) => { if (!x || !x.statement || x.statement.type !== 'streetcat/clinic-certificate') return false; const k = campaignOf(c), by = k.lock === 'dest' ? lc(x.statement.clinic) : k.clinic;  /* a campaign with a list of partners: the one that declares it, one of the list */
  return payeesOf(k).includes(by) && canon(x.statement.campaign) === canon(campShort(k)) && verify(x.sig, STMT + canon(x.statement), await derivedPub(TAG.statement, by)); };

// ---------- handed over in person ----------
// A volunteer's acknowledgment: signed with the statement key derived from the volunteer's own key (never Streetcat's release key).
// It says that this volunteer received these proofs; it is not a certification and moves nothing.
const ACK = 'streetcat/handover-receipt/v1\n';
async function handoverReceipt(campaign, proofs, volunteerSk, received = new Date().toISOString()){ const c = campaignOf(campaign), ys = proofs.map(p => yOf(p.secret)).sort();
  const body = { type: 'streetcat/handover-receipt', v: 1, note: 'Not a certification', campaign: campShort(c), donation: await donRef(ys), amount: proofs.reduce((s, p) => s + amt(p.amount), 0), proofs: ys, received, volunteer: pubOf(volunteerSk) };
  return { t: 'streetcat.handover-receipt', v: 1, body, sig: cashu.schnorrSignMessage(ACK + canon(body), await derivedSk(TAG.statement, volunteerSk)) }; }
const handoverReceiptOk = async a => !!a && !!a.body && PUB.test(a.body.volunteer || '') && verify(a.sig, ACK + canon(a.body), await derivedPub(TAG.statement, a.body.volunteer));

// ---------- the cat's record: clinic → Streetcat ----------
// What the clinic writes about a cat it operated, with the cat still asleep: its name, colony, microchip, sex, coat and ear tip, the
// procedure and its date, notes, and up to four photos (face, both sides, the nose up close). Signed like the clinic's declarations,
// with its statement key, over "streetcat/cat-record/v1", a newline and the canonical JSON. The photos travel next to the record, which
// names each one by its SHA-256: once it is signed, no photo can be swapped. A record made from a request names it and its campaign,
// which ties the cat to the clinic's certificate. Nothing in it is public: it goes encrypted to Streetcat.
const CAT_SIG = 'streetcat/cat-record/v1\n', CAT_SLOTS = ['face', 'left', 'right', 'nose'], CAT_SEX = ['female', 'male'], CAT_EAR = ['left', 'right', 'none'];
const CAT_LEN = { name: 40, colony: 60, coat: 80, procedure: 80, notes: 300 }, CHIP = /^\d{15}$/, CATID = /^CAT-[0-9A-F]{10}$/, SHA = /^[0-9a-f]{64}$/;
const CAT_PHOTO_MAX = 60000;  // bytes: the app makes its photos smaller (about 38 kB), this is what a record may name
// A photo goes to a relay in parts of at most this many base64 characters: a gift wrap of one is about 55 kB, under the 64 kB that
// many relays take (measured on nostr-tools 2.25: a part of 28 000 characters is still 55 kB, one of 28 400 is 66 kB)
const CAT_CHUNK = 26000;
const newCatId = () => 'CAT-' + hex(root.crypto.getRandomValues(new Uint8Array(5))).toUpperCase();
const oneLine = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// what a statement must hold to be a record (a received one is only text anyone could write): [] when it does
function catProblems(st){ if (!st || typeof st !== 'object' || st.type !== 'streetcat/cat-record') return ['this is not a cat record']; if (st.v !== 1) return [`it was made by another version of the app (format ${st.v})`];
  const p = []; if (!CATID.test(String(st.id))) p.push('it has no valid record number');
  if (typeof st.name !== 'string' || !st.name.trim()) p.push('the cat has no name'); if (typeof st.procedure !== 'string' || !st.procedure.trim() || !DAY.test(String(st.date || ''))) p.push('the procedure or its date is missing');
  for (const [k, n] of Object.entries(CAT_LEN)) if (st[k] != null && (typeof st[k] !== 'string' || st[k].length > n)) p.push(`its ${k} is longer than ${n} characters`);
  if (st.chip != null && !CHIP.test(String(st.chip))) p.push('its microchip number is not 15 digits'); if (st.sex != null && !CAT_SEX.includes(st.sex)) p.push('its sex is not female or male'); if (st.ear != null && !CAT_EAR.includes(st.ear)) p.push('its ear tip is not left, right or none');
  if (!Array.isArray(st.photos) || st.photos.length > CAT_SLOTS.length) p.push('its list of photos is not valid');
  else { const seen = new Set(); for (const x of st.photos) { if (!x || !CAT_SLOTS.includes(x.slot) || seen.has(x.slot) || !SHA.test(String(x.sha256)) || !Number.isInteger(x.bytes) || x.bytes < 1 || x.bytes > CAT_PHOTO_MAX) { p.push('a photo in it is not listed right'); break; } seen.add(x.slot); } }
  if (!PUB.test(String(st.clinic || ''))) p.push('it names no clinic key'); if (st.request != null && !/^R-[0-9A-F]{10}$/.test(String(st.request))) p.push('its request number is not valid');
  if (st.campaign != null) { try { if (canon(campShort(campaignOf(st.campaign))) !== canon(st.campaign)) p.push('its campaign is not written as the app writes it'); } catch (_) { p.push('its campaign is incomplete'); } }
  if (Number.isNaN(Date.parse(String(st.signed || '')))) p.push('it has no time of signing');
  return p; }
// the statement the clinic signs, from what its form holds; photos: [{ slot, sha256, bytes, w, h }]
function catStatement(f, { id = newCatId(), clinic, signed = new Date().toISOString(), request, campaign } = {}){
  const st = { type: 'streetcat/cat-record', v: 1, id, name: oneLine(f.name, CAT_LEN.name), procedure: oneLine(f.procedure, CAT_LEN.procedure), date: String(f.date || ''), clinic: lc(clinic), signed,
    photos: (f.photos || []).map(x => ({ slot: x.slot, sha256: lc(x.sha256), bytes: Number(x.bytes), ...(x.w && x.h ? { w: Number(x.w), h: Number(x.h) } : {}) })) };
  for (const k of ['colony', 'coat', 'notes']) { const v = oneLine(f[k], CAT_LEN[k]); if (v) st[k] = v; }
  const chip = String(f.chip || '').replace(/[\s.-]/g, ''); if (chip) st.chip = chip; if (f.sex) st.sex = f.sex; if (f.ear) st.ear = f.ear;
  if (request) st.request = request; if (campaign) st.campaign = campShort(campaignOf(campaign)); return st; }
async function signCat(f, clinicSk, o = {}){ if (!SK.test(clinicSk || '')) throw new Error('not a private key'); const st = catStatement(f, { ...o, clinic: pubOf(clinicSk) }), bad = catProblems(st);
  if (bad.length) throw new Error(bad.join('; '));
  return { t: 'streetcat.cat', v: 1, id: st.id, statement: st, sig: cashu.schnorrSignMessage(CAT_SIG + canon(st), await derivedSk(TAG.statement, lc(clinicSk))), from: st.clinic }; }
// a record as it arrives: is it one, and is it signed with the statement key of the clinic key it names? Whose key that is (the clinic
// of which campaign) is for the page that shows it to say.
async function catCheck(rec){ if (!rec || rec.t !== 'streetcat.cat' || rec.v !== 1 || !rec.statement) return { ok: false, problems: ['this is not a cat record'], text: '✗ this is not a cat record' };
  const st = rec.statement, p = catProblems(st); if (rec.id !== st.id) p.push('its number is not the one it was signed with');
  const signed = PUB.test(String(st.clinic || '')) && /^[0-9a-f]{128}$/i.test(String(rec.sig || '')) && verify(String(rec.sig), CAT_SIG + canon(st), await derivedPub(TAG.statement, lc(st.clinic)));
  if (!signed) p.unshift('it is not signed with the clinic key it names');
  return { ok: !p.length, problems: p, text: p.length ? '✗ ' + p.join('; ') : `✓ signed with clinic key ${lc(st.clinic).slice(0, 10)}…` }; }
// a photo, base64, as the messages that carry it: { id, kind: 'face.0', slot, sha256, part, of, data, from }. `kind` keeps the parts
// apart when relay.js drops what it has already seen.
function catPhotoParts(id, slot, sha256, b64, from){ const n = Math.max(1, Math.ceil(b64.length / CAT_CHUNK));
  return Array.from({ length: n }, (_, i) => ({ t: 'streetcat.cat-photo', v: 1, id, kind: slot + '.' + i, slot, sha256: lc(sha256), part: i, of: n, data: b64.slice(i * CAT_CHUNK, (i + 1) * CAT_CHUNK), from: lc(from) })); }
const catPartOk = p => !!p && p.t === 'streetcat.cat-photo' && p.v === 1 && CATID.test(String(p.id)) && CAT_SLOTS.includes(p.slot) && SHA.test(String(p.sha256))
  && Number.isInteger(p.of) && p.of >= 1 && p.of <= Math.ceil(CAT_PHOTO_MAX * 4 / 3 / CAT_CHUNK) && Number.isInteger(p.part) && p.part >= 0 && p.part < p.of && p.kind === p.slot + '.' + p.part
  && typeof p.data === 'string' && p.data.length > 0 && p.data.length <= CAT_CHUNK && /^[A-Za-z0-9+/]*={0,2}$/.test(p.data);
// a request's photo in parts, as a record's: from Streetcat's key to the clinic's, which each part names (a part may come before its
// request: the clinic keeps it all the same, and the photo is whole only when its SHA-256 is right)
function reqPhotoParts(id, slot, sha256, b64, from, clinic){ const n = Math.max(1, Math.ceil(b64.length / CAT_CHUNK));
  return Array.from({ length: n }, (_, i) => ({ t: 'streetcat.request-photo', v: 1, id, kind: slot + '.' + i, slot, sha256: lc(sha256), part: i, of: n, data: b64.slice(i * CAT_CHUNK, (i + 1) * CAT_CHUNK), from: lc(from), clinic: lc(clinic) })); }
// The partner's photos when it confirms: one or two, the delivery note (or the receipt) and the goods (or the work done), made small on
// its phone, named in its signed declaration by SHA-256 (so they cannot be swapped afterwards), and sent to Streetcat apart, by relay in
// parts, as a request's are. A clinic confirms as before: the invoice's fingerprint only, the file staying on its phone.
const ANS_SLOTS = ['note', 'goods'];
const ansPhotos = ps => (ps || []).map(x => ({ slot: x && x.slot, sha256: lc(x && x.sha256), bytes: x && x.bytes, w: x && x.w, h: x && x.h }));
const ansPhotosOk = ps => Array.isArray(ps) && ps.length >= 1 && ps.length <= ANS_SLOTS.length && new Set(ps.map(x => x && x.slot)).size === ps.length
  && ps.every(x => x && ANS_SLOTS.includes(x.slot) && SHA.test(String(x.sha256)) && Number.isInteger(x.bytes) && x.bytes >= 1 && x.bytes <= CAT_PHOTO_MAX && Number.isInteger(x.w) && Number.isInteger(x.h));
function ansPhotoParts(id, slot, sha256, b64, from, to){ const n = Math.max(1, Math.ceil(b64.length / CAT_CHUNK));
  return Array.from({ length: n }, (_, i) => ({ t: 'streetcat.answer-photo', v: 1, id, kind: slot + '.' + i, slot, sha256: lc(sha256), part: i, of: n, data: b64.slice(i * CAT_CHUNK, (i + 1) * CAT_CHUNK), from: lc(from), to: lc(to) })); }
const ansPartOk = p => !!p && p.t === 'streetcat.answer-photo' && p.v === 1 && /^R-[0-9A-F]{10}$/.test(String(p.id)) && ANS_SLOTS.includes(p.slot) && SHA.test(String(p.sha256))
  && Number.isInteger(p.of) && p.of >= 1 && p.of <= Math.ceil(CAT_PHOTO_MAX * 4 / 3 / CAT_CHUNK) && Number.isInteger(p.part) && p.part >= 0 && p.part < p.of && p.kind === p.slot + '.' + p.part
  && typeof p.data === 'string' && p.data.length > 0 && p.data.length <= CAT_CHUNK && /^[A-Za-z0-9+/]*={0,2}$/.test(p.data) && /^0[23][0-9a-f]{64}$/.test(String(p.from)) && /^0[23][0-9a-f]{64}$/.test(String(p.to));
const reqPartOk = p => !!p && p.t === 'streetcat.request-photo' && p.v === 1 && /^R-[0-9A-F]{10}$/.test(String(p.id)) && REQ_SLOTS.includes(p.slot) && SHA.test(String(p.sha256))
  && Number.isInteger(p.of) && p.of >= 1 && p.of <= Math.ceil(CAT_PHOTO_MAX * 4 / 3 / CAT_CHUNK) && Number.isInteger(p.part) && p.part >= 0 && p.part < p.of && p.kind === p.slot + '.' + p.part
  && typeof p.data === 'string' && p.data.length > 0 && p.data.length <= CAT_CHUNK && /^[A-Za-z0-9+/]*={0,2}$/.test(p.data) && /^0[23][0-9a-f]{64}$/.test(String(p.from)) && /^0[23][0-9a-f]{64}$/.test(String(p.clinic));

// ---------- the donor's private recovery receipt, version 1 ----------
// A picture the app draws (what it shows may be seen: the campaign, the amount, the code, when the refund opens, the refund key's
// public fingerprint) carrying the data in a PNG tEXt chunk: the locked token and the refund key, which are never drawn. `check` is the
// first 16 hex digits of the SHA-256 of the canonical JSON without it: it catches a damaged or edited file, it authenticates nothing.
// The refund key can be sealed with a password (PBKDF2-SHA256 and AES-GCM, as the clinic's key backup). Off by default: a forgotten
// password silently destroys the donor's only way back. Receipts made before (JSON: campaign, lockedToken, refundKey, created) still open.
const RECEIPT = 'streetcat.recovery-receipt', KDF_ITER = 310000;
const b64 = { enc: u => btoa(String.fromCharCode(...u)), dec: s => Uint8Array.from(atob(String(s)), ch => ch.charCodeAt(0)) };
const receiptCheck = async r => { const { check, ...rest } = r; return (await sha256hex(canon(rest))).slice(0, 16); };
const pwKey = async (pw, salt, iterations, use) => root.crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, await root.crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, false, [use]);
async function sealKey(sk, pw){ const salt = root.crypto.getRandomValues(new Uint8Array(16)), iv = root.crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await root.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await pwKey(pw, salt, KDF_ITER, 'encrypt'), unhex(sk)));
  return { kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITER, salt: b64.enc(salt) }, cipher: { name: 'AES-GCM', iv: b64.enc(iv) }, data: b64.enc(data) }; }
async function openSealed(s, pw){ const rounds = Number(s && s.kdf && s.kdf.iterations); if (!(rounds >= 100000 && rounds <= 5000000)) throw new Error('this is not a key sealed by this app');  /* audit of 10 Nov: the count came from the file with no limits (1 was taken, a thousand million froze the page) */
  let k; try { k = hex(new Uint8Array(await root.crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(s.cipher.iv) }, await pwKey(pw, b64.dec(s.kdf.salt), Number(s.kdf.iterations), 'decrypt'), b64.dec(s.data)))); } catch (_) { k = ''; }
  if (!SK.test(k)) throw new Error('wrong password, or the receipt is damaged'); return k; }
async function makeReceipt({ campaign, token, proofs, refundSk, created = new Date().toISOString(), password = '' }){  /* a signed campaign keeps its signature */
  const r = { format: RECEIPT, version: 1, created, campaign: campaign.sig ? { ...campSigned(campaign), sig: String(campaign.sig) } : { ...campaignOf(campaign), ...(campaign.hue != null ? { hue: Number(campaign.hue) } : {}) },
    donation: { ref: await donRef(proofs.map(p => yOf(p.secret))), amount: proofs.reduce((s, p) => s + amt(p.amount), 0), keyset: [...new Set(proofs.map(p => p.id))].join(','), token },
    refund: password ? { pub: pubOf(refundSk), sealed: await sealKey(lc(refundSk), password) } : { key: lc(refundSk), pub: pubOf(refundSk) } };
  r.check = await receiptCheck(r); return r; }
// PNG chunks: read them, and add a tEXt chunk (a keyword, a zero byte, the text) right after IHDR. The text is ASCII here.
const PNG = [137, 80, 78, 71, 13, 10, 26, 10], isPng = b => !!b && b.length > 33 && PNG.every((x, i) => b[i] === x);
let CRC = null; const crc32 = b => { if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u32 = n => new Uint8Array([n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255]);
function pngChunks(b){ const out = []; for (let i = 8; i + 12 <= b.length;) { const n = (b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0, type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    out.push({ type, data: b.subarray(i + 8, i + 8 + n), end: i + 12 + n }); i += 12 + n; if (type === 'IEND') break; } return out; }
const asciiJson = o => JSON.stringify(o).replace(/[\u007f-￿]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
function pngWithText(b, keyword, text){ if (!isPng(b)) throw new Error('not a PNG'); if (/[^\x20-\x7e]/.test(keyword + text)) throw new Error('a tEXt chunk here carries ASCII only');
  const type = enc.encode('tEXt'), body = concat(enc.encode(keyword), new Uint8Array([0]), enc.encode(text)), ihdr = pngChunks(b)[0];
  return concat(b.subarray(0, ihdr.end), u32(body.length), type, body, u32(crc32(concat(type, body))), b.subarray(ihdr.end)); }
const pngTexts = b => isPng(b) ? pngChunks(b).filter(c => c.type === 'tEXt').map(c => { const z = c.data.indexOf(0); return { keyword: dec.decode(c.data.subarray(0, z)), text: dec.decode(c.data.subarray(z + 1)) }; }) : [];
const receiptPng = (png, r) => pngWithText(png, RECEIPT, asciiJson(r));
// what a file or a pasted text holds: { kind: 'v1' | 'old' | 'none', receipt, problems, why }. A receipt is checked as far as it can
// be without the mint: its format, its check, that its token is locked to its refund key, and that the key (when not sealed) is that key.
async function readReceipt(input){ let text = '';
  if (input instanceof Uint8Array) { if (isPng(input)) { const t = pngTexts(input).find(x => x.keyword === RECEIPT); if (!t) return { kind: 'none', why: 'this picture holds no receipt: a screenshot or a photo of the receipt does not carry it, only the file the app saved does' }; text = t.text; } else text = dec.decode(input); }
  else text = String(input || ''); text = text.trim(); let j = null; try { j = JSON.parse(text); } catch (_) {}
  if (!j || typeof j !== 'object') return { kind: 'none', why: 'this is not a receipt' };
  if (j.format === RECEIPT) { if (j.version !== 1) return { kind: 'none', why: `this receipt was made by a newer version of the app (version ${j.version})` };
    const p = [], d = j.donation || {}, f = j.refund || {}; if (j.check !== await receiptCheck(j)) p.push('its check does not match: the file is damaged or was edited');
    if (!PUB.test(f.pub || '')) p.push('it names no refund key'); else if (f.key != null && (!SK.test(f.key) || pubOf(f.key) !== lc(f.pub))) p.push('its refund key is not the key it names');
    let proofs = []; try { proofs = cashu.getTokenMetadata(String(d.token || '')).incompleteProofs; } catch (_) { p.push('its token cannot be read'); }  /* the secrets, without the mint's keysets */
    if (proofs.length && PUB.test(f.pub || '') && proofs.some(x => !((lockOf(x.secret) || {}).refund || []).includes(lc(f.pub)))) p.push('its token is not locked to its refund key');
    return { kind: 'v1', receipt: j, sealed: !!f.sealed, problems: p }; }
  if (typeof j.lockedToken === 'string' && j.campaign) { const k = SK.test(j.refundKey || '') ? lc(j.refundKey) : null;
    return { kind: 'old', receipt: { format: RECEIPT, version: 0, created: j.created || '', campaign: j.campaign, donation: { token: j.lockedToken }, refund: k ? { key: k, pub: pubOf(k) } : {} }, sealed: false, problems: k ? [] : ['it holds no refund key'] }; }
  return { kind: 'none', why: 'this is not a receipt' }; }

// ---------- refunds to a Lightning address (LUD-16, LNURL-pay) ----------
// user@domain → https://domain/.well-known/lnurlp/user (plain http only for a local test server), then its callback for an invoice
const lnAddressUrl = a => { const m = /^([a-z0-9._+-]+)@([a-z0-9.-]+\.[a-z]{2,}|localhost|127\.0\.0\.1)(:\d{1,5})?$/i.exec(String(a || '').trim()); if (!m) return null; const local = /^(localhost|127\.0\.0\.1)$/i.test(m[2]);
  return (local ? 'http://' : 'https://') + m[2].toLowerCase() + (m[3] || '') + '/.well-known/lnurlp/' + m[1].toLowerCase(); };
// A call that ends: a server that never answers must not leave a button busy for ever (audit of 10 Nov).
const fetchT = (u, o = {}, ms = 15000) => { if (root.AbortSignal && root.AbortSignal.timeout) return root.fetch(u, { ...o, signal: root.AbortSignal.timeout(ms) });
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return root.fetch(u, { ...o, signal: c.signal }).finally(() => clearTimeout(t)); };
async function lnAddressInvoice(address, sat, { fetch: f = fetchT } = {}){ const url = lnAddressUrl(address); if (!url) throw new Error('this is not a Lightning address (name@domain)');
  const get = async u => { let r; try { r = await f(u, { headers: { accept: 'application/json' } }); } catch (_) { throw new Error(`${address} cannot be reached from this browser`); } let j = null; try { j = await r.json(); } catch (_) {}
    if (!r.ok || !j) throw new Error(`${address} answered HTTP ${r.status}`); if (j.status === 'ERROR') throw new Error(`${address} says: ${j.reason || 'error'}`); return j; };
  const p = await get(url); if (p.tag !== 'payRequest' || typeof p.callback !== 'string') throw new Error(`${address} is not a Lightning address that takes payments`);
  const msat = Math.floor(sat) * 1000, min = Number(p.minSendable || 0), max = Number(p.maxSendable || 0);
  if (max && msat > max) throw Object.assign(new Error(`${address} takes at most ${Math.floor(max / 1000)} sat`), { max: Math.floor(max / 1000) }); if (msat < min) throw Object.assign(new Error(`${address} takes at least ${Math.ceil(min / 1000)} sat`), { min: Math.ceil(min / 1000) });
  const cb = new URL(p.callback); cb.searchParams.set('amount', String(msat)); const inv = await get(cb.href); if (typeof inv.pr !== 'string' || !/^ln/i.test(inv.pr)) throw new Error(`${address} gave no invoice`);
  const read = invoiceExpiry(inv.pr); if (read && (read.msat == null || read.msat > msat)) throw new Error(`${address} gave an invoice for more than was asked`);  /* read here, not taken on trust; one for less is paid, and the rest comes back as change */
  return { invoice: inv.pr, min: Math.ceil(min / 1000), max: Math.floor(max / 1000), domain: new URL(url).host }; }

// DEADLINES (plan step 1). A request asks the partner to do the work on a day; its donations can be
// taken back by their donors from their lock's refund date (its locktime, read from each proof: never a name or a date on the page).
// The sats are needed until the work is done, confirmed by the partner and released by Streetcat: the end of the work's day, plus the
// partner's days to confirm, plus a margin. Days are Madrid days, whatever the phone's zone: a day with no hour ends at the end of that
// day there (the latest case), and days are added on the calendar there, never as 24 hours (the hour changes in March and October).
const TZ = 'Europe/Madrid', DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CONFIRM_DAYS = { clinic: 1, shop: 1, other: 2 }, MARGIN_DAYS = 2;  /* the partner's kind decides its default; both can be changed */
let TZF = null; const tzParts = t => (TZF = TZF || new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }))
  .formatToParts(new Date(t * 1000)).reduce((o, x) => (o[x.type] = x.value, o), {});
const madridOffset = t => { const p = tzParts(t); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000 - t; };  // seconds east of UTC
const dayOk = day => { const m = DAY_RE.exec(String(day || '')); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };
const addDays = (day, n) => { const m = DAY_RE.exec(day); return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10); };
function madridStart(day){ if (!dayOk(day)) return NaN; const m = DAY_RE.exec(day), local = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000;  /* its first second */
  return local - madridOffset(local - madridOffset(local)); }  /* midnight is never inside an hour change (they are at 2 and 3 am) */
const madridEnd = day => dayOk(day) ? madridStart(addDays(day, 1)) - 1 : NaN;  /* its last second: 23, 24 or 25 hours after its first */
const madridDay = t => { const p = tzParts(t); return `${p.year}-${p.month}-${p.day}`; };
const days = (v, d) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 60 ? n : d; };
// the level of a request's donations against its dates: 'ok' (refunds open after the required date), 'soon' (after the work, before the
// required date: the partner must confirm quickly), 'before' (before the work is done), 'past' (open already). `proofs`: the proofs it
// takes ({ secret, amount, ref? }); a proof with no refund date in its lock (not a donation's) is counted apart.
function timing({ day, confirmDays, marginDays, proofs = [], now = Math.floor(Date.now() / 1000) } = {}){
  if (!dayOk(day)) throw new Error('no date for the work'); const cd = days(confirmDays, 1), md = days(marginDays, MARGIN_DAYS), work = madridEnd(day), required = madridEnd(addDays(day, cd + md));
  const amounts = { past: 0, before: 0, soon: 0, ok: 0 }, refs = { past: [], before: [], soon: [], ok: [] }; let earliest = null, nolock = 0;
  for (const x of proofs) { const l = lockOf(x && x.secret), lt = l && l.locktime; if (!lt) { nolock++; continue; } if (earliest == null || lt < earliest) earliest = lt;
    const lv = lt <= now ? 'past' : lt <= work ? 'before' : lt <= required ? 'soon' : 'ok'; amounts[lv] += amt(x.amount); if (x.ref && !refs[lv].includes(x.ref)) refs[lv].push(x.ref); }
  const level = ['past', 'before', 'soon', 'ok'].find(k => amounts[k] > 0) || 'ok';
  return { level, day, work, required, earliest, confirmDays: cd, marginDays: md, amounts, refs, nolock }; }
// a Lightning invoice's own expiry (BOLT 11): its timestamp plus its x field (an hour when it has none), read on the phone. The checksum
// is checked, so a damaged invoice gives null, never a wrong time.
const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bech32Ok(hrp, words){ const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let chk = 1;
  const step = v => { const b = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ v; for (let i = 0; i < 5; i++) if ((b >>> i) & 1) chk ^= G[i]; };
  for (const c of hrp) step(c.charCodeAt(0) >>> 5); step(0); for (const c of hrp) step(c.charCodeAt(0) & 31); for (const w of words) step(w); return chk === 1; }
function invoiceExpiry(invoice){ const s = String(invoice || '').trim().toLowerCase().replace(/^lightning:/, ''), i = s.lastIndexOf('1'); if (!/^ln/.test(s) || i < 3) return null;
  const words = []; for (const ch of s.slice(i + 1)) { const v = B32.indexOf(ch); if (v < 0) return null; words.push(v); }
  if (words.length < 7 + 104 + 6 || !bech32Ok(s.slice(0, i), words)) return null; const data = words.slice(0, -6), num = ws => ws.reduce((n, w) => n * 32 + w, 0);
  const at = num(data.slice(0, 7)); let x = 3600; for (let j = 7; j + 3 <= data.length - 104;) { const type = data[j], len = data[j + 1] * 32 + data[j + 2]; if (type === 6) x = num(data.slice(j + 3, j + 3 + len)); j += 3 + len; }
  return { at, expiry: x, expires: at + x, msat: invoiceMsat(s.slice(0, i)) }; }
// what an invoice asks for, from its first part (lnbc210n…): millisats, or null when it names no amount or is not read
function invoiceMsat(hrp){ const m = /^ln(?:bcrt|bc|tbs|tb|sb)(?:(\d{1,15})([munp])?)?$/.exec(hrp); if (!m || !m[1]) return null;
  const n = BigInt(m[1]), v = m[2] === 'm' ? n * 100000000n : m[2] === 'u' ? n * 100000n : m[2] === 'n' ? n * 100n : m[2] === 'p' ? (n % 10n ? null : n / 10n) : n * 100000000000n;
  return v == null || v > 9007199254740991n ? null : Number(v); }

root.scCore = { TAG, canon, yOf, amt, pubOf, pointOk, sameKey, sha256hex, derivedPub, derivedSk, donRef, lockOf, lockProblem, campaignOf, TYPES, PKINDS,
  DEST, payeesOf, destMint, destSecret, destLockProblem, destTx, destBuild, destProblems, destMessage, destSign, destSigned, destSwap, destFind, destWhole, destProven, destOutputs, destTrace, lockShape, askedOf, reqTx, requestSplit,
  TZ, CONFIRM_DAYS, MARGIN_DAYS, madridStart, madridEnd, madridDay, addDays, dayOk, timing, invoiceExpiry, fetchT,
  makeRequest, signRequest, requestSig, requestProblems, amountProblems, requestAmount, statementOf, certify, report, checkAnswer, clinicSigsByY, clinicSigsOf, withSig, REASONS,
  isWhole, contribWhole, wholeIn, wholePart, wholeBuild, reqWhole, wholeTx, wholeProblems, wholeWitnesses, wholeSpends, wholeText, textOk, wholeOwn, wholeSwap, wholeMine, wholeRefundWitnesses, WIT_MAX,
  pack, unpack, linkFor, remainderPart, remainderSlots, donationSplit, planRelease, remainderOutputs, findRemainder, findRemainders, traceDonation,
  ledgerEntry, ledgerV2, certificateOk, handoverReceipt, handoverReceiptOk, witnessClean, campSigned, signCampaign, campaignSig, campaignId, evidenceOk, EVIDENCE, receivedByOk, receivedOk, RECV_MAX,
  CAT_SLOTS, CAT_CHUNK, CAT_PHOTO_MAX, REQ_SLOTS, reqPhotoParts, reqPartOk, ANS_SLOTS, ansPhotosOk, ansPhotoParts, ansPartOk, newCatId, catProblems, catStatement, signCat, catCheck, catPhotoParts, catPartOk,
  STREETCAT_KEYS, published, RECEIPT, makeReceipt, receiptCheck, receiptPng, readReceipt, sealKey, openSealed, isPng, pngTexts, pngWithText, crc32, lnAddressUrl, lnAddressInvoice };
})(typeof window !== 'undefined' ? window : globalThis);
