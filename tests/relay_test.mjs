// app/relay.js against three local test relays (tests/nostr_relay.mjs; one of them refuses every event), in Node 22: Streetcat sends
// a request, the clinic receives it once, answers, and Streetcat gets the receipt and the answer; forged senders, messages for someone
// else and repeats are dropped; with every relay down the message waits in the outbox and goes out when they come back; and nothing
// readable reaches a relay. No mint needed: the proofs are built here (they only have to carry the campaign's lock).
import fs from 'fs';
import { startRelay, loadKit } from './nostr_relay.mjs';
const APP = new URL('../app/', import.meta.url).pathname;
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8')); loadKit(); eval(fs.readFileSync(APP + 'relay.js', 'utf8'));
const C = globalThis.scCore, R = globalThis.scRelay, say = (...a) => console.log(...a);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey()), lc = s => String(s).toLowerCase();
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const store = () => { const m = new Map(); return { get: k => m.get(k) ?? null, set: (k, v) => m.set(k, v) }; };
// proofs that carry the campaign's lock, as the app's donations do (nothing at a mint backs them: this test never spends)
export const fakeProofs = (c, refundPk, amounts) => amounts.map(a => ({ id: '00ad268c4d1f5826', amount: a, secret: JSON.stringify(['P2PK', { nonce: hex(crypto.getRandomValues(new Uint8Array(32))), data: c.streetcat, tags: [['pubkeys', c.clinic], ['n_sigs', '2'], ['locktime', String(c.deadline)], ['refund', refundPk]] }]), C: C.pubOf(newSk()), dleq: { e: hex(crypto.getRandomValues(new Uint8Array(32))), s: hex(crypto.getRandomValues(new Uint8Array(32))), r: hex(crypto.getRandomValues(new Uint8Array(32))) } }));  /* the shape of a mint's signature and its DLEQ proof, as every request now carries (A04); never checked against a mint here */

const sc = newSk(), cl = newSk(), camp = { name: 'MOCHI', op: 'sterilisation', mint: 'https://mint.example', streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline: Math.floor(Date.now() / 1000) + 30 * 86400 };
const P = [7101, 7102, 7103]; let relays = [startRelay({ port: P[0] }), startRelay({ port: P[1] }), startRelay({ port: P[2], refuse: true })]; await Promise.all(relays.map(r => r.ready));
const urls = relays.map(r => r.url);
const q = await C.makeRequest({ campaign: camp, patient: 'MOCHI', procedure: 'sterilisation (spay)', date: '2026-11-04', contributions: [{ release: 2100, proofs: fakeProofs(camp, C.pubOf(newSk()), [2048, 32, 16, 4]) }, { release: 1500, proofs: fakeProofs(camp, C.pubOf(newSk()), [1024, 512, 256]) }] });
// who may send what: the clinic takes requests from its campaigns' Streetcat key; Streetcat takes answers and receipts for its requests from the clinic
const clinicExpects = p => p && p.t === 'streetcat.request' && lc(p.campaign.clinic) === camp.clinic ? p.campaign.streetcat : null;
const requests = new Map([[q.id, q]]), scExpects = p => p && ['streetcat.answer', 'streetcat.received'].includes(p.t) && requests.has(p.id) ? requests.get(p.id).campaign.clinic : null;

// 1) Streetcat sends the request
const scBox = R.outbox(store()), item = await scBox.add(q, sc, camp.clinic, { relays: urls, label: 'request ' + q.id }); const [sent] = await scBox.flush();
check('sent: two relays confirm it, the third refuses it', sent.state === 'sent' && sent.acked.length === 2, sent.last.map(r => `${r.url.slice(-4)} ${r.ok ? 'OK' : 'refused (' + r.msg + ')'}`).join(' · '));
say('  the wrapped request is', JSON.stringify(item.ev).length, 'bytes; the packed request', (await C.pack(q)).length, 'chars');

// 2) the clinic receives it once, though two relays have it
const seenC = new Set(), got = await R.receive([cl], { relays: urls, seen: seenC, expect: clinicExpects });
check('the clinic receives the request once', got.messages.length === 1 && C.canon(got.messages[0].payload) === C.canon(q), `from ${got.messages[0] && got.messages[0].relays.length} relays`);
check('and the relay that refused it simply had nothing', got.relays.every(r => r.ok), got.relays.map(r => `${r.url.slice(-4)}: ${r.events}`).join(' · '));
const again = await R.receive([cl], { relays: urls, seen: seenC, expect: clinicExpects }); check('asked again, nothing new', again.messages.length === 0);

