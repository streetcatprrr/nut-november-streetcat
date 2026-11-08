// Requests, answers and receipts by relay (Nostr). Every message is encrypted end to end (NIP-44 v2) and gift-wrapped (NIP-59):
// a relay sees a throwaway sender, the recipient's messaging key, a time up to two days off, and a size; never the content.
// Both ends' messaging keys are derived from the campaign keys (core.js, TAG.messaging), so a campaign needs no new keys and the
// spending keys never sign a message. Inside, the sender is checked against the campaign: a request must come from the campaign's
// Streetcat key, an answer from its clinic key; anything else is ignored.
// A message goes to every relay at once. It counts as sent when one relay confirms it (OK), or, not confirmed, shows it when asked for
// it by its id, and is sent again, with growing pauses, until two have (or every relay has), or it is a day old. Receiving asks each relay for what is waiting, from shortly before the
// last time, and drops what was already seen. Links and files carry the same payload when there is no relay, or in person.
// The same relays carry the campaign's published ledger (kind 30078, below).
// Needs cashu-bundle.js, core.js and nostr-bundle.js. Runs in the browser and in Node 22 (its global WebSocket).
(function (root) {
'use strict';
const C = root.scCore, K = root.nostrkit; if (!C || !K) throw new Error('relay.js needs core.js and nostr-bundle.js first');
// the three that carried the live test from StreetCat's network (5 Nov 2026); damus and 0xchat could not be reached from there. On 8 Nov,
// from there, nos.lol took nothing new (no answer), relay.primal.net came and went, and nostr.mom confirmed some 20–30 s late; of
// eighteen relays tried that day, nostr.oxtr.dev and purplerelay.com took an announcement and a gift wrap in under 1.5 s and gave both
// back (by id, by tag, and a wrap by its recipient), so they joined. Left out: relays that refused one of the two kinds (relay.nos.social,
// offchain.pub) or would not give a wrap back to its recipient (relay.snort.social, relay.nostr.net).
const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom', 'wss://nostr.oxtr.dev', 'wss://purplerelay.com'];
const KIND = 14, WRAP = 1059, TWO_DAYS = 2 * 86400, MAX = 60000;  // NIP-44 v2 carries up to 65535 bytes
const unhex = s => Uint8Array.from(String(s).match(/../g) || [], h => parseInt(h, 16));
const now = () => Math.floor(Date.now() / 1000);

// the messaging keys: the derived key's x coordinate is the Nostr public key (BIP-340)
async function keysOf(sk){ const d = unhex(await C.derivedSk(C.TAG.messaging, sk)); return { sk: d, pub: K.getPublicKey(d) }; }
const pubOf = async pk => (await C.derivedPub(C.TAG.messaging, pk)).slice(2);

// one relay, one short visit: the socket opens, does one thing, closes (phones drop long connections anyway)
function visit(url, onOpen, { timeout = 8000 } = {}){ return new Promise((resolve, reject) => { let ws, done = false, t;
  const end = (err, v) => { if (done) return; done = true; clearTimeout(t); try { ws && ws.close(); } catch (_) {} err ? reject(err) : resolve(v); };
  try { ws = new root.WebSocket(url); } catch (e) { return reject(e); }
  t = setTimeout(() => end(new Error('no answer in ' + Math.round(timeout / 1000) + ' s')), timeout);
  ws.onerror = () => end(new Error('could not connect')); ws.onclose = () => end(new Error('closed'));
  ws.onopen = () => onOpen(ws, v => end(null, v), e => end(e)); }); }
// a failure says whether the event had been sent (`sent`): a relay that was sent it and did not answer may have taken it all the same
const publishTo = (url, ev, o) => { let sent = false; return visit(url, (ws, ok) => { ws.onmessage = m => { let x; try { x = JSON.parse(m.data); } catch (_) { return; } if (x[0] === 'OK' && x[1] === ev.id) ok({ url, ok: !!x[2], msg: String(x[3] || '') }); }; ws.send(JSON.stringify(['EVENT', ev])); sent = true; }, o)
  .catch(e => { throw Object.assign(e instanceof Error ? e : new Error(String(e)), { sent }); }); };
const fetchFrom = (url, filter, o) => visit(url, (ws, ok) => { const id = 'sc' + Math.random().toString(36).slice(2, 10), got = [];
  ws.onmessage = m => { let x; try { x = JSON.parse(m.data); } catch (_) { return; } if (x[0] === 'EVENT' && x[1] === id && x[2]) got.push(x[2]); if ((x[0] === 'EOSE' || x[0] === 'CLOSED') && x[1] === id) { try { ws.send(JSON.stringify(['CLOSE', id])); } catch (_) {} ok(got); } };
  ws.send(JSON.stringify(['REQ', id, filter])); }, o);

// a payload, wrapped for one recipient: the rumor carries it packed (core.js), the seal is signed with the sender's messaging key
async function wrap(payload, fromSk, toPk){ const from = await keysOf(fromSk), to = await pubOf(toPk), content = await C.pack(payload);
  if (content.length > MAX) throw new Error('too large for a relay message: send it as a file');
  return K.wrapEvent({ kind: KIND, content, tags: [['p', to]] }, from.sk, to); }
// does a relay have this event? Asked by its id: reading answers quickly even while a relay is slow to confirm what it is sent
const has = (url, id, o = {}) => fetchFrom(url, { ids: [id] }, { timeout: (o && o.timeout) || 8000 }).then(evs => evs.some(e => e && e.id === id), () => false);
const late = r => ({ url: r.url, ok: true, msg: '', late: true });
// One event to every relay at once. A relay that was sent it but gave no answer in time may have taken it all the same: on 8 Nov
// nostr.mom confirmed half a minute late and nos.lol never, and Rescue said "no relay took it" of campaigns donors could already see
// (StreetCat, 18:00: «Segunda vez que me pasa esto. Creo campaña y no funciona»; 18:22: «Si. Arréglalo»). So such a relay is asked
// whether it has the event before it counts as not taken (`late`). One that answered no (OK false, with its reason) is believed, and
// one that could not be reached was never sent it. `silent`: sent, and no answer yet.
async function publish(ev, relays = RELAYS, o){
  const res = await Promise.all(relays.map(u => publishTo(u, ev, o).catch(e => ({ url: u, ok: false, msg: String((e && e.message) || e), silent: !!(e && e.sent) }))));
  return Promise.all(res.map(async r => r.silent && await has(r.url, ev.id, o) ? late(r) : r)); }
// …and what is sent once and said on screen (a campaign's announcement, its ledger): a relay that was sent it and has not shown it is
// asked again at each of `later` (ms after sending), as long as one is left. `onState(results, done)` hears the first answer and each change.
async function publishChecked(ev, relays = RELAYS, { timeout = 8000, later = [20000, 45000], onState = () => {} } = {}){ const t0 = Date.now(); let res = await publish(ev, relays, { timeout });
  const open = () => res.some(r => r.silent && !r.ok); onState(res, !open() || !later.length);
  if (open() && later.length) (async () => { for (let i = 0; i < later.length; i++) { await new Promise(r => setTimeout(r, Math.max(0, t0 + later[i] - Date.now())));
      const was = res.filter(r => r.ok).length; res = await Promise.all(res.map(async r => r.silent && !r.ok && await has(r.url, ev.id, { timeout }) ? late(r) : r));
      const done = !open() || i === later.length - 1; if (done || res.filter(r => r.ok).length !== was) onState(res, done); if (done) return; } })().catch(() => {});
  return res; }

// THE OUTBOX: what is sent waits here until relays confirm it, so a closed app or a lost connection loses nothing. `store` is
// { get(key), set(key, value) } (localStorage in the app; its set answers false when the phone has no room left); it keeps the
// wrapped events, which are already encrypted, only while they wait: once sent (or given up), only how it went is kept, the last
// 300 of those. It kept every event it ever sent, photos too, and filled the app's storage (about 5 MB for everything it keeps):
// after that nothing it received could be saved, and donations went missing without a word (StreetCat, 8 Nov, 04:51: «la pago, sale
// de mi wallet, pero no llega a la campaña en el rescue»).
const OUTBOX = 'vetlock.outbox', KEEP_DONE = 300;
const NO_ROOM = 'this phone has no room left to save it: the app\'s storage is full';
const slim = a => { const done = a.filter(x => x.state !== 'sending'), drop = new Set(done.slice(0, Math.max(0, done.length - KEEP_DONE)).map(x => x.id));
  return a.filter(x => !drop.has(x.id)).map(x => x.state === 'sending' || !('ev' in x) ? x : (({ ev, ...rest }) => rest)(x)); };
function outbox(store){ const all = () => { try { const a = JSON.parse(store.get(OUTBOX) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }, save = a => store.set(OUTBOX, JSON.stringify(slim(a))) !== false;
  return {
    list: all,
    async add(payload, fromSk, toPk, { relays = RELAYS, label = '' } = {}){ const ev = await wrap(payload, fromSk, toPk), item = { id: ev.id, ev, relays, label, ref: payload.id || '', t: payload.t, acked: [], tries: 0, next: 0, created: Date.now(), state: 'sending' };
      if (!save([...all().filter(x => x.id !== item.id), item])) throw new Error(NO_ROOM); return item; },
    // send what is waiting: each relay that has not confirmed yet is tried again, after 0 s, 15 s, 1 min, 5 min, 15 min, then hourly.
    // What was added while this ran is kept: the list is read again before it is saved (it was overwritten with the one read first).
    // Sent before and not confirmed, a relay may have it all the same (publish, above): one that was sent it last time and gave no answer
    // is asked first, and not sent it again if it has it (one that refused it, or could not be reached, has nothing to be asked)
    async flush(o = {}){ const a = all(), t = Date.now(), changed = [];
      for (const it of a) { if (it.state !== 'sending' || !it.ev || (it.next > t && !o.force)) continue;
        const ask = it.tries ? (it.last || []).filter(r => r && r.silent && !r.ok && !it.acked.includes(r.url)).map(r => r.url) : [];
        for (const [u, yes] of await Promise.all(ask.map(async u => [u, await has(u, it.ev.id, o)]))) if (yes) it.acked.push(u);
        const todo = it.relays.filter(u => !it.acked.includes(u)), res = todo.length ? await publish(it.ev, todo, o) : [];
        for (const r of res) if (r.ok && !it.acked.includes(r.url)) it.acked.push(r.url);
        it.last = res; it.tries++; it.next = t + [15, 60, 300, 900, 3600][Math.min(it.tries - 1, 4)] * 1000;
        if (it.acked.length >= Math.min(2, it.relays.length)) it.state = 'sent'; else if (t - it.created > 86400e3) it.state = it.acked.length ? 'sent' : 'failed';
        changed.push(it); }
      const done = new Map(changed.map(x => [x.id, x])); save(all().map(x => done.get(x.id) || x)); return changed; } }; }

// THE INBOX: what waits for these spending keys (the messaging keys derived from them), from every relay, each message once.
// `expect(payload)` names the spending key that must have sent it (the campaign's Streetcat key for a request, its clinic key for an
// answer), or null to drop it. Returns the new messages and how each relay did.
async function receive(sks, { relays = RELAYS, since = now() - 7 * 86400, seen = new Set(), expect, timeout } = {}){
  const mine = await Promise.all(sks.map(keysOf)), byPub = new Map(mine.map(k => [k.pub, k])), filter = { kinds: [WRAP], '#p': [...byPub.keys()], since: Math.max(0, since - TWO_DAYS) };
  const per = await Promise.all(relays.map(u => fetchFrom(u, filter, { timeout }).then(evs => ({ url: u, ok: true, events: evs })).catch(e => ({ url: u, ok: false, msg: String((e && e.message) || e), events: [] }))));
  const out = [], wraps = new Map(); for (const r of per) for (const ev of r.events) if (ev && ev.id && !wraps.has(ev.id)) wraps.set(ev.id, { ev, from: [r.url] }); else if (ev && wraps.has(ev.id)) wraps.get(ev.id).from.push(r.url);
  for (const [id, { ev, from }] of wraps) { if (seen.has(id)) continue; seen.add(id);
    const to = (ev.tags.find(t => t[0] === 'p') || [])[1], k = byPub.get(to); if (!k || !K.verifyEvent(ev)) continue;
    let rumor, payload; try { rumor = K.unwrapEvent(ev, k.sk); payload = await C.unpack(rumor.content); } catch (_) { continue; }  // not for us, or not readable
    const want = expect ? await expect(payload) : null;
    // not expected here yet (its request or its campaign is not in this browser yet): asked again next time, not dropped for good
    // (StreetCat, 7 Nov: the app on his home screen got the clinic's answer before Import all brought the request, and lost it)
    if (!want) { seen.delete(id); continue; }
    if (rumor.pubkey !== await pubOf(want)) continue;  // not from who it says
    if (payload && payload.id && seen.has('p:' + payload.t + ':' + payload.id + ':' + (payload.kind || ''))) continue; if (payload && payload.id) seen.add('p:' + payload.t + ':' + payload.id + ':' + (payload.kind || ''));
    out.push({ payload, wrap: id, relays: from, at: rumor.created_at }); }
  return { messages: out, relays: per.map(({ url, ok, msg, events }) => ({ url, ok, msg, events: events.length })) }; }

// THE LEDGER BY NOSTR: a campaign's ledger (version 2) as one replaceable event (kind 30078, its d tag the campaign's id), signed with the
// ledger key derived from the campaign's Streetcat key, so anyone can check who signed it from the campaign alone. Readers take the
// newest event whose signer and campaign check out: one under that id signed by any other key, or naming another campaign, is ignored.
const LEDGER_KIND = 30078, LEDGER_MAX = 120000;
async function ledgerEvent(L, streetcatSk){ const c = C.campaignOf(L.campaign), content = JSON.stringify(L);
  if (content.length > LEDGER_MAX) throw new Error(`this ledger is ${Math.round(content.length / 1000)} kB, too large for a relay: publish its file instead`);
  return K.finalizeEvent({ kind: LEDGER_KIND, created_at: now(), tags: [['d', await C.campaignId(c)], ['t', 'streetcat-ledger']], content }, unhex(await C.derivedSk(C.TAG.ledger, streetcatSk))); }
async function ledgerOk(ev, id){ try { if (!ev || ev.kind !== LEDGER_KIND || (ev.tags.find(t => t[0] === 'd') || [])[1] !== id || !K.verifyEvent(ev)) return null;
  const L = JSON.parse(ev.content); if (!L || !L.campaign || await C.campaignId(L.campaign) !== id) return null;
  return ev.pubkey === (await C.derivedPub(C.TAG.ledger, C.campaignOf(L.campaign).streetcat)).slice(2) ? L : null; } catch (_) { return null; } }
async function latestLedger(id, { relays = RELAYS, timeout } = {}){
  const per = await Promise.all(relays.map(u => fetchFrom(u, { kinds: [LEDGER_KIND], '#d': [id] }, { timeout }).then(evs => ({ url: u, ok: true, events: evs })).catch(e => ({ url: u, ok: false, msg: String((e && e.message) || e), events: [] }))));
  let best = null, ignored = 0;
  for (const r of per) for (const ev of r.events) { const L = await ledgerOk(ev, id); if (!L) { ignored++; continue; }
    if (!best || ev.created_at > best.ev.created_at) best = { ev, L, from: [r.url] }; else if (ev.id === best.ev.id && !best.from.includes(r.url)) best.from.push(r.url); }
  return { found: best, ignored, relays: per.map(({ url, ok, msg, events }) => ({ url, ok, msg, events: events.length })) }; }

// THE CAMPAIGNS BY NOSTR: each campaign Streetcat makes is announced on the relays (kind 30078, its d tag "announce:" and the campaign's
// id, so it never replaces the ledger), signed with the same derived ledger key; it holds the signed campaign, as its link does, and
// expires at its deadline (NIP-40). A donor's "Check for requests" asks the relays for the announcements of Streetcat's published keys
// and keeps a campaign only when the event names it, its signer is that campaign's ledger key, the campaign's own signature holds, and
// it is still open: anything else is ignored. Each campaign once, the newest.
// Since 7 Nov (StreetCat: campaigns and concrete requests, «3»), the announcement also says what it is and which cats it pays for, in
// tags the same signature covers: ['k', 'request'] for a request on its own (one cat, its own pot) and, for each request made from
// it, ['cat', name, procedure, state], the state 'requested', 'done' (the partner confirmed it) or 'released' (Streetcat released the
// sats to its own reserve: the partner is not paid by the app, so it is not called 'paid'; StreetCat, 8 Nov, review point 5). Announcements
// of before said 'paid' for that: read as 'released'.
const ANNOUNCE = 'streetcat-campaign', CAT_STATES = ['requested', 'done', 'released'], catState = s => s === 'paid' ? 'released' : CAT_STATES.includes(s) ? s : 'requested';
const catTags = cats => (cats || []).slice(0, 40).map(x => ['cat', String(x.name || '').trim().slice(0, 40), String(x.procedure || '').trim().slice(0, 80), catState(x.state)]).filter(t => t[1]);
async function announceEvent(c, streetcatSk, { kind, cats } = {}){ const id = await C.campaignId(c);
  return K.finalizeEvent({ kind: LEDGER_KIND, created_at: now(), tags: [['d', 'announce:' + id], ['t', ANNOUNCE], ['expiration', String(Number(c.deadline))], ...(kind === 'request' ? [['k', 'request']] : []), ...catTags(cats)], content: JSON.stringify(c) }, unhex(await C.derivedSk(C.TAG.ledger, streetcatSk))); }
async function announcedOk(ev){ try { if (!ev || ev.kind !== LEDGER_KIND || !K.verifyEvent(ev)) return null; const c = JSON.parse(ev.content), id = await C.campaignId(c);
  if ((ev.tags.find(t => t[0] === 'd') || [])[1] !== 'announce:' + id || ev.pubkey !== (await C.derivedPub(C.TAG.ledger, C.campaignOf(c).streetcat)).slice(2)) return null;
  const kind = ev.tags.some(t => t[0] === 'k' && t[1] === 'request') ? 'request' : 'campaign', cats = catTags(ev.tags.filter(t => t[0] === 'cat').map(t => ({ name: t[1], procedure: t[2], state: t[3] }))).map(([, name, procedure, state]) => ({ name, procedure, state }));
  return await C.campaignSig(c) === 'signed' ? { id, c, at: ev.created_at, kind, cats } : null; } catch (_) { return null; } }
async function openCampaigns(keys, { relays = RELAYS, timeout } = {}){ const authors = await Promise.all(keys.map(async k => (await C.derivedPub(C.TAG.ledger, k)).slice(2)));
  const per = await Promise.all(relays.map(u => fetchFrom(u, { kinds: [LEDGER_KIND], authors, '#t': [ANNOUNCE] }, { timeout }).then(evs => ({ url: u, ok: true, events: evs })).catch(e => ({ url: u, ok: false, msg: String((e && e.message) || e), events: [] }))));
  const best = new Map(), t = now(); let ignored = 0;
  for (const r of per) for (const ev of r.events) { const a = authors.includes(ev && ev.pubkey) ? await announcedOk(ev) : null; if (!a) { ignored++; continue; }
    if (Number(a.c.deadline) <= t) continue; const b = best.get(a.id); if (!b || a.at > b.at) best.set(a.id, a); }
  return { campaigns: [...best.values()].sort((x, y) => Number(x.c.deadline) - Number(y.c.deadline)), ignored, relays: per.map(({ url, ok, msg, events }) => ({ url, ok, msg, events: events.length })) }; }

// PAYMENTS FROM A CASHU WALLET (NUT-18 over Nostr): the request names an nprofile (NIP-19: a key and the relays to use); the payer's
// wallet sends its payload ({ id, mint, unit, proofs }) there as a NIP-17 direct message, a gift wrap like ours with plain JSON inside
const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bech32(hrp, data){ const words = []; let acc = 0, bits = 0; for (const x of data) { acc = ((acc << 8) | x) & 0xffff; bits += 8; while (bits >= 5) { bits -= 5; words.push((acc >> bits) & 31); } } if (bits) words.push((acc << (5 - bits)) & 31);
  const mod = v => { const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let c = 1; for (const x of v) { const t = c >>> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((t >>> i) & 1) c ^= G[i]; } return c; };
  const h = [...hrp].map(ch => ch.charCodeAt(0) >> 5).concat([0], [...hrp].map(ch => ch.charCodeAt(0) & 31)), p = mod(h.concat(words, [0, 0, 0, 0, 0, 0])) ^ 1;
  return hrp + '1' + words.concat(Array.from({ length: 6 }, (_, i) => (p >>> (5 * (5 - i))) & 31)).map(x => B32[x]).join(''); }
const nprofile = (pub, relays = []) => { const tlv = [0, 32, ...unhex(pub)]; for (const r of relays) { const b = new TextEncoder().encode(r); if (b.length < 256) tlv.push(1, b.length, ...b); } return bech32('nprofile', tlv); };
async function receivePayments(skHex, { relays = RELAYS, since = now() - 7 * 86400, seen = new Set(), timeout } = {}){ const sk = unhex(skHex), pub = K.getPublicKey(sk), filter = { kinds: [WRAP], '#p': [pub], since: Math.max(0, since - TWO_DAYS) };
  const per = await Promise.all(relays.map(u => fetchFrom(u, filter, { timeout }).then(evs => ({ url: u, ok: true, events: evs })).catch(e => ({ url: u, ok: false, msg: String((e && e.message) || e), events: [] }))));
  const out = [], ids = new Set();
  for (const r of per) for (const ev of r.events) { if (!ev || !ev.id || ids.has(ev.id) || seen.has(ev.id)) continue; ids.add(ev.id); if (!K.verifyEvent(ev)) continue;
    let rumor, p; try { rumor = K.unwrapEvent(ev, sk); p = JSON.parse(rumor.content); } catch (_) { continue; }
    if (p && Array.isArray(p.proofs) && typeof p.mint === 'string') out.push({ payload: p, wrap: ev.id, at: rumor.created_at }); }
  return { payments: out, relays: per.map(({ url, ok, msg, events }) => ({ url, ok, msg, events: events.length })) }; }

// "received": what the app sends back as soon as a request or an answer arrives, so the sender knows it got there
const receiptFor = payload => ({ t: 'streetcat.received', v: 1, id: payload.id, of: payload.t, at: new Date().toISOString() });

root.scRelay = { RELAYS, NO_ROOM, keysOf, pubOf, wrap, publish, publishChecked, has, outbox, receive, receiptFor, fetchFrom, publishTo, LEDGER_KIND, ledgerEvent, ledgerOk, latestLedger, ANNOUNCE, announceEvent, announcedOk, openCampaigns, bech32, nprofile, receivePayments };
})(typeof window !== 'undefined' ? window : globalThis);
