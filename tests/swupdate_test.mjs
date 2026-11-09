// A new version of the app, as a phone gets it (review of 9 Nov: each file came from the network on its own, so a connection lost half way
// could leave the new page with the old code). A copy of the app on its own server (8096), with the service worker on, as on a phone:
// version 2 is published and the app, just opened and with nothing under way, opens again in it, every file from version 2; offline it
// still opens; version 3 is published while a payment waits for the mint's answer: the app stays on version 2, and takes version 3 once
// nothing is under way and it comes back to the front; version 4, with one of its files not there, is never used (the app stays whole
// on version 3).
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { APP, shellOf, stamp } from '../tools/stamp-sw.mjs';
const say = (...a) => console.log(...a); let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'swupd-')) + '/', files = shellOf(fs.readFileSync(APP + 'sw.js', 'utf8'));
for (const f of [...files, 'sw.js']) { fs.mkdirSync(path.dirname(T + f), { recursive: true }); fs.copyFileSync(APP + f, T + f); }
const publish = v => { fs.appendFileSync(T + 'index.js', `\n;window.__swv = ${v};`); return stamp(T).stamp; };  /* a new version: a change to the app, stamped */
const server = spawn('python3', ['-m', 'http.server', '8096', '--bind', '127.0.0.1', '--directory', T], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
const BASE = 'http://127.0.0.1:8096/', b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await ctx.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); localStorage.setItem('vetlock.anim', 'off'); } catch (_) {} });
await ctx.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
const p = await ctx.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); });
const version = () => p.evaluate(() => window.__swv || 1).catch(() => 0), until = async (fn, ms = 25000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn().catch(() => false)) return true; await p.waitForTimeout(250); } return false; };
const cacheNames = () => p.evaluate(async () => (await caches.keys()).filter(k => k.startsWith('streetcat-app-')));

await p.goto(BASE + 'index.html'); const first = await until(() => p.evaluate(() => !!navigator.serviceWorker.controller));
check('the first version is taken at once: the service worker serves the app', first && (await cacheNames()).length === 1, JSON.stringify(await cacheNames()));
const v2 = publish(2); await p.reload(); const took2 = await until(async () => (await version()) === 2);
const c2 = await p.evaluate(async b => { const c = await caches.open('streetcat-app-' + b); return { js: /window\.__swv = 2;\s*$/.test(await (await c.match('index.js')).text()), n: (await c.keys()).length }; }, v2);
check('version 2 published: the app, just opened with nothing under way, opens again in it', took2 && (await cacheNames()).join() === 'streetcat-app-' + v2, `on version ${await version()} · caches ${JSON.stringify(await cacheNames())}`);
check('…every file of it from one cache, filled whole before it was used', c2.js && c2.n === files.length, JSON.stringify(c2));
await p.evaluate(() => window.__vetlock.openTab('keys')); const ver = await until(async () => (await p.textContent('#x-ver')) === 'Version ' + v2, 8000);
check('…and Keys says the version this phone runs, the stamp anyone can work out from the code', ver, await p.textContent('#x-ver'));
await ctx.setOffline(true); await p.reload(); check('…and offline it still opens, as version 2', (await version()) === 2 && await p.evaluate(() => !!window.__vetlock)); await ctx.setOffline(false);

// a payment waiting for the mint's answer: version 3 waits
await p.evaluate(() => localStorage.setItem('vetlock.sc.payouts', JSON.stringify([{ id: 'p1', state: 'pending', quote: 'q', amount: 1, to: 'x@y.z', mint: 'http://127.0.0.1:9', token: 't', at: new Date().toISOString() }])));
const v3 = publish(3); await p.reload(); await until(() => p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), 20000); await p.waitForTimeout(3000);
check('version 3 published while a payment waits for the mint: the app stays on version 2, version 3 waits', (await version()) === 2 && await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting));
await p.evaluate(() => { localStorage.setItem('vetlock.sc.payouts', '[]'); document.dispatchEvent(new Event('visibilitychange')); });  /* nothing under way, and back in front */
check('…and once nothing is under way, back in front, it opens again in version 3', await until(async () => (await version()) === 3), `on version ${await version()}`);