// 3) the clinic sends a receipt and its answer; Streetcat gets both
const clBox = R.outbox(store()); await clBox.add(R.receiptFor(q), cl, camp.streetcat, { relays: urls }); await clBox.add(await C.certify(q, cl), cl, camp.streetcat, { relays: urls }); await clBox.flush();
const back = await R.receive([sc], { relays: urls, expect: scExpects }), ans = back.messages.find(m => m.payload.t === 'streetcat.answer');
check('Streetcat gets the receipt and the answer', back.messages.length === 2 && back.messages.some(m => m.payload.t === 'streetcat.received'), back.messages.map(m => m.payload.t).join(', '));
check('and the answer is certified', ans && (await C.checkAnswer(q, ans.payload)).ok, ans && (await C.checkAnswer(q, ans.payload)).text);
// 3b) an answer that comes before this browser knows its request: kept for later, it comes once the request is there
const later = new Map(), laterExpects = p => p && ['streetcat.answer', 'streetcat.received'].includes(p.t) && later.has(p.id) ? later.get(p.id).campaign.clinic : null, seenL = new Set();
const before = await R.receive([sc], { relays: urls, seen: seenL, expect: laterExpects }); later.set(q.id, q); const after = await R.receive([sc], { relays: urls, seen: seenL, expect: laterExpects });
check('an answer that comes before its request is known here is not dropped: it comes once the request is there', before.messages.length === 0 && after.messages.length === 2 && after.messages.some(m => m.payload.t === 'streetcat.answer'), `${before.messages.length}, then ${after.messages.length}`);
check('…and only once', (await R.receive([sc], { relays: urls, seen: seenL, expect: laterExpects })).messages.length === 0);

// 4) forged senders and messages for someone else are dropped
const thief = newSk(), fake = await C.makeRequest({ campaign: camp, patient: 'MOCHI', procedure: 'sterilisation', date: '2026-11-04', contributions: [{ release: 64, proofs: fakeProofs(camp, C.pubOf(newSk()), [64]) }] });
const tBox = R.outbox(store()); await tBox.add(fake, thief, camp.clinic, { relays: urls }); await tBox.add(await C.certify(q, cl).then(a => ({ ...a })), thief, camp.streetcat, { relays: urls });
const other = { ...camp, clinic: C.pubOf(newSk()) }; await tBox.add(await C.makeRequest({ campaign: other, patient: 'TEO', procedure: 'sterilisation', date: '2026-11-05', contributions: [{ release: 8, proofs: fakeProofs(other, C.pubOf(newSk()), [8]) }] }), sc, other.clinic, { relays: urls }); await tBox.flush();
check('a request from a key that is not the campaign\'s Streetcat key is dropped', (await R.receive([cl], { relays: urls, seen: seenC, expect: clinicExpects })).messages.length === 0);
check('an answer from a key that is not the campaign\'s clinic key is dropped', (await R.receive([sc], { relays: urls, seen: new Set(back.messages.map(m => m.wrap)), expect: scExpects })).messages.length === 0);

// 5) every relay down: the message waits in the outbox, and goes out when they are back
await Promise.all(relays.map(r => r.close()));
const q2 = await C.makeRequest({ campaign: camp, patient: 'NUBE', procedure: 'sterilisation (neuter)', date: '2026-11-05', contributions: [{ release: 21, proofs: fakeProofs(camp, C.pubOf(newSk()), [16, 4, 1]) }] });
await scBox.add(q2, sc, camp.clinic, { relays: urls }); const [down] = (await scBox.flush()).filter(x => x.ref === q2.id);
check('relays down: nothing confirmed, it stays in the outbox', down.state === 'sending' && down.acked.length === 0, down.last.map(r => `${r.url.slice(-4)} ${r.msg}`).join(' · '));
relays = [startRelay({ port: P[0] }), startRelay({ port: P[1] }), startRelay({ port: P[2], refuse: true })]; await Promise.all(relays.map(r => r.ready));
const [up] = (await scBox.flush({ force: true })).filter(x => x.ref === q2.id);
check('relays back: it goes out', up.state === 'sent' && up.acked.length === 2, `after ${up.tries} tries`);
check('and the clinic receives it', (await R.receive([cl], { relays: urls, seen: seenC, expect: clinicExpects })).messages.some(m => m.payload.id === q2.id));

