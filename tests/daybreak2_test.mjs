// What the second security scan of 14 Nov (Daybreak, Codex Security; the findings recovered from a scan cut short again) found and was
// fixed, each tried the way it was found, in Chromium against the local mints (3338 plain, 3340 with the dest rule) and two local
// relays, with fake money and made-up keys. The numbers are the scan's.
// · Two taps on "lock" while the PIN's key is being made, or two changes at once: the keys stay readable with the PIN (2: every key
//   was left sealed under a key nobody could make again).
// · The partner: the request confirmed is the one tapped, though another is opened while its photos are saved (16), and nothing goes
//   wrong after a confirmation with photos; a confirmation the outbox could not take goes in at "send again" (10); Streetcat's own copy
//   of a request takes the place of a forged one opened first (12; since 17 Nov nothing is signed about a forged copy, a report neither).
// · Rescue: of a confirmation and a report, the one signed last stands, and once released the confirmation stays (11); a cat record's
//   number signed by another clinic key does not take the record's place (14).
// · The volunteer: a donation handed over under a campaign Streetcat did not sign is "Do not accept it" (7).
// · Donating to a pot under `dest`: the mint is asked at each donation whether it enforces the rule, not once per page (8).
// · The status page: a ledger too big to be one of Streetcat's is not read, and says so in red (4).
// In other suites: relay_test (13, 15: relays that cap a whole REQ, and floods longer than the pages), deststatus_test (1: a payment
// counted once; 6: signatures with spaces, as the mint reads them), handover_test (17: its camera file in a folder of its own).
import { chromium } from 'playwright';
import fs from 'fs';
import { startRelay, loadKit } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', DMINT = process.env.DMINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8')); loadKit(); eval(fs.readFileSync(APP + 'relay.js', 'utf8'));
const C = globalThis.scCore, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async (n, wl = w) => { const q = await wl.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await wl.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7493 }), startRelay({ port: 7494 })]; await Promise.all(relays.map(r => r.ready)); const URLS = relays.map(r => r.url);
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async ({ init, arg, path = 'index.html' } = {}) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(r => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', r); } catch (_) {} }, URLS.join(','));
  if (init) await c.addInitScript(init, arg);
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + path); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const isRed = (p, s) => p.$eval(s, e => e.classList.contains('bad'));
const hashOf = link => link.slice(link.indexOf('#')), open = (p, text) => p.evaluate(t => window.__vetlock.openPayload(t, 'link').then(() => 'ok', e => '✗ ' + (e.message || e)), text);
const withKey = (slot, sk) => ({ init: ([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch (_) {} }, arg: [slot, sk] });

// Streetcat's key and a clinic's, made here; a campaign at the plain mint for the clinic, and one for a shop with the same keys
const sc = newSk(), cl = newSk(); await b.pin(C.pubOf(sc));
const deadline = Math.floor(Date.now() / 1000) + 30 * 86400, today = new Date().toISOString().slice(0, 10), T = h => `${today}T${h}:00:00.000Z`;
const camp = await C.signCampaign({ name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline }, sc);
const shop = await C.signCampaign({ name: 'PIENSO SUR', op: '20 kg dry feed', type: 'food', pkind: 'shop', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline }, sc);
const lockOf = refundPk => new cashu.LockBuilder().addMainPubkey([camp.streetcat, camp.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(deadline);
const donated = async n => w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: await plain(n) })).asLocked(lockOf(C.pubOf(newSk()))).run();
const request = async (c, patient, n) => C.signRequest(await C.makeRequest({ campaign: c, patient, procedure: c === shop ? 'delivery' : 'spay', date: today, contributions: [{ release: n, proofs: await donated(n) }] }), sc);
const linkOf = async q => hashOf(await C.linkFor(BASE + 'index.html?role=clinic', q));

