// Moving everything from one browser to another of the same phone (StreetCat, 7 Nov, 23:23, after moving the keys from Safari to the app
// on his home screen: «Por qué no se han importado las claves de las campañas. Quiero que tú importes todas las claves del navegador a
// la app ya»). Export all carries the keys, as before (at the top, so an app of before still takes them), and everything this browser
// keeps with them: campaigns, partners, colonies, requests, donations, and the photos. Import all adds what the other browser lacks and
// keeps what it has; twice is the same as once. Against the local mint and two local relays, with made-up keys.
import { chromium } from 'playwright';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const relays = [startRelay({ port: 7341 }), startRelay({ port: 7342 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await c.addInitScript(r => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => { say('DIALOG', d.message()); d.accept(); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), asRescue = p => p.evaluate(() => { window.__vetlock.setRole('streetcat'); window.__vetlock.openTab('keys'); }), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const stored = (p, k) => p.evaluate(k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (_) { return []; } }, k);
const photo = (p, sha) => p.evaluate(sha => new Promise(res => { const r = indexedDB.open('streetcat', 1); r.onupgradeneeded = () => { for (const s of ['photos', 'parts']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
  r.onsuccess = () => { const q = r.result.transaction('photos').objectStore('photos').get(sha); q.onsuccess = async () => { const v = q.result; if (!v) return res(null); const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', v))].map(x => x.toString(16).padStart(2, '0')).join(''); res(h); }; q.onerror = () => res(null); }; r.onerror = () => res(null); }), sha);
// Safari: Streetcat's key; a shop with its own key, made a partner; a colony; a food campaign; and a photo kept (as a request's)
const shop = await page(); await tab(shop, 'csettings'); await shop.click('#cs-new'); const shopPk = await shop.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
const sc = await page(); await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(800); await sc.reload(); await sc.waitForTimeout(500);
const scPk = await sc.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('streetcat', false)));
await tab(sc, 'home'); await sc.waitForTimeout(300); await sc.locator('#h-kinds button.tile', { hasText: 'Food' }).click(); await sc.waitForSelector('#skind.on'); await sc.click('#kd-camp'); await sc.waitForSelector('#campaign.on');
await sc.click('#k-col'); await sc.waitForSelector('#spick.on'); await sc.click('#pp-add'); await sc.fill('#pp-name', 'colony Marina'); await sc.click('#pp-save'); await sc.waitForSelector('#campaign.on');
await sc.click('#k-par'); await sc.waitForSelector('#spick.on'); await sc.click('#pp-add'); await sc.fill('#pp-name', 'Pienso Sur'); await sc.fill('#pp-key', shopPk); await sc.click('#pp-save'); await sc.waitForSelector('#campaign.on');
await sc.fill('#k-name', 'COMIDA MARINA'); await sc.fill('#k-mint', MINT); await sc.click('#k-go'); const made = await waitText(sc, '#k-out', /is ready|cannot|✗/, 30000);
check('Safari: a food campaign, with its colony and its partner', /is ready/.test(made) && (await stored(sc, 'vetlock.campaigns')).length === 1, made.slice(0, 60));
const sha = await sc.evaluate(() => new Promise(res => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48; const g = cv.getContext('2d'); g.fillStyle = '#c84'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#123'; g.fillRect(8, 8, 20, 20);
  cv.toBlob(async bl => { const u = new Uint8Array(await bl.arrayBuffer()), h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', u))].map(x => x.toString(16).padStart(2, '0')).join('');
    const r = indexedDB.open('streetcat', 1); r.onupgradeneeded = () => { for (const s of ['photos', 'parts']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => { const t = r.result.transaction('photos', 'readwrite'); t.objectStore('photos').put(u, h); t.oncomplete = () => res(h); }; }, 'image/jpeg', .8); }));
// the photo is a cat record's (by actor, 8 Nov: an export carries only the photos this actor's records name)
await sc.evaluate(sha => localStorage.setItem('vetlock.sc.cats', JSON.stringify([{ id: 'CAT-TEST', rec: { statement: { name: 'Crypto', colony: 'colony Marina', procedure: 'spay', date: '2026-11-07', photos: [{ slot: 'face', sha256: sha }] } }, from: 'test', at: new Date().toISOString() }])), sha);
// EXPORT ALL in Safari, as Rescue: the keys type themselves out, then what goes with them; all of it copied at the tap
await asRescue(sc); await sc.waitForTimeout(600); await sc.click('#x-exp'); const said = await waitText(sc, '#x-term', /in your clipboard/, 20000);
const copied = await sc.evaluate(() => navigator.clipboard.readText()); let exp = null; try { exp = JSON.parse(copied); } catch (_) {}
const data = (exp && exp.data) || {}, campsOut = (() => { try { return JSON.parse(data['vetlock.campaigns']); } catch (_) { return []; } })();
check('Export all: the keys at the top, as before (an app of before still takes them)', !!exp && !!exp.streetcat && (exp.streetcatOld || []).length === 0 && 'clinic' in exp && Array.isArray(exp.donorKeys));
check('…and with them the campaign, its partner and its colony, and the photo', campsOut.length === 1 && /COMIDA MARINA/.test(JSON.stringify(campsOut)) && /Pienso Sur/.test(data['vetlock.sc.partners'] || '') && /colony Marina/.test(data['vetlock.sc.colonies'] || '') && !!((exp && exp.photos) || {})[sha], Object.keys(data).join(','));
check('…not the keys twice, nor what is under way here (payments, swaps), caches or the screen', !['vetlock.streetcat.sk', 'vetlock.clinic.sk', 'vetlock.donor.keys', 'vetlock.pending', 'vetlock.inflight', 'vetlock.mintcache', 'vetlock.role', 'vetlock.kform'].some(k => k in data));
check('…and it says what goes with the keys', /and 1 campaign · 1 partner · 1 colony · 1 cat record · 1 photo/.test(said), said.replace(/\s+/g, ' ').slice(-150));
// IMPORT ALL in the app on the home screen: its own storage, a colony of its own already; the box empty, it takes what was copied
const app = await page(); await app.evaluate(() => localStorage.setItem('vetlock.sc.colonies', JSON.stringify([{ name: 'colony Playa' }])));
await asRescue(app); await app.evaluate(t => navigator.clipboard.writeText(t), copied); await app.click('#x-imp'); const imp = await waitText(app, '#x-out', /Imported|✗/, 15000);
check('Import all, as Rescue: it says what came with the keys', /^Imported, as Rescue\. The keys this browser had before are kept too\. With them: 1 campaign · 1 partner · 1 colony · 1 cat record · 1 photo; what this browser had stays too\./.test(imp), imp.slice(0, 160));
const keysThere = await app.evaluate(() => window.__vetlock.heldKeys('streetcat').map(k => window.__vetlock.pubOf(k)));
check('…Streetcat\'s key is there', keysThere.includes(scPk));
const camps = await stored(app, 'vetlock.campaigns'), cols = (await stored(app, 'vetlock.sc.colonies')).map(c => c.name), pars = (await stored(app, 'vetlock.sc.partners')).map(p => p.name);
check('…and the campaign, the partner, and both colonies: Safari\'s and its own', camps.length === 1 && /COMIDA MARINA/.test(JSON.stringify(camps)) && pars.join() === 'Pienso Sur' && cols.includes('colony Marina') && cols.includes('colony Playa') && cols.length === 2, cols.join(', ') + ' · ' + pars.join(', '));
check('…and the photo, the same bytes (its SHA-256)', (await photo(app, sha)) === sha);
await tab(app, 'home'); await app.waitForTimeout(400); await app.locator('#h-kinds button.tile', { hasText: 'Food' }).click(); await app.waitForSelector('#skind.on'); await app.waitForTimeout(400);
const pots = await app.$$eval('#kd-pots button.req .title', ts => ts.map(t => t.textContent));
check('…so Rescue in the app shows the campaign, under Food', pots.some(t => /COMIDA MARINA/i.test(t)), pots.join(', '));
// twice is the same as once
await asRescue(app); await app.evaluate(t => navigator.clipboard.writeText(t), copied); await app.click('#x-imp'); const imp2 = await waitText(app, '#x-out', /Imported|✗/, 15000);
const camps2 = await stored(app, 'vetlock.campaigns'), cols2 = await stored(app, 'vetlock.sc.colonies'), pars2 = await stored(app, 'vetlock.sc.partners');
check('importing it again adds nothing twice', /^Imported/.test(imp2) && camps2.length === 1 && cols2.length === 2 && pars2.length === 1, `${camps2.length} · ${cols2.length} · ${pars2.length}`);
// a name with «» of its own: read as it is (the quotes are straightened only when the text does not read as it is)
const withQuotes = JSON.stringify({ ...exp, data: { ...data, 'vetlock.sc.colonies': JSON.stringify([{ name: 'colony «La Punta»' }]) } }, null, 1);
const third = await page(); await asRescue(third); await third.evaluate(t => navigator.clipboard.writeText(t), withQuotes); await third.click('#x-imp'); const imp3 = await waitText(third, '#x-out', /Imported|✗/, 15000);
check('a name with «» of its own comes as it is', /^Imported/.test(imp3) && (await stored(third, 'vetlock.sc.colonies')).some(c => c.name === 'colony «La Punta»'), imp3.slice(0, 60));
say(bad ? `moveall: ${bad} check(s) failed` : 'moveall: every check passed');
await b.close(); relays.forEach(r => r.close && r.close()); process.exit(bad ? 1 : 0);
