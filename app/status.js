// The status page's code (app/status.html). In a file of its own for the browser security policy (vercel.json).
// Needs cashu-bundle.js, core.js, nostr-bundle.js and relay.js first.
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

const norm = u => String(u || '').trim().replace(/\/+$/, '');
const fmtDate = t => new Date(t * 1000).toISOString().slice(0, 10);
const short = k => String(k).slice(0, 10) + '…' + String(k).slice(-6);
const amt = a => (a && typeof a === 'object' && typeof a.toNumber === 'function') ? a.toNumber() : Number(a);  // cashu-ts may hand back Amount objects
const sum = ps => ps.reduce((s, p) => s + amt(p.amount), 0);
const enc = new TextEncoder();
const yOf = secret => cashu.hashToCurve(enc.encode(secret)).toHex(true);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const show = (e, text, cls) => { text = String(text == null ? '' : text); cls = cls || (BAD_TEXT.test(text) ? 'bad' : ''); e.className = 'out' + (cls ? ' ' + cls : ''); if (cls === 'bad') e.textContent = text; else setLines(e, text); };  // red when it is an error; otherwise its error lines
const FLAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789§¤◊†'.split(''), REDUCE = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function flap(el, text, { speed = 1, hex = false, follow = null } = {}){ if (!el) return; if (el._flap) cancelAnimationFrame(el._flap); if (REDUCE()) { el.textContent = text; return; }
  const pool = hex ? '0123456789abcdef'.split('') : FLAP, chars = text.split(''), params = chars.map(ch => ({ on: /[A-Za-z0-9]/.test(ch), at: (480 + Math.random() * 720) * speed, every: (45 + Math.random() * 55) * speed, step: -1, g: ch })), start = performance.now();
  const frame = now => { const t = now - start; let done = true; el.textContent = chars.map((ch, i) => { const p = params[i]; if (!p.on || t >= p.at) return ch; done = false; const s = Math.floor(t / p.every); if (s !== p.step) { p.step = s; p.g = pool[Math.floor(Math.random() * pool.length)]; } return p.g; }).join('');
    if (follow) follow.scrollTop = follow.scrollHeight * Math.min(1, t / (1200 * speed)); if (done) { el.textContent = text; el._flap = null; return; } el._flap = requestAnimationFrame(frame); }; el._flap = requestAnimationFrame(frame); }
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
  if (REDUCE()) { if (done) done(); return; }
  const HEX = '0123456789abcdef'.split(''), runs = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) { const n = walker.currentNode; runs.push({ n, full: n.nodeValue, pool: hex || n.parentNode.closest('.key') ? HEX : FLAP }); }
  const seq = []; runs.forEach((r, ri) => { for (let i = 0; i < r.full.length; i++) seq.push(ri); }); const N = seq.length; if (!N) { if (done) done(); return; }
  const D = dur || Math.min(2200, 450 + N * 5), stops = new Map();
  if (think) { for (let i = 0, lines = 0; i < N && lines < 4; i++) if (text[i] === '\n') { stops.set(i + 1, 90 + Math.random() * 140); lines++; }
    for (let k = 0; k < (N > 400 ? 2 : N > 30 ? 1 : 0); k++) stops.set(Math.floor(N * (.25 + .5 * Math.random())), 260 + Math.random() * 320); }
  const cur = document.createElement('b'); cur.className = 'cur'; cur.setAttribute('aria-hidden', 'true'); runs.forEach(r => { r.n.nodeValue = ''; });
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
    if (settle > LAG) { runs.forEach(r => { r.n.nodeValue = r.full; }); cur.classList.add('think'); raf = 0; el._type = () => cur.remove(); if (done) done(); return; }
    raf = requestAnimationFrame(frame); };
  raf = requestAnimationFrame(frame);
  el._type = () => { if (raf) cancelAnimationFrame(raf); raf = 0; runs.forEach(r => { r.n.nodeValue = r.full; }); cur.remove(); }; }
