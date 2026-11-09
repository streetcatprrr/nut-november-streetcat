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
const P2PK_TAGS = ['sigflag', 'n_sigs', 'pubkeys', 'locktime', 'refund', 'n_sigs_refund'], WHOLE = /^(0|[1-9][0-9]{0,14})$/;
const xOnly = k => lc(k).slice(2), sameKey = (a, b) => !!a && !!b && xOnly(a) === xOnly(b);
function lockOf(secret){ let s; try { s = JSON.parse(secret); } catch (_) { return null; }
  if (!Array.isArray(s) || s[0] !== 'P2PK' || !s[1] || typeof s[1] !== 'object' || typeof s[1].data !== 'string') return null;
  const d = s[1], t = {}, why = [], tags = d.tags == null ? [] : d.tags;
  if (!Array.isArray(tags)) why.push('its tags are not a list');
  else for (const x of tags) { if (!Array.isArray(x) || !x.length || !x.every(v => typeof v === 'string')) { why.push('a tag is not a list of texts'); continue; }
    if (Object.prototype.hasOwnProperty.call(t, x[0])) why.push(`the tag ${x[0]} is given twice`); else t[x[0]] = x.slice(1); }
  const whole = (k, dflt) => { const v = t[k]; if (v === undefined) return dflt; if (v.length !== 1 || !WHOLE.test(v[0])) { why.push(`its ${k} is not a whole number`); return NaN; } return Number(v[0]); };
  const keys = (list, what) => { if (list.some(k => !pointOk(k))) why.push(`${what} is not a public key`); return list.map(lc); };
  const main = keys([d.data, ...(t.pubkeys || [])], 'a signing key'), refund = keys(t.refund || [], 'a refund key');
  if (new Set(main.map(xOnly)).size !== main.length) why.push('one signing key is given twice');
  if (new Set(refund.map(xOnly)).size !== refund.length) why.push('one refund key is given twice');
  const n = whole('n_sigs', 1), nRefund = whole('n_sigs_refund', 1), locktime = whole('locktime', 0);
  const sigflag = t.sigflag === undefined ? 'SIG_INPUTS' : t.sigflag.length === 1 ? t.sigflag[0] : '';
  return { main, n, refund, nRefund, locktime, sigflag, unknown: Object.keys(t).filter(k => !P2PK_TAGS.includes(k)), bad: why[0] || '' }; }
// what a campaign promises: Streetcat and the clinic sign together; one refund key, the donor's, opens after the deadline
function lockProblem(l, c){ if (!l) return 'not a P2PK lock'; if (l.bad) return l.bad;
  const want = [c.streetcat, c.clinic].map(xOnly).sort();
  if (l.main.map(xOnly).sort().join() !== want.join()) return 'locked to other keys than Streetcat + the clinic'; if (l.n !== 2) return `needs ${l.n} signature(s), not 2`;
  if (l.locktime !== Number(c.deadline)) return 'its deadline is not the campaign deadline'; if (!l.refund.length) return 'no refund key: anyone could take it after the deadline';
  if (l.refund.length !== 1) return 'more than one refund key: only the donor may take it back';
  if (want.includes(xOnly(l.refund[0]))) return 'its refund key is Streetcat\'s or the partner\'s: only the donor may take it back';
  if (l.nRefund !== 1) return 'unusual refund rule'; if (l.sigflag !== 'SIG_INPUTS') return 'unusual signature rule';
  if (l.unknown.length) return `a tag this app does not know (${l.unknown[0]})`; return ''; }
