// The names in their colours (index.js and status.js, paintKeys), on both pages, with no mint and no relay: "Streetcat", "Rescue",
// a partner word and a key are painted; a word the painter leaves as it is ("rescue the cat", "STREETCAT TNR", "a RESCUE pot":
// nameOk, review of 12 Nov) is left as it is, and the page goes on. Before 13 Nov such a text was taken, put back the same, seen as
// new and taken again, for ever: a campaign named "STREETCAT TNR" or a note saying "rescue" hung the page (found by the demo's bar,
// whose links say RESCUE).
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8080/', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const KEY = '02' + '7c'.repeat(32);
const TEXTS = [['rescue the cat', false], ['STREETCAT TNR', false], ['a RESCUE pot', false], ['Streetcat and the clinic', true], ['Streetcat will rescue the cat', true], [`the key ${KEY}`, true]];
for (const page of ['index.html', 'status.html']) {
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }), p = await ctx.newPage(), errs = [];
  await ctx.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} });
  p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE + page, { waitUntil: 'domcontentloaded' });
  const got = [];
  for (const [text] of TEXTS) {
    await Promise.race([p.evaluate(t => { const d = document.createElement('div'); d.className = 'zz-paint'; d.textContent = t; document.body.appendChild(d); }, text), new Promise(r => setTimeout(r, 2000))]);
    got.push(await Promise.race([p.evaluate(() => { const d = [...document.querySelectorAll('.zz-paint')].pop(); return { text: d.textContent, who: d.querySelectorAll('.who').length, key: d.querySelectorAll('.key').length }; }), new Promise(r => setTimeout(() => r(null), 3000))]));
  }
  const answered = got.every(Boolean);
  check(`${page}: a text with a name left as it is ("rescue the cat", "STREETCAT TNR", "a RESCUE pot") leaves the page answering, and the text as it was`, answered && [0, 1, 2].every(i => got[i].text === TEXTS[i][0] && !got[i].who && !got[i].key), answered ? got.slice(0, 3).map(g => `${g.text} (${g.who})`).join(' · ') : 'the page stopped answering');
  check(`${page}: "Streetcat", "the clinic" and a key are still painted, "rescue" beside them is not`, answered && got[3].who === 2 && got[4].who === 1 && got[4].text === TEXTS[4][0] && got[5].key === 1, answered ? got.slice(3).map(g => `${g.who} who · ${g.key} key`).join(' · ') : '');
  check(`${page}: no page error`, !errs.length, errs.join(' | ').slice(0, 120));
  await ctx.close();
}
await b.close(); say(bad ? `paint: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'paint: every check passed'); process.exit(bad ? 1 : 0);
