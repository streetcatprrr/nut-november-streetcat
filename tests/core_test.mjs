// app/core.js against the local Nutshell mint (fake money), in Node with the app's own cashu-ts bundle:
// derived keys, DON- codes, packing, the request and the clinic's answer (and every way an answer can be wrong), a release in full
// and a split one whose rest the donor finds again with NUT-09 restore and takes back after the deadline, the ledger, a handover
// and a campaign signed by Streetcat.
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3338';
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, say = (...a) => console.log(...a), now = () => Math.floor(Date.now() / 1000);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
const amt = C.amt, total = ps => ps.reduce((s, p) => s + amt(p.amount), 0);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };

const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const sc = newSk(), cl = newSk(), scPk = C.pubOf(sc), clPk = C.pubOf(cl);
const camp = { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: scPk, clinic: clPk, deadline: now() + 30 * 86400 };
const lockFor = (c, refundPk) => new cashu.LockBuilder().addMainPubkey([c.streetcat, c.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(Number(c.deadline));
const donate = async (c, n) => { const d = newSk(), ps = await plain(n); const locked = await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: ps })).asLocked(lockFor(c, C.pubOf(d))).run(); return { sk: d, proofs: locked }; };
const ys = ps => ps.map(p => C.yOf(p.secret));

// 1) keys derived from a campaign key
const dsk = await C.derivedSk(C.TAG.statement, cl), dpk = await C.derivedPub(C.TAG.statement, clPk);
check('derived statement key: its public key is computed from the clinic public key alone', C.pubOf(dsk) === dpk);
check('each tag gives another key', (await C.derivedPub(C.TAG.messaging, clPk)) !== dpk && dpk !== clPk);
check('a signature by the spending key does not pass as a declaration', !cashu.schnorrVerifyMessage(cashu.schnorrSignMessage('x', cl), 'x', dpk));

// 2) donations and DON- codes
const A = await donate(camp, 2100), B = await donate(camp, 21);
const refA = await C.donRef(ys(A.proofs)); check('a DON- code is the same whatever the order of the proofs', refA === await C.donRef(ys(A.proofs).reverse()) && /^DON-[0-9A-F]{8}$/.test(refA), refA);

// 3) a request: A pays 1500 of a spay (split), B pays all of its 21
const plan = C.planRelease(A.proofs, 1500);
check(`release plan for 1500 of ${total(A.proofs)}`, plan.whole.reduce((s, p) => s + amt(p.amount), 0) + plan.part === 1500 && plan.remainder === amt(plan.split.amount) - plan.part, `whole ${plan.whole.map(p => amt(p.amount)).join('+') || '—'} + ${plan.part} of ${amt(plan.split.amount)}, rest ${plan.remainder}`);
const q = await C.makeRequest({ campaign: camp, patient: 'MOCHI', procedure: 'sterilisation (spay)', date: '2026-11-04', contributions: [{ ref: refA, release: 1500, proofs: plan.inputs }, { release: total(B.proofs), proofs: B.proofs }] });
check('the request is valid', !C.requestProblems(q).length, C.requestProblems(q).join('; '));
const packed = await C.pack(q), link = await C.linkFor('https://example.org/clinic', q);
check('it packs and unpacks the same (link and file)', C.canon(await C.unpack(link)) === C.canon(q) && C.canon(await C.unpack(JSON.stringify(q))) === C.canon(q), `link ${link.length} chars`);
let bomb = false; try { await C.unpack('sc0.' + Buffer.from(JSON.stringify({ x: 'a'.repeat(5 << 20) })).toString('base64url')); } catch (e) { bomb = /too large/.test(e.message); } check('a link that expands without end is refused', bomb);
const forged = JSON.parse(JSON.stringify(q)); forged.contributions[1].proofs[0].secret = forged.contributions[1].proofs[0].secret.replace(String(camp.deadline), String(camp.deadline + 86400));
check('a request whose proof carries another deadline is refused', C.requestProblems(forged).some(x => /deadline/.test(x)), C.requestProblems(forged)[0]);

