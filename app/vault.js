// The private keys this browser keeps, locked with a PIN (11 Nov). Off until a PIN is set in Keys or in the partner's settings.
// With a PIN, the six places where private keys are kept hold them encrypted, and the app does not start until the PIN is given:
// it opens them for this tab only, and a closed tab is locked again. The PIN makes a key (PBKDF2-SHA256, 600 000 rounds, a salt of
// this browser's); each value is sealed with it as a NIP-44 v2 payload (ChaCha20 and HMAC-SHA256, the library the app already
// carries for its messages), in pieces when it is long. Sealing is done at once, as the value is written: a key is never "saved"
// before it is on the phone.
// What it is for: a phone picked up by someone else, a copy of the browser's files. What it is not: a short PIN can be tried out
// by whoever has a copy of the storage and time, so the backup with a long password stays the thing to keep. Not locked: what is
// not a key (campaigns, requests, records, and the ecash kept as change or released, which is spent like cash).
(() => {
  const META = 'vetlock.pin', NEXT = 'vetlock.pin.next', SESSION = 'vetlock.pin.k', PRE = 'pin1:', ITER = 600000, MIN = 6, CHUNK = 16000;
  const SLOTS = ['vetlock.clinic.sk', 'vetlock.streetcat.sk', 'vetlock.donor.sk', 'vetlock.clinic.old', 'vetlock.streetcat.old', 'vetlock.donor.keys'];
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), unhex = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
  const raw = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return raw(k) === (v == null ? null : v); } catch (_) { return false; } };
  const box = () => window.nostrkit.nip44.v2;
  // a long value goes in pieces (a payload holds 65 535 bytes), never cut inside a character
  const enc = (s, K) => { const parts = []; for (let i = 0; i < s.length;) { let j = Math.min(s.length, i + CHUNK); const c = s.charCodeAt(j - 1); if (j < s.length && c >= 0xd800 && c <= 0xdbff) j--; parts.push(box().encrypt(s.slice(i, j), K)); i = j; } return PRE + parts.join('.'); };
  const dec = (v, K) => { const body = v.slice(PRE.length); return body === '' ? '' : body.split('.').map(p => box().decrypt(p, K)).join(''); };
  const meta = () => { try { const m = JSON.parse(raw(META) || 'null'); return m && m.v === 1 && /^[0-9a-f]{32}$/.test(m.salt) && Number.isInteger(m.iter) && typeof m.check === 'string' ? m : null; } catch (_) { return null; } };
  const fits = (m, K) => { try { return dec(m.check, K) === 'vetlock'; } catch (_) { return false; } };
  const derive = async (pin, salt, iter) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: iter }, await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']), 256));
  // A change of PIN state is written down whole first (NEXT) and then carried out, so that one cut short is finished the next
  // time the page opens: the keys are never left half under one key and half under another. With a PIN coming, its record goes
  // first (a value not yet sealed is read as it is); with a PIN going, last.
  const finish = () => { let n; try { n = JSON.parse(raw(NEXT) || 'null'); } catch (_) { n = null; } if (!n || typeof n.slots !== 'object') return true;
    if (n.meta && !put(META, JSON.stringify(n.meta))) return false;
    for (const k of SLOTS) if (k in n.slots && !put(k, n.slots[k])) return false;
    if (!n.meta && !put(META, null)) return false; return put(NEXT, null); };
  let K = null; const seen = new Map();
  const load = () => { finish(); seen.clear(); K = null; const m = meta(); if (!m) return; try { const h = sessionStorage.getItem(SESSION); if (h && /^[0-9a-f]{64}$/.test(h) && fits(m, unhex(h))) K = unhex(h); } catch (_) {} };
  load();
  const on = () => !!meta(), locked = () => on() && !K;
  const read = k => { const v = raw(k); if (v == null || !v.startsWith(PRE)) return v; if (!K) return null; const was = seen.get(k); if (was && was[0] === v) return was[1];
    try { const p = dec(v, K); seen.set(k, [v, p]); return p; } catch (_) { return null; } };
  // a key is not written in the clear beside a PIN, and not at all while locked
  const write = (k, v) => { v = String(v); if (!SLOTS.includes(k) || !on()) return put(k, v); return K ? put(k, enc(v, K)) : false; };
  const check = async pin => { const m = meta(); if (!m) return false; const k = await derive(pin, m.salt, m.iter); return fits(m, k) ? k : false; };
  const unlock = async pin => { const k = await check(pin); if (!k) return false; try { sessionStorage.setItem(SESSION, hex(k)); } catch (_) {} K = k; seen.clear(); return true; };
  const set = async pin => { pin = String(pin); if (on()) throw new Error('a PIN is set already: remove it first'); if (pin.length < MIN) throw new Error(`a PIN has ${MIN} characters or more`);
    const salt = hex(crypto.getRandomValues(new Uint8Array(16))), k = await derive(pin, salt, ITER), slots = {};
    for (const s of SLOTS) { const v = raw(s); if (v != null && !v.startsWith(PRE)) slots[s] = enc(v, k); }
    if (!put(NEXT, JSON.stringify({ meta: { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt, check: enc('vetlock', k) }, slots }))) { put(NEXT, null); throw new Error('this phone could not write it down (its storage is full or blocked), so nothing changed'); }
    try { sessionStorage.setItem(SESSION, hex(k)); } catch (_) {} const done = finish(); load(); if (!K) K = k; if (!done) throw new Error('this phone has no room to finish: it is finished the next time the app opens'); return true; };
  const clear = async pin => { const k = await check(pin); if (!k) return false; const slots = {};
    for (const s of SLOTS) { const v = raw(s); if (v != null && v.startsWith(PRE)) slots[s] = dec(v, k); }
    if (!put(NEXT, JSON.stringify({ meta: null, slots }))) { put(NEXT, null); throw new Error('this phone could not write it down (its storage is full or blocked), so nothing changed'); }
    finish(); try { sessionStorage.removeItem(SESSION); } catch (_) {} load(); return true; };
  const lock = () => { try { sessionStorage.removeItem(SESSION); } catch (_) {} K = null; seen.clear(); };
  const erase = () => { for (const k of [...SLOTS, NEXT, META]) put(k, null); lock(); };

  // ----- the few screens of its own: they must work before the app has started -----
  const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
  const BTN = 'font:inherit;color:var(--fg,#efede6);background:none;border:1px solid var(--fg,#efede6);padding:12px 16px;min-height:44px;cursor:pointer;flex:1;text-transform:uppercase;letter-spacing:.08em';
  const sheet = id => { const o = el('div', 'position:fixed;inset:0;z-index:1000;background:var(--bg,#111);color:var(--fg,#efede6);font-family:var(--mono,ui-monospace,Menlo,monospace);font-size:15px;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box'); o.id = id;
    const b = el('div', 'width:100%;max-width:340px;display:flex;flex-direction:column;gap:14px'); o.appendChild(b); document.body.appendChild(o); return { o, b }; };
  const pinInput = () => { const i = el('input', 'font:inherit;color:inherit;background:none;border:1px solid var(--line2,rgba(239,237,230,.45));padding:12px;min-height:44px;box-sizing:border-box;width:100%;text-align:center;letter-spacing:.2em'); i.type = 'password'; i.autocomplete = 'off'; i.setAttribute('inputmode', 'numeric'); i.setAttribute('aria-label', 'PIN'); return i; };
  const red = (e, t) => { e.textContent = t; e.style.color = 'var(--bad,#ff4d4d)'; };
  // the app is locked: nothing of it runs until the PIN is given, and then the page starts again
  const gate = () => { const { b } = sheet('pin-gate'), i = pinInput(), go = el('button', BTN, 'Unlock'), out = el('div', 'min-height:20px;text-align:center'), row = el('div', 'display:flex;gap:8px'), lost = el('a', 'color:var(--mute,#8d8a81);text-align:center;font-size:13px', 'forgot the PIN'); i.id = 'pin-in'; go.id = 'pin-go'; out.id = 'pin-out'; lost.id = 'pin-lost'; lost.href = '#';
    b.appendChild(el('div', 'text-align:center', 'Keys locked')); b.appendChild(i); row.appendChild(go); b.appendChild(row); b.appendChild(out); b.appendChild(lost);
    const tryIt = async () => { if (!i.value) return; go.disabled = true; out.style.color = ''; out.textContent = 'checking…'; let ok = false; try { ok = await unlock(i.value); } catch (_) {} if (ok) return location.reload(); go.disabled = false; i.value = ''; red(out, '✗ Wrong PIN'); i.focus(); };
    go.onclick = tryIt; i.onkeydown = e => { if (e.key === 'Enter') tryIt(); };
    lost.onclick = e => { e.preventDefault(); lost.remove(); red(out, '✗ Without the PIN the keys here cannot be read. Erase them, then restore your backup.'); const x = el('button', BTN + ';color:var(--bad,#ff4d4d);border-color:var(--bad,#ff4d4d)', 'Erase the keys here'); x.id = 'pin-erase';
      x.onclick = () => { if (confirm('Erase the keys in this browser? What is locked to them is lost unless you have a backup.')) { erase(); location.reload(); } }; b.appendChild(x); };
    setTimeout(() => i.focus(), 50); };
  // asked again before a private key is shown or the PIN is removed: the PIN when the one given is right, null when one walks away
  const askPin = label => new Promise(done => { const { o, b } = sheet('pin-ask'), i = pinInput(), go = el('button', BTN, 'OK'), no = el('button', BTN, 'Cancel'), out = el('div', 'min-height:20px;text-align:center'), row = el('div', 'display:flex;gap:8px'); i.id = 'pin-ask-in'; go.id = 'pin-ask-go'; no.id = 'pin-ask-no'; out.id = 'pin-ask-out';
    b.appendChild(el('div', 'text-align:center', label)); b.appendChild(i); row.appendChild(no); row.appendChild(go); b.appendChild(row); b.appendChild(out);
    const end = v => { o.remove(); done(v); }, tryIt = async () => { if (!i.value) return; go.disabled = true; out.style.color = ''; out.textContent = 'checking…'; let ok = false; const pin = i.value; try { ok = !!(await check(pin)); } catch (_) {} if (ok) return end(pin); go.disabled = false; i.value = ''; red(out, '✗ Wrong PIN'); i.focus(); };
    go.onclick = tryIt; no.onclick = () => end(null); i.onkeydown = e => { if (e.key === 'Enter') tryIt(); if (e.key === 'Escape') end(null); }; setTimeout(() => i.focus(), 50); });
  // a private key, on the page and not in a browser dialog; gone at a tap, or by itself in half a minute
  const reveal = (label, text) => { const { o, b } = sheet('pin-reveal'), code = el('div', 'user-select:all;-webkit-user-select:all;overflow-wrap:anywhere;line-break:anywhere;border:1px solid var(--line2,rgba(239,237,230,.45));padding:12px', text), row = el('div', 'display:flex;gap:8px'), cp = el('button', BTN, 'Copy'), x = el('button', BTN, 'Close'); code.id = 'pin-reveal-key'; code.className = 'nokey'; cp.id = 'pin-reveal-copy'; x.id = 'pin-reveal-close';
    const lab = el('div', 'text-align:center;color:var(--bad,#ff4d4d)', label); b.appendChild(lab); b.appendChild(code); row.appendChild(cp); row.appendChild(x); b.appendChild(row);
    const t = setTimeout(() => o.remove(), 30000); x.onclick = () => { clearTimeout(t); o.remove(); };
    cp.onclick = async () => { try { await navigator.clipboard.writeText(text); cp.textContent = 'Copied'; } catch (_) { cp.textContent = 'Select it'; } }; };
  window.scVault = { MIN, SLOTS, on, locked, read, write, check: async pin => !!(await check(pin)), unlock, set, clear, lock, erase, gate, askPin, reveal };
})();
