// app/relay.js against real public Nostr relays. Needs only Node 22 or newer (its built-in WebSocket) and four files of app/
// (cashu-bundle.js, core.js, nostr-bundle.js, relay.js); no mint, no money, no npm packages: the keys are made up for this run and
// the "proofs" only carry a lock. Run it from the repository root:
//     node tests/relay_live_test.mjs
//     RELAYS=wss://relay.damus.io,wss://nos.lol node tests/relay_live_test.mjs     (to try other relays)
// It checks every relay alone (does it take a gift-wrapped event, and give it back?), then the whole round: Streetcat → clinic
// (request), clinic → Streetcat (receipt and answer). It passes if the round works and at least two relays carried it.
import fs from 'fs';
const APP = new URL('../app/', import.meta.url).pathname, t0 = Date.now(), say = (...a) => console.log(...a);
if (typeof WebSocket !== 'function') { say('This needs Node 22 or newer (built-in WebSocket). Node is', process.version); process.exit(2); }
for (const f of ['cashu-bundle.js', 'core.js', 'nostr-bundle.js', 'relay.js']) eval(fs.readFileSync(APP + f, 'utf8') + (f === 'cashu-bundle.js' ? ';globalThis.cashu = cashu;' : f === 'nostr-bundle.js' ? ';globalThis.nostrkit = nostrkit;' : ''));
const C = globalThis.scCore, R = globalThis.scRelay, relays = (process.env.RELAYS || '').split(',').map(s => s.trim()).filter(Boolean).length ? process.env.RELAYS.split(',').map(s => s.trim()).filter(Boolean) : R.RELAYS;
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey()), lc = s => String(s).toLowerCase(), secs = () => ((Date.now() - t0) / 1000).toFixed(1) + ' s';
const store = () => { const m = new Map(); return { get: k => m.get(k) ?? null, set: (k, v) => m.set(k, v) }; };
const fakeProofs = (c, refundPk, amounts) => amounts.map(a => ({ id: '00ad268c4d1f5826', amount: a, secret: JSON.stringify(['P2PK', { nonce: hex(crypto.getRandomValues(new Uint8Array(32))), data: c.streetcat, tags: [['pubkeys', c.clinic], ['n_sigs', '2'], ['locktime', String(c.deadline)], ['refund', refundPk]] }]) }));
const sc = newSk(), cl = newSk(), camp = { name: 'RELAYTEST', op: 'test only', mint: 'https://mint.example', streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline: Math.floor(Date.now() / 1000) + 3 * 86400 };
say('relays:', relays.join(' '), '\n');

// 1) every relay alone: a gift-wrapped test message, published and then asked for
say('Each relay alone:'); const alone = [];
for (const url of relays) { const one = newSk(), ev = await R.wrap({ t: 'streetcat.received', v: 1, id: 'R-0000000000', of: 'test', at: new Date().toISOString() }, one, C.pubOf(cl));
  const [p] = await R.publish(ev, [url], { timeout: 10000 }); let back = { ok: false, msg: 'not published' };
  if (p.ok) { await new Promise(r => setTimeout(r, 1500)); back = await R.fetchFrom(url, { ids: [ev.id] }, { timeout: 10000 }).then(evs => ({ ok: evs.some(e => e.id === ev.id), msg: evs.length ? '' : 'not given back' }), e => ({ ok: false, msg: e.message })); }
  alone.push({ url, ok: p.ok && back.ok }); say(`  ${p.ok && back.ok ? '✓' : '✗'} ${url} · takes it: ${p.ok ? 'yes' : 'no (' + p.msg + ')'} · gives it back: ${back.ok ? 'yes' : 'no' + (back.msg ? ' (' + back.msg + ')' : '')}`); }

// 2) the whole round, through all of them at once
say('\nThe round:'); const request = await C.makeRequest({ campaign: camp, patient: 'TEST CAT', procedure: 'test only, not a real procedure', date: new Date().toISOString().slice(0, 10), contributions: [{ release: 2100, proofs: fakeProofs(camp, C.pubOf(newSk()), [2048, 32, 16, 4]) }] });
const scBox = R.outbox(store()); await scBox.add(request, sc, camp.clinic, { relays }); const [sent] = await scBox.flush({ timeout: 10000 });
say(`  Streetcat sends the request: ${sent.state} · confirmed by ${sent.acked.length} of ${relays.length}`, sent.last.filter(r => !r.ok).map(r => `· ${r.url} said: ${r.msg}`).join(' '));
const wait = async (label, fn) => { for (let i = 0; i < 12; i++) { const r = await fn(); if (r) return r; await new Promise(x => setTimeout(x, 5000)); } say(`  ✗ ${label}: nothing after a minute`); return null; };
const seen = new Set(), clinicExpects = p => p && p.t === 'streetcat.request' && lc(p.campaign.clinic) === camp.clinic ? p.campaign.streetcat : null;
const got = await wait('the clinic receives it', async () => { const r = await R.receive([cl], { relays, seen, expect: clinicExpects, timeout: 10000 }); return r.messages.find(m => m.payload.id === request.id) || null; });
if (got) say(`  ✓ the clinic receives it (${secs()}) from ${got.relays.length} relay(s): ${got.relays.join(' ')}`);
let answered = null;
if (got) { const clBox = R.outbox(store()); await clBox.add(R.receiptFor(request), cl, camp.streetcat, { relays }); await clBox.add(await C.certify(request, cl), cl, camp.streetcat, { relays }); const res = await clBox.flush({ timeout: 10000 });
  say(`  the clinic answers: ${res.map(x => x.state + ' (' + x.acked.length + ' relays)').join(', ')}`);
  const scSeen = new Set(), scExpects = p => p && ['streetcat.answer', 'streetcat.received'].includes(p.t) && p.id === request.id ? camp.clinic : null, have = new Map();
  answered = await wait('Streetcat receives the answer', async () => { const r = await R.receive([sc], { relays, seen: scSeen, expect: scExpects, timeout: 10000 }); for (const m of r.messages) have.set(m.payload.t, m); return have.has('streetcat.answer') && have.has('streetcat.received') ? have : null; });
  if (answered) { const v = await C.checkAnswer(request, answered.get('streetcat.answer').payload); say(`  ${v.ok ? '✓' : '✗'} Streetcat receives the receipt and the answer (${secs()}): ${v.text}`); if (!v.ok) answered = null; } }
const carried = got ? got.relays.length : 0, good = alone.filter(x => x.ok).length;
say(`\n${got && answered && carried >= 2 ? 'RELAY LIVE TEST PASSED' : 'RELAY LIVE TEST FAILED'}: the round ${got && answered ? 'worked' : 'did not work'}; ${good} of ${relays.length} relays work alone; the request came through ${carried}. ${secs()}`);
say('Relays that failed alone should come out of the default list in app/relay.js (RELAYS).');
process.exit(got && answered && carried >= 2 ? 0 : 1);