// a button flips its own label without moving. A copy button flips to "copied" and stays there, filled white; a passing word flips back to it
function flapLabel(b, text, ms = 1600){ const base = b.dataset.label || (b.dataset.label = b.textContent); b.style.minWidth = `calc(${Math.max(base.length, text.length)}ch + 28px)`; flap(b, text, { speed: .35 }); clearTimeout(b._back); if (ms) b._back = setTimeout(() => flap(b, b.dataset.done || base, { speed: .35 }), ms); }
function doneLabel(b, text = 'copied'){ const base = b.dataset.label || (b.dataset.label = b.textContent); clearTimeout(b._back); b.dataset.done = text; b.classList.add('done'); flap(b, text, { speed: .35 }); }
const copyText = async text => { try { await Promise.race([navigator.clipboard.writeText(text), new Promise((_, no) => setTimeout(no, 3000))]); return true; } catch (_) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} t.remove(); return ok; } };
// campaign colours: every campaign its own hue, none the pages already use (the keys' orange, blue and green, the green of ✓, the
// red of ✗, bitcoin's orange): pink, yellow, cyan and violet first, then four more. A new campaign takes the first hue free in its
// maker's browser and carries it in its link and ledger, so it looks the same on every page and device. An older campaign without one
// gets the first free hue here, in the order this browser met it (the campaigns it made, then the donations it made), and keeps it.
// The same code is in index.html; both pages share what this browser has assigned.
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
knownCamps().forEach(campHue);
// a text in the terminal, typed in at the one code size every page uses. `texts` may give a denser version for when the first does
// not fit; a text that still does not fit scrolls inside the terminal, the cursor leading
function termShow(texts, hue, { ms = 0, hint = 'tap to close', keys = true } = {}){ const term = $('term'); term.querySelectorAll('.term-text').forEach(e => e.remove());
  // keys: false for texts whose codes look like keys but are not (proof Ys): they are not painted in the keys' colours
  const o = el('div', 'term-text' + (keys ? '' : ' nokey')); o.style.setProperty('--h', String(hue)); const body = el('span'); o.appendChild(body); if (hint) o.appendChild(el('small', null, hint)); term.appendChild(o);
  const close = () => { if (o._t) clearTimeout(o._t); if (body._type) body._type(); o.remove(); }; o.onclick = e => { e.stopPropagation(); close(); }; o.close = close;
  const fits = () => body.scrollHeight <= body.clientHeight + 1;
  const place = () => { const list = [].concat(texts); let shown = list[list.length - 1];
    for (const t of list) { body.textContent = t; if (fits()) { shown = t; break; } }
    typeKeys(body, shown, { keys, follow: true }); };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(place);
  if (ms) o._t = setTimeout(close, ms); return o; }
// what the terminal shows of a ledger: everything but the tokens' bodies (each one is a long code; the amount says which it is)
const abbrKey = k => String(k).slice(0, 10) + '…';
const abbrTok = t => { let a = 0; try { a = Number(cashu.getTokenMetadata(t).amount) || 0; } catch (_) {} return String(t).slice(0, 16) + '…' + (a ? ` ${a} sat` : ''); };
const ledgerView = L => ({ campaign: { ...L.campaign, streetcat: abbrKey(L.campaign.streetcat), clinic: abbrKey(L.campaign.clinic) }, ...(L.clinicKeySource ? { clinicKeySource: L.clinicKeySource } : {}), donations: L.donations.map(abbrTok) });
const ledgerTexts = v => [JSON.stringify(v, null, 1), JSON.stringify(v)];
const WALLETS = {}; async function wallet(mint){ mint = norm(mint); if (!WALLETS[mint]) { const w = new cashu.Wallet(mint); await w.loadMint(); WALLETS[mint] = w; } return WALLETS[mint]; }

// ledger: { campaign: {name, op, mint, streetcat, clinic, deadline}, clinicKeySource, donations: ["cashuB…", …] }
function parseLedger(j){ if (!j || typeof j !== 'object') throw new Error('not a ledger'); const c = j.campaign; if (!c) throw new Error('the ledger has no campaign');
  for (const k of ['name', 'mint', 'streetcat', 'clinic', 'deadline']) if (!c[k]) throw new Error('campaign is missing ' + k);
  const donations = (Array.isArray(j.donations) ? j.donations : []).map(d => typeof d === 'string' ? d : d && d.token).filter(Boolean).map(s => String(s).trim());
  // version 2 (core.js) also says, donation by donation (its DON- code), what each part paid for, with the clinic's signed declarations
  const v2 = j.v === 2, entries = v2 && Array.isArray(j.entries) ? j.entries.filter(e => e && /^DON-[0-9A-F]{8}$/.test(String(e.ref))) : [], certificates = v2 && Array.isArray(j.certificates) ? j.certificates.filter(x => x && x.statement) : [];
  return { campaign: { ...c, mint: norm(c.mint), deadline: Number(c.deadline) }, clinicKeySource: String(j.clinicKeySource || ''), donations, entries, certificates }; }
async function loadLedger(src){ src = (src || '').trim(); if (!src) throw new Error('paste the ledger link or JSON');
  if (src.startsWith('{')) return parseLedger(JSON.parse(src));
  const res = await fetch(src, { cache: 'no-store' }); if (!res.ok) throw new Error('could not load ' + src + ' (HTTP ' + res.status + ')'); return parseLedger(await res.json()); }