const CAMP = ['name', 'op', 'mint', 'streetcat', 'clinic', 'deadline'];
// What a campaign (a pot) pays for, the colony it is for, and its partner: who confirms the spending, by name and by what it is (StreetCat,
// 7 Nov: «las peticiones pueden ser de muchos tipos… comida… una operación veterinaria… esterilización»; «la comida tendría que confirmar…
// la tienda que vende el pienso»). The partner's key is the campaign's "clinic" key, as before: a clinic, a shop, or another. All four are
// optional and kept only when valid; the campaign's signature covers them, so a campaign made before is the same campaign, and checks
// as it did. Neither the campaign's id nor the partner's certificate name them.
const TYPES = ['sterilisation', 'vet', 'food', 'other'], PKINDS = ['clinic', 'shop', 'other'];
const word = (v, n = 60) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
function campaignOf(c){ if (!c || typeof c !== 'object') throw new Error('no campaign'); const o = {}; for (const k of CAMP) if (c[k] != null && c[k] !== '') o[k] = c[k];
  o.name = String(o.name || '').trim(); if (o.op != null) o.op = String(o.op); o.mint = String(o.mint || '').trim().replace(/\/+$/, ''); o.deadline = Number(o.deadline); o.streetcat = lc(o.streetcat); o.clinic = lc(o.clinic);
  if (!o.name || !o.mint || !pointOk(o.streetcat) || !pointOk(o.clinic) || !Number.isInteger(o.deadline)) throw new Error('the campaign is incomplete');
  if (sameKey(o.streetcat, o.clinic)) throw new Error('the partner key is Streetcat\'s own key: the partner signs with its own');  /* one signer twice (A06) */
  if (TYPES.includes(c.type)) o.type = c.type; if (PKINDS.includes(c.pkind)) o.pkind = c.pkind; if (word(c.colony)) o.colony = word(c.colony); if (word(c.partner)) o.partner = word(c.partner);
  return o; }
const campShort = c => ({ name: c.name, mint: c.mint, streetcat: c.streetcat, clinic: c.clinic, deadline: c.deadline });
// Streetcat's published key: a donation link and a ledger must name it (both pages check). Confirmed by StreetCat on 5 Nov (it is also in
// campaigns/tnr2.json). Another key, if there is ever one, is added in this one line.
const STREETCAT_KEYS = ['0294637dacb6799343eacb4654700ad781694838b8b6db80551d17af001b194121'];
const published = k => !STREETCAT_KEYS.length || STREETCAT_KEYS.includes(lc(k));
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

// ---------- the request: Streetcat → clinic ----------
// One procedure, and what of each donation pays for it: all of it, or a part (a split donation). Only the proofs that pay are sent; of
// each, what signing needs (its secret, amount and keyset) and what shows its amount is real: the mint's signature C and its DLEQ proof
// (NUT-12, with r). The clinic's signature covers only the secret (NUT-11 SIG_INPUTS) and the mint pays out what the proof is really
// worth, so an amount the request merely says could be a lie (review of 9 Nov, A04: a 1 024-sat proof said to be 64): the clinic's app
// checks every amount against the mint's keys (amountProblems) before it can sign, and a request without that proof is refused.
// Streetcat keeps the full tokens.
const newId = () => 'R-' + hex(root.crypto.getRandomValues(new Uint8Array(5))).toUpperCase();
const slim = p => ({ id: String(p.id), amount: amt(p.amount), secret: String(p.secret), C: String(p.C || ''), ...(p.dleq ? { dleq: { e: String(p.dleq.e || ''), s: String(p.dleq.s || ''), r: String(p.dleq.r || '') } } : {}) });
const SCALAR = /^[0-9a-f]{1,64}$/i, CPOINT = /^0[23][0-9a-f]{64}$/i;
const amountCheckable = p => !!p && CPOINT.test(String(p.C || '')) && !!p.dleq && typeof p.dleq === 'object' && ['e', 's', 'r'].every(k => SCALAR.test(String(p.dleq[k] || '')));
// the clinic's check that every proof is worth what the request says: the mint's DLEQ proof for the key of that amount. `keysets`: the
// campaign mint's keys by keyset id (fetched by the app, or kept for offline). A proof the mint did not sign for that amount is named
// apart from one whose keys are not on this phone (to be checked again); either way the request cannot be confirmed.
function amountProblems(q, keysets){ const p = []; let W = 0, N = 0, X = 0;
  for (const k of (q && q.contributions) || []) { const ps = Array.isArray(k.proofs) ? k.proofs : []; let wrong = 0, nokeys = 0, nocheck = 0;
    for (const x of ps) { if (!amountCheckable(x)) { nocheck++; continue; } const ks = keysets && keysets[x.id]; if (!ks || !ks.keys) { nokeys++; continue; }
      let ok = false; try { ok = cashu.hasValidDleq({ id: String(x.id), amount: amt(x.amount), secret: String(x.secret), C: x.C, dleq: x.dleq }, ks); } catch (_) {}  /* an amount with no key in the keyset throws: not worth it */
      if (!ok) wrong++; }
    if (nocheck) p.push(NOCHECK(k));
    if (wrong) p.push(`${k.ref || 'a donation'}: ${wrong === 1 ? 'an amount is' : wrong + ' amounts are'} false. Report a problem.`);  /* short, in red (StreetCat, 9 Nov, 15:10): the mint's signature does not match the amount */
    if (nokeys) p.push(`${k.ref || 'a donation'}: amounts not checked yet (no connection?)`);  /* the mint's keys are not on this phone: checked again */
    W += wrong; N += nokeys; X += nocheck; }
  return Object.assign(p, { wrong: W, unchecked: N, uncheckable: X }); }  /* the counts: a lie (wrong), keys missing for now (unchecked), no way to check (uncheckable) */