// version 4 with a file that cannot be fetched: never used, the app stays whole on version 3
publish(4); fs.renameSync(T + 'qrcode.min.js', T + 'qrcode.min.js.off'); await p.reload(); await p.waitForTimeout(5000);
const on4 = await version(), names4 = await cacheNames(); fs.renameSync(T + 'qrcode.min.js.off', T + 'qrcode.min.js');
check('version 4, one of its files missing: never used, the app stays whole on version 3', on4 === 3 && names4.join() === 'streetcat-app-' + v3, `on version ${on4} · caches ${JSON.stringify(names4)}`);

// From the version before this one (tests/sw-v6.fixture.js: each file from the network first, copied one by one into streetcat-app-v6),
// as every phone that has the app gets this one: that worker brings the new page from the network; the new worker is fetched whole and
// waits; the page, just opened with nothing under way, takes it and opens again in it; the old copy is deleted.
{ const T0 = fs.mkdtempSync(path.join(os.tmpdir(), 'swold-')) + '/';
  for (const f of [...files, 'sw.js']) { fs.mkdirSync(path.dirname(T0 + f), { recursive: true }); fs.copyFileSync(APP + f, T0 + f); }
  const swNew = fs.readFileSync(T0 + 'sw.js'); fs.copyFileSync(new URL('./sw-v6.fixture.js', import.meta.url).pathname, T0 + 'sw.js');
  const s0 = spawn('python3', ['-m', 'http.server', '8097', '--bind', '127.0.0.1', '--directory', T0], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800));
  const c0 = await b.newContext({ viewport: { width: 390, height: 844 } }); await c0.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); localStorage.setItem('vetlock.anim', 'off'); } catch (_) {} });
  await c0.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  const q = await c0.newPage(); q.on('pageerror', e => { bad++; say('✗ PAGEERROR (from the version before)', e.message); });
  const on = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn().catch(() => false)) return true; await q.waitForTimeout(250); } return false; };
  const names = () => q.evaluate(async () => (await caches.keys()).filter(k => k.startsWith('streetcat-app-')));
  await q.goto('http://127.0.0.1:8097/index.html');
  const was = await on(async () => (await q.evaluate(() => !!navigator.serviceWorker.controller)) && (await names()).join() === 'streetcat-app-v6');
  check('before: the version before this one serves the app (network first, its copy in streetcat-app-v6)', was, JSON.stringify(await names()));
  fs.writeFileSync(T0 + 'sw.js', swNew); fs.appendFileSync(T0 + 'index.js', '\n;window.__swnew = 1;'); const nb = stamp(T0).stamp;  /* this version, published */
  let loads = 0; q.on('load', () => { loads++; }); await q.reload();
  const took = await on(async () => (await names()).join() === 'streetcat-app-' + nb && loads >= 2 && await q.evaluate(() => window.__swnew === 1 && !!navigator.serviceWorker.controller), 40000);
  const kept = await q.evaluate(async b => { const c = await caches.open('streetcat-app-' + b), js = await c.match('index.js'); return { js: !!js && /window\.__swnew = 1;\s*$/.test(await js.text()), n: (await c.keys()).length }; }, nb).catch(e => ({ err: e.message }));
  check('this version published over it: the page takes it and opens again in it, every file from its own cache, and the old copy is gone', took && kept.js && kept.n === files.length, `caches ${JSON.stringify(await names())} · loads ${loads} · ${JSON.stringify(kept)}`);
  await c0.setOffline(true); await q.reload(); check('…and offline it opens as this version', await q.evaluate(() => window.__swnew === 1 && !!window.__vetlock).catch(() => false)); await c0.setOffline(false);
  await c0.close(); s0.kill(); fs.rmSync(T0, { recursive: true, force: true }); }

await b.close(); server.kill(); fs.rmSync(T, { recursive: true, force: true });
say(bad ? `swupdate: ${bad} check(s) failed` : 'swupdate: every check passed'); process.exit(bad ? 1 : 0);