// the vet's receipt behind a declaration: its fingerprint (SHA-256), and a file checked against it here, in this browser (nothing is sent)
function evidenceLine(e){ const d = el('div', 'mut code ev'); if (!e || !/^[0-9a-f]{64}$/.test(String(e.sha256 || ''))) { d.textContent = 'no receipt fingerprint'; return d; }
  d.appendChild(document.createTextNode(`${e.kind === 'photo' ? 'photo' : 'invoice'} fingerprint ${e.sha256.slice(0, 16)}… · `)); const a = el('a', null, 'check a file'), res = el('span'); a.href = '#';
  a.onclick = ev => { ev.preventDefault(); const i = document.createElement('input'); i.type = 'file'; i.hidden = true; document.body.appendChild(i); i.onchange = async () => { const f = i.files && i.files[0]; i.remove(); if (!f) return; const h = await scCore.sha256hex(new Uint8Array(await f.arrayBuffer()));
    res.textContent = h === e.sha256 ? ` ✓ ${f.name} is the file the clinic declared` : ` ✗ ${f.name} is not the file the clinic declared (or it was changed)`; res.className = h === e.sha256 ? 'okc' : 'badc'; }; i.click(); };
  d.appendChild(a); d.appendChild(res); return d; }

// the spending conditions written inside one proof's secret (NUT-10 / NUT-11)
function lockOf(p){ let s; try { s = JSON.parse(p.secret); } catch (_) { return null; } if (!Array.isArray(s) || s[0] !== 'P2PK' || !s[1]) return null; const d = s[1];
  const tags = Object.fromEntries((d.tags || []).map(t => [t[0], t.slice(1)]));
  return { pubkeys: [d.data].concat(tags.pubkeys || []), nsigs: Number((tags.n_sigs || ['1'])[0]), refund: tags.refund || [], nsigsRefund: Number((tags.n_sigs_refund || ['1'])[0]), locktime: Number((tags.locktime || ['0'])[0]), sigflag: (tags.sigflag || ['SIG_INPUTS'])[0] }; }
function lockProblem(l, c){ if (!l) return 'not a P2PK lock';
  const want = [c.streetcat, c.clinic].map(k => k.toLowerCase()).sort().join(), got = l.pubkeys.map(k => String(k).toLowerCase()).sort().join();
  if (got !== want) return 'locked to other keys than Streetcat + the clinic'; if (l.nsigs !== 2) return `needs ${l.nsigs} signature(s), not 2`;
  if (l.locktime !== c.deadline) return 'its deadline is not the campaign deadline'; if (!l.refund.length) return 'no refund key: anyone could take it after the deadline';
  if (l.nsigsRefund !== 1) return 'unusual refund rule'; if (l.sigflag !== 'SIG_INPUTS') return 'unusual signature rule'; return ''; }  // as core.js lockProblem

// one donation token, checked against the mint
async function checkToken(c, token){
  const r = { token, amount: 0, status: '', problems: [], ys: [], detail: '' };
  let meta; try { meta = cashu.getTokenMetadata(token); } catch (_) { r.status = 'UNREADABLE'; r.problems.push('cannot decode this token'); return r; }
  if (norm(meta.mint) !== c.mint) { r.status = 'OTHER MINT'; r.problems.push('this token is from ' + meta.mint); return r; }
  const w = await wallet(c.mint); const dec = w.decodeToken(token); r.amount = sum(dec.proofs);
  r.ys = dec.proofs.map(p => yOf(p.secret)); r.ref = await scCore.donRef(r.ys);
  // the mint's state of every proof; when part of a proof was released, the rest went back under the same lock in proofs derived from
  // it (core.js), which the mint hands back (NUT-09): they are followed too, so a split donation adds up from the mint alone
  const now = Date.now() / 1000, per = [], trace = await scCore.traceDonation(w, dec.proofs);
  for (const x of trace) {
    const p = x.proof, st = { state: x.state, witness: x.witness }, l = lockOf(p), bad = lockProblem(l, c);
    let issued = false; try { issued = cashu.hasValidDleq(p, await w.keyChain.ensureKeysetKeys(p.id)); } catch (_) { issued = false; }
    let s;
    if (st.state === 'UNSPENT') s = now <= c.deadline ? 'LOCKED' : 'REFUNDABLE';
    else if (st.state === 'PENDING') s = 'IN FLIGHT';
    else if (st.state !== 'SPENT') s = 'UNKNOWN';
    else if (!st.witness) s = 'SPENT · NO WITNESS';
    else { const pw = { ...p, witness: st.witness }; const byClinic = cashu.hasP2PKSignedProof(c.clinic, pw), byStreetcat = cashu.hasP2PKSignedProof(c.streetcat, pw), byDonor = !!l && l.refund.some(k => cashu.hasP2PKSignedProof(k, pw));
      s = byClinic && byStreetcat ? 'RELEASED' : byDonor ? 'REFUNDED' : 'SPENT · OTHER KEYS'; }
    per.push({ y: yOf(p.secret).toLowerCase(), amount: amt(p.amount) - (s === 'RELEASED' ? x.putBack : 0), put: x.depth > 0, s, issued, bad, raw: st.state });  /* released: what did not go back */
  }
  r.per = per; return verdict(r, per);
}
// a token's verdict from the verdicts of its proofs, so that it can also be judged on part of them (the ones not listed before)
function verdict(r, per){ r.amount = per.reduce((s, x) => s + x.amount, 0); r.problems = []; r.counted = per;
  const states = [...new Set(per.map(x => x.s))]; r.status = states.length === 1 ? states[0] : 'MIXED';
  const lockBad = [...new Set(per.map(x => x.bad).filter(Boolean))]; if (lockBad.length) r.problems.push('lock: ' + lockBad.join('; '));
  if (per.some(x => !x.issued)) r.problems.push('not proven to be issued by the mint (no valid DLEQ proof)');
  if (r.problems.length) { r.problems.push('the mint says ' + [...new Set(per.map(x => x.raw))].join(', ') + (per.some(x => x.raw === 'UNSPENT') ? ', which it also says of ecash it never issued' : '')); r.status = 'NOT COUNTED'; }
  r.detail = `${per.length} proof${per.length === 1 ? '' : 's'} · id ${per[0].y.slice(2, 12)}`; return r; }
