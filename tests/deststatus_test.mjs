// The status page for a campaign that pays its partners from the lock (`dest`): app/status.html in Chromium, the patched test mint
// (mint/, port 3340), fake money. A campaign with two partners and a deadline half a minute away; four donations. One pays the first
// partner whole; 1 500 sat of another pay the second (the rest back under the lock); after the deadline the donor of that one takes
// back what is left of it, and another donor a whole donation; the fourth is left locked. The page, which holds no key, must say
// from the mint alone: each donation's state and what of it was released, taken back or is still there; how much the mint paid each
// partner, on the donation and under the totals; and take the declaration signed by the partner that was paid (not one signed by a
// key outside the list). A ledger of such a campaign at a mint that does not announce the rule is said in red. Not covered: a mint with fees.
import fs from 'fs';
import { chromium } from 'playwright';
import { pinBrowser, pin } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3340', STOCK = process.env.STOCK || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, amt = C.amt, total = ps => ps.reduce((s, p) => s + amt(p.amount), 0), enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), key = () => { const sk = hex(cashu.createRandomSecretKey()); return { sk, pk: C.pubOf(sk) }; };
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
if (!C.destMint(await (await fetch(MINT + '/v1/info')).json())) { say(`deststatus: needs the patched mint at ${MINT} (see mint/README.md)`); process.exit(1); }
const w = new cashu.Wallet(MINT); await w.loadMint(); const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), denoms = Object.keys(ks.keys).map(Number), now = () => Math.floor(Date.now() / 1000);
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const outOf = (a, s) => { const b = cashu.blindMessage(enc.encode(s)); return new cashu.OutputData({ amount: cashu.Amount.from(a), id: ks.id, B_: b.B_.toHex(true) }, b.r, enc.encode(s)); };
const swapTo = async (inputs, outs) => { const res = await w.mint.swap({ inputs: inputs.map(p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C })), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) }); return outs.map((o, i) => o.toProof(res.signatures[i], ks)); };
const fmt = n => String(n).replace(/\B(?=(\d{3})+$)/g, ' ') + ' sat', tok = ps => cashu.getEncodedToken({ mint: MINT, proofs: ps });

// the ecash first (the test mint pays its invoices in a while), then the campaign and four donations, each under its donor's lock
const coins = []; for (const n of [2100, 300, 64, 128]) coins.push(await plain(n));
const S = key(), P1 = key(), P2 = key(), X = key(), camp = await C.signCampaign({ name: 'LUNA', op: 'sterilisation', mint: MINT, streetcat: S.pk, clinic: P1.pk, partners: [P2.pk], lock: 'dest', deadline: now() + 30 }, S.sk); await pin(S.pk);
const donate = async ps => { const d = key(), lock = { streetcat: S.pk, payees: C.payeesOf(camp), deadline: camp.deadline, refund: d.pk }; return { sk: d.sk, proofs: await swapTo(ps, C.donationSplit(total(ps), denoms).map(a => outOf(a, C.destSecret(lock)))) }; };
const A = await donate(coins[0]), B = await donate(coins[1]), E = await donate(coins[2]), F = await donate(coins[3]), dest = { keysetId: ks.id, denoms, fee: ps => amt(w.getFeesForProofs(ps)) };
// before the deadline: B whole to the first partner, 1 500 sat of A to the second (as the app does: asked, confirmed, signed whole)
const release = async (don, amount, P) => { const plan = C.planRelease(don.proofs, amount), q = await C.makeRequest({ campaign: camp, patient: 'LUNA', procedure: 'sterilisation (spay)', date: '2026-11-10', contributions: [{ ref: await C.donRef(don.proofs.map(p => C.yOf(p.secret))), release: amount, proofs: plan.inputs }], payee: P.pk, dest })  /* by the donation's code, as the app names it */, a = await C.certify(q, P.sk), tx = await C.reqTx(q, q.contributions[0]);
  const parts = await C.destSwap(w, tx, [C.destSign(tx, S.sk), a.sigs[0]]); return { q, a, rest: parts.filter(x => x.rest).map(x => x.proof) }; };