// 6) what a relay can read
const stored = JSON.stringify(relays.flatMap(r => r.events)), scMsg = await R.pubOf(camp.streetcat);
check('a relay sees no content: no cat, no campaign, no spending key, no proof', !/NUBE|MOCHI|P2PK|sterilis/.test(stored) && !stored.includes(camp.streetcat.slice(2)) && !stored.includes(camp.clinic.slice(2)));
check('nor who sent it: each wrap is signed by a throwaway key', relays[0].events.every(e => e.pubkey !== scMsg && e.kind === 1059));
const dead = await R.publish(item.ev, ['ws://127.0.0.1:7199'], { timeout: 3000 }); check('a relay that is not there fails fast', !dead[0].ok, dead[0].msg);

// 7) what the outbox keeps. It kept every event it ever
// sent, photos too, until the phone had no room left for anything; now it keeps a message's copy only while it waits
const st7 = store(), box7 = R.outbox(st7), saved7 = () => JSON.parse(st7.get('vetlock.outbox'));
const a7 = await box7.add(q, sc, camp.clinic, { relays: urls }); const kept7 = saved7().find(x => x.id === a7.id);
check('a message waiting keeps its copy, to send it', kept7.state === 'sending' && kept7.ev && kept7.ev.id === a7.id);
await box7.flush({ force: true }); const sent7 = saved7().find(x => x.id === a7.id);
check('once sent, the outbox keeps how it went, not the copy', sent7.state === 'sent' && !('ev' in sent7) && sent7.acked.length === 2 && JSON.stringify(sent7).length < 1500, `${JSON.stringify(sent7).length} chars kept, the copy was ${JSON.stringify(a7.ev).length}`);
st7.set('vetlock.outbox', JSON.stringify([...Array.from({ length: 350 }, (_, i) => ({ id: 'old' + i, ev: { id: 'old' + i, content: 'x'.repeat(2000) }, relays: urls, acked: urls.slice(0, 2), state: 'sent', created: i })), ...saved7()]));
const b7 = await box7.add(q2, sc, camp.clinic, { relays: urls }), after7 = saved7(), done7 = after7.filter(x => x.state !== 'sending');
check('an outbox from before is cut down at the next save: copies of what was sent are dropped, and only the last 300 are kept', done7.length === 300 && done7.every(x => !('ev' in x)) && !after7.some(x => x.id === 'old0') && after7.some(x => x.id === b7.id && x.ev), `${after7.length} kept, ${JSON.stringify(after7).length} chars`);
let refused7 = ''; try { await R.outbox({ get: () => null, set: () => false }).add(q, sc, camp.clinic, { relays: urls }); } catch (e) { refused7 = e.message; }
check('no room left on the phone: adding a message says so, it is not taken for sent', refused7 === R.NO_ROOM, refused7);
const slow = startRelay({ port: 7104, delay: 1500 }); await slow.ready; const st8 = store(), box8 = R.outbox(st8); await box8.add(q, sc, camp.clinic, { relays: [slow.url] });
const run8 = box8.flush({ force: true }); await new Promise(r => setTimeout(r, 300)); const c8 = await box8.add(q2, sc, camp.clinic, { relays: urls }); await run8;
check('a message added while the outbox is sending is kept (it was overwritten by the list read first)', JSON.parse(st8.get('vetlock.outbox')).some(x => x.id === c8.id && x.state === 'sending' && x.ev));
await slow.close();