const NOCHECK = k => `${k.ref || 'a donation'}: amounts can't be checked. Report a problem.`;  /* a proof carries no DLEQ proof (an older app's request, or changed): reported, Streetcat asks again */
// The cat as Streetcat caught it (StreetCat, 6 Nov: «para ver que realmente se está certificando el gato que es»): up to three photos, face
// and sides, made small on its phone, named here by SHA-256; the photos themselves travel apart (by relay in parts, or in a file), so the
// clinic can check it is this cat. Optional: a request without photos is as before, and an older app ignores them.
const REQ_SLOTS = ['face', 'left', 'right'];
const reqPhotosOk = ps => Array.isArray(ps) && ps.length >= 1 && ps.length <= REQ_SLOTS.length && new Set(ps.map(x => x && x.slot)).size === ps.length
  && ps.every(x => x && REQ_SLOTS.includes(x.slot) && SHA.test(String(x.sha256)) && Number.isInteger(x.bytes) && x.bytes >= 1 && x.bytes <= CAT_PHOTO_MAX && Number.isInteger(x.w) && Number.isInteger(x.h));
async function makeRequest({ campaign, patient, procedure, date, note = '', contributions, photos = [], id = newId(), created = new Date().toISOString() }){
  const c = campaignOf(campaign); if (!String(patient || '').trim() || !String(procedure || '').trim() || !DAY.test(String(date || ''))) throw new Error('a request needs the cat, the procedure and the date');
  const ph = (photos || []).map(x => ({ slot: x.slot, sha256: lc(x.sha256), bytes: x.bytes, w: x.w, h: x.h })); if (ph.length && !reqPhotosOk(ph)) throw new Error('the photos of the cat are not valid');
  if (!Array.isArray(contributions) || !contributions.length) throw new Error('a request needs at least one donation');
  const out = [], seen = new Set();
  for (const k of contributions) { const proofs = (k.proofs || []).map(slim); if (!proofs.length) throw new Error('a donation without proofs');
    for (const p of proofs) { const bad = lockProblem(lockOf(p.secret), c); if (bad) throw new Error(`a donation is not this campaign's: ${bad}`); const y = yOf(p.secret); if (seen.has(y)) throw new Error('the same proof twice'); seen.add(y);
      if (!amountCheckable(p)) throw new Error('a donation\'s proof carries no DLEQ proof from the mint, so the partner could not check its amount: it cannot be asked for'); }
    const total = proofs.reduce((s, p) => s + p.amount, 0), release = k.release == null ? total : Number(k.release);
    if (!Number.isInteger(release) || release < 1 || release > total) throw new Error(`proofs of ${total} sat cannot pay ${k.release} sat`);
    out.push({ ref: k.ref || await donRef(proofs.map(p => yOf(p.secret))), release, proofs }); }
  return { t: 'streetcat.request', v: 1, id, campaign: c, patient: String(patient).trim(), procedure: String(procedure).trim(), date: String(date), ...(note ? { note: String(note) } : {}), ...(ph.length ? { photos: ph } : {}), contributions: out, created }; }
