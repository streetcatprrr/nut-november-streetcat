// The app page's code (app/index.html): every role's screens. In a file of its own so the browser security policy (vercel.json)
// allows scripts from this site only, with no inline script to hash. Needs cashu-bundle.js, core.js, nostr-bundle.js, relay.js and qrcode.min.js first.
(function(){
const $ = id => document.getElementById(id);
// Keys painted as code, in the colour of their role: orange (Bitcoin's) for donors' refund keys, blue for the clinic,
// green for Streetcat. Every 4 hex characters take their own shade from those characters, so the same key always looks
// the same wherever it appears (full or abbreviated) and two keys of the same role can still be told apart at a glance.
// a key: a full compressed public key (66 hex) or one cut short with "…". A 64-hex private key is never painted as a key.
const KEYRE = /\b0[23][0-9a-f]{64}(?![0-9a-z_-])|\b0[23][0-9a-f]{8,63}…/gi, HUE = { donor: 55, clinic: 250, streetcat: 150 }, KEYROLE = {};
const roleOf = (k, role) => { if (k && role && HUE[role]) KEYROLE[String(k).slice(0, 10).toLowerCase()] = role; return k; };
// one key, painted: 4 hex characters per piece, each its own shade of its role's hue, so the same key always looks the same
function keySpan(text){ const k = document.createElement('span'); k.className = 'key'; const role = KEYROLE[text.slice(0, 10).toLowerCase()]; if (role) k.dataset.role = role;
  for (let i = 0; i < text.length; i += 4) { const s = document.createElement('i'), chunk = text.slice(i, i + 4); s.textContent = chunk;
    if (/^[0-9a-f]{2,4}$/i.test(chunk)) { const v = parseInt(chunk, 16); s.style.setProperty('--h', String((role ? HUE[role] - 14 + (v % 29) : v % 360))); s.style.setProperty('--dl', String(((v >> 5) % 7 - 3) * 0.03)); }
    k.appendChild(s); }
  return k; }
function withKeys(text){ const frag = document.createDocumentFragment(); let last = 0, m; KEYRE.lastIndex = 0;
  while ((m = KEYRE.exec(text))) { frag.appendChild(document.createTextNode(text.slice(last, m.index))); frag.appendChild(keySpan(m[0])); last = m.index + m[0].length; }
  frag.appendChild(document.createTextNode(text.slice(last))); return frag; }
// Errors, warnings and odd states are red, in the app's own bad colour (var(--bad) and the .bad classes; StreetCat, 5 Nov: "todos los
// avisos de error o fallo o cosas raras tienen que ser en rojo"): a text that is one, or each line of a text that is one. Normal states
// (LOCKED, RELEASED, REFUNDED…), waiting messages and ✓ lines keep their colours. Keys inside a red line are red too.
const BAD_TEXT = /^\s*(✗|⚠|Failed\b|Not possible\b|Mint refused\b|Interrupted\b|CHECK FAILED|Not yet\b|[Cc]annot\b|[Cc]ould not\b|wrong password|This (phone|browser) could not|This (link|campaign) is not (signed|from Streetcat)|Still in flight|[Nn]ot ready for offline|[Nn]o connection\b|the mint did not answer|the mint cannot be reached|not sent:|no relay took it|NOT (COUNTED|LISTED)\b)/;
function badFrag(text, keys = false){ const f = document.createDocumentFragment(), ls = String(text == null ? '' : text).split('\n');
  ls.forEach((l, i) => { if (BAD_TEXT.test(l)) { const s = document.createElement('span'); s.className = 'bad'; s.textContent = l; f.appendChild(s); } else f.appendChild(keys ? withKeys(l) : document.createTextNode(l)); if (i < ls.length - 1) f.appendChild(document.createTextNode('\n')); });
  return f; }
const setLines = (e, text) => { e.textContent = ''; e.appendChild(badFrag(text)); return e; };
function paintKeys(root){ const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (KEYRE.lastIndex = 0, KEYRE.test(n.nodeValue)) && !n.parentNode.closest('textarea, .key, .nokey, .bad') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) n.parentNode.replaceChild(withKeys(n.nodeValue), n); }
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType === 3 && n.parentNode) paintKeys(n.parentNode); else if (n.nodeType === 1) paintKeys(n); } }).observe(document.body, { childList: true, subtree: true, characterData: false });
paintKeys(document.body);

const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const ls = { get(k){ try { return localStorage.getItem(k); } catch(_) { return null; } }, set(k, v){ try { localStorage.setItem(k, v); } catch(_) {} } };
const KEYS = { clinic: 'vetlock.clinic.sk', streetcat: 'vetlock.streetcat.sk', donor: 'vetlock.donor.sk' };
const newKey = () => hex(cashu.createRandomSecretKey());
const pubOf = sk => hex(cashu.getPubKeyFromPrivKey(Uint8Array.from(sk.match(/../g).map(h => parseInt(h, 16)))));
const key = (role, make) => { let sk = ls.get(KEYS[role]); if (!sk && make) { sk = newKey(); ls.set(KEYS[role], sk); } return sk; };
// Clinic and Streetcat keys are never thrown away: a new or imported key moves the current one to a kept list,
// and certify / release sign with whichever key held here the token names.
const OLD_KEYS = { clinic: 'vetlock.clinic.old', streetcat: 'vetlock.streetcat.old' };
const ROLE = { clinic: 'clinic', streetcat: 'Streetcat' };
const SK = /^[0-9a-f]{64}$/i;
const validSk = k => typeof k === 'string' && SK.test(k) && (() => { try { pubOf(k); return true; } catch (_) { return false; } })();
const oldKeys = role => { try { const a = JSON.parse(ls.get(OLD_KEYS[role]) || '[]'); return Array.isArray(a) ? a.filter(validSk) : []; } catch (_) { return []; } };
const heldKeys = role => [key(role, false), ...oldKeys(role)].filter((k, i, a) => k && a.indexOf(k) === i);
const keepOld = (role, sk) => { if (!oldKeys(role).includes(sk)) ls.set(OLD_KEYS[role], JSON.stringify([...oldKeys(role), sk])); return oldKeys(role).includes(sk); };
const setKey = (role, sk) => { const cur = key(role, false); if (cur === sk) return true;
  if (cur && !keepOld(role, cur)) return false;  // the current key is kept first, or nothing changes
  ls.set(KEYS[role], sk); if (key(role, false) !== sk) return false;
  ls.set(OLD_KEYS[role], JSON.stringify(oldKeys(role).filter(k => k !== sk))); return true; };
const heldFor = (role, pubkeys) => { const want = pubkeys.map(k => String(k).toLowerCase()); return heldKeys(role).find(sk => want.includes(pubOf(sk))) || null; };
const abbr = k => String(k).slice(0, 10) + '…';
// which key held here can sign this token, and if none, which keys the token asks for
function keyNote(role, info){ const sk = heldFor(role, info.pubkeys), cur = key(role, false), R = ROLE[role];
  if (sk) return sk === cur ? `✓ this token names your ${R} key` : `✓ this token names an older ${R} key kept in this browser (${abbr(pubOf(sk))})`;
  const whose = k => heldFor('streetcat', [k]) ? ' (Streetcat, held here)' : heldFor('clinic', [k]) ? ' (clinic, held here)' : '';
  return `✗ no ${R} key in this browser can sign this token.\nIt is locked to ${info.pubkeys.map(k => abbr(k) + whose(k)).join(' + ')}.\n${cur ? `This browser's ${R} key is ${abbr(pubOf(cur))}.` : `This browser has no ${R} key.`} Sign it in the browser that holds the campaign's ${R} key, or import that key in Keys.`; }
// Donors get a fresh refund key for every donation. Locked tokens are listed on the public status page,
// so one shared receipt must not unlock any other donation. Each key is in its receipt and kept here as a backup.
const DONOR_KEYS = 'vetlock.donor.keys';
const CAMPS = 'vetlock.campaigns'; const camps = () => { try { const a = JSON.parse(ls.get(CAMPS) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };

const donorKeys = () => { try { const a = JSON.parse(ls.get(DONOR_KEYS) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
const addDonorKey = k => { const a = donorKeys(), i = a.findIndex(x => x.pk === k.pk); if (i >= 0) a[i] = { ...a[i], ...k }; else a.push(k); ls.set(DONOR_KEYS, JSON.stringify(a)); };  // merges: later updates never drop the key
const findDonorKey = pks => { const legacy = key('donor', false); for (const pk of pks) { const k = donorKeys().find(x => x.pk === pk); if (k) return k.sk; if (legacy && pubOf(legacy) === pk) return legacy; } return null; };
// campaign colours: every campaign its own hue, none the pages already use (the keys' orange, blue and green, the green of ✓, the
// red of ✗, bitcoin's orange): pink, yellow, cyan and violet first, then four more. A new campaign takes the first hue free in this
// browser and carries it in its link and ledger, so it looks the same on every page and device. An older campaign without one gets
// the first free hue here, in the order this browser met it (the campaigns it made, then the donations it made), and keeps it.
const CAMP_HUES = [345, 100, 200, 295, 320, 178, 118, 218], CAMPCOL = 'vetlock.campcolors';
const campId = c => String((c && c.name) || '').trim().toLowerCase() + '|' + (Number(c && c.deadline) || 0);
// two campaigns made before links carried their colour, with the colours StreetCat chose for them (5 Nov): they count as their own
// hues wherever a campaign's colour is worked out, and no other campaign is given them
const LEGACY_HUES = { 'tnr|1793923199': 345, 'tnr2|1793923199': 100 }, TAKEN = new Set(Object.values(LEGACY_HUES));
let CAMPMAP = null;
const campMap = () => { if (!CAMPMAP) { try { const m = JSON.parse(localStorage.getItem(CAMPCOL) || '{}'); CAMPMAP = m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch (_) { CAMPMAP = {}; } } return CAMPMAP; };
const freeHue = m => { const used = new Set([...Object.values(m).map(x => x && x.h), ...TAKEN]), pool = CAMP_HUES.filter(x => !TAKEN.has(x)), h = pool.find(x => !used.has(x)); return h === undefined ? pool[Object.keys(m).length % pool.length] : h; };
function campHue(c){ const m = campMap(), id = campId(c), own = LEGACY_HUES[id] != null ? LEGACY_HUES[id] : CAMP_HUES.includes(Number(c && c.hue)) ? Number(c.hue) : null, e = m[id];
  if (own === null && e && CAMP_HUES.includes(e.h)) return e.h;
  if (own !== null && e && e.h === own && e.own) return own;
  m[id] = own !== null ? { h: own, own: true } : { h: freeHue(m), own: false };
  if (own !== null) for (const [k, x] of Object.entries(m)) if (k !== id && x && !x.own && x.h === own) m[k] = { h: freeHue(m), own: false };  // an older campaign gives way
  try { localStorage.setItem(CAMPCOL, JSON.stringify(m)); } catch (_) {} return m[id].h; }
const knownCamps = () => { const a = [], read = k => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  read('vetlock.campaigns').filter(k => k && k.c).sort((x, y) => (x.created || 0) - (y.created || 0)).forEach(k => a.push(k.c));
  read('vetlock.donor.keys').filter(k => k && k.campaign && k.deadline).sort((x, y) => String(x.created || '').localeCompare(String(y.created || ''))).forEach(k => a.push({ name: k.campaign, deadline: k.deadline, hue: k.hue })); return a; };
const newCampHue = () => { knownCamps().forEach(campHue); return freeHue(campMap()); };
knownCamps().forEach(campHue);
const b64u = { enc: s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))) };
const fmtDate = t => new Date(t * 1000).toISOString().slice(0, 10);
const amt = a => (a && typeof a === 'object' && typeof a.toNumber === 'function') ? a.toNumber() : Number(a);  // cashu-ts may hand back Amount objects
const sum = ps => ps.reduce((s, p) => s + amt(p.amount), 0);
// the lock bar: locked → certified → released; the one picture every token shows
function lockBar(state){ const n = { locked: 1, certified: 2, released: 3, refunded: 1 }[state] || 1; const d = document.createElement('div'); d.className = 'lock';
  const parts = [['i', 1], ['b', 1], ['i', 2], ['b', 2], ['i', 3]]; for (const [t, k] of parts) { const e = document.createElement(t); if (k <= n && !(t === 'b' && k >= n)) e.classList.add('on'); if (t === 'i' && k === n && state === 'released') e.classList.add('ok'); d.appendChild(e); }
  for (const [k, l] of [[1, state === 'refunded' ? 'refunded' : 'locked'], [2, 'certified'], [3, 'released']]) { const s = document.createElement('span'); s.textContent = l; if (k <= n) s.classList.add('on'); if (k === n) requestAnimationFrame(() => flap(s, l, { speed: .6 })); d.appendChild(s); } return d; }
function tokenCard(dec, info, state){ info.pubkeys.forEach((k, i) => roleOf(k, i ? 'clinic' : 'streetcat')); info.refund.forEach(k => roleOf(k, 'donor')); const c = document.createElement('div'); c.className = 'tcard'; const memo = String(dec.memo || ''); const m = memo.match(/^(?:released: )?(?:certified: )?(.+?) (?:sterilis|vet-|—|·)/); const name = (m ? m[1] : memo.split(' ')[0] || 'donation').replace(/^certified$/i, 'donation');
  const t = document.createElement('div'); t.className = 'title'; t.textContent = name; c.appendChild(t);
  const op = (dec.memo || '').replace(name, '').split(' — ')[0].replace(/^[\s·]+/, '').trim(); if (op) { const o = document.createElement('div'); o.className = 'mut'; o.textContent = op; c.appendChild(o); }
  const a = document.createElement('div'); a.className = 'amt2'; a.textContent = `${info.amount} sat`; c.appendChild(a); fiatInto(a, info.amount);
  const w = document.createElement('div'); w.className = 'who2'; w.textContent = `clinic ${abbr(info.pubkeys[1] || '')}\nStreetcat ${abbr(info.pubkeys[0])}\nrefund after ${fmtDate(info.locktime)}`; c.appendChild(w);
  c.appendChild(lockBar(state)); return c; }
let RATE = null; const rate = async () => { if (RATE) return RATE; try { const c = JSON.parse(ls.get('vetlock.rate') || 'null'); if (c && Date.now() - c.at < 600000) return RATE = c.eur; } catch (_) {}
  try { const r = await fetch('https://mempool.space/api/v1/prices', { cache: 'no-store' }); const j = await r.json(); if (j && j.EUR) { RATE = j.EUR; ls.set('vetlock.rate', JSON.stringify({ eur: j.EUR, at: Date.now() })); } } catch (_) {} return RATE; };
const eur = (sats, r) => { const v = sats / 1e8 * r; return v < 0.01 ? '< 0,01 €' : v.toFixed(2).replace('.', ',') + ' €'; };
async function fiatInto(el, sats){ const r = await rate(); if (!r || !el || !(sats > 0)) return; const s = document.createElement('span'); s.className = 'mut'; s.textContent = ` ≈ ${eur(sats, r)}`; el.appendChild(s); }
// a short buzz when an operation is confirmed (StreetCat, 5 Nov: "cada vez que se confirmase una operación vibrase también"). Android
// vibrates. An iPhone lets no web page vibrate, but from iOS 18 a switch control that flips gives a haptic tick, and from iOS 18.4
// only within about a second of a tap: a certificate signed here ticks; a release, which waits for the mint, ticks only if the
// mint answers quickly. Elsewhere the hidden switch is a plain checkbox nobody sees.
let TICK = null;
const buzz = () => { try { if (navigator.vibrate && navigator.vibrate(18)) return; } catch (_) {}
  try { if (!TICK) { const l = document.createElement('label'), i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1; l.setAttribute('aria-hidden', 'true');
      l.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none'; l.appendChild(i); document.body.appendChild(l); TICK = l; }
    TICK.click(); } catch (_) {} };
// split-flap (from streetcats.xyz): every letter scrambles through Departure Mono glyphs and settles at its own time;
// only the glyph changes, never the width. Honours prefers-reduced-motion. flap(el, text) resolves to text; the
// optional `from` is what the element shows now (so a change reads as the board flipping from one word to the other).
const FLAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789§¤◊†'.split(''), REDUCE = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function flap(el, text, { speed = 1, hex = false } = {}){ if (!el) return; if (el._flap) cancelAnimationFrame(el._flap); if (REDUCE()) { el.textContent = text; return; }
  const pool = hex ? '0123456789abcdef'.split('') : FLAP, chars = text.split(''), params = chars.map(ch => ({ on: /[A-Za-z0-9]/.test(ch), at: (480 + Math.random() * 720) * speed, every: (45 + Math.random() * 55) * speed, step: -1, g: ch })), start = performance.now();
  const frame = now => { const t = now - start; let done = true; el.textContent = chars.map((ch, i) => { const p = params[i]; if (!p.on || t >= p.at) return ch; done = false; const s = Math.floor(t / p.every); if (s !== p.step) { p.step = s; p.g = pool[Math.floor(Math.random() * pool.length)]; } return p.g; }).join('');
    if (done) { el.textContent = text; el._flap = null; return; } el._flap = requestAnimationFrame(frame); }; el._flap = requestAnimationFrame(frame); }
// a text flipped in with its keys painted from the first frame: every piece of a key keeps its colour while it flips
function flapKeys(el, text, { speed = 1, hex = false } = {}){ if (!el) return; if (el._flap) cancelAnimationFrame(el._flap); el.textContent = ''; el.appendChild(withKeys(text)); if (REDUCE()) return;
  const HEX = '0123456789abcdef'.split(''), runs = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode, chars = n.nodeValue.split(''); runs.push({ n, chars, pool: hex || n.parentNode.closest('.key') ? HEX : FLAP, ps: chars.map(ch => ({ on: /[A-Za-z0-9]/.test(ch), at: (480 + Math.random() * 720) * speed, every: (45 + Math.random() * 55) * speed, step: -1, g: ch })) }); }
  const start = performance.now();
  const frame = now => { const t = now - start; let done = true;
    for (const r of runs) r.n.nodeValue = r.chars.map((ch, i) => { const p = r.ps[i]; if (!p.on || t >= p.at) return ch; done = false; const s = Math.floor(t / p.every); if (s !== p.step) { p.step = s; p.g = r.pool[Math.floor(Math.random() * r.pool.length)]; } return p.g; }).join('');
    if (done) { el._flap = null; return; } el._flap = requestAnimationFrame(frame); };
  el._flap = requestAnimationFrame(frame); }
// a text typed into a terminal like a machine at work: a block cursor runs ahead, each character lands after a quick flicker of
// glyphs, and the machine stops to think now and then (at the first line ends, and once or twice in a long text). Keys keep their
// colours, the cursor takes the colour of what it types, and it stays blinking at the end. With reduced motion the text is simply there.
// With `follow`, a text longer than its box scrolls along under the cursor, as a terminal does.
function typeKeys(el, text, { hex = false, keys = true, dur = 0, think = true, done = null, follow = false } = {}){ if (!el) return; if (el._type) el._type(); el.textContent = ''; el.appendChild(badFrag(text, keys));  /* an error line types itself in red, not in a role's colour */
  typeRun(el, text, { hex, dur, think, done, follow }); }
// the typing itself, over what `el` holds now (its text nodes, keys painted): typeKeys after it has written the text, and a coloured
// text that comes onto the screen (moving texts, below)
function typeRun(el, text, { hex = false, dur = 0, think = true, done = null, follow = false, stay = true } = {}){
  if (REDUCE()) { if (done) done(); return; }
  const HEX = '0123456789abcdef'.split(''), runs = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) { const n = walker.currentNode; runs.push({ n, full: n.nodeValue, pool: hex || n.parentNode.closest('.key') ? HEX : FLAP }); }
  const seq = []; runs.forEach((r, ri) => { for (let i = 0; i < r.full.length; i++) seq.push(ri); }); const N = seq.length; if (!N) { if (done) done(); return; }
  const D = dur || Math.min(2200, 450 + N * 5), stops = new Map();
  if (think) { for (let i = 0, lines = 0; i < N && lines < 4; i++) if (text[i] === '\n') { stops.set(i + 1, 90 + Math.random() * 140); lines++; }
    for (let k = 0; k < (N > 400 ? 2 : N > 30 ? 1 : 0); k++) stops.set(Math.floor(N * (.25 + .5 * Math.random())), 260 + Math.random() * 320); }
  const cur = document.createElement('b'); cur.className = 'cur'; cur.setAttribute('aria-hidden', 'true'); runs.forEach(r => { r.n.nodeValue = ''; }); el.dataset.typing = '1';  /* while it types, nothing else moves it */
  let shown = 0, wait = 0, settle = 0, raf = 0, last = performance.now(); const LAG = 3;
  const render = () => { const fresh = shown - Math.max(0, LAG - settle); let idx = 0;
    for (const r of runs) { const take = Math.max(0, Math.min(r.full.length, shown - idx)); let v = r.full.slice(0, take);
      if (take && idx + take > fresh) { const from = Math.max(0, fresh - idx); v = v.slice(0, from) + v.slice(from).split('').map(ch => /[A-Za-z0-9]/.test(ch) ? r.pool[Math.random() * r.pool.length | 0] : ch).join(''); }
      if (r.n.nodeValue !== v) r.n.nodeValue = v; idx += r.full.length; }
    const at = runs[seq[Math.max(0, shown - 1)]].n; if (cur.previousSibling !== at || cur.parentNode !== at.parentNode) at.parentNode.insertBefore(cur, at.nextSibling); if (follow) el.scrollTop = el.scrollHeight; };
  const frame = now => { const dt = now - last; last = now;
    if (wait > 0) { wait -= dt; cur.classList.add('think'); }
    else { cur.classList.remove('think'); const before = shown; shown = Math.min(N, shown + Math.max(1, Math.round(dt * N / D)));
      for (let i = before + 1; i <= shown; i++) if (stops.has(i)) { shown = i; wait = stops.get(i); stops.delete(i); break; } }
    if (shown >= N && wait <= 0) settle++;
    render();
    if (settle > LAG) { runs.forEach(r => { r.n.nodeValue = r.full; }); cur.classList.add('think'); if (!stay) cur.remove(); raf = 0; delete el.dataset.typing; el._type = () => cur.remove(); if (done) done(); return; }
    raf = requestAnimationFrame(frame); };
  raf = requestAnimationFrame(frame);
  el._type = () => { if (raf) cancelAnimationFrame(raf); raf = 0; runs.forEach(r => { r.n.nodeValue = r.full; }); cur.remove(); delete el.dataset.typing; }; }
// a button that flips its own label without moving: the label is monospace and padded to the same length. A copy button flips to
// "copied" and stays there, filled white, until what it copies changes; a passing word ("select it", "no key") flips back to it.
const BAD_LABEL = /^(no key|select it|not copied|not sent|no relay took it|offline|tick the box|too large|not published)/;  // a button saying something did not work: red while it says so
function flapLabel(b, text, ms = 1600){ const base = b.dataset.label || (b.dataset.label = b.textContent); b.style.minWidth = `calc(${Math.max(base.length, text.length)}ch + 28px)`; b.classList.toggle('bad', BAD_LABEL.test(text)); flap(b, text, { speed: .35 }); clearTimeout(b._back); b._back = setTimeout(() => { b.classList.remove('bad'); flap(b, b.dataset.done || base, { speed: .35 }); }, ms); }
function doneLabel(b, text = 'copied'){ const base = b.dataset.label || (b.dataset.label = b.textContent); b.style.minWidth = `calc(${Math.max(base.length, text.length)}ch + 28px)`; clearTimeout(b._back); b.dataset.done = text; b.classList.add('done'); flap(b, text, { speed: .35 }); }
function undone(b){ if (!b || !b.dataset.done) return; delete b.dataset.done; b.classList.remove('done'); clearTimeout(b._back); flap(b, b.dataset.label, { speed: .35 }); }
// show a text in the current screen's terminal, typed in its role's colour at the one code size; a longer text scrolls in it; tap to close
function termShow(text, role, { hex = false, ms = 8000 } = {}){ const term = [...document.querySelectorAll('section.on .term')].find(t => t.offsetParent !== null); if (!term || REDUCE() && false) return; term.querySelectorAll('.term-text').forEach(e => e.remove());
  const o = document.createElement('div'); o.className = 'term-text'; o.style.setProperty('--h', String(HUE[role] || 60)); const body = document.createElement('span'); o.appendChild(body); const hint = document.createElement('small'); hint.textContent = 'tap to close'; o.appendChild(hint);
  term.appendChild(o); typeKeys(body, text, { hex, follow: true });
  const close = () => { if (o._flapT) clearTimeout(o._flapT); if (body._type) body._type(); o.remove(); }; o.onclick = close; o._flapT = setTimeout(close, ms); }
const copyText = async text => { try { await navigator.clipboard.writeText(text); return true; } catch (_) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} t.remove(); return ok; } };
const smallBtn = (label, onclick) => { const b = document.createElement('button'); b.className = 'sm'; b.type = 'button'; b.textContent = label; b.onclick = onclick; return b; };
const copyBtn = (label, text, echo) => { const b = smallBtn(label, async () => { const ok = await copyText(text); if (ok) doneLabel(b); else flapLabel(b, 'select it', 2500); if (echo) termShow(text, echo.role, echo); }); return b; };
function qrSvg(text){ if (typeof qrcode !== 'function') return null;  // upper case lets a Lightning invoice use the compact alphanumeric QR mode
  const up = /^(lightning:)?ln/i.test(text); const q = qrcode(0, 'M'); q.addData(up ? text.toUpperCase() : text, up ? 'Alphanumeric' : 'Byte'); q.make();
  const box = document.createElement('div'); box.className = 'qr'; box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); return box; }
// Lightning donations waiting for payment: kept here so a reload (a phone switching to the wallet app) cannot lose a paid invoice
const PENDING = 'vetlock.pending';
const pendings = () => { try { const a = JSON.parse(ls.get(PENDING) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
const savePending = p => { const a = pendings().filter(x => x.quote !== p.quote); a.push(p); ls.set(PENDING, JSON.stringify(a)); };
const dropPending = q => ls.set(PENDING, JSON.stringify(pendings().filter(x => x.quote !== q)));
function parseCampaign(text){ text = (text || '').trim(); if (!text) throw new Error('no campaign'); const m = text.match(/#c=([A-Za-z0-9_-]+)/); const j = JSON.parse(m ? b64u.dec(m[1]) : text);
  for (const k of ['name', 'mint', 'streetcat', 'clinic', 'deadline']) if (!j[k]) throw new Error('campaign is missing ' + k); return j; }
// Streetcat's published key (core.js, one line there): a donation link must name it, or the page refuses the donation before any call
// to the mint.
const STREETCAT_KEYS = window.scCore.STREETCAT_KEYS;
const NOT_PUBLISHED = 'This link is not from Streetcat\'s published key. Do not donate through it.';
const published = k => window.scCore.published(k);
// the mint Streetcat's campaigns use: an unsigned link that names another one gets a warning
const EXPECTED_MINTS = ['https://mint.minibits.cash/Bitcoin'];
const PUBKEY = /^0[23][0-9a-f]{64}$/i;
// a link is just text anyone can write: check everything a lock depends on before money moves
const openCampaign = text => { const c = parseCampaign(text), d = Number(c.deadline), now = Date.now() / 1000;
  if (!Number.isInteger(d)) throw new Error('this campaign has no valid deadline, so a donation could never be refunded: do not use this link');
  if (d <= now) throw new Error(`this campaign closed on ${fmtDate(d)}: a donation now could be taken back at once, so the page does not accept it`);
  if (d > now + 2 * 366 * 86400) throw new Error(`this campaign's deadline is ${fmtDate(d)}, more than two years away: ask Streetcat for a link with a sensible deadline`);
  for (const k of ['streetcat', 'clinic']) if (!PUBKEY.test(String(c[k])) || !window.scCore.pointOk(String(c[k]))) throw new Error(`the ${k} key in this link is not a valid public key: do not use this link`);
  if (String(c.streetcat).toLowerCase() === String(c.clinic).toLowerCase()) throw new Error('the clinic key and the Streetcat key are the same: do not use this link');
  if (!published(c.streetcat)) throw new Error(NOT_PUBLISHED);  // signed or not: a valid signature by another key says nothing
  if (!/^https:\/\//i.test(c.mint) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(c.mint)) throw new Error('the mint in this link is not an https address: do not use this link');
  return { ...c, deadline: d }; };
// the link's signature (core.js): a signed link is used as signed, field by field; a broken one moves no money; an unsigned one
// (made before links were signed) opens with a notice
async function openSigned(text){ const c = openCampaign(text), st = await window.scCore.campaignSig(c);
  if (st === 'broken') throw new Error('the signature on this link does not match: it was changed after Streetcat made it. Do not donate through it, and ask Streetcat for the link again');
  return st === 'signed' ? { ...window.scCore.campSigned(c), sig: c.sig } : c; }
const mintExpected = m => EXPECTED_MINTS.includes(String(m || '').trim().replace(/\/+$/, ''));
// the lock as written in the proofs the mint signed, compared with what the campaign promises
function lockMatches(c, refundPk, proofs){ for (const p of proofs) { let s; try { s = JSON.parse(p.secret); } catch (_) { return false; } if (!Array.isArray(s) || s[0] !== 'P2PK') return false; const d = s[1] || {}, t = Object.fromEntries((d.tags || []).map(x => [x[0], x.slice(1)]));
    const keys = [d.data].concat(t.pubkeys || []).map(k => String(k).toLowerCase()).sort().join(), want = [c.streetcat, c.clinic].map(k => String(k).toLowerCase()).sort().join();
    if (keys !== want || Number((t.n_sigs || [])[0]) !== 2 || Number((t.locktime || [])[0]) !== Number(c.deadline) || !(t.refund || []).includes(refundPk)) return false; } return proofs.length > 0; }
// the lock every proof of a token carries: they must all carry the same one (keys, signatures needed, deadline), or it is not one donation
function lockInfo(proofs){ const one = p => { let s; try { s = JSON.parse(p.secret); } catch (_) { s = null; } if (!Array.isArray(s) || !s[1] || typeof s[1].data !== 'string') throw Object.assign(new Error('this is not a locked donation token'), { byPage: true }); const d = s[1], tags = Object.fromEntries((d.tags || []).map(t => [t[0], t.slice(1)]));
    if ((tags.sigflag || ['SIG_INPUTS'])[0] !== 'SIG_INPUTS') throw Object.assign(new Error(`its lock has an unusual signature rule (${tags.sigflag[0]}): it is not a donation's lock, do not use it`), { byPage: true });
    if (Number((tags.n_sigs_refund || ['1'])[0]) !== 1) throw Object.assign(new Error('its lock has an unusual refund rule (more than one refund signature): it is not a donation\'s lock, do not use it'), { byPage: true });
    return { kind: s[0], pubkeys: [d.data].concat(tags.pubkeys || []), nsigs: Number((tags.n_sigs || ['1'])[0]), refund: tags.refund || [], locktime: Number((tags.locktime || ['0'])[0]) }; };
  if (!proofs || !proofs.length) throw Object.assign(new Error('this token holds no ecash'), { byPage: true });
  const all = proofs.map(one), a = all[0], main = x => [x.kind, x.pubkeys.join().toLowerCase(), x.nsigs, x.locktime].join('|');
  if (all.some(x => main(x) !== main(a))) throw Object.assign(new Error('its parts are locked to different conditions, so it is not one donation: do not use it'), { byPage: true });
  return { kind: a.kind, pubkeys: a.pubkeys, nsigs: a.nsigs, refund: [...new Set(all.flatMap(x => x.refund))], locktime: a.locktime, amount: sum(proofs) }; }
// the campaign a lock belongs to, if this browser made it; otherwise the name the token's memo gives
const campName = (info, memo) => { const lc = k => String(k || '').toLowerCase(), k = camps().find(x => x && x.c && lc(x.c.streetcat) === lc(info.pubkeys[0]) && lc(x.c.clinic) === lc(info.pubkeys[1]) && Number(x.c.deadline) === info.locktime); return k ? k.c.name : (String(memo || '').split(' ')[0] || 'the campaign'); };
// the clinic's part, proof by proof: "certified" only when every proof carries a valid signature from the campaign's clinic key
function clinicSigs(proofs, info, memo){ const clinic = String(info.pubkeys[1] || '').toLowerCase(), sc = String(info.pubkeys[0] || '').toLowerCase(), name = campName(info, memo); let signed = 0, other = 0;
  for (const p of proofs) { let n = 0; try { n = cashu.getP2PKWitnessSignatures(p.witness).length; } catch (_) {} if (!n) continue;
    let byClinic = false, bySc = false; try { byClinic = cashu.hasP2PKSignedProof(clinic, p); bySc = cashu.hasP2PKSignedProof(sc, p); } catch (_) {}
    if (byClinic) signed++; else if (!bySc) other++; }
  const n = proofs.length, ok = n > 0 && signed === n;
  const text = ok ? `✓ certified: all ${n} proof${n === 1 ? '' : 's'} signed with ${name}'s clinic key ${abbr(clinic)}` : signed ? `✗ Partly signed (${signed} of ${n}) — not certified` : other ? `✗ Signed with a key that is not ${name}'s clinic key (${abbr(clinic)}) — not certified` : `not signed by the clinic yet (${name}'s clinic key is ${abbr(clinic)})`;
  return { ok, n, signed, other, text }; }
const yHex = p => cashu.hashToCurve(new TextEncoder().encode(p.secret)).toHex(true).toLowerCase();
// before a release: what the mint says is still unspent. A donor may have taken part back after the deadline, or part may be released already
async function stillLocked(w, proofs, info){ const states = await w.checkProofsStates(proofs), byY = new Map(states.map(s => [String(s.Y).toLowerCase(), s])), live = [], gone = [], kinds = new Set();
  for (const p of proofs) { const s = byY.get(yHex(p)) || {}; if (s.state === 'UNSPENT') { live.push(p); continue; } gone.push(p);
    if (s.state === 'PENDING') { kinds.add('being spent at the mint right now'); continue; } let k = 'spent';
    try { const pw = { ...p, witness: s.witness }; if (s.witness && info.refund.some(r => cashu.hasP2PKSignedProof(r, pw))) k = 'taken back by the donor'; else if (s.witness && cashu.hasP2PKSignedProof(info.pubkeys[0], pw) && cashu.hasP2PKSignedProof(info.pubkeys[1], pw)) k = 'released already'; } catch (_) {}
    kinds.add(k); }
  return { live, gone, why: [...kinds].join(', ') }; }
// STREETCAT'S LEDGER: each donation that reaches this browser's Release tab is kept here by its DON- code (as locked: no signatures), with
// what was released from it, so that Home can copy the campaign's ledger (version 2, core.js) for publishing. Only locked tokens, no key.
const SCLEDGER = 'vetlock.sc.ledger', lockId = info => [info.pubkeys.join(), info.locktime].join('|').toLowerCase();
const scLedger = () => { try { const m = JSON.parse(ls.get(SCLEDGER) || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch (_) { return {}; } };
async function ledgerKeep(dec, info, part){ if (!window.scCore) return; const all = scLedger(), id = lockId(info), L = all[id] || (all[id] = { entries: {} });
  const proofs = dec.proofs.map(p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(p.dleq ? { dleq: p.dleq } : {}) })), ref = await scCore.donRef(proofs.map(yHex));
  const e = L.entries[ref] || (L.entries[ref] = { token: cashu.getEncodedToken({ mint: dec.mint, proofs }), amount: sum(proofs), date: new Date().toISOString().slice(0, 10), parts: [] });
  if (part) e.parts.push(part); ls.set(SCLEDGER, JSON.stringify(all)); }
const tokAmount = t => { try { return Number(cashu.getTokenMetadata(t).amount) || 0; } catch (_) { return 0; } };
const ledgerFor = c => { const L = scLedger()[[String(c.streetcat), String(c.clinic)].join().toLowerCase() + '|' + Number(c.deadline)] || { entries: {} }, entries = Object.entries(L.entries).map(([ref, e]) => ({ ref, ...e, amount: Number(e.amount) || tokAmount(e.token), parts: e.parts || [], remainders: e.remainders || [] }));  /* each donation's original amount and every part */
  let certificates = []; try { certificates = sreqs().filter(r => r.answer && r.answer.kind === 'certified' && r.check && r.check.ok && campKey(r.q.campaign) === campKey(c)).map(r => ({ statement: r.answer.statement, sig: r.answer.sig })); } catch (_) {}  /* the clinic's signed declarations, for anyone to check */
  return window.scCore ? scCore.ledgerV2({ campaign: c, clinicKeySource: '', entries, certificates }) : { campaign: c, donations: entries.map(e => e.token) }; };
// past the deadline a donation can still be certified: the donor may take it back at any moment, and the mint lets whoever comes first spend it
const lateNote = info => info.locktime && info.locktime < Date.now() / 1000 ? `⚠ The refund date (${fmtDate(info.locktime)}) has passed: the donor may take these sats back at any moment. It can still be certified: Streetcat can release whatever is still locked.\n` : '';
function describe(info, mint){ info.pubkeys.forEach((k, i) => roleOf(k, i ? 'clinic' : 'streetcat')); info.refund.forEach(k => roleOf(k, 'donor')); return `${info.amount} sat at ${mint}\nlocked to ${info.nsigs} of ${info.pubkeys.length} signatures\nrefund to ${info.refund.length ? info.refund.map(k => k.slice(0, 10) + '…').join(', ') : 'nobody'} after ${info.locktime ? fmtDate(info.locktime) : 'never'}`; }
// the mint's keys (NUT-01/02) are kept here each time the mint answers, so that a token can be read, checked and signed without a
// connection: signing is local, and reading a token only needs the mint's keys. Whatever spends (lock, release, refund) needs the mint.
const MINTCACHE = 'vetlock.mintcache', WALLETS = {};
const mintCache = () => { try { const m = JSON.parse(ls.get(MINTCACHE) || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch (_) { return {}; } };
async function wallet(mint){ mint = mint.replace(/\/$/, ''); if (WALLETS[mint] && !WALLETS[mint]._vlOffline) return WALLETS[mint];
  const w = new cashu.Wallet(mint);
  try { await w.loadMint(); } catch (e) { const c = mintCache()[mint]; if (!c || !c.info || !c.keys) throw e;  // no answer: read with the keys kept last time
    const o = new cashu.Wallet(mint); o.loadMintFromCache(c.info, c.keys); o._vlOffline = c.at || 1; return WALLETS[mint] = o; }
  try { const all = mintCache(); all[mint] = { info: w.getMintInfo().cache, keys: w.keyChain.cache, at: Date.now() }; ls.set(MINTCACHE, JSON.stringify(all)); } catch (_) {}
  return WALLETS[mint] = w; }
async function decodeTok(t){ const meta = cashu.getTokenMetadata(t); const w = await wallet(meta.mint); return { w, dec: w.decodeToken(t) }; }
const show = (el, text, cls) => { text = String(text == null ? '' : text); cls = cls || (BAD_TEXT.test(text) ? 'bad' : ''); el.className = 'out' + (cls ? ' ' + cls : ''); if (cls === 'bad') el.textContent = text; else setLines(el, text); };  // red when it is an error; otherwise its error lines
const busy = (btn, on) => { btn.disabled = on || btn.classList.contains('fin'); };
// a finished action: its button says what happened and cannot be pressed again (StreetCat, 5 Nov: "tiene que quedar claro que el token
// se ha liberado"); a new token, or "… another token", brings it back
const finish = (btn, text) => { if (!btn.classList.contains('fin')) btn.dataset.idle = btn.textContent; btn.classList.add('fin'); btn.disabled = true; btn.textContent = text; };
const unfinish = btn => { if (!btn.classList.contains('fin')) return; btn.classList.remove('fin'); btn.disabled = false; btn.textContent = btn.dataset.idle || btn.textContent; };
const storageWorks = () => { try { const k = 'vetlock.probe'; localStorage.setItem(k, '1'); const ok = localStorage.getItem(k) === '1'; localStorage.removeItem(k); return ok; } catch (_) { return false; } };
const NO_STORAGE = 'this browser does not let the page save anything (a private window?). Open it in a normal window: if the page closed at the wrong moment, the sats could be lost.';

// SAFE MINT CALLS. The page builds the new outputs itself and saves them before asking the mint. If the mint's answer is lost
// (dropped connection, closed tab), the mint hands the signatures back on request (NUT-09 restore), so nothing is lost.
const outSave = o => ({ a: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B: o.blindedMessage.B_, r: o.blindingFactor.toString(16), s: new TextDecoder().decode(o.secret) });
const outLoad = x => new cashu.OutputData({ amount: cashu.Amount.from(x.a), id: x.id, B_: x.B }, BigInt('0x' + x.r), new TextEncoder().encode(x.s));
async function buildOutputs(w, amount, lock){ const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id);
  return lock ? cashu.OutputData.createP2PKData(lock.toOptions(), amount, ks) : cashu.OutputData.createRandomData(amount, ks); }
async function restoreOutputs(w, saved){ const outs = saved.map(outLoad); const res = await w.mint.restore({ outputs: outs.map(o => o.blindedMessage) });
  const sigs = new Map((res.outputs || []).map((o, i) => [o.B_, (res.signatures || [])[i]])); if (!outs.length || !outs.every(o => sigs.get(o.blindedMessage.B_))) return null;
  const proofs = []; for (const o of outs) proofs.push(o.toProof(sigs.get(o.blindedMessage.B_), await w.keyChain.ensureKeysetKeys(o.blindedMessage.id))); return proofs; }
// swaps (lock pasted ecash, release, refund) that survive a lost answer; unfinished ones are retried when the page opens
const INFLIGHT = 'vetlock.inflight';
const flights = () => { try { const a = JSON.parse(ls.get(INFLIGHT) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
const saveFlight = f => { const a = flights().filter(x => x.id !== f.id); a.push(f); ls.set(INFLIGHT, JSON.stringify(a)); };
const dropFlight = id => ls.set(INFLIGHT, JSON.stringify(flights().filter(x => x.id !== id)));
async function safeSwap(w, inputs, { lock, privkey, what, mint }){ if (!storageWorks()) throw new Error(NO_STORAGE);
  const fee = amt(w.getFeesForProofs(inputs)), amount = sum(inputs) - fee; if (amount <= 0) throw new Error('nothing would be left after the mint fee');
  const outs = await buildOutputs(w, amount, lock), id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  saveFlight({ id, what, mint: norm(mint), ys: inputs.map(p => cashu.hashToCurve(new TextEncoder().encode(p.secret)).toHex(true)), outputs: outs.map(outSave), created: new Date().toISOString() });
  try { let b = w.ops.receive(inputs); if (privkey) b = b.privkey(privkey); const proofs = await b.asCustom(outs).run(); dropFlight(id); return proofs; }
  catch (e) { if (cashu.isMintOperationError(e)) { dropFlight(id); throw e; }  // the mint answered and refused: nothing happened
    // no answer: the mint may or may not have done it, now or later. Recover if it did; otherwise keep the record for next time.
    let spent = false; try { spent = (await w.checkProofsStates(inputs)).every(s => s.state === 'SPENT'); } catch (_) {}
    if (spent) { const back = await restoreOutputs(w, outs.map(outSave)).catch(() => null); if (back) { dropFlight(id); return back; } }
    throw Object.assign(new Error((spent ? 'the mint took the ecash but its answer was lost, and it could not hand the result back yet.' : 'the mint did not answer, so it is not known whether it did it.') + ' Nothing is lost: this browser kept what it needs, so open this page again later and it will finish, or simply try again. (' + (e.message || e) + ')'), { kept: true }); } }
const whyFailed = e => (e && e.kept ? 'Interrupted: ' : e && e.byPage ? 'Not possible: ' : 'Mint refused: ') + ((e && e.message) || e);
const norm = u => String(u || '').trim().replace(/\/+$/, '');
// released tokens are plain bearer ecash: kept here until Streetcat has them in its wallet
const RELEASED = 'vetlock.released';
const releasedList = () => { try { const a = JSON.parse(ls.get(RELEASED) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
const addReleased = r => { const a = releasedList(); if (!a.some(x => x.token === r.token)) a.push(r); ls.set(RELEASED, JSON.stringify(a.slice(-50))); };
const unpaid = () => releasedList().filter(r => !r.paid);  // what was sent to Streetcat's Lightning address is no longer here
function renderReleased(){ const box = $('s-saved'); if (!box) return; box.textContent = ''; const a = unpaid(); if (!a.length) return;
  box.appendChild(document.createTextNode('Released, still in this browser — move them to a wallet:'));
  for (const r of a.slice(-10).reverse()) { const p = r.paying && payouts().find(x => x.id === r.paying && x.state === 'pending');
    box.appendChild(p ? el('div', 'mut bad', `${r.amount} sat · being sent to ${p.to}: the mint has not said yet that it went through`) : copyBtn(`${r.amount} sat · ${String(r.at).slice(0, 10)}`, r.token)); }
  box.appendChild(smallBtn('forget all', () => { if (confirm('Forget the released tokens kept here? Do it only once they are all in Streetcat\'s wallet.')) { ls.set(RELEASED, '[]'); renderReleased(); } })); }
// what Streetcat releases goes straight to its Lightning address, set once in Home (StreetCat, 6 Nov: "lo suyo es que fuese directamente
// una dirección Lightning"): the largest invoice the mint can pay from the released ecash after its fees. The payment is written down
// before it is sent, so a lost answer is asked about again, never paid twice; if it fails, the ecash stays here, as without an address.
const PAYTO = 'vetlock.sc.payto', PAYOUTS = 'vetlock.sc.payouts';
const payTo = () => { const a = String(ls.get(PAYTO) || '').trim(); return a && window.scCore && window.scCore.lnAddressUrl(a) ? a : ''; };
const payouts = () => { try { const a = JSON.parse(ls.get(PAYOUTS) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }, savePayout = m => ls.set(PAYOUTS, JSON.stringify([...payouts().filter(x => x.id !== m.id), m].slice(-60)));  /* read as the page opens, before jget exists */
const markReleased = (token, patch) => ls.set(RELEASED, JSON.stringify(releasedList().map(x => x.token === token ? { ...x, ...patch } : x)));
async function payOut(w, proofs, token, mint){ const to = payTo(); if (!to) throw new Error('no Lightning address is set in Home'); const total = sum(proofs);
  let inFee = 0; try { inFee = amt(w.getFeesForProofs(proofs)); } catch (_) {}
  let want = Math.max(1, total - inFee - reserveGuess(total)), best = null;
  for (let i = 0; i < 2; i++) { const inv = (await window.scCore.lnAddressInvoice(to, want)).invoice, q = await w.createMeltQuoteBolt11(inv), room = total - inFee - amt(q.fee_reserve);  /* the exact room once the mint's reserve is known */
    if (amt(q.amount) <= room) { best = { inv, q }; if (room === amt(q.amount)) break; want = room; } else { if (best || room < 1) break; want = room; } }
  if (!best) throw new Error(`the mint keeps too much for fees to pay ${fmtSat(total)} out by Lightning`);
  const m = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), quote: best.q.quote, amount: amt(best.q.amount), to, mint: norm(mint), token, at: nowIso(), state: 'pending' }; savePayout(m); markReleased(token, { paying: m.id });
  try { const res = await w.ops.meltBolt11(best.q, proofs).run(); if (res.quote && res.quote.state && res.quote.state !== 'PAID') return { pending: true, amount: m.amount };
    return settlePayout(m, 'PAID', res.change || []);
  } catch (e) { let st = ''; try { st = (await w.checkMeltQuoteBolt11(best.q.quote)).state; } catch (_) {}
    if (st === 'PAID') return settlePayout(m, 'PAID', []); if (st === 'UNPAID') { settlePayout(m, 'UNPAID'); throw e; } return { pending: true, amount: m.amount }; } }
function settlePayout(m, state, change = []){ m.done = nowIso();
  if (state !== 'PAID') { m.state = 'failed'; savePayout(m); markReleased(m.token, { paying: null }); return null; }
  m.state = 'paid'; savePayout(m); markReleased(m.token, { paid: m.to, sent: m.amount, paying: null }); const c = sum(change);
  if (c) addReleased({ token: cashu.getEncodedToken({ mint: m.mint, proofs: change, memo: 'change of a payment to ' + m.to }), amount: c, memo: 'change', at: nowIso() });  /* what the mint kept for fees and did not use */
  return { sent: m.amount, change: c }; }
async function recheckPayouts(){ let n = 0; for (const m of payouts().filter(x => x.state === 'pending')) { try { const q = await (await wallet(m.mint)).checkMeltQuoteBolt11(m.quote); if (q.state === 'PAID' || q.state === 'UNPAID') { settlePayout(m, q.state); n++; } } catch (_) {} }
  if (n) { renderReleased(); renderHome(); } }
// after a release: paid at once to the address when one is set; without one, or if paying fails, kept here to be copied
async function releasedOut(out, { w, proofs, plain, mint, head, keep, label = 'copy token' }){ const to = payTo();
  const keepIt = (lead, cls) => { show(out, lead + '\n', cls); const r3 = el('div', 'row1'); r3.appendChild(copyBtn(label, plain, { role: 'streetcat' })); out.appendChild(r3);
    const f3 = el('details', 'more'), s3 = el('summary', null, 'token text'); f3.appendChild(s3); f3.appendChild(document.createTextNode('\n')); f3.appendChild(el('span', 'mut code', plain)); f3.appendChild(document.createTextNode('\n')); out.appendChild(f3); renderReleased(); renderHome(); };
  if (!to) return keepIt(`${head} ${keep}`, 'ok');
  show(out, `${head} Sending it to ${to}…`); renderReleased();
  let po = null, why = ''; try { po = await payOut(w, proofs, plain, mint); } catch (e) { why = e.message || String(e); } renderReleased(); renderHome();
  if (po && !po.pending) { show(out, `${head} ${fmtSat(po.sent)} sent to ${to} ✓` + (po.change ? `. The other ${fmtSat(po.change)}, which the mint kept for fees and did not use, stayed here as ecash, under Release.` : '.'), 'ok'); return; }
  if (po && po.pending) { show(out, `⚠ ${head} Sending ${fmtSat(po.amount)} to ${to}: the mint has not said yet that it went through. Do not send it again: this page asks the mint again when it opens.`, 'bad'); return; }
  keepIt(`✗ ${head} Not sent to ${to}: ${why}. The ${fmtSat(sum(proofs))} stay in this browser: copy them into Streetcat's wallet now (this browser keeps a copy under Release):`, 'bad'); }
// on opening the page: finish any swap whose answer was lost last time
async function recoverFlights(){ const found = [];
  for (const f of flights()) { try { const w = await wallet(f.mint); const st = (await w.mint.check({ Ys: f.ys })).states || [];
      const old = Date.now() - Date.parse(f.created || 0) > 24 * 3600 * 1000;
      if (st.length && st.every(s => s.state === 'UNSPENT')) { if (old) dropFlight(f.id); continue; }  // not taken (yet: another tab may still be at it)
      if (!(st.length && st.every(s => s.state === 'SPENT'))) continue;  // pending or unknown: ask again next time
      const back = await restoreOutputs(w, f.outputs);  // a network error throws: kept for next time
      if (!back) { dropFlight(f.id); continue; }  // spent by another request (a retry, another tab), not with these outputs
      const token = cashu.getEncodedToken({ mint: f.mint, proofs: back, memo: 'recovered ' + ((f.what && f.what.kind) || '') });
      if (f.what && f.what.kind === 'donation' && f.what.campaign && f.what.pk && !lockMatches(f.what.campaign, f.what.pk, back)) { found.push({ kind: 'donation (lock check FAILED: do not send it; write to Streetcat)', token, amount: sum(back) }); dropFlight(f.id); continue; }
      if (f.what && f.what.kind === 'donation' && f.what.pk) addDonorKey({ pk: f.what.pk, lockedToken: token, amount: sum(back), mint: f.mint });
      if (f.what && f.what.kind === 'release') addReleased({ token, amount: sum(back), memo: f.what.memo || '', at: new Date().toISOString() });
      if (f.what && f.what.kind === 'refund' && f.what.pk) addDonorKey({ pk: f.what.pk, refundToken: token, refunded: new Date().toISOString() });
      dropFlight(f.id); found.push({ kind: (f.what && f.what.kind) || 'swap', token, amount: sum(back) });
    } catch (_) {} }
  if (!found.length) return; const box = $('recovered'); box.hidden = false; box.textContent = '';
  box.appendChild(Object.assign(document.createElement('label'), { textContent: 'Recovered: an operation was interrupted last time and the mint handed its result back' }));
  for (const r of found) { const d = document.createElement('div'); d.className = 'out ok'; d.textContent = `${r.kind}: ${r.amount} sat\n${r.token}\n`; d.appendChild(copyBtn('copy token', r.token)); box.appendChild(d); } }

// tabs
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === b.dataset.t)); refreshKeys(); }));
// one page, three people: each role sees only its tabs, and the header switches between them (an address of one role keeps to it);
// a campaign link means a donor, and so does a first visit
const ROLEKEY = 'vetlock.role', ROLENAME = { donor: 'donor', clinic: 'clinic', streetcat: 'Streetcat' }, nav = document.querySelector('nav'), roleTabs = [...document.querySelectorAll('#hd-roles button')];
// a screen of two roles (Keys, the cats) stays in the role it is opened from; otherwise it is its first role's
const tabRole = t => { const rs = (document.querySelector(`nav button[data-t="${t}"]`).dataset.role || '').split(' '); return rs.includes(nav.dataset.role) ? nav.dataset.role : rs[0]; };
function setRole(r){ if (!ROLENAME[r]) r = 'donor'; const was = nav.dataset.role; ls.set(ROLEKEY, r); nav.dataset.role = r; nav.hidden = false; document.body.dataset.role = r;
  for (const b of roleTabs) { const on = b.dataset.r === r; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    if (on && was !== r) flap(b, b.dataset.label || (b.dataset.label = b.textContent)); }  /* the letters turn over once, when the role changes */
  updateBack(); const on = document.querySelector('nav button.on'), first = document.querySelector(`nav button[data-role~="${r}"]`);
  if (!on || !(on.dataset.role || '').split(' ').includes(r)) first.click(); else document.getElementById(on.dataset.t).classList.add('on'); }
document.addEventListener('click', e => { if (e.target.id === 'd-torefund') { e.preventDefault(); openTab('refund'); } if (e.target.id === 'r-todonate') { e.preventDefault(); openTab('donate'); }
  if (e.target.id === 'd-toecash') { e.preventDefault(); if (!$('donate').classList.contains('sigbad')) openTab('decash'); } });  /* a broken or unpublished link: no way to pay, by ecash either */
const HOME = { donor: 'donate', clinic: 'work', streetcat: 'home' };
// one step back from a screen inside a role: its parent screen, else the role's first screen
const BACK = { creq: 'work', certify: 'work', csettings: 'work', coffline: 'work', scamp: 'home', skind: 'home', spick: 'snew', snew: 'scamp', sreq: 'scamp', shand: 'home', dhand: 'donate', dcard: 'donate', decash: 'donate', cat: 'cats', catnew: 'cats' };  /* catnew: its request, when it was opened from one */
function updateBack(){ const r = nav.dataset.role, on = document.querySelector('nav button.on'); $('hd-back').hidden = !r || !on || on.dataset.t === HOME[r]; }
$('hd-back').onclick = () => { const r = nav.dataset.role, on = document.querySelector('nav button.on'), up = on && BACK[on.dataset.t]; if (!r) return; const to = up && tabRole(up) === r ? up : HOME[r], prev = navStack[navStack.length - 2];
  if (prev && prev.t === to && prev.r === r) history.back(); else openTab(to); };  /* the screen before, when it is the one the arrow leads to: as the phone's back */
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { updateBack(); if (b.dataset.t === 'home') renderHome(); }));
// the phone's own back (a swipe on an iPhone, the back button on Android) goes back one screen inside the app, not out of it (StreetCat, 6 Nov):
// every screen opened after the page has started is a step in the browser's history, and going back opens the screen of the step before
let navReady = false, navRestoring = false; const navStack = [], navState = () => ({ t: (document.querySelector('nav button.on') || { dataset: {} }).dataset.t, r: nav.dataset.role });
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { if (!navReady || navRestoring) return; const s = navState(), top = navStack[navStack.length - 1];
  if (top && top.t === s.t && top.r === s.r) return; navStack.push(s); history.pushState({ ...s, sc: 1 }, ''); }));
addEventListener('popstate', e => { const s = e.state; if (!s || !s.sc || !s.t) return; navStack.pop(); if (!navStack.length) navStack.push({ t: s.t, r: s.r }); navRestoring = true;
  try { setRole(s.r); document.querySelector(`nav button[data-t="${s.t}"]`).click(); } finally { navRestoring = false; } });
const openTab = t => { setRole(tabRole(t)); document.querySelector(`nav button[data-t="${t}"]`).click(); };
// a role in the header: another role switches to it; the role on screen goes back to its first screen
for (const b of roleTabs) b.onclick = () => { const r = b.dataset.r; if (nav.dataset.role === r) openTab(HOME[r]); else setRole(r); window.scrollTo(0, 0); };
// a role can also come from the address: /donate, /clinic, /streetcat (or ?role=…): that page never asks
const pathRole = ((location.pathname.replace(/\/+$/, '').split('/').pop() || '').toLowerCase().replace('donate', 'donor')), qRole = (new URLSearchParams(location.search).get('role') || '').toLowerCase();
const fixedRole = ROLENAME[pathRole] ? pathRole : ROLENAME[qRole] ? qRole : '';
document.body.classList.toggle('fixed', !!fixedRole);  // there the header shows only that role
setRole(location.hash.includes('#c=') ? 'donor' : fixedRole || ls.get(ROLEKEY) || 'donor');
function refreshKeys(){ undone($('c-copy')); undone($('s-copy'));  // a new or imported key has not been copied yet
  for (const [role, el, x] of [['clinic', 'c-pk', 'x-c'], ['streetcat', 's-pk', 'x-s']]) { const sk = key(role, false), n = oldKeys(role).length; heldKeys(role).forEach(k => roleOf(pubOf(k), role)); const pk = sk ? pubOf(sk) : '— (none yet)';
    if (el) $(el).textContent = pk; $(x).textContent = pk; for (const id of [el + '-old', x + '-old']) if ($(id)) $(id).textContent = n ? ` + ${n} older key${n > 1 ? 's' : ''} kept` : ''; }
  const n = donorKeys().length, legacy = key('donor', false); $('x-d').textContent = (n ? `${n} key${n > 1 ? 's' : ''}, one per donation` : '— (none yet)') + (legacy ? ` · older shared key ${pubOf(legacy).slice(0, 10)}…` : ''); }
refreshKeys();
const makeKey = (role, warn) => { if (key(role, false) && !confirm(warn)) return; if (!setKey(role, newKey())) alert('This browser could not save a new key, so nothing changed.'); else buzz(); refreshKeys(); const code = $(role === 'clinic' ? 'c-pk' : 's-pk'); if (code) flapKeys(code, code.textContent, { speed: .6, hex: true }); };
$('c-new').onclick = () => makeKey('clinic', 'Make a new clinic key? Publish the new public key before donations use it. The current key stays in this browser, so tokens locked to it can still be certified here.');
$('s-new').onclick = () => makeKey('streetcat', 'Make a new Streetcat key? New campaigns will use it. The current key stays in this browser, so tokens locked to it can still be released here.');
$('c-show').onclick = () => alert('Clinic private key (keep it secret):\n' + (key('clinic', false) || 'none'));
$('s-show').onclick = () => alert('Streetcat private key (keep it secret):\n' + (key('streetcat', false) || 'none'));
for (const [id, role] of [['c-copy', 'clinic'], ['s-copy', 'streetcat']]) $(id).onclick = async () => { const b = $(id), sk = key(role, false);  // the public key is what goes into a campaign
  if (!sk) return flapLabel(b, 'no key'); const ok = await copyText(pubOf(sk)); if (ok) doneLabel(b); else flapLabel(b, 'select it'); if (ok) termShow(pubOf(sk), role, { hex: true, ms: 6000 }); };
// everything else this browser keeps goes with the keys (StreetCat, 7 Nov, 23:23: «Por qué no se han importado las claves de las
// campañas»): campaigns, donations, requests, partners, colonies, cat records, released tokens, settings, and the photos. The keys
// stay where they were in the export, so an app of before still takes them. Not moved: what is under way here (payments and swaps
// this browser finishes), caches, and this browser's own screen.
const XSKIP = new Set(['vetlock.clinic.sk', 'vetlock.streetcat.sk', 'vetlock.donor.sk', 'vetlock.clinic.old', 'vetlock.streetcat.old', 'vetlock.donor.keys', 'vetlock.pending', 'vetlock.inflight', 'vetlock.mintcache', 'vetlock.probe', 'vetlock.role', 'vetlock.kform']);
const xMovable = k => /^vetlock\.[\w.-]+$/.test(k) && !XSKIP.has(k), xObj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const xData = () => { const d = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i), v = xMovable(k) ? localStorage.getItem(k) : null; if (v != null && !['', '[]', '{}', 'null'].includes(v)) d[k] = v; } } catch (_) {} return d; };
// the photos, read ahead as Keys opens: an iPhone lets a page copy only while the tap counts, and reading them takes longer
let XPH = null, XPHP = null;
const xPrep = () => XPHP = (async () => { const out = { photos: {}, parts: {} };
  try { for (const s of ['photos', 'parts']) for (const k of (await IDB.keys(s)) || []) { const v = await IDB.get(s, k).catch(() => null);
    if (s === 'photos' && v) out.photos[k] = b64of(v instanceof Uint8Array ? v : new Uint8Array(v)); else if (s === 'parts' && typeof v === 'string') out.parts[k] = v; } } catch (_) {}
  return XPH = out; })();
// what an export carries besides the keys, in words ('' when nothing)
const xWhat = (d, ph) => { d = xObj(d); const n = k => { try { const a = JSON.parse(d[k] || 'null'); return Array.isArray(a) ? a.length : 0; } catch (_) { return 0; } };
  let dons = 0; try { for (const L of Object.values(xObj(JSON.parse(d['vetlock.sc.ledger'] || '{}')))) dons += Object.keys(xObj(L && L.entries)).length; } catch (_) {}
  return [[n('vetlock.campaigns'), 'campaign'], [dons, 'donation'], [n('vetlock.sc.requests') + n('vetlock.clinic.requests'), 'request'], [n('vetlock.sc.partners'), 'partner'], [n('vetlock.sc.colonies'), 'colony', 'colonies'], [n('vetlock.sc.cats') + n('vetlock.clinic.cats'), 'cat record'], [n('vetlock.released'), 'released token'], [Object.keys(xObj(ph)).length, 'photo']]
    .filter(x => x[0] > 0).map(([c, w, pl]) => `${c} ${c === 1 ? w : pl || w + 's'}`).join(' · '); };
const xText = (j, d, ph) => JSON.stringify({ ...j, ...(Object.keys(d).length ? { data: d } : {}), ...(ph && Object.keys(ph.photos).length ? { photos: ph.photos } : {}), ...(ph && Object.keys(ph.parts).length ? { parts: ph.parts } : {}) }, null, 1);
$('x-exp').onclick = async () => { const j = { clinic: key('clinic', false), clinicOld: oldKeys('clinic'), streetcat: key('streetcat', false), streetcatOld: oldKeys('streetcat'), donor: key('donor', false), donorKeys: donorKeys() }, d = xData(); if (!XPHP) xPrep();
  let ph = XPH, text = xText(j, d, ph); show($('x-out'), '');
  const rows = [['streetcat', j.streetcat, 'Streetcat'], ...j.streetcatOld.map(k => ['streetcat', k, 'Streetcat · older']), ['clinic', j.clinic, 'clinic'], ...j.clinicOld.map(k => ['clinic', k, 'clinic · older']), ...j.donorKeys.filter(k => k.sk).map(k => ['donor', k.sk, `refund · ${k.campaign || 'donation'}`])].filter(r => r[1]);
  // a browser with no keys and nothing else has no export: the box stays empty (StreetCat, 7 Nov: the app on his home screen had none,
  // its own empty export stayed in the box, and Import (then "Import keys") took it and said «Imported»)
  const has = rows.length || xWhat(d, ph && ph.photos); $('x-box').value = has ? text : '';
  // copied at once, while the tap still counts: an iPhone lets a page copy only then, not seconds later, once the keys have typed
  // themselves out (StreetCat, 7 Nov: «me pone JSON, no sé qué»: what he pasted was not the export). The photos were read ahead; if not
  // yet, it copies once they are (where a phone refuses that, the export stays in the box, below)
  const copied = !has ? Promise.resolve(false) : ph ? copyText(text) : XPHP.then(p => { ph = p; text = xText(j, d, p); $('x-box').value = text; return copyText(text); });
  // the keys, one after another, each in its role's colour, then what goes with them, then the whole export to copy
  const term = $('x-term'); term.querySelectorAll('.term-text').forEach(e => e.remove()); const o = document.createElement('div'); o.className = 'term-text keys'; o.onclick = () => o.remove(); term.appendChild(o);
  if (!has) { o.textContent = 'no keys in this browser yet'; show($('x-out'), '✗ This browser has no keys yet: nothing to export. Export them in the browser that has them, then import them here.', 'bad'); return; }
  for (const [i, [role, sk, label]] of rows.entries()) { const line = document.createElement('div'); line.className = 'kline'; line.style.setProperty('--h', String(HUE[role])); const l = document.createElement('small'); l.textContent = label; line.appendChild(l); const v = document.createElement('span'); line.appendChild(v); o.appendChild(line); o.scrollTop = o.scrollHeight; await new Promise(r => typeKeys(v, roleOf(pubOf(sk), role), { hex: true, dur: 520, think: false, done: () => { const c = v.querySelector('.cur'); if (c && i < rows.length - 1) c.remove(); r(); } })); }
  const ok = await copied, what = xWhat(d, ph && ph.photos), said = t => { const e = document.createElement('div'); e.className = 'mut'; e.style.marginTop = '8px'; e.style.lineBreak = 'auto'; e.style.overflowWrap = 'break-word'; e.textContent = t; return e; };  // words, not keys: whole
  if (what) o.appendChild(said((rows.length ? 'and ' : '') + what));
  if (ok) { const done = said(''); done.textContent = 'the full export (with private keys) is in your clipboard · keep it somewhere safe · paste it in the other browser\'s Keys, then Import all'; o.appendChild(done); o.scrollTop = o.scrollHeight; return; }
  // not copied: the export itself, in the box, selected, to copy by hand
  o.remove(); const box = $('x-box'); box.focus(); box.select(); show($('x-out'), '✗ This phone did not let the page copy it. The export is in the box above, selected: copy all of it, then in the other browser paste it in Keys and tap Import all.', 'bad'); };
// what a phone may change on the way: words around the export, curly quotes (straightened only when the text does not read as it
// is: a note or a name may carry \u00ab\u00bb of its own)
const exportOf = raw => { const parse = t => { const a = t.indexOf('{'), z = t.lastIndexOf('}'); try { const j = JSON.parse(a >= 0 && z > a ? t.slice(a, z + 1) : t); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch (_) { return null; } };
  return parse(raw) || parse(raw.replace(/[\u201c\u201d\u00ab\u00bb]/g, '"').replace(/[\u2018\u2019]/g, "'")); };
const listOf = v => v == null ? [] : Array.isArray(v) ? v : [v];
const keysIn = j => ['clinic', 'streetcat', 'donor'].filter(r => j[r]).length + listOf(j.clinicOld).length + listOf(j.streetcatOld).length + listOf(j.donorKeys).filter(k => k && k.sk).length;
const xHas = j => keysIn(j) > 0 || !!xWhat(j.data, j.photos);
// what this browser has stays; what it lacks comes. A list gains the records it did not have (the same campaign, request, partner…
// once); a map, the entries; a setting this browser has is kept.
const xId = x => x && typeof x === 'object' ? String(x.id ?? x.pk ?? x.quote ?? x.token ?? x.ref ?? (x.c && x.c.sig) ?? x.slug ?? x.link ?? x.name ?? JSON.stringify(x)) : JSON.stringify(x);
const xUnion = (a, b) => Array.isArray(a) && Array.isArray(b) ? (s => [...a, ...b.filter(x => !s.has(xId(x)))])(new Set(a.map(xId)))
  : a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b) ? Object.keys(b).reduce((o, k) => (o[k] = k in a ? xUnion(a[k], b[k]) : b[k], o), { ...a }) : a;
const xSet = (k, v) => { try { localStorage.setItem(k, v); return localStorage.getItem(k) === v; } catch (_) { return false; } };
const xMerge = (k, v) => { let mine = null; try { mine = localStorage.getItem(k); } catch (_) {} if (mine == null || ['', '[]', '{}', 'null'].includes(mine)) return xSet(k, v);
  let a, b; try { a = JSON.parse(mine); b = JSON.parse(v); } catch (_) { return true; }  // a setting this browser has: kept
  const m = JSON.stringify(xUnion(a, b)); return m === JSON.stringify(a) || xSet(k, m); };
// importing never drops a key: the ones this browser had move to the kept lists (or, for the old shared refund key, to the donor keys)
$('x-imp').onclick = async () => { const out = $('x-out'); show(out, ''); $('x-term').querySelectorAll('.term-text').forEach(e => e.remove());  // what Export all typed over the box goes: the box is what imports
  const boxed = $('x-box').value.trim(); let raw = boxed, j = boxed ? exportOf(boxed) : null;
  // the box empty, or with nothing in it: what was copied (the phone may ask first), asked at once, while the tap counts
  if (!(j && xHas(j)) && navigator.clipboard && navigator.clipboard.readText) { try { const c = String(await navigator.clipboard.readText() || '').trim(), cj = c ? exportOf(c) : null;
    if ((cj && xHas(cj)) || (c && !boxed)) { raw = c; j = cj; $('x-box').value = c; } } catch (_) {} }
  if (!j) return show(out, !raw ? '✗ Paste an export first: in the other browser, Keys → Export all, then copy all of it.' : /\b0[23][0-9a-f]{64}\b/i.test(raw) && !/[0-9a-f]{64}"/i.test(raw) ? '✗ Those are public keys: an export carries the private ones. In the other browser tap Export all, then copy all of the text it puts in the box (it starts with {).' : '✗ This is not an export of keys: nothing imported. In the other browser tap Export all, then copy all of the text it puts in the box (it starts with {).', 'bad');
  const list = listOf, lc = k => k.toLowerCase(), dks = list(j.donorKeys).filter(k => k && k.sk);
  if (['clinic', 'streetcat', 'donor'].some(r => j[r] != null && !validSk(j[r])) || ['clinicOld', 'streetcatOld'].some(r => !list(j[r]).every(validSk)) || !dks.every(k => validSk(k.sk))) return show(out, '✗ These are not valid keys: nothing imported.', 'bad');
  if (!xHas(j)) return show(out, '✗ This export has no keys in it: nothing imported. It comes from a browser without keys: export in the one that has them, then import here.', 'bad');
  let saved = true;
  for (const r of ['clinic', 'streetcat']) { for (const k of list(j[r + 'Old']).map(lc)) if (k !== key(r, false)) saved = keepOld(r, k) && saved; if (j[r]) saved = setKey(r, lc(j[r])) && saved; }
  const legacy = key('donor', false); if (j.donor && legacy && legacy !== lc(j.donor)) addDonorKey({ sk: legacy, pk: pubOf(legacy) });
  if (j.donor) ls.set(KEYS.donor, lc(j.donor)); dks.forEach(k => addDonorKey({ ...k, sk: lc(k.sk), pk: pubOf(k.sk) }));
  // everything else: campaigns, donations, requests… and the photos, each checked against its SHA-256
  const d = Object.entries(xObj(j.data)).filter(([k, v]) => xMovable(k) && typeof v === 'string'); for (const [k, v] of d) saved = xMerge(k, v) && saved;
  const phs = Object.entries(xObj(j.photos)).filter(([k, v]) => /^[0-9a-f]{64}$/.test(k) && typeof v === 'string');
  for (const [sha, b] of phs) { let ok = false; try { ok = await photoHere(sha) || await keepPhoto(sha, unb64(b)); } catch (_) {} saved = ok && saved; }
  for (const [k, v] of Object.entries(xObj(j.parts))) if (typeof v === 'string') { try { if (!(await IDB.get('parts', k))) await IDB.put('parts', k, v); } catch (_) {} }
  CAMPMAP = null; refreshKeys(); try { renderHome(); } catch (_) {} xPrep(); const what = xWhat(Object.fromEntries(d), Object.fromEntries(phs));
  if (saved) { buzz(); $('x-box').value = ''; }
  show(out, saved ? 'Imported. The keys this browser had before are kept too.' + (what ? ` With them: ${what}; what this browser had stays too.` : '') + ' Copy something else now, so the keys do not stay in the clipboard.' : '✗ This browser could not save everything (it may be full). Nothing was deleted; try again.', saved ? '' : 'bad'); };

// campaign from URL
const fromHash = () => { if (location.hash.includes('#c=')) { $('d-camp').value = location.href; showCamp();  // a campaign link opened from another tab of this page: go to Donate
  if (nav.dataset.role !== 'donor' || !document.getElementById('donate').classList.contains('on')) { openTab('donate'); window.scrollTo(0, 0); } } };
window.addEventListener('hashchange', fromHash); fromHash();
$('d-camp').addEventListener('input', showCamp); showCamp();
// a campaign that comes on screen is typed in line by line, with the cursor and the flipping letters of the terminal;
// each line keeps its room while it waits, and the cursor goes once the last line is in. With `later`, the lines wait empty
// until the returned function is called (a pasted link is typed first)
function typeLines(els, later = false){ const run = typeLines.n = (typeLines.n || 0) + 1, texts = els.map(e => e.textContent);
  els.forEach(e => { const h = e.offsetHeight + 'px'; Object.assign(e.style, { minHeight: h, maxHeight: h, overflow: 'hidden' }); e.textContent = ''; });  /* a cursor at a full line's end never pushes the page down */
  const next = i => { if (typeLines.n !== run) return; if (i > 0 && els[i - 1]._type) els[i - 1]._type();
    typeKeys(els[i], texts[i], { keys: false, done: () => { if (i < els.length - 1) return next(i + 1); setTimeout(() => { if (typeLines.n === run) els.forEach(e => { if (e._type) e._type(); Object.assign(e.style, { minHeight: '', maxHeight: '', overflow: '' }); }); }, 1200); } }); };
  const go = () => next(0); if (!later) go(); return go; }
// the pasted link is typed into its field in the campaign's colour, as a pasted token is typed into the terminal; then `done`
function typeLink(ta, hue, done){ const run = typeLink.n = (typeLink.n || 0) + 1, wrap = ta.parentNode; wrap.querySelectorAll('.link-type').forEach(e => e.remove());
  if (REDUCE() || !ta.offsetParent) { if (done) done(); return; }
  const o = document.createElement('div'); o.className = 'link-type'; o.setAttribute('aria-hidden', 'true'); o.style.color = `oklch(.82 .16 ${hue}deg)`;
  Object.assign(o.style, { left: ta.offsetLeft + ta.clientLeft + 'px', top: ta.offsetTop + ta.clientTop + 'px', width: ta.clientWidth + 'px', height: ta.clientHeight + 'px' });
  const s = document.createElement('span'); o.appendChild(s); wrap.appendChild(o);
  typeKeys(s, ta.value, { keys: false, follow: true, dur: 1200, think: false, done: () => setTimeout(() => { if (typeLink.n !== run) return; o.remove(); ta.scrollTop = ta.scrollHeight; if (done) done(); }, 300) }); }
function showCamp(){ const t = $('d-camp').value.trim(); $('d-paste').hidden = location.hash.includes('#c='); const box = $('d-campinfo'), ta = $('d-camp'); if (t && t === box._t) return; box._t = t; $('donate').classList.remove('sigbad'); box.style.visibility = '';
  typeLink.n = (typeLink.n || 0) + 1; document.querySelectorAll('#d-paste .link-type').forEach(e => e.remove()); ta.style.color = ''; box.textContent = ''; if (!t) { box._camp = ''; return; }
  try { const c = parseCampaign(t); roleOf(c.streetcat, 'streetcat'); roleOf(c.clinic, 'clinic'); let warn = ''; try { openCampaign(t); } catch (e) { warn = e.message; } const foreign = !published(c.streetcat);
    const tt = document.createElement('div'); tt.className = 'title'; tt.textContent = c.name; box.appendChild(tt);
    const o = document.createElement('div'); o.textContent = `${c.op || 'operation'} · refund after ${fmtDate(c.deadline)}`; box.appendChild(o);
    const w = document.createElement('div'); w.className = 'mut code'; w.textContent = `clinic ${abbr(c.clinic)} · Streetcat ${abbr(c.streetcat)}`  /* no break between a name and its key */; box.appendChild(w);
    if (warn && warn !== NOT_PUBLISHED) { const b = document.createElement('div'); b.className = 'out bad'; b.textContent = '✗ ' + warn; box.appendChild(b); }  /* that one is said in the signature's place */
    const sg = document.createElement('div'), sm = document.createElement('div'); sg.className = sm.className = 'sig code'; box.appendChild(sg); box.appendChild(sm);
    const hue = campHue(c); box.style.setProperty('--h', String(hue)); ta.style.color = `oklch(.82 .16 ${hue}deg)`;  /* the campaign's own colour, as on the status page: its name, and the link it came in */
    const id = JSON.stringify([c.name, c.deadline, c.op, c.clinic, c.streetcat, c.sig || '']), fresh = box._camp !== id; box._camp = id; if (fresh) box.style.visibility = 'hidden';
    window.scCore.campaignSig(c).catch(() => 'broken').then(st => { if (box._t !== t) return; $('donate').classList.toggle('sigbad', st === 'broken' || foreign);  /* a broken signature, or not Streetcat's published key: nothing can be paid */
      sg.classList.add(st === 'signed' && !foreign ? 'ok' : 'bad');  /* not signed, broken, or not Streetcat's published key: red */ sg.textContent = foreign ? '✗ ' + NOT_PUBLISHED : st === 'signed' ? `✓ signed by Streetcat ${abbr(String(c.streetcat).toLowerCase())}` : st === 'broken' ? '✗ The signature on this link does not match: it was changed after Streetcat made it. Do not donate through it.' : 'This link is not signed. Donate only if it came from Streetcat itself.';
      if (st === 'unsigned' && !foreign && !mintExpected(c.mint)) { sm.classList.add('bad'); sm.textContent = `⚠ It uses the mint ${String(c.mint).replace(/^https?:\/\//, '')}, not the one Streetcat uses (${EXPECTED_MINTS[0].replace(/^https?:\/\//, '')}).`; } else sm.remove();
      box.style.visibility = ''; if (fresh) { const go = typeLines([tt, o, w, sg, ...(sm.isConnected ? [sm] : [])], true); if (!$('d-paste').hidden) typeLink(ta, hue, go); else go(); } });
  } catch (e) { box._camp = ''; const b = document.createElement('div'); b.className = 'out bad'; b.textContent = 'cannot read campaign: ' + e.message; box.appendChild(b); } }
// CHECK FOR REQUESTS (StreetCat, 7 Nov: «un botón … comprobar si hay request de la asociación», the fourth big one): the campaigns Streetcat
// announced on the relays (relay.js), signed with its published key and still open, typed in where the campaign shows, one per line in its
// own colour; a tap opens one as its link would. Nothing found, or no relay reached, is said there instead (the latter in red).
const daysLeft = d => { const n = Math.ceil((Number(d) - Date.now() / 1000) / 86400); return n <= 1 ? 'last day' : n + ' days left'; };
function reqsBox(){ const box = $('d-reqs'); box.textContent = ''; box.hidden = false; $('d-paste').hidden = true; $('d-campinfo').hidden = true; return box; }
const reqsDone = () => { $('d-reqs').hidden = $('d-kinds').hidden = true; $('d-campinfo').hidden = false; $('d-paste').hidden = location.hash.includes('#c='); };
const reqsSay = (text, cls) => { const box = reqsBox(), m = el('div'); $('d-kinds').hidden = true; box.appendChild(m); show(m, text, cls); $('d-paste').hidden = location.hash.includes('#c='); $('d-campinfo').hidden = false; };
// what Streetcat has open, as its announcements say (relay.js); above them the same four kinds as Rescue's, two by two (StreetCat, 7 Nov:
// «en la versión del donante tendrían que ser los mismos parámetros, no un all y los otros tres»): none chosen, all of them; one, only it
let DANN = [], D_KIND = '';
$('d-check').onclick = async () => { const btn = $('d-check'), R0 = window.scRelay, was = btn.textContent; busy(btn, true); btn.textContent = 'checking…';
  try { if (!R0) throw new Error('this browser cannot reach the relays');
    const res = await R0.openCampaigns(STREETCAT_KEYS, { relays: relays(), timeout: 8000 });
    if (!res.relays.some(r => r.ok)) reqsSay('✗ Could not reach the relays: check the connection and try again.', 'bad');
    else if (!res.campaigns.length) reqsSay('No open requests from Streetcat right now.');
    else { DANN = res.campaigns; D_KIND = ''; drawAnn(); } }
  catch (e) { reqsSay('✗ ' + e.message, 'bad'); }
  btn.textContent = was; busy(btn, false); };
// a pot, with what it pays for, its colony and the days left, and the cats and things its requests pay for, each with how far it is;
// a request on its own (made before the kinds): one cat, its own pot
function drawAnn(){ const box = reqsBox(), kinds = $('d-kinds'); kinds.hidden = false; kindChips(kinds, D_KIND, id => { D_KIND = D_KIND === id ? '' : id; drawAnn(); });
  const t = D_KIND ? KIND(D_KIND) : null, shown = DANN.filter(a => !t || typeOf(a.c) === t.id);
  const head = el('div', 'mut', !shown.length ? `Nothing open for ${t.one} right now.` : shown.length === 1 ? `An open request from Streetcat${t ? ' · ' + t.one : ''} · tap it` : `${shown.length} open requests from Streetcat${t ? ' · ' + t.one : ''} · tap one`), typed = [head]; box.appendChild(head);
  for (const { c, kind, cats } of shown) { const req = kind === 'request', own = req ? (cats || []).find(x => lc(x.name) === lc(c.name)) : null, b = el('button', 'req'), ti = el('div', 'title', c.name), what = c.op || KIND(typeOf(c)).one;
    const s = el('div', 'sub2', req ? `request · ${what} · ${own ? (own.state === 'requested' ? 'at the clinic' : own.state) : daysLeft(c.deadline)}` : [what, c.colony, daysLeft(c.deadline)].filter(Boolean).join(' · ')), more = req ? [] : (cats || []).map(x => el('div', 'cat', `· ${x.name} · ${x.procedure} · ${x.state}`));
    b.type = 'button'; b.style.setProperty('--h', String(campHue(c))); b.appendChild(ti); b.appendChild(s); more.forEach(x => b.appendChild(x)); b.onclick = () => { reqsDone(); location.hash = 'c=' + b64u.enc(JSON.stringify(c)); }; box.appendChild(b); typed.push(ti, s, ...more); }
  typeLines(typed); }

// DONATE
const lockFor = (c, refundPk) => { if (!published(c.streetcat)) throw Object.assign(new Error(NOT_PUBLISHED), { byPage: true }); return lockBuilder(c, refundPk); };  // whatever the route: Lightning, ecash, a Cashu wallet
const lockBuilder = (c, refundPk) => new cashu.LockBuilder().addMainPubkey([c.streetcat, c.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(Number(c.deadline));
const newDonorKey = c => { const sk = newKey(), pk = pubOf(sk); campHue(c); addDonorKey({ campaign: c.name, deadline: Number(c.deadline), hue: c.hue, pk, sk, created: new Date().toISOString() }); return { sk, pk }; };  // saved before anything is paid or swapped
function renderLocked(c, locked, sk){ const out = $('d-out');
  const lockedToken = cashu.getEncodedToken({ mint: c.mint, proofs: locked, memo: `${c.name} ${c.op || ''} — vet-certified donation` });
  addDonorKey({ pk: pubOf(sk), lockedToken, amount: sum(locked), mint: c.mint, camp: c.sig ? { ...window.scCore.campSigned(c), sig: c.sig } : { ...window.scCore.campaignOf(c), ...(c.hue != null ? { hue: Number(c.hue) } : {}) } });  // this browser keeps the token too, for the refund tab
  if (!lockMatches(c, pubOf(sk), locked)) { $('donate').classList.remove('paying'); show(out, 'CHECK FAILED: the ecash the mint returned does not carry the lock this campaign promises. Do not send it to anyone. Save your receipt below and write to Streetcat.', 'bad'); receiptBox(out, { c, lockedToken, locked, sk, pk: pubOf(sk) }); return; }
  const late = Number(c.deadline) <= Date.now() / 1000 ? ` The deadline passed while you were paying: these sats are yours to take back right away, in Take my sats back.` : '';
  $('donate').classList.remove('paying'); $('donate').classList.add('done'); updateBack(); buzz();
  out.textContent = ''; out.className = 'out ok';
  const wrap = document.createElement('div'); wrap.className = 'paid term';
  const hd = document.createElement('div'); hd.className = 'hero'; hd.style.margin = '0'; const big = document.createElement('div'); big.className = 'big'; big.textContent = String(sum(locked)); hd.appendChild(big); const u = document.createElement('div'); u.className = 'unit'; u.textContent = 'sat'; hd.appendChild(u); const fi = document.createElement('div'); fi.className = 'fiat'; hd.appendChild(fi); fiatInto(fi, sum(locked)); wrap.appendChild(hd);
  wrap.appendChild(lockBar('locked')); const stt = document.createElement('div'); stt.className = 'state'; stt.textContent = `LOCKED ${sum(locked)} sat for ${c.name}.` + late; wrap.appendChild(stt); out.appendChild(wrap);
  const fold = (label, text) => { const d = document.createElement('details'); d.className = 'more'; const s = document.createElement('summary'); s.textContent = label; d.appendChild(s); d.appendChild(document.createTextNode('\n')); const t = document.createElement('span'); t.className = 'mut code'; t.textContent = text; d.appendChild(t); d.appendChild(document.createTextNode('\n')); return d; };
  const step = text => { const l = document.createElement('p'); l.className = 'center'; l.textContent = text; out.appendChild(l); };
  step(`1 · Save your private receipt. It takes these sats back after ${opensText(Number(c.deadline))}, even if this browser forgets them. Keep it to yourself.`);
  receiptBox(out, { c, lockedToken, locked, sk, pk: pubOf(sk) });
  step(`2 · Send the locked token to Streetcat${c.to ? ' (' + c.to + ')' : ''}.`);
  const row = document.createElement('div'); row.className = navigator.share ? 'row2' : 'row1'; row.appendChild(copyBtn('copy token', lockedToken, { role: 'donor' }));
  if (navigator.share) row.appendChild(smallBtn('share token', () => navigator.share({ title: `${c.name} donation`, text: lockedToken }).catch(() => {})));
  out.appendChild(row); out.appendChild(fold('token text', lockedToken)); out.appendChild(document.createTextNode('\n')); donorExtras(out, row, c, lockedToken, sk, locked);
  const again = document.createElement('p'); again.className = 'center'; again.style.marginTop = 'auto'; const ag = document.createElement('a'); ag.href = '#'; ag.textContent = 'donate again'; ag.id = 'd-again'; ag.style.cssText = 'color:var(--mute);text-decoration:none;border-bottom:1px solid var(--line)'; ag.onclick = e => { e.preventDefault(); $('donate').classList.remove('done'); show(out, ''); $('d-amt').value = ''; payLabel(); updateBack(); }; again.appendChild(ag); out.appendChild(again); }
// ecash pasted on the "Pay with ecash" screen, when this browser could not make a payment request (its relay code did not load):
// swapped straight into the campaign's lock with a new refund key. Otherwise the request's own path takes it (takeWalletEcash).
async function lockPlain(tok, out){ const c = await openSigned($('d-camp').value); if (!storageWorks()) throw new Error(NO_STORAGE);
  const from = cashu.getTokenMetadata(tok).mint; if (norm(from) !== norm(c.mint)) throw new Error(otherMint(from, c));  /* before asking any mint */
  show(out, 'contacting the mint…'); const w = await wallet(c.mint), dec = w.decodeToken(tok);
  const { sk, pk } = newDonorKey(c);
  const locked = await safeSwap(w, dec.proofs, { lock: lockFor(c, pk), what: { kind: 'donation', campaign: c, pk }, mint: c.mint });
  show(out, ''); if (nav.dataset.role !== 'donor' || !$('donate').classList.contains('on')) openTab('donate'); renderLocked(c, locked, sk); return true; }

// DONATE WITH LIGHTNING: the mint's invoice (NUT-04); once paid, the page mints outputs already locked (NUT-11), so the sats are never spendable by anyone else
const payLabel = () => { const n = Number($('d-amt').value); $('d-ln').textContent = n > 0 ? `Pay ${n.toLocaleString('en')} sat with Lightning` : 'Pay with Lightning'; document.querySelectorAll('button[data-amt]').forEach(x => x.classList.toggle('on', Number(x.dataset.amt) === n)); };
document.querySelectorAll('button[data-amt]').forEach(b => b.addEventListener('click', () => { const inp = $('d-amt'); inp.value = b.dataset.amt; inp._target = b.dataset.amt; payLabel(); if (!REDUCE()) { const target = b.dataset.amt, pool = '0123456789'.split(''), start = performance.now(), ps = target.split('').map(() => ({ at: 200 + Math.random() * 420, every: 40 + Math.random() * 40, step: -1, g: '' })); if (inp._flap) cancelAnimationFrame(inp._flap); const fr = now => { const t = now - start; let done = true; inp.value = target.split('').map((ch, i) => { const p = ps[i]; if (t >= p.at) return ch; done = false; const s = Math.floor(t / p.every); if (s !== p.step) { p.step = s; p.g = pool[Math.floor(Math.random() * 10)]; } return p.g; }).join(''); if (done) { inp.value = target; inp._flap = null; inp._target = null; return; } inp._flap = requestAnimationFrame(fr); }; inp._flap = requestAnimationFrame(fr); } }));
$('d-amt').addEventListener('input', () => { const inp = $('d-amt'); if (inp._flap) { cancelAnimationFrame(inp._flap); inp._flap = null; inp._target = null; } }); $('d-amt').addEventListener('input', payLabel); const fiatLine = async () => { const n = Number($('d-amt').value), r = await rate(); $('d-fiat').textContent = n > 0 && r ? `≈ ${eur(n, r)}` : ''; }; $('d-amt').addEventListener('input', fiatLine); document.querySelectorAll('button[data-amt]').forEach(b => b.addEventListener('click', fiatLine)); rate().then(fiatLine);
let WAITING = null;  // the invoice this page is watching
function renderInvoice(p){ const out = $('d-out'); out.textContent = ''; out.className = 'out'; $('donate').classList.add('paying'); updateBack();
  const stage = document.createElement('div'); stage.className = 'term scan'; const qr = qrSvg('lightning:' + p.request); if (qr) { qr.style.position = 'relative'; stage.appendChild(qr); } out.appendChild(stage);
  // the streetcat.com crypto card, measured from its screen recording: the line traces clockwise in 0.55 s at full orange, flashes
  // yellow with a soft glow as it closes, settles at 45 % in 0.65 s, and from 1.9 s breathes every 1.8 s (up by 25 %, back by 65 %).
  // Run by the Web Animations API with plain numbers: Safari does not animate an SVG dash offset taken from a CSS variable. With reduced
  // motion only the breathing stays (a change of light, no movement).
  // the flash, as on the card: yellow at its peak 0.1 s after the line closes, held 0.1 s, back to full orange by 0.35 s, dim by 0.65 s;
  // the glow (soft orange outside, pale yellow inside) fades in light only, never in size
  const glow = k => `0 0 18px 2px rgba(255,130,40,${(.55 * k).toFixed(3)}), inset 0 0 18px 3px rgba(255,235,60,${(.5 * k).toFixed(3)})`;
  const trace = fr => { if (!fr || !fr.animate) return; (fr._anims || []).forEach(a => a.cancel()); const bars = [...fr.children], q = fr.closest('.qr'), io = 'ease-in-out', eo = 'ease-out', still = REDUCE(), a = [];
    if (!still) { const w = q.clientWidth, h = q.clientHeight, P = 2 * (w + h) || 1; let at = 0;
      bars.forEach((b, i) => { const d = 550 * (i % 2 ? h : w) / P, s = i % 2 ? 'scaleY' : 'scaleX'; a.push(b.animate([{ transform: s + '(0)' }, { transform: s + '(1)' }], { duration: d, delay: at, easing: 'linear', fill: 'backwards' })); at += d; });  /* clockwise from the top left corner, at one speed all round */
      a.push(fr.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 550, fill: 'backwards' }));
      const base = { background: '#f7931a', boxShadow: '0 0 0 0 #f7931a' }, lit = { background: '#ffff1f', boxShadow: '0 0 0 .5px #ffff1f' };  /* 1 px thicker while it flashes, as the card's line */
      bars.forEach(b => a.push(b.animate([{ ...base, easing: eo }, { ...lit, offset: .15 }, { ...lit, offset: .26, easing: eo }, { ...base, offset: .54, easing: eo }, base], { duration: 650, delay: 550 })));
      a.push(fr.animate([{ opacity: 1 }, { opacity: 1, offset: .54, easing: eo }, { opacity: .45 }], { duration: 650, delay: 550 }));
      if (q) a.push(q.animate([[0, 0], [.15, 1], [.26, 1], [.42, .58], [.57, .32], [.72, .13], [.92, 0], [1, 0]].map(([offset, k]) => ({ offset, boxShadow: glow(k) })), { duration: 650, delay: 550 })); }
    a.push(fr.animate([{ opacity: .45, easing: io }, { opacity: 1, offset: .25, easing: io }, { opacity: .45, offset: .65 }, { opacity: .45 }], { duration: 1800, delay: still ? 0 : 1920, iterations: Infinity }));
    fr._anims = a; };
  if (qr) { const fr = document.createElement('div'); fr.className = 'frame off'; for (const s of ['t', 'r', 'b', 'l']) { const b = document.createElement('span'); b.className = s; fr.appendChild(b); } qr.appendChild(fr); }  // drawn on "copy invoice", as on the card
  stage._retrace = () => { const f = qr && qr.querySelector('.frame'); if (!f) return; f.classList.remove('off'); trace(f); };
  const u = document.createElement('div'); u.className = 'center'; u.textContent = `${p.amount} sat · pay with any Lightning wallet`; out.appendChild(u);
  const row = document.createElement('div'); row.className = 'row2'; const a = document.createElement('a'); a.className = 'sm'; a.href = 'lightning:' + p.request; a.textContent = 'open in wallet';
  const cb = copyBtn('copy invoice', p.request); cb.addEventListener('click', () => { if (stage._retrace) stage._retrace(); inv.classList.add('lit'); flap(inv, p.request, { speed: 1 }); }); row.appendChild(a); row.appendChild(cb); out.appendChild(row);
  const st = document.createElement('div'); st.className = 'center'; st.id = 'd-st'; st.textContent = 'waiting for the payment…' + (p.expiry ? ` · expires ${new Date(p.expiry * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''); out.appendChild(st);
  const inv = document.createElement('div'); inv.className = 'invtext'; out.appendChild(document.createTextNode('\n')); out.appendChild(inv); out.appendChild(document.createTextNode('\n')); flap(inv, p.request, { speed: 1.3 }); }
async function collect(p, w){ const sk = p.sk || findDonorKey([p.pk]); if (!sk) throw new Error('the refund key for this invoice is missing from this browser');
  if (!p.outputs) { p.outputs = (await buildOutputs(w, p.amount, lockFor(p.campaign, p.pk))).map(outSave); savePending(p);  // saved before the mint is asked
    if (!(pendings().find(x => x.quote === p.quote) || {}).outputs) throw new Error(NO_STORAGE); }
  let locked; try { locked = await w.ops.mintBolt11(p.amount, p.quote).asCustom(p.outputs.map(outLoad)).run(); }
  catch (e) { let q = null; try { q = await w.checkMintQuoteBolt11(p.quote); } catch (_) {} if (!q || q.state !== 'ISSUED') throw e;
    locked = await restoreOutputs(w, p.outputs).catch(() => null); if (!locked) throw e; }  // the mint issued it but the answer was lost: ask for it again (NUT-09)
  dropPending(p.quote); return { locked, sk }; }
// once paid, the QR's line stops breathing and stays on
async function waitAndMint(p){ const me = { quote: p.quote }; WAITING = me; renderPendings(); const st = () => $('d-st');
  let w = null, fails = 0, tried = false;
  const stop = (text, cls) => { dropPending(p.quote); WAITING = null; $('donate').classList.remove('paying'); show($('d-out'), text, cls); renderPendings(); };
  while (WAITING === me) {
    try { if (!w) w = await wallet(p.campaign.mint);
      const q = await w.checkMintQuoteBolt11(p.quote);
      if (q.state === 'PAID') { if (st()) st().textContent = 'paid ✓ — locking your donation…'; const fp = document.querySelector('#d-out .frame'); if (fp) { (fp._anims || []).forEach(a => a.cancel()); fp.style.opacity = '1'; } tried = true; const { locked, sk } = await collect(p, w); WAITING = null; renderLocked(p.campaign, locked, sk); renderPendings(); return; }
      if (q.state === 'ISSUED') { const back = p.outputs ? await restoreOutputs(w, p.outputs) : null;  // a network error here goes to the retry below
        if (back) { dropPending(p.quote); WAITING = null; renderLocked(p.campaign, back, p.sk || findDonorKey([p.pk])); renderPendings(); return; }
        // issued, but not with outputs this page knows: another tab may have it. Keep the record (marked) instead of deleting it.
        savePending({ ...p, stuck: true }); WAITING = null; renderPendings();
        show($('d-out'), (tried || p.outputs)
          ? `The mint says it issued the ecash for this invoice, but this page could not get it back (another tab or window may have it, or the mint does not support NUT-09). Look in your other tabs first; if it is not there, write to Streetcat with this invoice:\n${p.request}`
          : 'This invoice was already turned into a locked donation, probably in another tab or window. Look there for its receipt; this browser also keeps it under Donor: refund.', 'bad'); return; }
      if (p.expiry && Date.now() / 1000 > p.expiry + 60) return stop('The invoice expired without being paid. Nothing was charged; get a new one.', 'bad');
      fails = 0;
    } catch (e) { fails++; if (st()) { st().textContent = (fails > 3 ? 'paid or not, nothing is lost: this browser keeps the invoice and will finish when the mint answers. ' : 'retrying… ') + (e.message || e); st().classList.add('bad'); } }
    await new Promise(r => setTimeout(r, fails ? Math.min(15000, 2000 * fails) : 2000));
  } }
function renderPendings(){ const box = $('d-pend'); box.textContent = '';
  for (const p of pendings()) { if (WAITING && p.quote === WAITING.quote) continue;
    const row = document.createElement('div'); row.textContent = `${p.stuck ? 'Paid elsewhere or not recoverable here' : 'Unfinished Lightning donation'}: ${p.campaign.name} · ${p.amount} sat · ${new Date(p.created).toLocaleString()} `; if (p.stuck) row.className = 'bad';
    row.appendChild(smallBtn(p.stuck ? 'check again' : 'resume', () => { renderInvoice(p); waitAndMint(p); }));
    if (p.stuck) row.appendChild(smallBtn('forget', () => { if (confirm('Forget this invoice? Do it only once you have found the donation in another tab or written to Streetcat.')) { dropPending(p.quote); renderPendings(); } }));
    box.appendChild(row); } }
$('d-ln').onclick = async () => { const btn = $('d-ln'); busy(btn, true); try { { const inp = $('d-amt'); if (inp._flap) { cancelAnimationFrame(inp._flap); inp._flap = null; if (inp._target) inp.value = inp._target; inp._target = null; } }  // a tap on Pay mid-flip pays the chosen amount, never a flipping digit
  const c = await openSigned($('d-camp').value); const amount = Number($('d-amt').value); if (!Number.isInteger(amount) || amount < 1) throw new Error('choose a whole number of sats');
  if (!storageWorks()) throw new Error(NO_STORAGE);
  show($('d-out'), 'asking the mint for an invoice…'); const w = await wallet(c.mint);
  const desc = `Streetcat · ${c.name} ${c.op || ''} · vet-certified donation`.slice(0, 100);
  let canDescribe = false; try { canDescribe = w.getMintInfo().supportsNut04Description('bolt11', 'sat'); } catch (_) {}
  const q = canDescribe ? await w.createMintQuoteBolt11(amount, desc) : await w.createMintQuoteBolt11(amount);
  const { sk, pk } = newDonorKey(c);
  const p = { quote: q.quote, request: q.request, amount, expiry: q.expiry || null, campaign: c, pk, sk, created: new Date().toISOString() };
  savePending(p); if (!pendings().some(x => x.quote === p.quote)) throw new Error(NO_STORAGE);  // never show an invoice this browser could forget
  renderInvoice(p); renderPendings(); waitAndMint(p);
} catch (e) { $('donate').classList.remove('paying'); show($('d-out'), 'Failed: ' + (e.message || e), 'bad'); } busy(btn, false); };
// back from the wallet app (or a reload): pick up the latest unfinished invoice by itself, list the others
(() => { const list = pendings().filter(x => !x.stuck); renderPendings(); if (!list.length) return; const p = list[list.length - 1]; renderInvoice(p); waitAndMint(p); })();

// CERTIFY (clinic)
$('c-token').addEventListener('input', async () => { const card = $('c-card'); card.textContent = ''; show($('c-out'), ''); $('certify').classList.remove('has-card'); unfinish($('c-go')); $('c-again').hidden = true; try { const t = $('c-token').value.trim(); if (!t) return $('c-info').textContent = ''; const { dec } = await decodeTok(t); const info = lockInfo(dec.proofs);
    card.appendChild(tokenCard(dec, info, 'locked')); $('certify').classList.add('has-card'); termShow(t, 'clinic', { ms: 1500 }); setLines($('c-info'), lateNote(info) + keyNote('clinic', info)); } catch (e) { setLines($('c-info'), 'cannot read token: ' + e.message); } });
$('c-go').onclick = async () => { const btn = $('c-go'); busy(btn, true); try {
  const { w, dec } = await decodeTok($('c-token').value.trim()); const info = lockInfo(dec.proofs); const sk = heldFor('clinic', info.pubkeys);
  if (!sk) throw new Error(keyNote('clinic', info).replace(/^✗ /, '')); const late = lateNote(info).trim();
  { const me = pubOf(sk), bad = dec.proofs.map(p => { const l = C.lockOf(p.secret); return C.lockProblem(l, { streetcat: l ? l.main.find(k => k !== me) || '' : '', clinic: me, deadline: l ? l.locktime : 0 }); }).find(Boolean);  /* core.js, as for a request */
    if (bad) throw new Error(`this token's lock is not a donation's lock (${bad}): it was not signed`); }  /* past the deadline it can still be certified: whatever is still locked can be released */
  const signed = cashu.signP2PKProofs(dec.proofs, sk); const out = cashu.getEncodedToken({ mint: dec.mint, proofs: signed, memo: `${(dec.memo || 'donation').split(' ')[0]} · certified: ${$('c-memo').value.trim() || 'the operation was done'} · signed by clinic ${pubOf(sk).slice(0, 10)}` });
  buzz(); finish(btn, '✓ Certified'); $('c-again').hidden = false; $('c-card').textContent = ''; $('c-card').appendChild(tokenCard(dec, info, 'certified')); $('c-card').firstChild.classList.add('paid'); show($('c-out'), `CERTIFIED ${info.amount} sat. Send this token to Streetcat:\n` + (late ? late + '\n' : '') + (w && w._vlOffline ? 'Signed without a connection: send it when you have one.\n' : ''), 'ok'); const r2 = document.createElement('div'); r2.className = navigator.share ? 'row2' : 'row1'; r2.appendChild(copyBtn('copy certified token', out, { role: 'clinic' })); if (navigator.share) r2.appendChild(smallBtn('share', () => navigator.share({ text: out }).catch(() => {}))); $('c-out').appendChild(r2); const f = document.createElement('details'); f.className = 'more'; const s = document.createElement('summary'); s.textContent = 'token text'; f.appendChild(s); f.appendChild(document.createTextNode('\n')); const tx = document.createElement('span'); tx.className = 'mut code'; tx.textContent = out; f.appendChild(tx); f.appendChild(document.createTextNode('\n')); $('c-out').appendChild(f);
} catch (e) { show($('c-out'), 'Failed: ' + (e.message || e), 'bad'); } busy(btn, false); };

// RELEASE (Streetcat)
let SPRE = 0;  // the token in the Release box: a newer paste, or the release itself, makes an older check of it at the mint stale
$('s-token').addEventListener('input', async () => { const card = $('s-card'); card.textContent = ''; show($('s-out'), ''); $('release').classList.remove('has-card'); unfinish($('s-go')); $('s-again').hidden = true; const run = ++SPRE; try { const t = $('s-token').value.trim(); if (!t) return $('s-info').textContent = ''; const { w, dec } = await decodeTok(t); const info = lockInfo(dec.proofs), v = clinicSigs(dec.proofs, info, dec.memo);
    card.appendChild(tokenCard(dec, info, v.ok ? 'certified' : 'locked')); $('release').classList.add('has-card'); if (heldFor('streetcat', info.pubkeys)) ledgerKeep(dec, info).catch(() => {});  /* a donation of a campaign of this Streetcat key: into its ledger */ termShow(t, 'streetcat', { ms: 1500 }); setLines($('s-info'), v.text + (dec.memo ? `\nmemo: ${dec.memo}` : '') + '\n' + keyNote('streetcat', info));
    // already released? The mint says so before anyone presses Release: a token released before says it here, and its button says so
    if (v.ok && heldFor('streetcat', info.pubkeys) && online()) { const { live, why } = await stillLocked(w, dec.proofs, info); if (run !== SPRE || live.length) return;
      if (why === 'released already') { finish($('s-go'), '✓ Released'); $('s-again').hidden = false; card.firstChild && card.firstChild.replaceChild(lockBar('released'), card.firstChild.querySelector('.lock')); show($('s-out'), `✓ Already released: the mint says all ${info.amount} sat of this token left the lock with the clinic's and Streetcat's signatures. Nothing more to do with it.`, 'ok'); }
      else show($('s-out'), `Nothing left to release: the mint says all ${info.amount} sat of this token are ${why || 'spent'}.`, 'bad'); }
  } catch (e) { if (run === SPRE) setLines($('s-info'), 'cannot read token: ' + e.message); } });
// "certify another token" / "release another token": an empty box again, and its button as it was
const another = (box, extra) => e => { e.preventDefault(); const ta = $(box); ta.value = ''; if (extra) $(extra).value = ''; ta.dispatchEvent(new Event('input')); window.scrollTo(0, 0); };
$('c-again').onclick = another('c-token', 'c-memo'); $('s-again').onclick = another('s-token');
$('s-go').onclick = async () => { const btn = $('s-go'); if (btn.classList.contains('fin')) return; busy(btn, true); ++SPRE; try {
  const t = $('s-token').value.trim(); show($('s-out'), 'contacting the mint…');
  const { w, dec } = await decodeTok(t); const info = lockInfo(dec.proofs); const sk = heldFor('streetcat', info.pubkeys);
  if (!sk) throw Object.assign(new Error(keyNote('streetcat', info).replace(/^✗ /, '')), { byPage: true });  // stop here: the mint would only refuse it
  const v = clinicSigs(dec.proofs, info, dec.memo); if (!v.ok) throw Object.assign(new Error(v.text.replace(/^✗ /, '') + ': nothing is released'), { byPage: true });
  show($('s-out'), 'asking the mint what is still unspent…'); const { live, gone, why } = await stillLocked(w, dec.proofs, info);
  if (!live.length) throw Object.assign(new Error(`nothing left to release: the mint says all ${info.amount} sat of this token are ${why || 'spent'}`), { byPage: true });
  const both = cashu.signP2PKProofs(live, sk);
  const got = await safeSwap(w, both, { what: { kind: 'release', memo: dec.memo || '' }, mint: dec.mint }); const plain = cashu.getEncodedToken({ mint: dec.mint, proofs: got, memo: 'released: ' + (dec.memo || '') });
  addReleased({ token: plain, amount: sum(got), memo: dec.memo || '', at: new Date().toISOString() });  // kept here until Streetcat's wallet has it
  await ledgerKeep(dec, info, { request: '', patient: campName(info, dec.memo), procedure: String(dec.memo || '').replace(/^\S+\s*·?\s*/, '').slice(0, 120), date: new Date().toISOString().slice(0, 10), amount: sum(live) }).catch(() => {});
  const left = gone.length ? ` ${sum(gone)} sat of this token were left out: ${why}.` : '';
  buzz(); finish(btn, '✓ Released'); $('s-again').hidden = false; const cd = $('s-card').firstChild; if (cd) { cd.replaceChild(lockBar('released'), cd.querySelector('.lock')); cd.classList.add('paid'); } await releasedOut($('s-out'), { w, proofs: got, plain, mint: dec.mint, head: `RELEASED ${sum(got)} sat.${left}`, keep: 'Import this plain token into Streetcat\'s wallet now (this browser keeps a copy below):', label: 'copy token' });
} catch (e) { show($('s-out'), whyFailed(e), 'bad'); } busy(btn, false); };

// REFUND (donor): a receipt (the picture file, its text, or one made before version 1), or just the locked token when this browser
// made the donation and kept its key. What the receipt says and what the mint says are shown apart; the state comes from the mint.
// A split donation is followed down to its rest (core.js traceDonation), which is the donor's too after the deadline.
const MELTS = 'vetlock.donor.melts', melts = () => { const a = jget(MELTS, []); return Array.isArray(a) ? a : []; }, saveMelt = m => jset(MELTS, [...melts().filter(x => x.id !== m.id), m].slice(-40));
let RIN = null, RCHK = null, RPW = null;
async function refundRead(src){ const S = window.scCore; let r = null;
  if (typeof src === 'string' && src.trim().startsWith('cashu')) { const t = src.trim(), { w, dec } = await decodeTok(t), info = lockInfo(dec.proofs), sk = findDonorKey(info.refund);
    if (!sk) throw new Error('this browser has no refund key for this token; open your receipt instead');
    return { kind: 'token', token: t, w, dec, info, sk, pk: pubOf(sk), name: (dec.memo || 'donation').split(' ')[0], sealed: false, problems: [] }; }
  const res = await S.readReceipt(src); if (res.kind === 'none') throw new Error(res.why);
  const rc = res.receipt, t = rc.donation.token, { w, dec } = await decodeTok(t), info = lockInfo(dec.proofs);
  const sk = rc.refund.key || null, pk = lc(rc.refund.pub || (sk ? pubOf(sk) : (info.refund[0] || '')));
  return { kind: res.kind, token: t, w, dec, info, sk: sk || (res.sealed ? null : findDonorKey(info.refund)), pk, name: (rc.campaign && rc.campaign.name) || 'donation', sealed: res.sealed, receipt: rc, problems: res.problems }; }
// what the mint says: every proof (and the rest of any released in part), its state, and who signed what was spent
async function refundCheck(rin){ const w = rin.w, out = { at: nowIso(), dleq: false, refundable: [], released: 0, refunded: 0, locked: 0, unavailable: false };
  try { out.dleq = await dleqOk(w, rin.dec.proofs); const tr = await window.scCore.traceDonation(w, rin.dec.proofs);
    for (const x of tr) { const a = amt(x.proof.amount); if (x.state === 'UNSPENT') { out.refundable.push(x.proof); out.locked += a; continue; } if (x.state !== 'SPENT') continue;
      const pw = { ...x.proof, witness: x.witness }; let byRefund = false; try { byRefund = !!x.witness && rin.info.refund.some(k => cashu.hasP2PKSignedProof(k, pw)); } catch (_) {} if (byRefund) out.refunded += a; else out.released += a - (x.putBack || 0); }  /* what was put back is followed below */
  } catch (e) { out.unavailable = true; out.why = e.message || String(e); } return out; }
const reserveGuess = n => Math.max(2, Math.ceil(n / 100));  // the mint keeps this much for Lightning fees, at most, by the usual rule (2 sat or 1 %)
function refundEstimate(rin, chk){ const w = rin.w; let fee1 = 0, fee2 = 0; try { fee1 = amt(w.getFeesForProofs(chk.refundable)); fee2 = fee1; } catch (_) {} const ecash = Math.max(0, chk.locked - fee1); return { ecash, ln: Math.max(0, ecash - fee2 - reserveGuess(ecash)), fees: fee1 + fee2 }; }
function refundState(rin, chk){ const t = Number(rin.info.locktime), open = t <= Date.now() / 1000, m = melts().find(x => x.pk === rin.pk && x.state === 'pending');
  if (m) return ['Refund in progress · Do not pay or claim again', 'bad', 'A Lightning payment of these sats was sent and its result is not known yet. Check now asks the mint.'];
  if (chk.unavailable) return ['Verification unavailable', 'bad', 'The mint cannot be reached now, so the state is not known: ' + chk.why];
  if (!chk.locked) { const done = melts().find(x => x.pk === rin.pk && x.state === 'paid') || donorKeys().find(x => x.pk === rin.pk && x.refunded);
    const paid = done ? Number(done.paidOut || (done.quote ? done.amount : 0)) : 0;  /* a melt record says what went out by Lightning */
    if (chk.refunded && done) return ['Refund completed', 'ok', `${fmtSat(chk.refunded)} came back to you${paid ? ': ' + fmtSat(paid) + ' to your Lightning wallet' : ''}.`];
    if (chk.refunded && !chk.released) return ['Already refunded', '', `Taken back with this receipt's refund key: ${fmtSat(chk.refunded)}.`];
    if (chk.released && !chk.refunded) return ['Released', 'ok', `The clinic confirmed and Streetcat released ${fmtSat(chk.released)}: nothing is left to take back.`];
    return ['Nothing left to take back', '', `${fmtSat(chk.released)} released · ${fmtSat(chk.refunded)} taken back.`]; }
  const part = chk.released ? ` ${fmtSat(chk.released)} of this donation ${chk.released === 1 ? 'was' : 'were'} released; the rest went back under the lock.` : '';
  return open ? ['Refund available', 'ok', `${fmtSat(chk.locked)} can be taken back now.${part}`] : ['Refund not available yet', '', `It opens ${opensText(t)}. Until then only Streetcat and the clinic together can move these sats.${part}`]; }
function renderRefund(){ const box = $('r-info'); box.textContent = ''; $('r-checkrow').hidden = true; const rin = RIN; if (!rin) return; roleOf(rin.pk, 'donor'); rin.info.refund.forEach(k => roleOf(k, 'donor'));  /* the donors' colours */ const chk = RCHK, t = Number(rin.info.locktime), rc = rin.receipt;
  const p1 = el('div', 'panel'); p1.appendChild(el('b', null, rin.kind === 'token' ? 'This token' : 'Saved in the receipt'));
  const amount = sum(rin.dec.proofs), lines = [`${rin.name} · ${fmtSat(amount)}${rc && rc.donation && rc.donation.ref ? ' · ' + rc.donation.ref : ''}`, `refund opens ${opensText(t)}`, ...(rc && rc.created ? [`made ${fmtUTC(Math.floor(Date.parse(rc.created) / 1000))}`] : []),
    rin.kind === 'v1' ? `receipt version 1 · check ✓${rin.sealed ? ' · protected with a password' : ''}` : rin.kind === 'old' ? 'a receipt made before version 1: no integrity check' : 'the refund key is the one this browser kept', `refund key ${abbr(rin.pk)}${rin.info.refund.includes(rin.pk) ? ' · the one in the lock ✓' : ' · ✗ not the one in the lock'}`, ...rin.problems.map(x => '✗ ' + x)];
  p1.appendChild(el('div', 'code', lines.join('\n'))); box.appendChild(p1); if (!chk) { box.appendChild(el('div', 'mut', 'asking the mint…')); return; }
  const p2 = el('div', 'panel'); p2.appendChild(el('b', null, `Checked with the mint · ${when(chk.at)}`));
  p2.appendChild(el('div', 'code', chk.unavailable ? 'the mint did not answer' : [`mint signature ${chk.dleq ? '✓ on every proof (DLEQ)' : '✗ cannot be checked'}`, `${fmtSat(chk.locked)} still locked${chk.released ? ' · ' + fmtSat(chk.released) + ' released' : ''}${chk.refunded ? ' · ' + fmtSat(chk.refunded) + ' taken back' : ''}`].join('\n')));
  const [label, cls, detail] = refundState(rin, chk), sl = el('div', 'rstate' + (cls ? ' ' + cls : ''), label); p2.appendChild(sl); p2.appendChild(el('div', 'mut', detail));
  if (chk.locked && !chk.unavailable) { const e = refundEstimate(rin, chk); p2.appendChild(el('div', 'mut code', `you receive at most about ${fmtSat(e.ln)} by Lightning, or ${fmtSat(e.ecash)} as ecash · the exact figure comes with the invoice, before anything moves`)); }
  box.appendChild(p2); $('r-checkrow').hidden = !melts().some(x => x.pk === rin.pk && x.state === 'pending'); }
async function refundLoad(src){ RIN = null; RCHK = null; renderRefund(); $('r-pw').hidden = true; if (!src || (typeof src === 'string' && !src.trim())) { $('r-info').textContent = ''; return; }
  try { RIN = await refundRead(src); RIN.src = typeof src === 'string' ? src.trim() : null; RPW = null; if (RIN.sealed && !RIN.sk) $('r-pw').hidden = false; renderRefund(); RCHK = await refundCheck(RIN); renderRefund(); } catch (e) { RIN = null; setLines($('r-info'), 'cannot read it: ' + (e.message || e)); } }
$('r-receipt').addEventListener('input', () => refundLoad($('r-receipt').value));
$('r-open').onclick = async () => { try { const f = await pickBytes($('r-file'), 'image/png,application/json,.json,.txt'); $('r-receipt').value = ''; await refundLoad(f.bytes); } catch (e) { show($('r-out'), failText(e), 'bad'); } };
$('r-unlock').onclick = async () => { const b = $('r-unlock'); busy(b, true); try { if (!RIN || !RIN.receipt || !RIN.receipt.refund.sealed) throw new Error('open a receipt first'); RIN.sk = await window.scCore.openSealed(RIN.receipt.refund.sealed, $('r-pass').value); $('r-pass').value = '';
    if (pubOf(RIN.sk) !== RIN.pk) throw new Error('this key is not the receipt\'s refund key'); $('r-pw').hidden = true; show($('r-out'), 'unlocked: the refund key is open in this page until it is closed', 'ok'); renderRefund(); } catch (e) { show($('r-out'), failText(e), 'bad'); } busy(b, false); };
// paying out by Lightning: the melt is written down before it is sent, so a lost answer never leads to paying twice ("Check now")
async function checkMelt(m){ const w = await wallet(m.mint); let q = null; try { q = await w.checkMeltQuoteBolt11(m.quote); } catch (e) { return { state: 'unknown', why: e.message || String(e) }; }
  if (q.state === 'PAID') { m.state = 'paid'; m.checked = nowIso(); saveMelt(m); addDonorKey({ pk: m.pk, paidOut: m.amount }); } else if (q.state === 'UNPAID') { m.state = 'failed'; m.checked = nowIso(); saveMelt(m); }
  return { state: q.state }; }
$('r-check').onclick = async () => { const b = $('r-check'); busy(b, true); try { const m = melts().find(x => RIN && x.pk === RIN.pk && x.state === 'pending'); if (!m) throw new Error('nothing in progress');
    const r = await checkMelt(m); show($('r-out'), r.state === 'PAID' ? `Refund completed: ${fmtSat(m.amount)} reached your Lightning wallet.` : r.state === 'UNPAID' ? `The Lightning payment did not go through. Your sats are in this token: import it into any Cashu wallet, or try again with another invoice:\n${m.token}` : r.state === 'PENDING' ? 'Still in flight: check again in a few minutes. Do not pay or claim again.' : 'The mint did not answer: try again later. ' + (r.why || ''), r.state === 'PAID' ? 'ok' : r.state === 'UNPAID' ? '' : 'bad');
    RCHK = await refundCheck(RIN); renderRefund(); } catch (e) { show($('r-out'), failText(e), 'bad'); } busy(b, false); };
async function recheckMelts(){ for (const m of melts().filter(x => x.state === 'pending')) { try { await checkMelt(m); } catch (_) {} } if (RIN) { RCHK = await refundCheck(RIN).catch(() => RCHK); renderRefund(); } }
addEventListener('online', () => recheckMelts()); setTimeout(() => { if (melts().some(x => x.state === 'pending')) recheckMelts(); }, 2500);
$('r-go').onclick = async () => { const btn = $('r-go'); busy(btn, true); const pageSays = m => Object.assign(new Error(m), { byPage: true }); show($('r-out'), 'checking with the mint…'); try {  /* the last answer goes at once */
  const typed = $('r-receipt').value.trim(); if (typed && (!RIN || RIN.src !== typed)) await refundLoad(typed); if (!RIN) throw pageSays('open your receipt first');
  const { w, info, sk, name, dec } = RIN; if (!sk) throw pageSays(RIN.sealed ? 'unlock the receipt with its password first' : 'no refund key in this receipt');
  if (info.locktime > Date.now() / 1000) { show($('r-out'), `Not yet: the deadline has not passed. The refund opens ${opensText(Number(info.locktime))}; until then only Streetcat + the clinic can move these sats.`, 'bad'); busy(btn, false); return; }
  if (melts().some(x => x.pk === RIN.pk && x.state === 'pending')) throw pageSays('a refund of these sats is in progress: press "check now" first, and do not pay or claim again');
  RCHK = await refundCheck(RIN); renderRefund(); if (RCHK.unavailable) throw new Error('the mint cannot be reached: ' + RCHK.why); const proofs = RCHK.refundable, total = sum(proofs);
  if (!proofs.length) throw pageSays(RCHK.released && !RCHK.refunded ? 'nothing is left to take back: the clinic confirmed and Streetcat released these sats' : 'nothing is left to take back: these sats were already taken back');
  const dest = $('r-ln').value.trim().replace(/^lightning:/i, ''), addr = /^[^@\s]+@[^@\s]+$/.test(dest) ? dest : '';
  let swapFees = 0; try { swapFees = 2 * amt(w.getFeesForProofs(proofs)); } catch (_) {}  // the refund swap, then paying out: input fees on both
  // with an invoice or a Lightning address: ask the mint first, so a bad or too large invoice is refused before anything moves
  let mq = null, inv = addr ? '' : dest;
  if (addr) { show($('r-out'), `asking ${addr.split('@')[1]} for an invoice…`); let want = Math.max(1, total - swapFees - reserveGuess(total)), best = null;
    for (let i = 0; i < 2; i++) { const inv1 = (await window.scCore.lnAddressInvoice(addr, want)).invoice, q1 = await w.createMeltQuoteBolt11(inv1), room = total - swapFees - amt(q1.fee_reserve);  /* the exact room once the mint's reserve is known */
      if (amt(q1.amount) <= room) { best = { inv: inv1, mq: q1 }; if (room === amt(q1.amount)) break; want = room; } else { if (best || room < 1) break; want = room; } }
    if (!best) throw pageSays(`the mint keeps too much for fees to pay ${addr} from ${fmtSat(total)}: take the sats back as ecash instead (leave the field empty)`); inv = best.inv; mq = best.mq; }
  else if (inv) { show($('r-out'), 'checking the invoice with the mint…'); mq = await w.createMeltQuoteBolt11(inv); const room = total - swapFees - amt(mq.fee_reserve);
    if (amt(mq.amount) > room) { show($('r-out'), `Not possible: this invoice is for ${amt(mq.amount)} sat, but the donation is ${total} sat and the mint keeps up to ${amt(mq.fee_reserve) + swapFees} sat for fees. Make an invoice for at most ${Math.max(0, room)} sat, or leave the invoice empty to take the sats back as ecash.`, 'bad');
      if (room > 0) { const r1 = el('div', 'row1'); r1.appendChild(copyBtn(`copy ${room}`, String(room))); $('r-out').appendChild(r1); } busy(btn, false); return; } }
  show($('r-out'), 'contacting the mint…');
  const got = await safeSwap(w, proofs, { privkey: sk, what: { kind: 'refund', pk: pubOf(sk) }, mint: dec.mint }); const plain = cashu.getEncodedToken({ mint: dec.mint, proofs: got, memo: 'refund ' + name });
  buzz(); addDonorKey({ pk: pubOf(sk), sk, refundToken: plain, refunded: new Date().toISOString() });  // a copy in this browser until the donor has the sats
  if (!mq) { show($('r-out'), `REFUNDED ${sum(got)} sat. Import this token into your wallet:\n${plain}`, 'ok'); RCHK = await refundCheck(RIN).catch(() => RCHK); renderRefund(); busy(btn, false); return; }
  const m = { id: 'm' + Date.now().toString(36), quote: mq.quote, amount: amt(mq.amount), reserve: amt(mq.fee_reserve), invoice: inv, to: addr || 'invoice', pk: pubOf(sk), mint: norm(dec.mint), token: plain, at: nowIso(), state: 'pending' }; saveMelt(m);
  show($('r-out'), `REFUNDED ${sum(got)} sat. Sending ${amt(mq.amount)} sat to your Lightning wallet…\nIf it fails, your sats are in this token:\n${plain}`);
  try { const res = await w.ops.meltBolt11(mq, got).run(); const change = res.change || [], left = sum(change);
    const leftTok = left ? cashu.getEncodedToken({ mint: dec.mint, proofs: change, memo: 'refund change ' + name }) : '';
    if (res.quote && res.quote.state && res.quote.state !== 'PAID') { show($('r-out'), `REFUNDED ${sum(got)} sat. The Lightning payment is still in flight (${res.quote.state}): Refund in progress · Do not pay or claim again. Press "check now" in a few minutes. If it fails, the mint frees the sats in this token again (any unused fee is lost):\n${plain}`, 'bad'); }
    else { m.state = 'paid'; m.change = leftTok; saveMelt(m); addDonorKey({ pk: pubOf(sk), refundToken: leftTok, paidOut: amt(mq.amount) }); show($('r-out'), `REFUNDED ${sum(got)} sat: ${amt(mq.amount)} sat sent to your Lightning wallet.` + (left ? `\nThe other ${left} sat (what the invoice did not ask for, plus any unused fee) came back as ecash. Import it into any Cashu wallet:\n${leftTok}` : ''), 'ok'); }
  } catch (e) { let st = ''; try { st = (await w.checkMeltQuoteBolt11(mq.quote)).state; } catch (_) {}
    if (st === 'PAID') { m.state = 'paid'; saveMelt(m); addDonorKey({ pk: pubOf(sk), paidOut: amt(mq.amount) }); } else if (st === 'UNPAID') { m.state = 'failed'; saveMelt(m); }
    show($('r-out'), st === 'PAID' ? `REFUNDED ${sum(got)} sat, and the mint says the Lightning payment went through, although its answer was lost: check your wallet. ${e.message || e}`
      : st === 'UNPAID' ? `REFUNDED ${sum(got)} sat, but the Lightning payment did not go through (${e.message || e}). Before using this token, check that nothing arrived in your Lightning wallet; then import it into any Cashu wallet, or try again with another invoice:\n${plain}`
      : `REFUNDED ${sum(got)} sat. Refund in progress · Do not pay or claim again: the mint's answer about the Lightning payment was lost. Press "check now" to ask the mint. If it failed, your sats are in this token:\n${plain}`, st === 'UNPAID' ? 'bad' : st === 'PAID' ? 'ok' : 'bad'); }
  RCHK = await refundCheck(RIN).catch(() => RCHK); renderRefund();
} catch (e) { show($('r-out'), whyFailed(e), 'bad'); } busy(btn, false); };
// donations made from this browser, ready to fill the refund box
function renderSaved(){ const box = $('r-saved'); if (!box) return; box.textContent = ''; const mine = donorKeys().filter(k => k.lockedToken && !k.refunded);
  if (!mine.length) return; box.appendChild(document.createTextNode('Donations made from this browser: '));
  for (const k of mine) box.appendChild(smallBtn(`${k.campaign || 'donation'} · ${k.amount || '?'} sat · refund after ${k.deadline ? fmtDate(k.deadline) : '?'}`, () => { $('r-receipt').value = k.lockedToken; $('r-receipt').dispatchEvent(new Event('input')); })); }
document.querySelector('nav button[data-t="refund"]').addEventListener('click', renderSaved); renderSaved();

// CAMPAIGN (Streetcat): a pot. What it pays for (the four kinds, two by two), its name, the colony it is for and the partner who confirms
// the spending, each chosen from its own list (StreetCat, 7 Nov: «en for… dos botones, uno que pusiese… choose colony y otro… choose
// partner»; «usar esa misma estética… para submenú de partner… y de colonies»): the colony may be none (every colony), the partner may
// not. The rest comes filled in (StreetCat, 7 Nov: «menos parámetros para crear una nueva campaña»): what it pays as its operation,
// refunds after 30 days, and the campaign before's mint and where donors send, or Minibits; one line says them, with "edit". Streetcat's
// key has no field: it is the published one this browser holds; the partner's comes with the partner. The two keys show in their
// colours, Streetcat green and the partner blue («tienen que estar en sus colores»), and shuffle while "Make the campaign" is held,
// landing as it fills («mientras hay la animación del botón en verde, que se estén barajando las claves»).
// vetlock.kform = 'open' keeps every field open (the suites fill them).
const KMINT = 'https://mint.minibits.cash/Bitcoin';
const kStreetcat = () => STREETCAT_KEYS.find(k => heldFor('streetcat', [k])) || '';
let K = { type: 'sterilisation', col: '', back: 'home' }, K_OPEN = false;
const kPartnerKey = () => { const c = $('k-c').value.trim(); return window.scCore.pointOk(c) ? c.toLowerCase() : ''; };
// a line per key, as on the Keys screen, each in its role's colour; what is wrong, in red
function keyLines(box, rows){ box.querySelectorAll('.kk').forEach(v => { if (v._flap) cancelAnimationFrame(v._flap); }); box.textContent = '';
  for (const [label, role, k, none] of rows) { const d = box.appendChild(document.createElement('div')), l = d.appendChild(document.createElement('small')), v = d.appendChild(document.createElement('span'));
    d.className = 'kline'; d.style.setProperty('--h', String(HUE[role])); l.textContent = label; v.className = 'kk';
    if (k) { v._t = roleOf(k, role); v.appendChild(withKeys(k)); } else { v.textContent = none; if (/^✗/.test(none)) v.classList.add('bad'); } } }
function kKeys(){ const box = $('k-keys'), s = kStreetcat(), typed = $('k-c').value.trim(), pk = kPartnerKey(), par = pk ? partnerOf(pk) : null; box.classList.toggle('bad', !s);
  if (!s) { keyLines(box, []); box.textContent = `✗ This browser does not hold Streetcat's key (${abbr(STREETCAT_KEYS[0])}): import it in Keys.`; return; }
  keyLines(box, [['Streetcat', 'streetcat', s], [par ? `${par.name} · ${par.kind}` : 'partner', 'clinic', pk, typed ? '✗ not a public key yet' : 'choose the partner above']]); }
function kShow(){ $('k-sum').hidden = K_OPEN; $('k-more').hidden = !K_OPEN; }
// the form as it is: the kind chosen, the colony and the partner on their buttons, in their colours, and the line that says the rest
function kDraw(){ const t = KIND(K.type), pk = kPartnerKey(), par = pk ? partnerOf(pk) : null;
  kindChips($('k-type'), K.type, id => { if (id === K.type) return; const was = KIND(K.type).one; K.type = id; if (!$('k-op').value.trim() || $('k-op').value.trim() === was) $('k-op').value = KIND(id).one;
    if (par && !doesKind(par, id)) $('k-c').value = ''; kDefaults(); });
  $('k-name').placeholder = t.eg; setChoose($('k-col'), 'Choose colony', K.col ? K.col.toUpperCase() : '', K.col ? colHue(K.col) : null);
  setChoose($('k-par'), 'Choose partner', par ? par.name.toUpperCase() : pk ? abbr(pk) : '', pk ? HUE.clinic : null);
  const m = $('k-mint').value.trim(); $('k-sum-t').textContent = [$('k-op').value.trim() || t.one, 'refunds after ' + $('k-dl').value, (m.match(/^https?:\/\/([^/]+)/i) || [, m || 'no mint'])[1]].join(' · ');
  kKeys(); kShow(); }
function kDefaults(){ const all = camps().slice().sort((a, b) => (Number(a.created) || 0) - (Number(b.created) || 0)), last = all[all.length - 1], p = (last && last.c) || {}, ck = key('clinic', false);
  const same = all.filter(k => k && k.c && typeOf(k.c) === K.type).pop(), set = (id, v) => { if (!$(id).value.trim() && v) $(id).value = v; };
  // the partner: the one of this kind's last pot, else the first that does this kind, else this browser's own partner key (one phone, all roles)
  const fit = partners().find(x => doesKind(x, K.type)), pk0 = same ? same.c.clinic : fit ? fit.pk : ck ? pubOf(ck) : '';
  set('k-op', KIND(K.type).one); set('k-c', pk0); set('k-mint', p.mint || KMINT); set('k-to', p.to || '');
  if (!$('k-dl').value || new Date($('k-dl').value + 'T23:59:59Z') < new Date()) $('k-dl').value = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  K_OPEN = !$('k-c').value.trim() || ls.get('vetlock.kform') === 'open'; kDraw(); }
$('k-edit').onclick = e => { e.preventDefault(); K_OPEN = true; kShow(); $('k-op').focus(); };
$('k-c').addEventListener('input', () => kDraw()); for (const id of ['k-op', 'k-dl', 'k-mint']) $(id).addEventListener('change', () => kDraw());
$('k-col').onclick = () => pick('colony', 'campaign'); $('k-par').onclick = () => pick('partner', 'campaign');
document.querySelector('nav button[data-t="campaign"]').addEventListener('click', () => kDefaults());  // keys made or imported since, the campaign just made
// held: the keys shuffle in their colours and land as the button fills; let go early, they are back at once
$('k-go').addEventListener('holdstart', () => $('k-keys').querySelectorAll('.kk').forEach(v => { if (v._t) flapKeys(v, v._t, { speed: holdMs() / 1200, hex: true }); }));
$('k-go').addEventListener('holdstop', () => kKeys());
// what this project needs from a mint, read from its own info (NUT-06) and keysets (NUT-02)
async function mintCheck(url){ const get = async p => { const r = await fetch(url + p, { cache: 'no-store' }); if (!r.ok) throw new Error(p + ' answered HTTP ' + r.status); return r.json(); };
  const info = await get('/v1/info'), ks = await get('/v1/keysets'), nuts = info.nuts || {}, on = n => !!(nuts[n] && nuts[n].supported === true);
  const ln = !!(nuts['4'] && !nuts['4'].disabled && (nuts['4'].methods || []).some(m => m.method === 'bolt11' && m.unit === 'sat'));
  const fees = (ks.keysets || []).filter(k => k.unit === 'sat' && k.active !== false).map(k => Number(k.input_fee_ppk || 0)), fee = fees.length ? Math.max(...fees) : null;
  const lines = [[on('11'), 'NUT-11: locks with 2 signatures and a refund key'], [on('7'), 'NUT-07: proof states and the signatures used (status page)'], [on('12'), 'NUT-12: DLEQ proofs (status page)'], [ln, 'NUT-04: Lightning invoices in sat (donate with Lightning)'], [on('9'), 'NUT-09: restore (gets ecash back if an answer is lost)']];
  const text = `Mint: ${info.name || url} · ${info.version || 'version not given'}\n` + lines.map(([v, t]) => (v ? '✓ ' : '✗ ') + t).join('\n') + `\nInput fee: ${fee == null ? 'not given' : fee ? fee + ' ppk (at least 1 sat on every swap: locking ecash, release, refund)' : '0 (swaps are free)'}`;
  return { ok: lines.slice(0, 3).every(x => x[0]), ln, restore: on('9'), fee, text }; }
$('k-go').onclick = async () => { const btn = $('k-go'); busy(btn, true); try {
  let c = { name: $('k-name').value.trim(), op: $('k-op').value.trim() || 'sterilisation', mint: ($('k-mint').value.match(/https?:\/\/[^\s"'<>]+/i) || [$('k-mint').value.trim()])[0].replace(/\/+$/, ''), streetcat: kStreetcat(), clinic: $('k-c').value.trim(), deadline: Math.floor(new Date($('k-dl').value + 'T23:59:59Z').getTime() / 1000) };
  const to = $('k-to').value.trim(); if (to) c.to = to;
  // what it pays for, the colony it is for and its partner (core.js signs them with the rest); a partner named here, by its name
  const par = c.clinic ? partnerOf(c.clinic) : null; c.type = K.type; if (!$('k-op').value.trim()) c.op = KIND(K.type).one; if (K.col) c.colony = K.col; if (par && par.named) c.partner = par.name; c.pkind = par ? par.kind : 'clinic';
  if (!c.streetcat) { const own = key('streetcat', false); throw new Error(own ? `this browser's Streetcat key (${abbr(pubOf(own))}) is not Streetcat's published key (${abbr(STREETCAT_KEYS[0])}): donors' pages would refuse its link, so it cannot sign the donation link. Make the campaign in the browser that holds the published key, or import it in Keys` : `this browser does not hold Streetcat's published key (${abbr(STREETCAT_KEYS[0])}), so it cannot sign the donation link. Make the campaign in the browser that holds it, or import that key in Keys`); }
  for (const k of ['name', 'clinic', 'mint']) if (!c[k]) { if (k === 'mint') { K_OPEN = true; kShow(); } throw new Error(k === 'clinic' ? 'choose the partner who confirms the spending' : 'fill in ' + k); } if (!c.deadline || c.deadline < Date.now() / 1000) { K_OPEN = true; kShow(); throw new Error('deadline must be in the future'); }
  if (!published(c.streetcat)) throw new Error(`this is not Streetcat's published key (${abbr(STREETCAT_KEYS[0])}), so donors' pages would refuse the link: make the campaign with the published key`);
  if (!C.pointOk(c.clinic)) throw new Error('the partner\'s key is not a public key: choose the partner again');
  // a pot with the same partner and the same refund date as another would lock its donations exactly as that one does, and this browser
  // could not tell them apart (7 Nov: two food pots of one shop, made the same day): its refunds open a second earlier, on the same date
  while (camps().some(x => x && x.c && lc(x.c.streetcat) === lc(c.streetcat) && lc(x.c.clinic) === lc(c.clinic) && Number(x.c.deadline) === c.deadline)) c.deadline -= 1;
  try { openCampaign(JSON.stringify(c)); } catch (e) { throw new Error(String(e.message).replace('the mint in this link is not an https address', 'the mint URL must start with https:// (for example https://mint.minibits.cash/Bitcoin)').replace(/: (do not use this link|do not donate through it|ask Streetcat for a link with a sensible deadline)$/, '')); }  // the same checks donors' pages make
  const ssk = heldFor('streetcat', [c.streetcat]); if (!ssk) throw new Error('this browser does not hold the private key of the Streetcat key above, so it cannot sign the donation link. Make the campaign in the browser that holds it, or import that key in Keys');
  show($('k-out'), 'checking the mint…'); let check; try { check = await mintCheck(c.mint); } catch (e) { throw new Error('cannot read this mint (' + (e.message || e) + '). Check the URL.'); }
  if (!check.ok) { show($('k-out'), check.text + '\n\nThis mint cannot hold these donations: pick another one.', 'bad'); busy(btn, false); return; }
  c.hue = newCampHue(); campHue(c);  // its own colour, the first one free in this browser; it travels in the link and the ledger
  c = await window.scCore.signCampaign(c, ssk);  /* signed with Streetcat's key (core.js): donors' pages refuse a link changed afterwards */
  const base = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); let slug = base; for (let n = 2; camps().some(x => x.slug === slug); n++) slug = `${base}-${n}`;  /* a pot never takes the place of another of the same name */
  const link = location.href.split('#')[0].split('?')[0].replace(/\/(clinic|streetcat)$/, '/donate') + '#c=' + b64u.enc(JSON.stringify(c));  // a donation link opens as a donor, whatever page made it
  ls.set(CAMPS, JSON.stringify([...camps(), { c, link, slug, created: Date.now() }])); renderHome(); buzz();
  if (K.back === 'snew' && SN.type === K.type) { SN.pot = slug; if (!SN.col && c.colony) SN.col = c.colony; }  /* made from a request's "Choose pot": back there, it pays from it */
  const ledger = JSON.stringify({ campaign: c, clinicKeySource: 'https://… (where the clinic published its key)', donations: [] }, null, 1);
  // the result is its own screen: the mint's answer types itself out line by line, then three full-width actions
  $('campaign').classList.add('made'); updateBack(); const out = $('k-out'); out.textContent = ''; out.className = 'out ok';
  const lines = check.text.split('\n').concat(check.ln ? [] : ['Donors will have to pay with ecash from this mint: it has no Lightning invoices.'], check.restore ? [] : ['Without NUT-09, a lost answer from this mint cannot be recovered: prefer another mint.'], ['', `Campaign ${c.name} is ready.`]);
  const ticker = document.createElement('div'); ticker.className = 'ticker'; out.appendChild(ticker);
  const acts = document.createElement('div'); acts.className = 'acts'; acts.hidden = true;
  acts.appendChild(copyBtn('copy donation link', link)); const a = document.createElement('a'); a.className = 'sm'; a.href = link; a.textContent = 'open donation page'; acts.appendChild(a); acts.appendChild(copyBtn('copy ledger', ledger));
  const fold = document.createElement('details'); fold.className = 'more'; const sm = document.createElement('summary'); sm.textContent = 'link, JSON and ledger'; fold.appendChild(sm); fold.appendChild(document.createTextNode('\n')); const tx = document.createElement('span'); tx.className = 'mut code'; tx.textContent = `${link}\n\n${JSON.stringify(c)}\n\nStatus page: save this as app/campaigns/${slug}.json in the repository, add every locked token you receive to "donations", and share status.html?l=campaigns/${slug}.json\n${ledger}`; fold.appendChild(tx); fold.appendChild(document.createTextNode('\n'));
  out.appendChild(acts); out.appendChild(fold);
  const annSt = el('div', 'mut'); annSt.hidden = true; out.insertBefore(annSt, acts); annSt.textContent = '· announcing it to donors…';
  announceCamp(c, ssk).then(r => { annSt.className = r.ok ? 'mut' : 'bad'; annSt.textContent = r.ok ? `✓ Announced to donors: ${r.ok} of ${r.n} relays have it. "Check for requests" lists it until its deadline.` : `✗ Not announced to donors: ${r.msg || 'no relay took it'}. Announce it again from Home.`; });
  const another = document.createElement('div'); another.className = 'row1'; const ag = smallBtn('another campaign', () => { $('campaign').classList.remove('made'); out.textContent = ''; out.className = 'out'; $('k-name').value = ''; kDefaults(); updateBack(); }); ag.style.borderColor = 'var(--line)'; another.appendChild(ag); another.hidden = true; out.appendChild(another);
  const reduce = REDUCE(); const step = k => { if (k >= lines.length) { acts.hidden = another.hidden = annSt.hidden = false; buzz(); return; } const l = document.createElement('div'); l.className = 'tl' + (/^(Donors will have to pay with ecash|Without NUT-09)/.test(lines[k] || '') ? ' bad' : ''); l.style.setProperty('--h', String(136 + (k * 11) % 29));  /* what this mint lacks: red */ l.style.setProperty('--l', String(.62 + ((k * 5) % 4) * .07)); ticker.appendChild(l); if (reduce) { l.textContent = lines[k]; step(k + 1); return; } const prev = ticker.querySelectorAll('.cur'); prev.forEach(c => c.remove()); typeKeys(l, lines[k] || ' ', { dur: Math.min(420, 120 + lines[k].length * 6), think: false, done: () => setTimeout(() => step(k + 1), lines[k] ? 90 + Math.random() * 240 : 40) }); }; step(0);
} catch (e) { show($('k-out'), e.message, 'bad'); } busy(btn, false); };
// a campaign is announced to donors on the relays when it is made (relay.js), and again from Home if need be: "Check for requests" on a
// donor's phone lists it until its deadline. What the relays said is kept with the campaign.
// what donors see of a campaign's requests: each cat, its procedure and how far it is (index.js states: released → paid, certified → done)
const annCats = c => sreqs().filter(r => r.q.campaign && campKey(r.q.campaign) === campKey(c)).sort((a, b) => String(a.created).localeCompare(String(b.created)))
  .map(r => ({ name: r.q.patient, procedure: r.q.procedure, state: r.state === 'released' ? 'paid' : r.state === 'certified' ? 'done' : 'requested' }));
// a request made, certified or released: its campaign is announced again, in the background, so donors see it as it is
const reannounce = c => { try { const k = camps().find(x => x && x.c && x.c.sig && campKey(x.c) === campKey(c)), sk = k && heldFor('streetcat', [k.c.streetcat]); if (sk && Number(k.c.deadline) > Date.now() / 1000) announceCamp(k.c, sk); } catch (_) {} };
async function announceCamp(c, sk){ const R0 = window.scRelay; if (!R0) return { ok: 0, n: 0, msg: 'this browser cannot reach the relays' };
  try { const k0 = camps().find(x => x && x.c && x.c.sig && x.c.sig === c.sig), ev = await R0.announceEvent(c, sk, { kind: k0 && k0.kind, cats: annCats(c) }), res = await R0.publish(ev, relays(), { timeout: 8000 }), ok = res.filter(x => x.ok).length;
    const a = camps(), k = a.find(x => x && x.c && x.c.sig && x.c.sig === c.sig); if (k) { k.ann = { ok, n: res.length, at: Date.now() }; ls.set(CAMPS, JSON.stringify(a)); }
    return { ok, n: res.length }; } catch (e) { return { ok: 0, n: 0, msg: String((e && e.message) || e) }; } }
// every open campaign of this browser reaches the donors by itself (StreetCat, 7 Nov: «cuando yo creo una campaña, le tiene que aparecer al
// donante… Esa y todas las campañas»): each time Home opens, one that no relay took, or from before the announcements, or not announced
// for a day (a relay may drop it), is announced again, quietly; one at a time, never two passes at once. "announce to donors" stays.
async function announceAll(){ if (announceAll.busy || !window.scRelay) return; announceAll.busy = true;  /* on the function: Home is drawn before this line has run */
  try { for (const k of camps()) { if (!k || !k.c || !k.c.sig || !(Number(k.c.deadline) > Date.now() / 1000)) continue;
      if (k.ann && k.ann.ok && Date.now() - Number(k.ann.at || 0) < 864e5) continue;
      const sk = heldFor('streetcat', [k.c.streetcat]); if (sk) await announceCamp(k.c, sk); } }
  catch (_) {} announceAll.busy = false; }
// HOME (Streetcat): what it pays for, the four kinds two by two (StreetCat, 7 Nov: «esos botones de sterilization, vet care, food y other
// deberían de estar agrupados en dos filas uniformes de dos cada una»), each with its pots, its requests and what is left to spend; a
// kind opens its own screen (skind), with its pots and requests. And what this browser holds.
function renderHome(){ setTimeout(announceAll, 0); const a = camps(); $('h-n').textContent = String(a.length); $('h-rel').textContent = unpaid().reduce((s, r) => s + Number(r.amount || 0), 0) + ' sat'; lnField();
  try { homeKinds(); } catch (_) {}  /* Home is drawn before the requests' code has run: drawn again once the page has set itself up */
  if (a.some(k => k && k.c && !k.c.sig && heldFor('streetcat', [k.c.streetcat]))) signOldCampaigns(); }
// a pot in a list (its kind's screen): its name in its colour, its colony, its partner and the days left, what was given and what is left
// to spend; a tap opens what can be done with it: its donations and requests, its link, its ledger, the status page, announcing it
function potRow(box, k){ const c = k.c, left = Math.ceil((c.deadline - Date.now() / 1000) / 86400), par = partnerOf(c.clinic), it = el('button', 'req'); it.type = 'button'; it.style.setProperty('--h', String(campHue(c)));
  const given = Object.values(scEntries(c)).reduce((s, e) => s + Number(e.amount || 0), 0);
  it.appendChild(el('div', 'title', c.name)); it.appendChild(el('div', 'sub2', [k.kind === 'request' ? 'request' : '', c.colony || 'every colony', par ? par.name : c.partner || 'its partner', left > 0 ? left + ' day' + (left === 1 ? '' : 's') + ' left' : 'closed'].filter(Boolean).join(' · ')));
  it.appendChild(el('div', 'sub2', `${fmtSat(given)} given · ${fmtSat(potFree(c))} to spend`)); box.appendChild(it);
  it.onclick = () => { if (it.nextSibling && it.nextSibling.classList && it.nextSibling.classList.contains('row2')) { it.nextSibling.remove(); return; } const row = document.createElement('div'); row.className = 'row2'; row.appendChild(copyBtn(k.c.sig ? 'copy signed link' : 'copy link (unsigned)', k.link)); const st = document.createElement('a'); st.className = 'sm'; st.href = `status.html?l=campaigns/${k.slug}.json`; st.textContent = 'status'; row.appendChild(st);
    const lb = smallBtn('copy ledger', async () => { const ok = await copyText(JSON.stringify(ledgerFor(k.c), null, 1)); if (ok) doneLabel(lb); else flapLabel(lb, 'select it', 2500); }); lb.style.gridColumn = '1 / -1'; row.appendChild(lb);
    const dr = smallBtn('donations and requests', () => { CUR_CAMP = k.slug; openTab('scamp'); }); dr.style.gridColumn = '1 / -1'; row.insertBefore(dr, row.firstChild);
    const R0 = window.scRelay, sk0 = heldFor('streetcat', [k.c.streetcat]);
    if (R0 && sk0) { const pb = smallBtn('publish ledger', async () => { pb.disabled = true; try { const ev = await R0.ledgerEvent(ledgerFor(k.c), sk0), res = await R0.publish(ev, relays()), ok = res.filter(x => x.ok).length;
        if (ok) { doneLabel(pb, `published · ${ok} of ${res.length} relays`); buzz(); } else flapLabel(pb, 'no relay took it', 5000); } catch (e) { flapLabel(pb, /too large/.test(e.message) ? 'too large: copy it' : 'not published', 5000); } pb.disabled = false; });
      pb.style.gridColumn = '1 / -1'; row.appendChild(pb);
      const ann = (camps().find(x => x && x.c && x.c.sig && x.c.sig === k.c.sig) || k).ann;  /* as it is now: Home may have announced it since it was drawn */
      if (k.c.sig && Number(k.c.deadline) > Date.now() / 1000) { const ab = smallBtn(ann && ann.ok ? `announced to donors · ${ann.ok} of ${ann.n} relays` : 'announce to donors', async () => { ab.disabled = true; const r = await announceCamp(k.c, sk0);
          if (r.ok) { doneLabel(ab, `announced to donors · ${r.ok} of ${r.n} relays`); buzz(); } else flapLabel(ab, 'no relay took it', 5000); ab.disabled = false; }); ab.style.gridColumn = '1 / -1'; row.insertBefore(ab, pb); } }  /* above "publish ledger" */
    window.scCore.campaignId(k.c).then(id => { st.href = `status.html?n=${id}&l=campaigns/${k.slug}.json`; }).catch(() => {});  /* the status page finds the published ledger by the campaign's id */
    it.after(row); };  // the ledger to publish: every donation by its DON- code (version 2)
  return it; }
// campaigns made before links were signed: signed here, once, when this browser holds their Streetcat key (the same campaign, a signed link)
async function signOldCampaigns(){ if (signOldCampaigns.busy) return 0; signOldCampaigns.busy = true; let n = 0; try { const a = camps();
    for (const k of a) { if (!k || !k.c || k.c.sig) continue; const sk = heldFor('streetcat', [k.c.streetcat]); if (!sk) continue;
      try { const c = await window.scCore.signCampaign(k.c, sk); k.c = c; k.link = String(k.link || location.href).split('#')[0] + '#c=' + b64u.enc(JSON.stringify(c)); n++; } catch (_) {} }
    if (n) ls.set(CAMPS, JSON.stringify(a)); } catch (_) {} signOldCampaigns.busy = false; if (n) renderHome(); return n; }
// Home: the Lightning address what is released goes to, and whether it answers (checked when it is saved and when Home first shows)
function lnField(){ const i = $('h-ln'); if (!i || document.activeElement === i) return; i.value = String(ls.get(PAYTO) || ''); if (!lnField.done) { lnField.done = true; lnCheck(false); } }
async function lnCheck(saving){ const st = $('h-ln-st'), v = $('h-ln').value.trim().replace(/^lightning:/i, '');
  if (!v) { if (saving) ls.set(PAYTO, ''); show(st, ''); return; }  /* empty: nothing to say (StreetCat, 6 Nov); released ecash stays in this browser */
  const url = window.scCore.lnAddressUrl(v); if (!url) { show(st, `✗ ${v} is not a Lightning address (name@domain)` + (saving ? ': nothing was saved.' : '.'), 'bad'); return; }
  if (saving) { ls.set(PAYTO, v); $('h-ln').value = v; }
  show(st, `checking ${v}…`);
  try { let r; try { r = await fetch(url, { headers: { accept: 'application/json' } }); } catch (_) { throw new Error('it cannot be reached from this browser'); } const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.tag !== 'payRequest') throw new Error(j && j.reason ? j.reason : `it answered HTTP ${r.status}`);
    show(st, `✓ Every release is paid at once to ${v}.`, 'ok'); if (saving) buzz();
  } catch (e) { show(st, `✗ ${v}: ${e.message || e}. Until it answers, what is released stays in this browser.`, 'bad'); } }
$('h-ln').addEventListener('change', () => lnCheck(true));
// a new campaign form, not the last one made: of this kind, for this colony, and back to the screen it was opened from
const kFresh = (type, back, col = '') => { K = { type: KINDS.some(t => t.id === type) ? type : K.type, col, back }; BACK.campaign = back; for (const id of ['k-name', 'k-c', 'k-op']) $(id).value = '';
  $('campaign').classList.remove('made'); const out = $('k-out'); out.textContent = ''; out.className = 'out'; openTab('campaign'); };
$('h-new').onclick = () => kFresh(K.type, 'home'); $('h-req').onclick = () => snFresh(SN.type, 'home'); $('h-release').onclick = () => openTab('release'); $('h-keys').onclick = e => { e.preventDefault(); openTab('keys'); };
renderReleased(); recoverFlights(); renderHome(); setTimeout(() => { if (payouts().some(x => x.state === 'pending')) recheckPayouts(); }, 2000); addEventListener('online', () => recheckPayouts());  /* a payment whose answer was lost: asked about again */
// ===== THE WORK BETWEEN STREETCAT, THE CLINIC, THE VOLUNTEERS AND THE DONORS =====
// A request (Streetcat → clinic), its answer (clinic → Streetcat) and a donation (donor or volunteer → Streetcat) travel by Nostr relay
// (relay.js), and the very same payload by link, file or QR when no relay confirms it. The protocol is core.js; this is its interface.
// What is sent waits in the outbox until two relays confirm it; what arrives is checked against the campaign before it is shown.
const C = window.scCore, R = window.scRelay, lc = k => String(k || '').toLowerCase(), nowIso = () => new Date().toISOString(), today = () => new Date().toISOString().slice(0, 10);
const jget = (k, d) => { try { const v = JSON.parse(ls.get(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } }, jset = (k, v) => ls.set(k, JSON.stringify(v));
// the relays: relay.js's list, or the one kept under vetlock.relays (comma-separated) when Streetcat picks its own
const RELAYLIST = 'vetlock.relays', relays = () => { const s = String(ls.get(RELAYLIST) || '').split(',').map(x => x.trim()).filter(x => /^wss?:\/\/\S+$/.test(x)); return s.length ? s : (R ? R.RELAYS : []); };
const OUTBOX = R ? R.outbox({ get: k => ls.get(k), set: (k, v) => ls.set(k, v) }) : null;
const online = () => navigator.onLine !== false, when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const fmtSat = n => Number(n || 0).toLocaleString('en').replace(/,/g, ' ') + ' sat';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const saveFile = (name, text, type = 'application/json') => { const a = document.createElement('a'); a.href = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); };
const pickFile = input => new Promise((res, rej) => { input.value = ''; input.onchange = () => { const f = input.files && input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('this file cannot be read')); r.readAsText(f); }; input.click(); });
// the app's address for a role: a request opens as the clinic, an answer as Streetcat
const appLink = role => { const u = location.href.split('#')[0].split('?')[0]; return /\/(donate|clinic|streetcat)$/.test(u) ? u.replace(/\/(donate|clinic|streetcat)$/, '/' + role) : u + '?role=' + role; };
const linkOf = (obj, role) => C.linkFor(appLink(role), obj);
const failText = e => (e && e.kept ? 'Interrupted: ' : e && e.byPage ? 'Not possible: ' : 'Failed: ') + ((e && e.message) || e);
let FLUSHING = null;
async function flush(){ if (!OUTBOX || !online()) return []; if (FLUSHING) return FLUSHING; FLUSHING = OUTBOX.flush({ timeout: 8000 }).catch(() => []).finally(() => { FLUSHING = null; setTimeout(refreshStates, 0); }); return FLUSHING; }
const sentState = id => { const it = id && OUTBOX && OUTBOX.list().find(x => x.id === id); return it ? { state: it.state, acked: it.acked.length, of: it.relays.length, tries: it.tries || 0 } : { state: 'none', acked: 0, of: 0, tries: 0 }; };
const sentText = s => s.state === 'sent' ? `sent · ${s.acked} of ${s.of} relays have it` : s.state === 'failed' ? 'not sent: no relay took it in a day. Send the link or the file instead' : s.state === 'sending' ? (s.acked ? `sending · ${s.acked} of ${s.of} relays have it so far` : online() ? 'waiting for a relay to take it' : 'waiting for a connection') : '';
const sentShort = id => { const s = sentState(id); return s.state === 'sent' ? 'sent' : s.state === 'failed' ? 'not sent' : s.state === 'none' ? 'not sent' : s.acked ? `${s.acked} of ${s.of} relays` : online() ? 'sending' : 'offline'; };

// ----- the clinic: requests to review, one by one -----
const CREQ = 'vetlock.clinic.requests', creqs = () => { const a = jget(CREQ, []); return Array.isArray(a) ? a.filter(x => x && x.q && x.id) : []; };
const saveCreq = r => jset(CREQ, [...creqs().filter(x => x.id !== r.id), r]);
const clinicSkFor = q => q && q.campaign ? heldFor('clinic', [q.campaign.clinic]) : null;
const CGROUP = { review: 'To review', sending: 'Waiting to be sent', reported: 'Reported', done: 'Done' };
const cGroup = r => r.state === 'review' ? 'review' : r.state === 'reported' ? 'reported' : sentState(r.outbox).state === 'sent' || r.handed || r.ackedAt ? 'done' : 'sending';
async function takeRequest(q0, from){ const { photoData, ...q } = q0 || {};
  if (photoData && typeof photoData === 'object') for (const ph of Array.isArray(q.photos) ? q.photos : []) { const s = photoData[ph.slot]; if (typeof s === 'string' && s.length <= C.CAT_PHOTO_MAX * 2) { try { await keepPhoto(String(ph.sha256), unb64(s)); } catch (_) {} } }  /* a file carries its photos */
  const have = creqs().find(x => x.id === q.id); if (have) return have;
  const r = { id: q.id, q, from, at: nowIso(), state: 'review', problems: C.requestProblems(q) }; saveCreq(r);
  const sk = clinicSkFor(q); if (sk && OUTBOX && !r.problems.length) { try { await OUTBOX.add(R.receiptFor(q), sk, q.campaign.streetcat, { relays: relays(), label: 'received ' + q.id }); flush(); } catch (_) {} }  /* tells Streetcat it arrived */
  return r; }
const CSEEN = 'vetlock.clinic.seen';
async function clinicCheck(){ const sks = heldKeys('clinic'); if (!R) return { text: 'relays are not available in this browser' }; if (!sks.length) return { text: 'no clinic key in this browser yet: make one in settings' };
  if (!online()) return { text: 'no connection: showing what this phone already has' };
  const mine = new Set(sks.map(pubOf)), seen = new Set(jget(CSEEN, []));
  const expect = p => { if (!p) return null; if (p.t === 'streetcat.request' && p.campaign && mine.has(lc(p.campaign.clinic))) return p.campaign.streetcat;
    if (p.t === 'streetcat.request-photo' && mine.has(lc(p.clinic))) return p.from;  /* a request's photo: to this clinic's key, from the Streetcat key that sends it (it may come before its request) */
    const r = p.t === 'streetcat.received' && creqs().find(x => x.id === p.id); return r ? r.q.campaign.streetcat : null; };
  const res = await R.receive(sks, { relays: relays(), seen, expect, timeout: 8000 }); let n = 0;
  for (const m of res.messages) { const p = m.payload; if (p.t === 'streetcat.request') { if (!creqs().some(x => x.id === p.id)) { await takeRequest(p, 'relay'); n++; } }
    else if (p.t === 'streetcat.request-photo') { try { await takeReqPart(p); } catch (_) {} }
    else { const r = creqs().find(x => x.id === p.id); if (r && !r.ackedAt) { r.ackedAt = p.at || nowIso(); saveCreq(r); } } }
  jset(CSEEN, [...seen].slice(-400)); await flush(); const ok = res.relays.filter(x => x.ok).length;
  return { n, text: `${n ? n + ' new · ' : ''}checked at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${ok} of ${res.relays.length} relays answered` }; }
function renderWork(){ const list = $('w-list'); list.textContent = ''; const all = creqs().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  $('w-n').textContent = String(all.filter(r => cGroup(r) === 'review').length); $('w-done').textContent = String(all.filter(r => cGroup(r) === 'done').length);
  /* no requests yet: the list says nothing (StreetCat, 6 Nov: «elimina ese texto») */
  for (const g of ['review', 'sending', 'reported', 'done']) { const rs = all.filter(r => cGroup(r) === g); if (!rs.length) continue; list.appendChild(el('div', 'grp', CGROUP[g]));
    for (const r of rs) { const it = el('div', 'item'), l = el('div'); l.appendChild(el('div', 'nm', `${r.q.patient} · ${r.q.procedure}`)); l.appendChild(el('div', 'sub2', `${r.q.date} · ${fmtSat(C.requestAmount(r.q))} · ${r.q.campaign.name}${r.problems && r.problems.length ? ' · ✗ not valid' : ''}`)); it.appendChild(l);
      const st = g === 'review' ? ['→', 'wait'] : g === 'done' ? [r.ackedAt ? 'received' : 'sent', 'ok'] : g === 'reported' ? [sentState(r.outbox).state === 'sent' || r.handed ? 'sent' : 'to send', 'bad'] : [sentShort(r.outbox), /^(not sent|offline)$/.test(sentShort(r.outbox)) ? 'bad' : ''];
      it.appendChild(el('div', 'st ' + st[1], st[0])); it.onclick = () => { CUR_CREQ = r.id; openTab('creq'); }; list.appendChild(it); } }
  offlineChecks().then(items => { const bad = items.filter(i => i.state === 'bad').length, o = $('w-offline');  // "Offline setup", after Certify a token (StreetCat, 6 Nov), in red while something is missing
    o.classList.toggle('bad', !!bad); o.title = bad ? `not ready for offline: ${bad} to fix` : 'ready for offline'; o.setAttribute('aria-label', 'Offline setup: ' + o.title); }).catch(() => {}); }
let CUR_CREQ = null, REASON = '';
// what the partner is (the request's pot says it, signed by Streetcat): a clinic confirms a procedure on a cat, as before; a shop a
// delivery, with photos of the delivery note and of the goods; another partner what was delivered or done, with photos of the receipt
// and of it (StreetCat, 7 Nov: «Y si se selecciona un partner, que no sea una clínica… fotos del albarán… o fotos del pedido»)
const pkindOf = q => C.PKINDS.includes(q && q.campaign && q.campaign.pkind) ? q.campaign.pkind : 'clinic';
const PWORDS = { shop: { note: 'delivery note', goods: 'the goods', ok: 'I confirm this was delivered as it says, on this date.', go: 'Confirm delivery', label: 'Photos of the delivery', done: 'DELIVERY CONFIRMED' },
  other: { note: 'the receipt', goods: 'what was done', ok: 'I confirm this was delivered or done as it says, on this date.', go: 'Confirm it is done', label: 'Photos of what was done', done: 'CONFIRMED' } };
let CR_SHOTS = {}, CR_SHOTS_ID = null;
const crShotsLine = w => { const a = Object.values(CR_SHOTS), kb = Math.round(a.reduce((s, p) => s + p.bytes.length, 0) / 1000); $('cr-shots-st').textContent = a.length ? `${a.length} of 2 · ${kb} kB, made small here, without location data. They go to Streetcat with the confirmation, named in it.` : `At least one: ${w.note}, or ${w.goods}. Made small here, without location data; they go to Streetcat with the confirmation.`; };
const crShotsDraw = w => { document.querySelectorAll('#cr-shots .shot').forEach(b => { const p = CR_SHOTS[b.dataset.slot]; b.querySelector('span').textContent = w[b.dataset.slot]; b.querySelectorAll('img').forEach(i => i.remove()); b.classList.toggle('has', !!p);
    if (p) { const img = el('img'); img.alt = w[b.dataset.slot]; img.src = URL.createObjectURL(new Blob([p.bytes], { type: 'image/jpeg' })); b.prepend(img); } }); crShotsLine(w); };
document.querySelectorAll('#cr-shots .shot').forEach(b => { b.onclick = async () => { const r = creqs().find(x => x.id === CUR_CREQ), w = r && PWORDS[pkindOf(r.q)]; if (!w) return; const input = $('cr-shot-file');
  const f = await new Promise(res => { input.value = ''; input.onchange = () => res(input.files && input.files[0]); input.click(); }); if (!f) return;
  b.classList.add('busy'); try { CR_SHOTS[b.dataset.slot] = await shrinkPhoto(f); crShotsDraw(w); show($('cr-out'), ''); } catch (e) { show($('cr-out'), failText(e), 'bad'); } b.classList.remove('busy'); }; });
function renderCreq(){ const r = creqs().find(x => x.id === CUR_CREQ), head = $('cr-head'), dl = $('cr-dl'); head.textContent = ''; dl.textContent = ''; $('cr-gives').textContent = ''; show($('cr-warn'), ''); show($('cr-out'), '');
  $('cr-pics-box').hidden = true; if (!r) { head.appendChild(el('div', 'mut', 'No request open.')); $('cr-act').hidden = true; $('cr-cat').hidden = true; return; }
  const q = r.q, c = q.campaign, w = PWORDS[pkindOf(q)], vet = !w && KIND(typeOf(c)).vet; head.style.setProperty('--h', String(campHue(c))); head.appendChild(el('div', 'title', c.name)); head.appendChild(el('div', 'mut', `${c.op || 'operation'} · request ${q.id}`));
  for (const [k, v] of [[vet ? 'Cat' : 'For', q.patient], [vet ? 'Procedure' : 'What', q.procedure], ['Date', q.date], ['Releases', fmtSat(C.requestAmount(q))], ...(q.note ? [['Note', q.note]] : []), ['From', `Streetcat ${abbr(c.streetcat)}`], ['Arrived', `${when(r.at)} · ${({ relay: 'by relay', link: 'by link', file: 'from a file', 'in person': 'in person, by QR' })[r.from] || r.from}`]]) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
  $('cr-gives').textContent = q.contributions.map(k => `${k.ref} · ${fmtSat(k.release)} of ${fmtSat(k.proofs.reduce((s, p) => s + amt(p.amount), 0))}`).join('\n');
  creqPics(q);
  const sk = clinicSkFor(q), late = Number(c.deadline) < Date.now() / 1000, bad = (r.problems || []).length || !sk;
  const warn = [...(r.problems || []).map(p => '✗ ' + p), ...(sk ? [] : [`✗ This phone has no clinic key for ${c.name} (${abbr(c.clinic)}). Open the request on the phone that holds that key, or restore its backup in settings.`]), ...(late ? [`⚠ The refund date (${fmtDate(c.deadline)}) has passed: donors may take their sats back at any moment. You can still confirm: Streetcat releases whatever is still locked.`] : [])];
  if (warn.length) show($('cr-warn'), warn.join('\n'), bad ? 'bad' : '');
  const open = r.state === 'review'; $('cr-act').hidden = !open; $('cr-ok').checked = false; $('cr-ok').disabled = !!bad; $('cr-go').disabled = true; REASON = ''; document.querySelectorAll('#cr-why button').forEach(b => b.classList.remove('on')); $('cr-report').disabled = true; $('cr-note').value = ''; $('cr-prob').open = false; $('cr-prob').hidden = !sk;
  EVID = null; evLine(); if (!open) answerOut(r); creqCat(r);
  // a shop or another partner: its words, and its photos instead of the invoice's fingerprint
  $('cr-ok-t').textContent = w ? w.ok : 'I confirm this procedure was done on this cat, on this date.'; $('cr-evrow').hidden = $('cr-ev').hidden = !!w; $('cr-shots-box').hidden = !w || !open;
  if (CR_SHOTS_ID !== r.id) { CR_SHOTS = {}; CR_SHOTS_ID = r.id; } if (w) { $('cr-shots-l').textContent = w.label; crShotsDraw(w); }
  const go = $('cr-go'); if (!go.classList.contains('holding') && !go._hint && !go.classList.contains('fin')) go.textContent = w ? w.go : 'Confirm procedure'; }
// the cat as Streetcat caught it, to check it is this cat; redrawn alone when a photo arrives, so a ticked box stays ticked
function creqPics(q){ const np = (q.photos || []).length; $('cr-pics-box').hidden = !np; if (!np) return;
  photoTiles($('cr-pics'), q.photos, 'on its way').then(n => { $('cr-pics-st').textContent = n === np ? 'Taken by Streetcat when the cat was caught. Check it is this cat. A tap shows a photo big.' : `${np - n} of ${np} on their way: they come by relay, with a connection.`; }); }
// the invoice or a photo: hashed here, the file never leaves this phone; only { sha256, kind } goes into the signed declaration
let EVID = null;
const evLine = () => { const e = $('cr-ev'); e.textContent = ''; if (!EVID) { e.textContent = 'Optional: only the file\'s fingerprint (SHA-256) goes with the confirmation. The file stays on this phone.'; return; }
  e.appendChild(document.createTextNode(`${EVID.kind} · fingerprint ${EVID.sha256.slice(0, 16)}… · ${EVID.name} stays on this phone · `)); const x = el('a', null, 'remove'); x.href = '#'; x.onclick = ev => { ev.preventDefault(); EVID = null; evLine(); }; e.appendChild(x); };
const pickBytes = (input, accept) => new Promise((res, rej) => { input.value = ''; input.accept = accept; input.onchange = () => { const f = input.files && input.files[0]; if (!f) return; f.arrayBuffer().then(b => res({ name: f.name, bytes: new Uint8Array(b) }), () => rej(new Error('this file cannot be read'))); }; input.click(); });
for (const [id, kind, accept] of [['cr-inv', 'invoice', 'application/pdf,image/*'], ['cr-photo', 'photo', 'image/*']]) $(id).onclick = async () => { try { const f = await pickBytes($('cr-file'), accept); EVID = { kind, sha256: await C.sha256hex(f.bytes), name: f.name }; evLine(); } catch (e) { show($('cr-out'), failText(e), 'bad'); } };
// the answer goes to Streetcat by relay by itself, and says so: sent, then received (StreetCat, 7 Nov: «los botones esos solo salgan en el
// modo offline… si no es redundante»). Only when it has not gone (no connection, or no relay took it) the warning shows, in red, with
// the other ways: the link, the file, the QR. Gone, a small link still shows it as QR, for Streetcat in person without a connection.
const stuck = (s, made) => s.state === 'failed' || (s.state === 'sending' && !s.acked && (s.tries > 0 || Date.now() - Date.parse(made) > 60000));  /* tried, or a minute, and no relay took it */
function answerOut(r){ const out = $('cr-out'), a = r.answer; if (!a) return; const s = sentState(r.outbox), gone = s.state === 'sent' || !!r.ackedAt || r.handed;
  const w = PWORDS[pkindOf(r.q)], nph = ((a.statement && a.statement.photos) || []).length;
  const head = a.kind === 'certified' ? `${w ? w.done : 'CONFIRMED'} · ${when(a.statement.signed)}\n` + (a.statement.evidence ? `with the ${a.statement.evidence.kind}'s fingerprint ${a.statement.evidence.sha256.slice(0, 16)}…\n` : '') + (nph ? `with ${nph} photo${nph > 1 ? 's' : ''}, named in it · ${ansPhotosSent(r) ? '✓ sent' : 'sending'}\n` : '') : `PROBLEM REPORTED (${a.statement.reason}) · ${when(a.statement.signed)}\n`;
  const qrLink = t => { const p = el('p', 'center lnk'), x = el('a', null, t); x.href = '#'; x.onclick = async e => { e.preventDefault(); const box = el('div', 'term'), lbl = el('div', 'mut'); p.replaceWith(box); box.after(lbl); showQR(box, await C.pack(a), lbl); r.handed = true; saveCreq(r); }; p.appendChild(x); return p; };
  if (gone || (online() && OUTBOX && !stuck(s, a.statement.signed))) {
    show(out, head + (s.state === 'sent' || s.acked ? `✓ sent to Streetcat · ${s.acked} of ${s.of} relays have it\n` : r.handed && s.state !== 'sending' ? '✓ given to Streetcat by link, file or QR\n' : '· sending to Streetcat…\n') + (r.ackedAt ? `✓ received by Streetcat · ${when(r.ackedAt)}` : '· received by Streetcat'), a.kind === 'certified' ? 'ok' : '');
    out.appendChild(qrLink('Streetcat offline? Show it as QR')); return; }
  show(out, head + (!OUTBOX ? '✗ Not sent: this browser cannot reach the relays.' : !online() ? '✗ Not sent: no connection. It goes by itself once there is one.' : '✗ Not sent: no relay took it.') + '\nOr give it to Streetcat another way:', a.kind === 'certified' ? 'ok' : '');
  const row = el('div', 'row2'), lb = smallBtn('copy link for Streetcat', async () => { const ok = await copyText(await linkOf(a, 'streetcat')); if (ok) { doneLabel(lb); r.handed = true; saveCreq(r); } else flapLabel(lb, 'select it'); });
  row.appendChild(lb); row.appendChild(smallBtn('save as file', () => { saveFile(`answer-${r.id}.json`, JSON.stringify(a)); r.handed = true; saveCreq(r); })); out.appendChild(row);
  const rq = el('div', 'row1'), qb = smallBtn('show as QR', async () => { const box = el('div', 'term'), lbl = el('div', 'mut'); rq.replaceWith(box); box.after(lbl); showQR(box, await C.pack(a), lbl); r.handed = true; saveCreq(r); }); rq.appendChild(qb); out.appendChild(rq);
  if (s.state !== 'sent' && OUTBOX && online()) { const r1 = el('div', 'row1'); r1.appendChild(smallBtn('send again', async () => { await flush(); renderCreq(); })); out.appendChild(r1); } }
$('cr-ok').onchange = () => { $('cr-go').disabled = !$('cr-ok').checked; };
document.querySelectorAll('#cr-why button').forEach(b => { b.onclick = () => { REASON = b.dataset.r; document.querySelectorAll('#cr-why button').forEach(x => x.classList.toggle('on', x === b)); $('cr-report').disabled = false; }; });
async function clinicAnswer(make){ const r = creqs().find(x => x.id === CUR_CREQ); if (!r) throw new Error('no request open'); const sk = clinicSkFor(r.q); if (!sk) throw new Error(`this phone has no clinic key for ${r.q.campaign.name}`);
  r.answer = await make(r, sk); r.state = r.answer.kind === 'report' ? 'reported' : 'answered'; r.offline = !online(); saveCreq(r); buzz();
  if (OUTBOX) { const it = await OUTBOX.add(r.answer, sk, r.q.campaign.streetcat, { relays: relays(), label: 'answer ' + r.id }); r.outbox = it.id; saveCreq(r); }
  renderCreq(); await flush(); renderCreq(); }
$('cr-go').onclick = async () => { const btn = $('cr-go'); busy(btn, true); try { if (!$('cr-ok').checked) throw new Error('tick the box first');
    const r0 = creqs().find(x => x.id === CUR_CREQ), w = r0 && PWORDS[pkindOf(r0.q)], shots = w ? C.ANS_SLOTS.filter(s => CR_SHOTS[s]).map(s => ({ slot: s, sha256: CR_SHOTS[s].sha256, bytes: CR_SHOTS[s].bytes.length, w: CR_SHOTS[s].w, h: CR_SHOTS[s].h })) : [];
    if (w && !shots.length) throw new Error(`add a photo first: ${w.note}, or ${w.goods}`);
    try { for (const p of shots) await IDB.put('photos', p.sha256, CR_SHOTS[p.slot].bytes); } catch (_) { throw Object.assign(new Error('this browser cannot keep the photos (a private window?): open the app in a normal window'), { byPage: true }); }  /* before the confirmation names them */
    await clinicAnswer((r, sk) => C.certify(r.q, sk, undefined, !w && EVID ? { sha256: EVID.sha256, kind: EVID.kind } : null, shots)); if (shots.length) { CR_SHOTS = {}; ansParts().then(() => { if ($('creq').classList.contains('on')) renderCreq(); }).catch(() => {}); } }
  catch (e) { show($('cr-out'), failText(e), 'bad'); } busy(btn, false); };
// the confirmation's photos, every part that two relays do not have yet, wrapped for Streetcat's key (as a request's, reqParts)
let ANSSENDING = null;
const ansPhotosSent = r => { const need = Math.min(2, relays().length), ps = (r.answer && r.answer.statement && r.answer.statement.photos) || []; return !!need && ps.every(ph => Array.from({ length: nParts(ph) }, (_, i) => ph.slot + '.' + i).every(k => ((r.parts || {})[k] || []).length >= need)); };
async function ansParts(){ if (ANSSENDING) return ANSSENDING; if (!R || !online()) return; ANSSENDING = (async () => { const rels = relays(), need = Math.min(2, rels.length);
    for (const r0 of creqs()) { const a = r0.answer, ps = (a && a.kind === 'certified' && a.statement && a.statement.photos) || []; if (!ps.length || !r0.outbox || ansPhotosSent(r0)) continue; const sk = clinicSkFor(r0.q); if (!sk) continue;
      for (const ph of ps) { let bytes = null; try { bytes = await IDB.get('photos', ph.sha256); } catch (_) {} if (!bytes) continue;
        for (const part of C.ansPhotoParts(r0.id, ph.slot, ph.sha256, b64of(new Uint8Array(bytes)), r0.q.campaign.clinic, r0.q.campaign.streetcat)) { const r = creqs().find(y => y.id === r0.id) || r0; r.parts = r.parts || {}; const acked = r.parts[part.kind] || []; if (acked.length >= need) continue;
          try { const res = await R.publish(await R.wrap(part, sk, r0.q.campaign.streetcat), rels.filter(u => !acked.includes(u)), { timeout: 8000 }); for (const x of res) if (x.ok && !acked.includes(x.url)) acked.push(x.url); } catch (_) {}
          r.parts[part.kind] = acked; saveCreq(r); } } } })().finally(() => { ANSSENDING = null; }); return ANSSENDING; }
$('cr-report').onclick = async () => { const btn = $('cr-report'); busy(btn, true); try { if (!REASON) throw new Error('pick what happened'); await clinicAnswer((r, sk) => C.report(r.q, sk, REASON, $('cr-note').value.trim())); } catch (e) { show($('cr-out'), failText(e), 'bad'); } busy(btn, false); };
$('w-check').onclick = async () => { const btn = $('w-check'); busy(btn, true); $('w-net').textContent = 'checking the relays…'; try { const res = await clinicCheck(); setLines($('w-net'), res.text); } catch (e) { setLines($('w-net'), '✗ ' + (e.message || e)); } renderWork(); busy(btn, false); };
$('w-open').onclick = () => { $('w-paste').hidden = !$('w-paste').hidden; if (!$('w-paste').hidden) $('w-text').focus(); };
$('w-read').onclick = async () => { try { await openPayload($('w-text').value, 'link'); $('w-text').value = ''; } catch (e) { show($('w-out'), failText(e), 'bad'); } };
$('w-pick').onclick = async () => { try { await openPayload(await pickFile($('w-file')), 'file'); } catch (e) { show($('w-out'), failText(e), 'bad'); } };
$('w-scan').onclick = () => scan(async t => { try { await openPayload(t, 'in person'); } catch (e) { show($('w-out'), failText(e), 'bad'); } });  /* the request on Streetcat's screen */
for (const [id, t] of [['w-certify', 'certify'], ['w-settings', 'csettings'], ['w-offline', 'coffline'], ['cs-offline', 'coffline']]) $(id).onclick = e => { e.preventDefault(); openTab(t); };

// ----- the clinic's settings: its key and a backup of it, locked with a password (PBKDF2 + AES-GCM) -----
function renderSettings(){ const sk = key('clinic', false), n = oldKeys('clinic').length; if (sk) roleOf(pubOf(sk), 'clinic'); $('cs-pk').textContent = sk ? pubOf(sk) : '— (none yet)'; $('cs-pk-old').textContent = n ? ` + ${n} older key${n > 1 ? 's' : ''} kept` : ''; undone($('cs-copy')); }
$('cs-copy').onclick = async () => { const b = $('cs-copy'), sk = key('clinic', false); if (!sk) return flapLabel(b, 'no key'); const ok = await copyText(pubOf(sk)); if (ok) doneLabel(b); else flapLabel(b, 'select it'); };
$('cs-new').onclick = () => { makeKey('clinic', 'Make a new clinic key? Streetcat must put the new public key in new campaigns. The current key stays on this phone, so requests of older campaigns can still be confirmed here.'); renderSettings(); flapKeys($('cs-pk'), $('cs-pk').textContent, { speed: .6, hex: true }); };
$('cs-show').onclick = () => alert('Clinic private key (keep it secret):\n' + (key('clinic', false) || 'none'));
const B64 = { enc: u => btoa(String.fromCharCode(...u)), dec: s => Uint8Array.from(atob(String(s)), ch => ch.charCodeAt(0)) }, KDF_ITER = 310000;
const pwKey = async (pw, salt, iter, use) => crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, false, [use]);
async function keyBackup(pw){ const sk = key('clinic', false); if (!sk) throw new Error('there is no clinic key to back up yet'); const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await pwKey(pw, salt, KDF_ITER, 'encrypt'), new TextEncoder().encode(JSON.stringify({ clinic: sk, clinicOld: oldKeys('clinic') }))));
  return { t: 'streetcat.key-backup', v: 1, role: 'clinic', pub: pubOf(sk), kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITER, salt: B64.enc(salt) }, cipher: { name: 'AES-GCM', iv: B64.enc(iv) }, data: B64.enc(ct), created: nowIso() }; }
async function keyRestore(j, pw){ if (!j || j.t !== 'streetcat.key-backup' || j.v !== 1 || !j.kdf || !j.cipher) throw new Error('this is not a key backup made by this app');
  let x; try { x = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: B64.dec(j.cipher.iv) }, await pwKey(pw, B64.dec(j.kdf.salt), Number(j.kdf.iterations), 'decrypt'), B64.dec(j.data)))); } catch (_) { throw new Error('wrong password, or the file is damaged: nothing was changed'); }
  const keys = [x.clinic, ...(x.clinicOld || [])].filter(Boolean); if (!keys.length || !keys.every(validSk)) throw new Error('the backup holds no valid key');
  let saved = true; for (const k of (x.clinicOld || []).map(lc)) if (k !== key('clinic', false)) saved = keepOld('clinic', k) && saved; if (x.clinic) saved = setKey('clinic', lc(x.clinic)) && saved;
  refreshKeys(); renderSettings(); return { n: keys.length, saved }; }
$('cs-save').onclick = async () => { const b = $('cs-save'); busy(b, true); try { const pw = $('cs-pw').value; if (pw.length < 10) throw new Error('the password needs 10 characters or more'); if (pw !== $('cs-pw2').value) throw new Error('the two passwords are not the same');
    const j = await keyBackup(pw); saveFile(`clinic-key-backup-${today()}.json`, JSON.stringify(j)); show($('cs-out'), 'Backup saved. Keep the file and the password in two different places: without the password nobody can read it, not even you.', 'ok'); buzz();
  } catch (e) { show($('cs-out'), failText(e), 'bad'); } busy(b, false); };
$('cs-restore').onclick = async () => { try { const pw = $('cs-pw').value; if (!pw) throw new Error('write the backup\'s password first, then choose the file'); const j = JSON.parse(await pickFile($('cs-file')));
    const res = await keyRestore(j, pw); show($('cs-out'), res.saved ? `Restored: ${res.n} key${res.n > 1 ? 's' : ''}. The keys this phone had are kept too.` : 'This phone could not save every key. Nothing was deleted; try again.', res.saved ? 'ok' : 'bad');
  } catch (e) { show($('cs-out'), failText(e), 'bad'); } };

// ----- ready for offline: what the clinic needs to confirm without coverage -----
let INSTALL = null; addEventListener('beforeinstallprompt', e => { e.preventDefault(); INSTALL = e; if ($('coffline').classList.contains('on')) renderOffline(); });
const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (_) { return false; } };
async function offlineChecks(){ const items = [], need = ['index.html', 'index.js', 'cashu-bundle.js', 'core.js', 'nostr-bundle.js', 'relay.js', 'qrcode.min.js', 'jsqr.min.js', 'catid.js', 'catid-worker.js', 'DepartureMono-Regular.woff2'];
  let reg = null; try { reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null; } catch (_) {}
  const cached = new Set(); try { for (const k of (await caches.keys()).filter(k => k.startsWith('streetcat-app-'))) for (const q of await (await caches.open(k)).keys()) cached.add(new URL(q.url).pathname.split('/').pop() || 'index.html'); } catch (_) {}
  const miss = need.filter(f => !cached.has(f)), app = !!(reg && reg.active) && !miss.length;
  items.push({ state: app ? 'ok' : 'bad', text: 'The app is saved on this phone', detail: app ? 'It opens without a connection, with its font.' : reg && reg.active ? 'Still missing: ' + miss.join(', ') + '. Open the app once more with a connection.' : 'Open the app once with a connection: it saves itself.' });
  const all = creqs(), pending = all.filter(r => r.state === 'review');
  items.push({ state: all.length ? 'ok' : 'warn', text: `${all.length} request${all.length === 1 ? '' : 's'} saved on this phone`, detail: pending.length ? `${pending.length} to review: they can be confirmed without a connection.` : 'New requests arrive only with a connection.' });
  const sk = key('clinic', false), other = pending.filter(r => !clinicSkFor(r.q));
  items.push({ state: sk && !other.length ? 'ok' : 'bad', text: !sk ? 'No clinic key on this phone' : other.length ? `${other.length} request${other.length === 1 ? ' names' : 's name'} a clinic key this phone does not have` : 'This phone holds the clinic key', detail: sk ? abbr(pubOf(sk)) + (oldKeys('clinic').length ? ` + ${oldKeys('clinic').length} older` : '') : 'Make one, or restore its backup, in settings.' });
  const mc = mintCache(), mints = [...new Set(all.map(r => norm(r.q.campaign.mint)))], noKeys = mints.filter(m => !mc[m]);
  if (mints.length) items.push({ state: noKeys.length ? 'warn' : 'ok', text: noKeys.length ? "The mint's keys are not saved yet" : "The mint's keys are saved", detail: 'Only needed to certify a pasted token without a connection; requests do not need them.' });
  if (typeof CATID !== 'undefined') { const ai = await CATID.here();  /* StreetCat, 6 Nov: «añade offline setup»: the cat recognition, got ahead of time on wifi */
    items.push({ id: 'ai', state: ai ? 'ok' : 'warn', text: ai ? 'The cat recognition is saved on this phone' : 'The cat recognition is not saved yet', detail: ai ? 'A new cat can be compared with your records without a connection too.' : `Only needed to compare a new cat with your records: ${Math.round(CATID.SIZE / 1e6)} MB. Get it now, on wifi.` }); }
  const sv = storageWorks(); items.push({ state: sv ? 'ok' : 'bad', text: sv ? 'This phone can save' : 'This browser cannot save anything', detail: sv ? '' : 'A private window? Open the app in a normal one.' });
  items.push({ state: standalone() ? 'ok' : 'warn', text: standalone() ? 'Installed on the home screen' : 'Not installed on the home screen', detail: standalone() ? '' : 'Install it: in a browser tab, Safari may erase a site\'s data after 7 days without use.' });
  return items; }
const checkList = (ul, items) => { ul.textContent = ''; for (const i of items) { const li = el('li', i.state), b = el('b', null, i.state === 'ok' ? '✓' : i.state === 'bad' ? '✗' : '⚠'), s = el('span', null, i.text); if (i.detail) s.appendChild(el('small', null, i.detail)); li.appendChild(b); li.appendChild(s); ul.appendChild(li); } };
async function renderOffline(){ const items = await offlineChecks(), bad = items.filter(i => i.state === 'bad').length; checkList($('co-list'), items);
  $('co-sum').textContent = bad ? `Not ready for offline use · ${bad} to fix` : 'Ready for offline use ✓'; $('co-sum').classList.toggle('bad', !!bad); $('co-install').hidden = !INSTALL || standalone(); $('co-ios').hidden = standalone() || !/iPhone|iPad|iPod/.test(navigator.userAgent);
  const ai = items.find(i => i.id === 'ai'), cb = $('co-ai'); cb.hidden = !ai || ai.state === 'ok';
  if (typeof CATID !== 'undefined' && !cb.disabled) cb.textContent = `Get the cat recognition (${Math.round(CATID.SIZE / 1e6)} MB)`; }  /* its size from the engine itself */
$('co-again').onclick = () => renderOffline();
$('co-ai').onclick = async () => { const b = $('co-ai'), label = b.textContent; busy(b, true); show($('co-ai-out'), '');
  try { await CATID.keep((got, all) => { b.textContent = `Getting it: ${Math.round(got / 1e6)} of ${Math.round(all / 1e6)} MB`; }); }
  catch (e) { show($('co-ai-out'), '✗ the cat recognition did not come: ' + ((e && e.message) || e), 'bad'); }
  b.textContent = label; busy(b, false); renderOffline(); };
$('co-install').onclick = async () => { if (!INSTALL) return; INSTALL.prompt(); try { await INSTALL.userChoice; } catch (_) {} INSTALL = null; renderOffline(); };

// ----- Streetcat: the donations of a campaign, its requests, and the release -----
const SREQ = 'vetlock.sc.requests', sreqs = () => { const a = jget(SREQ, []); return Array.isArray(a) ? a.filter(x => x && x.q && x.id) : []; };
const saveSreq = r => jset(SREQ, [...sreqs().filter(x => x.id !== r.id), r]);
const campKey = c => [lc(c.streetcat), lc(c.clinic)].join() + '|' + Number(c.deadline);
const scEntries = c => { const L = scLedger()[campKey(c)]; return L && L.entries ? L.entries : {}; };
const saveEntries = (c, entries) => { const all = scLedger(); all[campKey(c)] = { ...(all[campKey(c)] || {}), entries }; ls.set(SCLEDGER, JSON.stringify(all)); };
const fullProof = p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(p.dleq ? { dleq: p.dleq } : {}) });
// every proof of a donation as the mint sees it now: its own, and whatever was put back under its lock after a part was released
async function donationProofs(w, e){ const all = [e.token, ...(e.remainders || [])].flatMap(t => { try { return w.decodeToken(t).proofs; } catch (_) { return []; } }); if (!all.length) return [];
  const st = await w.checkProofsStates(all), byY = new Map(st.map(s => [lc(s.Y), s.state])); return all.map(p => ({ p, state: byY.get(yHex(p)) || 'UNKNOWN' })); }
const reservedYs = () => new Set(sreqs().filter(r => !['released', 'reported', 'cancelled'].includes(r.state)).flatMap(r => r.q.contributions.flatMap(k => k.proofs.map(p => C.yOf(p.secret)))));
async function dleqOk(w, proofs){ try { const ks = await w.keyChain.ensureKeysetKeys(proofs[0].id); return proofs.every(x => x.dleq && cashu.hasValidDleq(x, ks)); } catch (_) { return false; } }
// a donation that reaches Streetcat (from the donor's app, a volunteer, or by hand): checked, then kept in the campaign's ledger
async function takeDonation(p, via){ const c = C.campaignOf(p.campaign), w = await wallet(c.mint), dec = w.decodeToken(p.token), info = lockInfo(dec.proofs);
  const bad = [...new Set(dec.proofs.map(x => C.lockProblem(C.lockOf(x.secret), c)).filter(Boolean))]; if (bad.length) throw Object.assign(new Error(`not a donation of ${c.name}: ${bad.join('; ')}`), { byPage: true });
  if (!(await dleqOk(w, dec.proofs))) throw Object.assign(new Error('the mint\'s signature on it cannot be checked (no valid DLEQ proof): it is not counted'), { byPage: true });
  await ledgerKeep(dec, info); const ref = await C.donRef(dec.proofs.map(yHex)), entries = scEntries(c); if (entries[ref] && via && !entries[ref].via) { entries[ref].via = via; if (p.receipt) entries[ref].handover = p.receipt; saveEntries(c, entries); }
  return { ref, amount: sum(dec.proofs) }; }
async function takeAnswer(a, via){ const r = sreqs().find(x => x.id === a.id); if (!r) throw Object.assign(new Error('an answer to a request this browser did not make'), { byPage: true });
  const v = await C.checkAnswer(r.q, a); if (r.check && r.check.ok && !v.ok) return r;  /* a good answer is never replaced by a bad one */
  r.answer = a; r.check = { ok: v.ok, text: v.text, kind: a.kind }; r.answeredAt = r.answeredAt || nowIso(); r.via = via; if (r.state !== 'released') r.state = !v.ok ? 'bad' : a.kind === 'report' ? 'reported' : 'certified'; saveSreq(r); if (r.state === 'certified') reannounce(r.q.campaign);
  const sk = heldFor('streetcat', [r.q.campaign.streetcat]); if (sk && OUTBOX && v.ok) { try { await OUTBOX.add(R.receiptFor(a), sk, r.q.campaign.clinic, { relays: relays(), label: 'received answer ' + r.id }); flush(); } catch (_) {} }
  return r; }
const SSEEN = 'vetlock.sc.seen';
async function scCheck(){ const sks = heldKeys('streetcat'); if (!R) return { text: 'relays are not available in this browser' }; if (!sks.length) return { text: 'no Streetcat key in this browser' };
  if (!online()) return { text: 'no connection: showing what this browser already has' };
  const mine = new Set(sks.map(pubOf)), seen = new Set(jget(SSEEN, [])), reqs = sreqs(), clinics = knownClinics();
  const expect = p => { if (!p) return null; const r = reqs.find(x => x.id === p.id);
    if ((p.t === 'streetcat.answer' || p.t === 'streetcat.received') && r) return r.q.campaign.clinic;
    if (p.t === 'streetcat.donation' && p.campaign && mine.has(lc(p.campaign.streetcat)) && PUBKEY.test(String(p.from || ''))) return p.from;
    if ((p.t === 'streetcat.cat' || p.t === 'streetcat.cat-photo') && clinics.has(lc(p.from))) return p.from;
    if (p.t === 'streetcat.answer-photo' && r) return r.q.campaign.clinic;  /* the confirmation's photos: from the request's partner only */  /* a cat's record and its photos: from the clinic of a campaign */
    return null; };
  const res = await R.receive(sks, { relays: relays(), seen, expect, timeout: 8000 }), got = { d: 0, a: 0, c: 0 }, errs = [];
  for (const m of res.messages) { const p = m.payload; try {
      if (p.t === 'streetcat.received') { const r = sreqs().find(x => x.id === p.id); if (r && !r.receivedAt) { r.receivedAt = p.at || nowIso(); saveSreq(r); } }
      else if (p.t === 'streetcat.answer') { await takeAnswer(p, 'relay'); got.a++; }
      else if (p.t === 'streetcat.donation') { await takeDonation(p, p.via === 'in person' ? 'in person' : 'relay'); got.d++; }
      else if (p.t === 'streetcat.cat') { if (await takeCat(p, 'relay')) got.c++; }
      else if (p.t === 'streetcat.cat-photo') await takeCatPart(p);
      else if (p.t === 'streetcat.answer-photo') await takeAnsPart(p); } catch (e) { errs.push(e.message || String(e)); } }
  jset(SSEEN, [...seen].slice(-600)); await flush(); const ok = res.relays.filter(x => x.ok).length;
  return { n: got.d + got.a + got.c, text: [got.d ? `${got.d} donation${got.d > 1 ? 's' : ''}` : '', got.a ? `${got.a} answer${got.a > 1 ? 's' : ''}` : '', got.c ? `${got.c} cat${got.c > 1 ? 's' : ''}` : '', `checked at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${ok} of ${res.relays.length} relays answered`, ...errs.map(x => '✗ ' + x)].filter(Boolean).join(' · ') }; }
let CUR_CAMP = null, CUR_SREQ = null, SN_PICK = {};
const curCamp = () => { const a = camps(); return a.find(x => x.slug === CUR_CAMP) || (a.length === 1 ? a[0] : null); };  /* after a reload, the only campaign */
const sreqState = r => r.state === 'released' ? ['released', 'ok'] : r.state === 'certified' ? ['certified ✓', 'ok'] : r.state === 'reported' ? ['problem reported', 'bad'] : r.state === 'bad' ? ['not certified', 'bad'] : r.receivedAt ? ['received', 'wait'] : r.handed && sentState(r.outbox).state !== 'sent' ? ['sent by hand', ''] : [sentShort(r.outbox), /^(not sent|offline)$/.test(sentShort(r.outbox)) ? 'bad' : ''];
function renderScamp(){ const k = curCamp(), head = $('sc-head'); head.textContent = ''; $('sc-dons').textContent = ''; $('sc-reqs').textContent = '';
  if (!k) { head.appendChild(el('div', 'mut', 'Open a campaign from Home.')); return; } const c = k.c; head.style.setProperty('--h', String(campHue(c)));
  head.appendChild(el('div', 'title', c.name)); const left = Math.ceil((c.deadline - Date.now() / 1000) / 86400); head.appendChild(el('div', 'mut', [c.op || KIND(typeOf(c)).one, c.colony, potPartner(c).name, left > 0 ? left + ' day' + (left === 1 ? '' : 's') + ' left' : 'closed: donors can take back what is still locked'].filter(Boolean).join(' · ')));
  const entries = Object.entries(scEntries(c)).map(([ref, e]) => ({ ref, ...e })).sort((a, b) => String(b.date).localeCompare(String(a.date))), rel = e => (e.parts || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  $('sc-n').textContent = String(entries.length); $('sc-locked').textContent = fmtSat(entries.reduce((s, e) => s + Math.max(0, e.amount - rel(e)), 0));
  if (!entries.length) $('sc-dons').appendChild(el('div', 'empty', 'No donations yet. They arrive here from the donors\' app and from volunteers, or added by hand below.'));
  for (const e of entries) { const it = el('div', 'item'), l = el('div'), r = rel(e); it.style.cursor = 'default'; l.appendChild(el('div', 'nm', e.ref)); l.appendChild(el('div', 'sub2', `${e.date || ''} · ${fmtSat(e.amount)}${e.via ? ' · ' + e.via : ''}`)); it.appendChild(l); it.appendChild(el('div', 'st' + (r >= e.amount ? ' ok' : ''), r ? (r >= e.amount ? 'released' : `${fmtSat(r)} released`) : 'locked')); $('sc-dons').appendChild(it); }
  const reqs = sreqs().filter(r => campKey(r.q.campaign) === campKey(c)).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  if (!reqs.length) $('sc-reqs').appendChild(el('div', 'empty', 'No requests yet.'));
  for (const r of reqs) { const it = el('div', 'item'), l = el('div'), [t, cls] = sreqState(r); l.appendChild(el('div', 'nm', `${r.q.patient} · ${r.q.procedure}`)); l.appendChild(el('div', 'sub2', `${r.q.date} · ${fmtSat(C.requestAmount(r.q))} · ${r.id}`)); it.appendChild(l); it.appendChild(el('div', 'st ' + cls, t)); it.onclick = () => { CUR_SREQ = r.id; openTab('sreq'); }; $('sc-reqs').appendChild(it); } }
$('sc-new').onclick = () => { const k = curCamp(); snFresh(k ? typeOf(k.c) : SN.type, 'scamp', k ? k.slug : ''); };  /* a request paid from this pot */
$('sc-check').onclick = async () => { const btn = $('sc-check'); busy(btn, true); $('sc-net').textContent = 'checking the relays…'; try { const res = await scCheck(); setLines($('sc-net'), res.text); } catch (e) { setLines($('sc-net'), '✗ ' + (e.message || e)); } renderScamp(); busy(btn, false); };
$('sc-read').onclick = async () => { try { await addByHand($('sc-text').value); $('sc-text').value = ''; } catch (e) { show($('sc-out'), failText(e), 'bad'); } };
$('sc-pick').onclick = async () => { try { await addByHand(await pickFile($('sc-file'))); } catch (e) { show($('sc-out'), failText(e), 'bad'); } };
$('sc-scan').onclick = () => scan(async t => { try { await addByHand(t); } catch (e) { show($('sc-out'), failText(e), 'bad'); } });  /* the clinic's answer on its screen, or a token */
async function addByHand(text){ text = String(text || '').trim(); if (!text) throw new Error('paste a locked token or the clinic\'s answer');
  if (/^cashu/.test(text)) { const meta = cashu.getTokenMetadata(text), w = await wallet(meta.mint), info = lockInfo(w.decodeToken(text).proofs), k = camps().find(x => lc(x.c.streetcat) === lc(info.pubkeys[0]) && lc(x.c.clinic) === lc(info.pubkeys[1]) && Number(x.c.deadline) === info.locktime);
    if (!k) throw Object.assign(new Error('this token is not locked for a campaign made in this browser'), { byPage: true }); const res = await takeDonation({ campaign: k.c, token: text }, 'by hand'); show($('sc-out'), `added ${res.ref} · ${fmtSat(res.amount)} to ${k.c.name}`, 'ok'); buzz(); renderScamp(); return; }
  await openPayload(text, 'file'); }
// the cat as it was caught (StreetCat, 6 Nov: «para ver que realmente se está certificando el gato que es»): up to three photos, face and
// sides, made small here as the clinic's are; kept on this phone, named in the request by SHA-256 and sent with it, so the clinic can
// check it is this cat
let SN_SHOTS = {};
const SN_NOTE = 'Optional. Made small here, without location data. They go with the request, encrypted, so the clinic can check it is this cat.';
const snShotsLine = () => { const a = Object.values(SN_SHOTS), kb = Math.round(a.reduce((s, p) => s + p.bytes.length, 0) / 1000); $('sn-shots-st').textContent = a.length ? `${a.length} of 3 photos · ${kb} kB, made small here, without location data. They go with the request, encrypted.` : SN_NOTE; };
const snShotsClear = () => { SN_SHOTS = {}; document.querySelectorAll('#sn-shots .shot').forEach(b => { b.querySelectorAll('img').forEach(i => i.remove()); b.classList.remove('has'); }); snShotsLine(); };
document.querySelectorAll('#sn-shots .shot').forEach(b => { b.onclick = async () => { const slot = b.dataset.slot, input = $('sn-file');
  const f = await new Promise(res => { input.value = ''; input.onchange = () => res(input.files && input.files[0]); input.click(); }); if (!f) return;
  b.classList.add('busy'); try { const p = await shrinkPhoto(f); SN_SHOTS[slot] = p; b.querySelectorAll('img').forEach(i => i.remove()); const img = el('img'); img.alt = SLOTNAME[slot]; img.src = URL.createObjectURL(new Blob([p.bytes], { type: 'image/jpeg' })); b.prepend(img); b.classList.add('has'); snShotsLine(); show($('sn-out'), ''); }
  catch (e) { show($('sn-out'), failText(e), 'bad'); } b.classList.remove('busy'); }; });
// a request's photos in a row of three, or a word where one is not on this phone yet; a tap shows a photo big, a second tap small again
async function photoTiles(box, photos, missing, none, slots = C.REQ_SLOTS, names = SLOTNAME){ const run = box._run = (box._run || 0) + 1; box.textContent = ''; const tiles = [];  /* none: a view not taken, said in its place (the columns of two rows stay in line) */
  for (const slot of slots) { const ph = (photos || []).find(p => p.slot === slot); if (!ph && !none) continue; const b = el('button'); b.type = 'button'; const u = ph ? await photoUrl(ph.sha256) : null; if (box._run !== run) return 0;
    if (u) { const img = el('img'); img.alt = names[slot]; img.src = u; b.appendChild(img); } else { b.classList.add('none'); b.appendChild(el('span', 'wait', ph ? missing : none)); }
    b.appendChild(el('span', 'lbl', names[slot])); tiles.push(b); box.appendChild(b); }
  tiles.forEach(b => { b.onclick = () => { if (!b.querySelector('img')) return; const was = b.classList.contains('big'); tiles.forEach(t => { t.classList.remove('big'); t.style.order = ''; }); if (!was) { b.classList.add('big'); b.style.order = '-1'; } }; });
  return tiles.filter(t => t.querySelector('img')).length; }
// a request: of each donation, only the proofs that pay for this procedure (whole proofs, and at most one split), so the clinic signs nothing more
async function makeScRequest(c, f){ const sk = heldFor('streetcat', [c.streetcat]); if (!sk) throw Object.assign(new Error('this browser has no Streetcat key for ' + c.name), { byPage: true });
  const w = await wallet(c.mint), entries = scEntries(c), reserved = reservedYs(), contributions = [], full = [];
  for (const pk of f.picks) { const e = entries[pk.ref]; if (!e) throw new Error(pk.ref + ' is not in this browser');
    const live = (await donationProofs(w, e)).filter(x => x.state === 'UNSPENT' && !reserved.has(yHex(x.p))).map(x => x.p), plan = C.planRelease(live, pk.release);
    if (plan.split && !(plan.split.dleq && plan.split.dleq.r)) throw Object.assign(new Error(`${pk.ref} can only pay whole proofs (its ecash carries no DLEQ proof): ask for ${sum(plan.whole)} or ${sum(plan.inputs)} sat`), { byPage: true });
    contributions.push({ ref: pk.ref, release: pk.release, proofs: plan.inputs }); full.push(...plan.inputs); }
  const photos = C.REQ_SLOTS.filter(s => f.shots && f.shots[s]).map(s => ({ slot: s, sha256: f.shots[s].sha256, bytes: f.shots[s].bytes.length, w: f.shots[s].w, h: f.shots[s].h }));
  try { for (const p of photos) await IDB.put('photos', p.sha256, f.shots[p.slot].bytes); } catch (_) { throw Object.assign(new Error('this browser cannot keep the photos (a private window?): open the app in a normal window'), { byPage: true }); }  /* before the request names them */
  const q = await C.makeRequest({ campaign: c, patient: f.patient, procedure: f.procedure, date: f.date, note: f.note, contributions, photos });
  const r = { id: q.id, q, slug: f.slug, ...(f.colony ? { colony: f.colony } : {}), full: cashu.getEncodedToken({ mint: c.mint, proofs: full.map(fullProof) }), state: 'made', created: q.created }; saveSreq(r);
  if (OUTBOX) { const it = await OUTBOX.add(q, sk, c.clinic, { relays: relays(), label: 'request ' + q.id }); r.outbox = it.id; r.state = 'sent'; saveSreq(r);
    flush().then(() => reqParts()).then(() => { if ($('sreq').classList.contains('on') && CUR_SREQ === r.id) renderSreq(); }).catch(() => {}); }  /* its photos follow the request */
  return r; }
// ===== WHAT STREETCAT PAYS FOR: KINDS, COLONIES, PARTNERS AND POTS (StreetCat, 7 Nov) =====
// «Las peticiones pueden ser de muchos tipos. Pueden ser de comida, pueden ser de una operación veterinaria, pueden ser de
// esterilización… Puede haber una hucha que se haya creado para comida de una colonia, otra que se haya creado para alguna determinada
// clínica»; «La comida tendría que confirmar, claro, la tienda que vende el pienso». Four kinds, each in its colour. A pot (a campaign)
// pays for one kind, for one colony or every colony, and its partner confirms the spending: a clinic, a shop, or another (core.js signs
// the three with the campaign). A request is paid from a pot of its kind: its donors gave for that, and its money is locked to Streetcat
// and that partner, so the partner is the pot's. «Perfecto. Implementalo.» (14:12), as shown in the videos.
const KINDS = [
  { id: 'sterilisation', name: 'Sterilisation', one: 'sterilisation', h: 200, by: 'a clinic', vet: true, what: 'sterilisation (spay)', eg: 'TNR MARINA' },
  { id: 'vet', name: 'Vet care', one: 'vet care', h: 330, by: 'a clinic', vet: true, what: 'wound and stitches', eg: 'MOCHI' },
  { id: 'food', name: 'Food', one: 'food', h: 85, by: 'the shop that sells the feed', vet: false, what: '20 kg dry feed', eg: 'COMIDA MARINA' },
  { id: 'other', name: 'Other', one: 'other', h: 285, by: 'a partner', vet: false, what: 'what it is', eg: 'TRANSPORT' }];
const KIND = id => KINDS.find(t => t.id === id) || KINDS[0];
// a campaign made before the kinds pays for what its operation says (they were all sterilisations)
const typeOf = c => C.TYPES.includes(c && c.type) ? c.type : /feed|food|pienso|comida/i.test((c && c.op) || '') ? 'food' : /vet|wound|stitch|cure|treat|herida/i.test((c && c.op) || '') ? 'vet' : 'sterilisation';
// what each kind of partner confirms, unless Streetcat said otherwise when it added it
const PKIND = { clinic: ['sterilisation', 'vet', 'other'], shop: ['food', 'other'], other: ['other'] };
const doesKind = (p, type) => (Array.isArray(p.does) && p.does.length ? p.does : PKIND[p.kind] || []).includes(type);
const SPART = 'vetlock.sc.partners', SCOL = 'vetlock.sc.colonies';
// the partners: the ones added here ({ name, kind, pk, does }), then each pot's own (a pot made before names none: its clinic, by its key)
function partners(){ const out = [], seen = new Set(), add = x => { const pk = lc(x.pk); if (!PUBKEY.test(pk) || seen.has(pk)) return; seen.add(pk); out.push({ ...x, pk }); };
  for (const x of jget(SPART, [])) if (x && String(x.name || '').trim()) add({ name: String(x.name).trim(), kind: C.PKINDS.includes(x.kind) ? x.kind : 'clinic', pk: x.pk, does: Array.isArray(x.does) ? x.does.filter(d => C.TYPES.includes(d)) : null, named: true });
  for (const k of camps()) { const c = k && k.c; if (!c || !c.clinic) continue; const kind = C.PKINDS.includes(c.pkind) ? c.pkind : 'clinic';
    add({ name: c.partner || `${kind} ${abbr(lc(c.clinic))}`, kind, pk: c.clinic, does: [...new Set([...PKIND[kind], typeOf(c)])], named: !!c.partner }); }
  return out; }
const partnerOf = pk => partners().find(x => x.pk === lc(pk)) || null;
const whoOf = c => { const k = C.PKINDS.includes(c && c.pkind) ? c.pkind : 'clinic'; return k === 'clinic' ? 'the clinic' : (c.partner || (partnerOf(c.clinic) || {}).name || `the ${k}`); };
const potPartner = c => partnerOf(c.clinic) || { name: c.partner || 'its clinic', kind: c.pkind || 'clinic', pk: lc(c.clinic), named: !!c.partner };
// the colonies: the ones added here, then those its pots name, then those of the clinics' cat records
function colonies(){ const out = [], seen = new Set(), add = n => { n = String(n || '').replace(/\s+/g, ' ').trim(); if (n && !seen.has(lc(n))) { seen.add(lc(n)); out.push({ name: n }); } };
  for (const x of jget(SCOL, [])) add(x && x.name); for (const k of camps()) add(k && k.c && k.c.colony); for (const x of scats()) add(x && x.rec && x.rec.statement && x.rec.statement.colony);
  return out; }
const catsIn = n => scats().filter(x => lc((x.rec && x.rec.statement && x.rec.statement.colony) || '') === lc(n)).length;
const COL_HUES = [175, 45, 120, 215, 100, 190], colHue = n => { let h = 0; for (const ch of lc(n)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COL_HUES[h % COL_HUES.length]; };
// what a pot holds to spend, as this browser's ledger says (the mint says it exactly when a request is made): what was given, less what
// was released, less what the requests not yet released hold
const potFree = c => { const rel = e => (e.parts || []).reduce((s, p) => s + Number(p.amount || 0), 0), left = Object.values(scEntries(c)).reduce((s, e) => s + Math.max(0, Number(e.amount || 0) - rel(e)), 0);
  return Math.max(0, left - sreqs().filter(r => campKey(r.q.campaign) === campKey(c) && !['released', 'reported', 'cancelled'].includes(r.state)).reduce((s, r) => s + C.requestAmount(r.q), 0)); };
// why a pot cannot pay a request of this kind for this colony, or '' when it can
const potWhyNot = (k, S) => { const c = k.c; if (typeOf(c) !== S.type) return `another kind: ${KIND(typeOf(c)).one}`; if (S.col && c.colony && lc(c.colony) !== lc(S.col)) return `another colony: ${c.colony}`;
  if (!(Number(c.deadline) > Date.now() / 1000)) return 'closed: its donors can take back what is left'; if (!heldFor('streetcat', [c.streetcat])) return 'not this browser\'s: it does not hold its Streetcat key'; return ''; };
// the four kinds as chips, two by two, each in its colour; the one chosen, filled
function kindChips(box, on, choose){ box.textContent = ''; for (const t of KINDS) { const b = el('button', 'sm' + (t.id === on ? ' on' : ''), t.one); b.type = 'button'; b.style.setProperty('--h', String(t.h)); b.onclick = () => choose(t.id); box.appendChild(b); } }
// "Choose …": the words, or what was chosen, in its colour
const setChoose = (b, label, value, h) => { b.textContent = value || label; b.classList.toggle('set', !!value); if (value && h != null) b.style.setProperty('--h', String(h)); else b.style.removeProperty('--h'); };
// a line of a list (pots, requests, colonies, partners): its title in its colour, then its lines: "· " a state, "✓ " what is chosen,
// "✗ " what is wrong (red); with no tap, in grey
function listLine(box, h, title, subs, onclick, cls = ''){ const b = el('button', 'req' + cls); b.type = 'button'; if (h != null) b.style.setProperty('--h', String(h)); b.appendChild(el('div', 'title', title));
  for (const t of [].concat(subs).filter(Boolean)) b.appendChild(el('div', t.startsWith('· ') ? 'cat' : t.startsWith('✓ ') ? 'ok' : t.startsWith('✗ ') ? 'no2' : 'sub2', t)); if (onclick) b.onclick = onclick; box.appendChild(b); return b; }

// HOME's four kinds: each with its pots, its requests and what is left to spend; a tap opens its screen
function homeKinds(){ const box = $('h-kinds'); box.textContent = ''; box.appendChild(el('div', 'mut', 'What Streetcat pays for · tap one')); const grid = el('div', 'ptiles'); box.appendChild(grid);
  const all = camps().filter(k => k && k.c), reqs = sreqs(), now = Date.now() / 1000;
  for (const t of KINDS) { const ps = all.filter(k => typeOf(k.c) === t.id), rs = reqs.filter(r => typeOf(r.q.campaign) === t.id), sat = ps.filter(k => Number(k.c.deadline) > now).reduce((s, k) => s + potFree(k.c), 0), b = el('button', 'tile'); b.type = 'button'; b.style.setProperty('--h', String(t.h));
    b.appendChild(el('div', 'title', t.name)); b.appendChild(el('div', 'sub2', ps.length ? `${ps.length} pot${ps.length > 1 ? 's' : ''} · ${rs.length} request${rs.length === 1 ? '' : 's'}` : 'no pots yet')); b.appendChild(el('div', 'sub2', ps.length ? `${fmtSat(sat)} to spend` : 'tap to start one'));
    b.onclick = () => { CUR_KIND = t.id; openTab('skind'); }; grid.appendChild(b); } }
// ONE KIND (StreetCat, 7 Nov: «serían subsecciones, ¿no?»): its pots, its requests, and a new request or campaign of that kind
let CUR_KIND = 'sterilisation';
function renderKind(){ const t = KIND(CUR_KIND), head = $('kd-head'); head.textContent = ''; head.style.setProperty('--h', String(t.h)); head.appendChild(el('div', 'title', t.name)); head.appendChild(el('div', 'mut', `confirmed by ${t.by}`));
  const pb = $('kd-pots'); pb.textContent = ''; const ps = camps().filter(k => k && k.c && typeOf(k.c) === t.id).reverse(); for (const k of ps) potRow(pb, k); if (!ps.length) pb.appendChild(el('div', 'empty', `No ${t.one} pots yet.`));
  const rb = $('kd-reqs'); rb.textContent = ''; const rs = sreqs().filter(r => typeOf(r.q.campaign) === t.id).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  for (const r of rs) { const q = r.q, k = camps().find(x => x && x.c && campKey(x.c) === campKey(q.campaign)), [st, cls] = sreqState(r), vet = !!(q.photos || t.vet);
    listLine(rb, k ? campHue(k.c) : null, vet ? `${q.patient} · ${q.procedure}` : q.procedure, [[vet ? r.colony : q.patient, `${fmtSat(C.requestAmount(q))} from ${q.campaign.name}`].filter(Boolean).join(' · '), (cls === 'bad' ? '✗ ' : '· ') + st], () => { CUR_SREQ = r.id; openTab('sreq'); }); }
  if (!rs.length) rb.appendChild(el('div', 'empty', 'No requests yet.'));
  $('kd-req').textContent = `New ${t.one} request`; $('kd-camp').textContent = `New ${t.one} campaign`; }
$('kd-req').onclick = () => snFresh(CUR_KIND, 'skind'); $('kd-camp').onclick = () => kFresh(CUR_KIND, 'skind');

// NEW REQUEST (StreetCat, 7 Nov: «¿el botón de choose colony y choose pot serían simultáneos?», one under the other): its kind, two by two;
// for a clinic (sterilisation, vet care) the cat, its photos and the procedure, for food or another kind what it is; its cost; the
// colony it is for and the pot that pays it, each from its own list. Only a pot of its kind, for that colony or every colony, can pay it;
// the pot brings its partner (only that partner can release its money), so the partner is not chosen: it shows, with its key. A colony
// with one pot that can pay brings that pot; a pot chosen first brings its colony. The cost takes the pot's donations, the oldest first
// and the last one in part; "edit" shows them, with the date and a note, to change by hand.
let SN = { type: 'sterilisation', col: '', pot: '', back: 'home' }, SN_ROWS = { slug: null, rows: null }, SN_OPEN = false;
const snPot = () => (SN.pot && camps().find(x => x && x.slug === SN.pot)) || null;
const snCost = () => Math.max(0, Math.floor(Number(String($('sn-cost').value || '').replace(/\D/g, '')) || 0));
const snPicked = () => Object.values(SN_PICK).reduce((s, x) => s + x, 0);
function snAutoPot(){ const k = snPot(); if (k && potWhyNot(k, SN)) SN.pot = ''; const ok = camps().filter(x => x && x.c && !potWhyNot(x, SN)); if (!SN.pot && ok.length === 1) { SN.pot = ok[0].slug; if (!SN.col && ok[0].c.colony) SN.col = ok[0].c.colony; } }
function snFresh(type, back, pot = ''){ const k = pot ? camps().find(x => x && x.slug === pot) : null; SN = { type: k ? typeOf(k.c) : KINDS.some(t => t.id === type) ? type : 'sterilisation', col: (k && k.c.colony) || '', pot: k ? k.slug : '', back }; BACK.snew = back;
  for (const id of ['sn-cat', 'sn-proc', 'sn-cost', 'sn-note', 'sn-date']) $(id).value = ''; snShotsClear(); show($('sn-out'), ''); if (!k) snAutoPot(); SN_OPEN = ls.get('vetlock.kform') === 'open'; openTab('snew'); }
async function renderSnew(){ snDraw(); await snDons(); }
function snDraw(){ const t = KIND(SN.type), k = snPot(), c = k && k.c, par = c ? potPartner(c) : null;
  kindChips($('sn-type'), SN.type, id => { if (id === SN.type) return; SN.type = id; snAutoPot(); snDraw(); if (SN_ROWS.slug !== SN.pot) snDons(); else snCover(); });
  $('sn-catbox').hidden = !t.vet; $('sn-proc-l').textContent = t.vet ? 'Procedure' : 'What'; $('sn-proc').placeholder = t.what; $('sn-date-l').textContent = t.vet ? 'Date of the procedure' : 'Date of the delivery';
  setChoose($('sn-col'), 'Choose colony', SN.col ? SN.col.toUpperCase() : '', SN.col ? colHue(SN.col) : null); setChoose($('sn-pot'), 'Choose pot', c ? `${c.name} · ${fmtSat(potFree(c))}` : '', c ? campHue(c) : null);
  const keys = $('sn-keys'); keys.hidden = !c; keyLines(keys, c ? [['Streetcat', 'streetcat', lc(c.streetcat)], [par.named ? `${par.name} · ${par.kind}` : par.kind, 'clinic', lc(c.clinic)]] : []);
  if (!$('sn-date').value) $('sn-date').value = today(); const note = $('sn-note').value.trim();
  $('sn-sum-t').textContent = [`on ${$('sn-date').value}`, note ? 'note: ' + note : 'no note', 'its donations'].join(' · '); $('sn-sum').hidden = SN_OPEN; $('sn-more').hidden = !SN_OPEN;
  const go = $('sn-go'); if (!go.classList.contains('holding') && !go._hint && !go.classList.contains('fin')) go.textContent = par ? `Send to ${par.named ? par.name : 'the ' + par.kind}` : 'Send to the partner'; go.disabled = !snPicked() || snPicked() < snCost(); snCover(); }
// the pot's donations as the mint sees them: what each still has locked, and not held by another request (the oldest first)
async function snDons(){ const k = snPot(), list = $('sn-dons'), run = snDons.n = (snDons.n || 0) + 1; list.textContent = ''; SN_PICK = {}; SN_ROWS = { slug: SN.pot, rows: null }; $('sn-go').disabled = true;
  if (!k) { list.appendChild(el('div', 'empty', 'Choose the pot that pays it.')); snCover(); return; } const c = k.c; list.appendChild(el('div', 'empty', 'asking the mint what is still locked…')); snCover();
  try { const w = await wallet(c.mint), reserved = reservedYs(), rows = [];
    for (const [ref, e] of Object.entries(scEntries(c)).sort((a, b) => String(a[1].date || '').localeCompare(String(b[1].date || '')))) { const live = (await donationProofs(w, e)).filter(x => x.state === 'UNSPENT' && !reserved.has(yHex(x.p))), avail = sum(live.map(x => x.p)); if (avail > 0) rows.push({ ref, e, avail }); }
    if (snDons.n !== run) return; SN_ROWS = { slug: SN.pot, rows }; list.textContent = ''; if (!rows.length) list.appendChild(el('div', 'empty', 'Nothing left to pay from: every donation is released, taken back, or already in a request.'));
    for (const { ref, e, avail } of rows) { const it = el('div', 'item don'), l = el('div'); it.style.cursor = 'default'; l.appendChild(el('div', 'nm', ref)); l.appendChild(el('div', 'sub2', `${fmtSat(avail)} available · ${e.date || ''}`)); it.appendChild(l);
      const a = el('div', 'acts2'), inp = el('input'); inp.type = 'number'; inp.min = '0'; inp.max = String(avail); inp.step = '1'; inp.inputMode = 'numeric'; inp.placeholder = '0'; inp.id = 'sn-use-' + ref; inp.setAttribute('aria-label', 'sats from ' + ref);
      inp.oninput = () => { SN_PICK[ref] = Math.max(0, Math.min(avail, Math.floor(Number(inp.value) || 0))); snByHand(); }; a.appendChild(inp); a.appendChild(smallBtn('all', () => { inp.value = String(avail); inp.oninput(); })); it.appendChild(a); list.appendChild(it); }
    if (snCost()) snAuto(); else snByHand();
  } catch (e) { if (snDons.n !== run) return; SN_ROWS = { slug: SN.pot, rows: null, err: true }; list.textContent = ''; list.appendChild(el('div', 'empty', 'The mint cannot be reached (' + (e.message || e) + '). A request needs it, to know what is still locked.')); snCover(); } }
// the cost takes the donations, the oldest first, the last one in part; donations changed by hand make the cost
function snAuto(){ const rows = SN_ROWS.slug === SN.pot ? SN_ROWS.rows : null; if (!rows) return snCover(); let left = snCost(); SN_PICK = {};
  for (const r of rows) { const n = Math.min(r.avail, left); left -= n; SN_PICK[r.ref] = n; const inp = $('sn-use-' + r.ref); if (inp) inp.value = n ? String(n) : ''; }
  $('sn-go').disabled = !snPicked() || snPicked() < snCost(); snCover(); }  /* a pot that does not hold it all cannot send it */
const snByHand = () => { const n = snPicked(); if (n || !snCost()) $('sn-cost').value = n ? String(n) : ''; $('sn-go').disabled = !n; snCover(); };
// under "Paid from": whether the pot pays it all (✓), or what it lacks (red)
function snCover(){ const box = $('sn-cover'), k = snPot(), cost = snCost(), rows = SN_ROWS.slug === SN.pot ? SN_ROWS.rows : null; box.classList.remove('bad'); box.textContent = '';
  if (!k || SN_ROWS.err) return; if (!rows) { box.textContent = 'asking the mint what is still locked…'; return; } const c = k.c, avail = rows.reduce((s, r) => s + r.avail, 0), n = snPicked(), used = Object.values(SN_PICK).filter(x => x > 0).length, num = x => fmtSat(x).replace(/ sat$/, '');
  if (!cost) { box.textContent = `${fmtSat(avail)} to spend in ${c.name}`; return; }
  if (avail < cost) { box.classList.add('bad'); box.textContent = `✗ ${num(avail)} of ${fmtSat(cost)} in ${c.name}: choose another pot, or wait for donations`; return; }
  box.textContent = `${num(n)} of ${fmtSat(cost)}${n === cost ? ' ✓' : ''} · from ${c.name} · ${used} donation${used === 1 ? '' : 's'}`; }
$('sn-cost').addEventListener('input', () => snAuto());
$('sn-edit').onclick = e => { e.preventDefault(); SN_OPEN = true; snDraw(); $('sn-date').focus(); };
$('sn-col').onclick = () => pick('colony', 'snew'); $('sn-pot').onclick = () => pick('pot', 'snew');
// held: the two keys shuffle in their colours and land as the button fills
$('sn-go').addEventListener('holdstart', () => $('sn-keys').querySelectorAll('.kk').forEach(v => { if (v._t) flapKeys(v, v._t, { speed: holdMs() / 1200, hex: true }); }));
$('sn-go').addEventListener('holdstop', () => snDraw());
$('sn-go').onclick = async () => { const btn = $('sn-go'); busy(btn, true); try { const k = snPot(); if (!k) throw new Error('choose the pot that pays it');
    const t = KIND(SN.type), picks = Object.entries(SN_PICK).filter(([, n]) => n > 0).map(([ref, release]) => ({ ref, release })), cost = snCost();
    const f = { patient: t.vet ? $('sn-cat').value.trim() : (SN.col || k.c.colony || k.c.name), procedure: $('sn-proc').value.trim(), date: $('sn-date').value, note: $('sn-note').value.trim(), picks, slug: k.slug, shots: t.vet ? SN_SHOTS : {}, colony: SN.col };
    if (!f.patient) throw new Error('write the cat'); if (!f.procedure) throw new Error(t.vet ? 'write the procedure' : 'write what it is'); if (!f.date) throw new Error('write the date');
    if (!picks.length) throw new Error(cost ? 'this pot has nothing left to pay it: choose another pot' : 'write what it costs');
    if (cost && picks.reduce((s, p) => s + p.release, 0) < cost) throw new Error(`${k.c.name} has not enough for ${fmtSat(cost)}: choose another pot, or wait for donations`);
    show($('sn-out'), 'making the request…'); const r = await makeScRequest(k.c, f); buzz(); reannounce(k.c);  /* donors see it under its pot */
    CUR_SREQ = r.id; for (const id of ['sn-cat', 'sn-proc', 'sn-cost', 'sn-note']) $(id).value = ''; snShotsClear(); show($('sn-out'), ''); openTab('sreq');
  } catch (e) { show($('sn-out'), failText(e), 'bad'); } busy(btn, false); };

// THE LISTS (StreetCat, 7 Nov: «hubiese otro submenú… usar esa misma estética y esa misma disposición para submenú de partner, submenú de
// pods y submenú de colonies»): colonies, partners and pots, each like the pots' list, with "+ New …"; a tap chooses, and back to the form
let PICK = { what: 'colony', from: 'snew' }, PP_NEW = false, PP = { kind: 'clinic', does: null };
function pick(what, from){ PICK = { what, from }; PP_NEW = false; BACK.spick = from; openTab('spick'); }
const pickState = () => PICK.from === 'snew' ? SN : K;
const pickDone = () => { PP_NEW = false; const prev = navStack[navStack.length - 2]; if (prev && prev.t === PICK.from && prev.r === nav.dataset.role) history.back(); else openTab(PICK.from); };  /* as the arrow: one step back */
function renderPick(){ const S = pickState(), t = KIND(S.type), head = $('pp-head'), box = $('pp-list'), w = PICK.what, req = PICK.from === 'snew'; head.textContent = ''; box.textContent = ''; show($('pp-out'), ''); BACK.spick = PICK.from;
  $('pp-new').hidden = !PP_NEW; box.hidden = PP_NEW; $('pp-acts').hidden = PP_NEW; $('pp-pbox').hidden = w !== 'partner';
  const top = (title, h, sub) => { head.style.setProperty('--h', String(h)); head.appendChild(el('div', 'title', title)); head.appendChild(el('div', 'mut', sub)); };
  if (w === 'colony') { if (PP_NEW) { top('New colony', 175, 'its name, as Streetcat calls it'); $('pp-name').placeholder = 'colony Playa'; return; }
    top('Choose a colony', 175, `what this ${req ? 'request' : 'campaign'} is for`);
    listLine(box, null, 'Every colony', ['not one colony in particular', S.col ? '' : '✓ chosen'], () => { S.col = ''; if (req) snAutoPot(); pickDone(); });
    for (const x of colonies()) { const n = catsIn(x.name), ps = camps().filter(k => k && k.c && typeOf(k.c) === S.type && lc(k.c.colony || '') === lc(x.name)).map(k => k.c.name);
      listLine(box, colHue(x.name), x.name, [[n ? `${n} cat${n > 1 ? 's' : ''}` : '', ps.length ? `${t.one} pots: ${ps.join(', ')}` : `no ${t.one} pots yet`].filter(Boolean).join(' · '), lc(S.col) === lc(x.name) ? '✓ chosen' : ''], () => { S.col = x.name; if (req) snAutoPot(); pickDone(); }); }
    $('pp-add').textContent = '+ New colony'; return; }
  if (w === 'partner') { if (PP_NEW) { top('New partner', HUE.clinic, 'who confirms what Streetcat pays: a clinic, the shop that sells the feed, or another'); $('pp-name').placeholder = 'Pienso Sur'; ppDraw(); return; }
    top('Choose a partner', HUE.clinic, `who confirms it: ${t.by}`); const cur = kPartnerKey(), ps = partners().sort((a, b) => doesKind(b, S.type) - doesKind(a, S.type));
    for (const x of ps) { const ok = doesKind(x, S.type), does = (x.does && x.does.length ? x.does : PKIND[x.kind]).map(d => KIND(d).one).join(', ');
      listLine(box, ok ? HUE.clinic : null, x.name, [`${x.kind} · ${does}`, ok ? `key ${abbr(x.pk)}` : `does not do ${t.one}`, cur === x.pk ? '✓ chosen' : ''], ok ? () => { $('k-c').value = x.pk; pickDone(); } : null, ok ? '' : ' no'); }
    if (!ps.length) box.appendChild(el('div', 'empty', 'No partners yet: add the first one.'));
    $('pp-add').textContent = '+ New partner'; return; }
  // the pots: the ones that can pay it first, what each has to spend and whether it is enough; in grey the rest, and why
  const cost = req ? snCost() : 0, all = camps().filter(k => k && k.c).map(k => ({ k, why: potWhyNot(k, S) })).sort((a, b) => !!a.why - !!b.why);
  top('Choose a pot', t.h, `a ${t.one} pot${S.col ? ' of ' + S.col + ' or of every colony' : ''}; its partner confirms the spending. In grey, the ones that cannot pay it`);
  for (const { k, why } of all) { const c = k.c, free = potFree(c), left = Math.ceil((c.deadline - Date.now() / 1000) / 86400);
    listLine(box, why ? null : campHue(c), c.name, [`${KIND(typeOf(c)).one} · ${c.colony || 'every colony'} · ${potPartner(c).name}`, why || `${fmtSat(free)} to spend${cost && free >= cost ? ' ✓ enough' : ''} · ${left} day${left === 1 ? '' : 's'} left`,
      !why && cost && free < cost ? `✗ not enough for ${fmtSat(cost)}` : '', S.pot === k.slug ? '✓ chosen' : ''], why ? null : () => { S.pot = k.slug; if (!S.col && c.colony) S.col = c.colony; pickDone(); }, why ? ' no' : ''); }
  if (!all.length) box.appendChild(el('div', 'empty', 'No pots yet.'));
  $('pp-add').textContent = `+ New ${t.one} pot`; }
// a new partner: its name, what it is, what it confirms (its kind's, unless changed) and its public key
function ppDraw(){ const kb = $('pp-kind'); kb.textContent = ''; for (const x of C.PKINDS) { const b = el('button', 'sm' + (PP.kind === x ? ' on' : ''), x); b.type = 'button'; b.onclick = () => { PP = { kind: x, does: null }; ppDraw(); }; kb.appendChild(b); }
  const does = PP.does || PKIND[PP.kind]; kindChips($('pp-does'), null, id => { const d = new Set(PP.does || PKIND[PP.kind]); if (d.has(id)) d.delete(id); else d.add(id); PP.does = KINDS.map(x => x.id).filter(x => d.has(x)); ppDraw(); });
  $('pp-does').querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', does.includes(KINDS[i].id))); }
$('pp-add').onclick = () => { const S = pickState(); if (PICK.what === 'pot') { kFresh(S.type, 'snew', S.col); return; }
  PP_NEW = true; PP = { kind: KIND(S.type).vet ? 'clinic' : S.type === 'food' ? 'shop' : 'other', does: null }; $('pp-name').value = ''; $('pp-key').value = ''; renderPick(); };
$('pp-save').onclick = () => { const S = pickState(), name = $('pp-name').value.replace(/\s+/g, ' ').trim(), out = $('pp-out');
  if (PICK.what === 'colony') { if (!name) return show(out, '✗ Write the colony\'s name.', 'bad'); const have = colonies().find(x => lc(x.name) === lc(name)); if (!have) jset(SCOL, [...jget(SCOL, []), { name }]);
    S.col = have ? have.name : name; if (PICK.from === 'snew') snAutoPot(); buzz(); pickDone(); return; }
  const pk = lc($('pp-key').value.trim()), does = PP.does || PKIND[PP.kind];
  if (!name) return show(out, '✗ Write the partner\'s name.', 'bad'); if (!C.pointOk(pk)) return show(out, pk ? '✗ This is not a public key: paste the partner\'s own, 66 characters, 02… or 03….' : '✗ Paste its public key: 66 characters, 02… or 03….', 'bad');
  if (heldKeys('streetcat').some(k => pubOf(k) === pk) || STREETCAT_KEYS.includes(pk)) return show(out, '✗ That is Streetcat\'s own key: the partner signs with its own.', 'bad');
  if (!does.includes(S.type)) return show(out, `✗ It does not confirm ${KIND(S.type).one}: choose it under "What it confirms", or another partner.`, 'bad');
  jset(SPART, [...jget(SPART, []).filter(x => x && lc(x.pk) !== pk), { name, kind: PP.kind, pk, does }]); $('k-c').value = pk; buzz(); pickDone(); };

// the forms, as they open: from the start, once the page has set itself up (they need what comes above)
kDefaults(); if ($('home').classList.contains('on')) renderHome();
function renderSreq(){ const r = sreqs().find(x => x.id === CUR_SREQ), head = $('sq-head'), dl = $('sq-dl'), steps = $('sq-steps'); head.textContent = ''; dl.textContent = ''; steps.textContent = ''; $('sq-state').textContent = ''; $('sq-pics').textContent = ''; $('sq-pics-l').hidden = true; $('sq-rec').hidden = true;
  const term = $('sq-term'); clearInterval(term._qr); term.querySelectorAll('.qr').forEach(e => e.remove()); steps.hidden = false;
  /* the request goes to the clinic by relay by itself: the other ways (link, file, QR) only when it has not gone, under the warning in
     red; gone, a small link still shows it as QR, for the clinic in person without a connection. Once answered, nothing more to send. */
  const s0 = r ? sentState(r.outbox) : null, done0 = !r || ['certified', 'reported', 'released'].includes(r.state), gone0 = r && (s0.state === 'sent' || r.receivedAt || r.answer || r.handed);
  $('sq-send').hidden = done0 || gone0 || (online() && !!OUTBOX && !!r.outbox && !stuck(s0, r.created)); $('sq-qrl').hidden = done0 || !$('sq-send').hidden;
  const who = r ? whoOf(r.q.campaign) : 'the clinic'; $('sq-qra').textContent = `${who === 'the clinic' ? 'Clinic' : who} offline? Show it as QR`; $('sq-link').textContent = `copy link for ${who === 'the clinic' ? who : 'the partner'}`;  /* a shop or another partner by its name */
  if (!$('sq-send').hidden) setLines($('sq-send-st'), (!OUTBOX ? '✗ Not sent: this browser cannot reach the relays.' : !online() ? '✗ Not sent: no connection. It goes by itself once there is one.' : !r.outbox ? '✗ Not sent yet.' : '✗ Not sent: no relay took it.') + `\nOr give it to ${who} another way:`);
  if (!r) { head.appendChild(el('div', 'mut', 'No request open.')); $('sq-go').disabled = true; return; } const q = r.q, c = q.campaign, kc = camps().find(x => campKey(x.c) === campKey(c)); if (kc) CUR_CAMP = kc.slug; head.style.setProperty('--h', String(campHue(c))); head.appendChild(el('div', 'title', c.name)); head.appendChild(el('div', 'mut', `request ${q.id}`));
  const vet = KIND(typeOf(c)).vet; for (const [k, v] of [[vet ? 'Cat' : 'For', q.patient], [vet ? 'Procedure' : 'What', q.procedure], ['Date', q.date], ['Releases', fmtSat(C.requestAmount(q))], ...(q.note ? [['Note', q.note]] : [])]) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
  const x = recOfReq(r); $('sq-pics-l').hidden = !(x && (q.photos || []).length);  /* with the clinic's record under them, the two rows are named */
  if ((q.photos || []).length) photoTiles($('sq-pics'), q.photos, 'not on this phone', x ? 'no photo' : null); sreqRec(r, x);
  const aw = PWORDS[pkindOf(q)] || PWORDS.other, aph = r.answer && r.answer.kind === 'certified' && r.check && r.check.ok ? ((r.answer.statement && r.answer.statement.photos) || []) : []; $('sq-ans').hidden = !aph.length;
  if (aph.length) { $('sq-ans-l').textContent = `${aw.label} · from ${whoOf(c)}`; photoTiles($('sq-ans-pics'), aph, 'on its way', null, C.ANS_SLOTS, aw).then(n => { $('sq-ans-st').textContent = n === aph.length ? `Taken by ${whoOf(c)} when it confirmed, and named in its signed confirmation. A tap shows a photo big.` : `${aph.length - n} of ${aph.length} on their way: they come by relay, with a connection.`; }); }
  const s = sentState(r.outbox), heard = !!(r.receivedAt || r.answer), lines = [['✓', `made · ${when(r.created)}`],
    [s.state === 'sent' || heard ? '✓' : s.state === 'failed' ? '✗' : '·', s.state === 'none' ? (r.handed ? 'sent by link or file' : 'not sent yet') : sentText(s) + (r.handed ? ' · and by hand' : '')],
    [heard ? '✓' : '·', r.receivedAt ? `received by ${who} · ${when(r.receivedAt)}` : `received by ${who}`],
    [r.answer ? (r.check && r.check.ok && r.answer.kind === 'certified' ? '✓' : '✗') : '·', r.answer ? `${r.check ? String(r.check.text).replace(/^[✓✗⚠]\s*/, '') : ''} · ${when(r.answeredAt)}` : `answered by ${who}`],
    [r.state === 'released' ? '✓' : '·', r.state === 'released' ? `released ${fmtSat(r.released.amount)}${r.released.back ? ` · ${fmtSat(r.released.back)} put back under the lock` : ''} · ${when(r.released.at)}` : 'released']];
  const np = (q.photos || []).length, pn = `its ${np} photo${np > 1 ? 's' : ''}`; if (np) lines.splice(2, 0, reqPhotosSent(r) ? ['✓', `${pn} sent`] : ['·', `${pn}: ${r.outbox ? 'sending' : 'not sent yet'}`]);
  if (x) lines.splice(lines.length - 1, 0, recLine(r, x));  /* before "released" */
  for (const [m, t, id] of lines) { const d = el('div', 'tl' + (m === '✗' ? ' bad' : ''), `${m} ${t}`); if (id) d.id = id; d.style.setProperty('--h', '150'); d.style.setProperty('--l', m === '·' ? '.55' : '.8'); steps.appendChild(d); }
  $('sq-state').textContent = q.contributions.map(k => `${k.ref} · ${fmtSat(k.release)}`).join('\n');
  const can = r.state === 'certified' && r.check && r.check.ok; const sg = $('sq-go'); if (r.state === 'released') finish(sg, '✓ Released'); else { unfinish(sg); sg.disabled = !can; sg.textContent = can ? `Release ${fmtSat(C.requestAmount(q))}` : `Release, once ${who} confirms`; } $('sq-resend').disabled = r.state === 'released' || !OUTBOX; }
$('sq-link').onclick = async () => { const b = $('sq-link'), r = sreqs().find(x => x.id === CUR_SREQ); if (!r) return; const ok = await copyText(await linkOf(r.q, 'clinic')); if (ok) { doneLabel(b); r.handed = true; saveSreq(r); renderSreq(); } else flapLabel(b, 'select it'); };
$('sq-file').onclick = async () => { const r = sreqs().find(x => x.id === CUR_SREQ); if (!r) return; saveFile(`request-${r.id}.json`, JSON.stringify(await reqFileOf(r.q))); r.handed = true; saveSreq(r); renderSreq(); };
// a request's file carries its photos (a link or a QR has no room for them: they follow by relay)
async function reqFileOf(q){ const data = {}; for (const ph of q.photos || []) { let b = null; try { b = await IDB.get('photos', ph.sha256); } catch (_) {} if (b) data[ph.slot] = b64of(new Uint8Array(b)); } return Object.keys(data).length ? { ...q, photoData: data } : q; }
// the request's photos, every part that two relays do not have yet, wrapped anew for the clinic's key (as a record's photos, catParts)
let REQSENDING = null;
const reqPhotosSent = r => { const need = Math.min(2, relays().length); return !!need && (r.q.photos || []).every(ph => Array.from({ length: nParts(ph) }, (_, i) => ph.slot + '.' + i).every(k => ((r.parts || {})[k] || []).length >= need)); };
async function reqParts(){ if (REQSENDING) return REQSENDING; if (!R || !online()) return; REQSENDING = (async () => { const rels = relays(), need = Math.min(2, rels.length);
    for (const r0 of sreqs()) { const q = r0.q, ps = q.photos || []; if (!ps.length || !r0.outbox || reqPhotosSent(r0)) continue; const sk = heldFor('streetcat', [q.campaign.streetcat]); if (!sk) continue;
      for (const ph of ps) { let bytes = null; try { bytes = await IDB.get('photos', ph.sha256); } catch (_) {} if (!bytes) continue;
        for (const part of C.reqPhotoParts(q.id, ph.slot, ph.sha256, b64of(new Uint8Array(bytes)), q.campaign.streetcat, q.campaign.clinic)) { const r = sreqs().find(y => y.id === r0.id) || r0; r.parts = r.parts || {}; const acked = r.parts[part.kind] || []; if (acked.length >= need) continue;
          try { const res = await R.publish(await R.wrap(part, sk, q.campaign.clinic), rels.filter(u => !acked.includes(u)), { timeout: 8000 }); for (const x of res) if (x.ok && !acked.includes(x.url)) acked.push(x.url); } catch (_) {}
          r.parts[part.kind] = acked; saveSreq(r); } } } })().finally(() => { REQSENDING = null; }); return REQSENDING; }
$('sq-qra').onclick = e => { e.preventDefault(); $('sq-qrl').hidden = true; $('sq-qr').onclick(); };
$('sq-qr').onclick = async () => { const r = sreqs().find(x => x.id === CUR_SREQ); if (!r) return; $('sq-steps').hidden = true; showQR($('sq-term'), await C.pack(r.q), $('sq-state')); };  /* in person: the clinic's phone scans it */
$('sq-resend').onclick = async () => { const r = sreqs().find(x => x.id === CUR_SREQ); if (r && OUTBOX && !r.outbox) { const sk = heldFor('streetcat', [r.q.campaign.streetcat]); if (sk) { const it = await OUTBOX.add(r.q, sk, r.q.campaign.clinic, { relays: relays(), label: 'request ' + r.id }); r.outbox = it.id; saveSreq(r); } } await flush(); await reqParts(); renderSreq(); };
// Is it the cat of the request? (StreetCat, 6 Nov: «para ver que realmente se está certificando el gato que es»; the mock-up: «Si».) Once
// the clinic's record of the cat is here (signed with the campaign's clinic key, naming this request), its photos go under the
// request's own, view by view, to be compared by eye; and the cat recognition (catid.js, as in "Already in the records?") gives a hint,
// one-sided: a warning when they look like another cat, never "the same cat". Its score is the mean, over the request's photos (face,
// sides), of each one's closest photo in the record. Calibrated on 58 photos of 14 named cats from Wikimedia Commons (kept out of the
// repository), a cat's photos split into a request and a record: with 2–3 photos a side, under 0.40 the right cat 0–5 % of the time,
// another cat 73–80 %, one of the same coat 51–62 %; with one photo in the record the right cat 15–19 %, so it needs two. Two orange
// kittens scored higher (0.78) than one of them against its own other photos (0.69): cats of one coat can look alike to it. The test
// photos were of cats awake; a record's are of a cat asleep, so the line is to be checked again with the first real cats.
// v2 (7 Nov: catid.js with PetFace too) scores on its own scale: its line is the engine's (CATID.WARN), and a result kept from
// another version of the engine is worked out again (the key names the version from v2 on)
const CATID_V = typeof CATID !== 'undefined' ? CATID.V || 1 : 1;
const MATCH_WARN = (typeof CATID !== 'undefined' && CATID.WARN) || 0.40, views = ps => C.REQ_SLOTS.map(s => (ps || []).find(p => p.slot === s)).filter(Boolean);
const recOfReq = r => scats().filter(x => x.rec.statement.request === r.id && lc(x.rec.statement.clinic) === lc(r.q.campaign.clinic))
  .sort((a, b) => String(b.rec.statement.signed).localeCompare(String(a.rec.statement.signed)))[0] || null;  /* signed again (corrected): the newer one */
const matchKey = (r, x) => [...(CATID_V > 1 ? ['v' + CATID_V] : []), x.id, ...views(r.q.photos).map(p => p.sha256), ...views(x.rec.statement.photos).map(p => p.sha256)].join(',');
const matchOf = (r, x) => r.match && r.match.key === matchKey(r, x) ? r.match : null;  /* worked out once, kept with the request */
const recLine = (r, x) => { const m = matchOf(r, x); return m && m.s < MATCH_WARN ? ['✗', 'its record from the clinic: may not be the same cat', 'sq-rec-tl'] : ['✓', `its record from the clinic · ${when(x.at)}`, 'sq-rec-tl']; };
const matchSay = (s, say) => s < MATCH_WARN ? say('✗ These may not be the same cat. Look at them, and at the chip, before releasing.', true) : say('Compared on this phone: nothing points to another cat. Only a hint: two cats of one coat can look alike to it.');
const allHere = async ps => (await Promise.all(ps.map(p => photoHere(p.sha256)))).every(Boolean);
function sreqRec(r, x){ if (!x) { MATCH_RUN++; return; } const st = x.rec.statement; $('sq-rec').hidden = false;
  $('sq-rec-l').textContent = `At the clinic, asleep · ${st.name}'s record`; $('sq-rec-a').textContent = `${st.name}'s record: chip, notes`;
  photoTiles($('sq-rec-pics'), views(st.photos), 'on its way', 'no photo'); sreqMatch(r, x, false); }
// the first time it waits for a tap (the recognition is 48 MB); after that, or once Offline setup has kept it, it compares by itself.
// MATCHING: the comparison under way; the screen drawn again meanwhile (a check of the relays) follows it instead of starting another.
let MATCH_RUN = 0, MATCHING = null;
async function sreqMatch(r, x, go){ const run = ++MATCH_RUN, line = $('sq-match-st'), get = $('sq-match-get'), mine = views(r.q.photos), theirs = views(x.rec.statement.photos), key = matchKey(r, x);
  const say = (t, bad) => { if (run !== MATCH_RUN) return; line.textContent = t; line.classList.toggle('bad', !!bad); };
  const failed = e => { if (run !== MATCH_RUN) return; say('✗ ' + (CATID.loaded() ? 'the comparison stopped: ' : 'the cat recognition did not come: ') + ((e && e.message) || String(e)), true); get.hidden = false; };  /* in red, and the button again: a tap tries again */
  const shown = s => { if (run !== MATCH_RUN) return; matchSay(s, say); const tl = $('sq-rec-tl'), [mk, t] = recLine(sreqs().find(y => y.id === r.id) || r, x); if (tl) { tl.textContent = `${mk} ${t}`; tl.classList.toggle('bad', mk === '✗'); } };
  get.hidden = true; say('');
  if (!mine.length || typeof CATID === 'undefined') return;  /* a request without photos: the record's are there to look at */
  const done = matchOf(r, x); if (done) return shown(done.s);
  if (theirs.length < 2) return say('Too few photos in the record to compare them here: look at them, and at the chip.');
  if (!(await allHere(theirs))) return say('Its photos are on their way: they come by relay, with a connection.');
  if (!(await allHere(mine))) return say('Your photos are not on this phone: they cannot be compared here.');
  if (MATCHING && MATCHING.key === key) { MATCHING.say = say; say(MATCHING.text); try { shown(await MATCHING.p); } catch (e) { failed(e); } return; }
  if (!go && !CATID.loaded() && !(await CATID.here())) { if (run === MATCH_RUN) { say(`They can also be compared here, on this phone, by the cat recognition: ${Math.round(CATID.SIZE / 1e6)} MB, once.`); get.hidden = false; } return; }
  while (MATCHING) { await MATCHING.p.catch(() => {}); if (run !== MATCH_RUN) return; }  /* one at a time */
  const m0 = MATCHING = { key, text: '', say }, tell = t => { m0.text = t; m0.say(t); };
  m0.p = (async () => { if (!CATID.loaded()) { tell('getting the cat recognition…'); await CATID.load((got, all) => tell(`getting the cat recognition: ${Math.round(got / 1e6)} of ${Math.round(all / 1e6)} MB`)); }
    tell('comparing them on this phone…'); const bytes = sha => IDB.get('photos', sha), probe = [];
    for (const p of mine) probe.push({ slot: p.slot, sha256: p.sha256, bytes: await bytes(p.sha256) });
    const [m] = await CATID.rank(probe, [{ id: x.id, photos: theirs }], bytes, C.REQ_SLOTS); if (!m) throw new Error('its photos could not be read');
    const r2 = sreqs().find(y => y.id === r.id); if (r2) { r2.match = { key, s: m.s, at: nowIso() }; saveSreq(r2); } return m.s; })();
  try { shown(await m0.p); } catch (e) { failed(e); } finally { if (MATCHING === m0) MATCHING = null; } }
$('sq-match-go').onclick = () => { const r = sreqs().find(y => y.id === CUR_SREQ), x = r && recOfReq(r); if (x) sreqMatch(r, x, true); };
$('sq-rec-a').onclick = e => { e.preventDefault(); const r = sreqs().find(y => y.id === CUR_SREQ), x = r && recOfReq(r); if (!x) return; CUR_CAT = x.id; BACK.cat = 'sreq'; openTab('cat'); };
// the release: Streetcat's signature joins the clinic's on every proof of the request; a proof paid in part gives its rest back under the
// same lock, in proofs derived from it (core.js), so the donor can still find it and take it back after the deadline
async function safeSwapOuts(w, inputs, outs, { what, mint }){ if (!storageWorks()) throw new Error(NO_STORAGE); const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  saveFlight({ id, what, mint: norm(mint), ys: inputs.map(yHex), outputs: outs.map(outSave), created: nowIso() });
  try { const proofs = await w.ops.receive(inputs).asCustom(outs).run(); dropFlight(id); return proofs; }
  catch (e) { if (cashu.isMintOperationError(e)) { dropFlight(id); throw e; } let spent = false; try { spent = (await w.checkProofsStates(inputs)).every(s => s.state === 'SPENT'); } catch (_) {}
    if (spent) { const back = await restoreOutputs(w, outs.map(outSave)).catch(() => null); if (back) { dropFlight(id); return back; } }
    throw Object.assign(new Error((spent ? 'the mint took the ecash but its answer was lost, and it could not hand the result back yet.' : 'the mint did not answer, so it is not known whether it did it.') + ' Nothing is lost: this browser kept what it needs, so open this page again later and it will finish. (' + (e.message || e) + ')'), { kept: true }); } }
async function releaseScRequest(r){ const q = r.q, c = q.campaign, sk = heldFor('streetcat', [c.streetcat]); if (!sk) throw Object.assign(new Error('this browser has no Streetcat key for ' + c.name), { byPage: true });
  const v = await C.checkAnswer(q, r.answer); if (!v.ok || r.answer.kind !== 'certified') throw Object.assign(new Error(v.text.replace(/^✗ /, '')), { byPage: true });
  const w = await wallet(c.mint), full = w.decodeToken(r.full).proofs, byY = new Map(full.map(p => [yHex(p), p])), sigs = C.clinicSigsByY(q, r.answer);
  const gone = (await w.checkProofsStates(full)).filter(s => s.state !== 'UNSPENT').length; if (gone) throw Object.assign(new Error(`${gone} of this request's ${full.length} proofs are no longer locked (a donor took them back, or they were released already): make a new request with what is left`), { byPage: true });
  const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), sizes = Object.keys(ks.keys).map(Number).sort((a, b) => b - a), denoms = n => { const o = []; for (const s of sizes) while (n >= s) { o.push(s); n -= s; } return o; };
  const inputs = [], rest = [], parts = [];
  for (const k of q.contributions) { const ps = k.proofs.map(x => byY.get(C.yOf(x.secret))); if (ps.some(x => !x)) throw new Error('this browser lost a proof of ' + k.ref);
    const plan = C.planRelease(ps, k.release); inputs.push(...plan.inputs); if (plan.split) rest.push({ ref: k.ref, outs: await C.remainderOutputs(plan.split, denoms(plan.remainder), ks.id) });
    parts.push({ ref: k.ref, part: { request: q.id, patient: q.patient, procedure: q.procedure, date: q.date, amount: Number(k.release) } }); }
  const fee = amt(w.getFeesForProofs(inputs)), back = rest.reduce((s, x) => s + x.outs.reduce((a, o) => a + amt(o.blindedMessage.amount), 0), 0), released = sum(inputs) - back - fee;
  if (released <= 0) throw Object.assign(new Error('nothing would be left to release after the mint fee'), { byPage: true });
  const signed = cashu.signP2PKProofs(inputs.map(p => C.withSig(p, sigs.get(yHex(p)))), sk), restOf = new Map(rest.flatMap(x => x.outs.map(o => [new TextDecoder().decode(o.secret), x.ref])));
  const got = await safeSwapOuts(w, signed, [...await buildOutputs(w, released), ...rest.flatMap(x => x.outs)], { what: { kind: 'release-split', request: q.id, memo: `${q.patient} · ${q.procedure}` }, mint: c.mint });
  const plainP = got.filter(p => !restOf.has(String(p.secret))), restP = got.filter(p => restOf.has(String(p.secret)));
  const plain = cashu.getEncodedToken({ mint: c.mint, proofs: plainP, memo: `released: ${q.patient} · ${q.procedure} · ${q.id}` }); addReleased({ token: plain, amount: sum(plainP), memo: `${q.patient} · ${q.procedure}`, at: nowIso() });
  const entries = scEntries(c); for (const { ref, part } of parts) { const e = entries[ref]; if (!e) continue; e.parts = [...(e.parts || []), part]; const mine = restP.filter(p => restOf.get(String(p.secret)) === ref);
    if (mine.length) e.remainders = [...(e.remainders || []), cashu.getEncodedToken({ mint: c.mint, proofs: mine.map(fullProof) })]; }
  saveEntries(c, entries); r.state = 'released'; r.released = { amount: sum(plainP), back: sum(restP), fee, at: nowIso() }; saveSreq(r); renderReleased(); reannounce(r.q.campaign); return plain; }
$('sq-go').onclick = async () => { const btn = $('sq-go'); busy(btn, true); try { const r = sreqs().find(x => x.id === CUR_SREQ); if (!r) throw new Error('no request open'); show($('sq-out'), 'asking the mint what is still locked…');
    const plain = await releaseScRequest(r); buzz(); renderSreq(); const rr = sreqs().find(x => x.id === CUR_SREQ);
    const { w: pw, dec: pd } = await decodeTok(plain), back = rr.released.back ? ` ${fmtSat(rr.released.back)} went back under the same lock: still the donors', to pay a later procedure or to be taken back after the deadline.` : '';
    await releasedOut($('sq-out'), { w: pw, proofs: pd.proofs, plain, mint: pd.mint, head: `RELEASED ${fmtSat(rr.released.amount)}.${back}`, keep: 'Move the released ecash to Streetcat\'s wallet now (this browser keeps a copy under Release):', label: 'copy released ecash' });
  } catch (e) { show($('sq-out'), whyFailed(e), 'bad'); } busy(btn, false); };

// ----- QRs: one picture, or for a longer text an animated series the other phone collects part by part -----
const QRPART = 300;
function showQR(term, text, label){ clearInterval(term._qr); term.querySelectorAll('.qr').forEach(e => e.remove()); const n = Math.ceil(text.length / QRPART), parts = n <= 1 ? [text] : Array.from({ length: n }, (_, i) => `SCQ:${i + 1}/${n}:` + text.slice(i * QRPART, (i + 1) * QRPART)); term._frames = parts;
  let i = 0; const draw = () => { const q = qrSvg(parts[i]); term.querySelectorAll('.qr').forEach(e => e.remove()); if (q) term.insertBefore(q, term.firstChild); if (label) label.textContent = n > 1 ? `part ${i + 1} of ${n} · it changes by itself: keep the other camera on it` : 'one picture: scan it with the other phone'; i = (i + 1) % parts.length; };
  draw(); if (n > 1) term._qr = setInterval(() => { if (!term.isConnected || !term.closest('section.on')) return clearInterval(term._qr); draw(); }, 450); }
// the scanner: the camera, read with jsQR (app/jsqr.min.js, loaded only when it is needed)
let SCAN = null;
const loadJsQR = () => window.jsQR ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'jsqr.min.js'; s.onload = () => res(); s.onerror = () => rej(new Error('the scanner could not be loaded')); document.head.appendChild(s); });
const qrParts = () => { const got = new Map(); return t => { const m = /^SCQ:(\d+)\/(\d+):([\s\S]*)$/.exec(t); if (!m) return { done: true, text: t }; const n = Number(m[2]); got.set(Number(m[1]), m[3]); return got.size >= n ? { done: true, text: Array.from({ length: n }, (_, k) => got.get(k + 1) || '').join('') } : { done: false, have: got.size, of: n }; }; };
async function scan(onText){ const box = $('scan'), v = $('scan-v'), msg = $('scan-msg'), add = qrParts(); let stream = null, timer = 0, stop = false; box.hidden = false; msg.textContent = 'starting the camera…';
  const end = () => { stop = true; clearTimeout(timer); if (stream) stream.getTracks().forEach(t => t.stop()); v.srcObject = null; box.hidden = true; SCAN = null; };
  const feed = t => { if (stop) return; const r = add(String(t)); if (r.done) { end(); Promise.resolve(onText(r.text)).catch(() => {}); } else msg.textContent = `part ${r.have} of ${r.of} · keep the camera on it`; };
  SCAN = { end, feed }; $('scan-close').onclick = end;
  try { await loadJsQR(); if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('this browser has no camera access'); stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); if (stop) { stream.getTracks().forEach(t => t.stop()); return; } v.srcObject = stream; await v.play(); msg.textContent = 'point the camera at the QR'; }
  catch (e) { msg.textContent = 'The camera is not available here (' + (e.message || e) + '). Use the file instead.'; msg.classList.add('bad'); return; }
  const cv = $('scan-c'), cx = cv.getContext('2d', { willReadFrequently: true }); let last = '';
  const look = () => { if (stop) return; if (v.readyState >= 2 && v.videoWidth) { const w = Math.min(720, v.videoWidth), h = Math.round(v.videoHeight * w / v.videoWidth); cv.width = w; cv.height = h; cx.drawImage(v, 0, 0, w, h);
      const r = window.jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' }); if (r && r.data && r.data !== last) { last = r.data; feed(r.data); } } timer = setTimeout(look, 120); };
  look(); }

// ----- in person: the volunteer (with a key of their own, never Streetcat's) receives a donation and signs an acknowledgment -----
const VKEY = 'vetlock.volunteer.sk', VREC = 'vetlock.volunteer.received';
const volunteerSk = () => { let sk = ls.get(VKEY); if (!sk || !validSk(sk)) { sk = newKey(); ls.set(VKEY, sk); } return sk; };
const vrecs = () => { const a = jget(VREC, []); return Array.isArray(a) ? a : []; };
let VPEND = null;
async function vInspect(text){ text = String(text || '').trim(); let p = null; try { p = await C.unpack(text); } catch (_) {}
  const tok = p && p.t === 'streetcat.handover' ? p.token : /^cashu/.test(text) ? text : null; if (!tok) throw new Error('this is not a donation to hand over');
  const { w, dec } = await decodeTok(tok), info = lockInfo(dec.proofs), c = p && p.campaign ? C.campaignOf(p.campaign) : { name: String(dec.memo || '').split(' ')[0] || 'donation', op: '', mint: norm(dec.mint), streetcat: lc(info.pubkeys[0]), clinic: lc(info.pubkeys[1]), deadline: info.locktime };
  const checks = [], dleq = await dleqOk(w, dec.proofs);
  checks.push({ state: dleq ? 'ok' : 'bad', text: dleq ? 'Mint signature verified' : 'The mint\'s signature cannot be checked', detail: dleq ? `${dec.proofs.length} proof${dec.proofs.length > 1 ? 's' : ''}, each signed by ${c.mint.replace(/^https?:\/\//, '')} (DLEQ)` : 'Without it, this could be ecash the mint never issued: do not accept it.' });
  const lockBad = [...new Set(dec.proofs.map(x => C.lockProblem(C.lockOf(x.secret), c)).filter(Boolean))];
  checks.push({ state: lockBad.length ? 'bad' : 'ok', text: lockBad.length ? 'The lock is not what the campaign promises' : `Conditions match ${c.name}`, detail: lockBad.length ? lockBad.join('; ') : `Streetcat ${abbr(c.streetcat)} and the clinic ${abbr(c.clinic)} must both sign; the donor can take it back after ${fmtDate(c.deadline)}` });
  const ys = dec.proofs.map(yHex), have = new Set(vrecs().flatMap(x => x.ys || [])), dup = ys.filter(y => have.has(y)).length;
  checks.push({ state: dup ? 'bad' : 'ok', text: dup ? (dup === ys.length ? 'Already received' : `Partly received before (${dup} of ${ys.length} proofs)`) : 'No duplicates', detail: dup ? 'Do not accept it twice.' : 'Checked proof by proof against what this phone received.' });
  let spent = null; if (online() && !w._vlOffline) { try { spent = (await w.checkProofsStates(dec.proofs)).filter(s => s.state !== 'UNSPENT').length; } catch (_) {} }
  checks.push(spent == null ? { state: 'warn', text: 'Spending state not checked', detail: 'Only the mint knows whether it was spent already; it is checked when Streetcat receives it. A mint signature does not prove it is unspent.' } : { state: spent ? 'bad' : 'ok', text: spent ? 'Already spent at the mint' : 'Unspent at the mint', detail: '' });
  VPEND = { ok: dleq && !lockBad.length && !dup && !spent, c, token: tok, ys, ref: await C.donRef(ys), amount: sum(dec.proofs), proofs: dec.proofs, offline: spent == null, dec, info, checks }; return VPEND; }
async function vShow(text){ show($('v-out'), ''); $('v-accept').disabled = true; const term = $('v-term'); clearInterval(term._qr); term.querySelectorAll('.qr,.tcard').forEach(e => e.remove());
  try { const p = await vInspect(text); checkList($('v-checks'), p.checks); term.appendChild(tokenCard(p.dec, p.info, 'locked')); $('v-empty').hidden = true;
    show($('v-out'), p.ok ? `${p.offline ? 'Received offline' : 'Received'} · ${fmtSat(p.amount)} for ${p.c.name} · ${p.ref}` : 'Do not accept it.', p.ok ? '' : 'bad'); $('v-accept').disabled = !p.ok;
  } catch (e) { VPEND = null; $('v-checks').textContent = ''; show($('v-out'), failText(e), 'bad'); } }
function renderShand(reset){ $('v-pk').textContent = roleOf(pubOf(volunteerSk()), 'donor'); if (reset) { VPEND = null; $('v-checks').textContent = ''; show($('v-out'), ''); $('v-accept').disabled = true; const t = $('v-term'); clearInterval(t._qr); t.querySelectorAll('.qr,.tcard').forEach(e => e.remove()); $('v-empty').hidden = false; }
  const list = $('v-list'); list.textContent = ''; const a = vrecs().slice().reverse(); if (!a.length) list.appendChild(el('div', 'empty', 'Nothing received in person yet.'));
  for (const x of a) { const it = el('div', 'item'), l = el('div'); it.style.cursor = 'default'; l.appendChild(el('div', 'nm', `${x.campaign.name} · ${fmtSat(x.amount)}`)); l.appendChild(el('div', 'sub2', `${x.ref} · ${when(x.at)}${x.offline ? ' · received offline' : ''}`)); it.appendChild(l);
    const s = x.forwarded ? sentShort(x.forwarded) : x.handed ? 'sent by hand' : 'not forwarded'; it.appendChild(el('div', 'st' + (s === 'sent' ? ' ok' : ''), s)); list.appendChild(it); }
  $('v-fwd').disabled = !a.some(x => !x.forwarded && !x.handed); }
$('v-copy').onclick = async () => { const ok = await copyText(pubOf(volunteerSk())); if (ok) doneLabel($('v-copy')); else flapLabel($('v-copy'), 'select it'); };
$('v-scan').onclick = () => scan(t => vShow(t));
$('v-pick').onclick = async () => { try { await vShow(await pickFile($('v-file'))); } catch (e) { show($('v-out'), failText(e), 'bad'); } };
$('v-accept').onclick = async () => { const btn = $('v-accept'); busy(btn, true); try { const p = VPEND; if (!p || !p.ok) throw new Error('nothing to accept'); const ack = await C.handoverReceipt(p.c, p.proofs, volunteerSk());
    jset(VREC, [...vrecs(), { ref: p.ref, amount: p.amount, token: p.token, campaign: p.c, ys: p.ys, at: nowIso(), ack, offline: p.offline, forwarded: null }]); VPEND = null; buzz();
    const packed = await C.pack(ack), term = $('v-term'); term.querySelectorAll('.tcard').forEach(e => e.remove()); showQR(term, packed, null); $('v-checks').textContent = '';
    show($('v-out'), `RECEIVED ${fmtSat(p.amount)} for ${p.c.name} (${p.ref}).\nShow the donor this acknowledgment, signed with your volunteer key. Not a certification: it moves nothing, it says that you have it.`, 'ok');
    const row = el('div', 'row2'); row.appendChild(smallBtn('save as file', () => saveFile(`acknowledgment-${p.ref}.json`, JSON.stringify(ack)))); row.appendChild(copyBtn('copy as text', packed)); $('v-out').appendChild(row); $('v-accept').disabled = true; renderShand(false);
  } catch (e) { show($('v-out'), failText(e), 'bad'); } busy(btn, false); };
$('v-fwd').onclick = async () => { const btn = $('v-fwd'); busy(btn, true); try { const sk = volunteerSk(), all = vrecs(), todo = all.filter(x => !x.forwarded && !x.handed); if (!todo.length) throw new Error('nothing left to forward');
    if (!OUTBOX) { saveFile(`donations-received-${today()}.json`, JSON.stringify(todo.map(x => ({ t: 'streetcat.donation', v: 1, id: x.ref, campaign: x.campaign, token: x.token, from: pubOf(sk), via: 'in person', receipt: x.ack })))); todo.forEach(x => { x.handed = true; }); }
    else for (const x of todo) { const it = await OUTBOX.add({ t: 'streetcat.donation', v: 1, id: x.ref, campaign: x.campaign, token: x.token, from: pubOf(sk), via: 'in person', receipt: x.ack, at: nowIso() }, sk, x.campaign.streetcat, { relays: relays(), label: 'donation ' + x.ref }); x.forwarded = it.id; }
    jset(VREC, all); await flush(); renderShand(false); show($('v-out'), OUTBOX ? 'Forwarded: Streetcat\'s app picks them up from the relays.' : 'Saved as a file: send it to Streetcat.', 'ok'); buzz();
  } catch (e) { show($('v-out'), failText(e), 'bad'); } busy(btn, false); };

// ----- the donor: send the locked donation to Streetcat, hand it over in person, share a card -----
let DONATION = null;
function donorExtras(out, row, c, lockedToken, sk, locked){ DONATION = { c, lockedToken, sk, amount: sum(locked), proofs: locked };
  if (OUTBOX) { const r1 = el('div', 'row1'), b = smallBtn('send it to Streetcat', async () => { b.disabled = true; try { const ref = await C.donRef(locked.map(yHex)), it = await OUTBOX.add({ t: 'streetcat.donation', v: 1, id: ref, campaign: C.campaignOf(c), token: lockedToken, from: pubOf(sk), at: nowIso() }, sk, c.streetcat, { relays: relays(), label: 'donation ' + ref });
      DONATION.outbox = it.id; await flush(); const s = sentState(it.id); if (s.state === 'sent') { doneLabel(b, 'sent to Streetcat ✓'); buzz(); } else flapLabel(b, s.acked ? `${s.acked} relay has it` : online() ? 'no relay took it: copy it' : 'offline: copy it', 5000); } catch (e) { flapLabel(b, 'not sent: copy it', 5000); } b.disabled = false; });
    b.classList.add('send-sc'); r1.appendChild(b); out.insertBefore(r1, row); }
  const more = el('p', 'center lnk'), h = el('a', null, 'hand it over in person'), k = el('a', null, 'share a card'); h.href = k.href = '#'; h.onclick = e => { e.preventDefault(); openTab('dhand'); }; k.onclick = e => { e.preventDefault(); openTab('dcard'); };
  more.appendChild(h); more.appendChild(document.createTextNode(' · ')); more.appendChild(k); out.appendChild(more); }
async function renderDhand(){ const d = DONATION, head = $('dh-head'), term = $('dh-term'); head.textContent = ''; show($('dh-out'), ''); clearInterval(term._qr); term.textContent = ''; $('dh-part').textContent = '';
  if (!d) { head.appendChild(el('div', 'mut', 'Lock a donation first: then it can be handed over.')); return; } head.style.setProperty('--h', String(campHue(d.c))); head.appendChild(el('div', 'title', d.c.name)); head.appendChild(el('div', 'mut', `${fmtSat(d.amount)} · locked`));
  showQR(term, await C.pack({ t: 'streetcat.handover', v: 1, campaign: C.campaignOf(d.c), token: d.lockedToken }), $('dh-part')); }
$('dh-file').onclick = async () => { const d = DONATION; if (!d) return; saveFile(`donation-${await C.donRef(d.proofs.map(yHex))}.txt`, await C.pack({ t: 'streetcat.handover', v: 1, campaign: C.campaignOf(d.c), token: d.lockedToken }), 'text/plain'); };
async function donorAck(text){ try { const a = await C.unpack(text); if (!a || a.t !== 'streetcat.handover-receipt' || !(await C.handoverReceiptOk(a))) throw new Error('this is not a signed acknowledgment');
    const d = DONATION, ref = d ? await C.donRef(d.proofs.map(yHex)) : a.body.donation; if (a.body.donation !== ref) throw new Error(`this acknowledgment is for another donation (${a.body.donation})`);
    jset('vetlock.donor.acks', [...jget('vetlock.donor.acks', []).filter(x => x && x.ref !== ref), { ref, ack: a, at: nowIso() }]); buzz();
    show($('dh-out'), `✓ RECEIVED by volunteer ${abbr(a.body.volunteer)} · ${when(a.body.received)}\n${fmtSat(a.body.amount)} for ${a.body.campaign.name}. Not a certification: it says that a Streetcat volunteer has your locked donation. It is kept in this browser.`, 'ok');
  } catch (e) { show($('dh-out'), failText(e), 'bad'); } }
$('dh-scan').onclick = () => scan(donorAck);
// the public card: made only from what may be shown (the campaign, an optional amount, a short message, where to follow it). A canvas PNG
// carries no text chunk, so nothing private can hide in the file.
const CARD_BAD = /cashu[AB]|lnbc|lntb|lnurl|nsec1|npub1|[0-9a-f]{24,}|[A-Za-z0-9+/_=-]{36,}/i;
let CARD = null;
async function renderDcard(){ const d = DONATION, head = $('dk-head'); head.textContent = ''; show($('dk-out'), ''); $('dk-img').textContent = ''; CARD = null; if (!d) { head.appendChild(el('div', 'mut', 'Lock a donation first: then you can share a card.')); return; }
  head.style.setProperty('--h', String(campHue(d.c))); head.appendChild(el('div', 'title', d.c.name)); await drawCard(); }
function wrapLines(g, text, max){ const out = []; let line = ''; for (const w of String(text).split(/\s+/).filter(Boolean)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
async function drawCard(){ const d = DONATION; if (!d) return; const msg = $('dk-msg').value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (msg && CARD_BAD.test(msg)) { show($('dk-out'), 'That message looks like a token, a key or an invoice, so it is not put on the card.', 'bad'); return; } show($('dk-out'), '');
  const ref = await C.donRef(d.proofs.map(yHex)), track = new URL(`status.html?n=${await C.campaignId(d.c)}#${ref}`, location.href.split('#')[0]).href, hue = campHue(d.c);
  try { await document.fonts.load('40px "Departure Mono"'); } catch (_) {}
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'), F = s => `${s}px "Departure Mono", ui-monospace, monospace`, FG = '#efede6', MUTE = '#8d8a81', CAMP = `oklch(.82 .16 ${hue}deg)`;
  g.fillStyle = '#111111'; g.fillRect(0, 0, W, H); g.textBaseline = 'alphabetic'; g.fillStyle = FG; g.font = F(44); g.fillText('STREETCAT', 80, 130); g.fillRect(80, 168, W - 160, 2);
  let y = 330; g.fillStyle = CAMP; let fs = 132; g.font = F(fs); while (g.measureText(d.c.name.toUpperCase()).width > W - 160 && fs > 48) { fs -= 8; g.font = F(fs); } g.fillText(d.c.name.toUpperCase(), 80, y);
  g.fillStyle = MUTE; g.font = F(36); g.fillText(String(d.c.op || 'vet-certified donation'), 80, y + 70); y += 190;
  if ($('dk-amt').checked) { g.fillStyle = FG; g.font = F(40); g.fillText('I donated', 80, y); g.font = F(120); g.fillText(fmtSat(d.amount), 80, y + 130); y += 210; }
  if (msg) { g.fillStyle = FG; g.font = F(42); for (const l of wrapLines(g, '“' + msg + '”', W - 160)) { g.fillText(l, 80, y); y += 58; } y += 30; }
  g.fillStyle = FG; g.font = F(36); for (const l of wrapLines(g, `Locked for ${d.c.name} — released only when the clinic confirms.`, W - 160)) { g.fillText(l, 80, y); y += 50; }
  g.fillStyle = MUTE; g.font = F(30); y = Math.max(y + 40, H - 200); g.fillText('Follow it: ' + ref, 80, y); g.font = F(24); for (const l of wrapLines(g, track.replace(/^https?:\/\//, ''), W - 160).slice(0, 2)) { y += 40; g.fillText(l, 80, y); }
  g.fillText(`Checked ${today()} · the picture does not change, the link does`, 80, H - 70);
  const blob = await new Promise(res => cv.toBlob(res, 'image/png')); CARD = { blob, ref, track }; const img = el('img'); img.alt = `Donation card for ${d.c.name}`; img.src = URL.createObjectURL(blob); $('dk-img').textContent = ''; $('dk-img').appendChild(img); }
let CARDT = 0; $('dk-msg').addEventListener('input', () => { clearTimeout(CARDT); CARDT = setTimeout(drawCard, 350); }); $('dk-amt').onchange = () => drawCard();
$('dk-save').onclick = () => { if (CARD) saveFile(`streetcat-card-${CARD.ref}.png`, CARD.blob); };
$('dk-share').onclick = async () => { if (!CARD) return; const f = new File([CARD.blob], `streetcat-card-${CARD.ref}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text: `Follow it: ${CARD.track}` }); } catch (e) { if (!e || e.name !== 'AbortError') saveFile(f.name, CARD.blob); } } else saveFile(f.name, CARD.blob); };

// ----- the donor pays from a Cashu wallet (NUT-18, experimental) -----
// A plain payment request: unit sat, the campaign's mint only, the amount if one was chosen, and no lock in it (a wallet that applied
// only part of a lock could tie the sats to one key with no way back). The ecash comes back by Nostr (NIP-17) to a key made here for
// this donation and kept with it, so a reload still picks it up; or it is pasted. Then the page does what "pay with ecash" does: the
// mint is checked and the ecash is swapped at once into the campaign's lock with this donation's refund key. Ecash that arrives already
// locked is taken only when it carries exactly that lock; any other lock is refused.
const WREQ = 'vetlock.walletreqs', wreqs = () => { const a = jget(WREQ, []); return Array.isArray(a) ? a.filter(x => x && x.id && x.sk && x.c) : []; }, saveWreq = r => jset(WREQ, [...wreqs().filter(x => x.id !== r.id), r].slice(-30));
const hexOf = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), bytesOf = h => Uint8Array.from(String(h).match(/../g) || [], x => parseInt(x, 16));
let WCUR = null;
async function walletRequest(){ if (!R || !window.nostrkit) throw new Error('this browser cannot reach the relays'); const c = await openSigned($('d-camp').value), amount = Math.floor(Number($('d-amt').value) || 0);
  let r = wreqs().find(x => x.state === 'waiting' && campId(x.c) === campId(c) && (x.amount || 0) === amount && Date.now() - x.created < 86400e3);
  if (!r) { if (!storageWorks()) throw new Error(NO_STORAGE); const { pk } = newDonorKey(c);  /* the refund key is kept before anything is paid */
    r = { id: hexOf(crypto.getRandomValues(new Uint8Array(8))), sk: hexOf(window.nostrkit.generateSecretKey()), pk, c, amount, relays: relays(), created: Date.now(), state: 'waiting', seen: [] }; saveWreq(r); }
  const pub = window.nostrkit.getPublicKey(bytesOf(r.sk));
  r.creq = new cashu.PaymentRequest([{ type: 'nostr', target: R.nprofile(pub, r.relays), tags: [['n', '17']] }], r.id, r.amount || undefined, 'sat', [r.c.mint], `${r.c.name}: a donation locked until the vet confirms (Streetcat)`, true).toEncodedCreqA();
  return r; }
async function renderWallet(){ const term = $('dw-term'); term.textContent = ''; show($('dw-state'), '');
  try { const r = await walletRequest(); WCUR = r; const q = qrSvg(r.creq); if (q) term.appendChild(q); show($('dw-state'), 'waiting for the payment…'); wCheck(); } catch (e) { WCUR = null; show($('dw-state'), failText(e), 'bad'); } }
let WCHECKING = false;
async function wCheck(){ if (WCHECKING || !R || !online()) return; WCHECKING = true;
  try { for (const r of wreqs().filter(x => x.state === 'waiting')) { let res; try { res = await R.receivePayments(r.sk, { relays: r.relays || relays(), since: Math.floor(r.created / 1000), seen: new Set(r.seen || []), timeout: 6000 }); } catch (_) { continue; }
      for (const m of res.payments) { const cur = wreqs().find(x => x.id === r.id) || r; cur.seen = [...(cur.seen || []), m.wrap].slice(-60); saveWreq(cur); if (m.payload.id && m.payload.id !== r.id) continue; await takeWalletEcash(cur, m.payload); if (cur.state !== 'waiting') break; } } } catch (_) {}
  WCHECKING = false; }
const otherMint = (from, c) => `this ecash is from ${from}, but the campaign uses ${c.mint}: it was not taken. Pay with Lightning instead: your wallet can pay the invoice.`;
async function takeWalletEcash(r, p, out = $('dw-state')){ const c = r.c; try {
    if (norm(p.mint) !== norm(c.mint)) throw new Error(otherMint(p.mint, c));
    if (p.unit && p.unit !== 'sat') throw new Error('this ecash is not in sat: it was not taken');
    const w = await wallet(c.mint), proofs = (p.proofs || []).map(x => ({ ...x, amount: amt(x.amount) })); if (!proofs.length) throw new Error('there is no ecash in it');
    const lockedIn = proofs.filter(x => /^\s*\[/.test(String(x.secret)));
    if (!lockedIn.length) { show(out, `received ${fmtSat(sum(proofs))} — locking it…`); const got = await safeSwap(w, proofs, { lock: lockFor(c, r.pk), what: { kind: 'donation', campaign: c, pk: r.pk }, mint: c.mint }); return finishWallet(r, got); }
    if (lockedIn.length === proofs.length && lockMatches(c, r.pk, proofs)) { if (!(await dleqOk(w, proofs))) throw new Error('the mint\'s signature on this locked ecash cannot be checked: it was not taken');
      if ((await w.checkProofsStates(proofs)).some(s => s.state !== 'UNSPENT')) throw new Error('this locked ecash is already spent'); return finishWallet(r, proofs); }
    const to = [...new Set(lockedIn.map(x => { const i = lockInfo([x]); return (i.pubkeys || []).map(k => abbr(lc(k))).join(' + ') || 'another condition'; }))].join('; ');
    throw new Error(`your wallet sent ecash that is already locked (to ${to}), not with this campaign's lock: this page cannot unlock it or lock it again, so it is not a donation. If it is locked to Streetcat's key alone, ask Streetcat to return it.`);
  } catch (e) { show(out, '✗ ' + (e.message || e), 'bad'); r.last = String(e.message || e); saveWreq(r); } }
function finishWallet(r, proofs){ r.state = 'done'; r.done = nowIso(); saveWreq(r); WCUR = null; if (nav.dataset.role !== 'donor' || !$('donate').classList.contains('on')) openTab('donate'); renderLocked(r.c, proofs, findDonorKey([r.pk])); return true; }
// the "Pay with ecash" screen, opened from Donate: the payment request, made when it opens, and one box for pasting ecash
async function renderEcash(){ const head = $('de-head'); head.textContent = ''; show($('de-out'), '');
  if ($('donate').classList.contains('done')) { $('donate').classList.remove('done'); show($('d-out'), ''); }  /* a new donation, as "donate again" starts one */
  try { const c = parseCampaign($('d-camp').value.trim()), n = Math.floor(Number($('d-amt').value) || 0); head.style.setProperty('--h', String(campHue(c)));
    head.appendChild(el('div', 'title', c.name)); head.appendChild(el('div', 'mut', (n > 0 ? fmtSat(n) + ' · ' : '') + 'ecash from ' + String(c.mint).replace(/^https?:\/\//, ''))); } catch (_) {}  /* no readable link: the request says why */
  await renderWallet(); }
$('dw-copy').onclick = async () => { if (!WCUR) return; const ok = await copyText(WCUR.creq); if (ok) doneLabel($('dw-copy')); else flapLabel($('dw-copy'), 'select it'); };
$('dw-check').onclick = async () => { const b = $('dw-check'); busy(b, true); await wCheck(); busy(b, false); };
// pasted ecash goes the request's way (its refund key, its checks: the mint, the unit, ecash already locked); with no request (this
// browser's relay code did not load), it is swapped straight into the lock. A broken or unpublished link stops both before any mint is asked.
$('d-go').onclick = async () => { const b = $('d-go'), out = $('de-out'); busy(b, true); try { const t = $('d-token').value.trim(); if (!t.startsWith('cashu')) throw new Error('paste a cashu token');
    if (!WCUR) await renderWallet(); let ok = false;
    if (!WCUR) ok = await lockPlain(t, out);
    else { const meta = cashu.getTokenMetadata(t); if (norm(meta.mint) !== norm(WCUR.c.mint)) throw new Error(otherMint(meta.mint, WCUR.c));  /* before asking a mint that is not the campaign's */
      const { dec } = await decodeTok(t); ok = await takeWalletEcash(WCUR, { mint: dec.mint, unit: dec.unit || 'sat', proofs: dec.proofs }, out); }
    if (ok) $('d-token').value = ''; } catch (e) { show(out, failText(e), 'bad'); } busy(b, false); };
setInterval(() => { if ($('decash').classList.contains('on') && document.visibilityState === 'visible') wCheck(); }, 4000); setTimeout(() => { if (wreqs().some(x => x.state === 'waiting')) wCheck(); }, 1800);  /* a reload picks up what arrived meanwhile */

// ----- the private recovery receipt, version 1 (core.js makes and reads its data) -----
// A picture: what it shows may be seen (the campaign, the amount, the code, when the refund opens and the refund key's public
// fingerprint); the data, with the key, is inside the PNG and never drawn. Three separate steps: the download is requested, the
// donor confirms the file is kept, and the app checks the saved file. The password is optional and off by default.
const zoneName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { return ''; } };
const fmtUTC = t => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t * 1000)) + ' UTC';
const fmtHere = t => { const z = zoneName(); if (!z || /^(Etc\/)?(UTC|GMT)$/.test(z)) return ''; const d = new Date(t * 1000), day = o => d.toLocaleDateString('en-GB', { timeZone: o }), o = { timeZone: z, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' };
  if (day(z) !== day('UTC')) Object.assign(o, { day: 'numeric', month: 'short' }); return new Intl.DateTimeFormat('en-GB', o).format(d) + ' in ' + z.split('/').pop().replace(/_/g, ' '); };
const opensText = t => fmtUTC(t) + (fmtHere(t) ? ` (${fmtHere(t)})` : '');
async function drawReceipt(r){ const c = r.campaign, hue = campHue(c), W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), F = s => `${s}px "Departure Mono", ui-monospace, monospace`, FG = '#efede6', MUTE = '#8d8a81'; try { await document.fonts.load('40px "Departure Mono"'); } catch (_) {}
  g.fillStyle = '#111111'; g.fillRect(0, 0, W, H); g.fillStyle = FG; g.font = F(44); g.fillText('STREETCAT', 80, 130); g.fillRect(80, 168, W - 160, 2);
  g.fillStyle = '#ff4d4d'; g.fillRect(80, 200, W - 160, 64); g.fillStyle = '#111111'; g.font = F(32); const band = 'PRIVATE · DO NOT SHARE'; g.fillText(band, (W - g.measureText(band).width) / 2, 244);
  let y = 340; g.fillStyle = FG; g.font = F(46); g.fillText('PRIVATE RECOVERY RECEIPT', 80, y); y += 120;
  g.fillStyle = `oklch(.82 .16 ${hue}deg)`; let fs = 110; g.font = F(fs); while (g.measureText(c.name.toUpperCase()).width > W - 160 && fs > 48) { fs -= 8; g.font = F(fs); } g.fillText(c.name.toUpperCase(), 80, y);
  g.fillStyle = MUTE; g.font = F(34); g.fillText(String(c.op || 'vet-certified donation'), 80, y + 60); y += 180;
  g.fillStyle = FG; g.font = F(100); g.fillText(fmtSat(r.donation.amount), 80, y); g.font = F(40); g.fillText(r.donation.ref, 80, y + 70); y += 160;
  g.font = F(34); g.fillText('Refund opens ' + fmtUTC(Number(c.deadline)), 80, y); const here = fmtHere(Number(c.deadline)); if (here) { g.fillStyle = MUTE; g.font = F(30); g.fillText(here, 80, y + 46); } y += 110;
  g.fillStyle = MUTE; g.font = F(28); g.fillText('Made ' + fmtUTC(Math.floor(Date.parse(r.created) / 1000)), 80, y); y += 50;
  const pub = r.refund.pub; g.fillText('Refund key', 80, y); let x = 80 + g.measureText('Refund key ').width;  /* its public fingerprint, in the donors' colours */
  for (const ch of [pub.slice(0, 4), pub.slice(4, 8), pub.slice(8, 12), '…', pub.slice(-8, -4), pub.slice(-4)]) { const v = /^[0-9a-f]{4}$/i.test(ch) ? parseInt(ch, 16) : null;
    g.fillStyle = v == null ? MUTE : `oklch(${(.8 + ((v >> 5) % 7 - 3) * .03).toFixed(3)} .16 ${55 - 14 + v % 29}deg)`; g.fillText(ch, x, y); x += g.measureText(ch).width; }
  y += 70; if (r.refund.sealed) { g.fillStyle = FG; g.font = F(28); g.fillText('Protected with a password: it is needed to use it.', 80, y); y += 56; }
  g.fillStyle = FG; g.font = F(28); for (const l of wrapLines(g, 'Keep this file private: whoever has it can take these sats back once the refund opens. Keep the original file: a screenshot or a photo of it does not work. It never pays out by itself: open it in the app after that date.', W - 160)) { g.fillText(l, 80, y); y += 40; }
  g.fillStyle = MUTE; g.font = F(24); g.fillText(`${C.RECEIPT} · version 1 · check ${r.check}`, 80, H - 70);
  const blob = await new Promise(res => cv.toBlob(res, 'image/png')); return new Uint8Array(await blob.arrayBuffer()); }
async function receiptFile(d, password){ const r = await C.makeReceipt({ campaign: d.c, token: d.lockedToken, proofs: d.locked, refundSk: d.sk, password });
  return { r, text: JSON.stringify(r), blob: new Blob([C.receiptPng(await drawReceipt(r), r)], { type: 'image/png' }), name: `streetcat-receipt-${r.donation.ref}.png` }; }
function receiptBox(out, d){ const box = el('div', 'rcpt'), row = el('div', 'row2'), st = el('div', 'mut code rc-st'), conf = el('div', 'rc-conf'), lab = el('label', 'chk'), cb = el('input'), file = el('input');
  cb.type = 'checkbox'; lab.appendChild(cb); lab.appendChild(el('span', null, 'I have the file, kept where I keep my files')); file.type = 'file'; file.hidden = true;
  let F = null, pw = ''; const note = (t, bad) => { st.textContent = t; st.className = 'mut code rc-st' + (bad ? ' bad' : ''); }, prep = () => receiptFile(d, pw).then(f => { F = f; }).catch(e => note(failText(e), true)); prep();
  const entry = () => donorKeys().find(x => x.pk === d.pk) || {}, setB = b => { addDonorKey({ pk: d.pk, backup: b }); paint(); };
  const plainOut = () => { if (!pw) addDonorKey({ pk: d.pk, plainCopy: true }); };  /* a copy without a password went out: it keeps working */
  const save = smallBtn('save private receipt', () => { if (!F) return flapLabel(save, 'a moment…'); saveFile(F.name, F.blob); plainOut(); setB({ state: 'requested', at: nowIso(), check: F.r.check, sealed: !!pw }); });
  const copy = smallBtn('copy as text', async () => { if (!F) return; const ok = await copyText(F.text); if (ok) { doneLabel(copy); plainOut(); if (!(entry().backup || {}).state) setB({ state: 'requested', at: nowIso(), check: F.r.check, sealed: !!pw, text: true }); } else flapLabel(copy, 'not copied'); });
  const ok = smallBtn('confirm', () => { if (!cb.checked) return flapLabel(ok, 'tick the box'); setB({ ...(entry().backup || {}), state: 'confirmed', at: nowIso() }); });
  const ver = smallBtn('check the saved file', async () => { try { const f = await pickBytes(file, 'image/png,application/json,.json,.txt'), res = await C.readReceipt(f.bytes);
      if (res.kind === 'none') throw new Error(res.why); if (res.problems.length) throw new Error(res.problems.join('; '));
      const same = res.receipt.donation.token === d.lockedToken || (res.receipt.donation.ref && res.receipt.donation.ref === (F && F.r.donation.ref));
      if (!same) throw new Error(`this receipt is for another donation (${res.receipt.donation.ref || 'unknown'})`); if (lc(res.receipt.refund.pub || '') !== d.pk) throw new Error('this receipt names another refund key');
      if (res.receipt.refund.key && res.receipt.refund.key !== lc(d.sk)) throw new Error('the key in this receipt is not this donation\'s refund key');
      setB({ ...(entry().backup || {}), state: 'verified', at: nowIso(), sealed: res.sealed, file: f.name }); } catch (e) { note('✗ ' + (e.message || e), true); } });
  const paint = () => { const b = entry().backup || {}; st.className = 'mut code rc-st' + (b.state === 'verified' ? ' ok' : '');
    st.textContent = b.state === 'verified' ? `✓ Backup verified · ${when(b.at)}${b.sealed ? ' · protected with a password' : ''}` : b.state === 'confirmed' ? 'saved · not checked yet: open the saved file to check it' : b.state === 'requested' ? (b.text ? 'copied as text · not confirmed yet' : 'download requested · not confirmed yet') : 'not saved yet';
    conf.hidden = b.state !== 'requested'; ver.hidden = !(b.state === 'confirmed' || b.state === 'verified'); };
  const pd = el('details', 'more'), p1 = el('input'), p2 = el('input'); pd.appendChild(el('summary', null, 'protect it with a password (optional)')); p1.type = p2.type = 'password'; p1.autocomplete = p2.autocomplete = 'new-password'; p1.placeholder = 'a password, 10 characters or more'; p2.placeholder = 'the same password again';
  const use = smallBtn('use this password', async () => { if (p1.value.length < 10) return note('the password needs 10 characters or more', true); if (p1.value !== p2.value) return note('the two passwords are not the same', true);
    pw = p1.value; p1.value = p2.value = ''; F = null; await prep(); setB({ state: '', sealed: true });
    st.textContent = 'not saved yet · the new receipt is protected with your password' + (entry().plainCopy ? '. The copy saved before has no password and still works: delete it once this one is saved.' : ''); st.classList.toggle('bad', !!entry().plainCopy); });
  pd.appendChild(p1); pd.appendChild(p2); const ur = el('div', 'row1'); ur.appendChild(use); pd.appendChild(ur); pd.appendChild(el('div', 'mut', 'Off by default: if you forget the password, nobody can take these sats back, not even you.'));
  row.appendChild(save); row.appendChild(copy); const cr = el('div', 'row1'); cr.appendChild(ok); conf.appendChild(lab); conf.appendChild(cr); const vr = el('div', 'row1'); vr.appendChild(ver);
  box.appendChild(row); box.appendChild(st); box.appendChild(conf); box.appendChild(vr); box.appendChild(file); box.appendChild(pd); out.appendChild(box); paint(); }
// the receipt of a donation made in this browser, as the file carries it (for the tests; the key never reaches the screen)
async function receiptOf(lockedToken){ const k = donorKeys().find(x => x.lockedToken === lockedToken); if (!k || !k.sk) return null; const { w, dec } = await decodeTok(lockedToken), info = lockInfo(dec.proofs);
  const c = k.camp || { name: k.campaign, op: '', mint: dec.mint, streetcat: info.pubkeys[0], clinic: info.pubkeys[1], deadline: info.locktime, hue: k.hue }; return C.makeReceipt({ campaign: c, token: lockedToken, proofs: dec.proofs, refundSk: k.sk }); }

// ----- the cat's record (core.js signCat): the clinic writes it with the cat asleep, and it reaches Streetcat by itself -----
// The record is small and goes through the outbox, as an answer does. Its photos are not: the outbox lives in localStorage, where the
// whole app has a few megabytes. So the photos are kept in IndexedDB under their SHA-256 and go straight to the relays, in parts of at
// most CAT_CHUNK characters (a gift wrap of about 55 kB), each part again, on every tick, until two relays have it. Streetcat puts a
// photo together from its parts and keeps it only when its SHA-256 is the one the record names.
const PHOTO_MAX = 38000, PHOTO_SIDES = [640, 560, 480, 400, 320], PHOTO_Q = [.72, .62, .52, .42];  // at most two parts per photo
const SLOTNAME = { face: 'face', left: 'left side', right: 'right side', nose: 'nose' };
const IDB = (() => { let db = null;
  const open = () => db || (db = new Promise((res, rej) => { let r; try { r = indexedDB.open('streetcat', 1); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => { for (const s of ['photos', 'parts']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('this browser keeps no photos')); r.onblocked = () => rej(new Error('the photos are open in another tab')); }).catch(e => { db = null; throw e; }));
  const run = (store, mode, fn) => open().then(d => new Promise((res, rej) => { const t = d.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = () => res(q ? q.result : undefined); t.onerror = t.onabort = () => rej(t.error || new Error('the photos could not be read or kept')); }));
  return { get: (s, k) => run(s, 'readonly', o => o.get(k)), put: (s, k, v) => run(s, 'readwrite', o => o.put(v, k)), del: (s, k) => run(s, 'readwrite', o => o.delete(k)), keys: s => run(s, 'readonly', o => o.getAllKeys()) }; })();
const b64of = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(String(s)), ch => ch.charCodeAt(0));
const PURL = new Map();  // a photo's SHA-256 → its blob: address, made once per page
async function photoUrl(sha){ if (PURL.has(sha)) return PURL.get(sha); let b = null; try { b = await IDB.get('photos', sha); } catch (_) {} if (!b) return null;
  const u = URL.createObjectURL(new Blob([b], { type: 'image/jpeg' })); PURL.set(sha, u); return u; }
const photoHere = async sha => { try { return !!(await IDB.get('photos', sha)); } catch (_) { return false; } };
async function keepPhoto(sha, bytes){ if (await C.sha256hex(bytes) !== sha) return false; await IDB.put('photos', sha, bytes); return true; }
const nParts = ph => Math.max(1, Math.ceil(Math.ceil(ph.bytes / 3) * 4 / C.CAT_CHUNK));
// a photo from the camera or the library, made small here: at most 640 px and PHOTO_MAX bytes, in JPEG. Drawn anew, it leaves behind
// everything the camera wrote into the file: where it was taken, the phone, the time.
async function shrinkPhoto(file){ const url = URL.createObjectURL(file); try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('this photo cannot be opened here: try another one')); i.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight; if (!W || !H) throw new Error('this photo cannot be opened here: try another one');
    for (const side of PHOTO_SIDES) { const k = Math.min(1, side / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k)), cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
      for (const q of PHOTO_Q) { const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', q)); if (b && b.size <= PHOTO_MAX) { const bytes = new Uint8Array(await b.arrayBuffer()); return { bytes, w, h, sha256: await C.sha256hex(bytes) }; } } }
    throw new Error('this photo cannot be made small enough: try another one'); } finally { URL.revokeObjectURL(url); } }
// the records: the clinic's, made on this phone ({ id, rec, to, outbox, parts: { 'face.0': [relays that have it] }, at, handed }),
// and Streetcat's, received ({ id, rec, from, at, via }); rec is the signed record without its photos
const CCATS = 'vetlock.clinic.cats', ccats = () => { const a = jget(CCATS, []); return Array.isArray(a) ? a.filter(x => x && x.id && x.rec && x.rec.statement) : []; }, saveCcat = x => jset(CCATS, [...ccats().filter(y => y.id !== x.id), x]);
const SCATS = 'vetlock.sc.cats', scats = () => { const a = jget(SCATS, []); return Array.isArray(a) ? a.filter(x => x && x.id && x.rec && x.rec.statement) : []; }, saveScat = x => jset(SCATS, [...scats().filter(y => y.id !== x.id), x]);
const catsOf = role => role === 'clinic' ? ccats() : scats();
const knownClinics = () => new Set([...camps().map(k => lc(k && k.c && k.c.clinic)), ...sreqs().map(r => lc(r.q.campaign.clinic))].filter(Boolean));
const clinicCamp = pk => camps().find(k => k && k.c && lc(k.c.clinic) === lc(pk)) || null;
let CN = { req: null, shots: {} }, CUR_CAT = null, CATSENDING = null;
// sent: the record by two relays (or the file handed over, which carries the photos) and every part of every photo
function catState(x){ const s = sentState(x.outbox), need = Math.min(2, relays().length); let have = 0, all = 0;
  for (const ph of x.rec.statement.photos) for (let i = 0, n = nParts(ph); i < n; i++, all++) if (((x.parts || {})[ph.slot + '.' + i] || []).length >= need) have++;
  return { s, have, all, done: !!x.handed || (s.state === 'sent' && have === all) }; }
const catShort = x => { const c = catState(x); return c.done ? ['sent', 'ok'] : c.s.state === 'failed' ? ['not sent', 'bad'] : !online() ? ['offline', 'bad'] : [c.s.state === 'sent' && c.all ? `photos ${c.have} of ${c.all}` : 'sending', '']; };
function catSentText(x){ const c = catState(x); if (x.handed && !(c.s.state === 'sent' && c.have === c.all)) return 'saved as a file, with its photos: Streetcat adds it from the file';
  return [c.s.state !== 'none' ? 'record: ' + sentText(c.s) : '', c.all ? `photos: ${c.have} of ${c.all} part${c.all === 1 ? '' : 's'} sent` : 'no photos',
    c.done ? 'Streetcat gets it the next time its app checks.' : c.s.state === 'failed' ? 'not sent: save it as a file and send it to Streetcat' : online() ? 'It goes on by itself while the app is open.' : 'It goes when this phone has a connection.'].filter(Boolean).join('\n'); }
// the file: the record and its photos in one (for when no relay takes them, or in person)
async function catFile(x){ const photos = {}; for (const ph of x.rec.statement.photos) { let b = null; try { b = await IDB.get('photos', ph.sha256); } catch (_) {} if (b) photos[ph.slot] = b64of(new Uint8Array(b)); } return JSON.stringify({ ...x.rec, photos }); }
const catFileName = st => `cat-${String(st.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'record'}-${st.id}.json`;

// THE CLINIC: a new record, from its request (the cat, the procedure and the date are there already) or from nothing. Short, as StreetCat
// asked (6 Nov, "la interfaz de clínica es muy larga"): what is known already is one line with "edit" (the cat, the procedure and the
// date of a request; without one, the procedure of the cat before, or sterilisation, and today); coat and notes are folded.
const CATPROC = 'vetlock.clinic.proc';
function openCatnew(reqId){ const r = reqId && creqs().find(x => x.id === reqId), q = r && r.q; CN = { req: q ? r.id : null, shots: {} };
  $('cn-name').value = q ? q.patient : ''; $('cn-proc').value = q ? q.procedure : (ls.get(CATPROC) || 'sterilisation'); $('cn-date').value = q ? q.date : today();
  for (const id of ['cn-chip', 'cn-coat', 'cn-notes']) $(id).value = ''; $('cn-colony').value = ls.get('vetlock.clinic.colony') || '';  /* the colony of the cat before: often this one's too */
  document.querySelectorAll('#cn-sex button, #cn-ear button').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('#cn-shots .shot').forEach(b => { b.classList.remove('has', 'busy'); b.querySelectorAll('img').forEach(i => i.remove()); }); shotsLine();
  $('cn-namebox').hidden = !!q; $('cn-basics').hidden = true; $('cn-sum').hidden = false; $('cn-more').open = false; catSum();
  $('cn-like').hidden = true; $('cn-like-list').textContent = ''; $('cn-req-pics').textContent = ''; likeCheck();  /* from a request with photos, Streetcat's show at once */
  unfinish($('cn-go')); $('cn-again').hidden = true; show($('cn-out'), ''); BACK.catnew = q ? 'creq' : 'cats'; openTab('catnew'); window.scrollTo(0, 0); }
function renderCatnew(){ const head = $('cn-head'), r = CN.req && creqs().find(x => x.id === CN.req), q = r && r.q; head.textContent = '';
  head.style.setProperty('--h', String(q ? campHue(q.campaign) : HUE.clinic)); head.appendChild(el('div', 'title', $('cn-name').value.trim() || 'New cat'));
  head.appendChild(el('div', 'mut', q ? `${q.campaign.name} · request ${q.id}` : 'a cat record, signed by the clinic')); catSum(); }
const catSum = () => { $('cn-sum-t').textContent = [$('cn-proc').value.trim() || 'no procedure', $('cn-date').value || 'no date'].join(' · '); };
const catEdit = () => { $('cn-namebox').hidden = false; $('cn-basics').hidden = false; $('cn-sum').hidden = true; };  /* the line opens into its fields */
$('cn-edit').onclick = e => { e.preventDefault(); catEdit(); $(CN.req ? 'cn-name' : 'cn-proc').focus(); };
$('cn-name').addEventListener('input', () => { const t = $('cn-head').querySelector('.title'); if (t) t.textContent = $('cn-name').value.trim() || 'New cat'; });
for (const id of ['cn-proc', 'cn-date']) $(id).addEventListener('input', catSum);
for (const id of ['cn-sex', 'cn-ear']) $(id).querySelectorAll('button').forEach(b => { b.onclick = () => { const on = !b.classList.contains('on'); $(id).querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.toggle('on', on); }; });  /* a second tap unsets it */
const picked = id => { const b = $(id).querySelector('button.on'); return b ? b.dataset.v : ''; };
const SHOTS_NOTE = 'Photos with the cat asleep: made small here, without location data.';
const shotsLine = () => { const a = Object.values(CN.shots), kb = Math.round(a.reduce((s, p) => s + p.bytes.length, 0) / 1000); $('cn-shots-st').textContent = a.length ? `${a.length} of 4 photos · ${kb} kB, made small here, without location data` : SHOTS_NOTE; };
// the photo is taken with the phone's camera, straight away (StreetCat, 6 Nov: "que directamente la aplicación tome la foto sin elegirla
// de la galería"): the file input asks for the camera (capture="environment"); a computer, which has none, offers its files
document.querySelectorAll('#cn-shots .shot').forEach(b => { b.onclick = async () => { const slot = b.dataset.slot, input = $('cn-file');
  const f = await new Promise(res => { input.value = ''; input.onchange = () => res(input.files && input.files[0]); input.click(); }); if (!f) return;
  b.classList.add('busy'); try { const p = await shrinkPhoto(f); CN.shots[slot] = p; b.querySelectorAll('img').forEach(i => i.remove()); const img = el('img'); img.alt = SLOTNAME[slot]; img.src = URL.createObjectURL(new Blob([p.bytes], { type: 'image/jpeg' })); b.prepend(img); b.classList.add('has'); shotsLine(); show($('cn-out'), ''); likeCheck(); }
  catch (e) { show($('cn-out'), failText(e), 'bad'); } b.classList.remove('busy'); }; });
// "Already in the records?" (StreetCat, 6 Nov: «que les avise de posibles redundancias»): the new cat's photos against the records on this
// phone, with the cat recognition of catid.js. A hint, never a proof. The first time it waits for a tap: the recognition is 48 MB.
const LIKE_SLOTS = ['face', 'left', 'right'];  /* the nose, a close-up, says little of which cat it is */
let LIKE_RUN = 0;
function likeTile(x, sha){ const st = x.rec.statement, b = el('button'), ph = st.photos.find(p => p.sha256 === sha) || st.photos.find(p => p.slot === 'face') || st.photos[0]; b.type = 'button';
  const im = el(ph ? 'img' : 'div', ph ? '' : 'none'); if (ph) { im.alt = `${st.name}, ${SLOTNAME[ph.slot] || ph.slot}`; photoUrl(ph.sha256).then(u => { if (u) im.src = u; else im.className = 'none'; }); } b.appendChild(im);
  b.appendChild(el('div', 'nm', st.name)); b.appendChild(el('div', 'sub2', st.colony || '—')); b.appendChild(el('div', 'sub2', st.date)); b.onclick = () => { CUR_CAT = x.id; BACK.cat = 'catnew'; openTab('cat'); }; return b; }
// "Check the cat" (StreetCat, 7 Nov: «tendría que ser un botón unificado para comprobar ambos… el botón que ya hay»; the name, «Check the
// cat»): one check, two answers. Is it the cat of Streetcat's request (its photos as caught, when the record is made from a request;
// the same hint as on Streetcat's side, one-sided, MATCH_WARN), and is it already in the records (the order, as before). Streetcat's
// photos show at once, to be looked at; the recognition, the first time, waits for the tap.
async function likeCheck(go){ const run = ++LIKE_RUN, box = $('cn-like'), list = $('cn-like-list'), st = $('cn-like-st'), get = $('cn-like-get'), rst = $('cn-req-st');
  const rq0 = CN.req && creqs().find(x => x.id === CN.req), rq = rq0 ? views(rq0.q.photos) : [];
  const recs = ccats().filter(x => x.rec.statement.photos.some(p => LIKE_SLOTS.includes(p.slot))), probe = LIKE_SLOTS.filter(s => CN.shots[s]).map(s => ({ slot: s, sha256: CN.shots[s].sha256, bytes: CN.shots[s].bytes }));
  list.textContent = ''; get.hidden = true; st.classList.remove('bad'); st.textContent = ''; rst.textContent = ''; $('cn-req').hidden = !rq.length; $('cn-recs').hidden = true;
  if (rq.length && (run === 1 || $('cn-req-pics').childElementCount === 0 || $('cn-req-pics')._req !== CN.req)) { $('cn-req-pics')._req = CN.req; photoTiles($('cn-req-pics'), rq, 'on its way', 'no photo'); }
  box.hidden = !rq.length && !(recs.length && probe.length); if (typeof CATID === 'undefined' || !probe.length || (!recs.length && !rq.length)) return;
  const of = `your ${recs.length} record${recs.length === 1 ? '' : 's'}`, withWhat = [rq.length ? 'Streetcat\'s' : '', recs.length ? of : ''].filter(Boolean).join(' and with ');
  if (!go && !CATID.loaded() && !(await CATID.here())) { if (run !== LIKE_RUN) return; st.textContent = `Its photos can be compared with ${withWhat}, here on this phone. The cat recognition comes once: ${Math.round(CATID.SIZE / 1e6)} MB.`; get.hidden = false; return; }
  try { if (!CATID.loaded()) { st.textContent = 'getting the cat recognition…'; await CATID.load((got, all) => { if (run === LIKE_RUN) st.textContent = `getting the cat recognition: ${Math.round(got / 1e6)} of ${Math.round(all / 1e6)} MB`; }); }
    if (run !== LIKE_RUN) return;
    if (rq.length) { if (rq.length < 2) rst.textContent = 'Too few photos in the request to compare them here: look at them, and at the chip.';
      else if (!(await allHere(rq))) rst.textContent = 'Streetcat\'s photos are on their way: they come by relay, with a connection.';
      else { st.textContent = 'comparing with Streetcat\'s photos…'; const [m] = await CATID.rank(probe, [{ id: 'request', photos: rq }], sha => IDB.get('photos', sha), LIKE_SLOTS); if (run !== LIKE_RUN) return;
        if (m) setLines(rst, m.s < MATCH_WARN ? '✗ These may not be the cat of Streetcat\'s request. Look at them, and at the chip, before signing.' : 'Compared with Streetcat\'s photos: nothing points to another cat. Only a hint: two cats of one coat can look alike to it.'); }
      st.textContent = ''; }
    if (!recs.length) return; st.textContent = `comparing with ${of}…`;
    const ranked = await CATID.rank(probe, recs.map(x => ({ id: x.id, photos: x.rec.statement.photos })), sha => IDB.get('photos', sha), LIKE_SLOTS, (d, all) => { if (run === LIKE_RUN && all > 3) st.textContent = `comparing with ${of}: ${d} of ${all} photos`; });
    if (run !== LIKE_RUN) return; const top = ranked.slice(0, 3); $('cn-recs').hidden = false;
    for (const r of top) { const x = ccats().find(y => y.id === r.id); if (x) list.appendChild(likeTile(x, r.sha)); }
    st.textContent = (recs.length > 3 ? `The 3 of ${of} that look most like it` : recs.length === 1 ? 'Your only record' : `Your ${recs.length} records, the most alike first`) + ', worked out on this phone. Only an order, not a match: open one to compare the chip.'; }
  catch (e) { if (run !== LIKE_RUN) return; const m = (e && e.message) || String(e);  /* in red, and the button again: a tap tries again */
    st.textContent = '✗ ' + (CATID.loaded() ? 'the comparison stopped: ' : 'the cat recognition did not come: ') + m; st.classList.add('bad'); get.hidden = false; } }
$('cn-like-go').onclick = () => likeCheck(true);
// a record made without a request goes to the Streetcat of the last request this phone got, or to Streetcat's published key
const catTo = () => { const r = creqs().slice().sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]; return r ? lc(r.q.campaign.streetcat) : lc(STREETCAT_KEYS[0] || ''); };
async function catSign(){ const r = CN.req && creqs().find(x => x.id === CN.req), q = r && r.q, sk = q ? clinicSkFor(q) : key('clinic', false), no = m => Object.assign(new Error(m), { byPage: true });
  if (!sk) throw no(q ? `this phone has no clinic key for ${q.campaign.name}` : 'this phone has no clinic key yet: make one in settings');
  const name = $('cn-name').value.trim(), chip = $('cn-chip').value.replace(/[\s.-]/g, ''), to = q ? lc(q.campaign.streetcat) : catTo();
  if (!name) { catEdit(); throw no('write the cat\'s name'); } if (chip && !/^\d{15}$/.test(chip)) throw no(`the microchip number has ${chip.length} character${chip.length === 1 ? '' : 's'}: it must be 15 digits`);
  if (!$('cn-proc').value.trim() || !$('cn-date').value) { catEdit(); throw no('write the procedure and its date'); } if (!PUBKEY.test(to)) throw no('this phone does not know Streetcat\'s key yet: open a request from Streetcat first');
  const photos = C.CAT_SLOTS.filter(s => CN.shots[s]).map(s => ({ slot: s, sha256: CN.shots[s].sha256, bytes: CN.shots[s].bytes.length, w: CN.shots[s].w, h: CN.shots[s].h }));
  try { for (const p of photos) await IDB.put('photos', p.sha256, CN.shots[p.slot].bytes); } catch (_) { throw no('this browser cannot keep the photos (a private window?): open the app in a normal window'); }  /* before signing: the record names only photos this phone keeps */
  const rec = await C.signCat({ name, colony: $('cn-colony').value, chip, sex: picked('cn-sex'), ear: picked('cn-ear'), coat: $('cn-coat').value, procedure: $('cn-proc').value, date: $('cn-date').value, notes: $('cn-notes').value, photos }, sk, q ? { request: q.id, campaign: q.campaign } : {});
  const x = { id: rec.id, rec, to, at: nowIso(), parts: {} }; saveCcat(x); if (rec.statement.colony) ls.set('vetlock.clinic.colony', rec.statement.colony); ls.set(CATPROC, rec.statement.procedure); return x; }
async function catSend(x){ const sk = heldFor('clinic', [x.rec.statement.clinic]); if (!sk || !OUTBOX) return;
  if (!x.outbox) { const it = await OUTBOX.add(x.rec, sk, x.to, { relays: relays(), label: 'cat ' + x.rec.statement.name }); x.outbox = it.id; saveCcat(x); }
  await flush(); await catParts(); }
// every part of a photo that two relays do not have yet, of every record made on this phone: wrapped anew, sent straight to them
async function catParts(){ if (CATSENDING) return CATSENDING; if (!R || !online()) return; CATSENDING = (async () => { const rels = relays(), need = Math.min(2, rels.length);
    for (const x0 of ccats()) { const st = x0.rec.statement, sk = heldFor('clinic', [st.clinic]); if (!sk || !x0.outbox) continue;
      for (const ph of st.photos) { const x = ccats().find(y => y.id === x0.id) || x0; x.parts = x.parts || {};
        if (Array.from({ length: nParts(ph) }, (_, i) => ph.slot + '.' + i).every(k => (x.parts[k] || []).length >= need)) continue;
        let bytes = null; try { bytes = await IDB.get('photos', ph.sha256); } catch (_) {} if (!bytes) continue;
        for (const part of C.catPhotoParts(x.id, ph.slot, ph.sha256, b64of(new Uint8Array(bytes)), st.clinic)) { const acked = x.parts[part.kind] || []; if (acked.length >= need) continue;
          try { const res = await R.publish(await R.wrap(part, sk, x.to), rels.filter(u => !acked.includes(u)), { timeout: 8000 }); for (const r of res) if (r.ok && !acked.includes(r.url)) acked.push(r.url); } catch (_) {}
          x.parts[part.kind] = acked; saveCcat(x); } } } })().finally(() => { CATSENDING = null; }); return CATSENDING; }
function catNewOut(x){ const out = $('cn-out'); show(out, `SIGNED · ${when(x.rec.statement.signed)} · ${x.id}\n` + catSentText(x)); out.appendChild(catActs(x)); }
function catActs(x){ const clinic = nav.dataset.role === 'clinic', bs = [smallBtn('save as file', async () => { saveFile(catFileName(x.rec.statement), await catFile(x)); if (clinic) { const y = ccats().find(z => z.id === x.id); if (y && !y.handed) { y.handed = true; saveCcat(y); refreshStates(); } } })];
  if (x.rec.statement.chip) bs.push(copyBtn('copy chip', x.rec.statement.chip));
  if (clinic && !catState(x).done && OUTBOX && online()) bs.push(smallBtn('send again', async () => { await flush(); await catParts(); refreshStates(); }));
  const box = el('div'); for (let i = 0; i < bs.length; i += 2) { const row = el('div', bs.length - i === 1 ? 'row1' : 'row2'); if (i) row.style.marginTop = 'var(--u)'; bs.slice(i, i + 2).forEach(b => row.appendChild(b)); box.appendChild(row); } return box; }
$('cn-go').onclick = async () => { const btn = $('cn-go'); if (btn.classList.contains('fin')) return; busy(btn, true);
  try { const x = await catSign(); finish(btn, '✓ Signed'); buzz(); $('cn-again').hidden = false; catNewOut(x); await catSend(x); catNewOut(ccats().find(y => y.id === x.id) || x); }
  catch (e) { show($('cn-out'), failText(e), 'bad'); } busy(btn, false); };
$('cn-again').querySelector('a').onclick = e => { e.preventDefault(); openCatnew(null); };
// the request's screen names its cat's record: to make it, or to see it once made
function creqCat(r){ const p = $('cr-cat'), have = ccats().find(x => x.rec.statement.request === r.id); p.hidden = !clinicSkFor(r.q) || pkindOf(r.q) !== 'clinic';  /* a cat's record: a clinic's, not a shop's */
  $('cr-cat-a').textContent = have ? `${r.q.patient}'s record · ${catShort(have)[0]}` : `${r.q.patient}'s record: photos, chip`; }
$('cr-cat-a').onclick = e => { e.preventDefault(); const r = creqs().find(x => x.id === CUR_CREQ); if (!r) return; const have = ccats().find(x => x.rec.statement.request === r.id); if (have) { CUR_CAT = have.id; BACK.cat = 'cats'; openTab('cat'); } else openCatnew(r.id); };

// STREETCAT: a record, checked (signed with the clinic key it names, which must be one of a campaign's to be trusted), then its photos
async function takeCat(p, via){ const v = await C.catCheck(p); if (!v.ok) throw Object.assign(new Error('a cat record that does not check out: ' + v.problems.join('; ')), { byPage: true });
  const { photos, ...rec } = p, have = scats().find(x => x.id === p.id);
  if (!have || String(rec.statement.signed) > String(have.rec.statement.signed)) saveScat({ id: p.id, rec, from: lc(p.from || rec.statement.clinic), at: have ? have.at : nowIso(), via: have ? have.via : via });  /* signed again (corrected): the newer one */
  if (photos && typeof photos === 'object') for (const ph of rec.statement.photos) if (typeof photos[ph.slot] === 'string') { try { await keepPhoto(ph.sha256, unb64(photos[ph.slot])); } catch (_) {} }  /* a file carries its photos */
  return !have; }
// a part of a photo (a record's, or a request's): kept until all its parts are here, then the photo, if it is the one its SHA-256 says
async function takePart(p){ const k = i => p.sha256 + '|' + i; await IDB.put('parts', k(p.part), p.data);
  const all = []; for (let i = 0; i < p.of; i++) { const d = await IDB.get('parts', k(i)); if (typeof d !== 'string') return false; all.push(d); }
  let ok = false; try { ok = await keepPhoto(p.sha256, unb64(all.join(''))); } catch (_) {} if (ok) for (let i = 0; i < p.of; i++) await IDB.del('parts', k(i)).catch(() => {}); return ok; }
async function takeCatPart(p){ if (!C.catPartOk(p) || await photoHere(p.sha256)) return false; const ok = await takePart(p);
  if (ok && ['cats', 'cat', 'sreq'].some(id => $(id).classList.contains('on'))) refreshStates(); return ok; }  /* a request's screen shows its record's photos too */
async function takeAnsPart(p){ const r = sreqs().find(x => x.id === p.id); if (!C.ansPartOk(p) || !r || lc(p.from) !== lc(r.q.campaign.clinic) || await photoHere(p.sha256)) return false; const ok = await takePart(p);
  if (ok && $('sreq').classList.contains('on') && CUR_SREQ === p.id) renderSreq(); return ok; }
async function takeReqPart(p){ if (!C.reqPartOk(p) || await photoHere(p.sha256)) return false; const ok = await takePart(p);
  if (ok && $('creq').classList.contains('on') && CUR_CREQ === p.id) { const r = creqs().find(x => x.id === p.id); if (r) creqPics(r.q); } return ok; }
const catPhotos = async st => { let n = 0; for (const p of st.photos) if (await photoHere(p.sha256)) n++; return n; };
const STERIL = /steril|spay|neuter|castra|ovariect|ovariohyst|orchiect|esteril|castración/i;

// BOTH: the list (searchable by name, chip, colony or coat) and one cat
async function renderCats(){ const role = nav.dataset.role, clinic = role === 'clinic', all = catsOf(role).sort((a, b) => String(b.rec.statement.date + b.rec.statement.signed).localeCompare(String(a.rec.statement.date + a.rec.statement.signed)));
  $('ca-new').hidden = !clinic; $('ca-check').hidden = clinic; $('ca-add').hidden = clinic;
  $('ca-n').textContent = String(all.length); $('ca-m-l').textContent = clinic ? 'to send' : 'sterilised'; $('ca-m').textContent = String(clinic ? all.filter(x => !catState(x).done).length : all.filter(x => STERIL.test(x.rec.statement.procedure)).length);
  const q = $('ca-q').value.trim().toLowerCase(), qd = q.replace(/[\s.-]/g, ''), shown = all.filter(x => { const st = x.rec.statement; return !q || [st.name, st.colony, st.coat, st.id].some(v => String(v || '').toLowerCase().includes(q)) || (/^\d+$/.test(qd) && String(st.chip || '').includes(qd)); });
  const list = $('ca-list'), known = clinic ? null : knownClinics(); list.textContent = '';
  if (all.length && !shown.length) list.appendChild(el('div', 'empty', 'No cat matches that.'));  /* an empty list says nothing, the clinic's or Streetcat's (StreetCat, 6 Nov) */
  for (const x of shown) { const st = x.rec.statement, it = el('div', 'item'), l = el('div', 'cat'), txt = el('div'), face = st.photos.find(p => p.slot === 'face') || st.photos[0];
    const th = el(face ? 'img' : 'div', 'th' + (face ? '' : ' none')); if (face) { th.alt = ''; photoUrl(face.sha256).then(u => { if (u) th.src = u; else th.classList.add('none'); }); } l.appendChild(th);
    txt.appendChild(el('div', 'nm', st.name)); const where = [st.colony, st.chip ? 'chip …' + st.chip.slice(-6) : ''].filter(Boolean).join(' · '); if (where) txt.appendChild(el('div', 'sub2', where)); txt.appendChild(el('div', 'sub2', `${st.procedure} · ${st.date}`)); l.appendChild(txt); it.appendChild(l);
    const s = el('div', 'st'); if (clinic) { const [t, cls] = catShort(x); s.textContent = t; if (cls) s.classList.add(cls); }
    else if (!known.has(lc(st.clinic))) { s.textContent = 'unknown clinic'; s.classList.add('bad'); }
    else { s.textContent = '…'; catPhotos(st).then(n => { const all2 = st.photos.length; s.textContent = n < all2 ? `photos ${n} of ${all2}` : '✓'; s.classList.add(n < all2 ? 'wait' : 'ok'); }); }  /* ✓: signed by a campaign's clinic, every photo here */
    it.appendChild(s); it.onclick = () => { CUR_CAT = x.id; BACK.cat = 'cats'; openTab('cat'); }; list.appendChild(it); } }
const chipText = c => String(c).replace(/(\d{3})(?=\d)/g, '$1 ');
async function renderCat(){ const role = nav.dataset.role, clinic = role === 'clinic', x = catsOf(role).find(y => y.id === CUR_CAT), head = $('c1-head'), pics = $('c1-pics'), dl = $('c1-dl'), acts = $('c1-acts');
  for (const e of [head, pics, dl, acts]) e.textContent = ''; show($('c1-out'), '');
  if (!x) { head.appendChild(el('div', 'mut', 'No cat open.')); return; }
  const st = x.rec.statement; head.style.setProperty('--h', String(st.campaign ? campHue(st.campaign) : HUE.clinic)); head.appendChild(el('div', 'title', st.name)); head.appendChild(el('div', 'mut', [st.colony, st.id].filter(Boolean).join(' · ')));
  // the photos: the face (or the first there is) big, the others under it; a tap on a small one shows it big
  const tiles = [];
  for (const ph of C.CAT_SLOTS.map(s => st.photos.find(p => p.slot === s)).filter(Boolean)) { const b = el('button', tiles.length ? '' : 'big'); b.type = 'button'; const u = await photoUrl(ph.sha256);
    if (u) { const img = el('img'); img.alt = SLOTNAME[ph.slot]; img.src = u; b.appendChild(img); } else { b.classList.add('none'); b.appendChild(el('span', 'wait', clinic ? 'not on this phone' : 'on its way')); }
    b.appendChild(el('span', 'lbl', SLOTNAME[ph.slot])); tiles.push(b); pics.appendChild(b); }
  tiles.forEach(b => { b.onclick = () => { const big = tiles[0]; if (b === big || !b.querySelector('img')) return; const a = [...big.childNodes], c = [...b.childNodes]; a.forEach(n => b.appendChild(n)); c.forEach(n => big.appendChild(n)); for (const t of [big, b]) t.classList.toggle('none', !t.querySelector('img')); }; });
  const camp = clinicCamp(st.clinic), rows = [['Microchip', st.chip ? chipText(st.chip) : 'none noted'], ['Sex', st.sex || '—'], ['Ear tip', st.ear || '—'], ['Coat', st.coat || '—'], ['Procedure', st.procedure], ['Date', st.date], ...(st.notes ? [['Notes', st.notes]] : []),
    ...(st.request ? [['Request', `${st.campaign ? st.campaign.name + ' · ' : ''}${st.request}`]] : []), ['Clinic', ''], ['Signed', when(st.signed)], [clinic ? 'Made' : 'Arrived', when(x.at) + (x.via ? ' · ' + ({ relay: 'by relay', file: 'from a file' }[x.via] || x.via) : '')]];
  for (const [k, v] of rows) { dl.appendChild(el('dt', null, k)); const dd = el('dd'); if (k === 'Clinic') dd.appendChild(withKeys((clinic ? 'this phone · ' : camp ? camp.c.name + ' · ' : '') + abbr(roleOf(st.clinic, 'clinic')))); else dd.textContent = v; dl.appendChild(dd); }
  const v = await C.catCheck(x.rec), n = await catPhotos(st), lines = [], trusted = v.ok && (clinic || knownClinics().has(lc(st.clinic)));
  lines.push(!v.ok ? v.text : clinic ? '✓ Signed with your clinic key.' : !trusted ? '✗ Signed with a clinic key that is in none of your campaigns: ask the clinic before trusting it.' : `✓ Signed by the clinic of ${camp ? camp.c.name : 'your campaigns'}${st.photos.length && n === st.photos.length ? ': every photo is the one it signed' : ''}.`);
  if (st.photos.length && n < st.photos.length) lines.push(`photos: ${n} of ${st.photos.length} here` + (clinic ? '' : ', the rest on their way'));
  if (clinic) lines.push(catSentText(x));
  show($('c1-out'), lines.join('\n')); acts.appendChild(catActs(x)); }
$('ca-q').addEventListener('input', () => renderCats());
$('ca-new').onclick = () => openCatnew(null);
$('ca-check').onclick = async () => { const btn = $('ca-check'); busy(btn, true); $('ca-net').textContent = 'checking the relays…'; try { const res = await scCheck(); setLines($('ca-net'), res.text); } catch (e) { setLines($('ca-net'), '✗ ' + (e.message || e)); } renderCats(); busy(btn, false); };
$('ca-pick').onclick = async () => { try { const p = await C.unpack(await pickFile($('ca-file'))); if (!p || p.t !== 'streetcat.cat') throw Object.assign(new Error('this file is not a cat record'), { byPage: true });
    await takeCat(p, 'file'); show($('ca-out'), `added ${p.statement.name} · ${p.id}`); buzz(); renderCats(); } catch (e) { show($('ca-out'), failText(e), 'bad'); } };
for (const id of ['w-cats', 'h-cats']) $(id).onclick = e => { e.preventDefault(); openTab('cats'); };

// ----- links: #q= a request (for the clinic), #a= an answer (for Streetcat), #h= a donation handed over -----
async function openPayload(text, from){ const p = await C.unpack(text);
  if (p && p.t === 'streetcat.cat') { await takeCat(p, from); CUR_CAT = p.id; if (nav.dataset.role !== 'streetcat') setRole('streetcat'); BACK.cat = 'cats'; openTab('cat'); return p; }  /* a record, from its file */
  if (p && p.t === 'streetcat.request') { const r = await takeRequest(p, from); CUR_CREQ = r.id; openTab('creq'); return r; }
  if (p && p.t === 'streetcat.answer') { const r = await takeAnswer(p, from); CUR_SREQ = r.id; openTab('sreq'); return r; }
  if (p && p.t === 'streetcat.handover') { openTab('shand'); await vShow(String(text)); return p; }
  if (p && p.t === 'streetcat.donation') { const res = await takeDonation(p, from); if ($('scamp').classList.contains('on')) { show($('sc-out'), `added ${res.ref} · ${fmtSat(res.amount)}`, 'ok'); renderScamp(); } return res; }
  if (p && p.t === 'streetcat.handover-receipt') { await donorAck(String(text)); return p; }
  throw new Error('this is not a request, an answer or a donation'); }
async function fromLink(){ if (!/#(q|a|h)=/.test(location.hash)) return; const text = location.hash; history.replaceState(null, '', location.href.split('#')[0]);
  try { await openPayload(text, 'link'); } catch (e) { const role = /#q=/.test(text) ? 'clinic' : 'streetcat'; openTab(role === 'clinic' ? 'work' : 'home'); const t = $(role === 'clinic' ? 'w-net' : 'sc-net'); if (t) setLines(t, '✗ This link cannot be opened: ' + (e.message || e)); } }
window.addEventListener('hashchange', fromLink); fromLink();
// every minute while the app is open (and when the connection comes back): send what waits, and pick up what arrived
function refreshStates(){ const on = id => $(id) && $(id).classList.contains('on'), qr = id => !!$(id).querySelector('.qr');  /* a QR on screen stays until the user leaves it */
  if (on('work')) renderWork(); if (on('creq') && !qr('creq') && (creqs().find(x => x.id === CUR_CREQ) || {}).state !== 'review') renderCreq(); if (on('scamp')) renderScamp(); if (on('skind')) renderKind(); if (on('sreq') && !qr('sreq')) renderSreq(); if (on('shand')) renderShand(false);
  if (on('cats')) renderCats(); if (on('cat')) renderCat(); if (on('catnew') && $('cn-go').classList.contains('fin')) { const x = ccats().slice().sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]; if (x) catNewOut(x); } }
let TICKING = false;
async function tick(){ if (TICKING || !R || !online()) return; TICKING = true; try { await flush(); const r = nav.dataset.role;
    if (r === 'clinic' && heldKeys('clinic').length) { const res = await clinicCheck(); $('w-net').textContent = res.text; await catParts(); await ansParts(); }
    else if (r === 'streetcat' && heldKeys('streetcat').length) { const res = await scCheck(); $('sc-net').textContent = res.text; await reqParts(); }
    refreshStates(); } catch (_) {} TICKING = false; }
setInterval(() => { if (document.visibilityState === 'visible') tick(); }, 60000); addEventListener('online', () => tick()); setTimeout(tick, 1500);
const RENDER = { work: renderWork, creq: renderCreq, csettings: renderSettings, coffline: renderOffline, scamp: renderScamp, skind: renderKind, spick: renderPick, snew: renderSnew, sreq: renderSreq, shand: () => renderShand(true), dhand: renderDhand, dcard: renderDcard, decash: renderEcash, catnew: renderCatnew, cats: renderCats, cat: renderCat, keys: xPrep };
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { const f = RENDER[b.dataset.t]; if (f) Promise.resolve().then(f).catch(() => {}); }));
$('h-hand').onclick = () => openTab('shand');
{ const on = document.querySelector('nav button.on'); if (on && !nav.hidden && RENDER[on.dataset.t]) Promise.resolve().then(RENDER[on.dataset.t]).catch(() => {}); }  /* the screen the page opened on */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});  // the app also opens without a connection (sw.js)
// HOLD TO CONFIRM (StreetCat, 7 Nov: «que la barra hubiese que pulsarla durante… 3 segundos hasta que se cargase entera en naranja… y luego algún
// parpadeo para como de confirmación»; «cuando sea una acción definitiva»): each button that moves money or signs fills from the left in the
// colour of whose screen it is while it is held (index.html); full, it blinks twice, buzzes and acts. Let go before: it empties, nothing
// happens, and it says "hold to confirm". With the keyboard: Space or Enter, held. Pay with Lightning only shows an invoice (the wallet is
// where it is paid), so it stays a tap. vetlock.holdms sets the time in this browser (the tests: 0, an ordinary click).
const HOLD_MS = 2000, HOLD = ['r-go', 'd-go', 'c-go', 'cr-go', 'cr-report', 'cn-go', 's-go', 'sq-go', 'sn-go', 'k-go', 'v-accept'];
const holdMs = () => { const v = ls.get('vetlock.holdms'); return v != null && v !== '' && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : HOLD_MS; };
document.addEventListener('click', e => { const b = e.target && e.target.closest && e.target.closest('button.hold'); if (b && !b._holdOk && holdMs()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);  /* a tap alone does nothing */
function holdable(b){ let t = 0, fired = false; b.classList.add('hold'); b.setAttribute('aria-description', 'press and hold to confirm');
  const hint = () => { if (b._hint) return; const was = b.textContent; b._hint = true; flap(b, 'hold to confirm', { speed: .35 }); setTimeout(() => { b._hint = false; flap(b, was, { speed: .35 }); }, 1400); };
  const start = () => { if (!holdMs() || t || fired || b._hint || b.disabled || b.classList.contains('fin')) return; b.style.setProperty('--hold-ms', holdMs() + 'ms'); b.classList.add('holding'); t = setTimeout(fire, holdMs()); b.dispatchEvent(new Event('holdstart')); };
  const stop = () => { if (!t) return; clearTimeout(t); t = 0; b.classList.remove('holding'); hint(); b.dispatchEvent(new Event('holdstop')); };  /* a screen may follow the hold (the campaign's keys) */
  const fire = () => { t = 0; fired = true; b.classList.remove('holding'); b.classList.add('held'); buzz();
    setTimeout(() => { b.classList.remove('held'); fired = false; b._holdOk = true; try { b.click(); } finally { b._holdOk = false; } }, 720); };  /* two blinks, then it acts */
  b.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button === 0) start(); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  b.addEventListener('contextmenu', e => { if (holdMs()) e.preventDefault(); });  /* a long press opens no menu */
  b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && holdMs()) { e.preventDefault(); if (!e.repeat) start(); } });
  b.addEventListener('keyup', e => { if ((e.key === ' ' || e.key === 'Enter') && holdMs()) { e.preventDefault(); stop(); } }); }
HOLD.forEach(id => { const b = $(id); if (b) holdable(b); });

// COLOURED TEXTS MOVE (StreetCat, 7 Nov 04:55: «los textos de colores de claves y todos los textos de colores que hay, menos los de
// fallos, tienen que animarse cada vez que se interactúa con ellos, cada vez que se pulsa un botón que les afecte, tienen que
// barajarse. Y si no están y aparecen, tienen que aparecer con una animación de typewriter y cursor y con barajeo, como aparecen
// cuando miras el ledger de una campaña»; 04:58: «si tengo que pegar algo, ese algo también cuando se pega se anima con tipeo writer
// y con cursor y con color correspondiente y barajeo»). A coloured text (a key, a key line, a campaign's name in its colour, a cat
// under a campaign, a pot to choose) that was not on the screen types itself in, cursor ahead, keys in their colours; drawn again on
// the same screen, it does not. A tap on a button of a screen, or on a coloured text, shuffles the screen's coloured texts, which land
// again. What is pasted into a field types itself over the field, keys in their roles' colours and the rest in the screen's, and the
// field shows it then. Red (what failed) never moves, nor a text already typing itself (the ledger, the ticker, the donor's list).
// vetlock.anim = 'off' keeps all this still (the suites, as reduced motion does).
const ANIM = () => !REDUCE() && ls.get('vetlock.anim') !== 'off';
const MOVING = '.key, .kline > span, .kk, .camp .title, #d-reqs .title, #d-reqs .cat, .plist .title, .plist .cat, .ptiles .title, .ptypes button[style], .pchoose button.set[style]';
let SEEN = new Set();  // what the screen on show has shown since it opened
const still = e => !e.isConnected || !!e.closest('.bad, [data-typing], textarea, input, .term-text, .ticker, .paste-over') || e.offsetParent === null;
const outer = es => es.filter(e => !es.some(o => o !== e && o.contains(e)));  // a key inside a key line moves with its line
function shuffleIn(e, ms = 650){ if (e._shuf) cancelAnimationFrame(e._shuf); const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), runs = [], HEX = '0123456789abcdef'.split('');
  while (w.nextNode()) { const n = w.currentNode, full = n._full || n.nodeValue; n._full = full; runs.push({ n, full, pool: n.parentNode.closest('.key') ? HEX : FLAP, at: [...full].map(() => ms * (.3 + .7 * Math.random())) }); }
  const t0 = performance.now(), frame = now => { const t = now - t0; let done = true;
    for (const r of runs) r.n.nodeValue = [...r.full].map((ch, i) => { if (t >= r.at[i] || !/[A-Za-z0-9]/.test(ch)) return ch; done = false; return r.pool[Math.random() * r.pool.length | 0]; }).join('');
    if (done) { runs.forEach(r => { delete r.n._full; }); e._shuf = 0; return; } e._shuf = requestAnimationFrame(frame); };
  e._shuf = requestAnimationFrame(frame); }
const shuffleScreen = (sec, but) => { for (const e of outer([...sec.querySelectorAll(MOVING)])) if (!still(e) && !(but && (e.contains(but) || but.contains(e)))) shuffleIn(e); };
new MutationObserver(ms => { if (!ANIM()) return; const added = [];
  for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches(MOVING)) added.push(n); added.push(...n.querySelectorAll(MOVING)); }
  for (const e of outer([...new Set(added)])) { if (still(e)) continue; const k = ((e.closest('section') || {}).id || '') + '|' + e.textContent; if (SEEN.has(k)) continue; SEEN.add(k);
    typeRun(e, e.textContent, { hex: e.classList.contains('key') || e.classList.contains('kk'), think: false, stay: false, dur: Math.min(900, 250 + e.textContent.length * 10) }); } }).observe(document.body, { childList: true, subtree: true });
document.querySelector('nav').addEventListener('click', () => { SEEN = new Set(); }, true);  /* a screen that opens shows its texts anew */
document.addEventListener('click', ev => { if (!ANIM()) return; const t = ev.target && ev.target.closest ? ev.target : null; if (!t || t.closest('nav, #hd-roles, header')) return;
  const b = t.closest('button, a'), own = t.closest(MOVING), sec = t.closest('section') || document.querySelector('section.on'); if (!sec || (!b && !own)) return;
  setTimeout(() => { if (b) shuffleScreen(sec, b); else if (!still(own)) shuffleIn(own); }, 0); });  /* after the tap has done its work: what it drew anew types in */
document.addEventListener('paste', ev => { if (!ANIM()) return; const f = ev.target; if (!f || !/^(INPUT|TEXTAREA)$/.test(f.tagName) || /^(password|number|date|file)$/.test(f.type)) return;
  const text = ((ev.clipboardData && ev.clipboardData.getData('text')) || '').trim(); if (text) setTimeout(() => pasteShow(f, text), 0); }, true);
function pasteShow(f, text){ const r = f.getBoundingClientRect(); if (!r.width || !r.height) return; const cs = getComputedStyle(f), o = document.createElement('div'), body = document.createElement('span');
  o.className = 'paste-over'; Object.assign(o.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', padding: cs.padding, fontSize: cs.fontSize, lineHeight: cs.lineHeight });
  o.style.setProperty('--h', String(HUE[document.body.dataset.role] || 55)); o.appendChild(body); document.body.appendChild(o); const gone = () => o.remove(); addEventListener('scroll', gone, { once: true });
  typeKeys(body, text, { follow: true, think: false, dur: Math.min(1600, 300 + text.length * 3), done: () => setTimeout(gone, 450) }); }
window.__vetlock = { campHue, newCampHue, ledgerFor, openTab, setRole, parseCampaign, openCampaign, lockInfo, key, heldKeys, pubOf, donorKeys, pendings, flights, releasedList, mintCheck,
  receiptOf, melts, wreqs, wCheck, scanFeed: t => SCAN && SCAN.feed(t), scanEnd: () => SCAN && SCAN.end(), frames: id => ($(id) && $(id)._frames) || [], tick, flush, creqs, sreqs, vrecs, openPayload, relays, outbox: () => OUTBOX ? OUTBOX.list() : [],
  ccats, scats, openCatnew, photoHere, catParts, scCheck, catCur: id => { CUR_CAT = id; }, shrinkPhoto, keepPhoto, saveCcat, cnShots: () => CN.shots, likeCheck, holdMs, HOLD };
{ const s0 = navState(); navStack.push(s0); try { history.replaceState({ ...(history.state || {}), ...s0, sc: 1 }, ''); } catch (_) {} navReady = true; }  // the first step of the app's history: the screen it opened on
})();