// 8) relays slow to confirm: nostr.mom confirmed half a
// minute late and nos.lol never, and the app took a campaign donors could see for not announced. A relay that was sent it and gave no
// answer is asked whether it has it; one that answered no is believed; one that could not be reached was never sent it
const late8 = startRelay({ port: 7105, okDelay: 4000 }), keep8 = startRelay({ port: 7106, storeDelay: 3000 }), mute8 = startRelay({ port: 7107, mute: true }), no8 = startRelay({ port: 7108, refuse: true });
await Promise.all([late8, keep8, mute8, no8].map(r => r.ready)); const four = [late8, keep8, mute8, no8].map(r => r.url), by = (res, r) => res.find(x => x.url === r.url);
const e8 = await R.wrap(q, sc, camp.clinic), r8 = await R.publish(e8, four, { timeout: 1500 });
check('a relay that keeps it but confirms late counts as having it: asked by its id, it shows it', by(r8, late8).ok && by(r8, late8).late, JSON.stringify(by(r8, late8)));
check('…one that has not kept it yet, or never answers, does not count, and is marked as sent with no answer', !by(r8, keep8).ok && by(r8, keep8).silent && !by(r8, mute8).ok && by(r8, mute8).silent, `${by(r8, keep8).msg} · ${by(r8, mute8).msg}`);
check('…one that answered no is believed, with its reason', !by(r8, no8).ok && !by(r8, no8).silent && /^blocked/.test(by(r8, no8).msg), by(r8, no8).msg);
const dead8 = await R.publish(e8, ['ws://127.0.0.1:7198'], { timeout: 1500 }); check('…and one that could not be reached was never sent it', !dead8[0].ok && !dead8[0].silent, dead8[0].msg);
const e9 = await R.wrap(q2, sc, camp.clinic), states9 = []; const r9 = await R.publishChecked(e9, four, { timeout: 1500, later: [4500, 6500], onState: (res, done) => states9.push({ ok: res.filter(x => x.ok).length, done, keep: !!by(res, keep8).ok, mute: !!by(res, mute8).ok }) });
await new Promise(r => setTimeout(r, 7500));
check('asked again later (an announcement, a ledger): the relay that kept it late counts once it shows it; the mute one never does; the last answer says it is done', r9.filter(x => x.ok).length === 1 && states9.length === 3 && states9[0].ok === 1 && !states9[0].done && states9[1].keep && states9[1].ok === 2 && !states9[1].done && states9[2].done && states9[2].ok === 2 && !states9[2].mute, JSON.stringify(states9));
const k10 = startRelay({ port: 7109, storeDelay: 1200 }); await k10.ready; const st10 = store(), box10 = R.outbox(st10); await box10.add(q, sc, camp.clinic, { relays: [k10.url, mute8.url] }); const m10 = mute8.stats.received;
const [f10] = await box10.flush({ timeout: 800 }); await new Promise(r => setTimeout(r, 1500)); const [g10] = await box10.flush({ force: true, timeout: 800 });
check('the outbox: sent once and not confirmed, at the next try the relay is asked first, and not sent it again when it has it; the mute one is sent it again', f10.acked.length === 0 && g10.acked.includes(k10.url) && !g10.acked.includes(mute8.url) && k10.stats.received === 1 && mute8.stats.received - m10 === 2, `first ${f10.acked.length} acked · then ${g10.acked.length} · the late relay got it ${k10.stats.received} time(s), the mute one ${mute8.stats.received - m10}`);
// 11) HIGH-WATER MARKS (review of 9 Nov: every check read nine days from every relay, photos too, ~1.5–1.8 MB a minute on a phone):
// a relay that answered all it holds (EOSE) gets a mark per messaging key; the next read starts two days and ten minutes before it;
// one that does not answer in time, or whose pages do not end, gets none; a wrap not expected yet comes back as deferred, and a floor makes
// the next read start before it
const mk1 = startRelay({ port: 7121 }), mk2 = startRelay({ port: 7122, delay: 2500 }); await Promise.all([mk1.ready, mk2.ready]); const mku = [mk1.url, mk2.url];
const mkBox = R.outbox(store()), qm = await C.makeRequest({ campaign: camp, patient: 'MARKS', procedure: 'sterilisation', date: '2026-11-09', contributions: [{ release: 16, proofs: fakeProofs(camp, C.pubOf(newSk()), [16]) }] });
await mkBox.add(qm, sc, camp.clinic, { relays: mku }); await mkBox.flush({ timeout: 6000 });
const clPub = await R.pubOf(camp.clinic), t0m = Math.floor(Date.now() / 1000);
const m1 = await R.receive([cl], { relays: mku, seen: new Set(), expect: clinicExpects, timeout: 1500, marks: {} }), mark = ((m1.marks || {})[mk1.url] || {})[clPub];
check('a first read takes the request and marks the relay that answered in full; the one that did not answer in time gets no mark', m1.messages.some(m => m.payload.id === qm.id) && Math.abs(mark - t0m) <= 2 && !(m1.marks || {})[mk2.url], JSON.stringify(Object.keys(m1.marks || {}).map(u => u.slice(-4))));
const firstSince = mk1.stats.reqs.at(-1)[0].since; check('…it read nine days back (seven, and the two a wrap may be dated back)', Math.abs(firstSince - (t0m - 9 * 86400)) <= 2, `${((t0m - firstSince) / 86400).toFixed(2)} days`);
await R.receive([cl], { relays: [mk1.url], seen: new Set(), expect: clinicExpects, marks: m1.marks }); const nextSince = mk1.stats.reqs.at(-1)[0].since;
check('the next read starts two days and ten minutes before the mark, not nine days back', nextSince === mark - 2 * 86400 - 600, `${((t0m - nextSince) / 86400).toFixed(3)} days back`);
const fl = t0m - 4 * 86400; await R.receive([cl], { relays: [mk1.url], seen: new Set(), expect: clinicExpects, marks: m1.marks, floor: fl });
check('a floor (a wrap still to be taken) makes it start before that wrap', mk1.stats.reqs.at(-1)[0].since === fl - 600);
const d1 = await R.receive([cl], { relays: [mk1.url], seen: new Set(), expect: () => null, marks: m1.marks });
check('a wrap not expected yet (its campaign or request not here) comes back as deferred, with its date', d1.deferred.length === 1 && Math.abs(d1.deferred[0].created - t0m) <= 2 * 86400 + 5 && !d1.messages.length, JSON.stringify(d1.deferred.map(x => x.created - t0m)));
// …three times in a session, and then it is left alone (adversarial run of 11 Nov: every opening is a decryption, and a flood of wraps
// to a key made every check slower for as long as the relays kept them), until something new is here that it may belong to (retry())
const dn = []; for (let i = 0; i < 3; i++) dn.push((await R.receive([cl], { relays: [mk1.url], seen: new Set(), expect: () => null, marks: m1.marks })).deferred.length); R.retry();
const dr = (await R.receive([cl], { relays: [mk1.url], seen: new Set(), expect: () => null, marks: m1.marks })).deferred.length; R.retry();
check('a wrap not expected three times is not opened a fourth; after retry() it is tried again', dn.join() === '1,1,0' && dr === 1, `${dn.join()} · then ${dr}`);
// a relay that holds more than the limit (audit of 10 Nov: a flood of wraps to a key must not bury a real message): the older ones are
// asked for page by page, every message comes, and the mark moves once the pages end
const flood = []; for (let i = 0; i < 7; i++) { const q = await C.makeRequest({ campaign: camp, patient: 'FLOOD' + i, procedure: 'sterilisation', date: '2026-11-09', contributions: [{ release: 16, proofs: fakeProofs(camp, C.pubOf(newSk()), [16]) }] }); flood.push(q); await mkBox.add(q, sc, camp.clinic, { relays: [mk1.url] }); }
await mkBox.flush({ timeout: 6000 }); const reqs0 = mk1.stats.reqs.length;
const lim = await R.receive([cl], { relays: [mk1.url], seen: new Set(), expect: clinicExpects, marks: {}, limit: 3 }), gotAll = [qm, ...flood].filter(q => lim.messages.some(m => m.payload.id === q.id)).length;
check('a relay that holds more than the limit is read page by page: every message comes, and the mark moves', gotAll === 8 && !!((lim.marks || {})[mk1.url] || {})[clPub] && mk1.stats.reqs.length - reqs0 >= 3, `${gotAll} of 8 · ${mk1.stats.reqs.length - reqs0} questions`);
await Promise.all([mk1, mk2].map(r => r.close()));