// what a clinic's app checks before it shows a request (it is just text anyone could write)
function requestProblems(q){ if (!q || q.t !== 'streetcat.request') return ['this is not a Streetcat request']; if (q.v !== 1) return [`it was made by another version of the app (format ${q.v})`];
  let c; try { c = campaignOf(q.campaign); } catch (e) { return [e.message]; } const p = [];
  if (!/^R-[0-9A-F]{10}$/.test(String(q.id))) p.push('it has no valid request number');
  if (!String(q.patient || '').trim() || !String(q.procedure || '').trim() || !DAY.test(String(q.date || ''))) p.push('the cat, the procedure or the date is missing');
  if (!Array.isArray(q.contributions) || !q.contributions.length) p.push('it names no donation');
  if (q.photos !== undefined && !reqPhotosOk(q.photos)) p.push('its photos of the cat are not valid');
  const seen = new Set();
  for (const k of q.contributions || []) { const ps = Array.isArray(k.proofs) ? k.proofs : []; if (!ps.length) { p.push(`${k.ref || 'a donation'} has no proofs`); continue; }
    const bad = [...new Set(ps.map(x => lockProblem(lockOf(x.secret), c)).filter(Boolean))]; if (bad.length) p.push(`${k.ref || 'a donation'}: ${bad.join('; ')}`);
    for (const x of ps) { let y = ''; try { y = yOf(x.secret); } catch (_) {} if (!y || seen.has(y)) p.push(`${k.ref || 'a donation'}: a proof listed twice`); seen.add(y); }
    if (ps.some(x => !amountCheckable(x))) p.push(NOCHECK(k));
    const total = ps.reduce((s, x) => s + amt(x.amount), 0); if (!Number.isInteger(k.release) || k.release < 1 || k.release > total) p.push(`${k.ref || 'a donation'}: it cannot pay ${k.release} sat out of ${total}`); }
  return [...new Set(p)]; }
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
const statementOf = (q, signed, evidence, photos) => ({ type: 'streetcat/clinic-certificate', v: 1, campaign: campShort(campaignOf(q.campaign)), request: q.id, patient: q.patient, procedure: q.procedure, date: q.date,
  contributions: q.contributions.map(k => ({ ref: k.ref, release: Number(k.release), proofs: k.proofs.map(p => yOf(p.secret)) })), amount: requestAmount(q), clinic: lc(q.campaign.clinic), signed, ...(evidence ? { evidence: { sha256: evidence.sha256, kind: evidence.kind } } : {}), ...(photos && photos.length ? { photos: ansPhotos(photos) } : {}) });
async function certify(q, clinicSk, signed = new Date().toISOString(), evidence = null, photos = null){ const bad = requestProblems(q); if (bad.length) throw new Error('not a valid request: ' + bad.join('; '));
  if (pubOf(clinicSk) !== lc(q.campaign.clinic)) throw new Error(`this key is not ${q.campaign.name}'s clinic key`); if (evidence && !evidenceOk(evidence)) throw new Error('the file\'s fingerprint is not a SHA-256 of an invoice or a photo');
  if (photos && photos.length && !ansPhotosOk(ansPhotos(photos))) throw new Error('the photos of the delivery are not valid');
  const statement = statementOf(q, signed, evidence, photos), sig = cashu.schnorrSignMessage(STMT + canon(statement), await derivedSk(TAG.statement, clinicSk));
  const sigs = q.contributions.flatMap(k => k.proofs.map(p => cashu.schnorrSignMessage(p.secret, clinicSk)));  // NUT-11 signs the proof's secret
  return { t: 'streetcat.answer', v: 1, id: q.id, kind: 'certified', statement, sig, sigs }; }
