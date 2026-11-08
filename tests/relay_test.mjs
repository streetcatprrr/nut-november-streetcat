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

// 7) what the outbox keeps (StreetCat, 8 Nov, 04:51: donations paid and sent never reached the campaign). It kept every event it ever
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

// 8) relays slow to confirm (StreetCat, 8 Nov, 18:00: «Segunda vez que me pasa esto. Creo campaña y no funciona»): nostr.mom confirmed half a
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
await Promise.all([late8, keep8, mute8, no8, k10].map(r => r.close()));
await Promise.all(relays.map(r => r.close()));
say(bad ? `relay: ${bad} check(s) failed` : 'relay: every check passed');
process.exit(bad ? 1 : 0);
