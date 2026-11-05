// The published ledger, version 2, on app/status.html (Chromium, local Nutshell mint, fake money). One donation pays 1500 of its 2100
// sat for a spay (a split release: the rest goes back under its lock), a second one pays all of its 21. The status page must count
// each part from the mint (the rest found with NUT-09 restore), show each donation's DON- code and what it paid for, accept the
// clinic's signed declaration and refuse an altered one, find a donation by its code, and add up the same from a version 1 ledger.
import fs from 'fs';
import { chromium } from 'playwright';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338';
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, amt = C.amt, total = ps => ps.reduce((s, p) => s + amt(p.amount), 0), say = (...a) => console.log(...a);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const sc = newSk(), cl = newSk(), camp = { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline: Math.floor(Date.now() / 1000) + 30 * 86400 };
const donate = async n => { const ps = await plain(n); return w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: ps })).asLocked(new cashu.LockBuilder().addMainPubkey([camp.streetcat, camp.clinic]).requireMainSignatures(2).addRefundPubkey(C.pubOf(newSk())).lockUntil(camp.deadline)).run(); };
const A = await donate(2100), B = await donate(21), tok = ps => cashu.getEncodedToken({ mint: MINT, proofs: ps });

// the request, the clinic's answer, and the release with the rest of A put back
const plan = C.planRelease(A, 1500), q = await C.makeRequest({ campaign: camp, patient: 'MOCHI', procedure: 'sterilisation (spay)', date: '2026-11-04', contributions: [{ release: 1500, proofs: plan.inputs }, { release: total(B), proofs: B }] }), a = await C.certify(q, cl);
const sigs = C.clinicSigsByY(q, a), inputs = cashu.signP2PKProofs([...plan.inputs, ...B].map(p => C.withSig(p, sigs.get(C.yOf(p.secret)))), sc), fee = amt(w.getFeesForProofs(inputs));
const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), bits = n => { const o = []; for (let b = 1; n; b *= 2) if (n & b) { o.push(b); n -= b; } return o.reverse(); };
await w.ops.receive(inputs).asCustom([...cashu.OutputData.createRandomData(C.requestAmount(q) - fee, ks), ...await C.remainderOutputs(plan.split, bits(plan.remainder), ks.id)]).run();
const rest = await C.findRemainder(w, plan.split), partOf = { request: q.id, patient: q.patient, procedure: q.procedure, date: q.date };
const eA = await C.ledgerEntry({ token: tok(A), proofs: A, date: '2026-11-04', parts: [{ ...partOf, amount: 1500 }], remainders: [tok(rest)] }), eB = await C.ledgerEntry({ token: tok(B), proofs: B, date: '2026-11-04', parts: [{ ...partOf, amount: total(B) }] });
const ledgers = { v2: C.ledgerV2({ campaign: camp, entries: [eA, eB], certificates: [a] }), v1: { campaign: camp, donations: [tok(A), tok(B)] }, altered: C.ledgerV2({ campaign: camp, entries: [eA, eB], certificates: [{ ...a, statement: { ...a.statement, amount: 9999 } }] }), understated: C.ledgerV2({ campaign: camp, entries: [{ ...eA, parts: [{ ...partOf, amount: 1000 }] }, eB], certificates: [a] }) };

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})), viewer = await (await b.newContext({ serviceWorkers: 'block', ...(process.env.SHOT ? { viewport: { width: 390, height: 1100 }, deviceScaleFactor: 2 } : {}) })).newPage();  // SHOT=file.png saves the page (390 px)
viewer.on('pageerror', e => say('PAGEERROR', e.message));
await viewer.route('**/campaigns/*.json', r => r.fulfill({ json: ledgers[r.request().url().split('/').pop().replace('.json', '')] }));
const open = async name => { await viewer.goto(BASE + `status.html?l=campaigns/${name}.json`); await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 60000 });
  return viewer.evaluate(() => ({ rows: [...document.querySelectorAll('.row')].map(x => ({ ref: x.dataset.ref, amount: Number(x.dataset.amount), status: x.dataset.status, ok: x.dataset.ok === '1', text: x.innerText })), tot: Object.fromEntries([...document.querySelectorAll('#tot div')].map(d => [d.querySelector('span').textContent.split(' · ')[0], d.querySelector('b').textContent])) })); };
const v2 = await open('v2'); if (process.env.SHOT) { await viewer.waitForTimeout(5000); await viewer.screenshot({ path: process.env.SHOT }); } const rA = v2.rows.find(r => r.ref === eA.ref), rB = v2.rows.find(r => r.ref === eB.ref);
check('v2: one row per donation (the rest of A, listed apart, counts inside A)', v2.rows.length === 2, v2.rows.map(r => `${r.ref} ${r.amount} ${r.status}`).join(' | '));
check('A: 1500 released and the rest locked again, from the mint', rA && rA.ok && /1500 sat released/.test(rA.text) && new RegExp(`${plan.remainder} sat locked \\(put back\\)`).test(rA.text), rA && rA.text.split('\n').find(l => /put back/.test(l)));
check('A: what it paid for, declared by the clinic', rA && /→ 1500 sat: MOCHI · sterilisation \(spay\) · 2026-11-04 · ✓ declared by the clinic/.test(rA.text));
check('totals add up proof by proof', v2.tot.released === `${1500 + total(B)} sat` && v2.tot.locked === `${plan.remainder} sat`, JSON.stringify(v2.tot));
await viewer.click('#m-open'); await viewer.fill('#m-tok', eA.ref.toLowerCase()); await viewer.click('#m-go'); const look = (await viewer.textContent('#m-out')).trim();
check('a donation found by its code', /^LISTED ✓ · DON-/.test(look) && /→ 1500 sat/.test(look), look.split('\n').join(' / '));
await viewer.fill('#m-tok', 'DON-00000000'); await viewer.click('#m-go'); check('a code that is not there', /^NOT LISTED ✗/.test((await viewer.textContent('#m-out')).trim()));
const v1 = await open('v1'); check('a version 1 ledger adds up the same, from the mint alone', v1.tot.released === v2.tot.released && v1.tot.locked === v2.tot.locked, JSON.stringify(v1.tot));
const alt = await open('altered'); check('an altered declaration is not shown as the clinic\'s', alt.rows.every(r => !/declared by the clinic/.test(r.text)) && alt.rows.some(r => /declaration is not in the ledger/.test(r.text)));
const und = await open('understated'); check('a ledger that says less went to procedures than the mint shows released is flagged', und.rows.some(r => /the mint shows 1500 sat released from it, but the ledger says 1000/.test(r.text)));
await b.close();
say(bad ? `ledger: ${bad} check(s) failed` : 'ledger: every check passed');
