// Requests, answers and receipts by relay (Nostr). Every message is encrypted end to end (NIP-44 v2) and gift-wrapped (NIP-59):
// a relay sees a throwaway sender, the recipient's messaging key, a time up to two days off, and a size; never the content.
// Both ends' messaging keys are derived from the campaign keys (core.js, TAG.messaging), so a campaign needs no new keys and the
// spending keys never sign a message. Inside, the sender is checked against the campaign: a request must come from the campaign's
// Streetcat key, an answer from its clinic key; anything else is ignored.
// A message goes to every relay at once. It counts as sent when one relay confirms it (OK) and is sent again, with growing pauses,
// until two have (or every relay has), or it is a day old. Receiving asks each relay for what is waiting, from shortly before the
// last time, and drops what was already seen. Links and files carry the same payload when there is no relay, or in person.
// The same relays carry the campaign's published ledger (kind 30078, below).
// Needs cashu-bundle.js, core.js and nostr-bundle.js. Runs in the browser and in Node 22 (its global WebSocket).
(function (root) {
'use strict';
const C = root.scCore, K = root.nostrkit; if (!C || !K) throw new Error('relay.js needs core.js and nostr-bundle.js first');
// the three that carried the live test from StreetCat's network (5 Nov 2026); damus and 0xchat could not be reached from there
const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom'];
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
const publishTo = (url, ev, o) => visit(url, (ws, ok) => { ws.onmessage = m => { let x; try { x = JSON.parse(m.data); } catch (_) { return; } if (x[0] === 'OK' && x[1] === ev.id) ok({ url, ok: !!x[2], msg: String(x[3] || '') }); }; ws.send(JSON.stringify(['EVENT', ev])); }, o);
const fetchFrom = (url, filter, o) => visit(url, (ws, ok) => { const id = 'sc' + Math.random().toString(36).slice(2, 10), got = [];
  ws.onmessage = m => { let x; try { x = JSON.parse(m.data); } catch (_) { return; } if (x[0] === 'EVENT' && x[1] === id && x[2]) got.push(x[2]); if ((x[0] === 'EOSE' || x[0] === 'CLOSED') && x[1] === id) { try { ws.send(JSON.stringify(['CLOSE', id])); } catch (_) {} ok(got); } };
  ws.send(JSON.stringify(['REQ', id, filter])); }, o);

// a payload, wrapped for one recipient: the rumor carries it packed (core.js), the seal is signed with the sender's messaging key
async function wrap(payload, fromSk, toPk){ const from = await keysOf(fromSk), to = await pubOf(toPk), content = await C.pack(payload);
  if (content.length > MAX) throw new Error('too large for a relay message: send it as a file');
  return K.wrapEvent({ kind: KIND, content, tags: [['p', to]] }, from.sk, to); }
async function publish(ev, relays = RELAYS, o){ return Promise.all(relays.map(u => publishTo(u, ev, o).catch(e => ({ url: u, ok: false, msg: String((e && e.message) || e) })))); }

// THE OUTBOX: what is sent waits here until relays confirm it, so a closed app or a lost connection loses nothing. `store` is
// { get(key), set(key, value) } (localStorage in the app); it keeps the wrapped events, which are already encrypted.
const OUTBOX = 'vetlock.outbox';
function outbox(store){ const all = () => { try { const a = JSON.parse(store.get(OUTBOX) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }, save = a => store.set(OUTBOX, JSON.stringify(a));
  return {
    list: all,
    async add(payload, fromSk, toPk, { relays = RELAYS, label = '' } = {}){ const ev = await wrap(payload, fromSk, toPk), item = { id: ev.id, ev, relays, label, ref: payload.id || '', t: payload.t, acked: [], tries: 0, next: 0, created: Date.now(), state: 'sending' };
      save([...all().filter(x => x.id !== item.id), item]); return item; },
    // send what is waiting: each relay that has not confirmed yet is tried again, after 0 s, 15 s, 1 min, 5 min, 15 min, then hourly
    async flush(o = {}){ const a = all(), t = Date.now(), changed = [];
      for (const it of a) { if (it.state !== 'sending' || (it.next > t && !o.force)) continue;
        const todo = it.relays.filter(u => !it.acked.includes(u)), res = await publish(it.ev, todo, o);
        for (const r of res) if (r.ok && !it.acked.includes(r.url)) it.acked.push(r.url);
        it.last = res; it.tries++; it.next = t + [15, 60, 300, 900, 3600][Math.min(it.tries - 1, 4)] * 1000;
        if (it.acked.length >= Math.min(2, it.relays.length)) it.state = 'sent'; else if (t - it.created > 86400e3) it.state = it.acked.length ? 'sent' : 'failed';
        changed.push(it); }
      save(a); return changed; } }; }

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
    const want = expect ? await expect(payload) : null; if (!want || rumor.pubkey !== await pubOf(want)) continue;  // not from who it says
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

root.scRelay = { RELAYS, keysOf, pubOf, wrap, publish, outbox, receive, receiptFor, fetchFrom, publishTo, LEDGER_KIND, ledgerEvent, ledgerOk, latestLedger, bech32, nprofile, receivePayments };
})(typeof window !== 'undefined' ? window : globalThis);