// ---- 2 · THE PIN, SET TWICE AT ONCE ----
{ const p = await page(withKey('vetlock.streetcat.sk', sc)); await p.evaluate(() => { window.__vetlock.setRole('streetcat'); window.__vetlock.openTab('keys'); });
  const r = await p.evaluate(async () => { const pin = 'cats-of-the-marina', a = document.getElementById('x-pin-a'), bb = document.getElementById('x-pin-b'), go = document.getElementById('x-pin-set'); a.value = bb.value = pin;
    go.click(); go.click();  /* two taps, the second while the first is still making the PIN's key */
    for (let i = 0; i < 150 && !(window.scVault.on() && /Keys locked|✗/.test(document.getElementById('x-pin-out').textContent)); i++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 2500)); window.scVault.lock(); const ok = await window.scVault.unlock(pin); return { ok, key: window.scVault.read('vetlock.streetcat.sk'), out: document.getElementById('x-pin-out').textContent }; });
  check('2 · two taps on "lock" while the PIN\'s key is being made: the PIN opens, and the keys are read with it', r.ok && r.key === sc, `${r.ok ? 'opens' : 'does not open'} · ${r.key === sc ? 'key read' : 'key unreadable'} · ${r.out}`);
  const q = await page(withKey('vetlock.streetcat.sk', sc));
  const s = await q.evaluate(async () => { const pin = 'cats-of-the-marina', got = await Promise.allSettled([window.scVault.set(pin), window.scVault.set(pin)]);
    window.scVault.lock(); const ok = await window.scVault.unlock(pin); return { got: got.map(x => x.status + (x.reason ? ': ' + x.reason.message : '')), ok, key: window.scVault.read('vetlock.streetcat.sk') }; });
  check('…and two changes asked at once: the second is refused, and the keys are read with the PIN', s.ok && s.key === sc && s.got[0] === 'fulfilled' && /being changed already/.test(s.got[1]), JSON.stringify(s.got) + ` · ${s.key === sc ? 'key read' : 'key unreadable'}`);
  await Promise.all([p, q].map(x => x.context().close())); }