async function report(q, clinicSk, reason, note = '', signed = new Date().toISOString()){ if (pubOf(clinicSk) !== lc(q.campaign.clinic)) throw new Error(`this key is not ${q.campaign.name}'s clinic key`);
  if (!REASONS.includes(reason)) throw new Error('reason: ' + REASONS.join(', '));
  const statement = { type: 'streetcat/clinic-report', v: 1, campaign: campShort(campaignOf(q.campaign)), request: q.id, reason, note: String(note || '').slice(0, 500), clinic: lc(q.campaign.clinic), signed };
  return { t: 'streetcat.answer', v: 1, id: q.id, kind: 'report', statement, sig: cashu.schnorrSignMessage(REPORT + canon(statement), await derivedSk(TAG.statement, clinicSk)) }; }
// Streetcat's check of an answer to its own request q: "certified" only when every proof carries a valid signature from the campaign's
// clinic key AND the declaration is signed with the clinic's statement key and names exactly this request and these proofs
async function checkAnswer(q, a){ const v = { ok: false, kind: a && a.kind, proofs: 0, signed: 0, other: 0, statement: 'missing', text: '' };
  if (!a || a.t !== 'streetcat.answer' || a.v !== 1 || a.id !== q.id) { v.text = '✗ this is not the answer to this request'; return v; }
  const c = campaignOf(q.campaign), spk = await derivedPub(TAG.statement, c.clinic), st = a.statement, who = !c.pkind || c.pkind === 'clinic' ? 'clinic' : 'partner';  /* a shop or another partner: its key is the partner's */
  if (a.kind === 'report') { const good = !!st && st.type === 'streetcat/clinic-report' && st.request === q.id && lc(st.clinic) === c.clinic && canon(st.campaign) === canon(campShort(c)) && verify(a.sig, REPORT + canon(st), spk);
    v.statement = good ? 'ok' : 'badsig'; v.ok = good; v.text = good ? `the ${who} reports a problem (${st.reason})${st.note ? ': ' + st.note : ''}` : `✗ a report that is not signed with ${c.name}'s ${who} key`; return v; }
  if (a.kind !== 'certified') { v.text = '✗ an answer of an unknown kind'; return v; }
  const want = statementOf(q, st && st.signed, st && evidenceOk(st.evidence) ? st.evidence : null, st && ansPhotosOk(st.photos) ? st.photos : null),  /* its photos too: named, signed */ signedBy = !!st && verify(a.sig, STMT + canon(st), spk), same = !!st && canon(st) === canon(want);
  v.statement = !st ? 'missing' : !signedBy ? (lc(st.clinic) !== c.clinic ? 'otherkey' : 'badsig') : !same ? 'mismatch' : 'ok';
  const proofs = q.contributions.flatMap(k => k.proofs); v.proofs = proofs.length;
  proofs.forEach((p, i) => { const s = (a.sigs || [])[i]; if (!s) return; if (verify(s, p.secret, c.clinic)) v.signed++; else v.other++; });
  v.ok = v.proofs > 0 && v.signed === v.proofs && v.statement === 'ok';
  v.text = v.ok ? `✓ certified: all ${v.proofs} proof${v.proofs === 1 ? '' : 's'} signed with ${c.name}'s ${who} key, and its declaration names exactly them`
    : v.signed && v.signed < v.proofs ? `✗ Partly signed (${v.signed} of ${v.proofs}) — not certified`
    : v.other && !v.signed ? `✗ Signed with a key that is not ${c.name}'s ${who} key — not certified`
    : v.statement !== 'ok' ? `✗ its declaration ${({ missing: 'is missing', badsig: `is not signed with ${c.name}'s ${who} key`, otherkey: `names another ${who} key`, mismatch: 'does not match this request' })[v.statement]} — not certified` : '✗ not certified';
  return v; }