const rB = await release(B, 300, P1), rA = await release(A, 1500, P2), backA = total(A.proofs) - 1500;
check('before the deadline: 300 sat paid to the first partner, 1 500 to the second, and the rest of that donation back under its lock', camp.deadline > now() && total(rA.rest) > 0 && !rB.rest.length, `${total(rA.rest)} sat put back`);
await new Promise(r => setTimeout(r, Math.max(0, camp.deadline - now() + 2) * 1000));
// after it: A's donor takes back what is left of it (the proofs never touched and the rest put back, in one spend), E's donor all of it
const leftA = [...A.proofs.filter(p => !rA.q.contributions[0].proofs.some(x => x.secret === p.secret)), ...rA.rest];
await w.ops.receive(leftA).privkey(A.sk).asCustom(cashu.OutputData.createRandomData(total(leftA), ks)).run(); await w.ops.receive(E.proofs).privkey(E.sk).asCustom(cashu.OutputData.createRandomData(64, ks)).run();

// the ledger Streetcat publishes, and two that are not right
const partOf = (r, amount) => ({ request: r.q.id, patient: r.q.patient, procedure: r.q.procedure, date: r.q.date, amount });
const eA = await C.ledgerEntry({ token: tok(A.proofs), proofs: A.proofs, date: '2026-11-10', parts: [partOf(rA, 1500)], remainders: [tok(rA.rest)] }), eB = await C.ledgerEntry({ token: tok(B.proofs), proofs: B.proofs, date: '2026-11-10', parts: [partOf(rB, 300)] });
const eE = await C.ledgerEntry({ token: tok(E.proofs), proofs: E.proofs, date: '2026-11-10' }), eF = await C.ledgerEntry({ token: tok(F.proofs), proofs: F.proofs, date: '2026-11-10' }), entries = [eA, eB, eE, eF];
const stolen = { statement: { ...rA.a.statement, clinic: X.pk }, sig: cashu.schnorrSignMessage('streetcat/clinic-certificate/v1\n' + C.canon({ ...rA.a.statement, clinic: X.pk }), await C.derivedSk(C.TAG.statement, X.sk)) };  /* the same words, signed by a key that is no partner of the campaign */
const ledgers = { dest: C.ledgerV2({ campaign: camp, entries, certificates: [rA.a, rB.a] }), outsider: C.ledgerV2({ campaign: camp, entries, certificates: [stolen, rB.a] }),
  norule: C.ledgerV2({ campaign: await C.signCampaign({ name: 'LUNA', op: 'sterilisation', mint: STOCK, streetcat: S.pk, clinic: P1.pk, partners: [P2.pk], lock: 'dest', deadline: now() + 3600 }, S.sk), entries: [], certificates: [] }) };

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})), viewer = await (await b.newContext({ serviceWorkers: 'block', ...(process.env.SHOT ? { viewport: { width: 390, height: 1500 }, deviceScaleFactor: 2 } : {}) })).newPage();  // SHOT=file.png saves the page (390 px)
viewer.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); });
await viewer.route('**/campaigns/*.json', r => r.fulfill({ json: ledgers[r.request().url().split('/').pop().replace('.json', '')] }));
const open = async name => { await viewer.goto(BASE + `status.html?l=campaigns/${name}.json`); await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 60000 });
  return viewer.evaluate(() => ({ rows: [...document.querySelectorAll('.row')].map(x => ({ ref: x.dataset.ref, amount: Number(x.dataset.amount), status: x.dataset.status, ok: x.dataset.ok === '1', text: x.innerText })), keys: (document.querySelector('.summary .keys') || {}).innerText || '', note: document.getElementById('tot-note').innerText, out: document.getElementById('l-out').innerText,
    tot: Object.fromEntries([...document.querySelectorAll('#tot div')].map(d => [d.querySelector('span').textContent.split(' · ')[0], d.querySelector('b').textContent])) })); };