await Promise.all([late8, keep8, mute8, no8, k10].map(r => r.close()));
// 12) A BAD COPY DOES NOT HIDE THE GOOD ONE (Daybreak, 14 Nov). One relay serves the request's wrap with another body under the same id
// (a relay that changes what it keeps, or breaks it); the other relay has it as it was sent. The bad copy came first and was the one
// kept, then dropped when checked: the message never came. Now the good copy comes, once, from the relay that has it as sent; the same
// for a wallet's payment (receivePayments).
{ const bad12 = startRelay({ port: 7121 }), good12 = startRelay({ port: 7122 }); await Promise.all([bad12.ready, good12.ready]); const u12 = [bad12.url, good12.url];
  const q12 = await C.makeRequest({ campaign: camp, patient: 'NUBE', procedure: 'vaccine', date: '2026-11-04', contributions: [{ release: 64, proofs: fakeProofs(camp, C.pubOf(newSk()), [64]) }] });
  const box12 = R.outbox(store()); await box12.add(q12, sc, camp.clinic, { relays: u12 }); await box12.flush();
  const spoil = r => { for (let i = 0; i < r.events.length; i++) r.events[i] = { ...r.events[i], content: r.events[i].content.slice(0, -8) + 'AAAAAAA=' }; };
  spoil(bad12); const got12 = await R.receive([cl], { relays: u12, expect: clinicExpects });
  check('a relay that gives a bad copy of a message does not hide the good copy another relay gives: it comes once, from that relay', got12.messages.length === 1 && got12.messages[0].payload.id === q12.id && JSON.stringify(got12.messages[0].relays) === JSON.stringify([good12.url]), got12.messages.map(m => m.payload.id + ' from ' + m.relays.map(u => u.slice(-4)).join('+')).join(', ') || 'nothing');
  const kit = loadKit(), wsk = newSk(), to = kit.getPublicKey(Uint8Array.from(wsk.match(/../g), x => parseInt(x, 16)));
  const pay12 = kit.wrapEvent({ kind: 14, content: JSON.stringify({ id: 'r12', mint: camp.mint, unit: 'sat', proofs: fakeProofs(camp, C.pubOf(newSk()), [8]) }), tags: [['p', to]] }, kit.generateSecretKey(), to);
  await R.publish(pay12, u12); spoil(bad12); const p12 = await R.receivePayments(wsk, { relays: u12 });
  check('…and the same for a wallet\'s payment', p12.payments.length === 1 && p12.payments[0].payload.id === 'r12', `${p12.payments.length} payment(s)`);
  await Promise.all([bad12.close(), good12.close()]); }