// the clinic's signatures by proof (Y), to put into the full proofs Streetcat kept (their witness), next to Streetcat's own
const clinicSigsByY = (q, a) => { const m = new Map(); let i = 0; for (const k of q.contributions) for (const p of k.proofs) m.set(yOf(p.secret), a.sigs[i++]); return m; };
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
// Trust: the clinic's NUT-11 signatures (SIG_INPUTS) do not bind the outputs, so it is Streetcat's app that puts the rest back; anyone
// can check afterwards that it did, because the rest must be at the mint under these derived blinded messages.
const REM = 'streetcat/remainder/v1';
async function remainderPart(proof, i){ const r = proof.dleq && proof.dleq.r; if (!r) throw new Error('this proof carries no DLEQ blinding factor, so a remainder could not be found again: it can only be released whole');
  const base = concat(unhex(String(r).padStart(64, '0')), enc.encode(proof.secret), new Uint8Array([i]));
  const nonce = hex(await sha256(concat(enc.encode(REM + '/nonce\n'), base)));
  let bf = big(await sha256(concat(enc.encode(REM + '/r\n'), base))) % N; if (bf === 0n) bf = 1n;
  const s = JSON.parse(proof.secret); s[1] = { ...s[1], nonce }; const secret = JSON.stringify(s);  // the same lock, a new nonce
  return { secret, r: bf, B_: cashu.blindMessage(enc.encode(secret), bf).B_.toHex(true) }; }
const remainderSlots = amount => { const a = amt(amount); return a > 1 ? Math.ceil(Math.log2(a)) : 0; };  // a rest is smaller than its proof: at most this many pieces
// which proofs pay `amount` out of a donation: whole proofs, largest first, then at most one proof split
// How a donation is cut when it is locked (StreetCat, 8 Nov, review point 3): a release takes whole proofs and splits at most one, and the
// mint does not bind what a split proof's rest becomes (SIG_INPUTS), so the piece that is split is what a changed Rescue client could
// take beyond the amount confirmed. Cut small, that piece is small: no proof holds more than a tenth of the donation (the largest
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
async function traceDonation(w, proofs, depth = 0){ const states = await w.checkProofsStates(proofs), byY = new Map(states.map(s => [lc(s.Y), s])), out = [];
  const spent = proofs.filter(p => (byY.get(yOf(p.secret)) || {}).state === 'SPENT'), rest = spent.length && depth < 8 ? await findRemainders(w, spent) : new Map();
  for (const p of proofs) { const s = byY.get(yOf(p.secret)) || {}, back = rest.get(yOf(p.secret)) || [];
    out.push({ proof: p, state: s.state || 'UNKNOWN', witness: s.witness || null, depth, putBack: back.reduce((a, x) => a + amt(x.amount), 0) });
    if (back.length) out.push(...await traceDonation(w, back, depth + 1)); }
  return out; }

// ---------- the published ledger, version 2 ----------
// Each donation by its code: amount, date, what each part paid for, and the tokens of whatever was put back. The clinic's signed
// declarations go with it, so anyone can check them. Version 1 readers keep working: "donations" lists every locked token.
async function ledgerEntry({ token, proofs, date, parts = [], remainders = [] }){ const ys = proofs.map(p => yOf(p.secret));
  return { ref: await donRef(ys), amount: proofs.reduce((s, p) => s + amt(p.amount), 0), date: String(date || '').slice(0, 10), token, parts: parts.map(x => ({ request: x.request, patient: x.patient, procedure: x.procedure, date: x.date, amount: Number(x.amount) })), remainders }; }
function ledgerV2({ campaign, clinicKeySource = '', entries = [], certificates = [], published = new Date().toISOString() }){ const c = campaignOf(campaign);
  return { v: 2, campaign: { ...c, ...(campaign.hue != null ? { hue: campaign.hue } : {}), ...(campaign.to ? { to: campaign.to } : {}), ...(campaign.sig ? { sig: campaign.sig } : {}) }, clinicKeySource, published, donations: entries.flatMap(e => [e.token, ...(e.remainders || [])]), entries, certificates: certificates.map(x => ({ statement: x.statement, sig: x.sig })) }; }