const plainNum = s => String(s).replace(/\s/g, ''), ab = k => k.slice(0, 10);
const v = await open('dest'); if (process.env.SHOT) { await viewer.waitForTimeout(5000); await viewer.screenshot({ path: process.env.SHOT }); }
const row = e => v.rows.find(r => r.ref === e.ref) || { text: '' }, [a, bb, e, f] = [eA, eB, eE, eF].map(row);
check('the ledger opens: one row for each donation, and the campaign names both partners with their keys', !/Failed/.test(v.out) && v.rows.length === 4 && v.rows.every(r => r.ok) && v.keys.includes('partner 1 ' + ab(P1.pk)) && v.keys.includes('partner 2 ' + ab(P2.pk)), v.rows.map(r => `${r.amount} ${r.status}`).join(' | ') + (/Failed/.test(v.out) ? ' · ' + v.out.slice(0, 120) : ' · ' + v.keys.replace(/\n/g, ' / ')));
check('a donation paid whole: RELEASED, "paid to its partner by the mint", and to which', bb.status === 'RELEASED' && /paid to its partner by the mint/.test(bb.text) && bb.text.includes(`300 sat paid by the mint to partner 1 ${ab(P1.pk)}`), bb.text.split('\n').filter(l => /paid/.test(l)).join(' / '));
check('one released in part and then taken back: 1 500 sat released, the rest refunded (what was put back named apart), and who was paid', a.status === 'MIXED' && /1 500 sat released/.test(a.text) && a.text.includes(`${fmt(backA - total(rA.rest))} refunded`) && a.text.includes(`${fmt(total(rA.rest))} refunded (put back)`) && a.text.includes(`1 500 sat paid by the mint to partner 2 ${ab(P2.pk)}`), a.text.split('\n').filter(l => /released|paid by/.test(l)).join(' / '));
check('…and what it paid for, declared by the partner that was paid', /→ 1 500 sat: LUNA · sterilisation \(spay\) · 2026-11-10 · ✓ declared by the clinic/.test(a.text) && !/not accounted for/.test(a.text));
check('one taken back whole: REFUNDED; one never touched, past the deadline: REFUNDABLE', e.status === 'REFUNDED' && e.amount === 64 && f.status === 'REFUNDABLE' && f.amount === 128, `${e.status} ${e.amount} | ${f.status} ${f.amount}`);
check('the totals add up from the mint alone: 1 800 released, 664 refunded, 128 refundable, nothing locked', plainNum(v.tot.released) === '1800sat' && plainNum(v.tot.refunded) === `${backA + 64}sat` && plainNum(v.tot.refundable) === '128sat' && plainNum(v.tot.locked) === '0sat', JSON.stringify(v.tot));
check('…and under them, how much the mint paid each partner', v.note.includes(`300 sat paid to partner 1 ${ab(P1.pk)}`) && v.note.includes(`1 500 sat paid to partner 2 ${ab(P2.pk)}`) && !/does not say it enforces/.test(v.note), v.note.slice(0, 160));
const o = await open('outsider'), oa = o.rows.find(r => r.ref === eA.ref) || { text: '' };
check('a declaration signed by a key that is not a partner of the campaign is not taken: the 1 500 sat are not accounted for, in red', /declaration is not in the ledger/.test(oa.text) && /1 500 sat not accounted for/.test(oa.text) && /released without the clinic's declaration/.test(o.note), oa.text.split('\n').filter(l => /✗|declaration/.test(l)).join(' / ').slice(0, 200));
const n = await open('norule');
check('such a campaign at a mint that does not announce the rule: said in red', /✗ This mint does not say it enforces where these donations may go/.test(n.note), n.note.slice(0, 140));

// ---------- what the audit of 10 Nov found on this page ----------
// 1. A donor takes its donation back and writes its witness as a release writes one: an output opened, locked to a partner's key (with a
// deadline already past and its own key to refund, so only the donor can ever spend it). The page said "RELEASED · paid by the mint to
// partner 1", and "released without the clinic's declaration". A release is now one that Streetcat and the partner signed: this is none.
const rnd = () => hex(cashu.createRandomSecretKey()), trick = outOf(128, JSON.stringify(['P2PK', { nonce: rnd(), data: P1.pk, tags: [['locktime', '1'], ['refund', C.pubOf(F.sk)]] }]));
const witF = JSON.stringify({ signatures: [cashu.schnorrSignMessage(F.proofs.map(p => p.secret + p.C).join('') + '128' + trick.blindedMessage.B_, F.sk)], outputs: [{ secret: new TextDecoder().decode(trick.secret), r: trick.blindingFactor.toString(16).padStart(64, '0') }], inputs: F.proofs.map(p => C.yOf(p.secret)) });
await w.mint.swap({ inputs: F.proofs.map((p, i) => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(i ? {} : { witness: witF }) })), outputs: [{ amount: 128, id: ks.id, B_: trick.blindedMessage.B_ }] });
const v2 = await open('dest'), f2 = v2.rows.find(r => r.ref === eF.ref) || { text: '' };
check('a donor who takes its money back with a witness written like a release\'s: REFUNDED, nothing "paid by the mint", nothing "released without a declaration"', f2.status === 'REFUNDED' && f2.amount === 128 && f2.ok && !/paid by the mint|went to/.test(f2.text) && !/released without/.test(v2.note) && plainNum(v2.tot.refunded) === `${backA + 64 + 128}sat` && plainNum(v2.tot.released) === '1800sat', `${f2.status} ${f2.amount} · ${JSON.stringify(v2.tot)}`);
// 2. A ledger written into the link itself (status.html?l={…}) was taken for one the visitor pasted, and shown in green with no
// word of where it came from: it is nobody's word, like a file on another site.
await viewer.goto(BASE + 'status.html?l=' + encodeURIComponent(JSON.stringify(C.ledgerV2({ campaign: camp, entries: [eB], certificates: [] })))); await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 60000 });
const inl = await viewer.evaluate(() => ({ trust: document.getElementById('c-trust').innerText, green: document.getElementById('l-out').classList.contains('ok'), rows: document.querySelectorAll('.row').length }));
check('a ledger written into the link itself: said in red that it is not signed by Streetcat, and the result is not shown in green', /✗ This ledger was written into the link itself, not signed by Streetcat/.test(inl.trust) && /✓ campaign signed by Streetcat/.test(inl.trust) && !inl.green && inl.rows === 1, inl.trust.split('\n').find(l => /✗/.test(l)) || 'NO WARNING');
// 3. A token that names this mint and holds another mint's ecash stopped the whole page ("Failed: Couldn't map…"). It is one red row.
const ws = new cashu.Wallet(STOCK); await ws.loadMint(); const qs = await ws.createMintQuoteBolt11(64); let alien = null; for (let i = 0; i < 40 && !alien; i++) { try { alien = await ws.mintProofsBolt11(64, qs); } catch { await new Promise(r => setTimeout(r, 300)); } }
ledgers.alien = { ...ledgers.dest, donations: [...ledgers.dest.donations, cashu.getEncodedToken({ mint: MINT, proofs: alien })] };
const al = await open('alien');
check('a token in the ledger that is not this mint\'s ecash: one row in red, and every other donation still checked', !/Failed/.test(al.out) && al.rows.length === 5 && al.rows.filter(r => r.ok).length === 4 && al.rows.some(r => r.status === 'UNREADABLE' && /not this mint's/.test(r.text)), al.rows.map(r => r.status).join(' | ') + (/Failed/.test(al.out) ? ' · ' + al.out.slice(0, 100) : ''));
await b.close();
say(bad ? `deststatus: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'deststatus: every check passed'); process.exit(bad ? 1 : 0);
