// Every error, warning or odd state the tests' pages show must be in the app's bad colour (var(--bad))
// (red). watchColors(ctx) watches every page of a context: each
// visible line that reads as one (MUST_BE_RED, written here from what the app says, apart from the app's own list) is recorded with its
// colour. With COLORS_DIR set, the test writes what it saw to COLORS_DIR/<test>.json when it ends; colors_test.mjs reads them all after
// the suites and fails on any line that was not red. pin.mjs installs it in every context, so every browser suite takes part.
import fs from 'fs';
import path from 'path';
export const MUST_BE_RED = [
  // errors and failures
  '^(✗|⚠)', '^(Failed|Not possible|Mint refused|Interrupted|CHECK FAILED)\\b', '^([Cc]annot|[Cc]ould not)\\b', '^wrong password', '^This (phone|browser) could not',
  '^(the mint did not answer|the mint cannot be reached|[Nn]o connection)', '^Nothing left to release', '^The camera is not available', '^(retrying…|paid or not, nothing is lost)', '^Paid elsewhere or not recoverable',
  // warnings
  '^This link is not (signed|from Streetcat)', '^Not yet\\b', '^Still in flight', '^Refund in progress', '^Verification unavailable', '^[Nn]ot ready for offline', '^not sent:', '^no relay took it',
  '^(Donors will have to pay with ecash|Without NUT-09)', 'The copy saved before has no password', '^not found on the relays', '^This campaign is not (signed|from Streetcat)',
  // odd states
  '^NOT (COUNTED|LISTED)', '^unknown clinic$','^(SPENT · NO WITNESS|SPENT · OTHER KEYS|UNKNOWN|UNREADABLE|OTHER MINT)$', '^spent, but the mint did not say who signed', '^spent with signatures that are not',
  "the clinic's declaration is not in the ledger", 'proofs are counted in an earlier entry', 'listed token\\(s\\) not counted', "released without the clinic's declaration", 'not accounted for',
  // a button saying something did not work
  '^(no key|select it|not copied|not sent|no relay took it: copy it|offline: copy it|tick the box|too large: copy it|not published)$',
];
const seen = new Map(), NAME = path.basename(process.argv[1] || 'test', '.mjs');
const key = t => t.replace(/cashu[AB][A-Za-z0-9_\-=]+/g, 'cashuB…').replace(/\b0[23][0-9a-f]{6,64}…?/g, 'KEY').replace(/\b[0-9a-f]{12,}\b/g, 'HEX').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 90);
const take = (_, list) => { for (const r of list || []) { const k = key(r.text), was = seen.get(k); if (!was || (was.red && !r.red)) seen.set(k, { text: r.text.slice(0, 140), red: r.red, color: r.color, page: r.page }); } };
if (process.env.COLORS_DIR) process.on('exit', () => { try { fs.mkdirSync(process.env.COLORS_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.COLORS_DIR, NAME + '.json'), JSON.stringify([...seen.values()], null, 1)); } catch (_) {} });
export async function watchColors(ctx){
  await ctx.exposeBinding('__colorSeen', take);
  await ctx.addInitScript(src => { const RE = src.map(s => new RegExp(s)); let timer = 0, bad = '';
    const probe = () => { const i = document.createElement('i'); i.style.color = 'var(--bad)'; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; };
    const shown = e => { for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return false; if (x.tagName === 'DETAILS' && !x.open && e !== x && !e.closest('summary')) return false; } return true; };
    const last = new WeakMap();  // a text node's value at the previous scan: a line still being typed is not taken until it stops changing
    const scan = settled => { timer = 0; if (!document.body || !window.__colorSeen) return; bad = bad || probe(); const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { const e = n.parentElement; if (!e || e.closest('textarea, input, script, style, .cur, .key')) continue;
        const v = n.nodeValue, was = last.get(n); last.set(n, v); if (!settled && was !== v) continue;
        for (const raw of String(n.nodeValue).split('\n')) { const line = raw.replace(/^[\s·]+/, '').trim(); if (!line || !RE.some(r => r.test(line))) continue; if (!shown(e)) break;
          const color = getComputedStyle(e).color; out.push({ text: line, color, red: color === bad, page: location.pathname.split('/').pop() || 'index.html' }); } }
      return out.length ? window.__colorSeen(out).catch(() => {}) : null; };
    window.__colorScan = () => scan(true);  // pin.mjs calls it in every page before the browser closes
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => scan(true), 700); };  /* the page has been quiet for a moment */
    const start = () => { new MutationObserver(soon).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'style'] }); soon(); setInterval(() => scan(false), 2500); };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start); }, MUST_BE_RED);
}
