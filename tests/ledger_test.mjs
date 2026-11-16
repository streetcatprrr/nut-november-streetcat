// The published ledger, version 2, on app/status.html (Chromium, local Nutshell mint, fake money). One donation pays 1500 of its 2100
// sat for a spay (a split release: the rest goes back under its lock), a second one pays all of its 21. The status page must count
// each part from the mint (the rest found with NUT-09 restore), show each donation's DON- code and what it paid for, accept the
// clinic's signed declaration and refuse an altered one, find a donation by its code, and add up the same from a version 1 ledger.
import fs from 'fs';
import { chromium } from 'playwright';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338';
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
const ledgers = { v2: C.ledgerV2({ campaign: camp, entries: [eA, eB], certificates: [a] }), v1: { campaign: camp, donations: [tok(A), tok(B)] }, altered: C.ledgerV2({ campaign: camp, entries: [eA, eB], certificates: [{ ...a, statement: { ...a.statement, amount: 9999 } }] }), understated: C.ledgerV2({ campaign: camp, entries: [{ ...eA, parts: [{ ...partOf, amount: 1000 }] }, eB], certificates: [a] }),
  relabelled: C.ledgerV2({ campaign: camp, entries: [{ ...eA, parts: [{ ...partOf, patient: 'LOGO', amount: 1500 }] }, eB], certificates: [a] }),  /* the ledger names another cat than the clinic declared (Daybreak, 14 Nov) */
  /* group 8 of the six scans, the third part (15 Nov) */
  twice: C.ledgerV2({ campaign: camp, entries: [{ ...eA, parts: [{ ...partOf, amount: 1500 }, { ...partOf, amount: 1500 }] }, eB], certificates: [a] }),  /* 5.6, 5.20: the clinic's one declaration under two lines, and more said than the mint released */
  relabelledB: C.ledgerV2({ campaign: camp, entries: [eA, { ...eB, parts: [{ ...partOf, patient: 'LOGO', amount: total(B) }] }], certificates: [a] }),  /* 5.15: a donation released whole, under another cat's name */
  borrowed: null, shadow: null, norest: { campaign: camp, donations: [tok(A)] },
  badmint: { ...C.ledgerV2({ campaign: camp, entries: [eA, eB], certificates: [a] }), campaign: { ...camp, mint: MINT + "/$(touch /tmp/sc-x)'" } } };  /* a mint written to break out of the command offered to copy */

