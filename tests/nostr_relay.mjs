// A small NIP-01 relay for the tests, never for real use: events in memory; EVENT answered with OK after checking the event's id and
// signature; REQ answered with the stored events that match, then EOSE, then new matching events as they come; CLOSE ends it.
// Test options: `refuse` (answers every EVENT with OK false, like a relay that does not take these events), `delay` (ms before each
// answer), `maxBytes` (larger events are refused). Run alone with `node tests/nostr_relay.mjs 7001` (it prints its address).
import { WebSocketServer } from 'ws';
import fs from 'fs';

export function loadKit(){ if (!globalThis.nostrkit) eval(fs.readFileSync(new URL('../app/nostr-bundle.js', import.meta.url), 'utf8') + ';globalThis.nostrkit = nostrkit;'); return globalThis.nostrkit; }

const matches = (f, e) => (!f.ids || f.ids.some(x => e.id.startsWith(x))) && (!f.authors || f.authors.some(x => e.pubkey.startsWith(x))) && (!f.kinds || f.kinds.includes(e.kind))
  && (f.since == null || e.created_at >= f.since) && (f.until == null || e.created_at <= f.until)
  && Object.entries(f).filter(([k]) => /^#[a-zA-Z]$/.test(k)).every(([k, vals]) => e.tags.some(t => t[0] === k.slice(1) && vals.includes(t[1])));

export function startRelay({ port, refuse = false, delay = 0, maxBytes = 128 * 1024 } = {}){
  const kit = loadKit(), events = [], stats = { received: 0, accepted: 0, refused: 0, served: 0 }, socks = new Set();
  const wss = new WebSocketServer({ host: '127.0.0.1', port });
  const later = fn => delay ? setTimeout(fn, delay) : fn();
  wss.on('connection', ws => { socks.add(ws); const subs = new Map(); ws.on('close', () => socks.delete(ws));
    const send = m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
    ws.on('message', raw => later(() => { let m; try { m = JSON.parse(String(raw)); } catch (_) { return send(['NOTICE', 'bad json']); }
      if (m[0] === 'EVENT') { const e = m[1]; stats.received++;
        const why = refuse ? 'blocked: this relay does not take these events' : String(raw).length > maxBytes ? 'invalid: too large' : !e || typeof e.id !== 'string' ? 'invalid: no event' : !kit.verifyEvent(e) ? 'invalid: bad id or signature' : '';
        if (why) { stats.refused++; return send(['OK', e && e.id, false, why]); }
        if (!events.some(x => x.id === e.id)) { events.push(e); for (const s of wss.clients) if (s !== ws && s._subs) for (const [id, fs] of s._subs) if (fs.some(f => matches(f, e))) s.send(JSON.stringify(['EVENT', id, e])); }
        for (const [id, fs] of subs) if (fs.some(f => matches(f, e))) send(['EVENT', id, e]);
        stats.accepted++; return send(['OK', e.id, true, '']); }
      if (m[0] === 'REQ') { const [, id, ...fs] = m; subs.set(id, fs); ws._subs = subs;
        const hits = events.filter(e => fs.some(f => matches(f, e))).sort((a, b) => b.created_at - a.created_at), lim = Math.min(...fs.map(f => f.limit || Infinity));
        for (const e of hits.slice(0, lim)) { stats.served++; send(['EVENT', id, e]); } return send(['EOSE', id]); }
      if (m[0] === 'CLOSE') { subs.delete(m[1]); return; }
      send(['NOTICE', 'unknown message']); })); });
  const ready = new Promise(r => wss.on('listening', r));
  return { url: `ws://127.0.0.1:${port}`, events, stats, ready, close: () => new Promise(r => { for (const s of socks) s.terminate(); wss.close(() => r()); }) };
}

if (import.meta.url === `file://${process.argv[1]}`) { const r = startRelay({ port: Number(process.argv[2] || 7001) }); await r.ready; console.log('test relay at', r.url); }
