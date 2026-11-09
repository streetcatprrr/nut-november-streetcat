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

// 1b) how a donation is cut when it is locked (8 Nov, review point 3): no proof over a tenth of it, about a dozen proofs
for (const [a, max, n] of [[21, 2, 11], [100, 8, 13], [1000, 64, 17], [21000, 2048, 12], [1000000, 65536, 18]]) { const s = C.donationSplit(a);
  check(`a donation of ${a} sat is cut into ${n} proofs, none over ${max} (a tenth of it)`, s.length === n && Math.max(...s) === max && s.reduce((x, y) => x + y, 0) === a, `${s.length} proofs, max ${Math.max(...s)}`); }
check('with the mint\'s denominations: only those (a mint of 1, 10, 100)', (C.donationSplit(250, [1, 10, 100]) || []).join('+') === '10+10+10+10+10+10+10+10+10+10+10+10+10+10+10+10+10+10+10+10+10+10+10+10+10' && C.donationSplit(5, [10, 100]) === null);
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
// the cat as Streetcat caught it: up to three photos (face, sides) named by SHA-256; their parts go to the clinic's key, as a record's
const PH = [{ slot: 'face', sha256: 'a1'.repeat(32), bytes: 31000, w: 640, h: 480 }, { slot: 'left', sha256: 'b2'.repeat(32), bytes: 29000, w: 640, h: 427 }];
const qPh = { campaign: camp, patient: 'MOCHI', procedure: 'sterilisation (spay)', date: '2026-11-04', contributions: [{ release: total(B.proofs), proofs: B.proofs }] }, qp = await C.makeRequest({ ...qPh, photos: PH });
check('a request can name the cat\'s photos as caught (face and sides), and is valid; it packs the same', !C.requestProblems(qp).length && qp.photos.length === 2 && C.canon(await C.unpack(await C.linkFor('https://example.org/clinic', qp))) === C.canon(qp), C.requestProblems(qp).join('; ') || `link ${(await C.linkFor('https://example.org/clinic', qp)).length} chars`);
check('…and a request without photos is as before, with no field for them', !('photos' in q) && !('photos' in await C.makeRequest({ ...qPh, photos: [] })));
const badPh = [[...PH, { slot: 'right', sha256: 'c3'.repeat(32), bytes: 1, w: 1, h: 1 }, { slot: 'nose', sha256: 'd4'.repeat(32), bytes: 1, w: 1, h: 1 }], [PH[0], { ...PH[1], slot: 'face' }], [{ ...PH[0], sha256: 'xyz' }], [{ ...PH[0], bytes: 70000 }]];
let refusedPh = 0; for (const ps of badPh) { try { await C.makeRequest({ ...qPh, photos: ps }); } catch (e) { if (/photos/.test(e.message)) refusedPh++; } }
check('…four photos, a slot twice, a bad SHA-256 or a photo too big is not made', refusedPh === 4, `${refusedPh} of 4 refused`);
check('…and a request that arrives with such photos, or an empty list, is flagged', [...badPh, []].every(ps => C.requestProblems({ ...qp, photos: ps }).some(x => /photos/.test(x))));
const b64p = Buffer.from(new Uint8Array(37000).map((_, i) => (i * 7) & 255)).toString('base64'), rparts = C.reqPhotoParts(qp.id, 'face', PH[0].sha256, b64p, camp.streetcat, camp.clinic);
check('a request\'s photo goes in parts of at most 26 000 characters that rebuild it, each naming the clinic\'s key', rparts.length === 2 && rparts.every(p => p.data.length <= C.CAT_CHUNK && C.reqPartOk(p) && p.clinic === clPk && p.from === scPk && p.id === qp.id) && rparts.map(p => p.data).join('') === b64p, rparts.map(p => p.data.length).join(' + '));
check('…and a part that is not one is refused', [{ ...rparts[0], kind: 'face.1' }, { ...rparts[0], id: 'CAT-0123456789' }, { ...rparts[0], slot: 'nose', kind: 'nose.0' }, { ...rparts[0], data: '<script>' }, { ...rparts[0], clinic: 'x' }, { ...rparts[0], part: 2 }, { ...rparts[0], t: 'streetcat.cat-photo' }].every(p => !C.reqPartOk(p)));

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
// what a pot pays for, its colony and its partner (7 Nov): signed when there, optional, and the campaign's id is the same with or without
const pot = await C.signCampaign({ ...camp, name: 'COMIDA MARINA', op: 'food', type: 'food', colony: ' colony   Marina ', partner: 'Pienso Sur', pkind: 'shop', hue: 85 }, sc);
check('a pot names what it pays for, its colony and its partner, and its signature covers them', await C.campaignSig(pot) === 'signed' && pot.type === 'food' && pot.colony === 'colony Marina' && pot.partner === 'Pienso Sur' && pot.pkind === 'shop');
const potChanged = await Promise.all([['type', 'vet'], ['colony', 'colony Playa'], ['partner', 'Pienso Norte'], ['pkind', 'clinic']].map(async ([k, v]) => [k, await C.campaignSig({ ...pot, [k]: v })]));
check('…changing any of them breaks it, and so does taking one away', potChanged.every(([, st]) => st === 'broken') && await C.campaignSig({ ...pot, partner: undefined }) === 'broken', potChanged.map(([k, st]) => k + ':' + st).join(' '));
check('…a kind or a partner it does not know is not kept (nor signed)', !('type' in C.campaignOf({ ...camp, type: 'toys' })) && !('pkind' in C.campaignOf({ ...camp, pkind: 'bank' })) && C.TYPES.join() === 'sterilisation,vet,food,other' && C.PKINDS.join() === 'clinic,shop,other');
check('…and they do not change the campaign\'s id (its ledger, its certificates)', await C.campaignId(pot) === await C.campaignId({ ...pot, type: undefined, colony: undefined, partner: undefined, pkind: undefined }));
check('a campaign made before, without them, signs and checks as it did', JSON.stringify(Object.keys(C.campSigned(signed)).sort()) === JSON.stringify(['clinic', 'deadline', 'hue', 'mint', 'name', 'op', 'streetcat', 'to']));
// a key is a point of the curve, not only 66 hex characters: about half of those are not one, and ecash locked to one could only be refunded
let offCurve = ''; for (let i = 1; !offCurve; i++) { const k = '02' + i.toString(16).padStart(64, '0'); try { cashu.pointFromHex(k); } catch (_) { offCurve = k; } }
let offErr = ''; try { C.campaignOf({ ...camp, clinic: offCurve }); } catch (e) { offErr = e.message; }
check('a partner key of 66 hex characters that is not a point of the curve is no key: the campaign is refused', C.pointOk(clPk) && C.pointOk(scPk.toUpperCase()) && !C.pointOk(offCurve) && !C.pointOk('02abc') && offErr === 'the campaign is incomplete', offCurve.slice(0, 12) + '… · ' + offErr);