// 4) the clinic's answer, and every way it can be wrong
const a = await C.certify(q, cl);
const v = await C.checkAnswer(q, a); check('the answer is certified', v.ok, v.text);
let other = false; try { await C.certify(q, newSk()); } catch (e) { other = /not MOCHI's clinic key/.test(e.message); } check('the clinic app will not sign with another key', other);
const partly = { ...a, sigs: a.sigs.map((s, i) => i ? s : undefined) }; check('one proof unsigned', !(await C.checkAnswer(q, partly)).ok, (await C.checkAnswer(q, partly)).text);
const wrongKey = { ...a, sigs: q.contributions.flatMap(k => k.proofs.map(p => cashu.schnorrSignMessage(p.secret, newSk()))) }; check('every proof signed with another key', !(await C.checkAnswer(q, wrongKey)).ok, (await C.checkAnswer(q, wrongKey)).text);
const otherCat = { ...a, statement: { ...a.statement, patient: 'TEO' } }; check('a declaration changed afterwards', !(await C.checkAnswer(q, otherCat)).ok, (await C.checkAnswer(q, otherCat)).text);
const q2 = { ...q, patient: 'TEO' }; check('a declaration for another request', !(await C.checkAnswer(q2, a)).ok, (await C.checkAnswer(q2, a)).text);
const rep = await C.report(q, cl, 'postponed', 'the cat was not caught'); check('a signed report', (await C.checkAnswer(q, rep)).ok, (await C.checkAnswer(q, rep)).text);

// 5) Streetcat releases: the clinic's signature and its own on each input; the rest of the split proof goes back under its lock
const sigs = C.clinicSigsByY(q, a), signedBoth = ps => cashu.signP2PKProofs(ps.map(p => C.withSig(p, sigs.get(C.yOf(p.secret)))), sc);
const inputs = signedBoth([...plan.inputs, ...B.proofs]), fee = amt(w.getFeesForProofs(inputs));
const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id);
const bits = n => { const o = []; for (let b = 1; n; b *= 2) { if (n & b) { o.push(b); n -= b; } } return o.reverse(); };
const back = await C.remainderOutputs(plan.split, bits(plan.remainder), ks.id), mine = cashu.OutputData.createRandomData(C.requestAmount(q) - fee, ks);
const got = await w.ops.receive(inputs).asCustom([...mine, ...back]).run();
const toStreetcat = got.filter(p => !lockOfP(p)), restProofs = got.filter(p => lockOfP(p));
function lockOfP(p){ return !!C.lockOf(p.secret); }
check('released: Streetcat gets the procedure\'s amount less the fee; the rest is locked again', total(toStreetcat) === C.requestAmount(q) - fee && total(restProofs) === plan.remainder, `${total(toStreetcat)} sat to Streetcat (fee ${fee}), ${total(restProofs)} sat locked again`);
check('the rest carries the same lock (keys, deadline, the donor\'s refund key)', restProofs.every(p => !C.lockProblem(C.lockOf(p.secret), camp) && C.lockOf(p.secret).refund[0] === C.pubOf(A.sk)));

// 6) the donor, holding only the original token, finds the rest at the mint
const found = await C.findRemainder(w, plan.split);
check('the donor finds the rest again with NUT-09 restore', total(found) === plan.remainder && found.every(p => cashu.hasValidDleq(p, w.keyChain.getKeyset(p.id))), `${total(found)} sat in ${found.length} proof(s)`);
const trace = await C.traceDonation(w, A.proofs); const live = trace.filter(x => x.state === 'UNSPENT');
check('following the donation down: what is still locked', total(live.map(x => x.proof)) === total(A.proofs) - 1500, live.map(x => `${amt(x.proof.amount)}${x.depth ? ' (put back)' : ''}`).join(' + '));

// 7) a campaign whose deadline passes: the donor takes back the rest of a split release with its refund key alone
const soon = { ...camp, name: 'TEO', deadline: now() + 6 }, D = await donate(soon, 100);
const pD = C.planRelease(D.proofs, 37), qD = await C.makeRequest({ campaign: soon, patient: 'TEO', procedure: 'sterilisation', date: '2026-11-05', contributions: [{ release: 37, proofs: pD.inputs }] }), aD = await C.certify(qD, cl);
const sD = C.clinicSigsByY(qD, aD), inD = cashu.signP2PKProofs(pD.inputs.map(p => C.withSig(p, sD.get(C.yOf(p.secret)))), sc), feeD = amt(w.getFeesForProofs(inD));
await w.ops.receive(inD).asCustom([...cashu.OutputData.createRandomData(37 - feeD, ks), ...await C.remainderOutputs(pD.split, bits(pD.remainder), ks.id)]).run();
await new Promise(r => setTimeout(r, Math.max(0, soon.deadline - now() + 2) * 1000));
const liveD = (await C.traceDonation(w, D.proofs)).filter(x => x.state === 'UNSPENT').map(x => x.proof);
const refunded = await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: liveD })).privkey(D.sk).run();
check('after the deadline the donor takes back everything not released, the put-back rest too', total(liveD) === total(D.proofs) - 37 && total(refunded) === total(liveD) - amt(w.getFeesForProofs(liveD)), `${total(liveD)} sat traced, ${total(refunded)} sat back`);