// 13) RELAYS THAT CAP A WHOLE REQ, AND FLOODS LONGER THAN THE PAGES (Daybreak, 14 Nov). The test relay caps a REQ as a whole, not each
// of its filters, as some relays do: a flood of wraps to one key filled the answer, another key's message never came, and that key's
// mark moved past it. Each key is now asked in a REQ of its own. And a flood longer than the pages: a read stopped after them and the
// next began again at the newest, so a message under it never came; now each read goes on from where the last one stopped.
{ const kit = loadKit(), cl2 = newSk(), camp2 = { ...camp, name: 'NORTE', clinic: C.pubOf(cl2) }, both = p => p && p.t === 'streetcat.request' ? p.campaign.streetcat : null, t13 = Math.floor(Date.now() / 1000);
  const flood = async (r, pk, n, from) => { const to = await R.pubOf(pk); for (let i = 0; i < n; i++) r.events.push(kit.finalizeEvent({ kind: 1059, created_at: from + i, tags: [['p', to]], content: 'flood ' + i }, kit.generateSecretKey())); };  /* wraps anyone can send, newer than the message */
  const send = async (r, patient) => { const q = await C.makeRequest({ campaign: camp2, patient, procedure: 'sterilisation', date: '2026-11-14', contributions: [{ release: 16, proofs: fakeProofs(camp2, C.pubOf(newSk()), [16]) }] }), box = R.outbox(store()); await box.add(q, sc, camp2.clinic, { relays: [r.url] }); await box.flush(); return q; };
  const ra = startRelay({ port: 7123 }), rb = startRelay({ port: 7124 }); await Promise.all([ra.ready, rb.ready]);
  const qa = await send(ra, 'LUNA'); await flood(ra, camp.clinic, 60, t13 + 100);
  const ga = await R.receive([cl, cl2], { relays: [ra.url], expect: both, marks: {}, limit: 20 });
  check('a relay that caps a REQ as a whole: a flood of wraps to one key does not hide another key\'s message', ga.messages.some(m => m.payload.id === qa.id), `${ga.messages.length} message(s) · ${ra.stats.reqs.length} REQs`);
  const qb = await send(rb, 'KIRA'); await flood(rb, camp2.clinic, 100, t13 + 200); const pub2 = await R.pubOf(camp2.clinic);
  let marks = {}, got = false, reads = 0; for (; reads < 6 && !got;) { reads++; const res = await R.receive([cl2], { relays: [rb.url], expect: both, marks, limit: 3 }); got = res.messages.some(m => m.payload.id === qb.id); for (const [u, m] of Object.entries(res.marks || {})) marks[u] = { ...(marks[u] || {}), ...m }; }
  const mb = marks[rb.url] || {};
  check('a flood longer than the pages: each read goes on from where the last stopped, and the message under it comes a few reads later', got && reads > 1, `${got ? 'came' : 'never came'} · ${reads} read(s)`);
  check('…and once the walk reaches the end, the key\'s mark is set and where it stopped is cleared', !!mb[pub2] && !mb['<' + pub2] && !mb['^' + pub2], JSON.stringify(Object.fromEntries(Object.entries(mb).map(([k, v]) => [k.slice(0, 9), v]))));
  await Promise.all([ra.close(), rb.close()]); }
