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
export const fakeProofs = (c, refundPk, amounts) => amounts.map(a => ({ id: '00ad268c4d1f5826', amount: a, secret: JSON.stringify(['P2PK', { nonce: hex(crypto.getRandomValues(new Uint8Array(32))), data: c.streetcat, tags: [['pubkeys', c.clinic], ['n_sigs', '2'], ['locktime', String(c.deadline)], ['refund', refundPk]] }]) }));

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
// 3b) an answer that comes before this browser knows its request (StreetCat, 7 Nov: the app on his home screen got the clinic's answer
// before Import all brought the request, and lost it): kept for later, it comes once the request is there
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
await Promise.all(relays.map(r => r.close()));
say(bad ? `relay: ${bad} check(s) failed` : 'relay: every check passed');
process.exit(bad ? 1 : 0);