// a declaration from a ledger: is it signed with the campaign's clinic statement key?
const certificateOk = async (c, x) => !!x && !!x.statement && x.statement.type === 'streetcat/clinic-certificate' && canon(x.statement.campaign) === canon(campShort(campaignOf(c))) && verify(x.sig, STMT + canon(x.statement), await derivedPub(TAG.statement, campaignOf(c).clinic));

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
// The partner's photos when it confirms (StreetCat, 7 Nov: a shop, «fotos del albarán del cuando se recibe el pedido o fotos del pedido»; another
// partner, of what was delivered or done): one or two, the delivery note (or the receipt) and the goods (or the work done), made small on
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
async function openSealed(s, pw){ let k; try { k = hex(new Uint8Array(await root.crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(s.cipher.iv) }, await pwKey(pw, b64.dec(s.kdf.salt), Number(s.kdf.iterations), 'decrypt'), b64.dec(s.data)))); } catch (_) { k = ''; }
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
async function lnAddressInvoice(address, sat, { fetch: f = root.fetch.bind(root) } = {}){ const url = lnAddressUrl(address); if (!url) throw new Error('this is not a Lightning address (name@domain)');
  const get = async u => { let r; try { r = await f(u, { headers: { accept: 'application/json' } }); } catch (_) { throw new Error(`${address} cannot be reached from this browser`); } let j = null; try { j = await r.json(); } catch (_) {}
    if (!r.ok || !j) throw new Error(`${address} answered HTTP ${r.status}`); if (j.status === 'ERROR') throw new Error(`${address} says: ${j.reason || 'error'}`); return j; };
  const p = await get(url); if (p.tag !== 'payRequest' || typeof p.callback !== 'string') throw new Error(`${address} is not a Lightning address that takes payments`);
  const msat = Math.floor(sat) * 1000, min = Number(p.minSendable || 0), max = Number(p.maxSendable || 0);
  if (max && msat > max) throw Object.assign(new Error(`${address} takes at most ${Math.floor(max / 1000)} sat`), { max: Math.floor(max / 1000) }); if (msat < min) throw Object.assign(new Error(`${address} takes at least ${Math.ceil(min / 1000)} sat`), { min: Math.ceil(min / 1000) });
  const cb = new URL(p.callback); cb.searchParams.set('amount', String(msat)); const inv = await get(cb.href); if (typeof inv.pr !== 'string' || !/^ln/i.test(inv.pr)) throw new Error(`${address} gave no invoice`);
  return { invoice: inv.pr, min: Math.ceil(min / 1000), max: Math.floor(max / 1000), domain: new URL(url).host }; }

// DEADLINES (plan step 1, approved by StreetCat on 8 Nov, 22:11). A request asks the partner to do the work on a day; its donations can be
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
  return { at, expiry: x, expires: at + x }; }

root.scCore = { TAG, canon, yOf, amt, pubOf, pointOk, sameKey, sha256hex, derivedPub, derivedSk, donRef, lockOf, lockProblem, campaignOf, TYPES, PKINDS,
  TZ, CONFIRM_DAYS, MARGIN_DAYS, madridStart, madridEnd, madridDay, addDays, dayOk, timing, invoiceExpiry,
  makeRequest, requestProblems, amountProblems, requestAmount, statementOf, certify, report, checkAnswer, clinicSigsByY, withSig, REASONS,
  pack, unpack, linkFor, remainderPart, remainderSlots, donationSplit, planRelease, remainderOutputs, findRemainder, findRemainders, traceDonation,
  ledgerEntry, ledgerV2, certificateOk, handoverReceipt, handoverReceiptOk, campSigned, signCampaign, campaignSig, campaignId, evidenceOk, EVIDENCE,
  CAT_SLOTS, CAT_CHUNK, CAT_PHOTO_MAX, REQ_SLOTS, reqPhotoParts, reqPartOk, ANS_SLOTS, ansPhotosOk, ansPhotoParts, ansPartOk, newCatId, catProblems, catStatement, signCat, catCheck, catPhotoParts, catPartOk,
  STREETCAT_KEYS, published, RECEIPT, makeReceipt, receiptCheck, receiptPng, readReceipt, sealKey, openSealed, isPng, pngTexts, pngWithText, crc32, lnAddressUrl, lnAddressInvoice };
})(typeof window !== 'undefined' ? window : globalThis);