// a proof counts once, however many entries list it: an entry whose proofs were all listed before is left out, and one that shares
// some of them is judged on its new proofs only (a certified copy of a donation has the same proofs as the donation)
function dedupe(r, seen){ if (!r.per) { if (seen.has(r.token)) return false; seen.add(r.token); return true; }
  const fresh = r.per.filter(x => !seen.has(x.y)); if (!fresh.length) return false;
  if (fresh.length < r.per.length) { verdict(r, fresh); r.note = `${r.per.length - fresh.length} of its ${r.per.length} proofs are counted in an earlier entry`; }
  fresh.forEach(x => seen.add(x.y)); return true; }

const MEANING = { LOCKED: 'waiting for the clinic', REFUNDABLE: 'deadline passed: the donor can take it back', RELEASED: 'signed by the clinic and Streetcat', REFUNDED: 'taken back by the donor', 'IN FLIGHT': 'being spent at the mint right now', 'SPENT · NO WITNESS': 'spent, but the mint did not say who signed', 'SPENT · OTHER KEYS': 'spent with signatures that are not this campaign\'s', MIXED: 'its parts are in different states', UNKNOWN: 'the mint gave no state', UNREADABLE: '', 'OTHER MINT': '' };
const GOOD = new Set(['LOCKED', 'REFUNDABLE', 'RELEASED', 'REFUNDED']);