// 14) EQUAL DATES (Daybreak, 14 Nov; M03 of the first scan). A flood of wraps that all bear one second, newer than a message: the
// page asked for what is older came back the same, the walk stopped with no cursor, and the message under it never came, read after
// read. Now a full page that reaches no further back moves on to the second before. Three such seconds here, each over a page.
{ const kit = loadKit(), cl3 = newSk(), camp3 = { ...camp, name: 'SOL', clinic: C.pubOf(cl3) }, from3 = p => p && p.t === 'streetcat.request' ? p.campaign.streetcat : null;
  const rc = startRelay({ port: 7125 }); await rc.ready;
  const q3 = await C.makeRequest({ campaign: camp3, patient: 'SOL', procedure: 'sterilisation', date: '2026-11-14', contributions: [{ release: 16, proofs: fakeProofs(camp3, C.pubOf(newSk()), [16]) }] }), box3 = R.outbox(store());
  await box3.add(q3, sc, camp3.clinic, { relays: [rc.url] }); await box3.flush();
  const to3 = await R.pubOf(camp3.clinic), T = Math.floor(Date.now() / 1000) + 300;
  const tie = (n, at) => { for (let i = 0; i < n; i++) rc.events.push(kit.finalizeEvent({ kind: 1059, created_at: at, tags: [['p', to3]], content: 'tie ' + i }, kit.generateSecretKey())); };
  tie(12, T); tie(7, T - 50); tie(5, T - 51);
  let marks = {}, got = false, reads = 0; for (; reads < 4 && !got;) { reads++; const res = await R.receive([cl3], { relays: [rc.url], expect: from3, marks, limit: 3 }); got = res.messages.some(m => m.payload.id === q3.id); for (const [u, m] of Object.entries(res.marks || {})) marks[u] = { ...(marks[u] || {}), ...m }; }
  check('a flood of wraps that all bear one second does not stop the paging: the message under it comes', got, `${got ? 'came' : 'never came'} · ${reads} read(s) · ${rc.stats.reqs.length} REQs`);
  check('…and the walk reaches the end: the key\'s mark is set', !!(marks[rc.url] || {})[to3], JSON.stringify(Object.fromEntries(Object.entries(marks[rc.url] || {}).map(([k, v]) => [k.slice(0, 9), v]))));
  await rc.close(); }
