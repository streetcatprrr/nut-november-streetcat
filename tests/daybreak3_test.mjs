// What the six security scans by parts of 14–15 Nov (Daybreak, Codex Security: the mint, the core, the partner and Rescue, the donor,
// the pages, handovers and cats) found and was fixed, each tried the way it was found, in Chromium against the local mints (3338
// plain, 3340 with the dest rule) and two local relays, with fake money and made-up keys. The numbers are the scans': part.finding.
// · Import all: an actor's records come only with that actor's key (4.6 and 4.18, critical: an export without Streetcat's key brought a
//   campaign this browser then signed with Streetcat's key, and requests announced as confirmed; 4.7, 4.15, 3.30).
import { chromium } from 'playwright';
import fs from 'fs';
import { startRelay, loadKit } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8')); loadKit();
const C = globalThis.scCore, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey()), now = () => Math.floor(Date.now() / 1000);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const relays = [startRelay({ port: 7495 }), startRelay({ port: 7496 })]; await Promise.all(relays.map(r => r.ready)); const URLS = relays.map(r => r.url);
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async ({ init, arg } = {}) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(r => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', r); } catch (_) {} }, URLS.join(','));
  if (init) await c.addInitScript(init, arg);
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const txt = async (p, s) => ((await p.textContent(s)) || '').trim(), as = (p, role) => p.evaluate(r => { window.__vetlock.setRole(r); window.__vetlock.openTab('keys'); }, role);
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const stored = (p, k) => p.evaluate(k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (_) { return []; } }, k);
const withStore = items => ({ init: kv => { try { for (const [k, v] of kv) if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch (_) {} }, arg: Object.entries(items) });
const importIt = async (p, role, exp) => { await as(p, role); await p.fill('#x-box', JSON.stringify(exp)); await p.click('#x-imp'); return waitText(p, '#x-out', /Imported|✗/, 15000); };

const sc = newSk(), cl = newSk(); await b.pin(C.pubOf(sc));
const campOf = (by, name) => ({ name, op: 'sterilisation', mint: 'https://mint.elsewhere.example', streetcat: by, clinic: C.pubOf(newSk()), deadline: now() + 30 * 86400 });

// ---- IMPORT ALL: an actor's records only with that actor's key ----
{ // 4.6 and 4.18: Rescue holds Streetcat's key; an export without it brings an unsigned campaign naming that key, at a mint of its
  // writer's choosing, and a request said to be confirmed
  const rescue = await page(withStore({ 'vetlock.streetcat.sk': sc }));
  const camp = { slug: 'other', c: campOf(C.pubOf(sc), 'NOT MINE') }, req = { id: 'REQ-FAKE01', q: { id: 'REQ-FAKE01', campaign: camp.c, patient: 'NUBE', procedure: 'spay', date: '2026-11-15', contributions: [] }, state: 'certified', at: new Date().toISOString() };
  const said = await importIt(rescue, 'streetcat', { data: { 'vetlock.campaigns': JSON.stringify([camp]), 'vetlock.sc.requests': JSON.stringify([req]) } });
  await rescue.waitForTimeout(1500);  /* time for the home screen to sign what it finds unsigned under a key it holds */
  const camps = await stored(rescue, 'vetlock.campaigns'), reqs = await stored(rescue, 'vetlock.sc.requests');
  check('4.6 · an export without Streetcat\'s key brings no campaign to Rescue: nothing is imported, it says why, and nothing is signed here', /^✗ This export carries Rescue's records but not Rescue's key: nothing imported\./.test(said) && !camps.some(x => x && x.c && x.c.name === 'NOT MINE'), said.slice(0, 110) + ' · ' + camps.map(x => x.c && x.c.name + (x.c.sig ? ' (signed)' : '')).join());
  check('4.18 · …nor a request said to be confirmed', !reqs.some(r => r && r.id === 'REQ-FAKE01'), reqs.map(r => r && r.id + ':' + r.state).join());
  // with a Streetcat key of its own, the export's campaigns come only if they name that key: not one naming this browser's
  const s2 = newSk(), mine = { slug: 'mine', c: campOf(C.pubOf(s2), 'ITS OWN') }, theirs = { slug: 'theirs', c: campOf(C.pubOf(sc), 'NAMES YOURS') };
  const rescue2 = await page(withStore({ 'vetlock.streetcat.sk': sc }));
  const said2 = await importIt(rescue2, 'streetcat', { streetcat: s2, data: { 'vetlock.campaigns': JSON.stringify([mine, theirs]) } });
  await rescue2.waitForTimeout(1500); const camps2 = await stored(rescue2, 'vetlock.campaigns');
  check('4.6 · an export with a Streetcat key of its own: its campaign comes, the one naming this browser\'s key does not, and it says so', camps2.some(x => x.c && x.c.name === 'ITS OWN') && !camps2.some(x => x.c && x.c.name === 'NAMES YOURS') && /1 campaign left out: not signed by a Streetcat key this export carries\./.test(said2), said2.slice(0, 200));
  await rescue.context().close(); await rescue2.context().close(); }
{ // 4.15: a refund to Lightning said to be under way for this browser's refund key, in an export that carries another refund key
  const d = newSk(), other = newSk(), keys = JSON.stringify([{ sk: d, pk: C.pubOf(d), campaign: 'MOCHI' }]);
  const donor = await page(withStore({ 'vetlock.donor.keys': keys }));
  const melt = pk => ({ id: 'm-' + pk.slice(0, 8), pk, quote: 'q-fake', mint: 'https://mint.elsewhere.example', state: 'pending', amount: 64, at: new Date().toISOString() });
  const said = await importIt(donor, 'streetcat', { donorKeys: [{ sk: other, pk: C.pubOf(other), campaign: 'OTHER' }], data: { 'vetlock.donor.melts': JSON.stringify([melt(C.pubOf(d)), melt(C.pubOf(other))]) } });
  const melts = await stored(donor, 'vetlock.donor.melts');
  check('4.15 · a refund to Lightning for this browser\'s refund key does not come with an export that lacks it, and it says so; the export\'s own does', !melts.some(m => m.pk === C.pubOf(d)) && melts.some(m => m.pk === C.pubOf(other)) && /1 refund to Lightning left out: for a refund key this export does not carry\./.test(said), said.slice(0, 200));
  await donor.context().close(); }
{ // 3.30: the partner's requests come only with the clinic's key, and without what the mint was said to have answered about their amounts
  const rec = id => ({ id, q: { id, campaign: campOf(C.pubOf(sc), 'MOCHI'), patient: 'LUNA', procedure: 'spay', date: '2026-11-15', contributions: [] }, state: 'review', at: new Date().toISOString(), amounts: { problems: [], locked: 1024, at: new Date().toISOString() } });
  const partner = await page(withStore({ 'vetlock.clinic.sk': cl }));
  const no = await importIt(partner, 'clinic', { data: { 'vetlock.clinic.requests': JSON.stringify([rec('REQ-NOKEY1')]) } });
  check('3.30 · an export without the clinic\'s key brings the partner no request: nothing imported, and it says why', /^✗ This export carries the partner's records but not the partner's key: nothing imported\./.test(no) && !(await stored(partner, 'vetlock.clinic.requests')).some(r => r.id === 'REQ-NOKEY1'), no.slice(0, 110));
  const yes = await importIt(partner, 'clinic', { clinic: cl, data: { 'vetlock.clinic.requests': JSON.stringify([rec('REQ-KEYED1')]) } });
  const got = (await stored(partner, 'vetlock.clinic.requests')).find(r => r.id === 'REQ-KEYED1');
  check('…with the clinic\'s key it comes, without the amounts it said the mint had checked (they are asked again here)', /Imported/.test(yes) && !!got && !('amounts' in got), yes.slice(0, 60) + ' · ' + JSON.stringify(got && got.amounts));
  await partner.context().close(); }

say(bad ? `daybreak3: ${bad} check(s) failed` : 'daybreak3: every check passed');
await b.close(); relays.forEach(r => r.close && r.close()); process.exit(bad ? 1 : 0);