// ---- THE PARTNER (16, 10, 12) ----
{ const p = await page(withKey('vetlock.clinic.sk', cl)); await p.evaluate(() => window.__vetlock.setRole('clinic'));
  const creq = id => p.evaluate(id => window.__vetlock.creqs().find(r => r.id === id) || null, id), checked = () => p.waitForFunction(() => !document.getElementById('cr-ok').disabled, null, { timeout: 30000 }).then(() => true, () => false);
  const answered = id => p.waitForFunction(id => { const r = window.__vetlock.creqs().find(x => x.id === id); return r && r.answer; }, id, { timeout: 20000 }).catch(() => {});
  const jpeg = Buffer.from(await p.evaluate(async () => { const cv = new OffscreenCanvas(320, 240), g = cv.getContext('2d'); g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#222'; for (let i = 0; i < 6; i++) g.fillRect(20, 30 + i * 30, 120 + (i * 41) % 150, 8);
    const a = new Uint8Array(await (await cv.convertToBlob({ type: 'image/jpeg', quality: .9 })).arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s); }), 'base64');
  const photo = async () => { await p.click('#cr-shots-open'); await p.waitForSelector('#cr-shots-box.sub'); const slot = C.ANS_SLOTS[0];
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(`#cr-shots .shot[data-slot="${slot}"]`)]); await fc.setFiles({ name: 'IMG_1.JPG', mimeType: 'image/jpeg', buffer: jpeg });
    await p.waitForSelector(`#cr-shots .shot[data-slot="${slot}"].has`, { timeout: 30000 }); await p.click('#cr-shots-done'); await p.waitForFunction(() => !document.querySelector('#cr-shots-box').classList.contains('sub')); };
  // a delivery confirmed with its photo: nothing goes wrong after it (the page named a request that was not there, and said so in red)
  const q0 = await request(shop, 'colony Marina', 16); await open(p, await linkOf(q0)); await p.waitForSelector('#creq.on'); const ok0 = await checked(); await photo();
  await p.evaluate(() => { window.__flash = ''; new MutationObserver(() => { const t = document.getElementById('cr-out').textContent; if (/is not defined|Failed/.test(t)) window.__flash = t.slice(0, 80); }).observe(document.getElementById('cr-out'), { childList: true, subtree: true, characterData: true }); });  /* anything said in its box, even for a moment */
  await p.check('#cr-ok'); await p.click('#cr-go'); await answered(q0.id); const out0 = await waitText(p, '#cr-out', /1 photo|not defined|Failed/, 15000), r0 = await creq(q0.id); await p.waitForTimeout(1500); const flash = await p.evaluate(() => window.__flash);
  check('16 · a delivery confirmed with its photo: it is confirmed, its box says so, and nothing goes wrong after it', ok0 && !!r0 && !!r0.answer && r0.answer.kind === 'certified' && /delivery confirmed/.test(out0) && /1 photo/.test(out0) && !flash, `${r0 && r0.state} · ${flash ? 'said: ' + flash : out0.replace(/\s+/g, ' ').slice(0, 70)}`);  /* it named a request that was not there after it, and said so in red for a moment */
  // two requests: the first is confirmed, and the second opened while its photo is saved
  const qa = await request(shop, 'colony Norte', 21), qb = await request(shop, 'colony Sur', 34);
  await open(p, await linkOf(qb)); await open(p, await linkOf(qa)); await p.waitForSelector('#creq.on'); await checked(); await photo(); await p.check('#cr-ok');
  await p.evaluate(() => { const d = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete'); window.__slow = 2500;  /* IndexedDB slow to say it kept the photo */
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', { configurable: true, get() { return d.get.call(this); }, set(f) { const ms = window.__slow; d.set.call(this, f && ms ? function (e) { setTimeout(() => f.call(this, e), ms); } : f); } }); });
  await p.click('#cr-go'); await p.waitForTimeout(400); await p.evaluate(() => { window.__slow = 0; }); await open(p, await linkOf(qb));  /* the other request, opened meanwhile */
  await answered(qa.id); await p.waitForTimeout(1500);
  const ra = await creq(qa.id), rb = await creq(qb.id);
  check('16 · the request confirmed is the one tapped, though another was opened while its photo was saved; the other is still to review', !!ra && !!ra.answer && ra.answer.statement.request === qa.id && !!rb && !rb.answer && rb.state === 'review', `tapped: ${ra && ra.state} · opened meanwhile: ${rb && rb.state}${rb && rb.answer ? ' (confirmed!)' : ''}`);
  // 10 · the outbox cannot take the confirmation (no room): "send again" puts it in
  const qd = await request(camp, 'LUNA', 64); await open(p, await linkOf(qd)); await p.waitForSelector('#creq.on'); await checked();
  await p.evaluate(() => { const set = Storage.prototype.setItem; window.__set = set; Storage.prototype.setItem = function (k, v) { if (k === 'vetlock.outbox') throw new DOMException('no room', 'QuotaExceededError'); return set.call(this, k, v); }; });
  await p.check('#cr-ok'); await p.click('#cr-go'); const e10 = await waitText(p, '#cr-out', /no room|✗/, 20000);
  await p.evaluate(() => { Storage.prototype.setItem = window.__set; }); const inBox = id => p.evaluate(id => window.__vetlock.outbox().filter(x => x.label === 'answer ' + id).map(x => x.state), id), before = await inBox(qd.id);
  await open(p, await linkOf(qd)); await p.waitForSelector('#creq.on'); const again = p.locator('#cr-out button', { hasText: 'send again' });
  const shown = await again.count() > 0; if (shown) { await again.first().click(); await p.waitForTimeout(2500); }
  const box = await inBox(qd.id), rd = await creq(qd.id);
  check('10 · a confirmation the outbox could not take (no room) goes in when "send again" is tapped, and is sent', /no room/.test(e10) && !before.length && shown && box.length === 1 && !!rd.outbox && box[0] === 'sent', `${e10.slice(0, 60)} · "send again" ${shown ? 'there' : 'missing'} · outbox: ${box.join() || 'none'}`);
  // 12 · a forged copy of a request opened first; a report about it is not signed (six scans, 3.7, 17 Nov: before, it was); then Streetcat's own
  const qg = await request(camp, 'NUBE', 32), forged = { ...qg, patient: 'TIGRE' };
  await open(p, await linkOf(forged)); await p.waitForSelector('#creq.on');
  await p.evaluate(() => { document.querySelector('#cr-why button[data-r="wrong-data"]').click(); document.getElementById('cr-report').click(); });
  await p.waitForFunction(id => { const r = window.__vetlock.creqs().find(x => x.id === id); return r && r.state === 'reported'; }, qg.id, { timeout: 2500 }).catch(() => {});
  const was = await creq(qg.id); await open(p, await linkOf(qg)); await p.waitForTimeout(800); const now = await creq(qg.id);
  check('12 · a forged copy opened first, which cannot be reported, gives way to Streetcat\'s own: to review, as Streetcat wrote it', !!was && was.state === 'review' && !was.answer && was.q.patient === 'TIGRE' && (was.unsigned || []).length > 0 && !!now && now.state === 'review' && now.q.patient === 'NUBE' && !(now.unsigned || []).length, `${was && was.state} → ${now && now.state} · ${now && now.q.patient}`);
  await p.context().close(); }

// ---- RESCUE (11, 14) ----
{ const at = new Date().toISOString(), qs = await request(camp, 'LUNA', 16), qt = await request(camp, 'KIRA', 16);
  const p = await page({ init: ([sk, reqs]) => { try { if (!localStorage.getItem('vetlock.streetcat.sk')) { localStorage.setItem('vetlock.streetcat.sk', sk); localStorage.setItem('vetlock.sc.requests', reqs); } } catch (_) {} }, arg: [sc, JSON.stringify([qs, qt].map(q => ({ id: q.id, q, state: 'sent', at })))] });
  await p.evaluate(() => window.__vetlock.setRole('streetcat')); const sreq = id => p.evaluate(id => window.__vetlock.sreqs().find(r => r.id === id) || null, id);
  const answer = async a => open(p, hashOf(await C.linkFor(BASE + 'index.html?role=streetcat', a)));
  await answer(await C.certify(qs, cl, T('10'))); await answer(await C.report(qs, cl, 'postponed', '', T('09')));  /* signed before it, brought after it */
  let r = await sreq(qs.id); check('11 · a report signed before the confirmation, and brought after it, does not take its place', r.state === 'certified' && r.answer.kind === 'certified', `${r.state} · ${r.answer && r.answer.kind}`);
  await answer(await C.certify(qt, cl, T('10'))); await answer(await C.report(qt, cl, 'postponed', 'the cat was not found', T('11')));
  r = await sreq(qt.id); check('…one signed after it does: the partner changed its mind before the release', r.state === 'reported' && r.answer.kind === 'report', `${r.state} · ${r.answer && r.answer.kind}`);
  await p.evaluate(id => { const a = JSON.parse(localStorage.getItem('vetlock.sc.requests')); for (const x of a) if (x.id === id) x.state = 'released'; localStorage.setItem('vetlock.sc.requests', JSON.stringify(a)); }, qs.id);
  await answer(await C.report(qs, cl, 'other', 'after the release', T('12')));
  r = await sreq(qs.id); check('…and once released, a report does not take the confirmation it was released on: it stays for the ledger', r.state === 'released' && r.answer.kind === 'certified', `${r.state} · ${r.answer && r.answer.kind}`);
  // 14 · a cat record, and another clinic key's record under its number
  const cl2 = newSk(), shot = { slot: 'face', sha256: 'cd'.repeat(32), bytes: 1000, w: 100, h: 100 };
  const recA = await C.signCat({ name: 'LUNA', procedure: 'spay', date: today, photos: [shot] }, cl, { signed: T('10') }), recB = await C.signCat({ name: 'TIGRE', procedure: 'spay', date: today, photos: [shot] }, cl2, { id: recA.id, signed: T('11') });
  const o1 = await open(p, await C.pack(recA)), o2 = await open(p, await C.pack(recB)), held = await p.evaluate(id => (window.__vetlock.scats().find(x => x.id === id) || {}).rec || null, recA.id);
  check('14 · a record under the same number, signed by another clinic key, does not take the record\'s place, and it says why', o1 === 'ok' && /signed by another clinic key/.test(o2) && !!held && held.statement.name === 'LUNA' && held.statement.clinic === C.pubOf(cl), `${o2.slice(0, 90)} · held: ${held && held.statement.name}`);
  await p.context().close(); }

// ---- 7 · THE VOLUNTEER: A CAMPAIGN STREETCAT DID NOT SIGN ----
{ const v = await page({ path: 'index.html?role=streetcat' }), token = async () => cashu.getEncodedToken({ mint: MINT, proofs: await donated(21), memo: 'MOCHI sterilisation' });
  const hand = async campaign => hashOf(await C.linkFor(BASE + 'index.html?role=streetcat', { t: 'streetcat.handover', v: 1, campaign, token: await token() }));
  const look = async link => { await open(v, link); return { out: await waitText(v, '#v-out', /accept|Received|Failed/, 30000), checks: await txt(v, '#v-checks'), off: await v.$eval('#v-accept', e => e.disabled) }; };
  const u = await look(await hand(C.campaignOf(camp)));
  check('7 · a donation handed over under a campaign Streetcat did not sign (its key, a partner key): "Do not accept it", and why', /^Do not accept it\./.test(u.out) && /The campaign is not signed by Streetcat/.test(u.checks) && u.off, `${u.out.slice(0, 40)} · ${(u.checks.match(/The campaign[^·\n]*/) || [''])[0]}`);
  const s = await look(await hand({ ...C.campSigned(camp), sig: camp.sig }));
  check('…the same, with Streetcat\'s signature on the campaign: it can be accepted', /^Received/.test(s.out) && !s.off, s.out.slice(0, 60));
  await v.context().close(); }

// ---- 8 · A POT UNDER `dest`: THE MINT ASKED AT EACH DONATION ----
{ const info = await (await fetch(DMINT + '/v1/info')).json();
  if (!C.destMint(info)) check(`8 · needs the patched mint at ${DMINT}`, false);
  else { const dw = new cashu.Wallet(DMINT); await dw.loadMint(); const dcamp = await C.signCampaign({ name: 'SOL', op: 'sterilisation', mint: DMINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), lock: 'dest', deadline }, sc);
    const d = await page(), give = async () => { await tab(d, 'decash'); await d.waitForSelector('#d-token', { state: 'visible', timeout: 15000 }); await d.evaluate(() => { for (const id of ['d-out', 'de-out']) document.getElementById(id).textContent = ''; }); await d.fill('#d-token', cashu.getEncodedToken({ mint: DMINT, proofs: await plain(200, dw) })); await d.click('#d-go');
      for (let i = 0; i < 200; i++) { const t = await d.evaluate(() => ['d-out', 'de-out'].map(id => document.getElementById(id).textContent.trim()).join(' | ')); if (/LOCKED|✗|Failed/.test(t)) return t; await d.waitForTimeout(200); } return ''; };  /* the donation, or why not (under the box) */
    await d.goto(BASE + 'index.html#c=' + Buffer.from(JSON.stringify(dcamp)).toString('base64url')); await d.reload(); await d.waitForTimeout(1500);
    const first = await give(); const noRule = JSON.parse(JSON.stringify(info)); noRule.nuts['11'].dest = []; await d.route(DMINT + '/v1/info', r => r.fulfill({ json: noRule }));  /* the mint stops saying it enforces the rule */
    const second = await give();
    check('8 · a page that gave to a pot under `dest` asks the mint again at the next donation: one that stopped saying it enforces the rule is not given to', /LOCKED/.test(first) && /needs a mint that enforces where its donations may go/.test(second) && !/LOCKED/.test(second), `${first.slice(0, 30)} · then ${second.replace(/\s+/g, ' ').slice(0, 80)}`);
    await d.context().close(); } }