// ---------- relays held to what was asked of them, and pages that may not be the last (six scans, 15 Nov, part 5) ----------
{ const K = globalThis.nostrkit, t = Math.floor(Date.now() / 1000), to = (await R.keysOf(cl)).pub, other = (await R.keysOf(newSk())).pub, junk = (tags, at, n) => K.finalizeEvent({ kind: 1059, created_at: at, tags, content: 'junk ' + n }, K.generateSecretKey());
  const put = async (url, evs) => { for (const e of evs) await R.publishTo(url, e, { timeout: 5000 }); }, gotQ = async (url, o = {}) => (await R.receive([cl], { relays: [url], seen: new Set(), expect: clinicExpects, timeout: 8000, ...o })).messages.some(m => m.payload.id === q.id);
  // 5.7 · a relay that sends all it holds, whatever limit it is asked for
  { const r = startRelay({ port: 7111, noLimit: true }); await r.ready; await put(r.url, Array.from({ length: 300 }, (_, i) => junk([['p', to]], t - i, i)));
    const got = await R.fetchFrom(r.url, { kinds: [1059], '#p': [to], limit: 100 }, { timeout: 8000 });
    check('a relay that sends 300 events to a query that asks for 100 is stopped at what was asked, and its answer is not taken for a whole one', got.length <= 120 && got.complete === false && got.over === true, `${got.length} kept · complete ${got.complete}`); await r.close(); }
  // 5.19 · a refusal's reason is kept short
  { const r = startRelay({ port: 7112, refuse: true, reason: 'blocked: ' + 'x'.repeat(50000) }); await r.ready; const [res] = await R.publish(junk([['p', to]], t, 0), [r.url], { timeout: 5000 });
    check('a relay\'s reason for refusing is kept in a few words, however long it is', res.ok === false && res.msg.length === 200, `${res.msg.length} characters of 50 009`); await r.close(); }
  // 5.14 · one flush at a time
  { const r = startRelay({ port: 7113, okDelay: 300 }); await r.ready; const box = R.outbox(store()); await box.add(q, sc, camp.clinic, { relays: [r.url], label: 'twice' }); const [a1, a2] = await Promise.all([box.flush(), box.flush()]);
    check('two flushes of the outbox at once: the second waits for the first, and what was sent is sent once', r.stats.received === 1 && a1.length === 1 && a2.length === 0 && box.list()[0].state === 'sent', `${r.stats.received} sent · ${a1.length} + ${a2.length} changed`); await r.close(); }
  // 5.2 · wraps that name another key first still count as this key's page
  { const r = startRelay({ port: 7114 }); await r.ready; const own = await R.wrap(q, sc, camp.clinic); own.created_at <= t || (own.created_at = t);
    await put(r.url, [own, ...Array.from({ length: 10 }, (_, i) => junk([['p', other], ['p', to]], t + 100 + i, i))]);
    check('ten wraps that name another key before this one do not hide the message under them: they count as this key\'s page, and the walk goes on', await gotQ(r.url, { limit: 10 }), `${r.stats.reqs.length} REQs`); await r.close(); }
  // 5.3 · a relay that sends fewer than it is asked for and holds more
  { const r = startRelay({ port: 7115, cap: 50 }); await r.ready; await put(r.url, [await R.wrap(q, sc, camp.clinic), ...Array.from({ length: 60 }, (_, i) => junk([['p', to]], t + 100 + i, i))]);
    check('a relay that sends 50 events to a query for 500, and holds more: what is older is asked for, and the message under them comes', await gotQ(r.url), `${r.stats.reqs.length} REQs`); await r.close(); }
  // 5.9 · the signed ledger, under events of other authors with the campaign's id
  { const r = startRelay({ port: 7116, cap: 5 }); await r.ready; C.STREETCAT_KEYS.push(camp.streetcat); const L = { v: 2, campaign: camp, clinicKeySource: '', donations: [], entries: [], certificates: [] }, ev = await R.ledgerEvent(L, sc), id = await C.campaignId(camp);
    await put(r.url, [ev, ...Array.from({ length: 8 }, (_, i) => K.finalizeEvent({ kind: R.LEDGER_KIND, created_at: ev.created_at + 100 + i, tags: [['d', id], ['t', 'streetcat-ledger']], content: '{}' }, K.generateSecretKey()))]);
    const res = await R.latestLedger(id, { relays: [r.url], timeout: 8000 }); C.STREETCAT_KEYS.pop();
    check('eight newer events of other authors under a campaign\'s id, on a relay that sends five: the ledger signed with Streetcat\'s ledger key is still found', !!res.found && res.found.ev.id === ev.id, res.found ? 'found' : `not found · ${res.ignored} ignored`); await r.close(); } }
await Promise.all(relays.map(r => r.close()));
say(bad ? `relay: ${bad} check(s) failed` : 'relay: every check passed');
process.exit(bad ? 1 : 0);