// 11) the vet's invoice behind a declaration: only its SHA-256, signed with the rest; changed afterwards, the answer no longer checks out
const inv = { sha256: await C.sha256hex('%PDF-1.4 invoice 2026-118'), kind: 'invoice' }, ae = await C.certify(q, cl, undefined, inv), ve = await C.checkAnswer(q, ae);
check('a declaration can carry the invoice\'s fingerprint, and the answer still checks out', ve.ok && ae.statement.evidence.sha256 === inv.sha256 && Object.keys(ae.statement.evidence).sort().join() === 'kind,sha256');
check('…changed afterwards (another fingerprint, or none), it does not', !(await C.checkAnswer(q, { ...ae, statement: { ...ae.statement, evidence: { ...inv, sha256: 'f'.repeat(64) } } })).ok && !(await C.checkAnswer(q, { ...ae, statement: { ...ae.statement, evidence: undefined } })).ok);
let badEv = ''; try { await C.certify(q, cl, undefined, { sha256: 'abc', kind: 'invoice' }); } catch (e) { badEv = e.message; } check('…and a fingerprint that is not a SHA-256 of an invoice or a photo is refused', /not a SHA-256/.test(badEv));
check('…and its published declaration checks out with it', await C.certificateOk(camp, { statement: ae.statement, sig: ae.sig }) && !(await C.certificateOk(camp, { statement: { ...ae.statement, evidence: { ...inv, kind: 'photo' } }, sig: ae.sig })));
// a shop's confirmation names its photos (7 Nov: the delivery note and the goods): signed with the rest; changed afterwards, not certified
const phN = { slot: 'note', sha256: 'a'.repeat(64), bytes: 41000, w: 640, h: 480 }, phG = { slot: 'goods', sha256: 'b'.repeat(64), bytes: 52000, w: 640, h: 480 };
const ap = await C.certify(q, cl, undefined, null, [phN, phG]), vp = await C.checkAnswer(q, ap);
check('a partner\'s confirmation can name its photos (the delivery note and the goods), and it checks out', vp.ok && ap.statement.photos.map(p => p.slot).join() === 'note,goods' && await C.certificateOk(camp, { statement: ap.statement, sig: ap.sig }), vp.text);
const phChanged = await Promise.all([[phG, phN], [phN], [phN, { ...phG, sha256: 'c'.repeat(64) }], [{ ...phN, bytes: 41001 }, phG]].map(ps => C.checkAnswer(q, { ...ap, statement: { ...ap.statement, photos: ps } }))), phGone = await C.checkAnswer(q, { ...ap, statement: (({ photos, ...st }) => st)(ap.statement) });
check('…swapped, one taken away, one changed or its size changed afterwards: not certified', phChanged.every(v => !v.ok) && !phGone.ok, phChanged.map(v => v.statement).join(' ') + ' · ' + phGone.statement);
let notDelivery = ''; try { await C.certify(q, cl, undefined, null, [{ ...phN, slot: 'face' }]); } catch (e) { notDelivery = e.message; }
check('…photos that are not of a delivery (another slot) are refused', notDelivery === 'the photos of the delivery are not valid', notDelivery);
const parts = C.ansPhotoParts(q.id, 'note', phN.sha256, 'QUJD'.repeat(10000), clPk, scPk);
check('…they travel in parts, each one checked: for this request, this slot, from the partner to Streetcat', parts.length === 2 && parts.every(C.ansPartOk) && !C.ansPartOk({ ...parts[0], slot: 'face' }) && !C.ansPartOk({ ...parts[0], to: 'x' }) && !C.ansPartOk({ ...parts[0], kind: 'note.1' }) && C.ANS_SLOTS.join() === 'note,goods');
check('…and a clinic\'s confirmation without photos is as before', !('photos' in a.statement) && (await C.checkAnswer(q, a)).ok);
// DEADLINES (plan step 1): a day with no hour, in Madrid; the hour changes; the four levels against the proofs' own locks; amounts;
// a leftover of a partial release; two pots one second apart
const iso = t => new Date(t * 1000).toISOString(), refused = f => { try { f(); return false; } catch (_) { return true; } };
check('a day with no hour ends at the end of that day in Madrid: 23:59:59 CET in winter', iso(C.madridEnd('2026-11-13')) === '2026-11-13T22:59:59.000Z', iso(C.madridEnd('2026-11-13')));
check('…and CEST in summer', iso(C.madridEnd('2027-07-13')) === '2027-07-13T21:59:59.000Z');
check('…the March change: a day of 23 hours, and days are added on the calendar there, not as 24 hours', C.madridEnd('2027-03-28') + 1 - C.madridStart('2027-03-28') === 23 * 3600 && iso(C.timing({ day: '2027-03-27', confirmDays: 1, marginDays: 2 }).required) === '2027-03-30T21:59:59.000Z');
check('…the October change: a day of 25 hours', C.madridEnd('2026-10-25') + 1 - C.madridStart('2026-10-25') === 25 * 3600 && iso(C.timing({ day: '2026-10-24', confirmDays: 1, marginDays: 0 }).required) === '2026-10-25T22:59:59.000Z');
check('…a date that is not one is refused', !C.dayOk('2026-02-29') && !C.dayOk('13/11/2026') && refused(() => C.timing({ day: '2026-02-30' })));
const T = Number(camp.deadline), Ap = A.proofs.map(p => ({ ...p, ref: 'DON-A' })), at = (d, o = {}) => C.timing({ day: C.madridDay(T + d * 86400), confirmDays: 1, marginDays: 2, proofs: Ap, ...o });
check('levels, from each proof\'s own lock: refunds open after the required date', at(-5).level === 'ok' && at(-5).earliest === T, JSON.stringify(at(-5).amounts));
check('…after the work, before the required date (the partner must confirm quickly)', at(-1).level === 'soon');
check('…before the work is done (also on the work\'s own day)', at(1).level === 'before' && at(0).level === 'before');
check('…and open already', at(-5, { now: T + 1 }).level === 'past');
check('…with the amount and the donations at that level', at(-1).amounts.soon === total(A.proofs) && at(-1).refs.soon.join() === 'DON-A' && !at(-1).amounts.ok);
check('the days to confirm and the margin move the required date', at(-5, { marginDays: 6 }).level === 'soon' && at(-2, { confirmDays: 0, marginDays: 0 }).level === 'ok');
check('a proof with no refund date in its lock is counted apart', C.timing({ day: C.madridDay(T), proofs: [{ secret: 'plain', amount: 8 }] }).nolock === 1);
const lt = C.lockOf(restProofs[0].secret);
check('a leftover of a partial release keeps the lock, so the same deadline and the same level', lt && lt.locktime === T && C.timing({ day: C.madridDay(T - 86400), proofs: restProofs }).level === 'soon');
const later = Ap.map(p => ({ ...p, secret: p.secret.replace(`"locktime","${T}"`, `"locktime","${T + 1}"`) }));
check('two pots of one partner, deadlines one second apart: the same level on every day', later[0].secret !== Ap[0].secret && [-5, -1, 0, 1].every(d => at(d).level === C.timing({ day: C.madridDay(T + d * 86400), proofs: later }).level));
// a Lightning invoice's own expiry, from the invoice (BOLT 11), and a damaged one gives none
const iq = await w.createMintQuoteBolt11(21), ie = C.invoiceExpiry(iq.request);
check('an invoice\'s own expiry is read from it: its timestamp plus its x field', !!ie && ie.expires === Number(iq.expiry), `${ie && ie.expires} · the mint's quote ${iq.expiry}`);
check('…and a damaged invoice gives none', C.invoiceExpiry(iq.request.slice(0, -1) + (iq.request.endsWith('q') ? 'p' : 'q')) === null && C.invoiceExpiry('cashuB…') === null);
say(bad ? `core: ${bad} check(s) failed` : 'core: every check passed');
