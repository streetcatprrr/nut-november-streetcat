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
// A participant named in a text takes its own colours, in the shades of its key: Streetcat's green, the clinic's blue, the donor's orange
const NAMERE = /(?<![@.\w\/\\#"-])(Streetcat|Rescue|clinics?|vets?|partners?|donors?)(?:'s)?(?![\w@"\/-]|\.\w)/gi, WHO = { streetcat: 'streetcat', rescue: 'streetcat', clinic: 'clinic', vet: 'clinic', partner: 'clinic', donor: 'donor' }, BOTHRE = new RegExp(KEYRE.source + '|' + NAMERE.source, 'gi');
const nameOk = s => !/^(streetcat|rescue)$/i.test(s) || /^(Streetcat|Rescue)$/.test(s);  /* "Streetcat" and "Rescue" as names, not "rescue the cat" (review of 12 Nov); in a path, a tag or a JSON key, none */
function whoSpan(text){ const k = document.createElement('span'), role = WHO[text.toLowerCase().replace(/'s$/, '').replace(/s$/, '')] || 'streetcat'; k.className = 'who'; let h = 0; for (const ch of text.toLowerCase().replace(/'?s$/, '')) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  for (let i = 0; i < text.length; i += 2) { const s = document.createElement('i'), v = (h + i * 7919 + text.toLowerCase().charCodeAt(i) * 131) & 0xffff; s.textContent = text.slice(i, i + 2); s.style.setProperty('--h', String(HUE[role] - 14 + v % 29)); s.style.setProperty('--dl', String(((v >> 5) % 7 - 3) * 0.03)); k.appendChild(s); }
  return k; }
function withKeys(text){ const frag = document.createDocumentFragment(); let last = 0, m; BOTHRE.lastIndex = 0;
  while ((m = BOTHRE.exec(text))) { frag.appendChild(document.createTextNode(text.slice(last, m.index))); frag.appendChild(m[1] ? (nameOk(m[1]) ? whoSpan(m[0]) : document.createTextNode(m[0])) : keySpan(m[0])); last = m.index + m[0].length; }
  frag.appendChild(document.createTextNode(text.slice(last))); return frag; }
// Errors, warnings and odd states are red, in the app's own bad colour (var(--bad) and the .bad classes): a text that is one, or each line of a text that is one. Normal states
// (LOCKED, RELEASED, REFUNDED…), waiting messages and ✓ lines keep their colours. Keys inside a red line are red too.
const BAD_TEXT = /^\s*(✗|⚠|Failed\b|Not possible\b|Mint refused\b|Interrupted\b|CHECK FAILED|Not yet\b|[Cc]annot\b|[Cc]ould not\b|wrong password|This (phone|browser) could not|This (link|campaign) is not (signed|from Streetcat)|Still in flight|[Nn]ot ready for offline|[Nn]o connection\b|the mint did not answer|the mint cannot be reached|not sent:|no relay took it|NOT (COUNTED|LISTED)\b)/;
function badFrag(text, keys = false){ const f = document.createDocumentFragment(), ls = String(text == null ? '' : text).split('\n');
  ls.forEach((l, i) => { if (BAD_TEXT.test(l)) { const s = document.createElement('span'); s.className = 'bad'; s.textContent = l; f.appendChild(s); } else f.appendChild(keys ? withKeys(l) : document.createTextNode(l)); if (i < ls.length - 1) f.appendChild(document.createTextNode('\n')); });
  return f; }
const setLines = (e, text) => { e.textContent = ''; e.appendChild(badFrag(text)); return e; };
// a text is painted only for what it has to paint: a name it would leave as it is ("rescue", "STREETCAT": nameOk) is no reason to take it,
// or it would be put back the same, seen as new, and taken again, for ever: the page hung (13 Nov)
const paintsName = t => { let m; NAMERE.lastIndex = 0; while ((m = NAMERE.exec(t))) if (nameOk(m[1])) return true; return false; };
function paintKeys(root){ const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => ((KEYRE.lastIndex = 0, KEYRE.test(n.nodeValue)) && !n.parentNode.closest('textarea, .key, .nokey, .bad')) || (paintsName(n.nodeValue) && !n.parentNode.closest('textarea, .key, .nokey, .bad, .who, button, a.sm, nav, input, select, title, .sc-roles')) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) n.parentNode.replaceChild(withKeys(n.nodeValue), n); }
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType === 3 && n.parentNode) paintKeys(n.parentNode); else if (n.nodeType === 1) paintKeys(n); } }).observe(document.body, { childList: true, subtree: true, characterData: false });
paintKeys(document.body);

// Keys locked with a PIN (vault.js) and not opened in this tab yet: its screen asks for it, and nothing of the app runs before
// (a start without its keys would make new ones, or take a payment it cannot sign for). The page starts again once it is given.
if (scVault.locked()) { scVault.gate(); throw new Error('locked: the keys wait for the PIN'); }
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
// what is kept goes through the vault: with a PIN, the private keys are sealed as they are written and opened as they are read
const ls = { get(k){ try { return scVault.read(k); } catch(_) { return null; } }, set(k, v){ try { return scVault.write(k, v); } catch(_) { return false; } } };  // false: not saved (a full storage, a private window)
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
const addDonorKey = k => { const a = donorKeys(), i = a.findIndex(x => x.pk === k.pk); if (i >= 0) a[i] = { ...a[i], ...k }; else a.push(k); return ls.set(DONOR_KEYS, JSON.stringify(a)); };  // merges: later updates never drop the key; false: the phone's storage refused it
const findDonorKey = pks => { const legacy = key('donor', false); for (const pk of pks) { const k = donorKeys().find(x => x.pk === pk); if (k) return k.sk; if (legacy && pubOf(legacy) === pk) return legacy; } return null; };
// campaign colours: every campaign its own hue, none the pages already use (the keys' orange, blue and green, the green of ✓, the
// red of ✗, bitcoin's orange): pink, yellow, cyan and violet first, then four more. A new campaign takes the first hue free in this
// browser and carries it in its link and ledger, so it looks the same on every page and device. An older campaign without one gets
// the first free hue here, in the order this browser met it (the campaigns it made, then the donations it made), and keeps it.
const CAMP_HUES = [345, 100, 200, 295, 320, 178, 118, 218], CAMPCOL = 'vetlock.campcolors';
const campId = c => String((c && c.name) || '').trim().toLowerCase() + '|' + (Number(c && c.deadline) || 0);
// two campaigns made before links carried their colour, with the colours chosen for them: they count as their own
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
const fmtDate = t => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(t * 1000));  /* 31 Dec 2026: the day in UTC, as before */
const amt = a => (a && typeof a === 'object' && typeof a.toNumber === 'function') ? a.toNumber() : Number(a);  // cashu-ts may hand back Amount objects
const sum = ps => ps.reduce((s, p) => s + amt(p.amount), 0);
// ONE WAY TO WRITE SATS AND DATES (review of 9 Nov, U2 and U3): "21 000 sat" everywhere (it was 21000, 21,000 and 21 000 on one
// screen), a date as "31 Dec 2026" and a time as "9 Nov, 21:39" on every phone (they followed each phone's language). Here, before
// anything is drawn: what the page draws as it loads uses them.
const fmtSat = n => Number(n || 0).toLocaleString('en').replace(/,/g, ' ') + ' sat', fmtNum = n => fmtSat(n).replace(/ sat$/, '');
const EN = 'en-GB', when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(EN, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };  /* 9 Nov, 21:39 */
// A donation's life as four stretches, each in the colour of who does it; done ones carry a tick. A campaign of the older lock has
// three: there the mint pays no partner, Streetcat does, outside the app, so "paid" is nothing the app could ever tick (review of 12 Nov)
const LIFE = [['donated', 'donate', 60], ['confirmed', 'confirm', 250], ['released', 'release', 150], ['paid', 'paid', 100]];
const STAGE = { locked: 1, blocked: 1, reported: 1, unsent: 1, invalid: 1, refunded: 1, certified: 2, unpaid: 2, released: 3, short: 3, gone: 3, paid: 4 };
function lockBar(state, three = false){ const n = STAGE[state] || 1, d = document.createElement('div'); d.className = 'life'; if (three) d.style.gridTemplateColumns = 'repeat(3,minmax(min-content,1fr))';
  LIFE.slice(0, three ? 3 : 4).forEach(([done, todo, h], i) => { const x = document.createElement('span'); x.className = i < n ? 'on' : i === n ? 'now' : ''; x.textContent = i < n ? '✓ ' + (i === 0 && state === 'refunded' ? 'refunded' : done) : '· ' + todo; x.style.setProperty('--h', h); d.appendChild(x); }); return d; }
// whose turn it is, one line: in red, whole, whenever something is wrong; never "your turn" for what cannot be done, never "paid"
// for what was paid in part, or not to this phone (review of 12 Nov). {who}: the partner by its name
const NOW = { cr: { locked: ['Your turn · confirm', 'now'], blocked: ['✗ Cannot be confirmed · see below', 'bad'], reported: ['✗ Problem reported · waiting for Streetcat', 'bad'], certified: ['✓ Confirmed · waiting for Streetcat', 'ok'],
    unpaid: ['✗ Not paid · see below', 'bad'], released: ['✓ Released · the mint is paying you', 'ok'], short: ['✗ Not all paid · see below', 'bad'], gone: ['✗ Collected with your key elsewhere · see below', 'bad'], paid: ['✓ Paid to you by the mint', 'ok'] },
  sq: { unsent: ['✗ Not sent yet · see below', 'bad'], locked: ['Waiting for {who}', 'wait'], reported: ['✗ Problem reported by {who}', 'bad'], invalid: ['✗ Its answer is not valid · see below', 'bad'], certified: ['Your turn · release', 'now'],
    released: ['✓ Released', 'ok'], short: ['✗ Not all paid · see below', 'bad'], paid: ['✓ Paid to {who} by the mint', 'ok'] } };
// a donation's bar on a card, put in the state it reached: the one there replaced (with as many stretches), or added if there is none;
// never an error (a release that has gone through must still show its token)
function swapBar(host, state){ if (!host) return; const old = host.querySelector('.life, .lock'), nb = lockBar(state, !!old && old.children.length === 3); if (old) old.replaceWith(nb); else host.prepend(nb); }
function life(id, state, o = {}){ const e = $(id); if (!e) return; const n = $(id.slice(0, 2) + '-now'), k = [state, o.who || '', o.three ? 3 : 4].join('|');
  if (!state) { e.textContent = ''; delete e.dataset.s; delete e.dataset.k; if (n) { n.textContent = ''; n.className = 'nowline'; } return; }
  if (e.dataset.k === k) return; e.dataset.s = state; e.dataset.k = k; e.textContent = ''; e.appendChild(lockBar(state, o.three));
  if (n) { const [t, c] = (NOW[id.slice(0, 2)] || {})[state] || ['', ''], s = t.replace('{who}', o.who || 'the partner'); n.className = 'nowline ' + c; n.textContent = ''; if (c === 'bad') n.textContent = s; else n.appendChild(withKeys(s)); } }
// 3 · 4: the amount comes out of the list to its own place, with its fiat; what only an auditor reads goes behind "Details"
function tidy(pre, dl, sat){ const tech = $(pre + '-dl2'), amt = $(pre + '-amt'); if (tech) tech.textContent = ''; const kids = [...dl.children];
  kids.forEach((e, i) => { if (e.tagName !== 'DT') return; const v = kids[i + 1];
    if (e.textContent === 'Releases') { e.remove(); v.remove(); }
    else if (tech && ['Paid to', 'From', 'Arrived'].includes(e.textContent) && !v.classList.contains('bad')) { tech.appendChild(e); tech.appendChild(v); } });
  if (amt) { amt.textContent = ''; const b = el('span', 'n', String(fmtSat(sat)).replace(/ sat$/, '')), u = el('span', 'u', ' sat'); amt.appendChild(b); amt.appendChild(u); } /* no fiat here: a partner is paid in sats, and a euro figure reads as a promise */ }
// one big button a screen: what is used less waits behind "···", in a sheet that comes up from the bottom
function moreSheet(btn, id, items, home = document.body){  /* the sheet lives in its own screen: what it holds is still that screen's */ const old = $(id); if (old) old.remove(); const sh = el('div', 'sheet'), box = el('div', 'sh-box'), bar = el('div', 'sh-bar'), x = el('button', 'sh-x', '✕'); sh.id = id; x.type = 'button'; x.setAttribute('aria-label', 'close'); bar.appendChild(el('span', null, 'MORE')); bar.appendChild(x); box.appendChild(bar);
  for (const it of items) if (it) box.appendChild(it); const st = el('p', 'center lnk'), a = el('a', null, 'Status page'); a.href = 'status.html'; st.appendChild(a); box.appendChild(st); sh.appendChild(box); home.appendChild(sh);
  const shut = () => sh.classList.remove('open'); x.onclick = shut; sh.addEventListener('click', e => { if (e.target === sh || e.target.closest('a, button')) setTimeout(shut, 0); }); btn.dataset.sheet = id; btn.onclick = () => sh.classList.add('open'); return sh; }
function tokenCard(dec, info, state){ info.pubkeys.forEach((k, i) => roleOf(k, i ? 'clinic' : 'streetcat')); info.refund.forEach(k => roleOf(k, 'donor')); const c = document.createElement('div'); c.className = 'tcard'; const memo = String(dec.memo || ''); const m = memo.match(/^(?:released: )?(?:certified: )?(.+?) (?:sterilis|vet-|—|·)/); const name = (m ? m[1] : memo.split(' ')[0] || 'donation').replace(/^certified$/i, 'donation');
  const t = document.createElement('div'); t.className = 'title'; t.textContent = name; c.appendChild(t);
  const op = (dec.memo || '').replace(name, '').split(' — ')[0].replace(/^[\s·]+/, '').trim(); if (op) { const o = document.createElement('div'); o.className = 'mut'; o.textContent = op; c.appendChild(o); }
  const a = document.createElement('div'); a.className = 'amt2'; a.textContent = `${fmtSat(info.amount)}`; c.appendChild(a); fiatInto(a, info.amount);
  const w = document.createElement('div'); w.className = 'who2'; w.textContent = `clinic ${abbr(info.pubkeys[1] || '')}\nStreetcat ${abbr(info.pubkeys[0])}\nrefund after ${fmtDate(info.locktime)}`; c.appendChild(w);
  c.appendChild(lockBar(state, !info.dest)); return c; }
let RATE = null; const rate = async () => { if (RATE) return RATE; try { const c = JSON.parse(ls.get('vetlock.rate') || 'null'); if (c && Date.now() - c.at < 600000) return RATE = c.eur; } catch (_) {}
  try { const r = await window.scCore.fetchT('https://mempool.space/api/v1/prices', { cache: 'no-store' }); const j = await r.json(); if (j && j.EUR) { RATE = j.EUR; ls.set('vetlock.rate', JSON.stringify({ eur: j.EUR, at: Date.now() })); } } catch (_) {} return RATE; };
const eur = (sats, r) => { const v = sats / 1e8 * r; return v < 0.01 ? '< 0,01 €' : v.toFixed(2).replace('.', ',') + ' €'; };
async function fiatInto(el, sats){ const r = await rate(); if (!r || !el || !(sats > 0)) return; const s = document.createElement('span'); s.className = 'mut'; s.textContent = ` ≈ ${eur(sats, r)}`; el.appendChild(s); }
// a short buzz when an operation is confirmed. Android
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
    if (!runs.every(r => r.n.isConnected)) { runs.forEach(r => { r.n.nodeValue = r.full; }); cur.remove(); raf = 0; delete el.dataset.typing; return; }  /* its text was replaced while it typed: nothing left to type (9 Nov: it threw "Cannot read properties of null") */
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
// here, not with the other helpers further down: what is drawn as the page loads (Release's list) uses it (9 Nov: a token being paid
// out stopped the whole Rescue page from loading, "Cannot access 'el' before initialization")
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const copyBtn = (label, text, echo) => { const b = smallBtn(label, async () => { const ok = await copyText(text); if (ok) doneLabel(b); else flapLabel(b, 'select it', 2500); if (echo) termShow(text, echo.role, echo); }); return b; };
function qrSvg(text){ if (typeof qrcode !== 'function') return null;  // upper case lets a Lightning invoice use the compact alphanumeric QR mode
  const up = /^(lightning:)?ln/i.test(text); const q = qrcode(0, 'M'); q.addData(up ? text.toUpperCase() : text, up ? 'Alphanumeric' : 'Byte'); q.make();
  const box = document.createElement('div'); box.className = 'qr'; box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); return box; }
// Lightning donations waiting for payment: kept here so a reload (a phone switching to the wallet app) cannot lose a paid invoice
const PENDING = 'vetlock.pending';
const pendings = () => { try { const a = JSON.parse(ls.get(PENDING) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
const savePending = p => { const a = pendings().filter(x => x.quote !== p.quote); a.push(p); ls.set(PENDING, JSON.stringify(a)); };
const dropPending = q => ls.set(PENDING, JSON.stringify(pendings().filter(x => x.quote !== q)));
// An invoice waiting here keeps no private key: its refund key is found by its public key in the list of refund keys, which a PIN seals
// (Daybreak, 14 Nov: with a PIN, a pending invoice kept its refund key in the clear beside it). One written before gives it up here,
// once the list holds it.
(() => { const a = pendings(); if (!a.some(p => p && p.sk)) return;
  const b = a.map(p => { if (!p || !p.sk) return p; let pk = p.pk; try { pk = pk || pubOf(p.sk); } catch (_) { return p; }
    const kept = findDonorKey([pk]) === p.sk || (addDonorKey({ campaign: p.campaign && p.campaign.name, deadline: Number(p.campaign && p.campaign.deadline), pk, sk: p.sk, created: p.created }) && findDonorKey([pk]) === p.sk);
    if (!kept) return p; const { sk, ...rest } = p; return { ...rest, pk }; });
  ls.set(PENDING, JSON.stringify(b)); })();
function parseCampaign(text){ text = (text || '').trim(); if (!text) throw new Error('no campaign'); const m = text.match(/#c=([A-Za-z0-9_-]+)/); const j = JSON.parse(m ? b64u.dec(m[1]) : text);
  for (const k of ['name', 'mint', 'streetcat', 'clinic', 'deadline']) if (!j[k]) throw new Error('campaign is missing ' + k); return j; }
// Streetcat's published key (core.js, one line there): a donation link must name it, or the page refuses the donation before any call
// to the mint.
const STREETCAT_KEYS = window.scCore.STREETCAT_KEYS;
const NOT_PUBLISHED = 'This link is not from Streetcat\'s published key. Do not donate through it.';
const published = k => window.scCore.published(k);
const PUBKEY = /^0[23][0-9a-f]{64}$/i;
// THE PARTNER AND THE VOLUNTEER ask the same question as the donor (review of 9 Nov, S1): a request, a pasted token or a donation handed
// over names a "Streetcat" key of its own, and anyone can write one. Only Streetcat's published key is Streetcat: a request from another
// key is not taken from a relay, cannot be confirmed when opened by hand, gets no record of a cat, and its ecash is not acknowledged.
const NOT_SC = 'it is not from Streetcat\'s published key: do not confirm it';
const scOk = c => !!c && published(c.streetcat);
const reqProblems = q => [...(q && q.campaign && !scOk(q.campaign) ? [NOT_SC] : []), ...window.scCore.requestProblems(q)];
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
// the link's signature (core.js): a signed link is used as signed, field by field; a broken one moves no money, and neither does an
// unsigned one: anyone can take a signature off a link they changed (review of 9 Nov, A03). Receipts of donations made through links
// made before links were signed still take their sats back: that path never comes here.
const NOT_SIGNED = 'this link is not signed by Streetcat, so it could have been changed: it takes no donations. Ask Streetcat for the link again';
async function openSigned(text){ const c = openCampaign(text), st = await window.scCore.campaignSig(c);
  if (st === 'broken') throw new Error('the signature on this link does not match: it was changed after Streetcat made it. Do not donate through it, and ask Streetcat for the link again');
  if (st !== 'signed') throw new Error(NOT_SIGNED);
  return { ...window.scCore.campSigned(c), sig: c.sig }; }
// the lock as written in the proofs the mint signed, compared with what the campaign promises
// one reader of a lock for the whole app (core.js lockOf, review of 9 Nov, A06): every proof under this campaign's lock, and its one
// refund key the donor's given here, not merely among them
function lockMatches(c, refundPk, proofs){ const S = window.scCore;
  return proofs.length > 0 && proofs.every(p => { const l = S.lockOf(p.secret); return !!l && !S.lockProblem(l, c) && l.refund.length === 1 && l.refund[0] === String(refundPk).toLowerCase(); }); }
function lockInfo(proofs){ const one = p => { const l = window.scCore.lockOf(p.secret); if (!l) throw Object.assign(new Error('this is not a locked donation token'), { byPage: true });
    if (l.bad) throw Object.assign(new Error(`its lock is not well formed (${l.bad}): it is not a donation's lock, do not use it`), { byPage: true });  /* read strictly, as everywhere (A06) */
    /* a campaign that says where its money may go (core.js, `dest`) locks with SIG_ALL: its signers sign the whole transaction */
    if (l.sigflag !== 'SIG_INPUTS' && !(l.dest === 'pubkeys' && l.sigflag === 'SIG_ALL')) throw Object.assign(new Error(`its lock has an unusual signature rule (${l.sigflag}): it is not a donation's lock, do not use it`), { byPage: true });
    if (l.nRefund !== 1) throw Object.assign(new Error('its lock has an unusual refund rule (more than one refund signature): it is not a donation\'s lock, do not use it'), { byPage: true });
    return { kind: 'P2PK', pubkeys: l.main, nsigs: l.n, refund: l.refund, locktime: l.locktime, dest: !!l.dest }; };
  if (!proofs || !proofs.length) throw Object.assign(new Error('this token holds no ecash'), { byPage: true });
  const all = proofs.map(one), a = all[0], main = x => [x.kind, x.pubkeys.join().toLowerCase(), x.nsigs, x.locktime, x.dest].join('|');
  if (all.some(x => main(x) !== main(a))) throw Object.assign(new Error('its parts are locked to different conditions, so it is not one donation: do not use it'), { byPage: true });
  return { kind: a.kind, pubkeys: a.pubkeys, nsigs: a.nsigs, refund: [...new Set(all.flatMap(x => x.refund))], locktime: a.locktime, amount: sum(proofs), dest: a.dest }; }
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
    try { const pw = { ...p, witness: window.scCore.witnessClean(s.witness) }; if (s.witness && info.refund.some(r => cashu.hasP2PKSignedProof(r, pw))) k = 'taken back by the donor'; else if (s.witness && cashu.hasP2PKSignedProof(info.pubkeys[0], pw) && cashu.hasP2PKSignedProof(info.pubkeys[1], pw)) k = 'released already'; } catch (_) {}
    kinds.add(k); }
  return { live, gone, why: [...kinds].join(', ') }; }
// INDEXEDDB: the photos and the parts they travel in (below), and Rescue's ledger (12 Nov). Version 2 adds the ledger; a page of the
// version before, still open in another tab, is asked to let go (versionchange) and does at its next load.
const IDB = (() => { let db = null;
  const open = () => db || (db = new Promise((res, rej) => { let r; try { r = indexedDB.open('streetcat', 2); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => { for (const s of ['photos', 'parts', 'ledger']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => { const d = r.result; d.onversionchange = () => { try { d.close(); } catch (_) {} db = null; }; res(d); };
    r.onerror = () => rej(r.error || new Error('this browser keeps nothing in IndexedDB')); r.onblocked = () => rej(new Error('an older copy of the app is open in another tab')); }).catch(e => { db = null; throw e; }));
  const run = (store, mode, fn) => open().then(d => new Promise((res, rej) => { const t = d.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = () => res(q ? q.result : undefined); t.onerror = t.onabort = () => rej(t.error || new Error('IndexedDB could not read or keep it')); }));
  return { get: (s, k) => run(s, 'readonly', o => o.get(k)), put: (s, k, v) => run(s, 'readwrite', o => o.put(v, k)), del: (s, k) => run(s, 'readwrite', o => o.delete(k)), keys: s => run(s, 'readonly', o => o.getAllKeys()),
    many: (s, pairs) => run(s, 'readwrite', o => { for (const [k, v] of pairs) { if (v == null) o.delete(k); else o.put(v, k); } return null; }),  /* all kept, or none (null: deleted) */
    entries: s => open().then(d => new Promise((res, rej) => { const t = d.transaction(s, 'readonly'), o = t.objectStore(s), ks = o.getAllKeys(), vs = o.getAll(); t.oncomplete = () => res(ks.result.map((k, n) => [k, vs.result[n]])); t.onerror = t.onabort = () => rej(t.error || new Error('IndexedDB could not read it')); })) }; })();
// STREETCAT'S LEDGER: each donation that reaches this browser's Release tab is kept here by its DON- code (as locked: no signatures), with
// what was released from it, so that Home can copy the campaign's ledger (version 2, core.js) for publishing. Only locked tokens, no key.
// A campaign that pays from the lock (`dest`) keeps its own: every key of its lock (Streetcat's and each partner's), and its kind, so
// it is never mixed with a campaign of today's kind that has the same keys and deadline. campKey (below) gives the same from a campaign.
// IN INDEXEDDB (12 Nov). Each donation is kept whole, 9 to 15 KB, and localStorage (some 5 MB, shared with everything else) had room for
// 200 to 500. The ledger is read once as the page opens (LEDGER) and what reads it reads that, at once, as before; what writes it keeps
// the donations it changed, one record each (lock id, a new line, DON- code), and waits until they are kept. A ledger still in
// localStorage moves over the first time; a browser that refuses IndexedDB keeps it in localStorage, as before. Until it is read, the
// inbox, a release and an export wait for it, and the screens are drawn again once it is; another tab's change comes by BroadcastChannel.
const SCLEDGER = 'vetlock.sc.ledger', lockId = info => [info.pubkeys.join(), info.locktime].join('|').toLowerCase() + (info.dest ? '|dest' : '');
let LEDGER = null, LEDGER_IDB = false;
const lclone = o => JSON.parse(JSON.stringify(o)), LKEY = (id, ref) => id + '\n' + ref, lsplit = k => { const i = String(k).indexOf('\n'); return i < 0 ? null : [String(k).slice(0, i), String(k).slice(i + 1)]; };
const lsLedger = () => { try { const m = JSON.parse(localStorage.getItem(SCLEDGER) || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch (_) { return {}; } };
const lmerge = (a, b) => { const out = { ...b, ...a }; for (const f of ['parts', 'remainders']) { const seen = new Set((a[f] || []).map(x => JSON.stringify(x))), m = [...(a[f] || []), ...(b[f] || []).filter(x => !seen.has(JSON.stringify(x)))]; if (m.length) out[f] = m; } return out; };  /* one donation found in two places: all of a, and what b adds */
const LCH = (() => { try { return new BroadcastChannel('vetlock.ledger'); } catch (_) { return null; } })();
const LEDGER_READY = (async () => { let rows; try { rows = await IDB.entries('ledger'); } catch (_) { LEDGER = lsLedger(); return; }  /* no IndexedDB here: localStorage, as before */
  const all = {}, put = (id, ref, e) => { (all[id] || (all[id] = { entries: {} })).entries[ref] = e; };
  for (const [k, e] of rows) { const p = lsplit(k); if (p && e && typeof e === 'object') put(p[0], p[1], e); }
  const add = []; for (const [id, L] of Object.entries(lsLedger())) for (const [ref, e] of Object.entries(L && typeof L.entries === 'object' && L.entries ? L.entries : {})) {
    if (!e || typeof e !== 'object') continue; const cur = all[id] && all[id].entries[ref], m = cur ? lmerge(cur, e) : e; if (!cur || JSON.stringify(m) !== JSON.stringify(cur)) add.push([id, ref, m]); }
  let moved = true; if (add.length) { try { await IDB.many('ledger', add.map(([id, ref, e]) => [LKEY(id, ref), e])); } catch (_) { moved = false; } for (const [id, ref, e] of add) put(id, ref, e); }
  if (moved) { try { localStorage.removeItem(SCLEDGER); } catch (_) {} }  /* not moved (no room?): it stays there too, and is moved at the next opening */
  LEDGER = all; LEDGER_IDB = true; })().catch(() => {}).then(() => { if (!LEDGER) LEDGER = {}; if (Object.keys(LEDGER).length) setTimeout(ledgerShown, 0); });
const scLedger = () => LEDGER ? lclone(LEDGER) : {};
// what changed of one lock's donations ({ DON- code: entry }), kept: here at once, then in IndexedDB (or localStorage); false, and as it
// was, if it could not be kept. (null deletes: only the suites do.)
async function ledgerWrite(id, changed){ await LEDGER_READY; const L = LEDGER[id] || (LEDGER[id] = { entries: {} }), refs = Object.keys(changed), was = {};
  for (const ref of refs) { was[ref] = L.entries[ref]; if (changed[ref] == null) delete L.entries[ref]; else L.entries[ref] = lclone(changed[ref]); }
  let ok = true; if (LEDGER_IDB) { try { await IDB.many('ledger', refs.map(ref => [LKEY(id, ref), changed[ref] == null ? null : L.entries[ref]])); } catch (_) { ok = false; } }
  else { const base = lsLedger(), B = base[id] || (base[id] = { entries: {} }); for (const ref of refs) { if (changed[ref] == null) delete B.entries[ref]; else B.entries[ref] = L.entries[ref]; } ok = ls.set(SCLEDGER, JSON.stringify(base)); if (ok) { LEDGER = base; return true; } }  /* over what another tab wrote meanwhile */
  if (!ok) { for (const ref of refs) { if (was[ref] === undefined) delete L.entries[ref]; else L.entries[ref] = was[ref]; } return false; }
  if (LCH && LEDGER_IDB) { try { LCH.postMessage(refs.map(ref => LKEY(id, ref))); } catch (_) {} } return true; }
// another tab kept some: read again, and the screens drawn again
if (LCH) LCH.onmessage = async ev => { await LEDGER_READY; if (!LEDGER_IDB || !Array.isArray(ev.data)) return; let any = false;
  for (const k of ev.data) { const p = lsplit(k); if (!p) continue; let e = null; try { e = await IDB.get('ledger', String(k)); } catch (_) { continue; } const L = LEDGER[p[0]] || (LEDGER[p[0]] = { entries: {} }); if (e && typeof e === 'object') L.entries[p[1]] = e; else delete L.entries[p[1]]; any = true; }
  if (any) ledgerShown(); };
try { addEventListener('storage', e => { if (e.key === SCLEDGER && LEDGER && !LEDGER_IDB) { LEDGER = lsLedger(); ledgerShown(); } }); } catch (_) {}
function ledgerShown(){ try { renderHome(); } catch (_) {} for (const [id, f] of [['skind', () => renderKind()], ['scamp', () => renderScamp()], ['spick', () => renderPick()]]) { try { const e = $(id); if (e && e.classList.contains('on')) f(); } catch (_) {} } }
async function ledgerKeep(dec, info, part){ if (!window.scCore) return; await LEDGER_READY; const id = lockId(info);
  const of = camps().map(x => x && x.c).filter(x => { try { return !!x && campKey(x) === id; } catch (_) { return false; } });  /* audit of 10 Nov: the ledger files by the lock's keys and deadline, which say nothing of the mint */
  if (of.length && !of.some(x => norm(x.mint) === norm(dec.mint))) throw Object.assign(new Error(`this token is of another mint than ${of[0].name}'s: it is not that campaign's donation`), { byPage: true });
  const proofs = dec.proofs.map(p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(p.dleq ? { dleq: p.dleq } : {}) })), ref = await scCore.donRef(proofs.map(yHex));
  const cur = LEDGER[id] && LEDGER[id].entries[ref], e = cur ? lclone(cur) : { token: cashu.getEncodedToken({ mint: dec.mint, proofs }), amount: sum(proofs), date: new Date().toISOString().slice(0, 10), parts: [] };
  if (part) (e.parts || (e.parts = [])).push(part); if ((!cur || part) && !(await ledgerWrite(id, { [ref]: e }))) throw new Error(NO_ROOM); }  /* not kept: said, and the inbox asks again (scCheck) */
const NO_ROOM = 'this phone has no room left to save it: the app\'s storage is full';
const tokAmount = t => { try { return Number(cashu.getTokenMetadata(t).amount) || 0; } catch (_) { return 0; } };
const ledgerFor = c => { const L = LEDGER && LEDGER[campKey(c)] ? lclone(LEDGER[campKey(c)]) : { entries: {} }, entries = Object.entries(L.entries).map(([ref, e]) => ({ ref, ...e, amount: Number(e.amount) || tokAmount(e.token), parts: e.parts || [], remainders: e.remainders || [] }));  /* each donation's original amount and every part */
  let certificates = []; try { certificates = sreqs().filter(r => r.answer && r.answer.kind === 'certified' && r.check && r.check.ok && campKey(r.q.campaign) === campKey(c)).map(r => ({ statement: r.answer.statement, sig: r.answer.sig })); } catch (_) {}  /* the clinic's signed declarations, for anyone to check */
  return window.scCore ? scCore.ledgerV2({ campaign: c, clinicKeySource: '', entries, certificates }) : { campaign: c, donations: entries.map(e => e.token) }; };
// past the deadline a donation can still be certified: the donor may take it back at any moment, and the mint lets whoever comes first spend it
function describe(info, mint){ info.pubkeys.forEach((k, i) => roleOf(k, i ? 'clinic' : 'streetcat')); info.refund.forEach(k => roleOf(k, 'donor')); return `${fmtSat(info.amount)} at ${mint}\nlocked to ${info.nsigs} of ${info.pubkeys.length} signatures\nrefund to ${info.refund.length ? info.refund.map(k => k.slice(0, 10) + '…').join(', ') : 'nobody'} after ${info.locktime ? fmtDate(info.locktime) : 'never'}`; }
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
// a finished action: its button says what happened and cannot be pressed again; a new token, or "… another token", brings it back
const finish = (btn, text) => { if (!btn.classList.contains('fin')) btn.dataset.idle = btn.textContent; btn.classList.add('fin'); btn.disabled = true; btn.textContent = text; };
const unfinish = btn => { if (!btn.classList.contains('fin')) return; btn.classList.remove('fin'); btn.disabled = false; btn.textContent = btn.dataset.idle || btn.textContent; };
const storageWorks = () => { try { const k = 'vetlock.probe'; localStorage.setItem(k, '1'); const ok = localStorage.getItem(k) === '1'; localStorage.removeItem(k); return ok; } catch (_) { return false; } };
const NO_STORAGE = 'this browser does not let the page save anything (a private window?). Open it in a normal window: if the page closed at the wrong moment, the sats could be lost.';

// SAFE MINT CALLS. The page builds the new outputs itself and saves them before asking the mint. If the mint's answer is lost
// (dropped connection, closed tab), the mint hands the signatures back on request (NUT-09 restore), so nothing is lost.
const outSave = o => ({ a: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B: o.blindedMessage.B_, r: o.blindingFactor.toString(16), s: new TextDecoder().decode(o.secret) });
const outLoad = x => new cashu.OutputData({ amount: cashu.Amount.from(x.a), id: x.id, B_: x.B }, BigInt('0x' + x.r), new TextEncoder().encode(x.s));
// Does a mint enforce `dest`, the lock that says where the money may go (core.js; docs/dest-lock.md)? Its own info says so (NUT-06). Asked
// only when it matters: choosing a campaign's partners and making it (once per mint and page), and locking a donation to one that needs
// it: that, every time (`fresh`; Daybreak, 14 Nov: a page left open kept locking donations after its mint had stopped saying so).
const DEST_MINTS = new Map();
async function mintDest(url, fresh = false){ url = String(url || '').trim().replace(/\/+$/, ''); if (!/^https?:\/\//i.test(url)) return false; if (!fresh && DEST_MINTS.has(url)) return DEST_MINTS.get(url);
  try { const r = await window.scCore.fetchT(url + '/v1/info', { cache: 'no-store' }); if (!r.ok) return false; const v = window.scCore.destMint(await r.json()); DEST_MINTS.set(url, v); return v; } catch (_) { return false; } }
async function buildOutputs(w, amount, lock){ const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id);
  // a donation (locked) is cut small: no proof over a tenth of it (core.js donationSplit), so a release seldom splits a proof, and what
  // a split exposes stays small; what is not locked (a release, a refund) takes the usual denominations
  const sizes = Object.keys(ks.keys).map(Number), split = lock ? window.scCore.donationSplit(amount, sizes) : null;
  if (lock && lock.dest) {  // a campaign that says where its money may go: each proof's secret is made here (core.js destSecret), and only for a
    // mint that enforces the rule; one that does not would take the lock and ignore it, and any two of its keys could send the ecash anywhere
    if (!(await mintDest(w.mint.mintUrl, true))) throw Object.assign(new Error('This campaign needs a mint that enforces where its donations may go, and this mint does not say it does. Do not donate through it.'), { byPage: true });
    const cut = split || (() => { const o = []; let n = amount; for (const s of sizes.slice().sort((a, b) => b - a)) while (n >= s) { o.push(s); n -= s; } return o; })(), te = new TextEncoder();
    return cut.map(a => { const s = te.encode(window.scCore.destSecret(lock.dest)), b = cashu.blindMessage(s); return new cashu.OutputData({ amount: cashu.Amount.from(a), id: ks.id, B_: b.B_.toHex(true) }, b.r, s); }); }
  return lock ? cashu.OutputData.createP2PKData(lock.toOptions(), amount, ks, split || undefined) : cashu.OutputData.createRandomData(amount, ks); }
async function restoreOutputs(w, saved){ const outs = saved.map(outLoad); const res = await w.mint.restore({ outputs: outs.map(o => o.blindedMessage) });
  const sigs = new Map((res.outputs || []).map((o, i) => [o.B_, (res.signatures || [])[i]])); if (!outs.length || !outs.every(o => sigs.get(o.blindedMessage.B_))) return null;
  const proofs = []; for (const o of outs) proofs.push(o.toProof(sigs.get(o.blindedMessage.B_), await w.keyChain.ensureKeysetKeys(o.blindedMessage.id))); return proofs; }
// THE CHANGE OF A LIGHTNING PAYMENT whose answer was lost (review of 9 Nov, A05): a payment by Lightning is sent with blank outputs for
// what the mint does not spend of its fee reserve (NUT-08); they are kept with the payment's record before it is sent, and if the answer
// is lost, the mint is asked for them again (NUT-09): those it signed are the change. Only what is still unspent counts, so the same
// change is never kept twice. A network error throws: asked again next time.
async function changeBack(w, saved){ if (!saved || !saved.length) return []; const outs = saved.map(outLoad); const res = await w.mint.restore({ outputs: outs.map(o => o.blindedMessage) });
  const sigs = new Map((res.outputs || []).map((o, i) => [o.B_, (res.signatures || [])[i]])), proofs = [];
  for (const o of outs) { const s = sigs.get(o.blindedMessage.B_); if (s && Number(s.amount) > 0) proofs.push(o.toProof({ ...s, amount: cashu.Amount.from(s.amount) }, await w.keyChain.ensureKeysetKeys(s.id))); }
  if (!proofs.length) return []; const st = await w.checkProofsStates(proofs); return proofs.filter((p, i) => st[i] && st[i].state === 'UNSPENT'); }
// swaps (lock pasted ecash, release, refund) that survive a lost answer; unfinished ones are retried when the page opens
const INFLIGHT = 'vetlock.inflight';
const flights = () => { try { const a = JSON.parse(ls.get(INFLIGHT) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
const saveFlight = f => { const a = flights().filter(x => x.id !== f.id); a.push(f); return ls.set(INFLIGHT, JSON.stringify(a)); };  // false: the phone's storage refused it
const dropFlight = id => ls.set(INFLIGHT, JSON.stringify(flights().filter(x => x.id !== id)));
// nothing goes to the mint before its record is written, and the record stays until what came back is kept where it goes (keep(proofs)
// says so): until then this page asks the mint for it again each time it opens (review of 9 Nov, A01/A02)
const NOT_WRITTEN = 'this browser could not write the operation down first (its storage is full or blocked), so nothing was sent to the mint: free some room in this browser and try again';
const settled = (id, keep) => p => { let ok = !keep; try { ok = ok || !!keep(p); } catch (_) {} if (ok) dropFlight(id); return p; };
async function safeSwap(w, inputs, { lock, privkey, what, mint, keep }){ if (!storageWorks()) throw new Error(NO_STORAGE);
  const fee = amt(w.getFeesForProofs(inputs)), amount = sum(inputs) - fee; if (amount <= 0) throw Object.assign(new Error('nothing would be left after the mint fee'), { final: true });
  const outs = await buildOutputs(w, amount, lock), id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), done = settled(id, keep);
  if (!saveFlight({ id, what, mint: norm(mint), ys: inputs.map(p => cashu.hashToCurve(new TextEncoder().encode(p.secret)).toHex(true)), outputs: outs.map(outSave), created: new Date().toISOString() })) throw Object.assign(new Error(NOT_WRITTEN), { byPage: true });
  try { let b = w.ops.receive(inputs); if (privkey) b = b.privkey(privkey); const proofs = await b.asCustom(outs).run(); return done(proofs); }
  catch (e) { return swapFailed(w, e, id, inputs, outs, done, ', or simply try again'); } }
// A SWAP THAT CAME BACK WITH AN ERROR, OR WITH NOTHING: the mint is asked what happened before the record goes (Daybreak, 14 Nov: an
// error from a mint that had done the swap all the same dropped the record, and with it the only way to get the result back). A swap
// spends all its inputs or none. All spent, into these outputs: done, and the result is asked for again (NUT-09) and kept. Refused and
// not done (an input still unspent, or all of them spent into other outputs: a donor's refund, another tab): the record goes and the
// refusal is said. Anything else (no answer: the mint may still do it; or it cannot be told): the record stays, and the page finishes
// it when it opens again.
async function swapFailed(w, e, id, inputs, outs, done, more = ''){ const refused = cashu.isMintOperationError(e); let st = null; try { st = await w.checkProofsStates(inputs); } catch (_) {}
  const spent = !!st && st.length === inputs.length && st.every(s => s.state === 'SPENT');
  if (spent) { const back = await restoreOutputs(w, outs.map(outSave)).catch(() => undefined); if (back) return done(back); if (refused && back === null) { dropFlight(id); throw e; } }
  else if (refused && st && st.some(s => s.state === 'UNSPENT')) { dropFlight(id); throw e; }
  throw Object.assign(new Error((spent ? 'the mint took the ecash but its answer was lost, and it could not hand the result back yet.' : refused ? 'the mint answered with an error and could not be asked whether it did it.' : 'the mint did not answer, so it is not known whether it did it.') + ` Nothing is lost: this browser kept what it needs, so open this page again later and it will finish${more}. (` + (e.message || e) + ')'), { kept: true }); }
const whyFailed = e => (e && e.kept ? 'Interrupted: ' : e && e.byPage ? 'Not possible: ' : 'Mint refused: ') + ((e && e.message) || e);
const norm = u => String(u || '').trim().replace(/\/+$/, '');
// released tokens are plain bearer ecash: kept here until Streetcat has them in its wallet
const RELEASED = 'vetlock.released';
const releasedList = () => { try { const a = JSON.parse(ls.get(RELEASED) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
// what holds money or a key is never dropped for being old or many (review of 9 Nov, A01/A02: each list kept only its last 50, 60, 40
// or 30, open ones too): all that is open stays; of what is finished, only the newest n
function keepOpen(a, open, n){ const done = a.filter(x => !open(x)), drop = new Set(done.slice(0, Math.max(0, done.length - n))); return a.filter(x => !drop.has(x)); }
const addReleased = r => { const a = releasedList(); if (a.some(x => x.token === r.token)) return true; a.push(r); return ls.set(RELEASED, JSON.stringify(keepOpen(a, x => !x.paid, 50))); };  // false: not kept (the phone's storage refused it)
const unpaid = () => releasedList().filter(r => !r.paid);  // what was sent to Streetcat's Lightning address is no longer here
function renderReleased(){ const box = $('s-saved'); if (!box) return; box.textContent = ''; const a = unpaid(); if (!a.length) return;
  box.appendChild(document.createTextNode('Released — move them to a wallet:'));  /* no "in this browser" */
  for (const r of a.slice().reverse()) { const p = r.paying && payouts().find(x => x.id === r.paying && x.state === 'pending');  /* every one, not only the newest 10: "forget all" never forgets one that is not on screen */
    box.appendChild(p ? el('div', 'mut bad', `${fmtSat(r.amount)} · being sent to ${p.to}: the mint has not said yet that it went through`) : copyBtn(`${fmtSat(r.amount)} · ${String(r.at).slice(0, 10)}`, r.token)); }
  box.appendChild(smallBtn('forget all', () => { if (confirm('Forget the released tokens kept here? Do it only once they are all in Streetcat\'s wallet.')) { ls.set(RELEASED, '[]'); renderReleased(); } })); }
// what Streetcat releases goes straight to its Lightning address, set once in Keys (in Home until 9 Nov): the largest invoice the mint can pay from the released ecash after its fees. The payment is written down
// before it is sent, so a lost answer is asked about again, never paid twice; if it fails, the ecash stays here, as without an address.
const PAYTO = 'vetlock.sc.payto', PAYOUTS = 'vetlock.sc.payouts';
const payTo = () => { const a = String(ls.get(PAYTO) || '').trim(); return a && window.scCore && window.scCore.lnAddressUrl(a) ? a : ''; };
const payouts = () => { try { const a = JSON.parse(ls.get(PAYOUTS) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }, savePayout = m => ls.set(PAYOUTS, JSON.stringify(keepOpen([...payouts().filter(x => x.id !== m.id), m], x => x.state === 'pending' || !!x.changeDue, 60)));  /* read as the page opens, before jget exists */
const markReleased = (token, patch) => ls.set(RELEASED, JSON.stringify(releasedList().map(x => x.token === token ? { ...x, ...patch } : x)));
async function payOut(w, proofs, token, mint){ const to = payTo(); if (!to) throw new Error('no Lightning address is set in Keys'); const total = sum(proofs);
  let inFee = 0; try { inFee = amt(w.getFeesForProofs(proofs)); } catch (_) {}
  let want = Math.max(1, total - inFee - reserveGuess(total)), best = null;
  for (let i = 0; i < 2; i++) { const inv = (await window.scCore.lnAddressInvoice(to, want)).invoice, q = await w.createMeltQuoteBolt11(inv), room = total - inFee - amt(q.fee_reserve);  /* the exact room once the mint's reserve is known */
    if (amt(q.amount) <= room) { best = { inv, q }; if (room === amt(q.amount)) break; want = room; } else { if (best || room < 1) break; want = room; } }
  if (!best) throw new Error(`the mint keeps too much for fees to pay ${fmtSat(total)} out by Lightning`);
  const m = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), quote: best.q.quote, amount: amt(best.q.amount), to, mint: norm(mint), token, at: nowIso(), state: 'pending' };
  const prep = await w.ops.meltBolt11(best.q, proofs).prepare(); m.outs = (prep.outputData || []).map(outSave);  /* the change's blank outputs, kept with the payment before it is sent */
  if (!savePayout(m)) throw new Error('this browser could not write the payment down first (its storage is full or blocked), so it was not sent'); markReleased(token, { paying: m.id });
  try { const res = await w.completeMelt(prep); if (res.quote && res.quote.state && res.quote.state !== 'PAID') return { pending: true, amount: m.amount };
    return settlePayout(m, 'PAID', res.change || []);
  } catch (e) { let st = ''; try { st = (await w.checkMeltQuoteBolt11(best.q.quote)).state; } catch (_) {}
    if (st === 'PAID') { const r = settlePayout(m, 'PAID', null); return { ...r, change: await takeChange(m).catch(() => 0) }; }  /* paid, its answer lost: the change is asked back */
    if (st === 'UNPAID') { settlePayout(m, 'UNPAID'); throw e; } return { pending: true, amount: m.amount }; } }
// change null: the payment's answer was lost, so its change is still to be asked back from the mint (takeChange): owed, recorded apart
// from the payment, which is never sent again for it
function settlePayout(m, state, change = []){ m.done = nowIso();
  if (state !== 'PAID') { m.state = 'failed'; savePayout(m); markReleased(m.token, { paying: null }); return null; }
  m.state = 'paid'; m.changeDue = change === null && !!(m.outs && m.outs.length); savePayout(m); markReleased(m.token, { paid: m.to, sent: m.amount, paying: null });
  if (change === null) return { sent: m.amount, change: 0 }; const c = sum(change);
  const ct = c ? cashu.getEncodedToken({ mint: m.mint, proofs: change, memo: 'change of a payment to ' + m.to }) : '';  /* what the mint kept for fees and did not use */
  if (ct && !addReleased({ token: ct, amount: c, memo: 'change', at: nowIso() })) return { sent: m.amount, change: c, lost: ct };  // not kept: shown, to be copied now
  return { sent: m.amount, change: c }; }
async function takeChange(m){ const ch = await changeBack(await wallet(m.mint), m.outs), c = sum(ch);  // a network error throws: asked again next time
  const ct = c ? cashu.getEncodedToken({ mint: m.mint, proofs: ch, memo: 'change of a payment to ' + m.to }) : '';
  if (ct && !addReleased({ token: ct, amount: c, memo: 'change', at: nowIso() })) return 0;  /* not kept: still owed, asked again next time */
  m.changeDue = false; m.change = c; savePayout(m); return c; }
async function recheckPayouts(){ let n = 0; for (const m of payouts().filter(x => x.state === 'pending')) { try { const q = await (await wallet(m.mint)).checkMeltQuoteBolt11(m.quote); if (q.state === 'PAID' || q.state === 'UNPAID') { settlePayout(m, q.state, null); n++; } } catch (_) {} }
  for (const m of payouts().filter(x => x.state === 'paid' && x.changeDue)) { try { if (await takeChange(m)) n++; } catch (_) {} }  /* the change of a payment whose answer was lost */
  if (n) { renderReleased(); renderHome(); } }
// after a release: paid at once to the address when one is set; without one, or if paying fails, kept here to be copied
async function releasedOut(out, { w, proofs, plain, mint, head, keep, label = 'copy token' }){ const to = payTo();
  const keepIt = (lead, cls, tok = plain) => { show(out, lead + '\n', cls); const r3 = el('div', 'row1'); r3.appendChild(copyBtn(label, tok, { role: 'streetcat' })); out.appendChild(r3);
    const f3 = el('details', 'more'), s3 = el('summary', null, 'token text'); f3.appendChild(s3); f3.appendChild(document.createTextNode('\n')); f3.appendChild(el('span', 'mut code', tok)); f3.appendChild(document.createTextNode('\n')); out.appendChild(f3); renderReleased(); renderHome(); };
  // the phone's storage refused it: never "this browser keeps a copy" when it does not, and nothing is paid that this browser cannot write down
  if (!releasedList().some(x => x.token === plain)) return keepIt(`✗ ${head} This browser could not keep a copy of it (its storage is full or blocked)${to ? `, so it was not sent to ${to}` : ''}: copy it into Streetcat's wallet now. Until it can keep it, this page asks the mint for it again each time it opens.`, 'bad');
  if (!to) return keepIt(`${head} ${keep}`, 'ok');
  show(out, `${head} Sending it to ${to}…`); renderReleased();
  let po = null, why = ''; try { po = await payOut(w, proofs, plain, mint); } catch (e) { why = e.message || String(e); } renderReleased(); renderHome();
  if (po && po.lost) return keepIt(`✗ ${head} ${fmtSat(po.sent)} sent to ${to}, but this browser could not keep the other ${fmtSat(po.change)}, which the mint kept for fees and did not use (its storage is full or blocked): copy them into Streetcat's wallet now:`, 'bad', po.lost);
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
      const token = cashu.getEncodedToken({ mint: f.mint, proofs: back, memo: 'recovered ' + ((f.what && f.what.kind) || '') }), k = (f.what && f.what.kind) || 'swap';
      // what came back is kept where it goes before its record is dropped; if this browser cannot keep it, the record stays (asked again next time)
      const notKept = what => found.push({ kind: `${k} (this browser could not keep it, its storage is full or blocked: ${what} now)`, token, amount: sum(back), bad: true });
      if (k === 'donation' && f.what.campaign && f.what.pk && !lockMatches(f.what.campaign, f.what.pk, back)) { found.push({ kind: 'donation (lock check FAILED: do not send it; write to Streetcat)', token, amount: sum(back), bad: true }); dropFlight(f.id); continue; }
      if (k === 'donation' && f.what.pk && !addDonorKey({ pk: f.what.pk, lockedToken: token, amount: sum(back), mint: f.mint })) { notKept('save it'); continue; }
      if (k === 'release' && !addReleased({ token, amount: sum(back), memo: f.what.memo || '', at: new Date().toISOString() })) { notKept('copy it into Streetcat\'s wallet'); continue; }
      if (k === 'release-split') { const pl = back.filter(p => !String(p.secret).startsWith('["P2PK"'));  /* the released part; the rest went back under the lock */
        if (pl.length && !addReleased({ token: cashu.getEncodedToken({ mint: f.mint, proofs: pl, memo: 'released: ' + (f.what.memo || '') + (f.what.request ? ' · ' + f.what.request : '') }), amount: sum(pl), memo: f.what.memo || '', at: new Date().toISOString() })) { notKept('copy it into Streetcat\'s wallet'); continue; } }
      if (k === 'refund' && f.what.pk && !addDonorKey({ pk: f.what.pk, refundToken: token, refunded: new Date().toISOString() })) { notKept('import it into your wallet'); continue; }
      dropFlight(f.id); found.push({ kind: k, token, amount: sum(back) });
    } catch (_) {} }
  if (!found.length) return; renderReleased(); renderHome();  /* what came back counts at once (Release, Home's numbers) */ const box = $('recovered'); box.hidden = false; box.textContent = '';
  box.appendChild(Object.assign(document.createElement('label'), { textContent: 'Recovered: an operation was interrupted last time and the mint handed its result back' }));
  for (const r of found) { const d = document.createElement('div'); d.className = 'out ' + (r.bad ? 'bad' : 'ok'); d.textContent = `${r.kind}: ${fmtSat(r.amount)}\n${r.token}\n`; d.appendChild(copyBtn('copy token', r.token)); box.appendChild(d); } }

// tabs
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === b.dataset.t)); refreshKeys(); hdCamp(); }));
// one page, three people: each role sees only its tabs, and the header switches between them (an address of one role keeps to it);
// a campaign link means a donor, and so does a first visit
const ROLEKEY = 'vetlock.role', ROLENAME = { donor: 'donor', clinic: 'clinic', streetcat: 'Streetcat' }, nav = document.querySelector('nav'), roleTabs = [...document.querySelectorAll('#hd-roles button')];
// a screen of two roles (Keys, the cats) stays in the role it is opened from; otherwise it is its first role's
const tabRole = t => { const rs = (document.querySelector(`nav button[data-t="${t}"]`).dataset.role || '').split(' '); return rs.includes(nav.dataset.role) ? nav.dataset.role : rs[0]; };
let W_SHOW = '';  /* the partner's home: which of its two numbers has its requests shown ('pending', 'done' or none); none on entering Partner */
function setRole(r){ if (!ROLENAME[r]) r = 'donor'; const was = nav.dataset.role; if (r === 'clinic' && was !== r) W_SHOW = ''; ls.set(ROLEKEY, r); nav.dataset.role = r; nav.hidden = false; document.body.dataset.role = r;
  for (const b of roleTabs) { const on = b.dataset.r === r; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    if (on && was !== r) flap(b, b.dataset.label || (b.dataset.label = b.textContent)); }  /* the letters turn over once, when the role changes */
  updateBack(); const on = document.querySelector('nav button.on'), first = document.querySelector(`nav button[data-role~="${r}"]`);
  if (!on || !(on.dataset.role || '').split(' ').includes(r)) first.click(); else document.getElementById(on.dataset.t).classList.add('on'); }
document.addEventListener('click', e => { if (e.target.id === 'd-torefund') { e.preventDefault(); openTab('refund'); } if (e.target.id === 'r-todonate') { e.preventDefault(); openTab('donate'); }
  if (e.target.id === 'd-toecash') { e.preventDefault(); settleAmt(); if (!$('donate').classList.contains('sigbad')) openTab('decash'); } });  /* a broken or unpublished link: no way to pay, by ecash either */
const HOME = { donor: 'donate', clinic: 'work', streetcat: 'home' };
// one step back from a screen inside a role: its parent screen, else the role's first screen
const BACK = { creq: 'work', csettings: 'work', coffline: 'work', scamp: 'home', skind: 'home', spick: 'snew', snew: 'scamp', sreq: 'scamp', shand: 'home', dhand: 'donate', dcard: 'donate', decash: 'donate', cat: 'cats', catnew: 'cats' };  /* catnew: its request, when it was opened from one */
// Donate is the donor's first screen, so the arrow did not show there, and the screen stayed on what it showed last. Now the arrow shows while Donate shows something over
// its start: a donation made (LOCKED), an invoice waiting to be paid, or Streetcat's open requests listed. A tap on it, on the role in the
// header, on "donate again", or the phone's back, goes back to Donate as it starts (donateReset): an invoice left waiting is kept below
// ("resume") and finished by itself if it is paid (pendCheck); the list closes, and closes too when Donate is left
const donorAside = () => nav.dataset.role === 'donor' && $('donate').classList.contains('on') && ($('donate').classList.contains('done') || $('donate').classList.contains('paying') || !$('d-reqs').hidden);
function updateBack(){ const r = nav.dataset.role, on = document.querySelector('nav button.on'); $('hd-back').hidden = !r || !on || (on.dataset.t === HOME[r] && !donorAside()); }
const leaveAside = () => { if (history.state && history.state.aside) history.back(); else donateReset(); };  /* the step the phone's back would undo, or straight */
$('hd-back').onclick = () => { if (donorAside()) return leaveAside(); const r = nav.dataset.role, on = document.querySelector('nav button.on'), up = on && BACK[on.dataset.t]; if (!r) return; const to = up && tabRole(up) === r ? up : HOME[r], prev = navStack[navStack.length - 2];
  if (prev && prev.t === to && prev.r === r) history.back(); else openTab(to); };  /* the screen before, when it is the one the arrow leads to: as the phone's back */
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { if (b.dataset.t !== 'donate' && !$('d-reqs').hidden) reqsDone(); updateBack(); if (b.dataset.t === 'home') renderHome(); }));
// the phone's own back (a swipe on an iPhone, the back button on Android) goes back one screen inside the app, not out of it:
// every screen opened after the page has started is a step in the browser's history, and going back opens the screen of the step before
let navReady = false, navRestoring = false; const navStack = [], navState = () => ({ t: (document.querySelector('nav button.on') || { dataset: {} }).dataset.t, r: nav.dataset.role });
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { if (!navReady || navRestoring) return; const s = navState(), top = navStack[navStack.length - 1];
  if (top && top.t === s.t && top.r === s.r) return; navStack.push(s); history.pushState({ ...s, sc: 1 }, ''); }));
addEventListener('popstate', e => { const s = e.state; if ((!s || !s.aside) && donorAside()) donateReset();  /* back from Donate's donation, invoice or list: Donate as it starts */
  if (!s || !s.sc || !s.t) return; navStack.pop(); if (!navStack.length) navStack.push({ t: s.t, r: s.r }); navRestoring = true;
  try { setRole(s.r); document.querySelector(`nav button[data-t="${s.t}"]`).click(); } finally { navRestoring = false; } });
// a step in the history for what Donate shows over its start (above), so the phone's back undoes it rather than leave the app
function asideStep(){ if (!navReady || navRestoring || (history.state && history.state.aside) || !donorAside()) return; const s = { t: 'donate', r: 'donor', aside: 1 }; navStack.push(s); try { history.pushState({ ...s, sc: 1 }, ''); } catch (_) {} updateBack(); }
const openTab = t => { setRole(tabRole(t)); document.querySelector(`nav button[data-t="${t}"]`).click(); };
// a role in the header: another role switches to it; the role on screen goes back to its first screen (Donate as it starts, see above)
for (const b of roleTabs) b.onclick = () => { const r = b.dataset.r; if (nav.dataset.role === r) { if (r === 'clinic') W_SHOW = ''; if (donorAside()) leaveAside(); else openTab(HOME[r]); } else setRole(r); window.scrollTo(0, 0); };
// a role can also come from the address: /donate, /clinic, /streetcat (or ?role=…): that page never asks
const pathRole = ((location.pathname.replace(/\/+$/, '').split('/').pop() || '').toLowerCase().replace('donate', 'donor')), qRole = (new URLSearchParams(location.search).get('role') || '').toLowerCase();
const fixedRole = ROLENAME[pathRole] ? pathRole : ROLENAME[qRole] ? qRole : '';
document.body.classList.toggle('fixed', !!fixedRole);  // there the header shows only that role
setRole(location.hash.includes('#c=') ? 'donor' : fixedRole || ls.get(ROLEKEY) || 'donor');
function refreshKeys(){ undone($('s-copy'));  // a new or imported key has not been copied yet
  for (const [role, el, x] of [['clinic', null, 'x-c'], ['streetcat', 's-pk', 'x-s']]) { const sk = key(role, false), n = oldKeys(role).length; heldKeys(role).forEach(k => roleOf(pubOf(k), role)); const pk = sk ? pubOf(sk) : '— (none yet)';
    if (el) $(el).textContent = pk; $(x).textContent = pk; for (const id of [el + '-old', x + '-old']) if ($(id)) $(id).textContent = n ? ` + ${n} older key${n > 1 ? 's' : ''} kept` : ''; }
  const n = donorKeys().length, legacy = key('donor', false); $('x-d').textContent = (n ? `${n} key${n > 1 ? 's' : ''}, one per donation` : '— (none yet)') + (legacy ? ` · older shared key ${pubOf(legacy).slice(0, 10)}…` : ''); }
refreshKeys();
const makeKey = (role, warn) => { if (key(role, false) && !confirm(warn)) return; if (!setKey(role, newKey())) alert('This browser could not save a new key, so nothing changed.'); else buzz(); refreshKeys(); const code = role === 'clinic' ? null : $('s-pk'); if (code) flapKeys(code, code.textContent, { speed: .6, hex: true }); };
$('s-new').onclick = () => makeKey('streetcat', 'Make a new Streetcat key? New campaigns will use it. The current key stays in this browser, so tokens locked to it can still be released here.');
// a private key is shown on the page, never in a browser dialog (they stay on screen, and some browsers keep their text); with a PIN, it is asked again first
const showSk = async (role, b) => { const sk = key(role, false); if (!sk) return flapLabel(b, 'no key'); if (scVault.on() && !(await scVault.askPin('PIN, to show the key'))) return; scVault.reveal(`${role === 'clinic' ? 'Clinic' : 'Streetcat'} private key · keep it secret`, sk); };
$('s-show').onclick = () => showSk('streetcat', $('s-show'));
// the PIN that locks the keys on this phone (vault.js): set, lock now, remove; in Keys and in the partner's settings
const pinDraw = () => { const on = scVault.on(); for (const p of ['x', 'cs']) { $(p + '-pin-sum').textContent = 'PIN for the keys · ' + (on ? 'on' : 'off'); for (const id of ['a', 'b', 'set']) $(`${p}-pin-${id}`).hidden = on; for (const id of ['lock', 'off']) $(`${p}-pin-${id}`).hidden = !on; } };
for (const p of ['x', 'cs']) { const out = $(p + '-pin-out'), A = $(p + '-pin-a'), B = $(p + '-pin-b');
  // a second tap while the PIN is being set (its key takes a moment to make) does nothing (Daybreak, 14 Nov: it left every key unreadable; vault.js)
  $(p + '-pin-set').onclick = async () => { const btn = $(p + '-pin-set'); if (btn.disabled) return; if (A.value.length < scVault.MIN) return show(out, `✗ A PIN has ${scVault.MIN} characters or more.`, 'bad'); if (A.value !== B.value) return show(out, '✗ The two PINs are not the same.', 'bad');
    busy(btn, true); show(out, 'locking…'); try { await scVault.set(A.value); A.value = B.value = ''; buzz(); show(out, '✓ Keys locked. The PIN is asked when the app opens.', 'ok'); } catch (e) { show(out, '✗ ' + ((e && e.message) || e), 'bad'); } busy(btn, false); pinDraw(); };
  $(p + '-pin-lock').onclick = () => { scVault.lock(); location.reload(); };
  $(p + '-pin-off').onclick = async () => { const btn = $(p + '-pin-off'); if (btn.disabled) return; busy(btn, true);
    try { const pin = await scVault.askPin('PIN, to remove it'); if (pin) { await scVault.clear(pin); show(out, 'PIN removed: the keys are kept as before.'); } } catch (e) { show(out, '✗ ' + ((e && e.message) || e), 'bad'); } busy(btn, false); pinDraw(); }; }
pinDraw();
for (const [id, role] of [['s-copy', 'streetcat']]) $(id).onclick = async () => { const b = $(id), sk = key(role, false);  // the public key is what goes into a campaign
  if (!sk) return flapLabel(b, 'no key'); const ok = await copyText(pubOf(sk)); if (ok) doneLabel(b); else flapLabel(b, 'select it'); if (ok) termShow(pubOf(sk), role, { hex: true, ms: 6000 }); };
// everything else this browser keeps goes with the keys: campaigns, donations, requests, partners, colonies, cat records, released tokens, settings, and the photos. The keys
// stay where they were in the export, so an app of before still takes them. Not moved: what is under way here (payments and swaps
// this browser finishes), caches, and this browser's own screen. Nor where this browser sends what it is paid (Rescue's and the
// partner's Lightning address): each phone is told by hand, so that an export made by someone else cannot send it its payments
// (Daybreak, 14 Nov: imported into a browser that had none, the address was taken, and every payment went to it by itself).
const XSKIP = new Set(['vetlock.clinic.sk', 'vetlock.streetcat.sk', 'vetlock.donor.sk', 'vetlock.clinic.old', 'vetlock.streetcat.old', 'vetlock.donor.keys', 'vetlock.pending', 'vetlock.inflight', 'vetlock.outbox', 'vetlock.mintcache', 'vetlock.probe', 'vetlock.role', 'vetlock.kform', 'vetlock.sc.payto', 'vetlock.clinic.payto']);
const XPAYTO = ['vetlock.sc.payto', 'vetlock.clinic.payto'];
// By actor: the actor is the role on
// screen, fixed at /clinic and /streetcat. The partner's export carries the clinic keys and the partner's records; Rescue's carries
// Streetcat's keys, Rescue's records, and this browser's own refund keys and donations (Streetcat gives to its own pots in tests;
// those keys are this browser's user's, never a partner's). Settings go with both. Importing takes only this actor's part and says
// what it left out.
const XROLE = { clinic: { keys: ['clinic'], pre: ['vetlock.clinic.'], who: 'the partner' }, streetcat: { keys: ['streetcat', 'donor'], pre: ['vetlock.sc.', 'vetlock.campaigns', 'vetlock.released', 'vetlock.volunteer.', 'vetlock.donor.', 'vetlock.walletreqs'], who: 'Rescue' } };
const XSHARED = ['vetlock.relays', 'vetlock.rate', 'vetlock.anim', 'vetlock.holdms', 'vetlock.campcolors'];
const xActor = () => XROLE[nav.dataset.role] ? nav.dataset.role : 'streetcat', xOwns = (role, k) => XSHARED.includes(k) || XROLE[role].pre.some(p => k === p || (p.endsWith('.') && k.startsWith(p)));
const xMovable = k => /^vetlock\.[\w.-]+$/.test(k) && !XSKIP.has(k), xObj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const xData = role => { const d = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i), v = xMovable(k) && xOwns(role, k) ? (scVault.SLOTS.includes(k) ? ls.get(k) : localStorage.getItem(k)) : null;  /* a key under the PIN, opened: an export carries it as the other keys */ if (v != null && !['', '[]', '{}', 'null'].includes(v)) d[k] = v; } } catch (_) {}
  if (LEDGER_IDB) { delete d[SCLEDGER]; if (xOwns(role, SCLEDGER) && Object.values(LEDGER || {}).some(L => Object.keys(L.entries || {}).length)) d[SCLEDGER] = JSON.stringify(LEDGER); }  /* in IndexedDB now: what is left in localStorage is older */
  return d; };
const xKeys = role => { const j = { clinic: null, clinicOld: [], streetcat: null, streetcatOld: [], donor: null, donorKeys: [] };
  for (const r of XROLE[role].keys) { if (r === 'donor') { j.donor = key('donor', false); j.donorKeys = donorKeys(); } else { j[r] = key(r, false); j[r + 'Old'] = oldKeys(r); } } return j; };
const xPhotosOf = (ph, d) => { if (!ph) return ph; const text = Object.values(d).join('\n'), photos = {}, parts = {};  /* only the photos this actor's records name */
  for (const [k, v] of Object.entries(ph.photos)) if (text.includes(k)) photos[k] = v; for (const [k, v] of Object.entries(ph.parts)) if (text.includes(k.split('|')[0])) parts[k] = v; return { photos, parts }; };
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
$('x-exp').onclick = async () => { if (scVault.on() && !(await scVault.askPin('PIN, to export the keys'))) return; if (!LEDGER) await LEDGER_READY;  /* every private key, in the clear: asked for like "private" (review of 12 Nov) */
  const role = xActor(), j = xKeys(role), d = xData(role); if (!XPHP) xPrep();
  let ph = xPhotosOf(XPH, d), text = xText(j, d, ph); show($('x-out'), '');
  const rows = [['streetcat', j.streetcat, 'Streetcat'], ...j.streetcatOld.map(k => ['streetcat', k, 'Streetcat · older']), ['clinic', j.clinic, 'clinic'], ...j.clinicOld.map(k => ['clinic', k, 'clinic · older']), ...j.donorKeys.filter(k => k.sk).map(k => ['donor', k.sk, `refund · ${k.campaign || 'donation'}`])].filter(r => r[1]);
  // a browser with no keys and nothing else has no export: the box stays empty (a browser with none:
  // its own empty export stayed in the box, and Import (then "Import keys") took it and said «Imported»)
  const has = rows.length || xWhat(d, ph && ph.photos); $('x-box').value = has ? text : '';
  // copied at once, while the tap still counts: an iPhone lets a page copy only then, not seconds later, once the keys have typed
  // themselves out. The photos were read ahead; if not
  // yet, it copies once they are (where a phone refuses that, the export stays in the box, below)
  const copied = !has ? Promise.resolve(false) : ph ? copyText(text) : XPHP.then(p => { ph = xPhotosOf(p, d); text = xText(j, d, ph); $('x-box').value = text; return copyText(text); });
  // the keys, one after another, each in its role's colour, then what goes with them, then the whole export to copy
  const term = $('x-term'); term.querySelectorAll('.term-text').forEach(e => e.remove()); const o = document.createElement('div'); o.className = 'term-text keys'; o.onclick = () => o.remove(); term.appendChild(o);
  if (!has) { o.textContent = `no ${XROLE[role].who === 'Rescue' ? 'Streetcat' : 'clinic'} keys in this browser yet`; show($('x-out'), `✗ This browser has no keys of ${XROLE[role].who} yet: nothing to export. Export them in the browser that has them, then import them here.`, 'bad'); return; }
  for (const [i, [role, sk, label]] of rows.entries()) { const line = document.createElement('div'); line.className = 'kline'; line.style.setProperty('--h', String(HUE[role])); const l = document.createElement('small'); l.textContent = label; line.appendChild(l); const v = document.createElement('span'); line.appendChild(v); o.appendChild(line); o.scrollTop = o.scrollHeight; await new Promise(r => typeKeys(v, roleOf(pubOf(sk), role), { hex: true, dur: 520, think: false, done: () => { const c = v.querySelector('.cur'); if (c && i < rows.length - 1) c.remove(); r(); } })); }
  const ok = await copied, what = xWhat(d, ph && ph.photos), said = t => { const e = document.createElement('div'); e.className = 'mut'; e.style.marginTop = '8px'; e.style.lineBreak = 'auto'; e.style.overflowWrap = 'break-word'; e.textContent = t; return e; };  // words, not keys: whole
  if (what) o.appendChild(said((rows.length ? 'and ' : '') + what));
  if (ok) { const done = said(''); done.textContent = `${XROLE[role].who}'s export (with private keys) is in your clipboard · keep it somewhere safe · paste it in the other browser's Keys, as ${XROLE[role].who}, then Import all`; o.appendChild(done); o.scrollTop = o.scrollHeight; return; }
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
const xSet = (k, v) => { if (scVault.SLOTS.includes(k)) return ls.set(k, v) && ls.get(k) === v;  /* under the PIN, sealed as it is written */
  try { localStorage.setItem(k, v); return localStorage.getItem(k) === v; } catch (_) { return false; } };
const xMerge = (k, v) => { let mine = null; try { mine = scVault.SLOTS.includes(k) ? ls.get(k) : localStorage.getItem(k); } catch (_) {} if (mine == null || ['', '[]', '{}', 'null'].includes(mine)) return xSet(k, v);
  let a, b; try { a = JSON.parse(mine); b = JSON.parse(v); } catch (_) { return true; }  // a setting this browser has: kept
  const m = JSON.stringify(xUnion(a, b)); return m === JSON.stringify(a) || xSet(k, m); };
// the donations of an export: those this browser lacks come, and one it has gains what the export adds to it (a part, a rest)
async function ledgerImport(v){ await LEDGER_READY; let b; try { b = JSON.parse(v); } catch (_) { return true; } let ok = true;
  for (const [id, L] of Object.entries(xObj(b))) { const mine = (LEDGER[id] || { entries: {} }).entries, changed = {};
    for (const [ref, e] of Object.entries(xObj(L && L.entries))) { if (!e || typeof e !== 'object') continue; const m = mine[ref] ? lmerge(mine[ref], e) : e; if (JSON.stringify(m) !== JSON.stringify(mine[ref])) changed[ref] = m; }
    if (Object.keys(changed).length) ok = (await ledgerWrite(id, changed)) && ok; }
  return ok; }
// What carries a check of its own is checked again as it comes in, as when it comes by relay or by link: an export is text anyone can
// write (Daybreak, 14 Nov). A request waiting for the partner's review can be confirmed only with Streetcat's signature on it (C7: by
// link, file or QR nothing else says who made it, and an export says nothing either); a cat record only signed with the clinic key it
// names, or it is left out. `out.dropped` counts those left out.
const REQ_BROKEN = 'its signature does not match: it was changed after Streetcat signed it', REQ_UNSIGNED = 'it is not signed by Streetcat: ask Streetcat to send it again';
async function xChecked(k, v, out){ let a; try { a = JSON.parse(v); } catch (_) { return v; } if (!Array.isArray(a)) return v;
  if (k === 'vetlock.clinic.requests') { for (const r of a) { if (!r || typeof r !== 'object' || r.state !== 'review' || !r.q) continue; let sg = 'broken'; try { sg = await window.scCore.requestSig(r.q); } catch (_) {}
      const un = sg === 'broken' ? [REQ_BROKEN] : sg !== 'signed' ? [REQ_UNSIGNED] : []; if (un.length) r.unsigned = un; else delete r.unsigned; }
    return JSON.stringify(a); }
  if (k === 'vetlock.sc.cats' || k === 'vetlock.clinic.cats') { const keep = []; for (const x of a) { let v2 = null; try { v2 = x && x.rec && x.id === x.rec.id ? await window.scCore.catCheck(x.rec) : null; } catch (_) {} if (v2 && v2.ok) keep.push(x); else out.dropped++; }
    return JSON.stringify(keep); }
  return v; }
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
  // this actor's part only: the other actors' keys and records stay out, and it says so (a clinic never gets Streetcat's key this way)
  const role = xActor(), mine = XROLE[role], left = [];
  if (!mine.keys.includes('clinic') && (j.clinic || list(j.clinicOld).length)) left.push('the clinic key');
  if (!mine.keys.includes('streetcat') && (j.streetcat || list(j.streetcatOld).length)) left.push('Streetcat\'s key');
  if (!mine.keys.includes('donor') && (j.donor || dks.length)) left.push('the refund keys');
  const theirs = Object.keys(xObj(j.data)).filter(k => xMovable(k) && !xOwns(role, k)); if (theirs.length) left.push(`${theirs.length} record${theirs.length > 1 ? 's' : ''} of ${role === 'clinic' ? 'Rescue' : 'the partner'}`);
  const mineKeys = mine.keys.some(r => r === 'donor' ? (j.donor || dks.length) : (j[r] || list(j[r + 'Old']).length)), mineData = Object.keys(xObj(j.data)).some(k => xMovable(k) && xOwns(role, k) && !XSHARED.includes(k));
  if (!mineKeys && !mineData) { $('x-box').value = ''; return show(out, `✗ This export has nothing of ${mine.who}: nothing imported, and the box is emptied (it held another actor's private keys). It carries ${left.join(', ')}: import it in ${role === 'clinic' ? 'Rescue\'s' : 'the partner\'s'} app, not here.`, 'bad'); }
  let saved = true;
  for (const r of ['clinic', 'streetcat']) { if (!mine.keys.includes(r)) continue; for (const k of list(j[r + 'Old']).map(lc)) if (k !== key(r, false)) saved = keepOld(r, k) && saved; if (j[r]) saved = setKey(r, lc(j[r])) && saved; }
  // the refund keys, each write checked (Daybreak, 14 Nov: "Imported" was said when the phone had kept none of them); this browser's
  // older shared key goes to the list first, and is replaced only once it is there
  if (mine.keys.includes('donor')) { const legacy = key('donor', false), give = !!(j.donor && legacy && legacy !== lc(j.donor)), moved = !give || addDonorKey({ sk: legacy, pk: pubOf(legacy) }); saved = moved && saved;
    if (j.donor && moved) saved = ls.set(KEYS.donor, lc(j.donor)) && key('donor', false) === lc(j.donor) && saved;
    for (const k of dks) saved = addDonorKey({ ...k, sk: lc(k.sk), pk: pubOf(k.sk) }) && saved; }
  // everything else of this actor: campaigns, donations, requests… (checked again where they carry a check: xChecked) and the photos
  // its records name, each checked against its SHA-256
  const chk = { dropped: 0 }, d = [];
  for (const [k, v] of Object.entries(xObj(j.data))) if (xMovable(k) && xOwns(role, k) && typeof v === 'string') d.push([k, await xChecked(k, v, chk)]);
  for (const [k, v] of d) saved = (k === SCLEDGER ? await ledgerImport(v) : xMerge(k, v)) && saved;
  const named = d.map(([, v]) => v).join('\n');
  const phs = Object.entries(xObj(j.photos)).filter(([k, v]) => /^[0-9a-f]{64}$/.test(k) && typeof v === 'string' && named.includes(k));
  for (const [sha, b] of phs) { let ok = false; try { ok = await photoHere(sha) || await keepPhoto(sha, unb64(b)); } catch (_) {} saved = ok && saved; }
  for (const [k, v] of Object.entries(xObj(j.parts))) if (typeof v === 'string' && named.includes(k.split('|')[0])) { try { if (!(await IDB.get('parts', k))) await IDB.put('parts', k, v); } catch (_) {} }
  CAMPMAP = null; refreshKeys(); for (const r of ['sc', 'clinic']) jset(RMARKS(r), {});  /* what it brought may have answers waiting: the next check reads all nine days */ try { renderHome(); } catch (_) {} xPrep(); const what = xWhat(Object.fromEntries(d), Object.fromEntries(phs));
  if (saved) { buzz(); $('x-box').value = ''; }
  const leftOut = left.length ? ` Left out, not ${mine.who}'s: ${left.join(', ')}; import the export in ${role === 'clinic' ? 'Rescue\'s' : 'the partner\'s'} app for those.` : '';
  const payNote = XPAYTO.some(k => xOwns(role, k) && String(xObj(j.data)[k] || '').trim()) ? ' Its Lightning address is not imported: set yours here.' : '';  /* an export of before carries one (XSKIP) */
  const dropNote = chk.dropped ? ` ${chk.dropped} cat record${chk.dropped > 1 ? 's' : ''} left out: not signed by the clinic key ${chk.dropped > 1 ? 'they name' : 'it names'}.` : '';
  const warn = !!(left.length || payNote || dropNote);
  if (saved && window.scRelay) window.scRelay.retry();  /* messages that waited for what was imported are tried again */
  show(out, saved ? `${warn ? '⚠ ' : ''}Imported, as ${mine.who}. The keys this browser had before are kept too.` + (what ? ` With them: ${what}; what this browser had stays too.` : '') + leftOut + payNote + dropNote + ' Copy something else now, so the keys do not stay in the clipboard.' : '✗ This browser could not save everything (it may be full). Nothing was deleted; try again.', saved && !warn ? '' : 'bad'); };  /* something left out: a warning, in red */

// campaign from URL
// A campaign tapped in "Check for requests" goes in the address marked as picked (&pick=1), and this session remembers it (sessionStorage).
// Opened in a new session — the app closed and opened again — it is dropped and Donate starts with nothing chosen;
// a reload in the same session (the phone back from the wallet app) keeps it. A link opened from outside carries no mark and opens as always.
const ss = { get(k){ try { return sessionStorage.getItem(k); } catch (_) { return null; } }, set(k, v){ try { sessionStorage.setItem(k, v); } catch (_) {} }, del(k){ try { sessionStorage.removeItem(k); } catch (_) {} } };
const SS_PICK = 'vetlock.d.pick', SS_PAYING = 'vetlock.d.paying';  /* the campaign picked, and the invoice on screen, in this session */
// The iPhone's home-screen app opens no link from outside (iOS hands those to Safari), so a campaign in its address when it opens is one it
// was left at, or the one its icon was made with (an icon added from a donation link keeps that link): dropped too, unless an invoice of this session is on screen.
const iosApp = (() => { try { return navigator.standalone === true; } catch (_) { return false; } })();
let hashStart = true;
const fromHash = () => { const start = hashStart; hashStart = false;
  if (start && location.hash.includes('#c=') && ((iosApp && !ss.get(SS_PAYING)) || (/[#&]pick=1(&|$)/.test(location.hash) && ss.get(SS_PICK) !== location.hash))) { history.replaceState(history.state, '', location.pathname + location.search); return; }  /* picked in a session that is over, or the iPhone app opening */
  if (location.hash.includes('#c=')) { $('d-camp').value = location.href; showCamp();  // a campaign link opened from another tab of this page: go to Donate
  if (nav.dataset.role !== 'donor' || !document.getElementById('donate').classList.contains('on')) { openTab('donate'); window.scrollTo(0, 0); } } };
window.addEventListener('hashchange', fromHash); fromHash();
$('d-camp').addEventListener('input', showCamp); showCamp();
// a campaign that comes on screen is typed in line by line, with the cursor and the flipping letters of the terminal;
// each line keeps its room while it waits, and the cursor goes once the last line is in. With `later`, the lines wait empty
// until the returned function is called (a pasted link is typed first)
function typeLines(els, later = false){ const run = typeLines.n = (typeLines.n || 0) + 1;
  // a key that has just come onto the screen is still typing itself in (COLOURED TEXTS MOVE, below), its letters not all there yet: it is
  // settled first, or the line was read without its keys and typed in without them (review of 9 Nov, U1: the donor's campaign said
  // "clinic · Streetcat" with neither key)
  for (const e of els) for (const x of [e, ...e.querySelectorAll('*')]) if (x._type) x._type();
  const texts = els.map(e => e.textContent);
  const own = els.map(e => e.children.length ? [...e.childNodes] : null);  /* a line with a part in its own colour (the Partner's "✗ not valid", red) is typed over its own nodes, and keeps them */
  els.forEach(e => { const h = e.offsetHeight + 'px'; Object.assign(e.style, { minHeight: h, maxHeight: h, overflow: 'hidden' }); e.textContent = ''; });  /* a cursor at a full line's end never pushes the page down */
  const next = i => { if (typeLines.n !== run) return; if (i > 0 && els[i - 1]._type) els[i - 1]._type();
    const done = () => { if (i < els.length - 1) return next(i + 1); setTimeout(() => { if (typeLines.n === run) els.forEach(e => { if (e._type) e._type(); Object.assign(e.style, { minHeight: '', maxHeight: '', overflow: '' }); }); }, 1200); };
    if (own[i]) { if (els[i]._type) els[i]._type(); els[i].replaceChildren(...own[i]); typeRun(els[i], texts[i], { done }); } else typeKeys(els[i], texts[i], { keys: false, done }); };
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
    window.scCore.campaignSig(c).catch(() => 'broken').then(st => { if (box._t !== t) return; $('donate').classList.toggle('sigbad', st !== 'signed' || foreign);  /* not signed, a broken signature, or not Streetcat's published key: nothing can be paid */
      sg.classList.add(st === 'signed' && !foreign ? 'ok' : 'bad');  /* not signed, broken, or not Streetcat's published key: red */ sg.textContent = foreign ? '✗ ' + NOT_PUBLISHED : st === 'signed' ? `✓ signed by Streetcat ${abbr(String(c.streetcat).toLowerCase())}` : st === 'broken' ? '✗ The signature on this link does not match: it was changed after Streetcat made it. Do not donate through it.' : '✗ This link is not signed by Streetcat, so it could have been changed: it takes no donations. Ask Streetcat for the link again.';
      sm.remove();  /* the mint warning was for unsigned links, which take no donations now */
      { const h = $('hd-camp'); if (h) { const was = h.textContent; h.textContent = c.name; tt.classList.toggle('whole', h.scrollWidth > h.clientWidth + 1); h.textContent = was; } }  /* a name the header would cut is written whole here too: a donor reads which campaign it pays (decided with the whole name, before it is typed in) */
      box.style.visibility = ''; if (fresh) { const go = typeLines([tt, o, w, sg, ...(sm.isConnected ? [sm] : [])], true); if (!$('d-paste').hidden) typeLink(ta, hue, go); else go(); } });
  } catch (e) { box._camp = ''; const b = document.createElement('div'); b.className = 'out bad'; b.textContent = 'cannot read campaign: ' + e.message; box.appendChild(b); } }
// CHECK FOR REQUESTS: the campaigns Streetcat
// announced on the relays (relay.js), signed with its published key and still open, typed in where the campaign shows, one per line in its
// own colour; a tap opens one as its link would. Nothing found, or no relay reached, is said there instead (the latter in red).
const daysLeft = d => { const n = Math.ceil((Number(d) - Date.now() / 1000) / 86400); return n <= 1 ? 'last day' : n + ' days left'; };
function reqsBox(){ const box = $('d-reqs'); box.textContent = ''; box.hidden = false; $('d-paste').hidden = true; $('d-campinfo').hidden = true; asideStep(); updateBack(); return box; }
const reqsDone = () => { $('d-reqs').hidden = $('d-kinds').hidden = true; $('d-campinfo').hidden = false; $('d-paste').hidden = location.hash.includes('#c='); updateBack(); };
const reqsSay = (text, cls) => { const box = reqsBox(), m = el('div'); $('d-kinds').hidden = true; box.appendChild(m); show(m, text, cls); $('d-paste').hidden = location.hash.includes('#c='); $('d-campinfo').hidden = false; };
// what Streetcat has open, as its announcements say (relay.js); above them the same four kinds as Rescue's, two by two: none chosen, all of them; one, only it
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
// The latest request on top, as before; under it, in a box like the one Keys types its keys into, every earlier one, newest first: its
// name in its colour, a tap opens it; what it is for in small yellow letters, in two yellows for the two kinds of line. Newest first: when each was made, as its announcement says (relay.js).
function drawAnn(){ const box = reqsBox(), kinds = $('d-kinds'); kinds.hidden = false; kindChips(kinds, D_KIND, id => { D_KIND = D_KIND === id ? '' : id; drawAnn(); });
  const t = D_KIND ? KIND(D_KIND) : null, shown = DANN.filter(a => !t || typeOf(a.c) === t.id);
  const head = el('div', 'mut', !shown.length ? `Nothing open for ${t.one} right now.` : `Latest request from Streetcat${t ? ' · ' + t.one : ''} · tap it`), typed = [head]; box.appendChild(head);
  let old = null;  /* the box of the earlier ones, made with the first of them */
  for (const [i, { c, kind, cats }] of shown.entries()) { const req = kind === 'request', own = req ? (cats || []).find(x => lc(x.name) === lc(c.name)) : null, b = el('button', 'req'), ti = el('div', 'title', c.name), what = c.op || KIND(typeOf(c)).one;
    // the donor's words for a request's state: 'done' is the partner's confirmation; 'released' is the sats going to Streetcat's reserve
    // (not a payment to the partner, which the app does not see); an older announcement's 'paid' meant that same release
    const sayState = st => ({ requested: 'requested', done: 'confirmed by the partner', released: 'sats released to Streetcat', paid: 'sats released to Streetcat' })[st] || st;
    const s = el('div', 'sub2', req ? `request · ${what} · ${own ? (own.state === 'requested' ? 'at the partner' : sayState(own.state)) : daysLeft(c.deadline)}` : [what, c.colony, daysLeft(c.deadline)].filter(Boolean).join(' · ')), more = req ? [] : (cats || []).map(x => el('div', 'cat', `· ${x.name} · ${x.procedure} · ${sayState(x.state)}`));
    b.type = 'button'; b.style.setProperty('--h', String(campHue(c))); b.appendChild(ti); b.appendChild(s); more.forEach(x => b.appendChild(x)); b.onclick = () => { reqsDone(); const h = '#c=' + b64u.enc(JSON.stringify(c)) + '&pick=1'; ss.set(SS_PICK, h); location.hash = h; };
    if (i && !old) { const lb = el('div', 'mut', `Earlier requests · ${shown.length - 1} · tap a name`), term = el('div', 'term rold'); old = el('div', 'term-text keys'); term.appendChild(old); box.appendChild(lb); box.appendChild(term); typed.push(lb); }
    (i ? old : box).appendChild(b); typed.push(ti, s, ...more); }
  typeLines(typed); }

// DONATE
const lockFor = (c, refundPk) => { if (!published(c.streetcat)) throw Object.assign(new Error(NOT_PUBLISHED), { byPage: true });
  if (c.lock === 'dest') return { dest: { streetcat: c.streetcat, payees: window.scCore.payeesOf(c), deadline: Number(c.deadline), refund: refundPk } };  /* its secrets are made in buildOutputs: cashu-ts has no such lock */
  return lockBuilder(c, refundPk); };  // whatever the route: Lightning, ecash, a Cashu wallet
const lockBuilder = (c, refundPk) => new cashu.LockBuilder().addMainPubkey([c.streetcat, c.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(Number(c.deadline));
const newDonorKey = c => { const sk = newKey(), pk = pubOf(sk); campHue(c);  // saved before anything is paid or swapped, or nothing is
  if (!addDonorKey({ campaign: c.name, deadline: Number(c.deadline), hue: c.hue, pk, sk, created: new Date().toISOString() })) throw Object.assign(new Error('this browser could not save the key that takes these sats back (its storage is full or blocked), so nothing was paid: free some room in this browser and try again'), { byPage: true });
  return { sk, pk }; };
const lockedOf = (c, locked) => cashu.getEncodedToken({ mint: c.mint, proofs: locked, memo: `${c.name} ${c.op || ''} — vet-certified donation` });
const keepLocked = (c, pk) => got => addDonorKey({ pk, lockedToken: lockedOf(c, got), amount: sum(got), mint: c.mint });  // the swap's record stays until this browser has the token
function renderLocked(c, locked, sk){ const out = $('d-out');
  const lockedToken = lockedOf(c, locked);
  addDonorKey({ pk: pubOf(sk), lockedToken, amount: sum(locked), mint: c.mint, camp: c.sig ? { ...window.scCore.campSigned(c), sig: c.sig } : { ...window.scCore.campaignOf(c), ...(c.hue != null ? { hue: Number(c.hue) } : {}) } });  // this browser keeps the token too, for the refund tab
  if (!lockMatches(c, pubOf(sk), locked)) { $('donate').classList.remove('paying'); show(out, 'CHECK FAILED: the ecash the mint returned does not carry the lock this campaign promises. Do not send it to anyone. Save your receipt below and write to Streetcat.', 'bad'); receiptBox(out, { c, lockedToken, locked, sk, pk: pubOf(sk) }); return; }
  const late = Number(c.deadline) <= Date.now() / 1000 ? ` The deadline passed while you were paying: these sats are yours to take back right away, in Take my sats back.` : '';
  $('donate').classList.remove('paying'); $('donate').classList.add('done'); updateBack(); asideStep(); buzz();
  out.textContent = ''; out.className = 'out ok';
  const wrap = document.createElement('div'); wrap.className = 'paid term';
  const hd = document.createElement('div'); hd.className = 'hero'; hd.style.margin = '0'; const big = document.createElement('div'); big.className = 'big'; big.textContent = fmtNum(sum(locked)); hd.appendChild(big); const u = document.createElement('div'); u.className = 'unit'; u.textContent = 'sat'; hd.appendChild(u); const fi = document.createElement('div'); fi.className = 'fiat'; hd.appendChild(fi); fiatInto(fi, sum(locked)); wrap.appendChild(hd);
  wrap.appendChild(lockBar('locked', c.lock !== 'dest')); const stt = document.createElement('div'); stt.className = 'state'; stt.textContent = `LOCKED ${fmtSat(sum(locked))} for ${c.name}.` + late; wrap.appendChild(stt); out.appendChild(wrap);
  const fold = (label, text) => { const d = document.createElement('details'); d.className = 'more'; const s = document.createElement('summary'); s.textContent = label; d.appendChild(s); d.appendChild(document.createTextNode('\n')); const t = document.createElement('span'); t.className = 'mut code'; t.textContent = text; d.appendChild(t); d.appendChild(document.createTextNode('\n')); return d; };
  const step = text => { const l = document.createElement('p'); l.className = 'center'; l.textContent = text; out.appendChild(l); };
  step(`1 · Save your private receipt: with it you take these sats back after ${fmtDate(c.deadline)}. Keep it to yourself.`);  /* it holds the refund key; nothing comes back by itself */
  receiptBox(out, { c, lockedToken, locked, sk, pk: pubOf(sk) });
  step(OUTBOX ? `2 · It goes to Streetcat by itself.` : `2 · Send the locked token to Streetcat${c.to ? ' (' + c.to + ')' : ''}.`);  /* no relay code: by hand */
  const row = document.createElement('div'); row.className = navigator.share ? 'row2' : 'row1'; row.appendChild(copyBtn('copy token', lockedToken, { role: 'donor' }));
  if (navigator.share) row.appendChild(smallBtn('share token', () => navigator.share({ title: `${c.name} donation`, text: lockedToken }).catch(() => {})));
  out.appendChild(row); out.appendChild(fold('token text', lockedToken)); out.appendChild(document.createTextNode('\n')); donorExtras(out, row, c, lockedToken, sk, locked);
  const again = document.createElement('p'); again.className = 'center'; again.style.marginTop = 'auto'; const ag = document.createElement('a'); ag.href = '#'; ag.textContent = 'donate again'; ag.id = 'd-again'; ag.style.cssText = 'color:var(--mute);text-decoration:none;border-bottom:1px solid var(--line)'; ag.onclick = e => { e.preventDefault(); leaveAside(); }; again.appendChild(ag); out.appendChild(again);
  { const mw = el('p', 'center more-w'), mb = el('button', 'morebtn', '···'); mb.type = 'button'; mb.setAttribute('aria-label', 'More'); mw.style.marginTop = 'auto'; again.style.marginTop = ''; mw.appendChild(mb); out.appendChild(mw);
    moreSheet(mb, 'd-sheet', [OUTBOX ? row : null, [...out.querySelectorAll('details.more')].find(d => /token text/.test(d.firstChild.textContent)), [...out.querySelectorAll('p.lnk')].find(p => /hand it over/.test(p.textContent)), again], out); } }  /* with no relays the token goes by hand: its buttons stay in sight */
// ecash pasted on the "Pay with ecash" screen, when this browser could not make a payment request (its relay code did not load):
// swapped straight into the campaign's lock with a new refund key. Otherwise the request's own path takes it (takeWalletEcash).
async function lockPlain(tok, out){ const c = await openSigned($('d-camp').value); if (!storageWorks()) throw new Error(NO_STORAGE);
  const from = cashu.getTokenMetadata(tok).mint; if (norm(from) !== norm(c.mint)) throw new Error(otherMint(from, c));  /* before asking any mint */
  show(out, 'contacting the mint…'); const w = await wallet(c.mint), dec = w.decodeToken(tok);
  const { sk, pk } = newDonorKey(c);
  const locked = await safeSwap(w, dec.proofs, { lock: lockFor(c, pk), what: { kind: 'donation', campaign: c, pk }, mint: c.mint, keep: keepLocked(c, pk) });
  show(out, ''); if (nav.dataset.role !== 'donor' || !$('donate').classList.contains('on')) openTab('donate'); renderLocked(c, locked, sk); return true; }

// DONATE WITH LIGHTNING: the mint's invoice (NUT-04); once paid, the page mints outputs already locked (NUT-11), so the sats are never spendable by anyone else
// the amount chosen is said on both ways to pay: the payment request of "Pay with ecash" carries it, as the Lightning invoice does
const payLabel = () => { const n = Number($('d-amt').value), k = n > 0 ? `Pay ${fmtSat(n)} with ` : 'Pay with '; $('d-ln').textContent = k + 'Lightning'; $('d-toecash').textContent = k + 'ecash'; document.querySelectorAll('button[data-amt]').forEach(x => x.classList.toggle('on', Number(x.dataset.amt) === n)); };
// a tap on a way to pay while the amount is still flipping takes the amount chosen, never a flipping digit
const settleAmt = () => { const inp = $('d-amt'); if (inp._flap) { cancelAnimationFrame(inp._flap); inp._flap = null; if (inp._target) inp.value = inp._target; inp._target = null; } };
document.querySelectorAll('button[data-amt]').forEach(b => b.addEventListener('click', () => { const inp = $('d-amt'); inp.value = b.dataset.amt; inp._target = b.dataset.amt; payLabel(); if (!REDUCE()) { const target = b.dataset.amt, pool = '0123456789'.split(''), start = performance.now(), ps = target.split('').map(() => ({ at: 200 + Math.random() * 420, every: 40 + Math.random() * 40, step: -1, g: '' })); if (inp._flap) cancelAnimationFrame(inp._flap); const fr = now => { const t = now - start; let done = true; inp.value = target.split('').map((ch, i) => { const p = ps[i]; if (t >= p.at) return ch; done = false; const s = Math.floor(t / p.every); if (s !== p.step) { p.step = s; p.g = pool[Math.floor(Math.random() * 10)]; } return p.g; }).join(''); if (done) { inp.value = target; inp._flap = null; inp._target = null; return; } inp._flap = requestAnimationFrame(fr); }; inp._flap = requestAnimationFrame(fr); } }));
$('d-amt').addEventListener('input', () => { const inp = $('d-amt'); if (inp._flap) { cancelAnimationFrame(inp._flap); inp._flap = null; inp._target = null; } }); $('d-amt').addEventListener('input', payLabel); const fiatLine = async () => { const n = Number($('d-amt').value), r = await rate(); $('d-fiat').textContent = n > 0 && r ? `≈ ${eur(n, r)}` : ''; }; $('d-amt').addEventListener('input', fiatLine); document.querySelectorAll('button[data-amt]').forEach(b => b.addEventListener('click', fiatLine)); rate().then(fiatLine);
// the streetcat.com crypto card, measured from its screen recording: the line traces clockwise in 0.55 s at full orange, flashes
// yellow with a soft glow as it closes, settles at 45 % in 0.65 s, and from 1.9 s breathes every 1.8 s (up by 25 %, back by 65 %).
// Run by the Web Animations API with plain numbers: Safari does not animate an SVG dash offset taken from a CSS variable. With reduced
// motion only the breathing stays (a change of light, no movement).
// the flash, as on the card: yellow at its peak 0.1 s after the line closes, held 0.1 s, back to full orange by 0.35 s, dim by 0.65 s;
// the glow (soft orange outside, pale yellow inside) fades in light only, never in size
const qrGlow = k => `0 0 18px 2px rgba(255,130,40,${(.55 * k).toFixed(3)}), inset 0 0 18px 3px rgba(255,235,60,${(.5 * k).toFixed(3)})`;
const traceFrame = fr => { if (!fr || !fr.animate) return; (fr._anims || []).forEach(a => a.cancel()); const bars = [...fr.children], q = fr.closest('.qr'), io = 'ease-in-out', eo = 'ease-out', still = REDUCE(), a = [];
  if (!still) { const w = q.clientWidth, h = q.clientHeight, P = 2 * (w + h) || 1; let at = 0;
    bars.forEach((b, i) => { const d = 550 * (i % 2 ? h : w) / P, s = i % 2 ? 'scaleY' : 'scaleX'; a.push(b.animate([{ transform: s + '(0)' }, { transform: s + '(1)' }], { duration: d, delay: at, easing: 'linear', fill: 'backwards' })); at += d; });  /* clockwise from the top left corner, at one speed all round */
    a.push(fr.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 550, fill: 'backwards' }));
    const base = { background: '#f7931a', boxShadow: '0 0 0 0 #f7931a' }, lit = { background: '#ffff1f', boxShadow: '0 0 0 .5px #ffff1f' };  /* 1 px thicker while it flashes, as the card's line */
    bars.forEach(b => a.push(b.animate([{ ...base, easing: eo }, { ...lit, offset: .15 }, { ...lit, offset: .26, easing: eo }, { ...base, offset: .54, easing: eo }, base], { duration: 650, delay: 550 })));
    a.push(fr.animate([{ opacity: 1 }, { opacity: 1, offset: .54, easing: eo }, { opacity: .45 }], { duration: 650, delay: 550 }));
    if (q) a.push(q.animate([[0, 0], [.15, 1], [.26, 1], [.42, .58], [.57, .32], [.72, .13], [.92, 0], [1, 0]].map(([offset, k]) => ({ offset, boxShadow: qrGlow(k) })), { duration: 650, delay: 550 })); }
  a.push(fr.animate([{ opacity: .45, easing: io }, { opacity: 1, offset: .25, easing: io }, { opacity: .45, offset: .65 }, { opacity: .45 }], { duration: 1800, delay: still ? 0 : 1920, iterations: Infinity }));
  fr._anims = a; };
// the frame, put around a QR (hidden until drawn); returns what draws it, once per "copy": the Lightning invoice's, and the same around the
// ecash request
function qrFrame(qr){ if (!qr) return null; qr.style.position = 'relative';
  const fr = document.createElement('div'); fr.className = 'frame off'; for (const s of ['t', 'r', 'b', 'l']) { const b = document.createElement('span'); b.className = s; fr.appendChild(b); } qr.appendChild(fr);
  return () => { fr.classList.remove('off'); traceFrame(fr); }; }
let WAITING = null;  // the invoice this page is watching
// (both run while the page loads, when it opens again on a donation waiting for its payment: before `const C`, so window.scCore)
// when a Lightning invoice stops being payable: its own expiry (BOLT 11, read on the phone), and the mint's quote's only when it differs
// (plan step 1: not the refund date, and no constant hour)
function payEnd(p){ const ie = window.scCore.invoiceExpiry(p && p.request), xs = [ie && ie.expires, Number((p && p.expiry) || 0)].filter(Boolean); return xs.length ? Math.min(...xs) : 0; }
function payExpires(p){ const ie = window.scCore.invoiceExpiry(p && p.request), inv = ie ? ie.expires : 0, mint = Number((p && p.expiry) || 0), hm = t => new Date(t * 1000).toLocaleTimeString(EN, { hour: '2-digit', minute: '2-digit' });
  return inv ? ` · invoice expires ${hm(inv)}${mint && Math.abs(mint - inv) >= 60 ? ` · the mint's quote expires ${hm(mint)}` : ''}` : mint ? ` · the mint's quote expires ${hm(mint)}` : ''; }
function renderInvoice(p){ const out = $('d-out'); out.textContent = ''; out.className = 'out'; $('donate').classList.add('paying'); updateBack(); asideStep(); ss.set(SS_PAYING, p.quote);  /* on screen in this session: a reload brings it back */
  const stage = document.createElement('div'); stage.className = 'term scan'; const qr = qrSvg('lightning:' + p.request); if (qr) { qr.style.position = 'relative'; stage.appendChild(qr); } out.appendChild(stage);
  stage._retrace = qrFrame(qr);  // drawn on "copy invoice", as on the card
  const u = document.createElement('div'); u.className = 'center'; u.textContent = `${fmtSat(p.amount)} · pay with any Lightning wallet`; out.appendChild(u);
  const row = document.createElement('div'); row.className = 'row2'; const a = document.createElement('a'); a.className = 'sm'; a.href = 'lightning:' + p.request; a.textContent = 'open in wallet';
  const cb = copyBtn('copy invoice', p.request); cb.addEventListener('click', () => { if (stage._retrace) stage._retrace(); inv.classList.add('lit'); flap(inv, p.request, { speed: 1 }); }); row.appendChild(a); row.appendChild(cb); out.appendChild(row);
  const st = document.createElement('div'); st.className = 'center'; st.id = 'd-st'; st.textContent = 'waiting for the payment…' + payExpires(p); out.appendChild(st);
  const inv = document.createElement('div'); inv.className = 'invtext'; out.appendChild(document.createTextNode('\n')); out.appendChild(inv); out.appendChild(document.createTextNode('\n')); flap(inv, p.request, { speed: 1.3 }); }
async function collect(p, w){ const sk = p.sk || findDonorKey([p.pk]); if (!sk) throw new Error('the refund key for this invoice is missing from this browser');
  if (!p.outputs) { p.outputs = (await buildOutputs(w, p.amount, lockFor(p.campaign, p.pk))).map(outSave); savePending(p);  // saved before the mint is asked
    if (!(pendings().find(x => x.quote === p.quote) || {}).outputs) throw new Error(NO_STORAGE); }
  let locked; try { locked = await w.ops.mintBolt11(p.amount, p.quote).asCustom(p.outputs.map(outLoad)).run(); }
  catch (e) { let q = null; try { q = await w.checkMintQuoteBolt11(p.quote); } catch (_) {} if (!q || q.state !== 'ISSUED') throw e;
    locked = await restoreOutputs(w, p.outputs).catch(() => null); if (!locked) throw e; }  // the mint issued it but the answer was lost: ask for it again (NUT-09)
  return { locked, sk, kept: keptDonation(p.campaign, p.pk, locked, p.quote) }; }
// THE INVOICE GOES ONLY ONCE ITS DONATION IS KEPT (Daybreak, 14 Nov). The pending invoice holds the blank outputs the mint signed, from
// which the donation can be asked for again (NUT-09); it was dropped before the donation was written down, and a phone that could not
// write it then had it only on the screen. Now it stays until the donation is kept with its refund key, and is finished again when the
// app opens; meanwhile the screen says so, in red, over the receipt.
const keptDonation = (c, pk, locked, quote) => { const ok = addDonorKey({ pk, lockedToken: lockedOf(c, locked), amount: sum(locked), mint: c.mint }); if (ok) dropPending(quote); return ok; };
const notKept = () => { const out = $('d-out'); if (out) out.prepend(el('div', 'bad', '✗ No room in this browser to keep this donation: save the receipt below now. It is tried again when the app opens.')); };
// once paid, the QR's line stops breathing and stays on
async function waitAndMint(p){ const me = { quote: p.quote }; WAITING = me; renderPendings(); const st = () => $('d-st');
  let w = null, fails = 0, tried = false;
  const stop = (text, cls) => { dropPending(p.quote); WAITING = null; $('donate').classList.remove('paying'); show($('d-out'), text, cls); renderPendings(); };
  while (WAITING === me) {
    try { if (!w) w = await wallet(p.campaign.mint);
      const q = await w.checkMintQuoteBolt11(p.quote); if (WAITING !== me) return;  /* left with the arrow: kept below, and finished by pendCheck if paid */
      if (q.state === 'PAID') { if (st()) st().textContent = 'paid ✓ — locking your donation…'; const fp = document.querySelector('#d-out .frame'); if (fp) { (fp._anims || []).forEach(a => a.cancel()); fp.style.opacity = '1'; } tried = true; const { locked, sk, kept } = await collect(p, w); WAITING = null; renderLocked(p.campaign, locked, sk); if (!kept) notKept(); renderPendings(); return; }
      if (q.state === 'ISSUED') { const back = p.outputs ? await restoreOutputs(w, p.outputs) : null;  // a network error here goes to the retry below
        if (back) { const kept = keptDonation(p.campaign, p.pk, back, p.quote); WAITING = null; renderLocked(p.campaign, back, p.sk || findDonorKey([p.pk])); if (!kept) notKept(); renderPendings(); return; }
        // issued, but not with outputs this page knows: another tab may have it. Keep the record (marked) instead of deleting it.
        savePending({ ...p, stuck: true }); WAITING = null; renderPendings();
        show($('d-out'), (tried || p.outputs)
          ? `The mint says it issued the ecash for this invoice, but this page could not get it back (another tab or window may have it, or the mint does not support NUT-09). Look in your other tabs first; if it is not there, write to Streetcat with this invoice:\n${p.request}`
          : 'This invoice was already turned into a locked donation, probably in another tab or window. Look there for its receipt; this browser also keeps it under Donor: refund.', 'bad'); return; }
      if (payEnd(p) && Date.now() / 1000 > payEnd(p) + 60) return stop('The invoice expired without being paid. Nothing was charged; get a new one.', 'bad');
      fails = 0;
    } catch (e) { fails++; if (st()) { st().textContent = (fails > 3 ? 'paid or not, nothing is lost: this browser keeps the invoice and will finish when the mint answers. ' : 'retrying… ') + (e.message || e); st().classList.add('bad'); } }
    await new Promise(r => setTimeout(r, fails ? Math.min(15000, 2000 * fails) : 2000));
  } }
// Donate as it starts (the arrow, above): no donation shown, no invoice watched (it stays below, "resume"), no list, no amount
function donateReset(){ WAITING = null; ss.del(SS_PAYING); $('donate').classList.remove('done', 'paying'); show($('d-out'), ''); $('d-amt').value = ''; $('d-fiat').textContent = ''; payLabel();
  if (!$('d-reqs').hidden) reqsDone(); renderPendings(); updateBack(); window.scrollTo(0, 0); }
// an invoice left waiting (the arrow, a closed app, a wallet that took long): looked at each minute. Paid, the donation is locked and shown,
// as if it had been waited for (never over a donation or an invoice on screen: then at the check after); expired unpaid, it goes: nothing
// was charged, and a wallet cannot pay it any more
async function pendCheck(){ if (WAITING || $('donate').classList.contains('done') || $('donate').classList.contains('paying')) return;
  for (const p of pendings()) { if (p.stuck) continue; let q; try { q = await (await wallet(p.campaign.mint)).checkMintQuoteBolt11(p.quote); } catch (_) { continue; }
    if (WAITING || $('donate').classList.contains('done') || $('donate').classList.contains('paying')) return;
    if (q.state === 'PAID' || q.state === 'ISSUED') { if (!$('donate').classList.contains('on')) openTab('donate'); renderInvoice(p); waitAndMint(p); return; }
    const exp = Number(p.expiry || q.expiry || 0); if (q.state === 'UNPAID' && exp && Date.now() / 1000 > exp + 60) { dropPending(p.quote); renderPendings(); } } }
function renderPendings(){ const box = $('d-pend'); box.textContent = '';
  for (const p of pendings()) { if (WAITING && p.quote === WAITING.quote) continue;
    const row = document.createElement('div'); row.textContent = `${p.stuck ? 'Paid elsewhere or not recoverable here' : 'Unfinished Lightning donation'}: ${p.campaign.name} · ${fmtSat(p.amount)} · ${when(p.created)} `; if (p.stuck) row.className = 'bad';
    row.appendChild(smallBtn(p.stuck ? 'check again' : 'resume', () => { renderInvoice(p); waitAndMint(p); }));
    if (p.stuck) row.appendChild(smallBtn('forget', () => { if (confirm('Forget this invoice? Do it only once you have found the donation in another tab or written to Streetcat.')) { dropPending(p.quote); renderPendings(); } }));
    box.appendChild(row); } }
$('d-ln').onclick = async () => { const btn = $('d-ln'); busy(btn, true); try { settleAmt();  // a tap on Pay mid-flip pays the chosen amount, never a flipping digit
  const c = await openSigned($('d-camp').value); const amount = Number($('d-amt').value); if (!Number.isInteger(amount) || amount < 1) throw new Error('choose a whole number of sats');
  if (!storageWorks()) throw new Error(NO_STORAGE);
  show($('d-out'), 'asking the mint for an invoice…'); const w = await wallet(c.mint);
  /* a campaign that says where its money may go: the mint is asked now whether it enforces that, not once the invoice is paid (audit of 10 Nov: a mint that had stopped saying so left the paid sats in a quote this page would not mint) */
  if (c.lock === 'dest' && !(await mintDest(c.mint, true))) throw Object.assign(new Error('This campaign needs a mint that enforces where its donations may go, and this mint does not say it does. Do not donate through it.'), { byPage: true });
  const desc = `Streetcat · ${c.name} ${c.op || ''} · vet-certified donation`.slice(0, 100);
  let canDescribe = false; try { canDescribe = w.getMintInfo().supportsNut04Description('bolt11', 'sat'); } catch (_) {}
  const q = canDescribe ? await w.createMintQuoteBolt11(amount, desc) : await w.createMintQuoteBolt11(amount);
  const { pk } = newDonorKey(c);  /* the refund key is in the list of refund keys (newDonorKey), sealed by a PIN: the pending invoice names it by its public key only */
  const p = { quote: q.quote, request: q.request, amount, expiry: q.expiry || null, campaign: c, pk, created: new Date().toISOString() };
  savePending(p); if (!pendings().some(x => x.quote === p.quote)) throw new Error(NO_STORAGE);  // never show an invoice this browser could forget
  renderInvoice(p); renderPendings(); waitAndMint(p);
} catch (e) { $('donate').classList.remove('paying'); show($('d-out'), 'Failed: ' + (e.message || e), 'bad'); } busy(btn, false); };
// back from the wallet app (a reload in the same session): the invoice that was on screen comes back by itself. In a new session (the app
// closed and opened again) Donate starts with nothing chosen: an unfinished invoice waits below ("resume") and is finished by itself if paid
(() => { const list = pendings().filter(x => !x.stuck); renderPendings(); const was = ss.get(SS_PAYING), p = was && list.find(x => x.quote === was); if (!p) return; renderInvoice(p); waitAndMint(p); })();

// The partner certifies from a request only (its screen, creq): the old "Certify a token", which signed any pasted token locked to
// its key and Streetcat's, without a request, is gone (review of 12 Nov)

// RELEASE (Streetcat)
let SPRE = 0;  // the token in the Release box: a newer paste, or the release itself, makes an older check of it at the mint stale
$('s-token').addEventListener('input', async () => { const card = $('s-card'); card.textContent = ''; show($('s-out'), ''); $('release').classList.remove('has-card'); unfinish($('s-go')); $('s-again').hidden = true; const run = ++SPRE; try { const t = $('s-token').value.trim(); if (!t) return $('s-info').textContent = ''; const { w, dec } = await decodeTok(t); const info = lockInfo(dec.proofs), v = clinicSigs(dec.proofs, info, dec.memo);
    card.appendChild(tokenCard(dec, info, v.ok ? 'certified' : 'locked')); $('release').classList.add('has-card'); if (heldFor('streetcat', info.pubkeys)) ledgerKeep(dec, info).catch(() => {});  /* a donation of a campaign of this Streetcat key: into its ledger */ termShow(t, 'streetcat', { ms: 1500 }); setLines($('s-info'), v.text + (dec.memo ? `\nmemo: ${dec.memo}` : '') + '\n' + keyNote('streetcat', info));
    // already released? The mint says so before anyone presses Release: a token released before says it here, and its button says so
    if (v.ok && heldFor('streetcat', info.pubkeys) && online()) { const { live, why } = await stillLocked(w, dec.proofs, info); if (run !== SPRE || live.length) return;
      if (why === 'released already') { finish($('s-go'), '✓ Released'); $('s-again').hidden = false; swapBar(card.firstChild, 'released'); show($('s-out'), `✓ Already released: the mint says all ${fmtSat(info.amount)} of this token left the lock with the clinic's and Streetcat's signatures. Nothing more to do with it.`, 'ok'); }
      else show($('s-out'), `Nothing left to release: the mint says all ${fmtSat(info.amount)} of this token are ${why || 'spent'}.`, 'bad'); }
  } catch (e) { if (run === SPRE) setLines($('s-info'), 'cannot read token: ' + e.message); } });
// "certify another token" / "release another token": an empty box again, and its button as it was
const another = (box, extra) => e => { e.preventDefault(); const ta = $(box); ta.value = ''; if (extra) $(extra).value = ''; ta.dispatchEvent(new Event('input')); window.scrollTo(0, 0); };
$('s-again').onclick = another('s-token');
$('s-go').onclick = async () => { const btn = $('s-go'); if (btn.classList.contains('fin')) return; busy(btn, true); ++SPRE; try {
  const t = $('s-token').value.trim(); show($('s-out'), 'contacting the mint…');
  const { w, dec } = await decodeTok(t); const info = lockInfo(dec.proofs); const sk = heldFor('streetcat', info.pubkeys);
  if (!sk) throw Object.assign(new Error(keyNote('streetcat', info).replace(/^✗ /, '')), { byPage: true });  // stop here: the mint would only refuse it
  const v = clinicSigs(dec.proofs, info, dec.memo); if (!v.ok) throw Object.assign(new Error(v.text.replace(/^✗ /, '') + ': nothing is released'), { byPage: true });
  show($('s-out'), 'asking the mint what is still unspent…'); const { live, gone, why } = await stillLocked(w, dec.proofs, info);
  if (!live.length) throw Object.assign(new Error(`nothing left to release: the mint says all ${fmtSat(info.amount)} of this token are ${why || 'spent'}`), { byPage: true });
  const both = cashu.signP2PKProofs(live, sk);
  const tokOf = g => cashu.getEncodedToken({ mint: dec.mint, proofs: g, memo: 'released: ' + (dec.memo || '') });  // kept here until Streetcat's wallet has it; the swap's record stays until then
  const got = await safeSwap(w, both, { what: { kind: 'release', memo: dec.memo || '' }, mint: dec.mint, keep: g => addReleased({ token: tokOf(g), amount: sum(g), memo: dec.memo || '', at: new Date().toISOString() }) }); const plain = tokOf(got);
  await ledgerKeep(dec, info, { request: '', patient: campName(info, dec.memo), procedure: String(dec.memo || '').replace(/^\S+\s*·?\s*/, '').slice(0, 120), date: new Date().toISOString().slice(0, 10), amount: sum(live) }).catch(() => {});
  const left = gone.length ? ` ${fmtSat(sum(gone))} of this token were left out: ${why}.` : '';
  buzz(); finish(btn, '✓ Released'); $('s-again').hidden = false; const cd = $('s-card').firstChild; if (cd) { swapBar(cd, 'released'); cd.classList.add('paid'); } await releasedOut($('s-out'), { w, proofs: got, plain, mint: dec.mint, head: `RELEASED ${fmtSat(sum(got))}.${left}`, keep: 'Import this plain token into Streetcat\'s wallet now (this browser keeps a copy below):', label: 'copy token' });
} catch (e) { show($('s-out'), whyFailed(e), 'bad'); } busy(btn, false); };

// REFUND (donor): a receipt (the picture file, its text, or one made before version 1), or just the locked token when this browser
// made the donation and kept its key. What the receipt says and what the mint says are shown apart; the state comes from the mint.
// A split donation is followed down to its rest (core.js traceDonation), which is the donor's too after the deadline.
const MELTS = 'vetlock.donor.melts', melts = () => { const a = jget(MELTS, []); return Array.isArray(a) ? a : []; }, saveMelt = m => jset(MELTS, keepOpen([...melts().filter(x => x.id !== m.id), m], x => x.state !== 'paid' || !!x.changeDue, 40));  // pending, or failed (its ecash still good): kept
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
  try { out.dleq = await dleqOk(w, rin.dec.proofs).catch(() => false);
    /* a donation of a pot that pays from the lock: its signatures are on whole transactions, so what was paid is read from the mint's record of each (core.js destTrace) */
    if (rin.info.dest) { const d = await window.scCore.destTrace(w, rin.dec.proofs); out.refundable = d.trace.filter(x => x.state === 'UNSPENT').map(x => x.proof); out.locked = d.locked; out.released = d.released + d.fees + d.unproven; out.refunded = d.refunded; out.paid = d.paid; return out; }  /* released: what left the lock for a partner, the mint's fee with it (and what a spend paid a partner without its two signatures to show) */
    const tr = await window.scCore.traceDonation(w, rin.dec.proofs);
    for (const x of tr) { const a = amt(x.proof.amount); if (x.state === 'UNSPENT') { out.refundable.push(x.proof); out.locked += a; continue; } if (x.state !== 'SPENT') continue;
      const pw = { ...x.proof, witness: window.scCore.witnessClean(x.witness) }; let byRefund = false; try { byRefund = !!x.witness && rin.info.refund.some(k => cashu.hasP2PKSignedProof(k, pw)); } catch (_) {} if (byRefund) out.refunded += a; else out.released += a - (x.putBack || 0); }  /* what was put back is followed below */
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
  const part = chk.released ? ` ${fmtSat(chk.released)} of this donation ${chk.released === 1 ? 'was' : 'were'} released; the rest is still under the lock.` : '';  /* the rest: proofs never touched, and what a split proof gave back */
  return open ? ['✓ Refund available', 'ok', `${fmtSat(chk.locked)} can be taken back now.${part}`] : ['Refund not available yet', '', `It opens ${opensText(t)}. Until then only Streetcat and the clinic together can move these sats.${part}`]; }
function renderRefund(){ const box = $('r-info'); box.textContent = ''; $('r-checkrow').hidden = true; const rin = RIN; if (!rin) return; roleOf(rin.pk, 'donor'); rin.info.refund.forEach(k => roleOf(k, 'donor'));  /* the donors' colours */ const chk = RCHK, t = Number(rin.info.locktime), rc = rin.receipt;
  const p1 = el('div', 'panel'); p1.appendChild(el('b', null, rin.kind === 'token' ? 'This token' : 'Saved in the receipt'));
  const amount = sum(rin.dec.proofs), lines = [`${rin.name} · ${fmtSat(amount)}${rc && rc.donation && rc.donation.ref ? ' · ' + rc.donation.ref : ''}`, `refund opens ${opensText(t)}`, ...(rc && rc.created ? [`made ${fmtUTC(Math.floor(Date.parse(rc.created) / 1000))}`] : []),
    rin.kind === 'v1' ? `receipt version 1 · check ✓${rin.sealed ? ' · protected with a password' : ''}` : rin.kind === 'old' ? 'a receipt made before version 1: no integrity check' : 'the refund key is the one this browser kept', `refund key ${abbr(rin.pk)}${rin.info.refund.includes(rin.pk) ? ' · the one in the lock ✓' : ' · ✗ not the one in the lock'}`, ...rin.problems.map(x => '✗ ' + x)];
  p1.appendChild(el('div', 'code', lines.join('\n'))); box.appendChild(p1); if (!chk) { box.appendChild(el('div', 'mut', 'asking the mint…')); return; }
  const p2 = el('div', 'panel'); p2.appendChild(el('b', null, `Checked with the mint · ${when(chk.at)}`));
  p2.appendChild(el('div', 'code', chk.unavailable ? 'the mint did not answer' : [`mint signature ${chk.dleq ? '✓ on every proof (DLEQ)' : '✗ cannot be checked'}`, `${fmtSat(chk.locked)} still locked${chk.released ? ' · ' + fmtSat(chk.released) + ' released' : ''}${chk.refunded ? ' · ' + fmtSat(chk.refunded) + ' taken back' : ''}`].join('\n')));
  const [label, cls, detail] = refundState(rin, chk), sl = el('div', 'rstate' + (cls ? ' ' + cls : ''), label); p2.appendChild(sl); p2.appendChild(el('div', 'mut', detail));
  if (chk.locked && !chk.unavailable) { const e = refundEstimate(rin, chk); p2.appendChild(el('div', 'mut code', `at most ≈ ${fmtSat(e.ln)} by Lightning · ${fmtSat(e.ecash)} as ecash · the exact figure comes with the invoice, before anything moves`)); }
  box.appendChild(p2); $('r-checkrow').hidden = !melts().some(x => x.pk === rin.pk && x.state === 'pending'); }
async function refundLoad(src){ RIN = null; RCHK = null; renderRefund(); $('r-pw').hidden = true; if (!src || (typeof src === 'string' && !src.trim())) { $('r-info').textContent = ''; return; }
  try { RIN = await refundRead(src); RIN.src = typeof src === 'string' ? src.trim() : null; RPW = null; if (RIN.sealed && !RIN.sk) $('r-pw').hidden = false; renderRefund(); RCHK = await refundCheck(RIN); renderRefund(); } catch (e) { RIN = null; setLines($('r-info'), 'cannot read it: ' + (e.message || e)); } }
$('r-receipt').addEventListener('input', () => refundLoad($('r-receipt').value));
$('r-open').onclick = async () => { try { const f = await pickBytes($('r-file'), 'image/png,application/json,.json,.txt'); $('r-receipt').value = ''; await refundLoad(f.bytes); } catch (e) { show($('r-out'), failText(e), 'bad'); } };
$('r-unlock').onclick = async () => { const b = $('r-unlock'); busy(b, true); try { if (!RIN || !RIN.receipt || !RIN.receipt.refund.sealed) throw new Error('open a receipt first'); RIN.sk = await window.scCore.openSealed(RIN.receipt.refund.sealed, $('r-pass').value); $('r-pass').value = '';
    if (pubOf(RIN.sk) !== RIN.pk) throw new Error('this key is not the receipt\'s refund key'); $('r-pw').hidden = true; show($('r-out'), 'unlocked: the refund key is open in this page until it is closed', 'ok'); renderRefund(); } catch (e) { show($('r-out'), failText(e), 'bad'); } busy(b, false); };
// paying out by Lightning: the melt is written down before it is sent, so a lost answer never leads to paying twice ("Check now")
// the change of a refund whose answer was lost, asked back from the mint (changeBack, A05): kept with the donor's key, as the refund was
async function meltChange(m){ const ch = await changeBack(await wallet(m.mint), m.outs), c = sum(ch);  // a network error throws: asked again next time
  const tok = c ? cashu.getEncodedToken({ mint: m.mint, proofs: ch, memo: 'refund change' }) : '';
  if (!addDonorKey({ pk: m.pk, refundToken: tok }) && tok) return null;  /* not kept: still owed, asked again next time; no change: the spent refund token is no longer kept as if it were money */
  m.changeDue = false; m.change = tok; saveMelt(m); return { amount: c, token: tok }; }
async function checkMelt(m){ const w = await wallet(m.mint); let q = null; try { q = await w.checkMeltQuoteBolt11(m.quote); } catch (e) { return { state: 'unknown', why: e.message || String(e) }; }
  if (q.state === 'PAID') { m.state = 'paid'; m.checked = nowIso(); m.changeDue = !!(m.outs && m.outs.length); saveMelt(m); addDonorKey({ pk: m.pk, paidOut: m.amount }); return { state: q.state, change: m.changeDue ? await meltChange(m).catch(() => null) : null }; }
  if (q.state === 'UNPAID') { m.state = 'failed'; m.checked = nowIso(); saveMelt(m); }
  return { state: q.state }; }
$('r-check').onclick = async () => { const b = $('r-check'); busy(b, true); try { const m = melts().find(x => RIN && x.pk === RIN.pk && x.state === 'pending'); if (!m) throw new Error('nothing in progress');
    const r = await checkMelt(m); show($('r-out'), r.state === 'PAID' ? `Refund completed: ${fmtSat(m.amount)} reached your Lightning wallet.` + (r.change && r.change.amount ? `\nThe other ${fmtSat(r.change.amount)} (what the invoice did not ask for, plus any unused fee) came back as ecash. Import it into any Cashu wallet:\n${r.change.token}` : '') : r.state === 'UNPAID' ? `The Lightning payment did not go through. Your sats are in this token: import it into any Cashu wallet, or try again with another invoice:\n${m.token}` : r.state === 'PENDING' ? 'Still in flight: check again in a few minutes. Do not pay or claim again.' : 'The mint did not answer: try again later. ' + (r.why || ''), r.state === 'PAID' ? 'ok' : r.state === 'UNPAID' ? '' : 'bad');
    RCHK = await refundCheck(RIN); renderRefund(); } catch (e) { show($('r-out'), failText(e), 'bad'); } busy(b, false); };
async function recheckMelts(){ for (const m of melts().filter(x => x.state === 'pending')) { try { await checkMelt(m); } catch (_) {} }
  for (const m of melts().filter(x => x.state === 'paid' && x.changeDue)) { try { await meltChange(m); } catch (_) {} }  /* the change of a refund whose answer was lost */
  if (RIN) { RCHK = await refundCheck(RIN).catch(() => RCHK); renderRefund(); } }
addEventListener('online', () => recheckMelts()); setTimeout(() => { if (melts().some(x => x.state === 'pending' || x.changeDue)) recheckMelts(); }, 2500);
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
    if (amt(mq.amount) > room) { show($('r-out'), `Not possible: this invoice is for ${fmtSat(amt(mq.amount))}, but the donation is ${fmtSat(total)} and the mint keeps up to ${fmtSat(amt(mq.fee_reserve) + swapFees)} for fees. Make an invoice for at most ${fmtSat(Math.max(0, room))}, or leave the invoice empty to take the sats back as ecash.`, 'bad');
      if (room > 0) { const r1 = el('div', 'row1'); r1.appendChild(copyBtn(`copy ${room}`, String(room))); $('r-out').appendChild(r1); } busy(btn, false); return; } }
  show($('r-out'), 'contacting the mint…');
  const tokOf = g => cashu.getEncodedToken({ mint: dec.mint, proofs: g, memo: 'refund ' + name });  // a copy in this browser until the donor has the sats; the swap's record stays until then
  const got = await safeSwap(w, proofs, { privkey: sk, what: { kind: 'refund', pk: pubOf(sk) }, mint: dec.mint, keep: g => addDonorKey({ pk: pubOf(sk), sk, refundToken: tokOf(g), refunded: new Date().toISOString() }) }); const plain = tokOf(got);
  buzz(); const kept = donorKeys().some(x => x.pk === pubOf(sk) && x.refundToken === plain);
  if (!mq) { show($('r-out'), kept ? `REFUNDED ${fmtSat(sum(got))}. Import this token into your wallet:\n${plain}` : `REFUNDED ${fmtSat(sum(got))}. This browser could not keep a copy (its storage is full or blocked): import this token into your wallet now:\n${plain}`, kept ? 'ok' : 'bad'); RCHK = await refundCheck(RIN).catch(() => RCHK); renderRefund(); busy(btn, false); return; }
  const m = { id: 'm' + Date.now().toString(36), quote: mq.quote, amount: amt(mq.amount), reserve: amt(mq.fee_reserve), invoice: inv, to: addr || 'invoice', pk: pubOf(sk), mint: norm(dec.mint), token: plain, at: nowIso(), state: 'pending' };
  let prep; try { prep = await w.ops.meltBolt11(mq, got).prepare(); m.outs = (prep.outputData || []).map(outSave); }  /* the change's blank outputs, kept with the payment before it is sent (A05) */
  catch (e) { show($('r-out'), `REFUNDED ${fmtSat(sum(got))}, but not sent to your Lightning wallet: ${e.message || e}. Your sats are in this token: import it into your wallet now:\n${plain}`, 'bad'); RCHK = await refundCheck(RIN).catch(() => RCHK); renderRefund(); busy(btn, false); return; }
  if (!saveMelt(m)) { show($('r-out'), `REFUNDED ${fmtSat(sum(got))}, but not sent to your Lightning wallet: this browser could not write the payment down first (its storage is full or blocked). Your sats are in this token: import it into your wallet now:\n${plain}`, 'bad'); RCHK = await refundCheck(RIN).catch(() => RCHK); renderRefund(); busy(btn, false); return; }
  show($('r-out'), `REFUNDED ${fmtSat(sum(got))}. Sending ${fmtSat(amt(mq.amount))} to your Lightning wallet…\nIf it fails, your sats are in this token:\n${plain}`);
  try { const res = await w.completeMelt(prep); const change = res.change || [], left = sum(change);
    const leftTok = left ? cashu.getEncodedToken({ mint: dec.mint, proofs: change, memo: 'refund change ' + name }) : '';
    if (res.quote && res.quote.state && res.quote.state !== 'PAID') { show($('r-out'), `REFUNDED ${fmtSat(sum(got))}. The Lightning payment is still in flight (${res.quote.state}): Refund in progress · Do not pay or claim again. Press "check now" in a few minutes. If it fails, the mint frees the sats in this token again (any unused fee is lost):\n${plain}`, 'bad'); }
    else { m.state = 'paid'; m.change = leftTok; saveMelt(m); addDonorKey({ pk: pubOf(sk), refundToken: leftTok, paidOut: amt(mq.amount) }); show($('r-out'), `REFUNDED ${fmtSat(sum(got))}: ${fmtSat(amt(mq.amount))} sent to your Lightning wallet.` + (left ? `\nThe other ${fmtSat(left)} (what the invoice did not ask for, plus any unused fee) came back as ecash. Import it into any Cashu wallet:\n${leftTok}` : ''), 'ok'); }
  } catch (e) { let st = '', ch = null; try { st = (await w.checkMeltQuoteBolt11(mq.quote)).state; } catch (_) {}
    if (st === 'PAID') { m.state = 'paid'; m.changeDue = !!(m.outs && m.outs.length); saveMelt(m); addDonorKey({ pk: pubOf(sk), paidOut: amt(mq.amount) }); ch = m.changeDue ? await meltChange(m).catch(() => null) : null; } else if (st === 'UNPAID') { m.state = 'failed'; saveMelt(m); }
    show($('r-out'), st === 'PAID' ? `REFUNDED ${fmtSat(sum(got))}, and the mint says the Lightning payment went through, although its answer was lost: check your wallet. ${e.message || e}` + (ch && ch.amount ? `\nThe other ${fmtSat(ch.amount)} (what the invoice did not ask for, plus any unused fee) came back as ecash. Import it into any Cashu wallet:\n${ch.token}` : '')  /* the token last, on its own line, to be copied */
      : st === 'UNPAID' ? `REFUNDED ${fmtSat(sum(got))}, but the Lightning payment did not go through (${e.message || e}). Before using this token, check that nothing arrived in your Lightning wallet; then import it into any Cashu wallet, or try again with another invoice:\n${plain}`
      : `REFUNDED ${fmtSat(sum(got))}. Refund in progress · Do not pay or claim again: the mint's answer about the Lightning payment was lost. Press "check now" to ask the mint. If it failed, your sats are in this token:\n${plain}`, st === 'UNPAID' ? 'bad' : st === 'PAID' ? 'ok' : 'bad'); }
  RCHK = await refundCheck(RIN).catch(() => RCHK); renderRefund();
} catch (e) { show($('r-out'), whyFailed(e), 'bad'); } busy(btn, false); };
// donations made from this browser, ready to fill the refund box
function renderSaved(){ const box = $('r-saved'); if (!box) return; box.textContent = ''; const mine = donorKeys().filter(k => k.lockedToken && !k.refunded);
  if (!mine.length) return; box.appendChild(document.createTextNode('Donations made from this browser: '));
  for (const k of mine) box.appendChild(smallBtn(`${k.campaign || 'donation'} · ${k.amount ? fmtSat(k.amount) : '? sat'} · refund after ${k.deadline ? fmtDate(k.deadline) : '?'}`, () => { $('r-receipt').value = k.lockedToken; $('r-receipt').dispatchEvent(new Event('input')); })); }
document.querySelector('nav button[data-t="refund"]').addEventListener('click', renderSaved); renderSaved();

// CAMPAIGN (Streetcat): a pot. What it pays for (the four kinds, two by two), its name, the colony it is for and the partner who confirms
// the spending, each chosen from its own list: the colony may be none (every colony), the partner may
// not. The rest comes filled in: what it pays as its operation,
// refunds after 30 days, and the campaign before's mint and where donors send, or Minibits; one line says them, with "edit". Streetcat's
// key has no field: it is the published one this browser holds; the partner's comes with the partner. The two keys show in their
// colours, Streetcat green and the partner blue, and shuffle while "Make the campaign" is held (while the button fills in green),
// landing as it fills.
// vetlock.kform = 'open' keeps every field open (the suites fill them).
const KMINT = 'https://mint.minibits.cash/Bitcoin';
const kStreetcat = () => STREETCAT_KEYS.find(k => heldFor('streetcat', [k])) || '';
let K = { type: 'sterilisation', col: '', back: 'home' }, K_USER = null, K_SET = null;  /* K_USER: the fold as the user left it (null: as needed); K_SET: as the app last set it */
const kPartnerKey = () => { const c = $('k-c').value.trim(); return window.scCore.pointOk(c) ? c.toLowerCase() : ''; };
// A campaign can have a list of partners where
// its mint enforces where the money may go (core.js, `dest`): only there is a list safe. The first partner is the field above, as
// always; K.also holds the others, ticked in the partners' list. K_DEST: what the form's mint said (null: not asked yet).
let K_DEST = null;
const kAlso = () => { const first = kPartnerKey(); return [...new Set((K.also || []).map(k => String(k).toLowerCase()))].filter(k => k !== first && window.scCore.pointOk(k)); };
const kMint = () => $('k-mint').value.trim().replace(/\/+$/, '');
const kPartners = () => { const first = kPartnerKey(); return first ? [first, ...kAlso()] : []; };
// a tick in the partners' list: in or out of the campaign (eight at most: core.js campaignOf). The first of the list is the form's field.
function kTick(pk){ pk = String(pk).toLowerCase(); const all = kPartners(), next = all.includes(pk) ? all.filter(k => k !== pk) : [...all, pk]; if (next.length > 8) return false; $('k-c').value = next[0] || ''; K.also = next.slice(1); return true; }
async function kDestAsk(){ const url = kMint(), v = await mintDest(url); if (url !== kMint() || v === K_DEST) return; K_DEST = v; if (!v) K.also = [];
  if ($('spick').classList.contains('on') && PICK.what === 'partner' && PICK.from === 'campaign' && !PP_NEW) renderPick(); else if ($('campaign').classList.contains('on')) kDraw(); }
// a line per key, as on the Keys screen, each in its role's colour; what is wrong, in red
function keyLines(box, rows){ box.querySelectorAll('.kk').forEach(v => { if (v._flap) cancelAnimationFrame(v._flap); }); box.textContent = '';
  for (const [label, role, k, none] of rows) { const d = box.appendChild(document.createElement('div')), l = d.appendChild(document.createElement('small')), v = d.appendChild(document.createElement('span'));
    d.className = 'kline'; d.style.setProperty('--h', String(HUE[role])); l.textContent = label; v.className = 'kk';
    if (k) { v._t = roleOf(k, role); v.appendChild(withKeys(k)); } else { v.textContent = none; if (/^✗/.test(none)) v.classList.add('bad'); } } }
function kKeys(){ const box = $('k-keys'), s = kStreetcat(), typed = $('k-c').value.trim(), pk = kPartnerKey(), par = pk ? partnerOf(pk) : null; box.classList.toggle('bad', !s);
  if (!s) { keyLines(box, []); box.textContent = `✗ This browser does not hold Streetcat's key (${abbr(STREETCAT_KEYS[0])}): import it in Keys.`; return; }
  keyLines(box, [['Streetcat', 'streetcat', s], [par ? `${par.name} · ${par.kind}` : 'partner', 'clinic', pk, typed ? '✗ not a public key yet' : 'choose the partner above'],
    ...kAlso().map(k => { const p = partnerOf(k); return [p ? `${p.name} · ${p.kind}` : 'partner', 'clinic', k]; })]); }  /* a list: one line for each partner that can be paid */
function kShow(){ K_SET = K_USER != null ? K_USER : !$('k-mint').value.trim() || ls.get('vetlock.kform') === 'open'; $('k-more').open = K_SET; }  /* the folded fields (operation, partner key, mint): open while the mint is missing, or as the user left it; the partner is chosen on its button (13 Nov) */
// the form as it is: the kind chosen, the colony and the partner on their buttons, in their colours, and the line that says the rest
function kDraw(){ const t = KIND(K.type), pk = kPartnerKey(), par = pk ? partnerOf(pk) : null;
  kindChips($('k-type'), K.type, id => { if (id === K.type) return; const was = KIND(K.type).one; K.type = id; if (!$('k-op').value.trim() || $('k-op').value.trim() === was) $('k-op').value = KIND(id).one;
    if (par && !doesKind(par, id)) $('k-c').value = ''; K.also = kAlso().filter(k => { const p = partnerOf(k); return !!p && doesKind(p, id); }); kDefaults(); });
  $('k-name').placeholder = 'Choose name';  /* no example name in it */ setChoose($('k-col'), 'Choose colony', K.col ? K.col.toUpperCase() : '', K.col ? colHue(K.col) : null);
  setChoose($('k-par'), 'Choose partner', (par ? par.name.toUpperCase() : pk ? abbr(pk) : '') + (pk && kAlso().length ? ` +${kAlso().length}` : ''), pk ? HUE.clinic : null);  /* a list: the first and how many more */
  kKeys(); kShow(); }
function kDefaults(){ const all = camps().slice().sort((a, b) => (Number(a.created) || 0) - (Number(b.created) || 0)), last = all[all.length - 1], p = (last && last.c) || {};
  const set = (id, v) => { if (!$(id).value.trim() && v) $(id).value = v; };
  // the colony and the partner are never filled in by themselves (13 Nov): "Choose colony" and "Choose partner" until they are chosen
  set('k-op', KIND(K.type).one); set('k-mint', p.mint || KMINT); set('k-to', p.to || '');
  if (!$('k-dl').value || new Date($('k-dl').value + 'T23:59:59Z') < new Date()) $('k-dl').value = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  kDraw(); }
$('k-more').querySelector('summary').addEventListener('click', () => { K_USER = K_SET = !$('k-more').open; });  /* the user's choice, taken at the tap itself (the toggle event comes later, asynchronously) */
$('k-mint').addEventListener('change', () => { K_DEST = null; K.also = []; });  /* another mint: whether it can hold a list is asked again */
$('k-c').addEventListener('input', () => kDraw()); for (const id of ['k-op', 'k-dl', 'k-mint']) $(id).addEventListener('change', () => kDraw());
$('k-col').onclick = () => pick('colony', 'campaign'); $('k-par').onclick = () => { pick('partner', 'campaign'); kDestAsk(); };
document.querySelector('nav button[data-t="campaign"]').addEventListener('click', () => kDefaults());  // keys made or imported since, the campaign just made
// held: the keys shuffle in their colours and land as the button fills; let go early, they are back at once
$('k-go').addEventListener('holdstart', () => $('k-keys').querySelectorAll('.kk').forEach(v => { if (v._t) flapKeys(v, v._t, { speed: holdMs() / 1200, hex: true }); }));
$('k-go').addEventListener('holdstop', () => kKeys());
// what this project needs from a mint, read from its own info (NUT-06) and keysets (NUT-02)
async function mintCheck(url){ const get = async p => { const r = await window.scCore.fetchT(url + p, { cache: 'no-store' }); if (!r.ok) throw new Error(p + ' answered HTTP ' + r.status); return r.json(); };
  const info = await get('/v1/info'), ks = await get('/v1/keysets'), nuts = info.nuts || {}, on = n => !!(nuts[n] && nuts[n].supported === true);
  const ln = !!(nuts['4'] && !nuts['4'].disabled && (nuts['4'].methods || []).some(m => m.method === 'bolt11' && m.unit === 'sat'));
  const fees = (ks.keysets || []).filter(k => k.unit === 'sat' && k.active !== false).map(k => Number(k.input_fee_ppk || 0)), fee = fees.length ? Math.max(...fees) : null;
  const lines = [[on('11'), 'NUT-11: locks with 2 signatures and a refund key'], [on('7'), 'NUT-07: proof states and the signatures used (status page)'], [on('12'), 'NUT-12: DLEQ proofs (status page)'], [ln, 'NUT-04: Lightning invoices in sat (donate with Lightning)'], [on('9'), 'NUT-09: restore (gets ecash back if an answer is lost)']];
  const text = `Mint: ${info.name || url} · ${info.version || 'version not given'}\n` + lines.map(([v, t]) => (v ? '✓ ' : '✗ ') + t).join('\n') + `\nInput fee: ${fee == null ? 'not given' : fee ? fee + ' ppk (at least 1 sat on every swap: locking ecash, release, refund)' : '0 (swaps are free)'}`;
  const dest = window.scCore.destMint(info); DEST_MINTS.set(String(url).replace(/\/+$/, ''), dest);  /* said only where it is so: no other mint is any the worse for it */
  return { ok: lines.slice(0, 3).every(x => x[0]), ln, restore: on('9'), fee, dest, text: text + (dest ? '\n✓ dest: donations can only be paid to the campaign\'s partners' : '') }; }
$('k-go').onclick = async () => { const btn = $('k-go'); busy(btn, true); try {
  let c = { name: $('k-name').value.trim(), op: $('k-op').value.trim() || 'sterilisation', mint: ($('k-mint').value.match(/https?:\/\/[^\s"'<>]+/i) || [$('k-mint').value.trim()])[0].replace(/\/+$/, ''), streetcat: kStreetcat(), clinic: $('k-c').value.trim(), deadline: Math.floor(new Date($('k-dl').value + 'T23:59:59Z').getTime() / 1000) };
  const to = $('k-to').value.trim(); if (to) c.to = to;
  // what it pays for, the colony it is for and its partner (core.js signs them with the rest); a partner named here, by its name
  const par = c.clinic ? partnerOf(c.clinic) : null; c.type = K.type; if (!$('k-op').value.trim()) c.op = KIND(K.type).one; if (K.col) c.colony = K.col; if (par && par.named) c.partner = par.name; c.pkind = par ? par.kind : 'clinic';
  if (!c.streetcat) { const own = key('streetcat', false); throw new Error(own ? `this browser's Streetcat key (${abbr(pubOf(own))}) is not Streetcat's published key (${abbr(STREETCAT_KEYS[0])}): donors' pages would refuse its link, so it cannot sign the donation link. Make the campaign in the browser that holds the published key, or import it in Keys` : `this browser does not hold Streetcat's published key (${abbr(STREETCAT_KEYS[0])}), so it cannot sign the donation link. Make the campaign in the browser that holds it, or import that key in Keys`); }
  for (const k of ['name', 'clinic', 'mint']) if (!c[k]) { if (k === 'mint') { K_USER = true; kShow(); } throw new Error(k === 'clinic' ? 'choose the partner who confirms the spending' : 'fill in ' + k); } if (!c.deadline || c.deadline < Date.now() / 1000) { $('k-dl').focus(); throw new Error('the refund date must be in the future'); }
  if (!published(c.streetcat)) throw new Error(`this is not Streetcat's published key (${abbr(STREETCAT_KEYS[0])}), so donors' pages would refuse the link: make the campaign with the published key`);
  if (!C.pointOk(c.clinic)) throw new Error('the partner\'s key is not a public key: choose the partner again');
  // a pot with the same partner and the same refund date as another would lock its donations exactly as that one does, and this browser
  // could not tell them apart (7 Nov: two food pots of one shop, made the same day): its refunds open a second earlier, on the same date
  while (camps().some(x => x && x.c && lc(x.c.streetcat) === lc(c.streetcat) && lc(x.c.clinic) === lc(c.clinic) && Number(x.c.deadline) === c.deadline)) c.deadline -= 1;
  try { openCampaign(JSON.stringify(c)); } catch (e) { throw new Error(String(e.message).replace('the mint in this link is not an https address', 'the mint URL must start with https:// (for example https://mint.minibits.cash/Bitcoin)').replace(/: (do not use this link|do not donate through it|ask Streetcat for a link with a sensible deadline)$/, '')); }  // the same checks donors' pages make
  const ssk = heldFor('streetcat', [c.streetcat]); if (!ssk) throw new Error('this browser does not hold the private key of the Streetcat key above, so it cannot sign the donation link. Make the campaign in the browser that holds it, or import that key in Keys');
  show($('k-out'), 'checking the mint…'); let check; try { check = await mintCheck(c.mint); } catch (e) { throw new Error('cannot read this mint (' + (e.message || e) + '). Check the URL.'); }
  if (!check.ok) { show($('k-out'), check.text + '\n\nThis mint cannot hold these donations: pick another one.', 'bad'); busy(btn, false); return; }
  // where the mint enforces it, the campaign's donations say where they may go (core.js, `dest`): to its partners only, one or a list.
  // At any other mint a campaign is what it was, with one partner: a list there would let two partners pay themselves without Streetcat.
  { const also = kAlso(); if (check.dest) { c.lock = 'dest'; if (also.length) c.partners = also; } else if (also.length) throw new Error('this mint cannot hold a list of partners: choose one'); }
  c.hue = newCampHue(); campHue(c);  // its own colour, the first one free in this browser; it travels in the link and the ledger
  c = await window.scCore.signCampaign(c, ssk);  /* signed with Streetcat's key (core.js): donors' pages refuse a link changed afterwards */
  const base = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); let slug = base; for (let n = 2; camps().some(x => x.slug === slug); n++) slug = `${base}-${n}`;  /* a pot never takes the place of another of the same name */
  const link = location.href.split('#')[0].split('?')[0].replace(/\/(clinic|streetcat)$/, '/donate') + '#c=' + b64u.enc(JSON.stringify(c));  // a donation link opens as a donor, whatever page made it
  ls.set(CAMPS, JSON.stringify([...camps(), { c, link, slug, created: Date.now() }])); if (window.scRelay) window.scRelay.retry(); renderHome(); buzz();  /* a message that waited for this campaign is tried again */
  if (K.back === 'snew' && SN.type === K.type) SN.pot = slug;  /* made from a request's "Choose pot": back there, it pays from it */
  const ledger = JSON.stringify({ campaign: c, clinicKeySource: 'https://… (where the clinic published its key)', donations: [] }, null, 1);
  // the result is its own screen: the mint's answer types itself out line by line, then three full-width actions
  $('campaign').classList.add('made'); updateBack(); const out = $('k-out'); out.textContent = ''; out.className = 'out ok';
  const lines = check.text.split('\n').concat(check.ln ? [] : ['Donors will have to pay with ecash from this mint: it has no Lightning invoices.'], check.restore ? [] : ['Without NUT-09, a lost answer from this mint cannot be recovered: prefer another mint.'], ['', `Campaign ${c.name} is ready.`]);
  const ticker = document.createElement('div'); ticker.className = 'ticker'; out.appendChild(ticker);
  const acts = document.createElement('div'); acts.className = 'acts'; acts.hidden = true;
  // no "open donation page": donating is the donors' app, not Rescue's
  acts.appendChild(copyBtn('copy donation link', link)); acts.appendChild(copyBtn('copy ledger', ledger));
  const fold = document.createElement('details'); fold.className = 'more'; const sm = document.createElement('summary'); sm.textContent = 'link, JSON and ledger'; fold.appendChild(sm); fold.appendChild(document.createTextNode('\n')); const tx = document.createElement('span'); tx.className = 'mut code'; tx.textContent = `${link}\n\n${JSON.stringify(c)}\n\nStatus page: save this as app/campaigns/${slug}.json in the repository, add every locked token you receive to "donations", and share status.html?l=campaigns/${slug}.json\n${ledger}`; fold.appendChild(tx); fold.appendChild(document.createTextNode('\n'));
  out.appendChild(acts); out.appendChild(fold);
  const annSt = el('div', 'mut'); annSt.hidden = true; out.insertBefore(annSt, acts); annSt.textContent = '· announcing it to donors…';
  announceCamp(c, ssk, s => { annSt.className = 'mut'; setLines(annSt, annLine(s)); });  /* its red lines in red (setLines), and again as late relays confirm */
  const another = document.createElement('div'); another.className = 'row1'; const ag = smallBtn('another campaign', () => { $('campaign').classList.remove('made'); out.textContent = ''; out.className = 'out'; $('k-name').value = ''; $('k-c').value = ''; K.also = []; K.col = ''; kDefaults(); updateBack(); });  /* its colony and partner chosen again (13 Nov) */ ag.style.borderColor = 'var(--line)'; another.appendChild(ag); another.hidden = true; out.appendChild(another);
  const reduce = REDUCE(); const step = k => { if (k >= lines.length) { acts.hidden = another.hidden = annSt.hidden = false; buzz(); return; } const l = document.createElement('div'); l.className = 'tl' + (/^(Donors will have to pay with ecash|Without NUT-09)/.test(lines[k] || '') ? ' bad' : ''); l.style.setProperty('--h', String(136 + (k * 11) % 29));  /* what this mint lacks: red */ l.style.setProperty('--l', String(.62 + ((k * 5) % 4) * .07)); ticker.appendChild(l); if (reduce) { l.textContent = lines[k]; step(k + 1); return; } const prev = ticker.querySelectorAll('.cur'); prev.forEach(c => c.remove()); typeKeys(l, lines[k] || ' ', { dur: Math.min(420, 120 + lines[k].length * 6), think: false, done: () => setTimeout(() => step(k + 1), lines[k] ? 90 + Math.random() * 240 : 40) }); }; step(0);
} catch (e) { show($('k-out'), e.message, 'bad'); } busy(btn, false); };
// a campaign is announced to donors on the relays when it is made (relay.js), and again from Home if need be: "Check for requests" on a
// donor's phone lists it until its deadline. What the relays said is kept with the campaign.
// what donors see of a campaign's requests: each cat, its procedure and how far it is (index.js states: released → released, certified → done; never 'paid': the sats go to Streetcat's reserve, not to the partner)
const annCats = c => sreqs().filter(r => r.q.campaign && campKey(r.q.campaign) === campKey(c)).sort((a, b) => String(a.created).localeCompare(String(b.created)))
  .map(r => ({ name: r.q.patient, procedure: r.q.procedure, state: r.state === 'released' ? 'released' : r.state === 'certified' ? 'done' : 'requested' }));
// a request made, certified or released: its campaign is announced again, in the background, so donors see it as it is
const reannounce = c => { try { const k = camps().find(x => x && x.c && x.c.sig && campKey(x.c) === campKey(c)), sk = k && heldFor('streetcat', [k.c.streetcat]); if (sk && Number(k.c.deadline) > Date.now() / 1000) announceCamp(k.c, sk); } catch (_) {} };
// A relay that was sent the announcement and did not confirm in time is asked again later whether it has it (relay.js publishChecked):
// on 8 Nov nostr.mom confirmed half a minute late, and "Not announced to donors" was said of campaigns donors could already see. `onState({ ok, n, done, res })` hears
// the first answer and each change; what is said names, in red, each relay that does not have it and why. One announcement of a
// campaign at a time: Home's own pass (announceAll) and "Make the campaign" no longer send the same one twice at once.
const ANNOUNCING = new Map(), relayName = u => String(u).replace(/^wss?:\/\//, '').replace(/\/+$/, ''), relayWhy = r => /^no answer/.test(r.msg || '') ? 'no answer' : r.msg || 'no answer';
function announceCamp(c, sk, onState){ const key = c.sig || JSON.stringify(c), cur = ANNOUNCING.get(key); if (cur) { if (onState) { cur.hear.push(onState); if (cur.last) onState(cur.last); } return cur.p; }
  const run = { hear: onState ? [onState] : [], last: null }, tell = s => { run.last = s; for (const f of run.hear) { try { f(s); } catch (_) {} } if (s.done) ANNOUNCING.delete(key); }; ANNOUNCING.set(key, run);
  run.p = (async () => { const R0 = window.scRelay, fail = msg => { const s = { ok: 0, n: 0, done: true, msg, res: [] }; tell(s); return s; }; if (!R0) return fail('this browser cannot reach the relays');
    try { const k0 = camps().find(x => x && x.c && x.c.sig && x.c.sig === c.sig), ev = await R0.announceEvent(c, sk, { kind: k0 && k0.kind, cats: annCats(c), created: k0 && k0.created }); let first = null;  /* when it was made: the donors' list goes newest first */
      await R0.publishChecked(ev, relays(), { timeout: 8000, onState: (res, done) => { const ok = res.filter(x => x.ok).length, s = { ok, n: res.length, done, res };
        const a = camps(), k = a.find(x => x && x.c && x.c.sig && x.c.sig === c.sig); if (k && (ok || !k.ann || !k.ann.ok || done)) { k.ann = { ok, n: res.length, at: Date.now(), v: 2 }; ls.set(CAMPS, JSON.stringify(a)); }  /* v 2: it said when the campaign was made */
        if (!first) first = s; tell(s); } });
      return first; } catch (e) { return fail(String((e && e.message) || e)); } })();
  return run.p; }
// the line under a campaign just made: how many relays have its announcement; in red each that does not, and why; in grey those still asked
function annLine(s){ const no = (s.res || []).filter(x => !x.ok), gone = no.filter(x => s.done || !x.silent), wait = s.done ? [] : no.filter(x => x.silent), why = x => `${relayName(x.url)}: ${relayWhy(x)}`;
  if (!s.n) return `✗ Not announced to donors: ${s.msg || 'no relay took it'}. Announce it again from Home.`;
  if (!s.ok && s.done) return `✗ Not announced to donors: ${no.map(why).join('; ')}. Announce it again from Home.`;
  return [s.ok ? `✓ Announced to donors: ${s.ok} of ${s.n} relays have it. "Check for requests" lists it until its deadline.` : '· announcing it to donors: no relay has confirmed it yet, they are asked again in a moment…',
    gone.length ? '✗ ' + gone.map(why).join(' · ') : '', wait.length && s.ok ? `· ${wait.map(x => relayName(x.url)).join(', ')}: not confirmed yet, asked again in a moment` : ''].filter(Boolean).join('\n'); }  /* none yet: the first line says it */
// every open campaign of this browser reaches the donors by itself: each time Home opens, one that no relay took, or from before the announcements, or not announced
// for a day (a relay may drop it), is announced again, quietly; one at a time, never two passes at once. "announce to donors" stays.
async function announceAll(){ if (announceAll.busy || !window.scRelay) return; announceAll.busy = true;  /* on the function: Home is drawn before this line has run */
  try { for (const k of camps()) { if (!k || !k.c || !k.c.sig || !(Number(k.c.deadline) > Date.now() / 1000)) continue;
      if (k.ann && k.ann.ok && k.ann.v === 2 && Date.now() - Number(k.ann.at || 0) < 864e5) continue;  /* one announced before 9 Nov goes again at once, now saying when it was made */
      const sk = heldFor('streetcat', [k.c.streetcat]); if (sk) await announceCamp(k.c, sk); } }
  catch (_) {} announceAll.busy = false; }
// HOME (Streetcat): what it pays for, the four kinds two by two, each with its pots, its requests and what is left to spend; a
// kind opens its own screen (skind), with its pots and requests. And what this browser holds.
function renderHome(){ setTimeout(announceAll, 0); const a = camps(); $('h-n').textContent = String(a.length); $('h-rel').textContent = unpaid().reduce((s, r) => s + Number(r.amount || 0), 0) + ' sat';
  try { homeKinds(); } catch (_) {}  /* Home is drawn before the requests' code has run: drawn again once the page has set itself up */
  if (a.some(k => k && k.c && !k.c.sig && heldFor('streetcat', [k.c.streetcat]))) signOldCampaigns(); }
// a pot in a list (its kind's screen): its name in its colour, its colony, its partner and the days left, what was given and what is left
// to spend; a tap opens what can be done with it: its donations and requests, its link, its ledger, the status page, announcing it
function potRow(box, k){ const c = k.c, left = Math.ceil((c.deadline - Date.now() / 1000) / 86400), par = partnerOf(c.clinic), it = el('button', 'req'); it.type = 'button'; it.style.setProperty('--h', String(campHue(c)));
  const given = Object.values(scEntries(c)).reduce((s, e) => s + Number(e.amount || 0), 0);
  it.appendChild(el('div', 'title', c.name)); it.appendChild(el('div', 'sub2', [k.kind === 'request' ? 'request' : '', c.colony || 'every colony', (par ? par.name : c.partner || 'its partner') + (c.lock === 'dest' && Array.isArray(c.partners) && c.partners.length ? ` +${c.partners.length}` : ''), left > 0 ? left + ' day' + (left === 1 ? '' : 's') + ' left' : 'closed'].filter(Boolean).join(' · ')));
  it.appendChild(el('div', 'sub2', `${fmtSat(given)} given · ${fmtSat(potFree(c))} to spend`)); box.appendChild(it);
  it.onclick = () => { if (it.nextSibling && it.nextSibling.classList && it.nextSibling.classList.contains('row2')) { it.nextSibling.remove(); return; } const row = document.createElement('div'); row.className = 'row2'; row.appendChild(copyBtn(k.c.sig ? 'copy signed link' : 'copy link (unsigned)', k.link)); const st = document.createElement('a'); st.className = 'sm'; st.href = `status.html?l=campaigns/${k.slug}.json`; st.textContent = 'status'; row.appendChild(st);
    const lb = smallBtn('copy ledger', async () => { if (!LEDGER) await LEDGER_READY; const ok = await copyText(JSON.stringify(ledgerFor(k.c), null, 1)); if (ok) doneLabel(lb); else flapLabel(lb, 'select it', 2500); }); lb.style.gridColumn = '1 / -1'; row.appendChild(lb);
    const dr = smallBtn('donations and requests', () => { CUR_CAMP = k.slug; openTab('scamp'); }); dr.style.gridColumn = '1 / -1'; row.insertBefore(dr, row.firstChild);
    const R0 = window.scRelay, sk0 = heldFor('streetcat', [k.c.streetcat]);
    if (R0 && sk0) { const pb = smallBtn('publish ledger', async () => { pb.disabled = true; try { await LEDGER_READY; const ev = await R0.ledgerEvent(ledgerFor(k.c), sk0); let said = false;  /* a relay that confirms late is asked again (relay.js publishChecked): the label follows */
        let left = 0; try { left = (JSON.parse(ev.content).more || {}).n || 0; } catch (_) {}  /* a full ledger: how many it left out is said (review of 12 Nov) */
        await R0.publishChecked(ev, relays(), { timeout: 8000, onState: (res, done) => { const ok = res.filter(x => x.ok).length; if (ok) { doneLabel(pb, `published · ${ok} of ${res.length} relays${left ? ` · ${left} left out: full` : ''}`); if (!said) buzz(); said = true; } else if (done) flapLabel(pb, 'no relay took it', 5000); } });
      } catch (e) { flapLabel(pb, /too large/.test(e.message) ? 'too large: copy it' : 'not published', 5000); } pb.disabled = false; });
      pb.style.gridColumn = '1 / -1'; row.appendChild(pb);
      const ann = (camps().find(x => x && x.c && x.c.sig && x.c.sig === k.c.sig) || k).ann;  /* as it is now: Home may have announced it since it was drawn */
      if (k.c.sig && Number(k.c.deadline) > Date.now() / 1000) { const ab = smallBtn(ann && ann.ok ? `announced to donors · ${ann.ok} of ${ann.n} relays` : 'announce to donors', async () => { ab.disabled = true; let said = false;
          await announceCamp(k.c, sk0, s => { if (s.ok) { doneLabel(ab, `announced to donors · ${s.ok} of ${s.n} relays`); if (!said) buzz(); said = true; } else if (s.done) flapLabel(ab, 'no relay took it', 5000); });  /* late relays: the label follows */
          ab.disabled = false; }); ab.style.gridColumn = '1 / -1'; row.insertBefore(ab, pb); } }  /* above "publish ledger" */
    window.scCore.campaignId(k.c).then(id => { st.href = `status.html?n=${id}&l=campaigns/${k.slug}.json`; }).catch(() => {});  /* the status page finds the published ledger by the campaign's id */
    it.after(row); };  // the ledger to publish: every donation by its DON- code (version 2)
  return it; }
// campaigns made before links were signed: signed here, once, when this browser holds their Streetcat key (the same campaign, a signed link)
async function signOldCampaigns(){ if (signOldCampaigns.busy) return 0; signOldCampaigns.busy = true; let n = 0; try { const a = camps();
    for (const k of a) { if (!k || !k.c || k.c.sig) continue; const sk = heldFor('streetcat', [k.c.streetcat]); if (!sk) continue;
      try { const c = await window.scCore.signCampaign(k.c, sk); k.c = c; k.link = String(k.link || location.href).split('#')[0] + '#c=' + b64u.enc(JSON.stringify(c)); n++; } catch (_) {} }
    if (n) ls.set(CAMPS, JSON.stringify(a)); } catch (_) {} signOldCampaigns.busy = false; if (n) renderHome(); return n; }
// Keys, as Rescue: the Lightning address what is released goes to, and whether it answers (checked when it is saved and when it is first
// shown), behind a long button
function keysLn(){ const sc = nav.dataset.role === 'streetcat'; $('x-ln-row').hidden = !sc; if (!sc) { $('x-ln-box').hidden = true; $('x-ln-b').setAttribute('aria-expanded', 'false'); return; } lnField(); }
$('x-ln-b').onclick = () => { const box = $('x-ln-box'), open = box.hidden; box.hidden = !open; $('x-ln-b').setAttribute('aria-expanded', String(open)); if (open) { lnField(); $('h-ln').focus(); } };
function lnField(){ const i = $('h-ln'); if (!i || document.activeElement === i) return; i.value = String(ls.get(PAYTO) || ''); if (!lnField.done) { lnField.done = true; lnCheck(false); } }
async function lnCheck(saving){ const st = $('h-ln-st'), v = $('h-ln').value.trim().replace(/^lightning:/i, '');
  if (!v) { if (saving) ls.set(PAYTO, ''); show(st, ''); return; }  /* empty: nothing to say; released ecash stays in this browser */
  const url = window.scCore.lnAddressUrl(v); if (!url) { show(st, `✗ ${v} is not a Lightning address (name@domain)` + (saving ? ': nothing was saved.' : '.'), 'bad'); return; }
  if (saving) { ls.set(PAYTO, v); $('h-ln').value = v; }
  show(st, `checking ${v}…`);
  try { let r; try { r = await window.scCore.fetchT(url, { headers: { accept: 'application/json' } }); } catch (_) { throw new Error('it cannot be reached from this browser'); } const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.tag !== 'payRequest') throw new Error(j && j.reason ? j.reason : `it answered HTTP ${r.status}`);
    show(st, ''); if (saving) buzz();  /* it answers: nothing to say; only what is wrong, in red */
  } catch (e) { show(st, `✗ ${v}: ${e.message || e}. Until it answers, what is released stays in this browser.`, 'bad'); } }
$('h-ln').addEventListener('change', () => lnCheck(true));
// a new campaign form, not the last one made: of this kind, for this colony, and back to the screen it was opened from
const kFresh = (type, back, col = '') => { K = { type: KINDS.some(t => t.id === type) ? type : K.type, col, back }; K_USER = null; BACK.campaign = back; for (const id of ['k-name', 'k-c', 'k-op']) $(id).value = '';
  $('campaign').classList.remove('made'); const out = $('k-out'); out.textContent = ''; out.className = 'out'; openTab('campaign'); };
$('h-new').onclick = () => kFresh(K.type, 'home'); $('h-req').onclick = () => snFresh(SN.type, 'home'); $('h-release').onclick = () => openTab('release'); $('h-keys').onclick = e => { e.preventDefault(); openTab('keys'); };
renderReleased(); recoverFlights(); renderHome(); setTimeout(() => { if (payouts().some(x => x.state === 'pending' || x.changeDue)) recheckPayouts(); }, 2000); addEventListener('online', () => recheckPayouts());  /* a payment whose answer was lost: asked about again */
// ===== THE WORK BETWEEN STREETCAT, THE CLINIC, THE VOLUNTEERS AND THE DONORS =====
// A request (Streetcat → clinic), its answer (clinic → Streetcat) and a donation (donor or volunteer → Streetcat) travel by Nostr relay
// (relay.js), and the very same payload by link, file or QR when no relay confirms it. The protocol is core.js; this is its interface.
// What is sent waits in the outbox until two relays confirm it; what arrives is checked against the campaign before it is shown.
const C = window.scCore, R = window.scRelay, lc = k => String(k || '').toLowerCase(), nowIso = () => new Date().toISOString(), today = () => new Date().toISOString().slice(0, 10);
const jget = (k, d) => { try { const v = JSON.parse(ls.get(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } }, jset = (k, v) => ls.set(k, JSON.stringify(v));
// the relays: relay.js's list, or the one kept under vetlock.relays (comma-separated) when Streetcat picks its own
const RELAYLIST = 'vetlock.relays', relays = () => { const s = String(ls.get(RELAYLIST) || '').split(',').map(x => x.trim()).filter(x => /^wss?:\/\/\S+$/.test(x)); return s.length ? s : (R ? R.RELAYS : []); };
const OUTBOX = R ? R.outbox({ get: k => ls.get(k), set: (k, v) => ls.set(k, v) }) : null;
const online = () => navigator.onLine !== false;
// deadlines (plan step 1, below): Rescue's margin and a partner's days to confirm, in days; a Madrid day; when the mint last said
var MARGIN = 'vetlock.sc.margin', FUNDS = 'vetlock.sc.funding';  /* var and function declarations: usable by a screen drawn while the page loads */
function marginDays(){ const v = ls.get('vetlock.sc.margin'), n = Number(v); return v != null && v !== '' && Number.isInteger(n) && n >= 0 && n <= 60 ? n : window.scCore.MARGIN_DAYS; }
function confirmDaysOf(p){ const n = Number(p && p.confirmDays); return p && p.confirmDays != null && p.confirmDays !== '' && Number.isInteger(n) && n >= 0 && n <= 60 ? n : (window.scCore.CONFIRM_DAYS[(p && p.kind) || 'clinic'] ?? 2); }
function dm(t){ return new Intl.DateTimeFormat('en-GB', { timeZone: window.scCore.TZ, day: 'numeric', month: 'short' }).format(new Date(t * 1000)); }  /* 16 Nov: a Madrid day */
function atWhen(ms){ const d = new Date(ms), hm = d.toLocaleTimeString(EN, { hour: '2-digit', minute: '2-digit' }); return d.toDateString() === new Date().toDateString() ? hm : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${hm}`; }
const saveFile = (name, text, type = 'application/json') => { const a = document.createElement('a'); a.href = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); };
const pickFile = input => new Promise((res, rej) => { input.value = ''; input.onchange = () => { const f = input.files && input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('this file cannot be read')); r.readAsText(f); }; input.click(); });
// the app's address for a role: a request opens as the clinic, an answer as Streetcat
const appLink = role => { const u = location.href.split('#')[0].split('?')[0]; return /\/(donate|clinic|streetcat)$/.test(u) ? u.replace(/\/(donate|clinic|streetcat)$/, '/' + role) : u + '?role=' + role; };
const linkOf = (obj, role) => C.linkFor(appLink(role), obj);
const failText = e => (e && e.kept ? 'Interrupted: ' : e && e.byPage ? 'Not possible: ' : 'Failed: ') + ((e && e.message) || e);
let FLUSHING = null;
// one send at a time; asked while one runs, another follows it: what was just added (a donation sent while the app was sending
// something else) goes out now, not at the next check (relay.js keeps it in the outbox; before, it was overwritten and never went)
async function flush(){ if (!OUTBOX || !online()) return []; if (FLUSHING) return FLUSHING.then(() => flush()); FLUSHING = OUTBOX.flush({ timeout: 8000 }).catch(() => []).finally(() => { FLUSHING = null; setTimeout(refreshStates, 0); }); return FLUSHING; }
const sentState = id => { const it = id && OUTBOX && OUTBOX.list().find(x => x.id === id); return it ? { state: it.state, acked: it.acked.length, of: it.relays.length, tries: it.tries || 0 } : { state: 'none', acked: 0, of: 0, tries: 0 }; };
const sentText = s => s.state === 'sent' ? `sent · ${s.acked} of ${s.of} relays have it` : s.state === 'failed' ? 'not sent: no relay took it in a day. Send the link or the file instead' : s.state === 'sending' ? (s.acked ? `sending · ${s.acked} of ${s.of} relays have it so far` : online() ? 'waiting for a relay to take it' : 'waiting for a connection') : '';
const sentShort = id => { const s = sentState(id); return s.state === 'sent' ? 'sent' : s.state === 'failed' ? 'not sent' : s.state === 'none' ? 'not sent' : s.acked ? `${s.acked} of ${s.of} relays` : online() ? 'sending' : 'offline'; };

// ----- the clinic: requests to review, one by one -----
const CREQ = 'vetlock.clinic.requests', creqs = () => { const a = jget(CREQ, []); return Array.isArray(a) ? a.filter(x => x && x.q && x.id) : []; };
const saveCreq = r => jset(CREQ, [...creqs().filter(x => x.id !== r.id), r]);
// what each relay was last read in full up to, per messaging key, and the wraps still to be taken here (relay.js receive: high-water
// marks, review of 9 Nov): a check reads two days back from there, not nine. A wrap that could not be taken yet (its request is not
// here yet, or no room to keep it) holds the reading back to it for two days at most, so another device's messages, never taken here,
// do not keep it reading far back; Import all forgets the marks, so the next check reads all nine days again (what it brought may have
// answers already waiting)
const RMARKS = role => 'vetlock.' + role + '.relaymarks', RDEFER = role => 'vetlock.' + role + '.relaydefer';
const relayMarks = role => { const t = Date.now() / 1000, d = jget(RDEFER(role), []).filter(x => x && x.id && Number(x.created) > t - 9 * 86400 && Number(x.first) > t - 2 * 86400);
  return { marks: jget(RMARKS(role), {}), defer: d, floor: d.length ? Math.min(...d.map(x => Number(x.created))) : 0 }; };
function relayMarksSave(role, st, res, taken, failed){ const t = Math.floor(Date.now() / 1000), marks = { ...st.marks }; for (const [u, m] of Object.entries(res.marks || {})) marks[u] = { ...(marks[u] || {}), ...m };
  const done = new Set(taken), had = new Map(st.defer.map(x => [x.id, x])), defer = st.defer.filter(x => !done.has(x.id));
  for (const x of [...failed, ...(res.deferred || [])]) if (!done.has(x.id) && !defer.some(y => y.id === x.id)) defer.push({ id: x.id, created: Number(x.created) || t, first: (had.get(x.id) || {}).first || t });
  jset(RMARKS(role), marks); jset(RDEFER(role), defer.slice(-200)); }
// THE AMOUNTS OF A REQUEST, checked against the campaign mint's keys before the partner can confirm it (review of 9 Nov, A04: the
// partner's signature covers a proof's secret, not the amount the request says, and the mint pays what the proof is really worth).
// Kept with the request; when the keys are not on this phone (no connection, never fetched) it is checked again when it is opened.
async function reqAmounts(r){ const q = r.q, keysets = {}; let locked = (r.amounts && r.amounts.locked) || null;
  try { const w = await wallet(q.campaign.mint); for (const id of new Set(q.contributions.flatMap(k => (k.proofs || []).map(p => String(p.id))))) { try { keysets[id] = await w.keyChain.ensureKeysetKeys(id); } catch (_) {} }
    if (!w._vlOffline) { const ps = q.contributions.flatMap(k => k.proofs || []); try { const st = await w.checkProofsStates(ps); locked = { at: nowIso(), n: st.filter(x => x.state === 'UNSPENT').length, of: ps.length }; } catch (_) {} } } catch (_) {}  /* NUT-07: still locked? (plan step 1) */
  let feeOf = null; if (q.campaign.lock === 'dest') { let w0 = null; try { w0 = await wallet(q.campaign.mint); } catch (_) {} feeOf = ps => { if (!w0 || ps.some(x => !keysets[String(x.id)])) return null; try { return amt(w0.getFeesForProofs(ps)); } catch (_) { return null; } }; }  /* a pot that pays from the lock: the fee its request leaves for the mint is the mint's own (core.js) */
  const p = C.amountProblems(q, keysets, feeOf); r.amounts = { at: nowIso(), problems: [...p], wrong: p.wrong, unchecked: p.unchecked, uncheckable: p.uncheckable, ...(locked ? { locked } : {}) }; return r.amounts; }
// what keeps a request from being confirmed: checked anew while it waits for review (one taken before these checks is held to them
// too); once answered, what was found when it came
const creqProblems = r => { if (r.state !== 'review') return r.problems || []; const p = [...reqProblems(r.q), ...(r.unsigned || [])];  /* unsigned: what takeRequest found of its signature, kept with it */ return p.length ? p : r.amounts ? r.amounts.problems : []; };
const creqInvalid = r => r.state !== 'review' ? !!(r.problems || []).length : !!reqProblems(r.q).length || !!(r.unsigned || []).length || !!(r.amounts && (r.amounts.wrong || r.amounts.uncheckable));  /* keys missing for now: not "not valid"; not Streetcat's signed request: not valid (review of 12 Nov) */
// the funding of a request, under its donations (plan step 1): what Streetcat's app could not check when it sent it, and what the mint
// says of its proofs now; drawn again on its own when the mint answers, so nothing the partner is doing on the screen is reset
function creqFund(r){ const fund = $('cr-fund'), q = r.q, fl = (cls, t) => fund.appendChild(el('div', cls, t)), lk = r.amounts && r.amounts.locked; fund.textContent = '';
  if (q.funding && q.funding.checked === false) fl('bad', `✗ Streetcat's app: funding not checked when sent · last verified at ${atWhen(Date.parse(q.funding.at) || 0)}`);
  if (lk && r.state === 'review') fl(lk.n === lk.of ? 'ok' : 'bad', `${lk.n === lk.of ? '✓' : '✗'} Checked at the mint ${Date.now() - Date.parse(lk.at) < 120000 ? 'now' : 'at ' + atWhen(Date.parse(lk.at))}: ${lk.n} of ${lk.of} still locked`);  reviewBox(r); }
// the terminal box of a request's screen: built again with the same lines keeps them still; a line that changed types itself in
function fillBox(out, id, L){ const was = (fillBox.seen || {})[id] || []; out.className = 'out fillbox'; out.textContent = ''; const term = el('div', 'term fill'), tk = el('div', 'ticker'); term.appendChild(tk); out.appendChild(term); (fillBox.seen = fillBox.seen || {})[id] = L;
  let wait = 0; L.forEach(([m, t], i) => { const d = el('div', 'tl' + (m === '✗' ? ' bad' : '')), text = `${m} ${t}`, same = was[i] && was[i][0] === m && was[i][1] === t; d.style.setProperty('--h', '100'); d.style.setProperty('--l', m === '·' ? '.5' : '.84'); tk.appendChild(d);
    if (m === '✗') d.textContent = text; else if (same || ls.get('vetlock.anim') === 'off') d.appendChild(withKeys(text)); else { d.style.visibility = 'hidden'; d.appendChild(withKeys(text)); setTimeout(() => { d.style.visibility = ''; typeKeys(d, text, { think: false, dur: 420 }); }, wait); wait += 480; } });  /* the whole line is there from the start (for a screen reader too); only its showing is typed in */
  requestAnimationFrame(() => { const b = tk.querySelector('.tl.bad'); if (b && term.scrollHeight > term.clientHeight + 1) term.scrollTop += b.getBoundingClientRect().top - term.getBoundingClientRect().top - 8; });  /* a box too full to show all: its first red line in sight */
  return term; }
// before it is confirmed: what is being checked at the mint, and that it waits
// Streetcat's app could not check the funding when it sent the request: said in red, whole, in every state (it was #cr-fund's line)
const fundLine = r => { const f = r.q.funding; return f && f.checked === false ? ['✗', `Streetcat's app: funding not checked when sent · last verified at ${atWhen(Date.parse(f.at) || 0)}`] : null; };
function reviewBox(r){ if (r.state !== 'review' || CUR_CREQ !== r.id) return; const lk = r.amounts && r.amounts.locked, L = [], fl = fundLine(r); if (fl) L.push(fl);
  /* "locked at the mint" only from the mint itself, with when; offline nothing is said to be checked (review of 12 Nov) */
  L.push(!r.amounts ? ['·', 'checking with the mint…'] : lk ? [lk.n === lk.of ? '✓' : '✗', `${lk.n}/${lk.of} locked at the mint · ${Date.now() - Date.parse(lk.at) < 120000 ? 'now' : atWhen(Date.parse(lk.at))}`] : ['·', 'not checked at the mint yet · no connection?']);
  L.push(r.amounts && (creqProblems(r).length || !clinicSkFor(r.q)) ? ['✗', 'it cannot be confirmed · see above'] : ['·', 'waiting for you']);
  fillBox($('cr-out'), r.id, L); }
const AMT = { busy: new Set(), at: {} };
async function amountsAgain(id){ if (AMT.busy.has(id) || Date.now() - (AMT.at[id] || 0) < 15000) return; AMT.busy.add(id); AMT.at[id] = Date.now();
  try { const r = creqs().find(x => x.id === id); if (!r || r.state !== 'review') return; const before = JSON.stringify((r.amounts || {}).problems || null); await reqAmounts(r);
    const cur = creqs().find(x => x.id === id); if (!cur || cur.state !== 'review') return; cur.amounts = r.amounts; saveCreq(cur);  /* whatever else changed meanwhile is kept */
    if (CUR_CREQ === id && $('creq').classList.contains('on')) { if (JSON.stringify(r.amounts.problems) !== before) renderCreq(); else creqFund(cur); } } catch (_) {} finally { AMT.busy.delete(id); } }
const clinicSkFor = q => q && q.campaign ? heldFor('clinic', [C.askedOf(q)]) : null;  /* the partner it asks: the campaign's, or the one of its list the request names (core.js) */
// a request whose pot's refund date has passed goes apart, under its own name: still to confirm (Streetcat releases what is still
// locked), never taken for a new one
const CGROUP = { review: 'To review', old: 'To review · refund date passed', sending: 'Waiting to be sent', reported: 'Reported', done: 'Done' };
const cGroup = r => r.state === 'review' ? (Number(r.q.campaign.deadline) < Date.now() / 1000 ? 'old' : 'review') : r.state === 'reported' ? 'reported' : sentState(r.outbox).state === 'sent' || r.handed || r.ackedAt ? 'done' : 'sending';
async function takeRequest(q0, from){ const { photoData, ...q } = q0 || {};
  if (photoData && typeof photoData === 'object') for (const ph of Array.isArray(q.photos) ? q.photos : []) { const s = photoData[ph.slot]; if (typeof s === 'string' && s.length <= C.CAT_PHOTO_MAX * 2) { try { await keepPhoto(String(ph.sha256), unb64(s)); } catch (_) {} } }  /* a file carries its photos */
  /* Whose request it is: through the relay its seal says so; by link, file or QR only Streetcat's signature on it does, and without
     one it is shown but cannot be confirmed (independent review, 11 Nov: anyone could write one naming Streetcat's published key). */
  const have = creqs().find(x => x.id === q.id), sg = await C.requestSig(q), unsig = sg === 'broken' ? ['its signature does not match: it was changed after Streetcat signed it'] : sg !== 'signed' && from !== 'relay' ? ['it is not signed by Streetcat: ask Streetcat to send it again'] : [];
  if (have && !(['review', 'reported'].includes(have.state) && (have.unsigned || []).length && !unsig.length)) return have;  /* reported too (Daybreak, 14 Nov: a forged copy opened first and reported kept Streetcat's own out) */  /* one copy kept; an unsigned or changed copy opened first gives way to Streetcat's own (review of 12 Nov: it kept the genuine one out) */
  const r = { id: q.id, q, from, at: nowIso(), state: 'review', problems: [...reqProblems(q), ...unsig], ...(unsig.length ? { unsigned: unsig } : {}) }; saveCreq(r); if (!r.problems.length) amountsAgain(r.id);  /* its amounts, against the mint's keys (A04): apart, so a slow mint holds nothing up */
  const sk = clinicSkFor(q); if (sk && OUTBOX && !r.problems.length) { try { await OUTBOX.add(R.receiptFor(q), sk, q.campaign.streetcat, { relays: relays(), label: 'received ' + q.id }); flush(); } catch (_) {} }  /* tells Streetcat it arrived */
  return r; }
const CSEEN = 'vetlock.clinic.seen';
async function clinicCheck(){ const sks = heldKeys('clinic'); if (!R) return { text: 'relays are not available in this browser' }; if (!sks.length) return { text: 'no clinic key in this browser yet: make one in settings' };
  if (!online()) return { text: 'no connection: showing what this phone already has' };
  const mine = new Set(sks.map(pubOf)), seen = new Set(jget(CSEEN, []));
  const expect = p => { if (!p) return null; if (p.t === 'streetcat.request' && p.campaign && mine.has(C.askedOf(p))) return p.campaign.streetcat;
    if (p.t === 'streetcat.request-photo' && mine.has(lc(p.clinic))) return p.from;  /* a request's photo: to this clinic's key, from the Streetcat key that sends it (it may come before its request) */
    const r = p.t === 'streetcat.received' && creqs().find(x => x.id === p.id); return r ? r.q.campaign.streetcat : null; };
  // a request that cannot be taken or saved (no room left on the phone) is said in red and asked for again at the next check, as in
  // Rescue's app (scCheck); before, it was lost without a word, or stopped the others behind it
  const rm = relayMarks('clinic'), res = await R.receive(sks, { relays: relays(), seen, expect, timeout: 8000, marks: rm.marks, floor: rm.floor }); let n = 0; const errs = [], taken = [], failed = [];
  for (const m of res.messages) { const p = m.payload; try { if ((p.t === 'streetcat.request' && !scOk(p.campaign)) || (p.t === 'streetcat.request-photo' && !published(p.from))) { taken.push(m.wrap); continue; }  /* not Streetcat's published key: read once, kept nowhere, no word back (S1) */
      if (p.t === 'streetcat.request') { if (!creqs().some(x => x.id === p.id)) { await takeRequest(p, 'relay'); if (!creqs().some(x => x.id === p.id)) throw new Error(NO_ROOM); n++; } }
      else if (p.t === 'streetcat.request-photo') { try { await takeReqPart(p); } catch (_) {} }
      else { const r = creqs().find(x => x.id === p.id); if (r && !r.ackedAt) { r.ackedAt = p.at || nowIso(); saveCreq(r); } } }
    catch (e) { errs.push(`a request from Streetcat could not be taken yet: ${(e && e.message) || e}. It is asked for again at the next check.`); seen.delete(m.wrap); if (p && p.id) seen.delete(pkeyOf(p)); failed.push({ id: m.wrap, created: m.created }); continue; } taken.push(m.wrap); }
  relayMarksSave('clinic', rm, res, taken, failed); jset(CSEEN, [...seen].slice(-400)); await flush(); const ok = res.relays.filter(x => x.ok).length;
  return { n, text: [`${n ? n + ' new · ' : ''}checked at ${new Date().toLocaleTimeString(EN, { hour: '2-digit', minute: '2-digit' })} · ${ok} of ${res.relays.length} relays answered`, ...errs.map(x => '✗ ' + x)].join('\n') }; }
// The partner's home: two numbers, pending (all not done yet: to review, refund date passed, waiting
// to be sent, reported) and done, then the buttons. A tap on a number shows its requests, typed in; a tap again hides them; entering Partner
// (the role, or its tab in the header) starts with none shown. Back from a request, the home shows what it showed.
const W_SETS = { pending: ['review', 'old', 'sending', 'reported'], done: ['done'] };
function renderWork(typed = false){ const list = $('w-list'); list.textContent = ''; const all = creqs().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  $('w-n').textContent = String(all.filter(r => cGroup(r) !== 'done').length); $('w-done').textContent = String(all.filter(r => cGroup(r) === 'done').length);
  for (const [id, k] of [['w-pend', 'pending'], ['w-dn', 'done']]) { const b = $(id); b.classList.toggle('on', W_SHOW === k); b.setAttribute('aria-pressed', String(W_SHOW === k)); }
  list.hidden = !W_SHOW; const lines = [];
  /* none of them: the list says nothing; the number says 0 */
  for (const g of W_SETS[W_SHOW] || []) { const rs = all.filter(r => cGroup(r) === g); if (!rs.length) continue; const gh = el('div', 'grp', CGROUP[g]); list.appendChild(gh); lines.push(gh);
    for (const r of rs) { const it = el('div', 'item'), l = el('div'), nm = el('div', 'nm', `${r.q.patient} · ${r.q.procedure}`), sub = el('div', 'sub2', `${r.q.id} · ${fmtSat(C.requestAmount(r.q))} · ${r.q.campaign.name}`); if (creqInvalid(r)) { sub.appendChild(document.createTextNode(' · ')); sub.appendChild(el('span', 'bad', '✗ not valid')); } l.appendChild(nm); l.appendChild(sub);  /* in red, as every warning */ it.appendChild(l);  /* its code first: the one Rescue shows (its photos are inside) */
      const st = g === 'review' || g === 'old' ? ['→', 'wait'] : g === 'done' ? r.pay && r.pay.gone ? ['check', 'bad'] : [r.pay && r.pay.state === 'paid' ? 'paid' : r.ackedAt ? 'received' : 'sent', 'ok'] : g === 'reported' ? [sentState(r.outbox).state === 'sent' || r.handed ? 'sent' : 'to send', 'bad'] : [sentShort(r.outbox), /^(not sent|offline)$/.test(sentShort(r.outbox)) ? 'bad' : ''];
      const se = el('div', 'st ' + st[1], st[0]); it.appendChild(se); it.onclick = () => { CUR_CREQ = r.id; openTab('creq'); }; list.appendChild(it); lines.push(nm, sub, se); } }
  if (typed && lines.length) typeLines(lines);  /* shown at a tap: typed in, as the donor's list of requests */
  offlineChecks().then(items => { const bad = items.filter(i => i.state === 'bad').length, o = $('w-offline');  // "Offline setup" in red while something is missing
    o.classList.toggle('bad', !!bad); o.title = bad ? `not ready for offline: ${bad} to fix` : 'ready for offline'; o.setAttribute('aria-label', 'Offline setup: ' + o.title); }).catch(() => {}); }
for (const [id, k] of [['w-pend', 'pending'], ['w-dn', 'done']]) { const b = $(id), go = () => { W_SHOW = W_SHOW === k ? '' : k; renderWork(true); };
  b.onclick = go; b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; }
let CUR_CREQ = null, REASON = '';
// what the partner is (the request's pot says it, signed by Streetcat): a clinic confirms a procedure on a cat, as before; a shop a
// delivery, with photos of the delivery note and of the goods; another partner what was delivered or done, with photos of the receipt
// and of it
const pkindOf = q => C.PKINDS.includes(q && q.campaign && q.campaign.pkind) ? q.campaign.pkind : 'clinic';
// who took a delivery in, as typed on the request open (optional; signed with the confirmation)
let CR_RECV = { id: '', v: '' }; $('cr-recv').addEventListener('input', () => { CR_RECV = { id: CUR_CREQ, v: $('cr-recv').value }; });
const PWORDS = { shop: { note: 'delivery note', goods: 'the goods', ok: 'I confirm this was delivered as it says, on this date.', go: 'Confirm delivery', label: 'Photos of the delivery', done: 'DELIVERY CONFIRMED' },
  other: { note: 'the receipt', goods: 'what was done', ok: 'I confirm this was delivered or done as it says, on this date.', go: 'Confirm it is done', label: 'Photos of what was done', done: 'CONFIRMED' } };
let CR_SHOTS = {}, CR_SHOTS_ID = null;
const crShotsLine = w => { const a = Object.values(CR_SHOTS), kb = Math.round(a.reduce((s, p) => s + p.bytes.length, 0) / 1000); $('cr-shots-st').textContent = a.length ? `${a.length} of 2 · ${kb} kB · no location data` : `At least one: ${w.note}, or ${w.goods}.`; };
let SHOTS_UI = () => {};  // the photos' button, the turn line and the photos' own screen (set up at the end of this script): drawn again whenever the photos change
const crShotsDraw = w => { document.querySelectorAll('#cr-shots .shot').forEach(b => { const p = CR_SHOTS[b.dataset.slot]; b.querySelector('span').textContent = w[b.dataset.slot]; b.querySelectorAll('img').forEach(i => i.remove()); b.classList.toggle('has', !!p);
    if (p) { const img = el('img'); img.alt = w[b.dataset.slot]; img.src = URL.createObjectURL(new Blob([p.bytes], { type: 'image/jpeg' })); b.prepend(img); } }); crShotsLine(w); SHOTS_UI(); };
document.querySelectorAll('#cr-shots .shot').forEach(b => { b.onclick = async () => { const r = creqs().find(x => x.id === CUR_CREQ), w = r && PWORDS[pkindOf(r.q)]; if (!w) return; const input = $('cr-shot-file');
  const f = await new Promise(res => { input.value = ''; input.onchange = () => res(input.files && input.files[0]); input.click(); }); if (!f) return;
  const say = $('cr-shots-box').classList.contains('sub') && $('cr-shots-err') || $('cr-out');  /* on the photos' own screen, said there: under it, nobody sees it (review of 12 Nov) */
  b.classList.add('busy'); try { CR_SHOTS[b.dataset.slot] = await shrinkPhoto(f); if ($('cr-shots-err')) show($('cr-shots-err'), ''); crShotsDraw(w); reviewBox(r); } catch (e) { show(say, failText(e), 'bad'); } b.classList.remove('busy'); }; });
// a confirmed delivery's photos when the page has been opened again: read back from this phone, where they were kept as it confirmed
// (review of 12 Nov: the screen said "0 of 2")
const SHOTS_GONE = new Set();  /* asked once: not on this phone */
function shotsBack(r){ const ps = (r.answer && r.answer.statement && r.answer.statement.photos) || []; if (!ps.length || shotsBack.busy === r.id || SHOTS_GONE.has(r.id)) return; shotsBack.busy = r.id;
  Promise.all(ps.map(async p => { let b = null; try { b = await IDB.get('photos', p.sha256); } catch (_) {} return b ? [p.slot, { bytes: b instanceof Uint8Array ? b : new Uint8Array(b), sha256: p.sha256, w: p.w, h: p.h }] : null; }))
    .then(a => { shotsBack.busy = ''; const got = Object.fromEntries(a.filter(Boolean)); if (!Object.keys(got).length) return SHOTS_GONE.add(r.id); (window.CR_DONE = window.CR_DONE || {})[r.id] = got; if (CUR_CREQ === r.id && $('creq').classList.contains('on')) renderCreq(); }); }
function renderCreq(){ const r = creqs().find(x => x.id === CUR_CREQ), head = $('cr-head'), dl = $('cr-dl'); head.textContent = ''; dl.textContent = ''; $('cr-gives').textContent = ''; $('cr-dl2').textContent = ''; $('cr-amt').textContent = ''; show($('cr-warn'), ''); show($('cr-out'), '');  /* nothing of the request shown before stays */
  $('cr-pics-box').hidden = true; if (!r) { life('cr-life'); head.appendChild(el('div', 'mut', 'No request open.')); $('cr-act').hidden = true; $('cr-cat').hidden = true; return; }
  const q = r.q, c = q.campaign, w = PWORDS[pkindOf(q)], vet = !w && KIND(typeOf(c)).vet; head.style.setProperty('--h', String(campHue(c))); head.appendChild(el('div', 'title', c.name)); head.appendChild(el('div', 'mut', `${c.op || 'operation'} · request ${q.id}`));
  for (const [k, v] of [[vet ? 'Cat' : 'For', q.patient], [vet ? 'Procedure' : 'What', q.procedure], ['Date', q.date], ['Releases', fmtSat(C.requestAmount(q))], ...(c.lock === 'dest' ? [['Paid to', `you · ${abbr(C.askedOf(q))}`]] : []), ...(q.note ? [['Note', q.note]] : []), ['From', scOk(c) ? `Streetcat ${abbr(c.streetcat)}` : `✗ not Streetcat · ${abbr(c.streetcat)}`], ['Arrived', `${when(r.at)} · ${({ relay: 'by relay', link: 'by link', file: 'from a file', 'in person': 'in person, by QR' })[r.from] || r.from}`]]) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', /^✗/.test(v) ? 'bad' : null, v)); }
  tidy('cr', dl, C.requestAmount(q)); $('cr-gives').textContent = q.contributions.map(k => `${k.ref} · ${fmtSat(k.release)} of ${fmtSat(k.proofs.reduce((s, p) => s + amt(p.amount), 0))}`).join('\n');
  /* a pot that pays from the lock: what this partner signs is the whole payment, so each donation says where all of it goes */
  if (c.lock === 'dest') $('cr-gives').textContent = C.requestSplit(q).map(x => `${x.ref} · ${fmtSat(x.pay)} to you${x.rest ? ` · ${fmtSat(x.rest)} stay locked` : ''}${x.fee ? ` · ${fmtSat(x.fee)} mint fee` : ''}`).join('\n');
  creqPics(q); creqFund(r);
  const probs = creqProblems(r), waiting = r.state === 'review' && !probs.length && !r.amounts;  /* its amounts not checked yet: asked now, and drawn again */
  if (r.state === 'review' && !reqProblems(q).length) amountsAgain(r.id);  /* its amounts, and whether its proofs are still locked: asked again as it is opened (every 15 s at most) */
  const sk = clinicSkFor(q), late = Number(c.deadline) < Date.now() / 1000, bad = probs.length || !sk || waiting;
  const warn = [...probs.map(p => '✗ ' + p), ...(sk ? [] : [`✗ This phone has no clinic key for ${c.name} (${abbr(C.askedOf(q))}). Open the request on the phone that holds that key, or restore its backup in settings.`]), ...(late ? [`⚠ The refund date (${fmtDate(c.deadline)}) has passed: donors may take their sats back at any moment. You can still confirm: Streetcat releases whatever is still locked.`] : [])];
  if (warn.length) show($('cr-warn'), warn.join('\n'), waiting ? '' : bad ? 'bad' : '');  /* waiting: only the ✗ and ⚠ lines in red */
  if (r.state === 'review') life('cr-life', bad && !waiting ? 'blocked' : 'locked', { three: c.lock !== 'dest' });  /* never "your turn" for what cannot be confirmed */
  const open = r.state === 'review'; $('cr-act').hidden = !open; $('cr-act').classList.remove('done'); $('cr-slot').textContent = ''; if (open) unfinish($('cr-go')); $('cr-ok').checked = false; $('cr-ok').disabled = !!bad; $('cr-go').disabled = true; REASON = ''; document.querySelectorAll('#cr-why button').forEach(b => b.classList.remove('on')); $('cr-report').disabled = true; $('cr-note').value = ''; $('cr-prob').open = false; $('cr-prob').hidden = !sk;
  EVID = null; evLine(); if (!open) { answerOut(r); payAgain(r.id); } creqCat(r);  /* a pot that pays from the lock: is its payment at the mint? */
  // a shop or another partner: its words, and its photos instead of the invoice's fingerprint
  $('cr-ok-t').textContent = w ? w.ok : 'I confirm this procedure was done on this cat, on this date.'; $('cr-evrow').hidden = $('cr-ev').hidden = !!w; $('cr-shots-box').hidden = !w; SHOTS_UI();
  /* what was typed stays through a redraw, another request starts empty; once confirmed, the line it went with, and no more typing */
  const sent = r.answer && r.answer.receivedBy && typeof r.answer.receivedBy.text === 'string' ? r.answer.receivedBy.text : ''; $('cr-recv').value = open ? (CR_RECV.id === r.id ? CR_RECV.v : '') : sent; $('cr-recv').disabled = !open;
  if (CR_SHOTS_ID !== r.id) { CR_SHOTS = {}; CR_SHOTS_ID = r.id; } if (w) { $('cr-shots-l').textContent = w.label; const now = CR_SHOTS, kept = !open && window.CR_DONE && window.CR_DONE[r.id]; if (kept) CR_SHOTS = kept; crShotsDraw(w); CR_SHOTS = now;
    if (!open && !kept) shotsBack(r); }
  const go = $('cr-go'); if (!go.classList.contains('holding') && !go._hint && !go.classList.contains('fin')) go.textContent = w ? w.go : 'Confirm procedure'; }
// the cat as Streetcat caught it, to check it is this cat; redrawn alone when a photo arrives, so a ticked box stays ticked
function creqPics(q){ const np = (q.photos || []).length; $('cr-pics-box').hidden = !np; if (!np) return;
  photoTiles($('cr-pics'), q.photos, 'on its way').then(n => { $('cr-pics-st').textContent = n === np ? '' : `${np - n} of ${np} on their way: they come by relay, with a connection.`; }); }
// the invoice or a photo: hashed here, the file never leaves this phone; only { sha256, kind } goes into the signed declaration
let EVID = null;
const evLine = () => { const e = $('cr-ev'); e.textContent = ''; if (!EVID) return;  /* nothing said until a file is added */
  e.appendChild(document.createTextNode(`${EVID.kind} · fingerprint ${EVID.sha256.slice(0, 16)}… · ${EVID.name} stays on this phone · `)); const x = el('a', null, 'remove'); x.href = '#'; x.onclick = ev => { ev.preventDefault(); EVID = null; evLine(); }; e.appendChild(x); };
const pickBytes = (input, accept) => new Promise((res, rej) => { input.value = ''; input.accept = accept; input.onchange = () => { const f = input.files && input.files[0]; if (!f) return; f.arrayBuffer().then(b => res({ name: f.name, bytes: new Uint8Array(b) }), () => rej(new Error('this file cannot be read'))); }; input.click(); });
for (const [id, kind, accept] of [['cr-inv', 'invoice', 'application/pdf,image/*'], ['cr-photo', 'photo', 'image/*']]) $(id).onclick = async () => { try { const f = await pickBytes($('cr-file'), accept); EVID = { kind, sha256: await C.sha256hex(f.bytes), name: f.name }; evLine(); } catch (e) { show($('cr-out'), failText(e), 'bad'); } };
// the answer goes to Streetcat by relay by itself, and says so: sent, then received. Only when it has not gone (no connection, or no relay took it) the warning shows, in red, with
// the other ways: the link, the file, the QR. Gone, a small link still shows it as QR, for Streetcat in person without a connection.
const stuck = (s, made) => s.state === 'failed' || (s.state === 'sending' && !s.acked && (s.tries > 0 || Date.now() - Date.parse(made) > 60000));  /* tried, or a minute, and no relay took it */
function answerOut(r){ const out = $('cr-out'), a = r.answer; if (!a) return; const s = sentState(r.outbox), gone = s.state === 'sent' || !!r.ackedAt || r.handed;
  const w = PWORDS[pkindOf(r.q)], nph = ((a.statement && a.statement.photos) || []).length;
  const head = a.kind === 'certified' ? `${w ? w.done : 'CONFIRMED'} · ${when(a.statement.signed)}\n` + payLine(r) + (a.statement.evidence ? `with the ${a.statement.evidence.kind}'s fingerprint ${a.statement.evidence.sha256.slice(0, 16)}…\n` : '') + (nph ? `with ${nph} photo${nph > 1 ? 's' : ''}, named in it · ${ansPhotosSent(r) ? '✓ sent' : 'sending'}\n` : '') : `PROBLEM REPORTED (${a.statement.reason}) · ${when(a.statement.signed)}\n`;
  const qrLink = t => { const p = el('p', 'center lnk'), x = el('a', null, t); x.href = '#'; x.onclick = async e => { e.preventDefault(); const box = el('div', 'term'), lbl = el('div', 'mut'); p.replaceWith(box); box.after(lbl); showQR(box, await C.pack(a), lbl); r.handed = true; saveCreq(r); }; p.appendChild(x); return p; };
  if (gone || (online() && OUTBOX && !!r.outbox && !stuck(s, a.statement.signed))) {  /* one the outbox never took is not "sending" (Daybreak, 14 Nov): it is said, with the ways to send it */
    /* What became of the answer, as short lines in a terminal box that fills the rest of the screen, typed in as
       they change, a mark before every one; whoever is named takes its key's colours (withKeys); the big button stays, saying what happened */
    const T = 100, L = [], hm = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); }; let paid = false;
    const fl = fundLine(r); if (fl) L.push(fl);
    if (a.kind === 'certified') { L.push(['✓', `${(w ? w.done : 'CONFIRMED').toLowerCase()} · ${hm(a.statement.signed)}`, T]);
      if (a.statement.evidence) L.push(['✓', `${a.statement.evidence.kind} attached`, T]); if (nph) L.push([ansPhotosSent(r) ? '✓' : '·', `${nph} photo${nph > 1 ? 's' : ''} ${ansPhotosSent(r) ? 'sent' : 'sending'}`, T]);
    } else L.push(['✗', `problem reported · ${a.statement.reason}`, T]);
    L.push(s.state === 'sent' || s.acked ? ['✓', `sent to Streetcat · ${s.acked}/${s.of}`, T] : r.handed && s.state !== 'sending' ? ['✓', 'given to Streetcat by hand', T] : ['·', 'sending to Streetcat…', T]);
    L.push(r.ackedAt ? ['✓', `Streetcat has it · ${hm(r.ackedAt)}`, T] : ['·', 'waiting for Streetcat', T]);
    for (const [m, t] of payBox(r)) L.push([m, t, m === '→' ? 250 : T]); paid = payStage(r, a) === 'paid';
    life('cr-life', payStage(r, a), { three: r.q.campaign.lock !== 'dest' });
    fillBox(out, r.id, L);
    if (a.kind === 'certified') { const act = $('cr-act'); act.hidden = false; act.classList.add('done'); $('cr-ok').checked = true; $('cr-ok').disabled = true; finish($('cr-go'), paid ? '✓ Paid' : `✓ ${w ? w.done.toLowerCase() : 'confirmed'}`); $('cr-slot').textContent = ''; $('cr-slot').appendChild(qrLink('Streetcat offline? Show QR')); }
    else out.appendChild(qrLink('Streetcat offline? Show QR'));
    return; }
  { const T = 100, hm = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); }, L = [];
    const fl = fundLine(r); if (fl) L.push(fl);
    L.push(a.kind === 'certified' ? ['✓', `${(w ? w.done : 'CONFIRMED').toLowerCase()} · ${hm(a.statement.signed)}`] : ['✗', `problem reported · ${a.statement.reason}`]);
    L.push(['✗', !OUTBOX ? 'not sent · no relays here' : !online() ? 'not sent · no connection' : 'not sent · no relay took it']); L.push(['·', !OUTBOX || online() ? 'give it to Streetcat by hand' : 'it goes by itself · or by hand']);
    L.push(...payBox(r));  /* what the mint paid is said here too: a confirmation that did not go by relay can still have been paid */
    const stage = payStage(r, a); life('cr-life', stage, { three: r.q.campaign.lock !== 'dest' });
    fillBox(out, r.id, L);
    if (a.kind === 'certified') { const act = $('cr-act'); act.hidden = false; act.classList.add('done'); $('cr-ok').checked = true; $('cr-ok').disabled = true; finish($('cr-go'), stage === 'paid' ? '✓ Paid' : `✓ ${w ? w.done.toLowerCase() : 'confirmed'}`); } }
  const inbox = (t => { if (!t) return out; const l = el('div', 'hlinks'); t.appendChild(l); return l; })(out.querySelector('.term.fill'));  /* the ways to hand it over, inside the box: nothing under it moves */
  const row = el('div', 'row2'), lb = smallBtn('copy link for Streetcat', async () => { const ok = await copyText(await linkOf(a, 'streetcat')); if (ok) { doneLabel(lb); r.handed = true; saveCreq(r); } else flapLabel(lb, 'select it'); });
  row.appendChild(lb); row.appendChild(smallBtn('save as file', () => { saveFile(`answer-${r.id}.json`, JSON.stringify(a)); r.handed = true; saveCreq(r); })); inbox.appendChild(row);
  const rq = el('div', 'row1'), qb = smallBtn('show as QR', async () => { const box = el('div', 'term'), lbl = el('div', 'mut'); (rq.closest('.term.fill') || rq).replaceWith(box); box.after(lbl);  /* the QR takes the box's place: inside it, it would be too small to scan */ showQR(box, await C.pack(a), lbl); r.handed = true; saveCreq(r); }); rq.appendChild(qb); inbox.appendChild(rq);
  /* sent again: one the outbox never took (no room), or gave up on, goes in again (Daybreak, 14 Nov: "send again" only went over what was there) */
  if (s.state !== 'sent' && OUTBOX && online()) { const r1 = el('div', 'row1'); r1.appendChild(smallBtn('send again', async () => { try { await answerQueue(creqs().find(x => x.id === r.id) || r, true); } catch (e) { return show($('cr-out'), failText(e), 'bad'); } await flush(); renderCreq(); })); inbox.appendChild(r1); } }
$('cr-ok').onchange = () => { $('cr-go').disabled = !$('cr-ok').checked; };
document.querySelectorAll('#cr-why button').forEach(b => { b.onclick = () => { REASON = b.dataset.r; document.querySelectorAll('#cr-why button').forEach(x => x.classList.toggle('on', x === b)); $('cr-report').disabled = false; }; });
// the answer to the request it names, the one that was on screen when it was tapped (Daybreak, 14 Nov: it took the one open when its
// photos were saved, so opening another meanwhile signed that other, with the first one's photos and none of its checks)
// into the outbox: a new answer always; again (the button) only one the outbox does not hold, or gave up on
async function answerQueue(r, again = false){ if (!OUTBOX || !r.answer || (again && r.outbox && !['none', 'failed'].includes(sentState(r.outbox).state))) return;
  const it = await OUTBOX.add(r.answer, clinicSkFor(r.q), r.q.campaign.streetcat, { relays: relays(), label: 'answer ' + r.id }); r.outbox = it.id; saveCreq(r); }
async function clinicAnswer(make, id){ const r = creqs().find(x => x.id === id); if (!r) throw new Error('no request open'); const sk = clinicSkFor(r.q); if (!sk) throw new Error(`this phone has no clinic key for ${r.q.campaign.name}`);
  r.answer = await make(r, sk); r.state = r.answer.kind === 'report' ? 'reported' : 'answered'; r.offline = !online(); saveCreq(r); buzz();
  await answerQueue(r); renderCreq(); await flush(); renderCreq(); }
$('cr-go').onclick = async () => { const btn = $('cr-go'), was = CUR_CREQ; busy(btn, true); try { if (!$('cr-ok').checked) throw new Error('tick the box first');
    const r0 = creqs().find(x => x.id === was), w = r0 && PWORDS[pkindOf(r0.q)]; if (!r0) throw new Error('no request open');
    if (r0.state === 'review' && (creqProblems(r0).length || !r0.amounts)) throw Object.assign(new Error('this request cannot be confirmed: ' + (creqProblems(r0)[0] || 'its amounts are not checked with the mint yet')), { byPage: true });  /* signed only what was checked (A04) */
    /* what is on screen as it is tapped: the photos are saved first, and another request may be opened meanwhile */
    const mine = CR_SHOTS, ev = !w && EVID ? { sha256: EVID.sha256, kind: EVID.kind } : null, recv = (w && CR_RECV.id === was && CR_RECV.v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/ {2,}/g, ' ').trim()) || null;  /* a pasted tab or line break is a space (review of 12 Nov: it made the confirmation fail) */
    const shots = w ? C.ANS_SLOTS.filter(s => mine[s]).map(s => ({ slot: s, sha256: mine[s].sha256, bytes: mine[s].bytes.length, w: mine[s].w, h: mine[s].h })) : [];
    if (w && !shots.length) throw new Error(`add a photo first: ${w.note}, or ${w.goods}`);
    try { for (const p of shots) await IDB.put('photos', p.sha256, mine[p.slot].bytes); } catch (_) { throw Object.assign(new Error('this browser cannot keep the photos (a private window?): open the app in a normal window'), { byPage: true }); }  /* before the confirmation names them */
    await clinicAnswer((r, sk) => C.certify(r.q, sk, undefined, ev, shots, recv), was); if (CR_RECV.id === was) CR_RECV = { id: '', v: '' };
    if (shots.length) { (window.CR_DONE = window.CR_DONE || {})[was] = mine; if (CR_SHOTS === mine) CR_SHOTS = {}; ansParts().then(() => { if ($('creq').classList.contains('on')) renderCreq(); }).catch(() => {}); } }
  catch (e) { show($('cr-out'), failText(e), 'bad'); } if (CUR_CREQ === was) busy(btn, false); };  /* another request opened meanwhile: its screen set the button (13 Nov: a confirmation still sending enabled the next one's) */
// the confirmation's photos, every part that two relays do not have yet, wrapped for Streetcat's key (as a request's, reqParts)
let ANSSENDING = null;
const ansPhotosSent = r => { const need = Math.min(2, relays().length), ps = (r.answer && r.answer.statement && r.answer.statement.photos) || []; return !!need && ps.every(ph => Array.from({ length: nParts(ph) }, (_, i) => ph.slot + '.' + i).every(k => ((r.parts || {})[k] || []).length >= need)); };
async function ansParts(){ if (ANSSENDING) return ANSSENDING; if (!R || !online()) return; ANSSENDING = (async () => { const rels = relays(), need = Math.min(2, rels.length);
    for (const r0 of creqs()) { const a = r0.answer, ps = (a && a.kind === 'certified' && a.statement && a.statement.photos) || []; if (!ps.length || !r0.outbox || ansPhotosSent(r0)) continue; const sk = clinicSkFor(r0.q); if (!sk) continue;
      for (const ph of ps) { let bytes = null; try { bytes = await IDB.get('photos', ph.sha256); } catch (_) {} if (!bytes) continue;
        for (const part of C.ansPhotoParts(r0.id, ph.slot, ph.sha256, b64of(new Uint8Array(bytes)), C.askedOf(r0.q), r0.q.campaign.streetcat)) { const r = creqs().find(y => y.id === r0.id) || r0; r.parts = r.parts || {}; const acked = r.parts[part.kind] || []; if (acked.length >= need) continue;
          try { const res = await R.publish(await R.wrap(part, sk, r0.q.campaign.streetcat), rels.filter(u => !acked.includes(u)), { timeout: 8000 }); for (const x of res) if (x.ok && !acked.includes(x.url)) acked.push(x.url); } catch (_) {}
          r.parts[part.kind] = acked; saveCreq(r); } } } })().finally(() => { ANSSENDING = null; }); return ANSSENDING; }
$('cr-report').onclick = async () => { const btn = $('cr-report'), was = CUR_CREQ, why = REASON, note = $('cr-note').value.trim(); busy(btn, true); try { if (!why) throw new Error('pick what happened'); await clinicAnswer((r, sk) => C.report(r.q, sk, why, note), was); } catch (e) { show($('cr-out'), failText(e), 'bad'); } busy(btn, false); };
$('w-check').onclick = async () => { const btn = $('w-check'); busy(btn, true); $('w-net').textContent = 'checking the relays…'; try { const res = await clinicCheck(); setLines($('w-net'), res.text); } catch (e) { setLines($('w-net'), '✗ ' + (e.message || e)); } renderWork(); busy(btn, false); };
$('w-open').onclick = () => { $('w-paste').hidden = !$('w-paste').hidden; if (!$('w-paste').hidden) $('w-text').focus(); };
$('w-read').onclick = async () => { try { await openPayload($('w-text').value, 'link'); $('w-text').value = ''; } catch (e) { show($('w-out'), failText(e), 'bad'); } };
$('w-pick').onclick = async () => { try { await openPayload(await pickFile($('w-file')), 'file'); } catch (e) { show($('w-out'), failText(e), 'bad'); } };
$('w-scan').onclick = () => scan(async t => { try { await openPayload(t, 'in person'); } catch (e) { show($('w-out'), failText(e), 'bad'); } });  /* the request on Streetcat's screen */
for (const [id, t] of [['w-settings', 'csettings'], ['w-offline', 'coffline'], ['cs-offline', 'coffline']]) $(id).onclick = e => { e.preventDefault(); openTab(t); };

// ----- THE PARTNER IS PAID BY THE MINT (core.js, `dest`) -----
// Once Streetcat releases a request of a pot that pays from the lock, the mint holds this partner's payment, locked to its key alone.
// Its app finds it with the request (it built each transaction itself: C.destFind, NUT-09; nobody hands the payment over) and sends
// it on to its Lightning address, set once in its settings, as Rescue's app does with what it releases. The payment is written down before it is sent, so a lost answer is asked
// about again and never paid twice. With no address, or while sending fails, it waits at the mint, where only this partner's key can
// take it, and that is said in red. What the mint kept for fees and did not use stays here as ecash and goes with the next payment.
const CPAYTO = 'vetlock.clinic.payto', CPAYOUTS = 'vetlock.clinic.payouts', CCHANGE = 'vetlock.clinic.change', CPAY = { busy: new Set(), at: {} };
const cPayTo = () => { const a = String(ls.get(CPAYTO) || '').trim(); return a && C.lnAddressUrl(a) ? a : ''; };
const cPayouts = () => { const a = jget(CPAYOUTS, []); return Array.isArray(a) ? a.filter(x => x && x.id) : []; }, saveCPayout = m => jset(CPAYOUTS, keepOpen([...cPayouts().filter(x => x.id !== m.id), m], x => x.state === 'pending' || !!x.changeDue, 60));
const cChange = () => { const a = jget(CCHANGE, []); return Array.isArray(a) ? a.filter(x => x && x.token) : []; };
const cKeep = (proofs, m) => jset(CCHANGE, [...cChange(), { token: cashu.getEncodedToken({ mint: m.mint, proofs, memo: 'change of a payment to ' + m.to }), amount: sum(proofs), mint: m.mint, at: nowIso() }]);
const setPay = (id, patch) => { const r = creqs().find(x => x.id === id); if (!r) return null; r.pay = { ...(r.pay || {}), ...patch, at: (r.pay && r.pay.at) || nowIso() }; if (patch.state !== 'atmint') delete r.pay.why; saveCreq(r); return r.pay; };
// change null: the payment's answer was lost, so its change is still to be asked back from the mint (cTakeChange)
function cSettle(m, state, change = []){ m.done = nowIso(); if (state !== 'PAID') { m.state = 'failed'; saveCPayout(m); return null; }
  m.state = 'paid'; m.changeDue = change === null && !!(m.outs && m.outs.length); saveCPayout(m);
  if (m.used && m.used.length) jset(CCHANGE, cChange().filter(x => !m.used.includes(x.token)));  /* the change of earlier payments went with this one */
  const c = change === null ? 0 : sum(change); if (c) { if (cKeep(change, m)) m.change = c; else m.changeDue = !!(m.outs && m.outs.length);  /* not kept (no room): still owed, asked back from the mint next time, as after a lost answer */ saveCPayout(m); } return { sent: m.amount, change: m.change || 0 }; }
async function cTakeChange(m){ const ch = await changeBack(await wallet(m.mint), m.outs), c = sum(ch); if (c && !cKeep(ch, m)) return 0;  /* not kept: still owed, asked again next time */
  m.changeDue = false; m.change = c; saveCPayout(m); return c; }
async function cRecheck(m){ const q = await (await wallet(m.mint)).checkMeltQuoteBolt11(m.quote); if (q.state === 'PAID') { cSettle(m, 'PAID', null); await cTakeChange(m).catch(() => 0); } else if (q.state === 'UNPAID') cSettle(m, 'UNPAID'); }
// the largest invoice the mint can pay from the payment (and from what earlier payments left here) after its fees
async function cPayOut(w, r, locked, sk, to){ const mint = norm(r.q.campaign.mint), busy = new Set(cPayouts().filter(m => m.state === 'pending').flatMap(m => m.used || [])), extra = cChange().filter(x => norm(x.mint) === mint && !busy.has(x.token));
  const inputs = [...cashu.signP2PKProofs(locked, sk), ...extra.flatMap(x => { try { return w.decodeToken(x.token).proofs; } catch (_) { return []; } })], total = sum(inputs);
  let inFee = 0; try { inFee = amt(w.getFeesForProofs(inputs)); } catch (_) {}
  let want = Math.max(1, total - inFee - reserveGuess(total)), best = null;
  for (let i = 0; i < 2; i++) { const inv = (await C.lnAddressInvoice(to, want)).invoice, q = await w.createMeltQuoteBolt11(inv), room = total - inFee - amt(q.fee_reserve);  /* the exact room once the mint's reserve is known */
    if (amt(q.amount) <= room) { best = { inv, q }; if (room === amt(q.amount)) break; want = room; } else { if (best || room < 1) break; want = room; } }
  if (!best) throw new Error(`the mint keeps too much for fees to pay ${fmtSat(total)} out by Lightning`);
  const m = { id: 'cp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), req: r.id, quote: best.q.quote, amount: amt(best.q.amount), to, mint, at: nowIso(), state: 'pending', used: extra.map(x => x.token), took: sum(locked) };  /* took: how much of the request's own payment goes with it, so that what was collected by another hand can be told (cCollect) */
  const prep = await w.ops.meltBolt11(best.q, inputs).prepare(); m.outs = (prep.outputData || []).map(outSave);  /* the change's blank outputs, kept with the payment before it is sent */
  if (!saveCPayout(m)) throw new Error('this phone could not write the payment down first (its storage is full or blocked), so it was not sent');
  try { const res = await w.completeMelt(prep); if (res.quote && res.quote.state && res.quote.state !== 'PAID') return { pending: true, amount: m.amount };
    return cSettle(m, 'PAID', res.change || []);
  } catch (e) { let st = ''; try { st = (await w.checkMeltQuoteBolt11(best.q.quote)).state; } catch (_) {}
    if (st === 'PAID') { const x = cSettle(m, 'PAID', null); return { ...x, change: await cTakeChange(m).catch(() => 0) }; }  /* paid, its answer lost: the change is asked back */
    if (st === 'UNPAID') { cSettle(m, 'UNPAID'); throw e; } return { pending: true, amount: m.amount }; } }
// One confirmed request: has the mint paid it, and is the payment still there? While Streetcat has not released, that is one question to
// the mint (NUT-07, are the request's proofs spent?) and no more. One at a time for each request.
async function cCollect(id){ if (CPAY.busy.has(id)) return null; CPAY.busy.add(id);
  try { const r = creqs().find(x => x.id === id); if (!r || !r.answer || r.answer.kind !== 'certified' || r.q.campaign.lock !== 'dest' || (r.pay && (r.pay.state === 'paid' || r.pay.state === 'none'))) return (r && r.pay) || null;
    const q = r.q, sk = clinicSkFor(q); if (!sk) return null; const me = C.askedOf(q), w = await wallet(q.campaign.mint); if (w._vlOffline) return r.pay || null;
    const open = cPayouts().find(m => m.req === id && m.state === 'pending'); if (open) { await cRecheck(open); if (cPayouts().some(m => m.id === open.id && m.state === 'pending')) return setPay(id, { state: 'sending', to: open.to }); }
    const txs = []; for (const k of q.contributions) txs.push(await C.reqTx(q, k));
    const ins = await w.checkProofsStates(txs.flatMap(t => t.inputs)); if (!ins.some(x => x.state === 'SPENT')) return r.pay || null;  /* not released yet */
    /* A request has one transaction for each donation, and Streetcat's app sends them one after another: this check can fall between
       two of them, or a release can be finished later. It was called "paid" as soon as what had been found was sent on, and never
       looked at again: the second 300 sat of a 600 sat request stayed at the mint for good (audit of 10 Nov). It is "paid" only when
       every transaction's proofs are spent, so nothing more can come; until then it is "part", and looked at again. And a payment
       counts only when the mint signed that very transaction whole (C.destWhole), not whatever else sits under its blinded messages. */
    const more = !ins.every(x => x.state === 'SPENT'), of = C.requestSplit(q).reduce((a, x) => a + x.pay, 0), found = [];
    for (const t of txs) { const parts = await C.destFind(w, t); if (C.destWhole(t, parts)) found.push(...parts.filter(x => !x.rest && x.to === me).map(x => x.proof)); }
    if (!found.length) return more ? (r.pay || null) : setPay(id, { state: 'none', amount: 0, of });  /* every proof of it spent and nothing of it paid to this partner: its donor took it back, or it was paid under another request. Said (payLine), not left as "once Streetcat releases" for ever */
    const fs = await w.checkProofsStates(found), live = found.filter((p, i) => fs[i] && fs[i].state === 'UNSPENT'), amount = sum(found), state = more ? 'part' : 'paid';
    const sentSoFar = () => { const paid = cPayouts().filter(m => m.req === id && m.state === 'paid'); return paid.length ? { sent: paid.reduce((a, m) => a + m.amount, 0), to: paid[paid.length - 1].to, change: paid.reduce((a, m) => a + (m.change || 0), 0) } : {}; };
    /* What the mint paid this partner and is spent, but was not sent on from here: collected with the partner's key by another phone,
       or by someone who has the key. It was shown as "✓ sent to your wallet", which this phone cannot know (outside review, 11 Nov).
       Counted from the payments written down here (took); one written before that was kept says nothing either way. */
    const elsewhere = spent => { const ms = cPayouts().filter(m => m.req === id && (m.state === 'paid' || m.state === 'pending')); if (ms.some(m => m.took == null)) return { gone: 0 };
      const took = Math.max(Number(r.pay && r.pay.took) || 0, ms.reduce((a, m) => a + m.took, 0)); return { took, gone: Math.max(0, spent - took) }; };
    if (!live.length) return setPay(id, { state, amount, of, ...sentSoFar(), ...elsewhere(amount) });
    const to = cPayTo(); if (!to) return setPay(id, { state: 'atmint', amount, of, to: '', why: '' });
    try { const res = await cPayOut(w, r, live, sk, to); return setPay(id, res.pending ? { state: 'sending', amount, of, to } : { state, amount, of, to, ...sentSoFar(), ...elsewhere(amount) }); }
    catch (e) { return setPay(id, { state: 'atmint', amount, of, to, why: String((e && e.message) || e).slice(0, 200) }); }
  } finally { CPAY.busy.delete(id); } }
// every confirmed request not paid out yet (those whose pot closed more than a week ago are let be), and the change of a payment whose answer was lost
async function cCollectAll(){ const now = Date.now() / 1000; for (const m of cPayouts().filter(x => x.state === 'paid' && x.changeDue)) { try { await cTakeChange(m); } catch (_) {} }
  for (const r of creqs()) { if (!r.answer || r.answer.kind !== 'certified' || r.q.campaign.lock !== 'dest' || (r.pay && (r.pay.state === 'paid' || r.pay.state === 'none')) || Number(r.q.campaign.deadline) < now - 7 * 86400) continue; try { await cCollect(r.id); } catch (_) {} } }
// the same for the request on screen, as it is opened (every 15 s at most); drawn again only if something changed
async function payAgain(id){ if (Date.now() - (CPAY.at[id] || 0) < 15000) return; CPAY.at[id] = Date.now(); const was = JSON.stringify((creqs().find(x => x.id === id) || {}).pay || null);
  try { await cCollect(id); } catch (_) {} const cur = creqs().find(x => x.id === id); if (cur && JSON.stringify(cur.pay || null) !== was && CUR_CREQ === id && $('creq').classList.contains('on') && !$('creq').querySelector('.qr')) renderCreq(); }
// under a confirmation: where its payment is
const payLine = r => { if (r.q.campaign.lock !== 'dest' || !r.answer || r.answer.kind !== 'certified') return ''; const p = r.pay, to = (p && p.to) || cPayTo();
  if (!p) return '· paid by the mint once Streetcat releases\n';
  if (p.state === 'none') return '✗ Not paid: its donations are no longer locked (taken back by their donors, or paid under another request). Ask Streetcat.\n';
  if (p.state === 'paid' || p.state === 'part') { const less = p.of && p.amount < p.of ? p.of - p.amount : 0;  /* part: some of the request's donations are not released yet; paid and less: one of them went another way (its donor took it back) */
    const gone = p.gone || 0, sent = p.sent || (gone ? 0 : p.amount);  /* gone: collected with this partner's key, not from this phone */
    return (sent ? `✓ ${fmtSat(sent)} sent to ${p.to || 'your wallet'}${p.change ? ` · ${fmtSat(p.change)} kept here for the next payment` : ''}\n` : '') + (gone ? `✗ ${fmtSat(gone)} collected with your key, not from this phone. Not you? Tell Streetcat and make a new key.\n` : '') + (p.state === 'part' ? `· ${less ? fmtSat(less) : 'the rest'} to come once Streetcat releases it\n` : less ? `✗ ${fmtSat(less)} of ${fmtSat(p.of)} were not paid: that donation is no longer locked. Ask Streetcat.\n` : ''); }
  if (p.state === 'sending') return `· ${fmtSat(p.amount)} on their way to ${to}\n`;
  return to ? `✗ ${fmtSat(p.amount)} paid by the mint, not sent to ${to}${p.why ? ': ' + p.why : ''}. It is tried again by itself.\n` : `✗ ${fmtSat(p.amount)} paid by the mint: set a Lightning address in settings to receive them\n`; };
// the same facts as payLine, as the short lines of the partner's box: what the mint paid, where it went, and in red, in full, what was not
// paid or was collected with this partner's key from another phone (one of these must never be lost to a shorter screen)
const payBox = r => { if (r.q.campaign.lock !== 'dest' || !r.answer || r.answer.kind !== 'certified') return []; const p = r.pay, to = (p && p.to) || cPayTo();
  if (!p) return [['·', 'the mint pays on release']];
  if (p.state === 'none') return [['✗', 'not paid: its donations are no longer locked · ask Streetcat']];
  if (p.state === 'paid' || p.state === 'part') { const less = p.of && p.amount < p.of ? p.of - p.amount : 0, gone = p.gone || 0, sent = p.sent || (gone ? 0 : p.amount), L = [];
    if (sent) { L.push(['✓', `paid ${fmtSat(sent)} by the mint`]); L.push(['→', p.to || 'your wallet']); }
    if (p.change) L.push(['·', `${fmtSat(p.change)} kept here for the next payment`]);
    if (gone) L.push(['✗', `${fmtSat(gone)} collected with your key, not from this phone · not you? tell Streetcat and make a new key`]);
    if (p.state === 'part') L.push(['·', `${less ? fmtSat(less) : 'the rest'} to come on release`]); else if (less) L.push(['✗', `${fmtSat(less)} of ${fmtSat(p.of)} not paid · ask Streetcat`]);
    return L; }
  if (p.state === 'sending') return [['·', `${fmtSat(p.amount)} on the way to ${to}`]];
  return [['✗', to ? `${fmtSat(p.amount)} paid by the mint, not sent to ${to}${p.why ? ': ' + p.why : ''} · tried again by itself` : `${fmtSat(p.amount)} paid by the mint · set a Lightning address in settings`]]; };
// the stage the partner's screen shows: "paid" only when all of it reached this partner from this phone; collected elsewhere, paid in
// part, or not paid at all is said as such, in red (review of 12 Nov: the theft case read "the mint is paying you", a part read "✓ Paid")
const payStage = (r, a) => { if (a.kind !== 'certified') return 'reported'; const p = r.pay; if (!p) return 'certified'; if (p.state === 'none') return 'unpaid';
  if (p.state === 'paid' || p.state === 'part') { if (p.gone) return 'gone'; if (p.state === 'part') return 'released'; return p.of && p.amount < p.of ? 'short' : 'paid'; }
  return 'released'; };
async function csLnCheck(saving){ const st = $('cs-ln-st'), v = $('cs-ln').value.trim().replace(/^lightning:/i, '');
  if (!v) { if (saving) ls.set(CPAYTO, ''); show(st, ''); return; }
  const url = C.lnAddressUrl(v); if (!url) { show(st, `✗ ${v} is not a Lightning address (name@domain)` + (saving ? ': nothing was saved.' : '.'), 'bad'); return; }
  if (saving) { ls.set(CPAYTO, v); $('cs-ln').value = v; } show(st, `checking ${v}…`);
  try { let r; try { r = await window.scCore.fetchT(url, { headers: { accept: 'application/json' } }); } catch (_) { throw new Error('it cannot be reached from this phone'); } const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.tag !== 'payRequest') throw new Error(j && j.reason ? j.reason : `it answered HTTP ${r.status}`);
    show(st, ''); if (saving) { buzz(); cCollectAll().then(() => refreshStates()).catch(() => {}); }  /* it answers: nothing to say, as in Rescue's Keys; what waits at the mint is sent now */
  } catch (e) { show(st, `✗ ${v}: ${e.message || e}. Until it answers, what you are paid waits at the mint.`, 'bad'); } }
$('cs-ln').addEventListener('change', () => csLnCheck(true));

// ----- the clinic's settings: its key and a backup of it, locked with a password (PBKDF2 + AES-GCM) -----
function renderSettings(){ const ln = $('cs-ln'); if (document.activeElement !== ln) { ln.value = String(ls.get(CPAYTO) || ''); if (!renderSettings.ln) { renderSettings.ln = true; csLnCheck(false); } }
  const kept = $('cs-kept'), ch = cChange(); kept.textContent = ''; if (ch.length) { kept.appendChild(document.createTextNode(`${fmtSat(ch.reduce((a, x) => a + Number(x.amount || 0), 0))} kept here as ecash: it goes with the next payment `)); for (const x of ch) kept.appendChild(copyBtn(`copy ${fmtSat(x.amount)}`, x.token)); }
  const sk = key('clinic', false), n = oldKeys('clinic').length; if (sk) roleOf(pubOf(sk), 'clinic'); $('cs-pk').textContent = sk ? pubOf(sk) : '— (none yet)'; $('cs-pk-old').textContent = n ? ` + ${n} older key${n > 1 ? 's' : ''} kept` : ''; undone($('cs-copy')); }
$('cs-copy').onclick = async () => { const b = $('cs-copy'), sk = key('clinic', false); if (!sk) return flapLabel(b, 'no key'); const ok = await copyText(pubOf(sk)); if (ok) doneLabel(b); else flapLabel(b, 'select it'); };
$('cs-new').onclick = () => { makeKey('clinic', 'Make a new clinic key? Streetcat must put the new public key in new campaigns. The current key stays on this phone, so requests of older campaigns can still be confirmed here.'); renderSettings(); flapKeys($('cs-pk'), $('cs-pk').textContent, { speed: .6, hex: true }); };
$('cs-show').onclick = () => showSk('clinic', $('cs-show'));
const B64 = { enc: u => btoa(String.fromCharCode(...u)), dec: s => Uint8Array.from(atob(String(s)), ch => ch.charCodeAt(0)) }, KDF_ITER = 310000;
const pwKey = async (pw, salt, iter, use) => crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, false, [use]);
async function keyBackup(pw){ const sk = key('clinic', false); if (!sk) throw new Error('there is no clinic key to back up yet'); const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await pwKey(pw, salt, KDF_ITER, 'encrypt'), new TextEncoder().encode(JSON.stringify({ clinic: sk, clinicOld: oldKeys('clinic') }))));
  return { t: 'streetcat.key-backup', v: 1, role: 'clinic', pub: pubOf(sk), kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITER, salt: B64.enc(salt) }, cipher: { name: 'AES-GCM', iv: B64.enc(iv) }, data: B64.enc(ct), created: nowIso() }; }
async function keyRestore(j, pw){ if (!j || j.t !== 'streetcat.key-backup' || j.v !== 1 || !j.kdf || !j.cipher || !(Number(j.kdf.iterations) >= 100000 && Number(j.kdf.iterations) <= 5000000)) throw new Error('this is not a key backup made by this app');  /* the round count is the file's word: only what this app writes is tried (audit of 10 Nov; openExport had the limits, this had none) */
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

// ----- everything Keys exports, sealed with a password (review of 9 Nov, S2) -----
// "Export all" puts the private keys in the clipboard as they are, to carry them to another browser at once. To KEEP them, Rescue had
// nothing else, while the partner's key had a backup locked with a password (above). The same lock (PBKDF2-SHA256 and AES-GCM) now
// seals the whole export of the actor on screen (its keys, its records and their photos) into a file; restoring it opens the file with
// its password and imports it as "Import all" does, with the same rules: this actor's part only, and nothing this browser had is dropped.
async function sealExport(text, pw, role){ const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await pwKey(pw, salt, KDF_ITER, 'encrypt'), new TextEncoder().encode(text)));
  return { t: 'streetcat.export-backup', v: 1, role, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITER, salt: B64.enc(salt) }, cipher: { name: 'AES-GCM', iv: B64.enc(iv) }, data: b64of(ct), created: nowIso() }; }
async function openExport(j, pw){ const it = Number(j && j.kdf && j.kdf.iterations); if (!j || j.t !== 'streetcat.export-backup' || j.v !== 1 || !j.cipher || !(it >= 100000 && it <= 5000000)) throw new Error('this is not a sealed backup made by this app');
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: B64.dec(j.cipher.iv) }, await pwKey(pw, B64.dec(j.kdf.salt), it, 'decrypt'), unb64(j.data))); } catch (_) { throw new Error('wrong password, or the file is damaged: nothing was changed'); } }
$('x-seal-save').onclick = async () => { const b = $('x-seal-save'), out = $('x-seal-out'); busy(b, true); try { const pw = $('x-pw').value; if (pw.length < 10) throw new Error('the password needs 10 characters or more'); if (pw !== $('x-pw2').value) throw new Error('the two passwords are not the same');
    const role = xActor(), j = xKeys(role), d = xData(role), ph = xPhotosOf(await (XPHP || xPrep()), d); if (!xHas({ ...j, data: d, photos: ph && ph.photos })) throw new Error(`this browser has no keys of ${XROLE[role].who} yet: nothing to back up`);
    saveFile(`streetcat-${role === 'clinic' ? 'partner' : 'rescue'}-backup-${today()}.json`, JSON.stringify(await sealExport(xText(j, d, ph), pw, role))); $('x-pw').value = $('x-pw2').value = '';
    show(out, 'Sealed backup saved. Keep the file and the password in two different places: without the password nobody can read it, not even you.', 'ok'); buzz(); } catch (e) { show(out, failText(e), 'bad'); } busy(b, false); };
$('x-seal-open').onclick = async () => { const out = $('x-seal-out'); try { const pw = $('x-pw').value; if (!pw) throw new Error('write the backup\'s password first, then choose the file');
    let j = null; try { j = JSON.parse(await pickFile($('x-seal-file'))); } catch (_) {} const text = await openExport(j, pw);
    $('x-pw').value = $('x-pw2').value = ''; show(out, ''); $('x-box').value = text; $('x-imp').click(); } catch (e) { show(out, failText(e), 'bad'); } };  /* imported as an export pasted in the box: one way in */

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
  if (typeof CATID !== 'undefined') { const ai = await CATID.here();  /* offline setup: the cat recognition, got ahead of time on wifi */
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
const campKey = c => [lc(c.streetcat), ...C.payeesOf(c)].join() + '|' + Number(c.deadline) + (c.lock === 'dest' ? '|dest' : '');  /* as lockId reads it from a lock: with a list of partners, every key */
const scEntries = c => { const L = LEDGER && LEDGER[campKey(c)]; return L && L.entries ? lclone(L.entries) : {}; };
const saveEntries = (c, entries) => { const L = (LEDGER && LEDGER[campKey(c)]) || { entries: {} }, changed = {};  /* only what changed; none is ever taken away here */
  for (const [ref, e] of Object.entries(entries)) if (JSON.stringify(L.entries[ref]) !== JSON.stringify(e)) changed[ref] = e;
  return Object.keys(changed).length ? ledgerWrite(campKey(c), changed) : Promise.resolve(true); };
const fullProof = p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C, ...(p.dleq ? { dleq: p.dleq } : {}) });
// every proof of a donation as the mint sees it now: its own, and whatever was put back under its lock after a part was released
async function donationProofs(w, e){ const all = [e.token, ...(e.remainders || [])].flatMap(t => { try { return w.decodeToken(t).proofs; } catch (_) { return []; } }); if (!all.length) return [];
  const st = await w.checkProofsStates(all), byY = new Map(st.map(s => [lc(s.Y), s.state])); return all.map(p => ({ p, state: byY.get(yHex(p)) || 'UNKNOWN' })); }
const reservedYs = () => new Set(sreqs().filter(r => !['released', 'reported', 'cancelled'].includes(r.state)).flatMap(r => r.q.contributions.flatMap(k => k.proofs.map(p => C.yOf(p.secret)))));
// the mint's keys not at hand (no answer from it): that is said, not taken for a bad signature, and the inbox asks again (scCheck)
async function dleqOk(w, proofs){ let ks; try { ks = await w.keyChain.ensureKeysetKeys(proofs[0].id); } catch (e) { throw new Error('the mint\'s keys cannot be fetched to check its signature (' + ((e && e.message) || e) + ')'); }
  try { return proofs.every(x => x.dleq && cashu.hasValidDleq(x, ks)); } catch (_) { return false; } }
// a donation that reaches Streetcat (from the donor's app, a volunteer, or by hand): checked, then kept in the campaign's ledger.
// A token this wallet cannot read (keys of the mint it does not have yet, a mint that has changed its keys) is read again, once,
// with the mint's keys fetched afresh
// WHOSE CAMPAIGN, AND WHICH MINT (audit of 10 Nov). The campaign used to be the message's own word, its mint too: anyone who knew
// Streetcat's public key and a campaign's partner and deadline could send "ecash" of any other mint (its own, say), and it was
// filed under the real campaign (the ledger files by the lock's keys and deadline) and counted on Home as money to spend. A token
// that named the campaign's mint and held another's proofs then stopped the public status page for the whole campaign. Now a
// donation counts only for a campaign this phone made, read from this phone's own copy of it, and only if its ecash is that
// campaign's mint's. Under the lock that says where the money may go, its proofs are one lock too (one refund key): a payment
// spends one lock at a time, and a token with two made requests that failed only at the partner's button.
const DUST_AFTER = 200, DUST_MIN = 1000, MOST_PROOFS = 32;  /* any donation may come in 32 proofs; a larger one, in as many as the donor's app makes and 8 more */
async function takeDonation(p, via){ await LEDGER_READY; let said; try { said = C.campaignOf(p.campaign); } catch (e) { throw Object.assign(new Error(`its campaign cannot be read (${String((e && e.message) || e).slice(0, 80)}): it is not counted`), { byPage: true }); }  /* wrong in itself: said once, not asked for again at every check */
  const same = camps().map(x => x && x.c).filter(x => { try { return !!x && campKey(C.campaignOf(x)) === campKey(said); } catch (_) { return false; } }), own = same.find(x => norm(x.mint) === norm(said.mint));
  if (!own) throw Object.assign(new Error(same.length ? `it names a mint (${String(said.mint).slice(0, 80)}) that is not ${C.campaignOf(same[0]).name}'s: it is not counted` : `it is for a campaign this phone did not make (${String(said.name).slice(0, 40)}): it is not counted`), { byPage: true });
  const c = C.campaignOf(own); let w = await wallet(c.mint), dec;
  try { dec = w.decodeToken(p.token); } catch (_) { delete WALLETS[String(c.mint).replace(/\/$/, '')]; w = await wallet(c.mint); try { dec = w.decodeToken(p.token); } catch (e) { if (w._vlOffline) throw e;  /* the mint does not answer now: asked again, not judged */ throw Object.assign(new Error(`its ecash is not of ${c.name}'s mint: it is not counted`), { byPage: true }); } }
  if (norm(dec.mint) !== norm(c.mint)) throw Object.assign(new Error(`its ecash says another mint (${String(dec.mint).slice(0, 80)}) than ${c.name}'s: it is not counted`), { byPage: true });
  const ys = dec.proofs.map(yHex); if (new Set(ys).size !== ys.length) throw Object.assign(new Error('it holds the same proof twice: it is not counted'), { byPage: true });
  const ref = await C.donRef(ys), given = sum(dec.proofs), had = !!scEntries(c)[ref];
  /* In no more proofs than its amount needs (12 Nov): the donor's app cuts a donation in a dozen or two (core.js donationSplit, forty-odd
     for millions of sat), and every proof is kept on this phone; one cut in hundreds of 1-sat proofs costs its sender nothing more (it all
     comes back at the deadline) and a few of them would fill the phone's storage. Without the mint's keys now, dleqOk below says so. */
  { let ks = null; try { ks = await w.keyChain.ensureKeysetKeys(dec.proofs[0].id); } catch (_) {}
    const most = Math.max(MOST_PROOFS, (C.donationSplit(given, ks ? Object.keys(ks.keys).map(Number) : null) || []).length + 8);
    if (ks && !had && dec.proofs.length > most) throw Object.assign(new Error(`it is cut in ${dec.proofs.length} proofs, more than the ${most} that ${fmtSat(given)} need: it is not counted`), { byPage: true }); }
  const info = lockInfo(dec.proofs);
  const bad = [...new Set(dec.proofs.map(x => C.lockProblem(C.lockOf(x.secret), c)).filter(Boolean))]; if (bad.length) throw Object.assign(new Error(`not a donation of ${c.name}: ${bad.join('; ')}`), { byPage: true });
  if (c.lock === 'dest' && new Set(dec.proofs.map(x => C.lockShape(x.secret))).size !== 1) throw Object.assign(new Error(`not a donation of ${c.name}: its proofs are under more than one lock (more than one refund key), and a payment spends one lock at a time`), { byPage: true });
  if (!(await dleqOk(w, dec.proofs))) throw Object.assign(new Error('the mint\'s signature on it cannot be checked (no valid DLEQ proof): it is not counted'), { byPage: true });
  /* A campaign that already holds many donations takes no more very small ones: each is kept whole on this phone, and they cost
     their sender nothing (they come back at the deadline), so a flood of them would fill its storage (independent review, 11 Nov). */
  /* One it already holds is not refused: a second copy of it, or a volunteer bringing it in person, is taken as before (review of 12 Nov) */
  { const held = Object.keys(scEntries(c)).length; if (!had && held >= DUST_AFTER && given < DUST_MIN) throw Object.assign(new Error(`${fmtSat(given)}: ${c.name} already holds ${held} donations and takes none under ${fmtSat(DUST_MIN)} now: it is not counted`), { byPage: true }); }
  await ledgerKeep(dec, info); const entries = scEntries(c);
  /* the first way it came, except that a handover in person, with its volunteer's receipt, is said even after the donor's app sent it by relay */
  if (entries[ref] && via && (!entries[ref].via || (via === 'in person' && entries[ref].via !== 'in person'))) { entries[ref].via = via; if (p.receipt) entries[ref].handover = p.receipt; await saveEntries(c, entries); }
  return { ref, amount: sum(dec.proofs) }; }
async function takeAnswer(a, via){ const r = sreqs().find(x => x.id === a.id); if (!r) throw Object.assign(new Error('an answer to a request this browser did not make'), { byPage: true });
  const v = await C.checkAnswer(r.q, a); if (r.check && r.check.ok && !v.ok) return r;  /* a good answer is never replaced by a bad one */
  if (r.check && r.check.ok && r.check.received === 'ok' && v.received !== 'ok') return r;  /* nor one whose "Received by" checks out by a copy with it stripped or changed (review of 12 Nov) */
  /* Two good answers (a confirmation and a report): the one the partner signed last stands, in whatever order the relays bring them,
     and once released, the confirmation it was released on stays (Daybreak, 14 Nov: a report that came after it took its place, and
     the ledger lost the clinic's certificate: the status page then showed the release in red, as declared by nobody) */
  if (r.check && r.check.ok && v.ok && r.answer) { if (r.state === 'released' && r.answer.kind === 'certified' && a.kind !== 'certified') return r;
    if (String((a.statement || {}).signed || '') < String((r.answer.statement || {}).signed || '')) return r; }
  const was = r.state; r.answer = a; r.check = { ok: v.ok, text: v.text, kind: a.kind, ...(v.received !== 'none' ? { received: v.received, receivedBy: v.receivedBy } : {}) }; r.answeredAt = r.answeredAt || nowIso(); r.via = via; if (r.state !== 'released') r.state = !v.ok ? 'bad' : a.kind === 'report' ? 'reported' : 'certified'; saveSreq(r); if (r.state === 'certified') reannounce(r.q.campaign);
  if (r.state === 'certified' && was !== 'certified') buzz();  /* a new confirmation: something to release (Home lists it) */
  const sk = heldFor('streetcat', [r.q.campaign.streetcat]); if (sk && OUTBOX && v.ok) { try { await OUTBOX.add(R.receiptFor(a), sk, C.askedOf(r.q), { relays: relays(), label: 'received answer ' + r.id }); flush(); } catch (_) {} }
  return r; }
const SSEEN = 'vetlock.sc.seen', SPROBS = 'vetlock.sc.problems', REREAD = 'vetlock.sc.reread1';
// WHAT COULD NOT BE TAKEN: a message
// that fails for a reason that can pass (no answer from the mint, no room left on the phone) is asked for again at the next check, and
// said in red each time; one that is wrong in itself (not this campaign's lock, a mint signature that does not hold) is said in red
// for a week, here and wherever the check's line shows. Before, any failure was said once, for a minute, and the message was never
// read again: the donation was lost to the campaign, even sent again.
const pkeyOf = p => 'p:' + p.t + ':' + p.id + ':' + (p.kind || '');  // as relay.js marks a message read (receive)
const what = p => p.t === 'streetcat.donation' ? `a donation of ${tokAmount(p.token) ? fmtSat(tokAmount(p.token)) : '? sat'} to ${String((p.campaign && p.campaign.name) || 'a campaign').slice(0, 60)}` : p.t === 'streetcat.answer' ? 'an answer from the partner' : p.t === 'streetcat.cat' ? 'a cat record' : 'a message';
const sProblems = () => jget(SPROBS, []).filter(x => x && Date.now() - x.at < 7 * 86400e3);
const ledgerRefs = () => new Set(Object.values(LEDGER || {}).flatMap(L => Object.keys((L && L.entries) || {})));
async function scCheck(){ await LEDGER_READY; const sks = heldKeys('streetcat'); if (!R) return { text: 'relays are not available in this browser' }; if (!sks.length) return { text: 'no Streetcat key in this browser' };
  if (!online()) return { text: 'no connection: showing what this browser already has' };
  const mine = new Set(sks.map(pubOf)), seen = new Set(jget(SSEEN, [])), reqs = sreqs(), clinics = knownClinics(), orphans = new Set();
  const expect = p => { if (!p) return null; const r = reqs.find(x => x.id === p.id);
    if ((p.t === 'streetcat.answer' || p.t === 'streetcat.received') && r) return C.askedOf(r.q);  /* the partner the request asked */
    if (p.t === 'streetcat.donation' && p.campaign && mine.has(lc(p.campaign.streetcat)) && PUBKEY.test(String(p.from || ''))) return p.from;
    if ((p.t === 'streetcat.cat' || p.t === 'streetcat.cat-photo') && clinics.has(lc(p.from))) return p.from;
    if (p.t === 'streetcat.answer-photo' && r) return C.askedOf(r.q);  /* the confirmation's photos: from the request's partner only */  /* a cat's record and its photos: from the clinic of a campaign */
    if (p.t === 'streetcat.donation') orphans.add(String(p.id || ''));  /* sent to this app, for a campaign whose Streetcat key it does not hold */
    return null; };
  const got = { d: 0, a: 0, c: 0 }, errs = [], probs = sProblems(), had = ledgerRefs(), newRefs = new Set();  /* a donation is counted once, when it is new: the donor's message and a volunteer's for the same one are one donation */
  const take = async (m, again) => { const p = m.payload; try {
      if (p.t === 'streetcat.received') { const r = sreqs().find(x => x.id === p.id); if (r && !r.receivedAt) { r.receivedAt = p.at || nowIso(); saveSreq(r); } }
      else if (p.t === 'streetcat.answer') { await takeAnswer(p, 'relay'); got.a++; }
      else if (p.t === 'streetcat.donation') { const r0 = await takeDonation(p, p.via === 'in person' ? 'in person' : 'relay'); if (r0 && !had.has(r0.ref) && !newRefs.has(r0.ref)) { newRefs.add(r0.ref); got.d++; } }
      else if (p.t === 'streetcat.cat') { if (await takeCat(p, 'relay')) got.c++; }
      else if (p.t === 'streetcat.cat-photo') await takeCatPart(p);
      else if (p.t === 'streetcat.answer-photo') await takeAnsPart(p);
      if (again) { seen.add(m.wrap); if (p.id) seen.add(pkeyOf(p)); } taken.push(m.wrap); }
    catch (e) { const err = (e && e.message) || String(e);
      if (e && e.byPage) { if (!probs.some(x => x.wrap === m.wrap)) probs.push({ at: Date.now(), wrap: m.wrap, what: String(what(p)).slice(0, 160), err: String(err).slice(0, 300) });  /* cut short: a message's own text went in here whole, and three long ones filled the phone's storage (audit of 10 Nov) */ if (again) { seen.add(m.wrap); if (p.id) seen.add(pkeyOf(p)); } taken.push(m.wrap); }  /* not counted, and said: not to be asked for again */
      else { errs.push(`${what(p)} could not be taken yet: ${err}. It is asked for again at the next check.`); seen.delete(m.wrap); if (p.id) seen.delete(pkeyOf(p)); failed.push({ id: m.wrap, created: m.created }); } } };
  const rm = relayMarks('sc'), taken = [], failed = [], res = await R.receive(sks, { relays: relays(), seen, expect, timeout: 8000, marks: rm.marks, floor: rm.floor });
  for (const m of res.messages) await take(m, false);
  // once: the donations this app read before and lost (the two holes above) are read again, those its ledger does not hold
  if (!ls.get(REREAD) && res.relays.some(x => x.ok)) { const have = ledgerRefs();
    const back = await R.receive(sks, { relays: relays(), seen: new Set(), expect: p => p && p.t === 'streetcat.donation' && p.id && !have.has(p.id) ? expect(p) : null, timeout: 8000 });
    for (const m of back.messages) await take(m, true); if (back.relays.some(x => x.ok)) ls.set(REREAD, '1'); }
  relayMarksSave('sc', rm, res, taken, failed); jset(SSEEN, [...seen].slice(-600)); jset(SPROBS, probs.slice(-20)); await flush(); const ok = res.relays.filter(x => x.ok).length;
  const head = [got.d ? `${got.d} donation${got.d > 1 ? 's' : ''}` : '', got.a ? `${got.a} answer${got.a > 1 ? 's' : ''}` : '', got.c ? `${got.c} cat${got.c > 1 ? 's' : ''}` : '', `checked at ${new Date().toLocaleTimeString(EN, { hour: '2-digit', minute: '2-digit' })} · ${ok} of ${res.relays.length} relays answered`].filter(Boolean).join(' · ');
  const lines = [...errs, ...probs.slice(-5).map(x => `${x.what} was not counted: ${x.err}`), orphans.size ? `${orphans.size} donation${orphans.size > 1 ? 's' : ''} came for a campaign whose Streetcat key is not in this app: it cannot take ${orphans.size > 1 ? 'them' : 'it'}. Import the key (Keys, Import all) on this phone.` : ''].filter(Boolean);
  return { n: got.d + got.a + got.c, text: [head, ...lines.map(x => '✗ ' + x)].join('\n') }; }
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
// the cat as it was caught: up to three photos, face and
// sides, made small here as the clinic's are; kept on this phone, named in the request by SHA-256 and sent with it, so the clinic can
// check it is this cat
let SN_SHOTS = {};
/* no line under them; what goes wrong is said in red under the form */
const snShotsClear = () => { SN_SHOTS = {}; document.querySelectorAll('#sn-shots .shot').forEach(b => { b.querySelectorAll('img').forEach(i => i.remove()); b.classList.remove('has'); shotMark(b, false); b._sha = null; }); };
document.querySelectorAll('#sn-shots .shot').forEach(b => { b.onclick = async () => { const slot = b.dataset.slot, input = $('sn-file');
  const f = await new Promise(res => { input.value = ''; input.onchange = () => res(input.files && input.files[0]); input.click(); }); if (!f) return;
  b.classList.add('busy'); try { const p = await shrinkPhoto(f); SN_SHOTS[slot] = p; b.querySelectorAll('img').forEach(i => i.remove()); const img = el('img'); img.alt = SLOTNAME[slot]; img.src = URL.createObjectURL(new Blob([p.bytes], { type: 'image/jpeg' })); b.prepend(img); b.classList.add('has'); show($('sn-out'), '');
    b._sha = p.sha256; shotMark(b, false); catNear().then(ok => ok && shotsCat('#sn-shots', [{ slot, sha256: p.sha256, bytes: p.bytes }])).catch(() => {}); }  /* a cat in it? (13 Nov) only with the recognition on this phone */
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
  const { live: pot, funding } = await potLive(c, { saved: true }), entries = scEntries(c), contributions = [], full = [];  /* what the mint says now, or said last */
  for (const pk of f.picks) { const e = entries[pk.ref]; if (!e) throw new Error(pk.ref + ' is not in this browser');
    const live = pot.filter(x => x.ref === pk.ref).map(x => x.p), plan = C.planRelease(live, pk.release);
    if (plan.split && !(plan.split.dleq && plan.split.dleq.r)) throw Object.assign(new Error(`${pk.ref} can only pay whole proofs (its ecash carries no DLEQ proof): ask for ${sum(plan.whole)} or ${fmtSat(sum(plan.inputs))}`), { byPage: true });
    contributions.push({ ref: pk.ref, release: pk.release, proofs: plan.inputs }); full.push(...plan.inputs); }
  const t = C.timing({ day: f.date, confirmDays: confirmDaysOf(parOf(c, f.payee)), marginDays: marginDays(), proofs: full }), at = new Date(funding.at || Date.now()).toISOString();  /* checked again as it is sent */
  if (t.level === 'past' && !funding.checked) throw Object.assign(new Error('refunds are open and the mint does not answer: a request needs it to say what is still locked'), { byPage: true });
  const photos = C.REQ_SLOTS.filter(s => f.shots && f.shots[s]).map(s => ({ slot: s, sha256: f.shots[s].sha256, bytes: f.shots[s].bytes.length, w: f.shots[s].w, h: f.shots[s].h }));
  try { for (const p of photos) await IDB.put('photos', p.sha256, f.shots[p.slot].bytes); } catch (_) { throw Object.assign(new Error('this browser cannot keep the photos (a private window?): open the app in a normal window'), { byPage: true }); }  /* before the request names them */
  // a pot that pays from the lock: the request names the partner asked and says each donation's transaction (core.js), which needs the mint's keyset and fee
  let dest = null; if (c.lock === 'dest') { try { const w = await wallet(c.mint), ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id); dest = { keysetId: ks.id, denoms: Object.keys(ks.keys).map(Number), fee: ps => amt(w.getFeesForProofs(ps)) }; }
    catch (e) { throw Object.assign(new Error('the mint does not answer: a request of this pot says where every sat goes, and needs the mint\'s keys'), { byPage: true }); } }
  let q = await C.makeRequest({ campaign: c, patient: f.patient, procedure: f.procedure, date: f.date, note: f.note, contributions, photos, ...(dest ? { payee: f.payee || c.clinic, dest } : {}) });
  if (!funding.checked) q.funding = { checked: false, at };  /* to the partner, outside what it signs: an older app ignores it */
  q = await C.signRequest(q, sk);  /* signed whole, last: by link, file or QR it has no relay's seal to say who made it */
  const r = { id: q.id, q, slug: f.slug, ...(f.colony ? { colony: f.colony } : {}), ...(f.from ? { from: f.from } : {}), full: cashu.getEncodedToken({ mint: c.mint, proofs: full.map(fullProof) }), state: 'made', created: q.created,
    timing: { level: t.level, required: t.required, earliest: t.earliest, checkedAt: at, mintChecked: !!funding.checked } }; saveSreq(r);
  if (OUTBOX) { const it = await OUTBOX.add(q, sk, C.askedOf(q), { relays: relays(), label: 'request ' + q.id }); r.outbox = it.id; r.state = 'sent'; saveSreq(r);
    flush().then(() => reqParts()).then(() => { if ($('sreq').classList.contains('on') && CUR_SREQ === r.id) renderSreq(); }).catch(() => {}); }  /* its photos follow the request */
  return r; }
// ===== WHAT STREETCAT PAYS FOR: KINDS, COLONIES, PARTNERS AND POTS =====
// Requests are of many kinds: food, a veterinary operation, a sterilisation…; a pot may be made for one colony's food, another for one
// clinic; food is confirmed by the shop that sells it. Four kinds, each in its colour. A pot (a campaign)
// pays for one kind, for one colony or every colony, and its partner confirms the spending: a clinic, a shop, or another (core.js signs
// the three with the campaign). A request is paid from a pot of its kind: its donors gave for that, and its money is locked to Streetcat
// and that partner, so the partner is the pot's, as shown in the videos.
const KINDS = [
  { id: 'sterilisation', name: 'Sterilisation', one: 'sterilisation', h: 200, by: 'a clinic', vet: true, what: 'sterilisation (spay)' },
  { id: 'vet', name: 'Vet care', one: 'vet care', h: 330, by: 'a clinic', vet: true, what: 'wound and stitches' },
  { id: 'food', name: 'Food', one: 'food', h: 85, by: 'the shop that sells the feed', vet: false, what: '20 kg dry feed' },
  { id: 'other', name: 'Other', one: 'other', h: 285, by: 'a partner', vet: false, what: 'what it is' }];
const KIND = id => KINDS.find(t => t.id === id) || KINDS[0];
// a campaign made before the kinds pays for what its operation says (they were all sterilisations)
const typeOf = c => C.TYPES.includes(c && c.type) ? c.type : /feed|food|pienso|comida/i.test((c && c.op) || '') ? 'food' : /vet|wound|stitch|cure|treat|herida/i.test((c && c.op) || '') ? 'vet' : 'sterilisation';
// what each kind of partner confirms, unless Streetcat said otherwise when it added it
const PKIND = { clinic: ['sterilisation', 'vet', 'other'], shop: ['food', 'other'], other: ['other'] };
const doesKind = (p, type) => (Array.isArray(p.does) && p.does.length ? p.does : PKIND[p.kind] || []).includes(type);
const SPART = 'vetlock.sc.partners', SCOL = 'vetlock.sc.colonies';
// the partners: the ones added here ({ name, kind, pk, does }), then each pot's own (a pot made before names none: its clinic, by its key)
function partners(){ const out = [], seen = new Set(), add = x => { const pk = lc(x.pk); if (!PUBKEY.test(pk) || seen.has(pk)) return; seen.add(pk); out.push({ ...x, pk }); };
  for (const x of jget(SPART, [])) if (x && String(x.name || '').trim()) add({ name: String(x.name).trim(), kind: C.PKINDS.includes(x.kind) ? x.kind : 'clinic', pk: x.pk, does: Array.isArray(x.does) ? x.does.filter(d => C.TYPES.includes(d)) : null, named: true, ...(x.confirmDays != null ? { confirmDays: x.confirmDays } : {}) });
  for (const k of camps()) { const c = k && k.c; if (!c || !c.clinic) continue; const kind = C.PKINDS.includes(c.pkind) ? c.pkind : 'clinic';
    add({ name: c.partner || `${kind} ${abbr(lc(c.clinic))}`, kind, pk: c.clinic, does: [...new Set([...PKIND[kind], typeOf(c)])], named: !!c.partner }); }
  return out; }
const partnerOf = pk => partners().find(x => x.pk === lc(pk)) || null;
const whoOf = c => { const k = C.PKINDS.includes(c && c.pkind) ? c.pkind : 'clinic'; return k === 'clinic' ? 'the clinic' : (c.partner || (partnerOf(c.clinic) || {}).name || `the ${k}`); };
const potPartner = c => partnerOf(c.clinic) || { name: c.partner || 'its clinic', kind: c.pkind || 'clinic', pk: lc(c.clinic), named: !!c.partner };
// in a pot with a list of partners (one that pays from the lock), the one a request asks: the pot's first until another is chosen
const parOf = (c, pk) => !pk || lc(pk) === lc(c.clinic) ? potPartner(c) : (partnerOf(pk) || { name: 'partner ' + abbr(lc(pk)), kind: 'other', pk: lc(pk), named: false });
const whoAsked = q => { const pk = C.askedOf(q), c = q.campaign; return C.payeesOf(c).length < 2 ? whoOf(c) : ((partnerOf(pk) || {}).name || 'the partner'); };  /* with a list, by its name: "the clinic" would not say which */
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
// DEADLINES (plan step 1): a request's donations must stay locked until its work is done,
// confirmed and released: the end of its day in Madrid, plus the partner's days to confirm (by its kind, or as its record says), plus a
// margin (C.timing). Under the pot, apart: the dates, the funding (what the mint says now, or said last), and what other open requests
// hold. With no answer from the mint, a request is made from what it said last, and says so (to the partner too); never once refunds are
// open.
const potHeld = c => sreqs().filter(r => campKey(r.q.campaign) === campKey(c) && !['released', 'reported', 'cancelled'].includes(r.state)).reduce((s, r) => s + C.requestAmount(r.q), 0);
// a pot's donations still locked and in no other open request, from one question to the mint for all of them (NUT-07); what it said is
// kept with its time, so that with no answer (`saved`) they are read from what it said last
async function potLive(c, { saved = false } = {}){ await LEDGER_READY; const w = await wallet(c.mint), reserved = reservedYs(), all = [];
  for (const [ref, e] of Object.entries(scEntries(c))) for (const p of [e.token, ...(e.remainders || [])].flatMap(t => { try { return w.decodeToken(t).proofs; } catch (_) { return []; } })) all.push({ ref, e, p, y: yHex(p) });
  let un, funding; const key = campKey(c);
  try { if (w._vlOffline) throw new Error('the mint does not answer'); const st = all.length ? await w.checkProofsStates(all.map(x => x.p)) : [];
    un = new Set(st.filter(x => x.state === 'UNSPENT').map(x => lc(x.Y))); funding = { checked: true, at: Date.now() };
    const m = jget(FUNDS, {}); m[key] = { at: funding.at, live: all.filter(x => un.has(x.y)).map(x => x.y) }; jset(FUNDS, m); }
  catch (err) { const m = saved ? jget(FUNDS, {})[key] : null; if (!m || !Array.isArray(m.live)) throw err; un = new Set(m.live); funding = { checked: false, at: Number(m.at) || 0 }; }
  return { w, funding, live: all.filter(x => un.has(x.y) && !reserved.has(x.y)) }; }
// the four kinds as chips, two by two, each in its colour; the one chosen, filled
function kindChips(box, on, choose){ box.textContent = ''; for (const t of KINDS) { const b = el('button', 'sm' + (t.id === on ? ' on' : ''), t.one); b.type = 'button'; b.style.setProperty('--h', String(t.h)); b.onclick = () => choose(t.id); box.appendChild(b); } }
// "Choose …": the words, or what was chosen, in its colour
const setChoose = (b, label, value, h) => { b.textContent = value || label; b.classList.toggle('set', !!value); if (value && h != null) b.style.setProperty('--h', String(h)); else b.style.removeProperty('--h'); };
// a line of a list (pots, requests, colonies, partners): its title in its colour, then its lines: "· " a state, "✓ " what is chosen,
// "✗ " what is wrong (red); with no tap, in grey
function listLine(box, h, title, subs, onclick, cls = ''){ const b = el('button', 'req' + cls); b.type = 'button'; if (h != null) b.style.setProperty('--h', String(h)); b.appendChild(el('div', 'title', title));
  for (const t of [].concat(subs).filter(Boolean)) b.appendChild(el('div', t.startsWith('· ') ? 'cat' : t.startsWith('✓ ') ? 'ok' : t.startsWith('✗ ') ? 'no2' : 'sub2', t)); if (onclick) b.onclick = onclick; box.appendChild(b); return b; }

// HOME's four kinds: each with its pots, its requests and what is left to spend; a tap opens its screen
// what Home's list depends on: the pots, the requests and how far each is, the donations
let HOME_SIG = '';
const homeSig = () => JSON.stringify([camps().length, sreqs().map(r => r.id + ':' + r.state + ':' + (r.receivedAt ? 1 : 0)), Object.values(LEDGER || {}).reduce((s, L) => s + Object.keys((L && L.entries) || {}).length, 0)]);
function homeKinds(){ const box = $('h-kinds'); box.textContent = ''; try { HOME_SIG = homeSig(); } catch (_) {}
  // what is confirmed and waits for Streetcat, first: each request, its code and who confirmed it;
  // a tap opens it, to release it
  const ready = sreqs().filter(r => r.state === 'certified' && r.check && r.check.ok).sort((a, b) => String(a.answeredAt || '').localeCompare(String(b.answeredAt || '')));
  if (ready.length) { box.appendChild(el('div', 'mut', `To release · ${ready.length}`));
    for (const r of ready) { const q = r.q, k = camps().find(x => x && x.c && campKey(x.c) === campKey(q.campaign)), vet = !!((q.photos || []).length || KIND(typeOf(q.campaign)).vet);
      const lt = Math.min(...q.contributions.flatMap(x => (x.proofs || []).map(p => (C.lockOf(p.secret) || {}).locktime || Infinity))), now = Date.now() / 1000;  /* its refunds open soon, or are open (plan step 1) */
      const due = lt <= now ? '✗ Refunds are open: release now' : lt - now < Math.max(1, marginDays()) * 86400 ? `✗ Release soon: refunds open ${dm(lt)}` : '';
      listLine(box, k ? campHue(k.c) : null, vet ? `${q.patient} · ${q.procedure}` : q.procedure, [`${fmtSat(C.requestAmount(q))} from ${q.campaign.name} · ${q.id}`, `✓ confirmed by ${whoAsked(q)} · ${when(r.answeredAt)}`, due], () => { CUR_SREQ = r.id; openTab('sreq'); }, ' torel'); } }
  const grid = el('div', 'ptiles'); box.appendChild(grid);  /* no line over the kinds */
  const all = camps().filter(k => k && k.c), reqs = sreqs(), now = Date.now() / 1000;
  for (const t of KINDS) { const ps = all.filter(k => typeOf(k.c) === t.id), rs = reqs.filter(r => typeOf(r.q.campaign) === t.id), sat = ps.filter(k => Number(k.c.deadline) > now).reduce((s, k) => s + potFree(k.c), 0), b = el('button', 'tile'); b.type = 'button'; b.style.setProperty('--h', String(t.h));
    b.appendChild(el('div', 'title', t.name)); b.appendChild(el('div', 'sub2', ps.length ? `${ps.length} pot${ps.length > 1 ? 's' : ''} · ${rs.length} request${rs.length === 1 ? '' : 's'}` : 'no pots yet')); b.appendChild(el('div', 'sub2', ps.length ? `${fmtSat(sat)} to spend` : 'tap to start one'));
    b.onclick = () => { CUR_KIND = t.id; openTab('skind'); }; grid.appendChild(b); } }
// ONE KIND: its pots, its requests, and a new request or campaign of that kind
let CUR_KIND = 'sterilisation';
function renderKind(){ const t = KIND(CUR_KIND), head = $('kd-head'); head.textContent = ''; head.style.setProperty('--h', String(t.h)); head.appendChild(el('div', 'title', t.name)); head.appendChild(el('div', 'mut', `confirmed by ${t.by}`));
  const pb = $('kd-pots'); pb.textContent = ''; const ps = camps().filter(k => k && k.c && typeOf(k.c) === t.id).reverse(); for (const k of ps) potRow(pb, k); if (!ps.length) pb.appendChild(el('div', 'empty', `No ${t.one} pots yet.`));
  const rb = $('kd-reqs'); rb.textContent = ''; const rs = sreqs().filter(r => typeOf(r.q.campaign) === t.id).sort((a, b) => String(b.created).localeCompare(String(a.created))), ds = draftRows(rb, t);
  for (const r of rs) { const q = r.q, k = camps().find(x => x && x.c && campKey(x.c) === campKey(q.campaign)), [st, cls] = sreqState(r), vet = !!(q.photos || t.vet);
    listLine(rb, k ? campHue(k.c) : null, vet ? `${q.patient} · ${q.procedure}` : q.procedure, [[vet ? r.colony : q.patient, `${fmtSat(C.requestAmount(q))} from ${q.campaign.name}`].filter(Boolean).join(' · '), (cls === 'bad' ? '✗ ' : '· ') + st], () => { CUR_SREQ = r.id; openTab('sreq'); }); }
  if (!rs.length && !ds) rb.appendChild(el('div', 'empty', 'No requests yet.'));
  $('kd-req').textContent = `New ${t.one} request`; $('kd-camp').textContent = `New ${t.one} campaign`; }
// REPEAT AND DRAFTS (plan step 2). Repeat request: a new request from an old one, in any state,
// to check line by line: its kind, colony, its pot if still open and it fits (if not, another), and what it is; never its cat, photos,
// cost, date, note, donations, signatures or states, and the deadlines are checked again. It is made as any other, with a new id; the old
// one is not touched. Keep as draft: the form's fields only (vetlock.sc.drafts: never proofs, signatures or photos), listed on its kind's
// screen; a draft reserves nothing.
const DRAFTS = 'vetlock.sc.drafts', drafts = () => jget(DRAFTS, []).filter(d => d && d.id);
const dayLabel = d => C.dayOk(d) ? dm(C.madridStart(d) + 43200) : '';
function snLoad(o, back){ const t = KIND(KINDS.some(x => x.id === o.type) ? o.type : 'sterilisation'), k = o.slug ? camps().find(x => x && x.slug === o.slug) : null;
  SN = { type: t.id, col: o.col || '', pot: '', back, ...(o.payee ? { payee: o.payee } : {}), ...(o.from ? { from: o.from } : {}), ...(o.draft ? { draft: o.draft } : {}), ...(o.last ? { last: o.last } : {}) }; BACK.snew = back;
  for (const id of ['sn-cat', 'sn-proc', 'sn-cost', 'sn-note', 'sn-date']) $(id).value = ''; snShotsClear(); show($('sn-out'), '');
  $('sn-proc').value = o.what || ''; if (o.cost) $('sn-cost').value = String(o.cost); if (o.date) $('sn-date').value = o.date; if (o.note) $('sn-note').value = o.note;
  SN.was = k ? { name: k.c.name, why: potWhyNot(k, SN), deadline: Number(k.c.deadline) } : o.slug || o.potName ? { name: o.potName || 'Its pot', why: 'not in this browser' } : null;
  if (k && !SN.was.why) SN.pot = k.slug; else snAutoPot(); SN_OPEN = true; openTab('snew'); }
const snRepeat = (r, back) => { const q = r.q, k = camps().find(x => x && x.c && campKey(x.c) === campKey(q.campaign));
  snLoad({ type: typeOf(q.campaign), col: r.colony || '', slug: k ? k.slug : '', potName: q.campaign.name, what: q.procedure, from: r.id, payee: C.askedOf(q), last: { cost: C.requestAmount(q), on: q.date } }, back); };
// above the form: the request it repeats (or the draft), what became of its pot, and, on a new one, the recent requests of this kind to
// repeat (the last three that differ in colony, partner or what)
function snFromDraw(){ const fr = $('sn-from'), rec = $('sn-recent'), last = $('sn-last'), t = KIND(SN.type), line = (cls, text) => fr.appendChild(el('div', cls, text)); fr.textContent = ''; rec.textContent = ''; last.textContent = '';
  if (SN.from) { const r0 = sreqs().find(x => x.id === SN.from), on = r0 && dayLabel(r0.q.date); line('mut', `A new request, from ${SN.from}${on ? ` (${on})` : ''}. Check every line before sending.`); }
  else if (SN.draft) { const d = drafts().find(x => x.id === SN.draft); line('mut', `A draft${d ? ', kept ' + atWhen(Date.parse(d.saved)) : ''}. Check every line before sending.`); }
  if (SN.was && SN.was.why && !snPot()) line('bad', SN.was.deadline && SN.was.deadline < Date.now() / 1000 ? `✗ ${SN.was.name} closed on ${dm(SN.was.deadline)}. Choose another pot.` : `✗ ${SN.was.name}: ${SN.was.why}. Choose another pot.`);
  if ((SN.from || SN.draft) && !snPot() && !camps().some(x => x && x.c && !potWhyNot(x, SN))) { const p = el('div', 'bad lnk'); p.append(`No open pot for ${t.one}${SN.col ? ' in ' + SN.col : ''} · `); const a = el('a', '', 'Make a campaign'); a.href = '#'; a.onclick = e => { e.preventDefault(); kFresh(SN.type, 'snew'); }; p.append(a); fr.appendChild(p); }
  if (SN.last && SN.last.cost) last.textContent = `Last time: ${fmtSat(SN.last.cost)}${dayLabel(SN.last.on) ? ' on ' + dayLabel(SN.last.on) : ''} · check the cost`;
  if (!SN.from && !SN.draft) { const seen = new Set(), recent = [];
    for (const r of sreqs().filter(r => typeOf(r.q.campaign) === SN.type).sort((a, b) => String(b.created).localeCompare(String(a.created)))) { const key = [r.colony || '', lc(r.q.campaign.clinic), r.q.procedure].join('|'); if (seen.has(key)) continue; seen.add(key); recent.push(r); if (recent.length === 3) break; }
    if (recent.length) { rec.appendChild(el('label', '', 'Repeat a recent one')); const box = el('div', 'row1'); for (const r of recent) box.appendChild(smallBtn([r.colony ? r.colony.toUpperCase() : r.q.campaign.name, r.q.procedure].join(' · '), () => snRepeat(r, SN.back))); rec.appendChild(box); } }
  $('sn-del-w').hidden = !SN.draft; }
// a draft on its kind's screen: "Draft · 12 sacks", and under it its colony, when it was kept and its cost (the kind is the screen's); a tap
// opens it in the form
function draftRows(box, t){ const ds = drafts().filter(d => d.kind === t.id).sort((a, b) => String(b.saved).localeCompare(String(a.saved)));
  for (const d of ds) { const k = camps().find(x => x && x.slug === d.slug); listLine(box, k ? campHue(k.c) : null, `Draft · ${d.what || '—'}`, [[d.colony ? d.colony.toUpperCase() : '', `kept ${atWhen(Date.parse(d.saved))}`, d.cost ? fmtSat(d.cost) : ''].filter(Boolean).join(' · ')],
    () => snLoad({ type: d.kind, col: d.colony, slug: d.slug, what: d.what, cost: d.cost, date: d.date, note: d.note, from: d.from, draft: d.id }, 'skind')); }
  return ds.length; }
$('sn-draft').onclick = e => { e.preventDefault(); const k = snPot(), t = KIND(SN.type), what = $('sn-proc').value.trim(), cost = snCost(), id = SN.draft || 'D-' + hex(crypto.getRandomValues(new Uint8Array(5))).toUpperCase();
  if (!what && !cost) return show($('sn-out'), `✗ Nothing to keep yet: write ${t.vet ? 'the procedure' : 'what it is'}.`, 'bad');
  const d = { id, ...(SN.from ? { from: SN.from } : {}), kind: t.id, colony: SN.col || '', slug: k ? k.slug : '', what, ...(cost ? { cost } : {}), ...($('sn-date').value ? { date: $('sn-date').value } : {}), ...($('sn-note').value.trim() ? { note: $('sn-note').value.trim() } : {}), saved: nowIso() };
  jset(DRAFTS, [...drafts().filter(x => x.id !== id), d]); SN.draft = id; CUR_KIND = t.id; openTab('skind'); };
$('sn-del').onclick = e => { e.preventDefault(); if (!SN.draft) return; jset(DRAFTS, drafts().filter(x => x.id !== SN.draft)); const t = SN.type; delete SN.draft; CUR_KIND = t; openTab('skind'); };
$('sq-rep').onclick = e => { e.preventDefault(); const r = sreqs().find(x => x.id === CUR_SREQ); if (r) snRepeat(r, 'sreq'); };
$('kd-req').onclick = () => snFresh(CUR_KIND, 'skind'); $('kd-camp').onclick = () => kFresh(CUR_KIND, 'skind');

// NEW REQUEST: its kind, two by two;
// for a clinic (sterilisation, vet care) the cat, its photos and the procedure, for food or another kind what it is; its cost; the
// colony it is for and the pot that pays it, each from its own list. Only a pot of its kind, for that colony or every colony, can pay it;
// the pot brings its partner (only that partner can release its money), so the partner is not chosen: it shows, with its key. A colony
// with one pot that can pay brings that pot; a pot chosen first brings its colony. The cost takes the pot's donations, the oldest first
// and the last one in part; "edit" shows them, with the date and a note, to change by hand.
let SN = { type: 'sterilisation', col: '', pot: '', back: 'home' }, SN_ROWS = { slug: null, rows: null }, SN_OPEN = false;
const snPot = () => (SN.pot && camps().find(x => x && x.slug === SN.pot)) || null;
const snCost = () => Math.max(0, Math.floor(Number(String($('sn-cost').value || '').replace(/\D/g, '')) || 0));
const snPicked = () => Object.values(SN_PICK).reduce((s, x) => s + x, 0);
function snAutoPot(){ const k = snPot(); if (k && potWhyNot(k, SN)) SN.pot = ''; const ok = camps().filter(x => x && x.c && !potWhyNot(x, SN)); if (!SN.pot && ok.length === 1) SN.pot = ok[0].slug; }  /* the colony stays as chosen: none until it is (13 Nov) */
function snFresh(type, back, pot = ''){ const k = pot ? camps().find(x => x && x.slug === pot) : null; SN = { type: k ? typeOf(k.c) : KINDS.some(t => t.id === type) ? type : 'sterilisation', col: '', pot: k ? k.slug : '', back }; BACK.snew = back;
  for (const id of ['sn-cat', 'sn-proc', 'sn-cost', 'sn-note', 'sn-date']) $(id).value = ''; snShotsClear(); show($('sn-out'), ''); if (!k) snAutoPot(); SN_OPEN = ls.get('vetlock.kform') === 'open'; openTab('snew'); }
async function renderSnew(){ snDraw(); await snDons(); }
function snDraw(){ const t = KIND(SN.type), k = snPot(), c = k && k.c, pays = c ? C.payeesOf(c) : []; if (!pays.includes(SN.payee)) SN.payee = pays.length === 1 ? pays[0] : ''; const par = c ? parOf(c, SN.payee) : null, noPar = pays.length > 1 && !SN.payee;
  /* a pot with a list of partners (it pays from the lock): the one this request asks, none until one is tapped (13 Nov) */
  const pb = $('sn-pars'); pb.hidden = $('sn-pars-l').hidden = pays.length < 2; pb.textContent = '';
  if (pays.length > 1) for (const pk of pays) { const x = parOf(c, pk), b = el('button', 'sm' + (pk === SN.payee ? ' on' : ''), x.named ? x.name : abbr(pk)); b.type = 'button'; b.style.setProperty('--h', String(campHue(c))); b.onclick = () => { SN.payee = pk; snDraw(); }; pb.appendChild(b); }
  kindChips($('sn-type'), SN.type, id => { if (id === SN.type) return; SN.type = id; snAutoPot(); snDraw(); if (SN_ROWS.slug !== SN.pot) snDons(); else snCover(); });
  $('sn-catbox').hidden = !t.vet; $('sn-proc-l').textContent = t.vet ? 'Procedure' : 'What'; $('sn-proc').placeholder = t.what; $('sn-date-l').textContent = t.vet ? 'Date of the procedure' : 'Date of the delivery';
  setChoose($('sn-col'), 'Choose colony', SN.col ? SN.col.toUpperCase() : '', SN.col ? colHue(SN.col) : null); setChoose($('sn-pot'), 'Choose pot', c ? `${c.name} · ${fmtSat(potFree(c))}` : '', c ? campHue(c) : null);
  const keys = $('sn-keys'); keys.hidden = !c; keyLines(keys, c ? [['Streetcat', 'streetcat', lc(c.streetcat)], noPar ? ['partner', 'clinic', '', 'choose the partner above'] : [par.named ? `${par.name} · ${par.kind}` : par.kind, 'clinic', lc(SN.payee || c.clinic)]] : []);
  if (!$('sn-date').value && !SN.from && !SN.draft) $('sn-date').value = today(); const note = $('sn-note').value.trim(); snFromDraw();  /* a repeat or a draft: its date is chosen again */
  $('sn-sum-t').textContent = [`on ${$('sn-date').value}`, note ? 'note: ' + note : 'no note', 'its donations'].join(' · '); $('sn-sum').hidden = SN_OPEN; $('sn-more').hidden = !SN_OPEN;
  const go = $('sn-go'); go.disabled = noPar || !snPicked() || snPicked() < snCost(); $('sn-margin').placeholder = String(C.MARGIN_DAYS); $('sn-margin').value = ls.get(MARGIN) != null ? String(marginDays()) : ''; snCover(); }
// the pot's donations as the mint sees them: what each still has locked, and not held by another request (the oldest first)
async function snDons(){ const k = snPot(), list = $('sn-dons'), run = snDons.n = (snDons.n || 0) + 1; list.textContent = ''; SN_PICK = {}; SN_ROWS = { slug: SN.pot, rows: null }; $('sn-go').disabled = true;
  if (!k) { list.appendChild(el('div', 'empty', 'Choose the pot that pays it.')); snCover(); return; } const c = k.c; list.appendChild(el('div', 'empty', 'asking the mint what is still locked…')); snCover();
  try { const { live, funding } = await potLive(c, { saved: true }), rows = [];  /* one question to the mint for the whole pot; with no answer, what it said last */
    for (const [ref, e] of Object.entries(scEntries(c)).sort((a, b) => String(a[1].date || '').localeCompare(String(b[1].date || '')))) { const proofs = live.filter(x => x.ref === ref).map(x => x.p), avail = sum(proofs); if (avail > 0) rows.push({ ref, e, avail, proofs }); }
    if (snDons.n !== run) return; SN_ROWS = { slug: SN.pot, rows, funding }; list.textContent = ''; if (!rows.length) list.appendChild(el('div', 'empty', 'Nothing left to pay from: every donation is released, taken back, or already in a request.'));
    for (const { ref, e, avail } of rows) { const it = el('div', 'item don'), l = el('div'); it.style.cursor = 'default'; l.appendChild(el('div', 'nm', ref)); l.appendChild(el('div', 'sub2', `${fmtSat(avail)} available · ${e.date || ''}`)); it.appendChild(l);
      const a = el('div', 'acts2'), inp = el('input'); inp.type = 'number'; inp.min = '0'; inp.max = String(avail); inp.step = '1'; inp.inputMode = 'numeric'; inp.placeholder = '0'; inp.id = 'sn-use-' + ref; inp.setAttribute('aria-label', 'sats from ' + ref);
      inp.oninput = () => { SN_PICK[ref] = Math.max(0, Math.min(avail, Math.floor(Number(inp.value) || 0))); snByHand(); }; a.appendChild(inp); a.appendChild(smallBtn('all', () => { inp.value = String(avail); inp.oninput(); })); it.appendChild(a); list.appendChild(it); }
    if (snCost()) snAuto(); else snByHand();
  } catch (e) { if (snDons.n !== run) return; SN_ROWS = { slug: SN.pot, rows: null, err: true }; list.textContent = ''; list.appendChild(el('div', 'empty', 'The mint cannot be reached (' + (e.message || e) + '). A request needs it, to know what is still locked.')); snCover(); } }
// the cost takes the donations, the oldest first, the last one in part; donations changed by hand make the cost
function snAuto(){ const rows = SN_ROWS.slug === SN.pot ? SN_ROWS.rows : null; if (!rows) return snCover(); let left = snCost(); SN_PICK = {};
  for (const r of rows) { const n = Math.min(r.avail, left); left -= n; SN_PICK[r.ref] = n; const inp = $('sn-use-' + r.ref); if (inp) inp.value = n ? String(n) : ''; }
  $('sn-go').disabled = snNoPar() || !snPicked() || snPicked() < snCost(); snCover(); }  /* a pot that does not hold it all cannot send it, nor one with no partner chosen */
function snNoPar(){ const k = snPot(); return !!k && C.payeesOf(k.c).length > 1 && !SN.payee; }  /* a pot with a list of partners, none tapped yet (13 Nov) */
const snByHand = () => { const n = snPicked(); if (n || !snCost()) $('sn-cost').value = n ? String(n) : ''; $('sn-go').disabled = !n || snNoPar(); snCover(); };
// under "Paid from": whether the pot pays it all (✓), or what it lacks (red)
function snCover(){ snCover0(); snTime(); }  /* the coverage, then the dates and the funding */
function snCover0(){ const box = $('sn-cover'), k = snPot(), cost = snCost(), rows = SN_ROWS.slug === SN.pot ? SN_ROWS.rows : null; box.classList.remove('bad'); box.textContent = '';
  if (!k || SN_ROWS.err) return; if (!rows) { box.textContent = 'asking the mint what is still locked…'; return; } const c = k.c, avail = rows.reduce((s, r) => s + r.avail, 0), n = snPicked(), used = Object.values(SN_PICK).filter(x => x > 0).length, num = x => fmtSat(x).replace(/ sat$/, '');
  if (!cost) { box.textContent = `${fmtSat(avail)} to spend in ${c.name}`; return; }
  if (avail < cost) { box.classList.add('bad'); box.textContent = `✗ ${num(avail)} of ${fmtSat(cost)} in ${c.name}: choose another pot, or wait for donations`; return; }
  box.textContent = `${num(n)} of ${fmtSat(cost)}${n === cost ? ' ✓' : ''} · from ${c.name} · ${used} donation${used === 1 ? '' : 's'}`; }
// the dates, the funding and what other requests hold, under the pot; the level decides the send button, and past the work's day it
// offers to change the date or a pot of the same kind, colony and partner whose refunds open after the required date and that holds it
let SN_TIME = null;
function snTime(){ const box = $('sn-time'), alt = $('sn-alt'), k = snPot(), rows = SN_ROWS.slug === SN.pot ? SN_ROWS.rows : null; box.textContent = ''; alt.textContent = ''; alt.hidden = true; SN_TIME = null;
  if (!k || !rows || !rows.length) return snGo(); const c = k.c, picked = rows.filter(r => SN_PICK[r.ref] > 0), use = (picked.length ? picked : rows).flatMap(r => r.proofs.map(p => ({ ...p, ref: r.ref })));
  let t; try { t = C.timing({ day: $('sn-date').value || today(), confirmDays: confirmDaysOf(parOf(c, SN.payee)), marginDays: marginDays(), proofs: use }); } catch (_) { return snGo(); }
  const f = SN_ROWS.funding || {}, line = (cls, text) => box.appendChild(el('div', cls, text)), held = potHeld(c); SN_TIME = { ...t, funding: f };
  line('mut', `Required until ${dm(t.required)}: the work on ${dm(t.work)}, ${t.confirmDays} day${t.confirmDays === 1 ? '' : 's'} to confirm and a ${t.marginDays}-day margin (estimates)`);
  line(t.level === 'ok' ? 'ok' : 'bad', ({ ok: `✓ Refund window opens after the required date (${dm(t.earliest)})`, soon: `✗ Refund window opens ${dm(t.earliest)}, before the required date`,
    before: `✗ Refund window opens ${dm(t.earliest)}, before the work`, past: '✗ Refunds are open: donors can take these sats back now' })[t.level]);
  line(f.checked ? 'ok' : 'bad', f.checked ? `✓ Funding checked at the mint at ${atWhen(f.at)}` : `✗ Funding not checked · Last verified at ${atWhen(f.at)}`);
  if (held) line('mut', `${fmtSat(held)} of this pot ${held === 1 ? 'is' : 'are'} in other open requests (this phone only)`);
  if (t.level === 'before' || t.level === 'soon') { const need = snCost() || snPicked();
    const fit = camps().filter(x => x && x.c && x.slug !== k.slug && !potWhyNot(x, SN) && lc(x.c.clinic) === lc(c.clinic) && Number(x.c.deadline) > t.required && (!need || potFree(x.c) >= need));
    alt.appendChild(smallBtn('Change the date', () => { SN_OPEN = true; snDraw(); $('sn-date').focus(); }));
    for (const x of fit) alt.appendChild(smallBtn(`Pay from ${x.c.name} · refunds from ${dm(Number(x.c.deadline))}`, () => { SN.pot = x.slug; snDraw(); snDons(); }));
    alt.hidden = false; }
  snGo(); }
// the send button says what it does: before the work is done, "Send anyway" (held, as every send); with refunds open and no answer from
// the mint, it does not send
function snGo(){ const go = $('sn-go'), t = SN_TIME; if (go.classList.contains('holding') || go._hint || go.classList.contains('fin')) return; const k = snPot(), par = k && (SN.payee || C.payeesOf(k.c).length < 2) ? parOf(k.c, SN.payee) : null;  /* a list with none chosen yet: no name on it */
  go.textContent = t && t.level === 'before' ? 'Send anyway' : par ? `Send to ${par.named ? par.name : 'the ' + par.kind}` : 'Send to the partner';
  if (t && t.level === 'past' && !t.funding.checked) go.disabled = true; }

$('sn-cost').addEventListener('input', () => snAuto());
$('sn-date').addEventListener('change', () => snTime());
$('sn-margin').addEventListener('change', () => { const v = $('sn-margin').value.trim(), n = Number(v); if (v === '') { try { localStorage.removeItem(MARGIN); } catch (_) {} } else if (Number.isInteger(n) && n >= 0 && n <= 60) ls.set(MARGIN, String(n)); snTime(); });  /* Rescue's margin, for every request */
$('sn-edit').onclick = e => { e.preventDefault(); SN_OPEN = true; snDraw(); $('sn-date').focus(); };
$('sn-col').onclick = () => pick('colony', 'snew'); $('sn-pot').onclick = () => pick('pot', 'snew');
// held: the two keys shuffle in their colours and land as the button fills
$('sn-go').addEventListener('holdstart', () => $('sn-keys').querySelectorAll('.kk').forEach(v => { if (v._t) flapKeys(v, v._t, { speed: holdMs() / 1200, hex: true }); }));
$('sn-go').addEventListener('holdstop', () => snDraw());
$('sn-go').onclick = async () => { const btn = $('sn-go'); busy(btn, true); try { const k = snPot(); if (!k) throw new Error('choose the pot that pays it'); if (snNoPar()) throw new Error('choose the partner');
    const t = KIND(SN.type), picks = Object.entries(SN_PICK).filter(([, n]) => n > 0).map(([ref, release]) => ({ ref, release })), cost = snCost();
    const f = { patient: t.vet ? $('sn-cat').value.trim() : (SN.col || k.c.colony || k.c.name), procedure: $('sn-proc').value.trim(), date: $('sn-date').value, note: $('sn-note').value.trim(), picks, slug: k.slug, shots: t.vet ? SN_SHOTS : {}, colony: SN.col, payee: SN.payee };
    if (!f.patient) throw new Error('write the cat'); if (!f.procedure) throw new Error(t.vet ? 'write the procedure' : 'write what it is'); if (!f.date) throw new Error('write the date');
    if (!picks.length) throw new Error(cost ? 'this pot has nothing left to pay it: choose another pot' : 'write what it costs');
    if (cost && picks.reduce((s, p) => s + p.release, 0) < cost) throw new Error(`${k.c.name} has not enough for ${fmtSat(cost)}: choose another pot, or wait for donations`);
    show($('sn-out'), 'making the request…'); f.from = SN.from || ''; const r = await makeScRequest(k.c, f); if (SN.draft) { jset(DRAFTS, drafts().filter(d => d.id !== SN.draft)); delete SN.draft; } buzz(); reannounce(k.c);  /* donors see it under its pot */
    CUR_SREQ = r.id; for (const id of ['sn-cat', 'sn-proc', 'sn-cost', 'sn-note']) $(id).value = ''; snShotsClear(); show($('sn-out'), ''); openTab('sreq');
  } catch (e) { show($('sn-out'), failText(e), 'bad'); } busy(btn, false); };

// THE LISTS: colonies, partners and pots, each like the pots' list, with "+ New …"; a tap chooses, and back to the form
let PICK = { what: 'colony', from: 'snew' }, PP_NEW = false, PP = { kind: 'clinic', does: null };
function pick(what, from){ PICK = { what, from }; PP_NEW = false; BACK.spick = from; openTab('spick'); }
const pickState = () => PICK.from === 'snew' ? SN : K;
const pickDone = () => { PP_NEW = false; const prev = navStack[navStack.length - 2]; if (prev && prev.t === PICK.from && prev.r === nav.dataset.role) history.back(); else openTab(PICK.from); };  /* as the arrow: one step back */
function renderPick(){ const S = pickState(), t = KIND(S.type), head = $('pp-head'), box = $('pp-list'), w = PICK.what, req = PICK.from === 'snew'; head.textContent = ''; box.textContent = ''; show($('pp-out'), ''); BACK.spick = PICK.from;
  $('pp-new').hidden = !PP_NEW; box.hidden = PP_NEW; $('pp-acts').hidden = PP_NEW; $('pp-pbox').hidden = w !== 'partner'; $('pp-done').hidden = true;  /* "Done": only under a ticked list of partners */
  const top = (title, h, sub) => { head.style.setProperty('--h', String(h)); head.appendChild(el('div', 'title', title)); head.appendChild(el('div', 'mut', sub)); };
  if (w === 'colony') { if (PP_NEW) { top('New colony', 175, 'its name, as Streetcat calls it'); $('pp-name').placeholder = 'colony Playa'; return; }
    top('Choose a colony', 175, `what this ${req ? 'request' : 'campaign'} is for`);
    listLine(box, null, 'Every colony', ['not one colony in particular', S.col ? '' : '✓ chosen'], () => { S.col = ''; if (req) snAutoPot(); pickDone(); });
    for (const x of colonies()) { const n = catsIn(x.name), ps = camps().filter(k => k && k.c && typeOf(k.c) === S.type && lc(k.c.colony || '') === lc(x.name)).map(k => k.c.name);
      listLine(box, colHue(x.name), x.name, [[n ? `${n} cat${n > 1 ? 's' : ''}` : '', ps.length ? `${t.one} pots: ${ps.join(', ')}` : `no ${t.one} pots yet`].filter(Boolean).join(' · '), lc(S.col) === lc(x.name) ? '✓ chosen' : ''], () => { S.col = x.name; if (req) snAutoPot(); pickDone(); }); }
    $('pp-add').textContent = '+ New colony'; return; }
  if (w === 'partner') { if (PP_NEW) { top('New partner', HUE.clinic, 'who confirms what Streetcat pays: a clinic, the shop that sells the feed, or another'); $('pp-name').placeholder = 'Pienso Sur'; ppDraw(); return; }
    // Where the campaign's mint enforces where donations may go (K_DEST), the list is ticked: a tap puts a partner in the campaign or
    // takes it out, and "Done" goes back. At any other mint a tap chooses the one partner and goes back, as before.
    const many = !req && K_DEST === true, chosen = many ? kPartners() : [kPartnerKey()].filter(Boolean);
    top(many ? 'Choose partners' : 'Choose a partner', HUE.clinic, many ? `who can confirm it and be paid: ${t.by}` : `who confirms it: ${t.by}`); const ps = partners().sort((a, b) => doesKind(b, S.type) - doesKind(a, S.type));
    for (const x of ps) { const ok = doesKind(x, S.type), does = (x.does && x.does.length ? x.does : PKIND[x.kind]).map(d => KIND(d).one).join(', '), on = chosen.includes(x.pk);
      listLine(box, ok ? HUE.clinic : null, (many && ok ? (on ? '[x] ' : '[ ] ') : '') + x.name, [`${x.kind} · ${does}`, ok ? `key ${abbr(x.pk)}` : `does not do ${t.one}`, on ? '✓ chosen' : ''],
        !ok ? null : many ? () => { if (kTick(x.pk)) renderPick(); else show($('pp-out'), '✗ Eight partners at most.', 'bad'); } : () => { $('k-c').value = x.pk; K.also = []; pickDone(); }, ok ? '' : ' no'); }
    if (!ps.length) box.appendChild(el('div', 'empty', 'No partners yet: add the first one.'));
    $('pp-add').textContent = '+ New partner'; $('pp-done').hidden = !many; return; }
  // the pots: the ones that can pay it first, what each has to spend and whether it is enough; in grey the rest, and why
  const cost = req ? snCost() : 0, all = camps().filter(k => k && k.c).map(k => ({ k, why: potWhyNot(k, S) })).sort((a, b) => !!a.why - !!b.why);
  top('Choose a pot', t.h, `a ${t.one} pot${S.col ? ' of ' + S.col + ' or of every colony' : ''}; its partner confirms the spending. In grey, the ones that cannot pay it`);
  for (const { k, why } of all) { const c = k.c, free = potFree(c), left = Math.ceil((c.deadline - Date.now() / 1000) / 86400);
    listLine(box, why ? null : campHue(c), c.name, [`${KIND(typeOf(c)).one} · ${c.colony || 'every colony'} · ${potPartner(c).name}`, why || `${fmtSat(free)} to spend${cost && free >= cost ? ' ✓ enough' : ''} · ${left} day${left === 1 ? '' : 's'} left`,
      !why && cost && free < cost ? `✗ not enough for ${fmtSat(cost)}` : '', S.pot === k.slug ? '✓ chosen' : ''], why ? null : () => { S.pot = k.slug; if (!S.col && c.colony) S.col = c.colony; pickDone(); }, why ? ' no' : ''); }
  if (!all.length) box.appendChild(el('div', 'empty', 'No pots yet.'));
  $('pp-add').textContent = `+ New ${t.one} pot`; }
// a new partner: its name, what it is, what it confirms (its kind's, unless changed) and its public key
function ppDraw(){ const kb = $('pp-kind'); kb.textContent = ''; $('pp-days').placeholder = String(C.CONFIRM_DAYS[PP.kind] ?? 2); for (const x of C.PKINDS) { const b = el('button', 'sm' + (PP.kind === x ? ' on' : ''), x); b.type = 'button'; b.onclick = () => { PP = { kind: x, does: null }; ppDraw(); }; kb.appendChild(b); }
  const does = PP.does || PKIND[PP.kind]; kindChips($('pp-does'), null, id => { const d = new Set(PP.does || PKIND[PP.kind]); if (d.has(id)) d.delete(id); else d.add(id); PP.does = KINDS.map(x => x.id).filter(x => d.has(x)); ppDraw(); });
  $('pp-does').querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', does.includes(KINDS[i].id))); }
$('pp-add').onclick = () => { const S = pickState(); if (PICK.what === 'pot') { kFresh(S.type, 'snew', S.col); return; }
  PP_NEW = true; PP = { kind: KIND(S.type).vet ? 'clinic' : S.type === 'food' ? 'shop' : 'other', does: null }; $('pp-name').value = ''; $('pp-key').value = ''; $('pp-days').value = ''; renderPick(); };
$('pp-save').onclick = () => { const S = pickState(), name = $('pp-name').value.replace(/\s+/g, ' ').trim(), out = $('pp-out');
  if (PICK.what === 'colony') { if (!name) return show(out, '✗ Write the colony\'s name.', 'bad'); const have = colonies().find(x => lc(x.name) === lc(name)); if (!have) jset(SCOL, [...jget(SCOL, []), { name }]);
    S.col = have ? have.name : name; if (PICK.from === 'snew') snAutoPot(); buzz(); pickDone(); return; }
  const pk = lc($('pp-key').value.trim()), does = PP.does || PKIND[PP.kind];
  if (!name) return show(out, '✗ Write the partner\'s name.', 'bad'); if (!C.pointOk(pk)) return show(out, pk ? '✗ This is not a public key: paste the partner\'s own, 66 characters, 02… or 03….' : '✗ Paste its public key: 66 characters, 02… or 03….', 'bad');
  if (heldKeys('streetcat').some(k => C.sameKey(pubOf(k), pk)) || STREETCAT_KEYS.some(k => C.sameKey(k, pk))) return show(out, '✗ That is Streetcat\'s own key: the partner signs with its own.', 'bad');  /* by its x too: 02… and 03… are one signer (A06) */
  if (!does.includes(S.type)) return show(out, `✗ It does not confirm ${KIND(S.type).one}: choose it under "What it confirms", or another partner.`, 'bad');
  const dv = $('pp-days').value.trim(), dn = Number(dv); if (dv !== '' && !(Number.isInteger(dn) && dn >= 0 && dn <= 60)) return show(out, '✗ Days to confirm: a whole number, 0 to 60.', 'bad');
  jset(SPART, [...jget(SPART, []).filter(x => x && lc(x.pk) !== pk), { name, kind: PP.kind, pk, does, ...(dv !== '' ? { confirmDays: dn } : {}) }]);
  if (K_DEST === true && PICK.from === 'campaign') { if (!kPartners().includes(pk) && !kTick(pk)) return show(out, '✗ Eight partners at most.', 'bad'); PP_NEW = false; buzz(); renderPick(); return; }  /* a ticked list: the new one joins it, ticked, and the list stays to choose more */
  $('k-c').value = pk; K.also = []; buzz(); pickDone(); };
$('pp-done').onclick = () => pickDone();

// the forms, as they open: from the start, once the page has set itself up (they need what comes above)
kDefaults(); if ($('home').classList.contains('on')) renderHome();
function renderSreq(){ { const so = $('sq-out'); if (so.dataset.for !== String(CUR_SREQ)) { show(so, ''); so.dataset.for = String(CUR_SREQ); } }  /* what a release said belongs to its own request: another one opened shows none of it (a request not yet sent read "RELEASED 1 521 sat" of the one before) */
  const r = sreqs().find(x => x.id === CUR_SREQ), head = $('sq-head'), dl = $('sq-dl'), steps = $('sq-steps'); head.textContent = ''; $('sq-from').textContent = r && r.from ? `Repeated from ${r.from}` : ''; $('sq-rep-w').hidden = !r; dl.textContent = ''; steps.textContent = ''; $('sq-state').textContent = ''; $('sq-pics').textContent = ''; $('sq-pics-l').hidden = true; $('sq-rec').hidden = true;
  const term = $('sq-term'); clearInterval(term._qr); term.querySelectorAll('.qr').forEach(e => e.remove()); steps.hidden = false;
  /* the request goes to the clinic by relay by itself: the other ways (link, file, QR) only when it has not gone, under the warning in
     red; gone, a small link still shows it as QR, for the clinic in person without a connection. Once answered, nothing more to send. */
  const s0 = r ? sentState(r.outbox) : null, done0 = !r || ['certified', 'reported', 'released'].includes(r.state), gone0 = r && (s0.state === 'sent' || r.receivedAt || r.answer || r.handed);
  $('sq-send').hidden = done0 || gone0 || (online() && !!OUTBOX && !!r.outbox && !stuck(s0, r.created)); $('sq-qrl').hidden = done0 || !$('sq-send').hidden;
  const who = r ? whoAsked(r.q) : 'the clinic'; $('sq-qra').textContent = `${who === 'the clinic' ? 'Clinic' : who} offline? Show it as QR`; $('sq-link').textContent = `copy link for ${who === 'the clinic' ? who : 'the partner'}`;  /* a shop or another partner by its name */
  if (!$('sq-send').hidden) setLines($('sq-send-st'), (!OUTBOX ? '✗ Not sent: this browser cannot reach the relays.' : !online() ? '✗ Not sent: no connection. It goes by itself once there is one.' : !r.outbox ? '✗ Not sent yet.' : '✗ Not sent: no relay took it.') + `\nOr give it to ${who} another way:`);
  if (!r) { life('sq-life'); $('sq-amt').textContent = ''; $('sq-state').textContent = ''; head.appendChild(el('div', 'mut', 'No request open.')); $('sq-go').disabled = true; return; }  /* nothing of the request shown before stays */ const q = r.q, c = q.campaign, kc = camps().find(x => campKey(x.c) === campKey(c)); if (kc) CUR_CAMP = kc.slug; head.style.setProperty('--h', String(campHue(c))); head.appendChild(el('div', 'title', c.name)); head.appendChild(el('div', 'mut', `request ${q.id}`));
  const vet = KIND(typeOf(c)).vet; for (const [k, v] of [[vet ? 'Cat' : 'For', q.patient], [vet ? 'Procedure' : 'What', q.procedure], ['Date', q.date], ['Releases', fmtSat(C.requestAmount(q))], ...(q.note ? [['Note', q.note]] : []), ...(r.check && r.check.ok && r.check.received ? [['Received by', r.check.received === 'ok' ? r.check.receivedBy : r.check.received === 'missing' ? '✗ not with this copy of the answer' : `✗ not what ${who} signed`]] : [])]) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', /^✗/.test(v) ? 'bad' : null, v)); }  /* who took it in: the partner's word, shown when it is the line the partner signed the fingerprint of */
  tidy('sq', dl, C.requestAmount(q));
  const x = recOfReq(r); $('sq-pics-l').hidden = !(x && (q.photos || []).length);  /* with the clinic's record under them, the two rows are named */
  if ((q.photos || []).length) photoTiles($('sq-pics'), q.photos, 'not on this phone', x ? 'no photo' : null); sreqRec(r, x);
  const aw = PWORDS[pkindOf(q)] || PWORDS.other, aph = r.answer && r.answer.kind === 'certified' && r.check && r.check.ok ? ((r.answer.statement && r.answer.statement.photos) || []) : []; $('sq-ans').hidden = !aph.length;
  if (aph.length) { $('sq-ans-l').textContent = `${aw.label} · from ${whoAsked(q)}`; photoTiles($('sq-ans-pics'), aph, 'on its way', null, C.ANS_SLOTS, aw).then(n => { $('sq-ans-st').textContent = n === aph.length ? `Taken by ${whoAsked(q)} when it confirmed, and named in its signed confirmation. A tap shows a photo big.` : `${aph.length - n} of ${aph.length} on their way: they come by relay, with a connection.`; }); }
  const s = sentState(r.outbox), heard = !!(r.receivedAt || r.answer), lines = [['✓', `made · ${when(r.created)}`],
    [s.state === 'sent' || heard ? '✓' : s.state === 'failed' ? '✗' : '·', s.state === 'none' ? (r.handed ? 'sent by link or file' : 'not sent yet') : sentText(s) + (r.handed ? ' · and by hand' : '')],
    [heard ? '✓' : '·', r.receivedAt ? `received by ${who} · ${when(r.receivedAt)}` : `received by ${who}`],
    [r.answer ? (r.check && r.check.ok && r.answer.kind === 'certified' ? '✓' : '✗') : '·', r.answer ? `${r.check ? String(r.check.text).replace(/^[✓✗⚠]\s*/, '') : ''} · ${when(r.answeredAt)}` : `answered by ${who}`, undefined, !!(r.answer && r.answer.kind !== 'certified')],  /* a report: the partner's own words, as they are */
    [r.state === 'released' ? (r.released && r.released.short ? '✗' : '✓') : '·', r.state === 'released' && r.released ? `${r.released.to ? `paid ${fmtSat(r.released.amount)}${r.released.short ? ' of ' + fmtSat(r.released.of) : ''} to ${who} by the mint` : `released ${fmtSat(r.released.amount)}`}${r.released.back ? ` · ${fmtSat(r.released.back)} put back under the lock` : ''} · ${when(r.released.at)}${r.released.short ? ' · not paid: ' + r.released.short.map(x => x.ref).join(', ') : ''}` : 'released']];
  const np = (q.photos || []).length, pn = `its ${np} photo${np > 1 ? 's' : ''}`; if (np) lines.splice(2, 0, reqPhotosSent(r) ? ['✓', `${pn} sent`] : ['·', `${pn}: ${r.outbox ? 'sending' : 'not sent yet'}`]);
  if (x) lines.splice(lines.length - 1, 0, recLine(r, x));  /* before "released" */
  /* The lines short, a time of today as an hour (another day keeps its date), and whoever is named in its own colours */
  const today = new Date().toLocaleString(EN, { day: 'numeric', month: 'short' }), brief = t => String(t).replace(/ · (\d{1,2} [A-Z][a-z]{2}),? (\d\d:\d\d)/g, (x, d, hm) => d === today ? ' · ' + hm : x).replace(/(\d+) of (\d+) relays have it/, '$1/$2 relays').replace(/^(certified|confirmed|delivery confirmed)\b[^·]*/i, `$1 by ${who} `).replace(/ put back under the lock/, ' back under the lock').replace(/ by the mint( ·|$)/, '$1').replace(/^(paid .*?) · \d\d:\d\d$/, '$1').replace(/^its (\d+ photos?) sent/, '$1 sent').replace(/ +·/g, ' ·').trim();
  for (const [m, t, id, asIs] of lines) { const d = el('div', 'tl' + (m === '✗' ? ' bad' : '')), s = asIs ? t : brief(t); if (m === '✗') d.textContent = `${m} ${s}`; else d.appendChild(withKeys(`${m} ${s}`)); if (id) d.id = id; d.style.setProperty('--h', '100'); d.style.setProperty('--l', m === '·' ? '.5' : '.84'); steps.appendChild(d); }
  $('sq-state').textContent = q.contributions.map(k => `${k.ref} · ${fmtSat(k.release)}`).join('\n') + (r.check && r.check.text ? '\n' + r.check.text : '');  /* what this app checked, in full: the screen says it short */
  /* not sent, a report, an answer that failed the check: each said as it is, never "waiting" (review of 12 Nov) */
  life('sq-life', r.state === 'released' ? (r.released && r.released.short ? 'short' : r.released && r.released.to ? 'paid' : 'released') : r.state === 'certified' ? 'certified' : r.state === 'reported' ? 'reported' : r.state === 'bad' ? 'invalid' : !$('sq-send').hidden ? 'unsent' : 'locked', { who, three: c.lock !== 'dest' });
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
        for (const part of C.reqPhotoParts(q.id, ph.slot, ph.sha256, b64of(new Uint8Array(bytes)), q.campaign.streetcat, C.askedOf(q))) { const r = sreqs().find(y => y.id === r0.id) || r0; r.parts = r.parts || {}; const acked = r.parts[part.kind] || []; if (acked.length >= need) continue;
          try { const res = await R.publish(await R.wrap(part, sk, C.askedOf(q)), rels.filter(u => !acked.includes(u)), { timeout: 8000 }); for (const x of res) if (x.ok && !acked.includes(x.url)) acked.push(x.url); } catch (_) {}
          r.parts[part.kind] = acked; saveSreq(r); } } } })().finally(() => { REQSENDING = null; }); return REQSENDING; }
$('sq-qra').onclick = e => { e.preventDefault(); $('sq-qrl').hidden = true; $('sq-qr').onclick(); };
$('sq-qr').onclick = async () => { const r = sreqs().find(x => x.id === CUR_SREQ); if (!r) return; $('sq-steps').hidden = true; showQR($('sq-term'), await C.pack(r.q), $('sq-state')); };  /* in person: the clinic's phone scans it */
$('sq-resend').onclick = async () => { const r = sreqs().find(x => x.id === CUR_SREQ); if (r && OUTBOX && !r.outbox) { const sk = heldFor('streetcat', [r.q.campaign.streetcat]); if (sk) { const it = await OUTBOX.add(r.q, sk, C.askedOf(r.q), { relays: relays(), label: 'request ' + r.id }); r.outbox = it.id; saveSreq(r); } } await flush(); await reqParts(); renderSreq(); };
// Is it the cat of the request? Once
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
const recOfReq = r => scats().filter(x => x.rec.statement.request === r.id && lc(x.rec.statement.clinic) === C.askedOf(r.q))
  .sort((a, b) => String(b.rec.statement.signed).localeCompare(String(a.rec.statement.signed)))[0] || null;  /* signed again (corrected): the newer one */
const matchKey = (r, x) => [...(CATID_V > 1 ? ['v' + CATID_V, 'cat'] : []), x.id, ...views(r.q.photos).map(p => p.sha256), ...views(x.rec.statement.photos).map(p => p.sha256)].join(',');  /* 'cat': kept since the cat is looked for (13 Nov); one kept before is worked out again */
const matchOf = (r, x) => r.match && r.match.key === matchKey(r, x) ? r.match : null;  /* worked out once, kept with the request */
const recLine = (r, x) => { const m = matchOf(r, x); return m && (m.nocat || m.s < MATCH_WARN) ? ['✗', m.nocat ? 'its record from the clinic: no cat to compare' : 'its record from the clinic: may not be the same cat', 'sq-rec-tl'] : ['✓', `its record from the clinic · ${when(x.at)}`, 'sq-rec-tl']; };
// IS THERE A CAT? (13 Nov) A photo of a hand against one of trousers came out "Nothing points to another cat": the recognition compares
// whatever it is given. So each side's photos are looked at first (catid.js, catIn); a side with no cat in any of them is not compared,
// and it says so in red, never in green. A warning, never a block: sending, confirming and signing go on as before.
const NOCAT = { mine: '✗ No cat in your photos: they cannot be compared.', theirs: '✗ No cat in the record\'s photos: they cannot be compared.', both: '✗ No cat in the photos: they cannot be compared.' };
const matchSay = (m, say) => m.nocat ? say(NOCAT[m.nocat] || NOCAT.both, true) : m.s < MATCH_WARN ? say('✗ It may be another cat.', true) : say('Nothing points to another cat.', false, true);  /* short: green, or a brief warning in red, as on the partner's screen */
// a cat in one of these photos? each is worked out once and kept (catid.js, vecOf), so the comparison after it costs nothing more
const hasCat = async (ps, bytesOf) => { for (const p of ps) { const v = await CATID.vecOf(p.sha256, p.bytes && typeof p.bytes === 'object' ? p.bytes : () => bytesOf(p.sha256)); if (v && CATID.catIn(v)) return true; } return false; };  /* a photo named in a request or a record carries its size in bytes, a number: its bytes are on this phone */
// a photo just taken, in its tile: where no cat is found, "✗ no cat" in red in place of its name (the tile does not move). Only once the
// cat recognition is on this phone (Offline setup, or a comparison before): it is never fetched for this.
function shotMark(b, nocat){ const s = b.querySelector('span'); if (!s) return; if (s.dataset.l == null) s.dataset.l = s.textContent; s.textContent = nocat ? '✗ no cat' : s.dataset.l; b.classList.toggle('nocat', nocat); }
async function catNear(){ if (typeof CATID === 'undefined') return false; if (CATID.loaded()) return true; if (!(await CATID.here())) return false; await CATID.load(); return true; }
async function shotsCat(sel, ps){ let any = false;
  for (const p of ps) { const v = await CATID.vecOf(p.sha256, p.bytes), yes = !!v && CATID.catIn(v); any = any || yes;
    const b = document.querySelector(`${sel} .shot[data-slot="${p.slot}"]`); if (b && b._sha === p.sha256) shotMark(b, !yes); }  /* not if another photo took its place meanwhile */
  return any; }
const allHere = async ps => (await Promise.all(ps.map(p => photoHere(p.sha256)))).every(Boolean);
function sreqRec(r, x){ if (!x) { MATCH_RUN++; return; } const st = x.rec.statement; $('sq-rec').hidden = false;
  $('sq-rec-l').textContent = `At the clinic, asleep · ${st.name}'s record`; $('sq-rec-a').textContent = `${st.name}'s record: chip, notes`;
  photoTiles($('sq-rec-pics'), views(st.photos), 'on its way', 'no photo'); sreqMatch(r, x, false); }
// the first time it waits for a tap (the recognition is 48 MB); after that, or once Offline setup has kept it, it compares by itself.
// MATCHING: the comparison under way; the screen drawn again meanwhile (a check of the relays) follows it instead of starting another.
let MATCH_RUN = 0, MATCHING = null;
async function sreqMatch(r, x, go){ const run = ++MATCH_RUN, line = $('sq-match-st'), get = $('sq-match-get'), mine = views(r.q.photos), theirs = views(x.rec.statement.photos), key = matchKey(r, x);
  const say = (t, bad, good) => { if (run !== MATCH_RUN) return; line.textContent = t; line.classList.toggle('bad', !!bad); line.classList.toggle('ok', !!good); };
  const failed = e => { if (run !== MATCH_RUN) return; say('✗ ' + (CATID.loaded() ? 'the comparison stopped: ' : 'the cat recognition did not come: ') + ((e && e.message) || String(e)), true); get.hidden = false; };  /* in red, and the button again: a tap tries again */
  const shown = m => { if (run !== MATCH_RUN) return; matchSay(m, say); const tl = $('sq-rec-tl'), [mk, t] = recLine(sreqs().find(y => y.id === r.id) || r, x); if (tl) { tl.textContent = `${mk} ${t}`; tl.classList.toggle('bad', mk === '✗'); } };
  get.hidden = true; say('');
  if (!mine.length || typeof CATID === 'undefined') return;  /* a request without photos: the record's are there to look at */
  const done = matchOf(r, x); if (done) return shown(done);
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
    const a = await hasCat(probe, bytes), b = await hasCat(theirs, bytes), m = { key, at: nowIso() };  /* a cat on both sides first (13 Nov) */
    if (!a || !b) m.nocat = !a && !b ? 'both' : !a ? 'mine' : 'theirs';
    else { const [k] = await CATID.rank(probe, [{ id: x.id, photos: theirs }], bytes, C.REQ_SLOTS); if (!k) throw new Error('its photos could not be read'); m.s = k.s; }
    const r2 = sreqs().find(y => y.id === r.id); if (r2) { r2.match = m; saveSreq(r2); } return m; })();
  try { shown(await m0.p); } catch (e) { failed(e); } finally { if (MATCHING === m0) MATCHING = null; } }
$('sq-match-go').onclick = () => { const r = sreqs().find(y => y.id === CUR_SREQ), x = r && recOfReq(r); if (x) sreqMatch(r, x, true); };
$('sq-rec-a').onclick = e => { e.preventDefault(); const r = sreqs().find(y => y.id === CUR_SREQ), x = r && recOfReq(r); if (!x) return; CUR_CAT = x.id; BACK.cat = 'sreq'; openTab('cat'); };
// the release: Streetcat's signature joins the clinic's on every proof of the request; a proof paid in part gives its rest back under the
// same lock, in proofs derived from it (core.js), so the donor can still find it and take it back after the deadline
async function safeSwapOuts(w, inputs, outs, { what, mint, keep }){ if (!storageWorks()) throw new Error(NO_STORAGE); const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), done = settled(id, keep);
  if (!saveFlight({ id, what, mint: norm(mint), ys: inputs.map(yHex), outputs: outs.map(outSave), created: nowIso() })) throw Object.assign(new Error(NOT_WRITTEN), { byPage: true });
  try { const proofs = await w.ops.receive(inputs).asCustom(outs).run(); return done(proofs); }
  catch (e) { return swapFailed(w, e, id, inputs, outs, done); } }  /* asked at the mint first, as safeSwap does */
// A POT THAT PAYS FROM THE LOCK (core.js, `dest`): the mint pays the partner itself, and nothing comes to this app but what goes back
// under each donor's lock. One transaction per donation (each has its own lock), built anew from the request: the one the partner's app
// built and signed, or its signature would not hold; Streetcat's signature goes next to it. A transaction the mint already took (its
// answer lost, the page closed halfway) is read back from the mint (NUT-09), never sent again; a donation no longer locked (its donor
// took it back meanwhile) is said, and what the others paid is kept.
// Was it this very transaction that spent these inputs? The mint keeps a spend's witness with each of its inputs (NUT-07), and the
// rule makes a witness open every output of its transaction: inputs spent with a witness that opens these very outputs were spent by
// this transaction. Its outputs found signed say less (Daybreak, 14 Nov): whoever knows them (the partner, Streetcat) could have had
// them signed with other ecash while the donation stayed locked, or went back to its donor. True, false, or it throws (no answer).
async function spentByTx(w, tx){ const st = await w.checkProofsStates(tx.inputs); if (st.length !== tx.inputs.length || !st.every(x => x.state === 'SPENT')) return false;
  let o = null; try { o = JSON.parse(st[0].witness || '').outputs; } catch (_) {} if (!Array.isArray(o) || o.length !== tx.open.length) return false;
  return tx.open.every((x, i) => o[i] && o[i].secret === x.secret && String(o[i].r) === String(x.r)); }
async function releaseDest(r, sk){ await LEDGER_READY; const q = r.q, c = q.campaign, w = await wallet(c.mint), to = C.askedOf(q), txs = [], kept = { kept: true };
  for (const k of q.contributions) txs.push(await C.reqTx(q, k));
  const states = (await w.checkProofsStates(txs.flatMap(t => t.inputs))).map(x => x.state), entries = scEntries(c), done = r.destDone || (r.destDone = {}), short = [], unwritten = []; let at = 0, paid = 0, back = 0, fee = 0, n = 0;
  for (let i = 0; i < txs.length; i++) { const k = q.contributions[i], tx = txs[i], st = states.slice(at, at + tx.inputs.length); at += tx.inputs.length; let parts = [];
    if (st.every(x => x === 'UNSPENT')) { try { parts = await C.destSwap(w, tx, [C.destSign(tx, sk), r.answer.sigs[i]]); }
      catch (e) { try { parts = await C.destFind(w, tx); } catch (_) { parts = []; }  /* an error, or no answer: did the mint take it all the same? Asked before anything is concluded (outside audit, 11 Nov: an error that came back after the mint had paid, or a release already made from another tab, was booked as "the mint refused it", and the payment was never written down) */
        if (C.destWhole(tx, parts)) { let ours = null; try { ours = await spentByTx(w, tx); } catch (_) {}  /* found, but was it this transaction that spent the donation? */
          if (ours === null) throw Object.assign(new Error('the mint could not be asked whether it paid. Nothing is lost: release again later, and what the mint has paid is not paid twice. (' + (e.message || e) + ')'), kept);
          if (!ours) { short.push({ ref: k.ref, why: 'its payment was signed by the mint for another spend, and the donation is still locked: make a new request with it' }); continue; } }
        if (!C.destWhole(tx, parts) && cashu.isMintOperationError(e)) { short.push({ ref: k.ref, why: 'the mint refused it (' + String(e.message || e).slice(0, 120) + ')' }); continue; }  /* this donation's transaction, not the others': they are still paid, and it is said below (audit of 10 Nov: one refusal left the request half paid and "certified" for ever) */
        if (!C.destWhole(tx, parts)) throw Object.assign(new Error('the mint did not answer, so it is not known whether it paid. Nothing is lost: release again later, and what the mint has paid is not paid twice. (' + (e.message || e) + ')'), kept); } }
    else if (st.every(x => x === 'SPENT')) { parts = await C.destFind(w, tx);  /* taken before: is it this very transaction that the mint signed, and that spent the donation? */
      if (C.destWhole(tx, parts)) { let ours = null; try { ours = await spentByTx(w, tx); } catch (_) {} if (ours === null) throw Object.assign(new Error('the mint could not be asked whether it paid. Nothing is lost: release again later, and what the mint has paid is not paid twice.'), kept); if (!ours) parts = []; } }
    /* only the whole of it, each output for its amount (audit of 10 Nov: whatever the mint had signed under its blinded messages was booked as this release; a second request over the same proofs "paid" what the first had) */
    if (!C.destWhole(tx, parts)) { short.push({ ref: k.ref, why: 'it is no longer locked (its donor took it back, or it was released another way)' }); continue; }
    const rest = parts.filter(x => x.rest).map(x => x.proof); paid += parts.filter(x => !x.rest && x.to === to).reduce((a, x) => a + x.amount, 0); back += sum(rest); fee += tx.fee; n++;
    if (!done[k.ref]) { const e = entries[k.ref]; if (e) { e.parts = [...(e.parts || []), { request: q.id, patient: q.patient, procedure: q.procedure, date: q.date, amount: Number(k.release) }];
        if (rest.length) e.remainders = [...(e.remainders || []), cashu.getEncodedToken({ mint: c.mint, proofs: rest.map(fullProof) })]; }
      /* marked done only once the ledger has it (Daybreak, 14 Nov: a write that failed marked it done all the same, and the payment
         never reached the ledger): not written, it is said below, and releasing again writes it, paying nothing twice */
      if (await saveEntries(c, entries)) { done[k.ref] = nowIso(); saveSreq(r); } else unwritten.push(k.ref); } }
  if (unwritten.length) throw Object.assign(new Error(`paid, but this phone has no room to write ${unwritten.join(', ')} in the ledger. Free some room and release again: what the mint has paid is not paid twice.`), kept);
  /* Nothing paid at all: the request stays as it was, and says why. Part of it paid: it is done as far as it goes (what was not
     paid is free for a new request, which the partner confirms again), and says in red what is missing. */
  if (!n) throw Object.assign(new Error(short.map(x => `${x.ref}: ${x.why}`).join('; ') + '. Nothing was paid. Make a new request with what is still locked.'), { byPage: true });
  r.released = { amount: paid, back, fee, at: nowIso(), to, ...(short.length ? { of: C.requestSplit(q).reduce((a, x) => a + x.pay, 0), short } : {}) }; r.state = 'released'; saveSreq(r); reannounce(c);
  return ''; }
async function releaseScRequest(r){ await LEDGER_READY; const q = r.q, c = q.campaign, sk = heldFor('streetcat', [c.streetcat]); if (!sk) throw Object.assign(new Error('this browser has no Streetcat key for ' + c.name), { byPage: true });
  const v = await C.checkAnswer(q, r.answer); if (!v.ok || r.answer.kind !== 'certified') throw Object.assign(new Error(v.text.replace(/^✗ /, '')), { byPage: true });
  if (c.lock === 'dest') return releaseDest(r, sk);
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
  const plainOf = g => g.filter(p => !restOf.has(String(p.secret))), tokOf = ps => cashu.getEncodedToken({ mint: c.mint, proofs: ps, memo: `released: ${q.patient} · ${q.procedure} · ${q.id}` });  // the swap's record stays until the released part is kept here
  let got; try { got = await safeSwapOuts(w, signed, [...await buildOutputs(w, released), ...rest.flatMap(x => x.outs)], { what: { kind: 'release-split', request: q.id, memo: `${q.patient} · ${q.procedure}` }, mint: c.mint, keep: g => addReleased({ token: tokOf(plainOf(g)), amount: sum(plainOf(g)), memo: `${q.patient} · ${q.procedure}`, at: nowIso() }) }); }
  catch (e) { if (!rest.length || !cashu.isMintOperationError(e) || !/already signed/i.test(String(e.message || e))) throw e;
    /* KNOWN LIMIT OF TODAY'S LOCK (audit of 10 Nov). The rest of a split proof goes back in outputs worked out from the proof itself,
       so that its donor finds it with the token alone (core.js remainderPart). The published ledger shows the token, so anyone can
       work out those outputs and have the mint sign them first, for a sat each; the mint never signs one twice, and refuses this
       release. Nothing moves and nothing can be taken, and the proof can still be released whole. Said here as it is, with the
       donation it happened to, instead of the mint's bare words. (The lock that says where the money may go does not have this:
       its outputs come from a seed only the request carries.) */
    const hit = []; for (const x of rest) { try { const res = await w.mint.restore({ outputs: x.outs.map(o => o.blindedMessage) }); if ((res.signatures || []).length) hit.push(x.ref); } catch (_) {} }
    throw Object.assign(new Error(`${hit.join(', ') || 'a donation'}: someone had the mint sign, before this release, the outputs its rest would go back in (whoever knows a donation's token can, for a sat each). Nothing moved. Make a new request for an amount that takes that donation whole, or without it.`), { byPage: true }); }
  const plainP = plainOf(got), restP = got.filter(p => restOf.has(String(p.secret))), plain = tokOf(plainP);
  const entries = scEntries(c); for (const { ref, part } of parts) { const e = entries[ref]; if (!e) continue; e.parts = [...(e.parts || []), part]; const mine = restP.filter(p => restOf.get(String(p.secret)) === ref);
    if (mine.length) e.remainders = [...(e.remainders || []), cashu.getEncodedToken({ mint: c.mint, proofs: mine.map(fullProof) })]; }
  await saveEntries(c, entries); r.state = 'released'; r.released = { amount: sum(plainP), back: sum(restP), fee, at: nowIso() }; saveSreq(r); renderReleased(); reannounce(r.q.campaign); return plain; }
$('sq-go').onclick = async () => { const btn = $('sq-go'); busy(btn, true); try { const r = sreqs().find(x => x.id === CUR_SREQ); if (!r) throw new Error('no request open'); show($('sq-out'), 'asking the mint what is still locked…');
    const plain = await releaseScRequest(r); buzz(); renderSreq(); const rr = sreqs().find(x => x.id === CUR_SREQ);
    if (rr.released.to) { const sh = rr.released.short; show($('sq-out'), `PAID ${fmtSat(rr.released.amount)}${sh ? ' of ' + fmtSat(rr.released.of) : ''} to ${whoAsked(rr.q)}, by the mint${rr.released.fee ? ` (${fmtSat(rr.released.fee)} mint fee)` : ''}.${rr.released.back ? ` ${fmtSat(rr.released.back)} went back under the same lock: still the donors'.` : ''}` + (sh ? `\n✗ NOT PAID: ${sh.map(x => `${x.ref}: ${x.why}`).join('; ')}. Make a new request for what is missing.` : ''), sh ? 'bad' : 'ok'); busy(btn, false); return; }  /* a pot that pays from the lock: nothing to move */
    const { w: pw, dec: pd } = await decodeTok(plain), back = rr.released.back ? ` ${fmtSat(rr.released.back)} went back under the same lock: still the donors', to pay a later procedure or to be taken back after the deadline.` : '';
    await releasedOut($('sq-out'), { w: pw, proofs: pd.proofs, plain, mint: pd.mint, head: `RELEASED ${fmtSat(rr.released.amount)}.${back}`, keep: 'Move the released ecash to Streetcat\'s wallet now (this browser keeps a copy under Release):', label: 'copy released ecash' });
  } catch (e) { show($('sq-out'), whyFailed(e), 'bad'); } busy(btn, false); };

// ----- QRs: one picture, or for a longer text an animated series the other phone collects part by part -----
const QRPART = 300;
function showQR(term, text, label){ clearInterval(term._qr); term.querySelectorAll('.qr').forEach(e => e.remove()); const n = Math.ceil(text.length / QRPART), parts = n <= 1 ? [text] : Array.from({ length: n }, (_, i) => `SCQ:${i + 1}/${n}:` + text.slice(i * QRPART, (i + 1) * QRPART)); term._frames = parts;
  let i = 0; const draw = () => { const q = qrSvg(parts[i]); term.querySelectorAll('.qr').forEach(e => e.remove()); if (q) term.insertBefore(q, term.firstChild); if (label) label.textContent = n > 1 ? `${i + 1}/${n} · keep the other camera on it` : 'one picture: scan it with the other phone'; i = (i + 1) % parts.length; };
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
  const checks = [], dleq = await dleqOk(w, dec.proofs).catch(() => false);
  checks.push({ state: dleq ? 'ok' : 'bad', text: dleq ? 'Mint signature verified' : 'The mint\'s signature cannot be checked', detail: dleq ? `${dec.proofs.length} proof${dec.proofs.length > 1 ? 's' : ''}, each signed by ${c.mint.replace(/^https?:\/\//, '')} (DLEQ)` : 'Without it, this could be ecash the mint never issued: do not accept it.' });
  const lockBad = [...(scOk(c) ? [] : ['it is not locked with Streetcat\'s published key: Streetcat could never release it']), ...new Set(dec.proofs.map(x => C.lockProblem(C.lockOf(x.secret), c)).filter(Boolean))];  /* S1 */
  /* the campaign it says it is for is Streetcat's only with Streetcat's signature on it (Daybreak, 14 Nov: one written by anyone around
     Streetcat's published key, and a partner key of its own, was "Conditions match", and the volunteer signed for it) */
  const sg = p && p.campaign ? await C.campaignSig(p.campaign).catch(() => 'broken') : 'unsigned', campBad = sg === 'signed' ? '' : sg === 'broken' ? 'The campaign was changed after Streetcat signed it' : 'The campaign is not signed by Streetcat';
  checks.push({ state: campBad || lockBad.length ? 'bad' : 'ok', text: campBad || (lockBad.length ? 'The lock is not what the campaign promises' : `Conditions match ${c.name}`), detail: campBad ? ['ask the donor for the donation\'s QR or file from the Streetcat app', ...lockBad].join('; ') : lockBad.length ? lockBad.join('; ') : `Streetcat ${abbr(c.streetcat)} and the clinic ${abbr(c.clinic)} must both sign · the donor refunds after ${fmtDate(c.deadline)}` });
  const ys = dec.proofs.map(yHex), have = new Set(vrecs().flatMap(x => x.ys || [])), dup = ys.filter(y => have.has(y)).length;
  checks.push({ state: dup ? 'bad' : 'ok', text: dup ? (dup === ys.length ? 'Already received' : `Partly received before (${dup} of ${ys.length} proofs)`) : 'No duplicates', detail: dup ? 'Do not accept it twice.' : 'none seen here before' });
  let spent = null; if (online() && !w._vlOffline) { try { spent = (await w.checkProofsStates(dec.proofs)).filter(s => s.state !== 'UNSPENT').length; } catch (_) {} }
  checks.push(spent == null ? { state: 'warn', text: 'Spending state not checked', detail: 'checked when Streetcat receives it · a mint signature does not prove it unspent' } : { state: spent ? 'bad' : 'ok', text: spent ? 'Already spent at the mint' : 'Unspent at the mint', detail: '' });
  VPEND = { ok: dleq && !campBad && !lockBad.length && !dup && !spent, c, token: tok, ys, ref: await C.donRef(ys), amount: sum(dec.proofs), proofs: dec.proofs, offline: spent == null, dec, info, checks }; return VPEND; }
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
    show($('v-out'), `RECEIVED ${fmtSat(p.amount)} for ${p.c.name} (${p.ref}).\nShow the donor this acknowledgment, signed with your volunteer key. It says you have it. Not a certification.`, 'ok');
    const row = el('div', 'row2'); row.appendChild(smallBtn('save as file', () => saveFile(`acknowledgment-${p.ref}.json`, JSON.stringify(ack)))); row.appendChild(copyBtn('copy as text', packed)); $('v-out').appendChild(row); $('v-accept').disabled = true; renderShand(false);
  } catch (e) { show($('v-out'), failText(e), 'bad'); } busy(btn, false); };
$('v-fwd').onclick = async () => { const btn = $('v-fwd'); busy(btn, true); try { const sk = volunteerSk(), all = vrecs(), todo = all.filter(x => !x.forwarded && !x.handed); if (!todo.length) throw new Error('nothing left to forward');
    /* kind 'in person': not the donor's own message for the same donation (which its app sends by itself), so the inbox reads both and the campaign keeps the volunteer's receipt */
    if (!OUTBOX) { saveFile(`donations-received-${today()}.json`, JSON.stringify(todo.map(x => ({ t: 'streetcat.donation', v: 1, kind: 'in person', id: x.ref, campaign: x.campaign, token: x.token, from: pubOf(sk), via: 'in person', receipt: x.ack })))); todo.forEach(x => { x.handed = true; }); }
    else for (const x of todo) { const it = await OUTBOX.add({ t: 'streetcat.donation', v: 1, kind: 'in person', id: x.ref, campaign: x.campaign, token: x.token, from: pubOf(sk), via: 'in person', receipt: x.ack, at: nowIso() }, sk, x.campaign.streetcat, { relays: relays(), label: 'donation ' + x.ref }); x.forwarded = it.id; }
    jset(VREC, all); await flush(); renderShand(false); show($('v-out'), OUTBOX ? 'Forwarded: Streetcat\'s app picks them up from the relays.' : 'Saved as a file: send it to Streetcat.', 'ok'); buzz();
  } catch (e) { show($('v-out'), failText(e), 'bad'); } busy(btn, false); };

// ----- the donor: send the locked donation to Streetcat, hand it over in person, share a card -----
let DONATION = null;
// The locked donation goes to Streetcat by itself as soon as it is locked: by relay, through the outbox, which tries again while the app is open. The line in the button's place
// says how it goes, in red while no relay has it; a donation already on its way is not sent twice (a screen drawn again); given up after
// a day with no relay, or not taken by this phone's storage, a tap sends it again, and the token can still be copied or handed over.
function donorExtras(out, row, c, lockedToken, sk, locked){ DONATION = { c, lockedToken, sk, amount: sum(locked), proofs: locked };
  if (OUTBOX) { const r1 = el('div', 'row1'), d = DONATION; let retry = false, said = '', cheered = false;
    const b = smallBtn('sending to Streetcat…', () => { if (retry) go(true); }); b.classList.add('send-sc'); r1.appendChild(b); out.insertBefore(r1, row);
    const put = text => { if (text === said) return; said = text; b.dataset.label = text; b.style.minWidth = ''; b.classList.toggle('bad', BAD_LABEL.test(text)); flap(b, text, { speed: .35 }); };  /* the whole row's width: a long line wraps, never runs off the screen */
    /* not going by relay (failed, no relay took it, no connection): the token is to be given by hand, so its buttons come out from behind "···" (review of 12 Nov) */
    const inSight = () => { if (row.closest('.sheet')) r1.after(row); };
    const say = () => { if (!b.isConnected) { clearInterval(b._t); return; } if (b._err) { retry = true; inSight(); return put(b._err); } const s = sentState(d.outbox);
      if (s.state === 'sent') { clearInterval(b._t); retry = false; said = 'sent to Streetcat ✓'; b.classList.remove('bad'); doneLabel(b, said); b.style.minWidth = ''; if (!cheered) { cheered = true; buzz(); } return; }
      if (s.state === 'failed') { retry = true; inSight(); return put('not sent · tap to send it again'); }
      if (!online() || (s.tries && !s.acked)) inSight();
      retry = false; put(s.acked ? `${s.acked} of ${s.of} relays have it · sending…` : !online() ? 'offline: it goes when there is a connection' : s.tries ? 'no relay took it yet · trying again by itself' : 'sending to Streetcat…'); };
    const go = async again => { b._err = ''; retry = false; put('sending to Streetcat…');
      try { const ref = await C.donRef(locked.map(yHex)), had = !again && OUTBOX.list().find(x => x.t === 'streetcat.donation' && x.ref === ref && x.state !== 'failed');
        const it = had || await OUTBOX.add({ t: 'streetcat.donation', v: 1, id: ref, campaign: C.campaignOf(c), token: lockedToken, from: pubOf(sk), at: nowIso() }, sk, c.streetcat, { relays: relays(), label: 'donation ' + ref });
        d.outbox = it.id; await flush(); } catch (e) { b._err = 'not sent: ' + (e && e.message === NO_ROOM ? 'this phone has no room left · tap to try again' : 'tap to try again, or copy it'); }
      say(); };
    clearInterval(b._t); b._t = setInterval(say, 3000); go(false); }
  const more = el('p', 'center lnk'), h = el('a', null, 'hand it over in person'), k = el('a', null, 'share a card'); h.href = k.href = '#'; h.onclick = e => { e.preventDefault(); openTab('dhand'); }; k.onclick = e => { e.preventDefault(); openTab('dcard'); };
  more.appendChild(h); more.appendChild(document.createTextNode(' · ')); more.appendChild(k); out.appendChild(more); }
async function renderDhand(){ const d = DONATION, head = $('dh-head'), term = $('dh-term'); head.textContent = ''; show($('dh-out'), ''); clearInterval(term._qr); term.textContent = ''; $('dh-part').textContent = '';
  if (!d) { head.appendChild(el('div', 'mut', 'Lock a donation first: then it can be handed over.')); return; } head.style.setProperty('--h', String(campHue(d.c))); head.appendChild(el('div', 'title', d.c.name)); head.appendChild(el('div', 'mut', `${fmtSat(d.amount)} · locked`));
  showQR(term, await C.pack({ t: 'streetcat.handover', v: 1, campaign: handCamp(d.c), token: d.lockedToken }), $('dh-part')); }
// the campaign handed over with the donation, with Streetcat's signature on it: the volunteer's phone checks it (Daybreak, 14 Nov)
const handCamp = c => c.sig ? { ...C.campSigned(c), sig: String(c.sig) } : C.campaignOf(c);
$('dh-file').onclick = async () => { const d = DONATION; if (!d) return; saveFile(`donation-${await C.donRef(d.proofs.map(yHex))}.txt`, await C.pack({ t: 'streetcat.handover', v: 1, campaign: handCamp(d.c), token: d.lockedToken }), 'text/plain'); };
async function donorAck(text){ try { const a = await C.unpack(text); if (!a || a.t !== 'streetcat.handover-receipt' || !(await C.handoverReceiptOk(a))) throw new Error('this is not a signed acknowledgment');
    const d = DONATION, ref = d ? await C.donRef(d.proofs.map(yHex)) : a.body.donation; if (a.body.donation !== ref) throw new Error(`this acknowledgment is for another donation (${a.body.donation})`);
    jset('vetlock.donor.acks', [...jget('vetlock.donor.acks', []).filter(x => x && x.ref !== ref), { ref, ack: a, at: nowIso() }]); buzz();
    show($('dh-out'), `✓ RECEIVED by volunteer ${abbr(a.body.volunteer)} · ${when(a.body.received)}\n${fmtSat(a.body.amount)} for ${a.body.campaign.name}, still locked. Not a certification.`, 'ok');
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
const WREQ = 'vetlock.walletreqs', wreqs = () => { const a = jget(WREQ, []); return Array.isArray(a) ? a.filter(x => x && x.id && x.sk && x.c) : []; }, saveWreq = r => jset(WREQ, keepOpen([...wreqs().filter(x => x.id !== r.id), r], x => x.state === 'waiting', 30));  // a waiting one holds the key its payment comes to: kept
const hexOf = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), bytesOf = h => Uint8Array.from(String(h).match(/../g) || [], x => parseInt(x, 16));
let WCUR = null;
async function walletRequest(){ if (!R || !window.nostrkit) throw new Error('this browser cannot reach the relays'); settleAmt(); const c = await openSigned($('d-camp').value), amount = Math.floor(Number($('d-amt').value) || 0);
  let r = wreqs().find(x => x.state === 'waiting' && campId(x.c) === campId(c) && (x.amount || 0) === amount && Date.now() - x.created < 86400e3);
  if (!r) { if (!storageWorks()) throw new Error(NO_STORAGE); const { pk } = newDonorKey(c);  /* the refund key is kept before anything is paid */
    r = { id: hexOf(crypto.getRandomValues(new Uint8Array(8))), sk: hexOf(window.nostrkit.generateSecretKey()), pk, c, amount, relays: relays(), created: Date.now(), state: 'waiting', seen: [] };
    if (!saveWreq(r)) throw Object.assign(new Error('this browser could not keep this payment request (its storage is full or blocked), so it is not shown: a payment to it could not be received. Free some room in this browser and try again'), { byPage: true }); }
  const pub = window.nostrkit.getPublicKey(bytesOf(r.sk));
  r.creq = new cashu.PaymentRequest([{ type: 'nostr', target: R.nprofile(pub, r.relays), tags: [['n', '17']] }], r.id, r.amount || undefined, 'sat', [r.c.mint], `${r.c.name}: a donation locked until the vet confirms (Streetcat)`, true).toEncodedCreqA();
  return r; }
// "open in wallet" hands the request to the phone's Cashu wallet (a cashu: link; only Cashu wallets open those, so not a Lightning-only
// one: on an iPhone with two wallets, the Cashu one), which pays it in ecash with no Lightning route to find
async function renderWallet(){ const term = $('dw-term'), op = $('dw-open'); term.textContent = ''; term._retrace = null; show($('dw-state'), ''); op.removeAttribute('href');
  try { const r = await walletRequest(); WCUR = r; const q = qrSvg(r.creq); if (q) term.appendChild(q); term._retrace = qrFrame(q); op.href = 'cashu:' + r.creq; show($('dw-state'), 'waiting for the payment…'); wCheck(); } catch (e) { WCUR = null; show($('dw-state'), failText(e), 'bad'); } }
let WCHECKING = false;
// A payment is marked as seen once it is taken, or refused for good. One that failed in a way that may pass (the mint out of reach, no
// room to write it down first) is tried again at the next check, up to 20 times (Daybreak, 14 Nov: it was marked first, and a mint out
// of reach for a moment lost it). A request already paid is read for two more days: a second payment to it (a wallet that pays twice)
// is locked too, as another donation with the same refund key, not left in the relay for no one.
const WAGAIN = 2 * 86400e3, WTRIES = 20;
async function wCheck(){ if (WCHECKING || !R || !online()) return; WCHECKING = true;
  try { const live = x => x.state === 'waiting' || (x.state === 'done' && Date.now() - (Date.parse(x.done) || 0) < WAGAIN);
    for (const r of wreqs().filter(live).sort((a, b) => (b.id === (WCUR && WCUR.id)) - (a.id === (WCUR && WCUR.id)) || b.created - a.created)) { let res;  /* the one on screen first, then the newest: none is dropped any more */ try { res = await R.receivePayments(r.sk, { relays: r.relays || relays(), since: Math.floor(r.created / 1000), seen: new Set(r.seen || []), timeout: 6000 }); } catch (_) { continue; }
      for (const m of res.payments) { const cur = wreqs().find(x => x.id === r.id) || r, seen = () => { if (cur.tries) delete cur.tries[m.wrap]; cur.seen = [...(cur.seen || []), m.wrap].slice(-60); saveWreq(cur); };
        if (m.payload.id && m.payload.id !== r.id) { seen(); continue; }
        const how = {}, ok = await takeWalletEcash(cur, m.payload, undefined, how), tries = cur.tries || (cur.tries = {});
        if (ok || !how.again || (tries[m.wrap] = (tries[m.wrap] || 0) + 1) >= WTRIES) seen(); else saveWreq(cur);
        if (ok) break; } } } catch (_) {}
  WCHECKING = false; }
const otherMint = (from, c) => `this ecash is from ${from}, but the campaign uses ${c.mint}: it was not taken. Pay with Lightning instead: your wallet can pay the invoice.`;
// `how.again`: the failure may pass, and the payment is to be tried again (above). A refusal of the payment itself (`wNo`) or the
// mint's own is final. A swap with no answer is tried again too: the payment's ecash is only in its message, so the record kept of the
// swap (`kept`) cannot do it again; and if the mint did it all the same, its ecash is spent, the second try is refused, and that record
// gets the result back when the app opens (recoverFlights). Nothing is taken twice.
const wNo = t => Object.assign(new Error(t), { final: true });
async function takeWalletEcash(r, p, out = $('dw-state'), how = {}){ const c = r.c; try {
    if (norm(p.mint) !== norm(c.mint)) throw wNo(otherMint(p.mint, c));
    if (p.unit && p.unit !== 'sat') throw wNo('this ecash is not in sat: it was not taken');
    const w = await wallet(c.mint), proofs = (p.proofs || []).map(x => ({ ...x, amount: amt(x.amount) })); if (!proofs.length) throw wNo('there is no ecash in it');
    const lockedIn = proofs.filter(x => /^\s*\[/.test(String(x.secret)));
    if (!lockedIn.length) { show(out, `received ${fmtSat(sum(proofs))} — locking it…`); const got = await safeSwap(w, proofs, { lock: lockFor(c, r.pk), what: { kind: 'donation', campaign: c, pk: r.pk }, mint: c.mint, keep: keepLocked(c, r.pk) }); return finishWallet(r, got); }
    if (lockedIn.length === proofs.length && lockMatches(c, r.pk, proofs)) { if (!(await dleqOk(w, proofs))) throw wNo('the mint\'s signature on this locked ecash cannot be checked: it was not taken');  /* the mint's keys out of reach: thrown as it is, and tried again */
      if ((await w.checkProofsStates(proofs)).some(s => s.state !== 'UNSPENT')) throw wNo('this locked ecash is already spent');
      if (!keepLocked(c, r.pk)(proofs)) throw new Error(NOT_WRITTEN);  /* taken as it is, with no swap: kept here before it is called done, or tried again */
      return finishWallet(r, proofs); }
    const to = [...new Set(lockedIn.map(x => { const i = lockInfo([x]); return (i.pubkeys || []).map(k => abbr(lc(k))).join(' + ') || 'another condition'; }))].join('; ');
    throw wNo(`your wallet sent ecash that is already locked (to ${to}), not with this campaign's lock: this page cannot unlock it or lock it again, so it is not a donation. If it is locked to Streetcat's key alone, ask Streetcat to return it.`);
  } catch (e) { how.again = !(e.final || cashu.isMintOperationError(e) || (e.byPage && e.message !== NOT_WRITTEN));
    show(out, '✗ ' + (e.message || e) + (how.again ? ' It is tried again by itself.' : ''), 'bad'); r.last = String(e.message || e); saveWreq(r); return false; } }
function finishWallet(r, proofs){ r.state = 'done'; r.done = nowIso(); saveWreq(r); WCUR = null; if (nav.dataset.role !== 'donor' || !$('donate').classList.contains('on')) openTab('donate'); renderLocked(r.c, proofs, findDonorKey([r.pk])); return true; }
// the "Pay with ecash" screen, opened from Donate: the payment request, made when it opens, and one box for pasting ecash
async function renderEcash(){ settleAmt(); const head = $('de-head'); head.textContent = ''; show($('de-out'), '');
  if ($('donate').classList.contains('done')) { $('donate').classList.remove('done'); show($('d-out'), ''); }  /* a new donation, as "donate again" starts one */
  try { const c = parseCampaign($('d-camp').value.trim()), n = Math.floor(Number($('d-amt').value) || 0); head.style.setProperty('--h', String(campHue(c)));
    head.appendChild(el('div', 'title', c.name)); head.appendChild(el('div', 'mut', (n > 0 ? fmtSat(n) + ' · ' : '') + 'ecash from ' + String(c.mint).replace(/^https?:\/\//, ''))); } catch (_) {}  /* no readable link: the request says why */
  await renderWallet(); }
$('dw-copy').onclick = async () => { if (!WCUR) return; const t = $('dw-term'); if (t._retrace) t._retrace();  /* the frame, as on the invoice */ const ok = await copyText(WCUR.creq); if (ok) doneLabel($('dw-copy')); else flapLabel($('dw-copy'), 'select it'); };
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
const knownClinics = () => new Set([...camps().flatMap(k => k && k.c ? C.payeesOf(k.c) : []), ...sreqs().flatMap(r => [lc(r.q.campaign.clinic), C.askedOf(r.q)])].filter(Boolean));  /* with a list of partners, each of them */
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

// THE CLINIC: a new record, from its request (the cat, the procedure and the date are there already) or from nothing. Short:
// what is known already is one line with "edit" (the cat, the procedure and the
// date of a request; without one, the procedure of the cat before, or sterilisation, and today); coat and notes are folded.
const CATPROC = 'vetlock.clinic.proc';
function openCatnew(reqId){ const r = reqId && creqs().find(x => x.id === reqId), q = r && r.q; CN = { req: q ? r.id : null, shots: {} };
  $('cn-name').value = q ? q.patient : ''; $('cn-proc').value = q ? q.procedure : (ls.get(CATPROC) || 'sterilisation'); $('cn-date').value = q ? q.date : today();
  for (const id of ['cn-chip', 'cn-coat', 'cn-notes']) $(id).value = ''; $('cn-colony').value = '';  /* empty until it is written (13 Nov): not the colony of the cat before */
  document.querySelectorAll('#cn-sex button, #cn-ear button').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('#cn-shots .shot').forEach(b => { b.classList.remove('has', 'busy'); b.querySelectorAll('img').forEach(i => i.remove()); shotMark(b, false); b._sha = null; }); shotsLine();
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
// the photo is taken with the phone's camera, straight away: the file input asks for the camera (capture="environment"); a computer, which has none, offers its files
document.querySelectorAll('#cn-shots .shot').forEach(b => { b.onclick = async () => { const slot = b.dataset.slot, input = $('cn-file');
  const f = await new Promise(res => { input.value = ''; input.onchange = () => res(input.files && input.files[0]); input.click(); }); if (!f) return;
  b.classList.add('busy'); try { const p = await shrinkPhoto(f); CN.shots[slot] = p; b.querySelectorAll('img').forEach(i => i.remove()); const img = el('img'); img.alt = SLOTNAME[slot]; img.src = URL.createObjectURL(new Blob([p.bytes], { type: 'image/jpeg' })); b.prepend(img); b.classList.add('has'); shotsLine(); show($('cn-out'), ''); b._sha = p.sha256; shotMark(b, false); likeCheck(); }
  catch (e) { show($('cn-out'), failText(e), 'bad'); } b.classList.remove('busy'); }; });
// "Already in the records?": the new cat's photos against the records on this
// phone, with the cat recognition of catid.js. A hint, never a proof. The first time it waits for a tap: the recognition is 48 MB.
const LIKE_SLOTS = ['face', 'left', 'right'];  /* the nose, a close-up, says little of which cat it is */
let LIKE_RUN = 0;
function likeTile(x, sha){ const st = x.rec.statement, b = el('button'), ph = st.photos.find(p => p.sha256 === sha) || st.photos.find(p => p.slot === 'face') || st.photos[0]; b.type = 'button';
  const im = el(ph ? 'img' : 'div', ph ? '' : 'none'); if (ph) { im.alt = `${st.name}, ${SLOTNAME[ph.slot] || ph.slot}`; photoUrl(ph.sha256).then(u => { if (u) im.src = u; else im.className = 'none'; }); } b.appendChild(im);
  b.appendChild(el('div', 'nm', st.name)); b.appendChild(el('div', 'sub2', st.colony || '—')); b.appendChild(el('div', 'sub2', st.date)); b.onclick = () => { CUR_CAT = x.id; BACK.cat = 'catnew'; openTab('cat'); }; return b; }
// "Check the cat": one check, two answers. Is it the cat of Streetcat's request (its photos as caught, when the record is made from a request;
// the same hint as on Streetcat's side, one-sided, MATCH_WARN), and is it already in the records (the order, as before). Streetcat's
// photos show at once, to be looked at; the recognition, the first time, waits for the tap.
async function likeCheck(go){ const run = ++LIKE_RUN, box = $('cn-like'), list = $('cn-like-list'), st = $('cn-like-st'), get = $('cn-like-get'), rst = $('cn-req-st');
  const rq0 = CN.req && creqs().find(x => x.id === CN.req), rq = rq0 ? views(rq0.q.photos) : [];
  const recs = ccats().filter(x => x.rec.statement.photos.some(p => LIKE_SLOTS.includes(p.slot))), probe = LIKE_SLOTS.filter(s => CN.shots[s]).map(s => ({ slot: s, sha256: CN.shots[s].sha256, bytes: CN.shots[s].bytes }));
  list.textContent = ''; get.hidden = true; st.classList.remove('bad'); st.textContent = ''; delete st.dataset.state; rst.textContent = ''; rst.classList.remove('ok'); $('cn-req').hidden = !rq.length; $('cn-recs').hidden = true;
  if (rq.length && (run === 1 || $('cn-req-pics').childElementCount === 0 || $('cn-req-pics')._req !== CN.req)) { $('cn-req-pics')._req = CN.req; photoTiles($('cn-req-pics'), rq, 'on its way', 'no photo'); }
  box.hidden = !rq.length && !(recs.length && probe.length); if (typeof CATID === 'undefined' || !probe.length) return;
  if (!recs.length && !rq.length) { if (await catNear().catch(() => false) && run === LIKE_RUN) await shotsCat('#cn-shots', probe).catch(() => {}); return; }  /* nothing to compare with: only each photo's tile */
  const of = `your ${recs.length} record${recs.length === 1 ? '' : 's'}`, withWhat = [rq.length ? 'Streetcat\'s' : '', recs.length ? of : ''].filter(Boolean).join(' and with ');
  if (!go && !CATID.loaded() && !(await CATID.here())) { if (run !== LIKE_RUN) return; st.textContent = `Its photos can be compared with ${withWhat}, here on this phone. The cat recognition comes once: ${Math.round(CATID.SIZE / 1e6)} MB.`; get.hidden = false; return; }
  try { if (!CATID.loaded()) { st.textContent = 'getting the cat recognition…'; await CATID.load((got, all) => { if (run === LIKE_RUN) st.textContent = `getting the cat recognition: ${Math.round(got / 1e6)} of ${Math.round(all / 1e6)} MB`; }); }
    if (run !== LIKE_RUN) return;
    const cat = await shotsCat('#cn-shots', probe); if (run !== LIKE_RUN) return;  /* each photo's tile first: ✗ no cat, in red, where none is found (13 Nov) */
    if (!cat) { st.textContent = ''; setLines(rq.length ? rst : st, NOCAT.mine); return; }  /* no cat in the new photos: neither Streetcat's nor the records are compared */
    const bytes = sha => IDB.get('photos', sha);
    if (rq.length) { if (rq.length < 2) rst.textContent = 'Too few photos in the request to compare them here: look at them, and at the chip.';
      else if (!(await allHere(rq))) rst.textContent = 'Streetcat\'s photos are on their way: they come by relay, with a connection.';
      else { st.textContent = 'comparing with Streetcat\'s photos…';
        if (!(await hasCat(rq, bytes))) { if (run !== LIKE_RUN) return; setLines(rst, '✗ No cat in Streetcat\'s photos: they cannot be compared.'); }
        else { const [m] = await CATID.rank(probe, [{ id: 'request', photos: rq }], bytes, LIKE_SLOTS); if (run !== LIKE_RUN) return;
          if (m) { setLines(rst, m.s < MATCH_WARN ? '✗ It may be another cat.' : 'Nothing points to another cat.'); rst.classList.toggle('ok', m.s >= MATCH_WARN); } } }  /* short: green, or a brief warning in red */
      st.textContent = ''; }
    if (!recs.length) return; st.textContent = `comparing with ${of}…`;
    const ranked = await CATID.rank(probe, recs.map(x => ({ id: x.id, photos: x.rec.statement.photos })), bytes, LIKE_SLOTS, (d, all) => { if (run === LIKE_RUN && all > 3) st.textContent = `comparing with ${of}: ${d} of ${all} photos`; });
    if (run !== LIKE_RUN) return; const top = [];  /* a record with no cat in its photos is left out (13 Nov) */
    for (const r of ranked) { if (top.length === 3) break; const x = ccats().find(y => y.id === r.id); if (x && await hasCat(x.rec.statement.photos.filter(p => LIKE_SLOTS.includes(p.slot)), bytes)) top.push([x, r.sha]); }
    if (run !== LIKE_RUN) return; $('cn-recs').hidden = !top.length;
    for (const [x, sha] of top) list.appendChild(likeTile(x, sha));
    st.textContent = ''; st.dataset.state = 'done'; }  /* the tiles, most alike first, with nothing written under them */
  catch (e) { if (run !== LIKE_RUN) return; const m = (e && e.message) || String(e);  /* in red, and the button again: a tap tries again */
    st.textContent = '✗ ' + (CATID.loaded() ? 'the comparison stopped: ' : 'the cat recognition did not come: ') + m; st.classList.add('bad'); get.hidden = false; } }
$('cn-like-go').onclick = () => likeCheck(true);
// a record made without a request goes to the Streetcat of the last request this phone got, or to Streetcat's published key
const catTo = () => { const r = creqs().filter(x => scOk(x.q.campaign)).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]; return r ? lc(r.q.campaign.streetcat) : lc(STREETCAT_KEYS[0] || ''); };
async function catSign(){ const r = CN.req && creqs().find(x => x.id === CN.req), q = r && r.q, sk = q ? clinicSkFor(q) : key('clinic', false), no = m => Object.assign(new Error(m), { byPage: true });
  if (!sk) throw no(q ? `this phone has no clinic key for ${q.campaign.name}` : 'this phone has no clinic key yet: make one in settings');
  if (q && !scOk(q.campaign)) throw no('this request is not from Streetcat\'s published key: no record is made for it');
  const name = $('cn-name').value.trim(), chip = $('cn-chip').value.replace(/[\s.-]/g, ''), to = q ? lc(q.campaign.streetcat) : catTo();
  if (!name) { catEdit(); throw no('write the cat\'s name'); } if (chip && !/^\d{15}$/.test(chip)) throw no(`the microchip number has ${chip.length} character${chip.length === 1 ? '' : 's'}: it must be 15 digits`);
  if (!$('cn-proc').value.trim() || !$('cn-date').value) { catEdit(); throw no('write the procedure and its date'); } if (!PUBKEY.test(to)) throw no('this phone does not know Streetcat\'s key yet: open a request from Streetcat first');
  const photos = C.CAT_SLOTS.filter(s => CN.shots[s]).map(s => ({ slot: s, sha256: CN.shots[s].sha256, bytes: CN.shots[s].bytes.length, w: CN.shots[s].w, h: CN.shots[s].h }));
  try { for (const p of photos) await IDB.put('photos', p.sha256, CN.shots[p.slot].bytes); } catch (_) { throw no('this browser cannot keep the photos (a private window?): open the app in a normal window'); }  /* before signing: the record names only photos this phone keeps */
  const rec = await C.signCat({ name, colony: $('cn-colony').value, chip, sex: picked('cn-sex'), ear: picked('cn-ear'), coat: $('cn-coat').value, procedure: $('cn-proc').value, date: $('cn-date').value, notes: $('cn-notes').value, photos }, sk, q ? { request: q.id, campaign: q.campaign } : {});
  const x = { id: rec.id, rec, to, at: nowIso(), parts: {} }; saveCcat(x); ls.set(CATPROC, rec.statement.procedure); return x; }
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
  if (have && lc(rec.statement.clinic) !== lc(have.rec.statement.clinic)) throw Object.assign(new Error(`a record ${p.id} is here already, signed by another clinic key: this one is not taken`), { byPage: true });  /* only its own clinic corrects a record (Daybreak, 14 Nov: any clinic key could put its own in its place) */
  if (!have || String(rec.statement.signed) > String(have.rec.statement.signed)) saveScat({ id: p.id, rec, from: lc(p.from || rec.statement.clinic), at: have ? have.at : nowIso(), via: have ? have.via : via });  /* signed again (corrected): the newer one */
  if (photos && typeof photos === 'object') for (const ph of rec.statement.photos) if (typeof photos[ph.slot] === 'string') { try { await keepPhoto(ph.sha256, unb64(photos[ph.slot])); } catch (_) {} }  /* a file carries its photos */
  return !have; }
// a part of a photo (a record's, or a request's): kept until all its parts are here, then the photo, if it is the one its SHA-256 says
async function takePart(p){ const k = i => p.sha256 + '|' + i; await IDB.put('parts', k(p.part), p.data);
  const all = []; for (let i = 0; i < p.of; i++) { const d = await IDB.get('parts', k(i)); if (typeof d !== 'string') return false; all.push(d); }
  let ok = false; try { ok = await keepPhoto(p.sha256, unb64(all.join(''))); } catch (_) {} if (ok) for (let i = 0; i < p.of; i++) await IDB.del('parts', k(i)).catch(() => {}); return ok; }
async function takeCatPart(p){ if (!C.catPartOk(p) || await photoHere(p.sha256)) return false; const ok = await takePart(p);
  if (ok && ['cats', 'cat', 'sreq'].some(id => $(id).classList.contains('on'))) refreshStates(); return ok; }  /* a request's screen shows its record's photos too */
async function takeAnsPart(p){ const r = sreqs().find(x => x.id === p.id); if (!C.ansPartOk(p) || !r || lc(p.from) !== C.askedOf(r.q) || await photoHere(p.sha256)) return false; const ok = await takePart(p);
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
  if (all.length && !shown.length) list.appendChild(el('div', 'empty', 'No cat matches that.'));  /* an empty list says nothing, the clinic's or Streetcat's */
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
  if (on('home')) { try { if (homeSig() !== HOME_SIG) homeKinds(); } catch (_) {} }  /* what is to release, as it comes: drawn again only when something changed */
  if (on('cats')) renderCats(); if (on('cat')) renderCat(); if (on('catnew') && $('cn-go').classList.contains('fin')) { const x = ccats().slice().sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]; if (x) catNewOut(x); } }
let TICKING = false;
// Three apps, one for each: each looks at the relays for the keys it holds (its own role's; a browser that holds more, for each of them), every
// minute and as soon as it comes to the front, when one turns from one app to another.
let TICK_AGAIN = false;  // asked for while a check runs (the app back in front): it runs right after, not never
async function tick(){ if (TICKING) { TICK_AGAIN = true; return; } if (!online()) return; TICKING = true; LAST_TICK = Date.now(); try { if (nav.dataset.role === 'donor') await pendCheck().catch(() => {});  /* an invoice left waiting: finished if paid */
    if (R) { await flush();
    if (heldKeys('clinic').length) { try { const res = await clinicCheck(); setLines($('w-net'), res.text); await catParts(); await ansParts(); } catch (_) {} }
    if (heldKeys('clinic').length) { try { await cCollectAll(); } catch (_) {} }  /* what the mint has paid this partner goes on to its Lightning address */
    if (heldKeys('streetcat').length) { try { const res = await scCheck(); setLines($('sc-net'), res.text); await reqParts(); } catch (_) {} }  /* what could not be taken, in red (scCheck) */
    refreshStates(); } } catch (_) {} TICKING = false; if (TICK_AGAIN) { TICK_AGAIN = false; setTimeout(() => { try { tick(); } catch (_) {} }, 50); } }
// how often it looks (review of 9 Nov: relay load): every minute while the phone is being used (a tap, a key, back in front, in the
// last ten minutes) or something is still being sent; every five minutes when nothing happens; never while the app is not in front
let BUSY_AT = Date.now(), LAST_TICK = 0;
const inUse = () => Date.now() - BUSY_AT < 600000 || !!(OUTBOX && OUTBOX.list().some(x => x.state === 'sending'));
['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, () => { BUSY_AT = Date.now(); }, { capture: true, passive: true }));
setInterval(() => { if (document.visibilityState === 'visible' && (inUse() || Date.now() - LAST_TICK >= 300000)) tick(); }, 60000); addEventListener('online', () => tick()); setTimeout(tick, 1500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { BUSY_AT = Date.now(); tick(); } });  /* back in front: it looks at once */
// the version this phone runs (review of 9 Nov, "the commit in the app"): the service worker's BUILD, a hash of the
// app's files that anyone can work out from the code (node tools/stamp-sw.mjs prints it); nothing while no service worker serves the page
function swBuild(){ const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (!c) return Promise.resolve('');
  return new Promise(res => { const ch = new MessageChannel(), t = setTimeout(() => res(''), 3000); ch.port1.onmessage = e => { clearTimeout(t); res(String(e.data || '')); }; c.postMessage({ type: 'build' }, [ch.port2]); }); }
const showBuild = id => swBuild().catch(() => '').then(b => { $(id).textContent = /^[0-9a-f]{12}$/.test(b) ? `Version ${b}` : ''; });
const RENDER = { work: renderWork, creq: renderCreq, csettings: () => { showBuild('cs-ver'); return renderSettings(); }, coffline: renderOffline, scamp: renderScamp, skind: renderKind, spick: renderPick, snew: renderSnew, sreq: renderSreq, shand: () => renderShand(true), dhand: renderDhand, dcard: renderDcard, decash: renderEcash, catnew: renderCatnew, cats: renderCats, cat: renderCat, keys: () => { keysLn(); showBuild('x-ver'); return xPrep(); } };  /* Keys: as Rescue, the long button to the Lightning address */
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { const f = RENDER[b.dataset.t]; if (f) Promise.resolve().then(f).catch(() => {}); }));
$('h-hand').onclick = () => openTab('shand');
{ const on = document.querySelector('nav button.on'); if (on && !nav.hidden && RENDER[on.dataset.t]) Promise.resolve().then(RENDER[on.dataset.t]).catch(() => {}); }  /* the screen the page opened on */
// the app also opens without a connection (sw.js). A NEW VERSION comes whole (sw.js) and is taken at a good moment: just opened and not
// touched yet, or back in front; and nothing under way (no swap or payment waiting for the mint's answer, no invoice or payment request
// on screen, nothing typed in the last two minutes). The page then opens again in it; otherwise it waits for the next good moment, the
// next time the app is opened at the latest (review of 9 Nov)
let SW_REG = null, SW_TOOK = false, SW_ASKED = 0; const OPENED = Date.now(); let TOUCHED = false, TYPED_AT = 0;
document.addEventListener('pointerdown', () => { TOUCHED = true; }, { capture: true, passive: true }); document.addEventListener('input', () => { TYPED_AT = Date.now(); }, { capture: true, passive: true });
const swQuiet = () => { try { return !flights().length && !payouts().some(x => x.state === 'pending') && !melts().some(x => x.state === 'pending') && !WAITING && !$('decash').classList.contains('on') && Date.now() - TYPED_AT > 120000; } catch (_) { return false; } };
function swTake(back){ const w = SW_REG && SW_REG.waiting; if (!w || SW_TOOK || !navigator.serviceWorker.controller) return; if (!(back || (Date.now() - OPENED < 20000 && !TOUCHED)) || !swQuiet()) return; SW_TOOK = true; w.postMessage({ type: 'take' }); }
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (SW_TOOK) location.reload(); });  /* the first version on a phone takes over quietly; a new one opens the page again */
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { SW_REG = reg; swTake(false);
    reg.addEventListener('updatefound', () => { const nw = reg.installing; if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed') swTake(false); }); }); }).catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible' || !SW_REG) return; swTake(true); if (Date.now() - SW_ASKED > 300000) { SW_ASKED = Date.now(); SW_REG.update().catch(() => {}); } }); }  /* back in front: is there a newer one? */
// HOLD TO CONFIRM: each button that moves money or signs fills from the left in the
// colour of whose screen it is while it is held (index.html); full, it blinks twice, buzzes and acts. Let go before: it empties, nothing
// happens, and it says "hold to confirm". With the keyboard: Space or Enter, held. Pay with Lightning only shows an invoice (the wallet is
// where it is paid), so it stays a tap. vetlock.holdms sets the time in this browser (the tests: 0, an ordinary click).
const HOLD_MS = 2000, HOLD = ['r-go', 'd-go', 'cr-go', 'cr-report', 'cn-go', 's-go', 'sq-go', 'sn-go', 'k-go', 'v-accept'];
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

// COLOURED TEXTS MOVE. A coloured text (a key, a key line, a campaign's name in its colour, a cat
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
  const b = t.closest('button, a, summary'), own = t.closest(MOVING), sec = t.closest('section') || document.querySelector('section.on'); if (!sec || (!b && !own)) return;  /* a fold's summary is a tap too */
  setTimeout(() => { if (b) shuffleScreen(sec, b); else if (!still(own)) shuffleIn(own); }, 0); });  /* after the tap has done its work: what it drew anew types in */
document.addEventListener('paste', ev => { if (!ANIM()) return; const f = ev.target; if (!f || !/^(INPUT|TEXTAREA)$/.test(f.tagName) || /^(password|number|date|file)$/.test(f.type)) return;
  const text = ((ev.clipboardData && ev.clipboardData.getData('text')) || '').trim(); if (text) setTimeout(() => pasteShow(f, text), 0); }, true);
function pasteShow(f, text){ const r = f.getBoundingClientRect(); if (!r.width || !r.height) return; const cs = getComputedStyle(f), o = document.createElement('div'), body = document.createElement('span');
  o.className = 'paste-over'; Object.assign(o.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', padding: cs.padding, fontSize: cs.fontSize, lineHeight: cs.lineHeight });
  o.style.setProperty('--h', String(HUE[document.body.dataset.role] || 55)); o.appendChild(body); document.body.appendChild(o); const gone = () => o.remove(); addEventListener('scroll', gone, { once: true });
  typeKeys(body, text, { follow: true, think: false, dur: Math.min(1600, 300 + text.length * 3), done: () => setTimeout(gone, 450) }); }
// the suites' way in, and nothing else's: only where the app is served from this computer (review of 9 Nov, S2: on the published site it
// handed out the private keys to whatever script asked)
if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) window.__vetlock = { campHue, newCampHue, ledgerFor, openTab, setRole, parseCampaign, openCampaign, lockInfo, key, heldKeys, pubOf, donorKeys, pendings, flights, releasedList, mintCheck,
  receiptOf, melts, wreqs, wCheck, scanFeed: t => SCAN && SCAN.feed(t), scanEnd: () => SCAN && SCAN.end(), frames: id => ($(id) && $(id)._frames) || [], tick, flush, creqs, sreqs, vrecs, openPayload, relays, outbox: () => OUTBOX ? OUTBOX.list() : [],
  ccats, scats, openCatnew, photoHere, catParts, scCheck, catCur: id => { CUR_CAT = id; }, shrinkPhoto, keepPhoto, saveCcat, cnShots: () => CN.shots, likeCheck, holdMs, HOLD,
  addReleased, payouts, savePayout, saveMelt, saveWreq, cPayouts, cChange, cCollectAll, decodeTok, ledgerAll: async () => { await LEDGER_READY; return scLedger(); }, ledgerSet: ledgerWrite, ledgerIn: () => LEDGER_READY.then(() => LEDGER_IDB ? 'IndexedDB' : 'localStorage') };
{ const s0 = navState(); navStack.push(s0); try { history.replaceState({ ...(history.state || {}), ...s0, sc: 1 }, ''); } catch (_) {} navReady = true; }  // the first step of the app's history: the screen it opened on
// the request screens' less used things, behind their "···"
moreSheet($('sq-more'), 'sq-sheet', [$('sq-rep-w'), $('sq-qrl')], $('sreq')); moreSheet($('cr-more'), 'cr-sheet', [$('cr-cat')], $('creq'));
// the open campaign's name in the header, in its own colour
function hdCamp(){ const on = document.querySelector('section.on'), t = on && !/^cat/.test(on.id) && !on.classList.contains('sigbad') && [...on.querySelectorAll('.camp > .title')].find(x => x.parentElement.getClientRects().length), h = $('hd-camp');  /* a cat's record is headed by the cat, not by a campaign; the screen's own campaign as shown, never a name in a list on it nor one hidden behind it, and never a link that is not Streetcat's signed one */ if (!h) return; const v = t ? t.textContent : ''; if (h.textContent !== v) h.textContent = v; if (t) h.style.color = getComputedStyle(t).color; }
setInterval(hdCamp, 200);  /* at once on a tab change (above); this catches a name drawn later */
{ const box = $('cr-shots-box'), ow = $('cr-shots-open-w'), ob = $('cr-shots-open'), done = el('button', 'go', 'Done'); done.id = 'cr-shots-done'; done.type = 'button'; box.appendChild(done);
  /* the photos' screen says what was ordered, what each photo must show, who took it in, and what becomes of the photos */
  const ord = el('div', 'sub-ord'), hints = el('div', 'shots two hints'), tout = el('div', 'out'); tout.id = 'cr-shots-term';
  for (const x of box.querySelectorAll('.shot')) hints.appendChild(el('p', 'mut', ({ note: 'date · shop · quantity', goods: 'all of it · the label' })[x.dataset.slot] || ''));
  $('cr-shots-l').after(ord); $('cr-shots').after(hints); box.insertBefore(tout, done); const err = el('div', 'out'); err.id = 'cr-shots-err'; box.insertBefore(err, done); let sig = '';
  const subDraw = () => { const r = creqs().find(x => x.id === CUR_CREQ); if (!r) return; const q = r.q; ord.textContent = ''; ord.appendChild(el('div', 'what', q.procedure)); ord.appendChild(el('div', 'mut', `${q.patient} · ${q.date} · ${fmtSat(C.requestAmount(q))}`));
    const has = s => !!box.querySelector(`.shot[data-slot="${s}"].has`), slots = [...box.querySelectorAll('.shot')].map(x => x.dataset.slot), n = slots.filter(has).length;
    const L = slots.map(s => [has(s) ? '✓' : '·', ({ note: 'delivery note', goods: 'the goods' })[s] || s]); L.push([n ? '✓' : '·', 'no location data']); L.push(['·', 'goes to Streetcat with the confirmation']);
    const g = r.id + JSON.stringify(L); if (g !== sig) { sig = g; fillBox(tout, 'shots-' + r.id, L); } };
  ob.onclick = () => { box.style.top = document.querySelector('header').getBoundingClientRect().bottom + 'px'; box.classList.add('sub'); subDraw(); }; done.onclick = () => box.classList.remove('sub');
  SHOTS_UI = () => { const shop = !box.hidden, now = $('cr-now'), locked = now && $('cr-life').dataset.s === 'locked'; ow.hidden = !shop;
    if (!shop) { box.classList.remove('sub'); if (locked && now.textContent !== 'Your turn · confirm') now.textContent = 'Your turn · confirm'; return; }
    const has = box.querySelectorAll('.shot.has'), n = has.length, m = box.querySelectorAll('.shot').length;
    ob.textContent = n ? `✓ ${n} photo${n > 1 ? 's' : ''}` : `Photos of the delivery · 0 of ${m}`; for (const x of has) { const im = x.querySelector('img'); if (im) { const c = im.cloneNode(); c.className = 'mini'; c.alt = ''; ob.appendChild(c); } }
    done.textContent = n ? `Done · ${n} photo${n > 1 ? 's' : ''}` : 'Back';
    if (locked) { const v = n ? 'Your turn · confirm' : 'Your turn · add a photo'; if (now.textContent !== v) now.textContent = v; }
    if (box.classList.contains('sub')) subDraw(); };
  SHOTS_UI(); }
})();