function renderCampaign(L){ const c = L.campaign; roleOf(c.streetcat, 'streetcat'); roleOf(c.clinic, 'clinic'); $('camp').hidden = false; const hue = campHue(c); document.body.style.setProperty('--ch', String(hue));
  const term = $('term'); term.querySelectorAll('.summary').forEach(e => e.remove()); const s = el('div', 'summary'); s.style.setProperty('--h', String(hue));
  s.appendChild(el('div', 'big', c.name)); s.appendChild(el('div', 'mut', `${c.op || 'operation'} · refund after ${fmtDate(c.deadline)}`)); s.appendChild(el('div', 'mut keys', `clinic ${abbrKey(c.clinic)}\nStreetcat ${abbrKey(c.streetcat)}`));  /* one key per line: at the code size they do not share one */ s.appendChild(el('div', 'mut code', c.mint.replace(/^https?:\/\//, '')));
  const tot = el('div', 'tot'); tot.id = 'tot'; s.appendChild(tot); term.appendChild(s);
  term.onclick = () => { if (document.body.classList.contains('loaded') && !term.querySelector('.term-text')) termShow(ledgerTexts(ledgerView(L)), hue); };  // the ledger again
  return termShow(ledgerTexts(ledgerView(L)), hue); }

// a donation's parts, by state: "1448 sat released · 600 sat locked (put back)"
const byState = per => { const g = new Map(); for (const x of per) { const k = x.s + (x.put ? ' (put back)' : ''); g.set(k, (g.get(k) || 0) + x.amount); } return [...g].map(([k, v]) => `${v} sat ${k.toLowerCase()}`).join(' · '); };
const rowOk = r => !r.problems.length && !!r.counted && r.counted.length > 0 && r.counted.every(x => GOOD.has(x.s));  // a donation partly released and partly put back or taken back counts too
function rowFor(r, L){ const ok = rowOk(r);
  const row = el('div', 'row'); row.dataset.status = r.status; row.dataset.amount = r.amount; row.dataset.ok = ok ? '1' : '0'; if (r.ref) row.dataset.ref = r.ref;
  const h = el('div', 'row-h'); h.appendChild(el('span', null, r.amount ? `${r.amount} sat` : '—')); h.appendChild(el('span', 'st ' + (ok ? 'ok' : 'bad'), r.status)); row.appendChild(h);
  const what = [MEANING[r.status], r.problems.length ? '' : `lock ✓ · mint ✓ · ${r.detail}`].filter(Boolean).join(' · '); if (what) { const d = el('div', ok ? 'mut' : 'mut bad'), m = what.match(/^(.*?)(id [0-9a-f]+)$/); if (m) { d.appendChild(document.createTextNode(m[1])); d.appendChild(el('span', 'code', m[2])); } else d.textContent = what; if (r.ref) { d.appendChild(document.createTextNode(' · ')); const rf = el('span', 'code', r.ref); rf.style.whiteSpace = 'nowrap'; d.appendChild(rf); } row.appendChild(d); }  // the proof id and the donation's code are code
  if (r.counted && (r.status === 'MIXED' || r.counted.some(x => x.put))) row.appendChild(el('div', 'mut', byState(r.counted)));
  const entry = L && L.entries && L.entries.find(e => e.ref === r.ref);
  for (const p of (entry && entry.parts) || []) { const st = L.declared && L.declared.get(p.request + '|' + r.ref); row.appendChild(el('div', st ? 'mut' : 'mut bad', `→ ${p.amount} sat: ${p.patient} · ${p.procedure} · ${p.date}` + (st ? ' · ✓ declared by the clinic' : ' · the clinic\'s declaration is not in the ledger')));
    if (st) row.appendChild(evidenceLine(st.evidence)); }
  const released = releasedOf(r), declared = declaredOf(L, r.ref), said = ((entry && entry.parts) || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  if (released > declared) row.appendChild(el('div', 'mut bad', unaccounted(released, declared, said)));  /* what went back under the lock is not counted as released (traceDonation) */
  else if (entry && entry.parts && entry.parts.length && released > said) row.appendChild(el('div', 'mut bad', `✗ the mint shows ${released} sat released from it, but the ledger says ${said} sat went to procedures`));  /* declared, but the ledger's parts say less */
  if (r.note) row.appendChild(el('div', 'mut bad', r.note));  /* a duplicate */
  for (const pr of r.problems) row.appendChild(el('div', 'mut bad', '✗ ' + pr));
  return { row, ok }; }

// what left a donation's lock with the clinic's and Streetcat's signatures (the mint says it; what went back under the lock is not in it),
// and what the clinic declared of it, in the declarations the ledger carries that are signed with its statement key (core.js)
const releasedOf = r => (r.counted || []).filter(x => x.s === 'RELEASED').reduce((s, x) => s + x.amount, 0);
const declaredOf = (L, ref) => { const byReq = new Map(); for (const st of (L && L.declared ? L.declared.values() : [])) byReq.set(st.request, st); let n = 0;  /* each request once */
  for (const st of byReq.values()) for (const k of st.contributions || []) if (k.ref === ref) n += Number(k.release) || 0; return n; };
const unaccounted = (released, declared, said) => `✗ the mint shows ${released} sat released from it, but ` + (declared ? `the clinic declared ${declared} sat of it` : said ? `the ledger's ${said} sat for procedures carry no declaration signed by the clinic` : 'the ledger has no declaration by the clinic for it') + `: ${released - declared} sat not accounted for`;
function renderList(c, results, L){ const tot = { LOCKED: [0, 0], RELEASED: [0, 0], REFUNDED: [0, 0], REFUNDABLE: [0, 0] }; let notCounted = 0;
  const list = $('list'); list.textContent = ''; list.hidden = false;
  if (!results.length) list.appendChild(el('div', 'mut', 'No donations listed yet.'));
  for (const r of results) { const { row, ok } = rowFor(r, L); if (ok) { const states = new Set(); for (const x of r.counted) { tot[x.s][0] += x.amount; states.add(x.s); } for (const s of states) tot[s][1]++; } else notCounted++; list.appendChild(row); }  /* counted proof by proof */
  const t = $('tot'); t.textContent = ''; for (const [k, [sats, n]] of Object.entries(tot)) { const box = el('div'); box.appendChild(el('b', null, `${sats} sat`)); box.appendChild(el('span', null, `${k.toLowerCase()} · ${n}`)); t.appendChild(box); }
  $('tot-note').hidden = !notCounted; $('tot-note').textContent = ''; if (notCounted) addNote(`${notCounted} listed token(s) not counted: see the ✗ below.`, true);
  const loose = results.reduce((s, r) => s + Math.max(0, releasedOf(r) - declaredOf(L, r.ref)), 0); if (loose) addNote(`${loose} sat released without the clinic's declaration for it: see the ✗ below.`, true); }
// a note under the totals; a warning one is red
function addNote(t, bad = false){ const n = $('tot-note'); n.hidden = false; if (n.textContent) n.appendChild(document.createTextNode(' · ')); n.appendChild(el('span', bad ? 'bad' : null, t)); }

let RAW = null;
function renderRaw(c, results){ const ys = [...new Set(results.flatMap(r => r.ys))]; const curl = `curl -s -X POST ${c.mint}/v1/checkstate -H 'Content-Type: application/json' -d '${JSON.stringify({ Ys: ys })}'`;
  RAW = { curl, text: `Ask the mint yourself (NUT-07). Copied:\n\n${curl}\n\nA Y identifies a proof without revealing anything that could spend it. SPENT with the clinic's and Streetcat's signatures in its witness: released. With the donor's refund key: refunded. UNSPENT alone proves nothing, so each proof's DLEQ (NUT-12) is checked first against the mint's keys.` };
  $('tools').hidden = false; }
$('raw-open').onclick = async () => { if (!RAW) return; const b = $('raw-open'), ok = await copyText(RAW.curl); if (ok) doneLabel(b, 'command copied'); termShow(RAW.text.replace(' Copied:', ok ? ' Copied:' : ''), Number(getComputedStyle(document.body).getPropertyValue('--ch')) || 300, { keys: false }); };
$('m-open').onclick = () => { const on = document.body.classList.toggle('lookup'); flapLabel($('m-open'), on ? 'back to the list' : 'is mine listed?', 0); if (on) setTimeout(() => $('m-tok').focus(), 50); };

let LAST = null;
// the campaign a ledger names: signed with Streetcat's published key, or not to be trusted (a ledger from Nostr, n=, is also checked
// against the campaign's ledger key, relay.js)
const HONEST = 'Every state comes from the mint, not from Streetcat; what the sats paid for comes from Streetcat\'s ledger, and counts only where the clinic signed it.';
async function campaignTrust(c){ let st = 'broken'; try { st = await scCore.campaignSig(c); } catch (_) {}
  if (!scCore.published(c.streetcat)) return '✗ This campaign is not from Streetcat\'s published key. Do not trust its ledger.';
  if (st === 'broken') return '✗ The campaign\'s signature does not match: it was changed after Streetcat made it. Do not trust this ledger.';
  return st === 'signed' ? '✓ campaign signed by Streetcat' : 'This campaign is not signed: trust this ledger only if it came from Streetcat itself.'; }
async function run(){ const btn = $('l-go'); btn.disabled = true; show($('l-out'), 'checking at the mint…');
  let view = null; const t0 = Date.now();
  try { const L = await loadLedger($('l-src').value); view = renderCampaign(L); const seen = new Set(), results = [];
    for (const t of L.donations) { const r = await checkToken(L.campaign, t); if (dedupe(r, seen)) results.push(r); }
    L.declared = new Map(); for (const x of L.certificates) if (await scCore.certificateOk(L.campaign, x)) for (const k of x.statement.contributions || []) L.declared.set(x.statement.request + '|' + k.ref, x.statement);  // signed with the clinic's statement key
    LAST = { L, results, ys: new Set(results.flatMap(r => r.ys.map(y => y.toLowerCase()))) }; renderList(L.campaign, results, L); renderRaw(L.campaign, results); document.body.classList.add('loaded'); window.scrollTo(0, 0);
    setTimeout(() => view && view.close(), Math.max(0, 4400 - (Date.now() - t0)));  // the ledger stays while the mint is asked, then the totals show
    const trust = await campaignTrust(L.campaign); setLines($('c-trust'), trust + '\n' + HONEST);  /* under the campaign, where it stays in view */
    show($('l-out'), `Checked ${results.length} donation${results.length === 1 ? '' : 's'} at ${new Date().toLocaleTimeString()}. ${HONEST}\n` + trust, 'ok'); addNote(`Checked at the mint ${new Date().toLocaleTimeString()}`);
  } catch (e) { if (view) view.close(); $('term').querySelectorAll('.summary').forEach(x => x.remove()); $('camp').hidden = true; show($('l-out'), 'Failed: ' + (e.message || e), 'bad'); }
  btn.disabled = false; }
$('l-go').onclick = run;
// pasting a ledger checks it at once; a link typed by hand waits for the Check button
$('l-src').addEventListener('input', e => { const v = $('l-src').value.trim(); $('l-go').hidden = !v; let json = false; if (v.startsWith('{')) { try { JSON.parse(v); json = true; } catch (_) {} } if (v && (json || e.inputType === 'insertFromPaste')) run(); });

$('m-go').onclick = async () => { const btn = $('m-go'); btn.disabled = true; show($('m-out'), 'checking at the mint…'); try { if (!LAST) throw new Error('check a campaign first');
    let t = $('m-tok').value.trim();
    if (/^DON-[0-9A-F]{8}$/i.test(t)) { const ref = t.toUpperCase(), r = LAST.results.find(x => x.ref === ref);  /* a donation's code (on its receipt or card) */
      show($('m-out'), r ? `LISTED ✓ · ${ref} · ${r.amount} sat · ${r.status}` + (r.counted && r.counted.length > 1 ? '\n' + byState(r.counted) : '') + ((LAST.L.entries.find(e => e.ref === ref) || {}).parts || []).map(p => `\n→ ${p.amount} sat: ${p.patient} · ${p.procedure} · ${p.date}`).join('') : `NOT LISTED ✗ · ${ref}\nThis ledger has no donation with that code.`, r && rowOk(r) ? 'ok' : 'bad'); btn.disabled = false; return; }
    if (t.startsWith('{')) { const j = JSON.parse(t); t = String(j.lockedToken || (j.donation && j.donation.token) || ''); }  /* a receipt, of either version: its token only */ if (!t.startsWith('cashu')) throw new Error('paste a cashuB… token, your receipt, or the donation\'s code (DON-…)');
    const r = await checkToken(LAST.L.campaign, t); const listed = r.ys.length && r.ys.every(y => LAST.ys.has(y.toLowerCase()));
    const head = listed ? `LISTED ✓ · ${r.amount} sat · ${r.status}` : `NOT LISTED ✗ · ${r.amount} sat · ${r.status}\nAsk Streetcat to add it. Your sats are safe either way: nobody can spend them without the clinic, and after the deadline you can take them back.`;
    show($('m-out'), head + (r.problems.length ? '\n✗ ' + r.problems.join('\n✗ ') : ''), listed && !r.problems.length ? 'ok' : 'bad');
  } catch (e) { show($('m-out'), 'Failed: ' + (e.message || e), 'bad'); } btn.disabled = false; };

// donations made from this browser: the donation app at this address keeps a copy of each locked token it made (never its refund key here)
function savedTokens(){ let a; try { a = JSON.parse(localStorage.getItem('vetlock.donor.keys') || '[]'); } catch (_) { return []; }
  return (Array.isArray(a) ? a : []).filter(k => k && typeof k.lockedToken === 'string' && k.lockedToken.startsWith('cashu')).map(k => ({ token: k.lockedToken, name: typeof k.campaign === 'string' ? k.campaign : '', hue: k.hue })); }
async function campaignOf(t){ const meta = cashu.getTokenMetadata(t.token), w = await wallet(meta.mint), dec = w.decodeToken(t.token), l = lockOf(dec.proofs[0]);
  if (!l || l.pubkeys.length !== 2) return null; const memo = String(dec.memo || ''), name = t.name || memo.split(' ')[0] || 'donation';
  const op = memo.startsWith(name + ' ') ? memo.slice(name.length + 1).split(' — ')[0].trim() : '';
  return { name, op, mint: norm(meta.mint), streetcat: String(l.pubkeys[0]).toLowerCase(), clinic: String(l.pubkeys[1]).toLowerCase(), deadline: l.locktime, hue: t.hue }; }  // the app writes Streetcat's key first
let HERE = [];
const hereDetails = (c, r) => [`${c.name}${c.op ? ' · ' + c.op : ''}`, `${r.amount} sat · ${r.status}`, MEANING[r.status] || '', r.problems.length ? r.problems.map(x => '✗ ' + x).join('\n') : 'lock ✓ · issued by the mint ✓', r.detail, `refund after ${fmtDate(c.deadline)}`, `mint ${c.mint.replace(/^https?:\/\//, '')}`, `Streetcat ${abbrKey(c.streetcat)}`, `clinic ${abbrKey(c.clinic)}`].filter(Boolean).join('\n');
async function runHere(){ const saved = savedTokens(); if (!saved.length) return; $('here').hidden = false;
  const groups = new Map(), seen = new Set(), errors = []; let n = 0; $('here-list').textContent = '';
  for (const t of saved) { try { const c = await campaignOf(t); if (!c) continue; const r = await checkToken(c, t.token); if (!dedupe(r, seen)) continue; n++;
      const g = JSON.stringify([c.name, c.mint, c.deadline, c.streetcat, c.clinic]); if (!groups.has(g)) groups.set(g, { c, results: [] }); groups.get(g).results.push(r);
    } catch (e) { errors.push(`${t.name || 'a donation'}: could not check it (${e.message || e})`); } }
  const list = $('here-list'); list.textContent = '';
  for (const { c, results } of groups.values()) { roleOf(c.streetcat, 'streetcat'); roleOf(c.clinic, 'clinic'); const hue = campHue(c);
    for (const r of results) { const ok = rowOk(r); const row = el('div', 'hrow'); row.dataset.campaign = c.name; row.dataset.status = r.status; row.dataset.amount = r.amount;
      const nm = el('span'), name = el('span', null, c.name); name.style.color = `oklch(.82 .16 ${hue}deg)`; nm.appendChild(name); nm.appendChild(document.createTextNode(` · ${r.amount} sat`)); row.appendChild(nm); row.appendChild(el('span', 'st ' + (ok ? 'ok' : 'bad'), r.status));
      row.onclick = () => termShow(hereDetails(c, r), hue); list.appendChild(row); } }
  HERE = [...groups.values()].map(({ c, results }) => ({ campaign: c, clinicKeySource: '', donations: results.map(r => r.token) }));
  show($('here-out'), `Checked ${n} donation${n === 1 ? '' : 's'} at ${new Date().toLocaleTimeString()}. Every state comes from the mint.` + (errors.length ? '\n✗ ' + errors.join('\n✗ ') : ''), errors.length ? 'bad' : 'ok'); }
$('here-copy').onclick = async () => { const text = JSON.stringify(HERE, null, 1), b = $('here-copy'), ok = await copyText(text);
  if (ok) doneLabel(b); else flapLabel(b, 'select it', 2500);
  termShow(ledgerTexts(HERE.map(ledgerView)), HERE.length ? campHue(HERE[0].campaign) : CAMP_HUES[0]);
  show($('here-out'), (ok ? 'Copied' : 'Select and copy') + '\n' + text, 'ok'); $('here-out').classList.toggle('show', !ok); };

// the header's roles open the app as that role: the app starts in the role kept under this key
document.querySelectorAll('.sc-roles a[data-r]').forEach(a => a.addEventListener('click', () => { try { localStorage.setItem('vetlock.role', a.dataset.r); } catch (_) {} }));
const qs = new URLSearchParams(location.search), q = qs.get('l'), nid = qs.get('n'), deep = (/^#(DON-[0-9A-F]{8})$/i.exec(location.hash) || [])[1];  // a card's link ends in #DON-…: that donation is looked up once the ledger is checked
// n= a campaign's id: its ledger is fetched from the relays, the newest event signed with the campaign's ledger key (relay.js); without
// one there, l= the ledger's file. The relays are the app's (or the list saved under vetlock.relays in this browser).
const relaysHere = () => { try { const a = String(localStorage.getItem('vetlock.relays') || '').split(',').map(x => x.trim()).filter(x => /^wss?:\/\//.test(x)); if (a.length) return a; } catch (_) {} return window.scRelay ? window.scRelay.RELAYS : []; };
async function fromNostr(id){ if (!window.scRelay) return null; show($('l-out'), 'asking the relays for the published ledger…');
  const res = await window.scRelay.latestLedger(id, { relays: relaysHere(), timeout: 8000 }), f = res.found; if (!f) return null;
  NOSTR = { at: f.ev.created_at, relays: f.from.length, of: res.relays.length, ignored: res.ignored }; return JSON.stringify(f.L); }
let NOSTR = null;
const deepLook = () => { if (!deep || !LAST) return; document.body.classList.add('lookup'); flapLabel($('m-open'), 'back to the list', 0); $('m-tok').value = deep.toUpperCase(); $('m-go').click(); };
(async () => { let src = null; if (nid) { try { src = await fromNostr(nid); } catch (_) {} }
  const note = t => addNote(t, /^not found on the relays/.test(t));  /* the ledger's file instead of the relays: a warning */
  if (src) { $('l-src').value = src; await run(); if (LAST && NOSTR) note(`ledger from Nostr, signed with the campaign's ledger key, published ${new Date(NOSTR.at * 1000).toLocaleString()} (${NOSTR.relays} of ${NOSTR.of} relays)`); deepLook(); return; }
  if (q) { $('l-src').value = q; await run(); if (nid && LAST) note('not found on the relays: this is the ledger\'s file'); deepLook(); return; }
  if (nid) show($('l-out'), 'Failed: this campaign\'s ledger was not found on the relays.', 'bad'); })();
runHere();
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});  // the pages open without a connection (sw.js)
window.__vetstatus = { parseLedger, lockOf, lockProblem, checkToken, savedTokens };
})();