// ---- 4 · THE STATUS PAGE: A LEDGER TOO BIG TO BE STREETCAT'S ----
{ const v = await page({ path: 'status.html' }), c = { name: camp.name, op: camp.op, mint: MINT, streetcat: camp.streetcat, clinic: camp.clinic, deadline };
  const ledgers = { many: JSON.stringify({ campaign: c, donations: Array.from({ length: 3001 }, (_, i) => 'cashuB' + i) }), huge: JSON.stringify({ campaign: c, donations: ['cashuB' + 'x'.repeat(4.2e6)] }) };
  await v.route('**/big/*.json', r => r.fulfill({ body: ledgers[r.request().url().split('/').pop().replace('.json', '')], contentType: 'application/json' }));
  const look = async name => { await v.goto(BASE + `status.html?l=big/${name}.json`); return waitText(v, '#l-out', /Checked|Failed|✗|not read/, 60000); };
  const many = await look('many'), manyRed = await isRed(v, '#l-out'), huge = await look('huge'), hugeRed = await isRed(v, '#l-out');
  check('4 · a ledger listing more donations than one of Streetcat\'s can hold is not read, and that is said in red', /more than 3000 donations/.test(many) && manyRed, many.slice(0, 100));
  check('…nor one too big, in megabytes', /4\.2 MB: too big to be one of Streetcat's/.test(huge) && hugeRed, huge.slice(0, 100));
  await v.context().close(); }

await b.close(); await Promise.all(relays.map(r => r.close()));
say(bad ? `daybreak2: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'daybreak2: every check passed'); process.exit(bad ? 1 : 0);
