// Rescue's ledger in IndexedDB (12 Nov): app/index.html in Chromium, with no mint and no relay. Each donation is kept whole, 9 to 15 KB,
// and localStorage (some 5 MB for everything) had room for 200 to 500. Here: a thousand donations of 12 KB are kept and read back after
// a reload; a second tab of the same browser sees what the first kept, without a reload; a ledger still in localStorage, as the app
// kept it before, moves over at the next opening, all of it, and leaves localStorage; and a browser that refuses IndexedDB keeps the
// ledger in localStorage, as before. The donations here are made up (their tokens are not ecash): what is tried is where they are kept.
import { chromium } from 'playwright';
import { pinBrowser } from './pin.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8080/', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const ctxOf = async init => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(() => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} }); if (init) await c.addInitScript(init); return c; };
const open = async c => { const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); await p.goto(BASE + 'index.html'); return p; };
const ID = '02' + 'a'.repeat(64) + ',03' + 'b'.repeat(64) + '|1767225600|dest';  // a lock as the ledger files it: its keys, its deadline, its kind
const count = p => p.evaluate(async () => Object.values(await window.__vetlock.ledgerAll()).reduce((s, L) => s + Object.keys(L.entries || {}).length, 0));

// 1. a thousand donations of 12 KB: 12 MB, more than localStorage holds; 2. a second tab sees what the first keeps
{ const c = await ctxOf(), p = await open(c), where = await p.evaluate(() => window.__vetlock.ledgerIn());
  const wrote = await p.evaluate(async ([id, n]) => { const V = window.__vetlock; let ok = true;
    for (let k = 0; k < 10; k++) { const some = {}; for (let i = 0; i < 100; i++) some['DON-' + (k * 100 + i).toString(16).toUpperCase().padStart(8, '0')] = { token: 'cashuB' + 'x'.repeat(n), amount: 21, date: '2026-11-12', parts: [] }; ok = (await V.ledgerSet(id, some)) && ok; }
    return ok; }, [ID, 12000]);
  await p.reload(); const n = await count(p), left = await p.evaluate(() => localStorage.getItem('vetlock.sc.ledger'));
  check('a thousand donations of 12 KB (12 MB, more than localStorage holds) are kept in IndexedDB and read back after a reload', where === 'IndexedDB' && wrote && n === 1000 && left === null, `${where} · ${n} read back`);
  const p2 = await open(c); await count(p2);
  await p.evaluate(id => window.__vetlock.ledgerSet(id, { 'DON-ABCDEF01': { token: 'cashuBnew', amount: 50, date: '2026-11-12', parts: [] } }), ID);
  let seen = 0; for (let i = 0; i < 30 && seen !== 1001; i++) { await p2.waitForTimeout(100); seen = await count(p2); }
  check('a second tab of the same browser sees a donation the first kept, without a reload', seen === 1001, `${seen} there`);
  await c.close(); }

// 3. a ledger still in localStorage, as the app kept it before 12 Nov: moved over at the next opening, and gone from localStorage
{ const c = await ctxOf(), p = await open(c);
  await p.evaluate(id => { const entries = {}; for (let i = 0; i < 50; i++) entries['DON-' + (0xA0000000 + i).toString(16).toUpperCase()] = { token: 'cashuB' + 'y'.repeat(9000), amount: 100 + i, date: '2026-11-10', parts: i === 0 ? [{ request: 'R-1', amount: 21 }] : [] };
    localStorage.setItem('vetlock.sc.ledger', JSON.stringify({ [id]: { entries } })); }, ID);
  await p.reload(); const n = await count(p), first = await p.evaluate(async id => (await window.__vetlock.ledgerAll())[id].entries['DON-A0000000'], ID), left = await p.evaluate(() => localStorage.getItem('vetlock.sc.ledger'));
  check('a ledger left in localStorage moves into IndexedDB at the next opening, all of it (what was released of it too), and leaves localStorage', n === 50 && first && first.amount === 100 && first.parts.length === 1 && left === null, `${n} moved · localStorage ${left === null ? 'empty of it' : 'still has it'}`);
  await c.close(); }

// 4. a browser that refuses IndexedDB: localStorage, as before
{ const c = await ctxOf(() => { try { IDBFactory.prototype.open = function () { throw new DOMException('refused here', 'SecurityError'); }; } catch (_) {} }), p = await open(c);
  const where = await p.evaluate(() => window.__vetlock.ledgerIn()), ok = await p.evaluate(id => window.__vetlock.ledgerSet(id, { 'DON-0000000F': { token: 'cashuBz', amount: 8, date: '2026-11-12', parts: [] } }), ID);
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('vetlock.sc.ledger') || '{}')); await p.reload(); const n = await count(p);
  check('a browser that refuses IndexedDB keeps the ledger in localStorage, as before, and reads it back', where === 'localStorage' && ok && Object.keys((Object.values(kept)[0] || {}).entries || {}).length === 1 && n === 1, `${where} · ${n} read back`);
  await c.close(); }
say(bad ? `ledgeridb: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'ledgeridb: every check passed'); await b.close(); process.exit(bad ? 1 : 0);