// 5.30: a request the clinic signed for other ecash, with this donation's code written on it
const E = await donate(21), q2 = await C.makeRequest({ campaign: camp, patient: 'NUBE', procedure: 'sterilisation (spay)', date: '2026-11-05', contributions: [{ release: total(E), proofs: E }] }); q2.contributions[0].ref = eB.ref;
let a2 = null, a2why = ''; try { a2 = await C.certify(q2, cl); } catch (e) { a2why = e.message || String(e); }
if (a2) ledgers.borrowed = C.ledgerV2({ campaign: camp, entries: [eA, { ...eB, parts: [{ request: q2.id, patient: q2.patient, procedure: q2.procedure, date: q2.date, amount: total(B) }] }], certificates: [a, a2] });
// 5.16: an entry that cannot be counted (one of its proofs carries no proof of issue), listed before the donation it borrows a proof from
const noDleq = p => { const x = { ...p }; delete x.dleq; return x; }; ledgers.shadow = { campaign: camp, donations: [tok([B[0], noDleq(E[0])]), tok(B)] };

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})), viewer = await (await b.newContext({ serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'], ...(process.env.SHOT ? { viewport: { width: 390, height: 1100 }, deviceScaleFactor: 2 } : {}) })).newPage();  // SHOT=file.png saves the page (390 px)
viewer.on('pageerror', e => say('PAGEERROR', e.message));
await viewer.route('**/campaigns/*.json', r => r.fulfill({ json: ledgers[r.request().url().split('/').pop().replace('.json', '')] }));
const open = async name => { await viewer.goto(BASE + `status.html?l=campaigns/${name}.json`); await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 60000 });
  return viewer.evaluate(() => ({ rows: [...document.querySelectorAll('.row')].map(x => ({ ref: x.dataset.ref, amount: Number(x.dataset.amount), status: x.dataset.status, ok: x.dataset.ok === '1', text: x.innerText })), tot: Object.fromEntries([...document.querySelectorAll('#tot div')].map(d => [d.querySelector('span').textContent.split(' · ')[0], d.querySelector('b').textContent])) })); };
const v2 = await open('v2'); if (process.env.SHOT) { await viewer.waitForTimeout(5000); await viewer.screenshot({ path: process.env.SHOT }); } const rA = v2.rows.find(r => r.ref === eA.ref), rB = v2.rows.find(r => r.ref === eB.ref);
check('v2: one row per donation (the rest of A, listed apart, counts inside A)', v2.rows.length === 2, v2.rows.map(r => `${r.ref} ${r.amount} ${r.status}`).join(' | '));
check('A: 1500 released and the rest locked again, from the mint', rA && rA.ok && /1 500 sat released/.test(rA.text) && new RegExp(`${plan.remainder} sat locked \\(put back\\)`).test(rA.text), rA && rA.text.split('\n').find(l => /put back/.test(l)));
check('A: what it paid for, declared by the clinic', rA && /→ 1 500 sat: MOCHI · sterilisation \(spay\) · 2026-11-04 · ✓ declared by the clinic/.test(rA.text));
const plainNum = s => String(s).replace(/\s/g, '');  /* amounts are written "1 521 sat" since 9 Nov (fmtSat): compared without the spaces */
check('totals add up proof by proof', plainNum(v2.tot.released) === `${1500 + total(B)}sat` && plainNum(v2.tot.locked) === `${plan.remainder}sat`, JSON.stringify(v2.tot));
await viewer.click('#m-open'); await viewer.fill('#m-tok', eA.ref.toLowerCase()); await viewer.click('#m-go'); const look = (await viewer.textContent('#m-out')).trim();
check('a donation found by its code', /^LISTED ✓ · DON-/.test(look) && /→ 1 500 sat/.test(look), look.split('\n').join(' / '));
await viewer.fill('#m-tok', 'DON-00000000'); await viewer.click('#m-go'); check('a code that is not there', /^NOT LISTED ✗/.test((await viewer.textContent('#m-out')).trim()));
const v1 = await open('v1'); check('a version 1 ledger adds up the same, from the mint alone', v1.tot.released === v2.tot.released && v1.tot.locked === v2.tot.locked, JSON.stringify(v1.tot));
const alt = await open('altered'); check('an altered declaration is not shown as the clinic\'s', alt.rows.every(r => !/declared by the clinic/.test(r.text)) && alt.rows.some(r => /declaration is not in the ledger/.test(r.text)));
const und = await open('understated'); check('a ledger that says less went to procedures than the mint shows released is flagged', und.rows.some(r => /the mint shows 1\s500 sat released from it, but the ledger says 1\s000 sat/.test(r.text)));
// Daybreak, 14 Nov. "declared by the clinic" only beside what the clinic signed: a ledger that names another cat for the request is in
// red, with the clinic's own words under it
const rel = await open('relabelled'), rRel = rel.rows.find(r => r.ref === eA.ref), redRel = await viewer.evaluate(ref => { const row = [...document.querySelectorAll('.row')].find(x => x.dataset.ref === ref); const l = row && [...row.querySelectorAll('div')].find(d => /LOGO/.test(d.textContent) && d.children.length === 0); return !!l && l.classList.contains('bad'); }, eA.ref);
check('a ledger that names another cat than the clinic declared: not "✓ declared by the clinic", but in red, with what the clinic declared under it', !!rRel && /→ 1 500 sat: LOGO · sterilisation \(spay\) · 2026-11-04 · ✗ not what the clinic declared/.test(rRel.text) && /✓ the clinic declared: 1 500 sat: MOCHI · sterilisation \(spay\) · 2026-11-04/.test(rRel.text) && !/LOGO[^\n]*✓ declared by the clinic/.test(rRel.text) && redRel, rRel && rRel.text.split('\n').filter(l => /LOGO|MOCHI/.test(l)).join(' / '));
// the command offered to ask the mint yourself: the mint's address quoted, and a ledger whose mint is no web address is refused
await open('v2'); await viewer.click('#raw-open'); await viewer.waitForTimeout(300); const cmd = await viewer.evaluate(() => navigator.clipboard.readText());
check('"ask the mint yourself" copies a command with the mint\'s address in quotes', cmd.startsWith(`curl -s -X POST '${MINT}/v1/checkstate' -H 'Content-Type: application/json' -d '{"Ys":[`), cmd.slice(0, 90));
await viewer.goto(BASE + 'status.html?l=campaigns/badmint.json'); await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 60000 }).catch(() => {});
const badOut = (await viewer.textContent('#l-out')).trim(), tools = await viewer.$eval('#tools', e => e.hidden);
check('a ledger whose mint is not a web address is refused, and offers no command', /^Failed: the campaign's mint is not a web address/.test(badOut) && tools, badOut.slice(0, 80));
// Group 8 of the six scans, the third part (15 Nov). Each of these fails on the code before, but the two that say what still holds.
const lifeOf = ref => viewer.evaluate(ref => { const row = [...document.querySelectorAll('.row')].find(x => x.dataset.ref === ref); return row ? [...row.querySelectorAll('.life .on')].map(x => x.textContent).join(' ') : null; }, ref);
await open('v2'); const lifeV2 = await lifeOf(eB.ref), trustFile = await viewer.$eval('#c-trust', e => e.innerText);
check('as before: a donation released as the clinic declared shows "✓ confirmed", and this site\'s own file carries no warning', /✓ confirmed/.test(lifeV2 || '') && !/not signed by Streetcat/.test(trustFile), lifeV2);
await open('relabelledB'); const lifeRel = await lifeOf(eB.ref);
check('5.15: no "✓ confirmed" on a released donation whose line in the ledger is not what the clinic declared', lifeRel !== null && !/confirmed/.test(lifeRel), `"${lifeRel}"`);
const tw = await open('twice'), rTw = tw.rows.find(r => r.ref === eA.ref), lifeTw = await lifeOf(eA.ref);
check('5.6: the clinic\'s one declaration under two lines of the ledger: the second is in red, "listed again"', !!rTw && (rTw.text.match(/✓ declared by the clinic/g) || []).length === 1 && /listed again: the clinic declared it once/.test(rTw.text), rTw && rTw.text.split('\n').filter(l => /→/.test(l)).join(' / '));
check('5.20: a ledger that says more went to procedures than the mint shows released: said in red, and no "✓ confirmed"', !!rTw && /the ledger says 3\s000 sat of it went to procedures, but the mint shows 1\s500 sat released/.test(rTw.text) && !/confirmed/.test(lifeTw || ''), lifeTw);
if (ledgers.borrowed) { const bo = await open('borrowed'), rBo = bo.rows.find(r => r.ref === eB.ref), lifeBo = await lifeOf(eB.ref);
  check('5.30: a declaration the clinic signed for other ecash, with this donation\'s code on it: not this donation\'s, in red', !!rBo && /NUBE[^\n]*names other ecash, not this donation's/.test(rBo.text) && !/NUBE[^\n]*✓ declared by the clinic/.test(rBo.text) && !/confirmed/.test(lifeBo || ''), rBo && rBo.text.split('\n').filter(l => /NUBE/.test(l)).join(' / '));
} else check('5.30: the clinic\'s app does not sign a request whose code is not its ecash\'s (nothing to show on the page)', /./.test(a2why), a2why);
const sh = await open('shadow'), shB = sh.rows.filter(r => r.status === 'RELEASED' && r.amount === total(B) && r.ok); await viewer.click('#m-open'); await viewer.fill('#m-tok', tok(B)); await viewer.click('#m-go'); await viewer.waitForFunction(() => /LISTED|Failed/.test(document.getElementById('m-out').textContent), null, { timeout: 30000 }); const lookB = (await viewer.textContent('#m-out')).trim();
check('5.16: an entry that is not counted, listed first with a proof of a good donation in it: the donation is still counted whole, and found', sh.rows.some(r => r.status === 'NOT COUNTED') && shB.length === 1 && /^LISTED ✓/.test(lookB), sh.rows.map(r => `${r.amount} ${r.status}`).join(' | ') + ' · ' + lookB.split('\n')[0]);
await viewer.fill('#m-tok', tok([B[0], noDleq(E[0])])); await viewer.click('#m-go'); await viewer.waitForTimeout(300); await viewer.waitForFunction(() => /LISTED|Failed/.test(document.getElementById('m-out').textContent), null, { timeout: 30000 }); const lookBad = (await viewer.textContent('#m-out')).trim();
check('…and the entry that is not counted is not called listed', /^NOT LISTED/.test(lookBad), lookBad.split('\n')[0]);
await open('norest'); await viewer.click('#m-open'); await viewer.fill('#m-tok', tok(rest)); await viewer.click('#m-go'); await viewer.waitForFunction(() => /LISTED|Failed/.test(document.getElementById('m-out').textContent), null, { timeout: 30000 }); const lookRest = (await viewer.textContent('#m-out')).trim();
check('5.23: the rest of a listed donation, put back under its lock and not listed apart, is found as listed', /^LISTED ✓/.test(lookRest), lookRest.split('\n')[0]);
// 5.4: a ledger pasted into the page is nobody's word
await viewer.goto(BASE + 'status.html'); await viewer.waitForFunction(() => !!document.getElementById('l-src')); await viewer.evaluate(v => { const ta = document.getElementById('l-src'); ta.value = v; ta.dispatchEvent(new Event('input', { bubbles: true })); }, JSON.stringify(ledgers.v2));
await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 60000 }); await viewer.waitForTimeout(400); const pasted = await viewer.evaluate(() => ({ trust: document.getElementById('c-trust').innerText, green: document.getElementById('l-out').classList.contains('ok'), out: document.getElementById('l-out').innerText }));
check('5.4: a pasted ledger says, in red, that it was pasted here and is not signed by Streetcat, and its result is not in green', /✗ This ledger was pasted here, not signed by Streetcat/.test(pasted.trust) && /pasted here/.test(pasted.out) && !pasted.green, pasted.trust.split('\n').slice(0, 2).join(' / '));
// 5.12: this browser's donations are asked of the mint when their button is tapped, not as the page opens
{ const ctx2 = await b.newContext({ serviceWorkers: 'block' }), pg = await ctx2.newPage(); pg.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); let asked = 0; pg.on('request', r => { if (/\/v1\/(checkstate|restore)/.test(r.url())) asked++; });
  await pg.addInitScript(t => { try { localStorage.setItem('vetlock.donor.keys', JSON.stringify([{ lockedToken: t, campaign: 'MOCHI' }])); } catch (_) {} }, tok(E));
  await pg.goto(BASE + 'status.html'); await pg.waitForFunction(() => !!document.getElementById('here-list')); await pg.waitForTimeout(2500);
  const before = await pg.evaluate(() => { const g = document.getElementById('here-go'); return { shown: !document.getElementById('here').hidden, button: !!g && !g.hidden ? g.textContent : '', rows: document.querySelectorAll('#here .hrow').length }; }), askedBefore = asked;
  if (before.button) { await pg.click('#here-go'); await pg.waitForFunction(() => document.querySelectorAll('#here .hrow').length > 0, null, { timeout: 30000 }).catch(() => {}); }
  const after = await pg.evaluate(() => ({ rows: [...document.querySelectorAll('#here .hrow')].map(x => x.dataset.status), go: document.getElementById('here-go') ? document.getElementById('here-go').hidden : null }));
  check('5.12: "From this browser" opens closed, with a button, and the mint is asked nothing until it is tapped; then the donation is checked', before.shown && /at the mint/.test(before.button) && before.rows === 0 && askedBefore === 0 && after.rows.length === 1 && after.rows[0] === 'LOCKED' && asked > 0 && after.go === true, JSON.stringify({ before, askedBefore, after, asked }));
  await ctx2.close(); }
await b.close();
say(bad ? `ledger: ${bad} check(s) failed` : 'ledger: every check passed'); process.exit(bad ? 1 : 0);  /* a failed check fails the run: it used to end with 0 either way, and two stale expectations went unseen from 9 Nov to 10 Nov */