// 8) the ledger, version 2, and its declarations
const entryA = await C.ledgerEntry({ token: cashu.getEncodedToken({ mint: MINT, proofs: A.proofs }), proofs: A.proofs, date: '2026-11-04', parts: [{ request: q.id, patient: q.patient, procedure: q.procedure, date: q.date, amount: 1500 }], remainders: [cashu.getEncodedToken({ mint: MINT, proofs: found })] });
const L = C.ledgerV2({ campaign: camp, entries: [entryA], certificates: [a] });
check('ledger v2: each donation by its code, and v1 readers still find every token', L.entries[0].ref === refA && L.donations.length === 2 && L.entries[0].parts[0].amount === 1500);
check('ledger v2: the clinic\'s declaration checks out', await C.certificateOk(camp, L.certificates[0]) && !(await C.certificateOk(camp, { ...a, statement: { ...a.statement, amount: 1 } })));

// 9) handed over in person: a volunteer's acknowledgment
const vol = newSk(), ack = await C.handoverReceipt(camp, B.proofs, vol);
check('a volunteer\'s acknowledgment checks out, and says it is not a certification', await C.handoverReceiptOk(ack) && ack.body.note === 'Not a certification' && !(await C.handoverReceiptOk({ ...ack, body: { ...ack.body, amount: 9 } })));

// 10) a campaign signed by Streetcat: any change breaks the signature; a link with none is unsigned, not broken
const signed = await C.signCampaign({ ...camp, hue: 345, to: 'streetcat.example' }, sc);
check('a campaign signed with its Streetcat key checks out', await C.campaignSig(signed) === 'signed' && /^[0-9a-f]{128}$/.test(signed.sig));
const changed = await Promise.all([['clinic', C.pubOf(newSk())], ['streetcat', C.pubOf(newSk())], ['deadline', signed.deadline + 1], ['mint', 'https://mint.evil.example'], ['name', 'MOCHl'], ['op', 'castration'], ['hue', 100], ['to', 'evil.example']].map(async ([k, v]) => [k, await C.campaignSig({ ...signed, [k]: v })]));
check('changing any of its fields breaks it', changed.every(([, st]) => st === 'broken'), changed.map(([k, st]) => k + ':' + st).join(' '));
const k2 = newSk(), alt = await C.signCampaign({ ...signed, streetcat: C.pubOf(k2) }, k2);
check('…as does a signature made with another key, or a damaged one', await C.campaignSig({ ...signed, sig: alt.sig }) === 'broken' && await C.campaignSig({ ...signed, sig: signed.sig.slice(0, 126) + (signed.sig.endsWith('00') ? '01' : '00') }) === 'broken' && await C.campaignSig({ ...signed, sig: 'x'.repeat(128) }) === 'broken');
let foreign = null; try { foreign = await C.signCampaign(camp, newSk()); } catch (e) { foreign = e.message; } check('only the campaign\'s own Streetcat key can sign it', foreign === 'this is not the campaign\'s Streetcat key');
check('the same campaign written another way still checks out (a trailing slash, upper-case keys, the deadline as text)', await C.campaignSig({ ...signed, mint: signed.mint + '/', streetcat: signed.streetcat.toUpperCase(), deadline: String(signed.deadline) }) === 'signed');
check('a link with no signature is unsigned, not broken', await C.campaignSig(camp) === 'unsigned' && await C.campaignSig({ ...camp, sig: '' }) === 'unsigned');
check('the ledger carries the signature, and it still checks out there', await C.campaignSig(C.ledgerV2({ campaign: signed, entries: [] }).campaign) === 'signed');

// 11) the vet's invoice behind a declaration: only its SHA-256, signed with the rest; changed afterwards, the answer no longer checks out
const inv = { sha256: await C.sha256hex('%PDF-1.4 invoice 2026-118'), kind: 'invoice' }, ae = await C.certify(q, cl, undefined, inv), ve = await C.checkAnswer(q, ae);
check('a declaration can carry the invoice\'s fingerprint, and the answer still checks out', ve.ok && ae.statement.evidence.sha256 === inv.sha256 && Object.keys(ae.statement.evidence).sort().join() === 'kind,sha256');
check('…changed afterwards (another fingerprint, or none), it does not', !(await C.checkAnswer(q, { ...ae, statement: { ...ae.statement, evidence: { ...inv, sha256: 'f'.repeat(64) } } })).ok && !(await C.checkAnswer(q, { ...ae, statement: { ...ae.statement, evidence: undefined } })).ok);
let badEv = ''; try { await C.certify(q, cl, undefined, { sha256: 'abc', kind: 'invoice' }); } catch (e) { badEv = e.message; } check('…and a fingerprint that is not a SHA-256 of an invoice or a photo is refused', /not a SHA-256/.test(badEv));
check('…and its published declaration checks out with it', await C.certificateOk(camp, { statement: ae.statement, sig: ae.sig }) && !(await C.certificateOk(camp, { statement: { ...ae.statement, evidence: { ...inv, kind: 'photo' } }, sig: ae.sig })));
say(bad ? `core: ${bad} check(s) failed` : 'core: every check passed');
