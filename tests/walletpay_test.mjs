// Paying from a Cashu wallet (NUT-18): group 3 of the six scans by parts (14–15 Nov: 6.3, 6.4, 6.5, 6.6, 6.11, 6.13, 6.15, 6.16,
// 6.21, 6.28, 5.22), each tried as it was found, on the real pages in Chromium: the local mints (3338 plain, 3340 the dest rule, fake
// money), two local relays and one that sends no more than 50 events for a query, as relays do; and, for two keysets, a mint of its own
// that rotates (NUTSHELL_PY, a Python with Nutshell; port 3345). What was found, and what is checked now:
// - one proof sent twice in ecash already locked was taken for more than it is worth (6.3): refused, the same ecash sent once is taken;
// - a second payment to a request already paid was kept under the first one's refund key and the first one's ecash was kept nowhere
//   (6.5): a donation of its own under a key of its own; ecash already locked with the request's key joins the first, in one token;
// - after the first payment the rest of a batch waited, and nothing looked outside the request's screen (6.11): both are taken, and the
//   app's own check takes one that comes while it shows another screen;
// - 20 failures that could pass dropped a payment for good (6.4): it is kept with its request and tried again, after any number of tries;
// - a request paid two days before stopped being read, and a request of the 30 newest could lose its key (6.15): one paid three days
//   ago still takes a payment, and 31 more do not push it out;
// - its mint's info out of reach was read as "no dest rule here" and the payment dropped (6.21): kept and tried again, then taken;
// - ecash locked with the dest rule was taken although the mint no longer said it enforced it (6.16): not taken as a donation, but kept
//   for its refund; the volunteer handed it, and Rescue pasting it, are told why and do not take it;
// - the payments were read in one query with no pages, so 60 messages to the key hid a payment (6.6, 5.22), and every check opened them
//   all again (6.13): read page by page, and what is not a payment is not opened again;
// - ecash from both keysets of a mint that had rotated was checked against one of them and dropped (6.28): taken.
// Each check fails on the code before. Not covered: real wallets, relays that time out half way, a rotation with a fee.
import { chromium } from 'playwright';
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawn, spawnSync } from 'child_process';
import { startRelay, loadKit } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', DMINT = process.env.DMINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8')); const K = loadKit(); eval(fs.readFileSync(APP + 'relay.js', 'utf8'));
const C = globalThis.scCore, R = globalThis.scRelay, amt = C.amt, sum = ps => ps.reduce((s, p) => s + amt(p.amount), 0), bytes = h => Uint8Array.from(h.match(/../g), x => parseInt(x, 16)), enc = new TextEncoder(), sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); }, errors = [];
const w = new cashu.Wallet(MINT); await w.loadMint(); const dw = new cashu.Wallet(DMINT); await dw.loadMint();
const plainAt = async (wal, n) => { const q = await wal.createMintQuoteBolt11(n); for (let i = 0; i < 60; i++) { try { return await wal.mintProofsBolt11(n, q); } catch { await sleep(300); } } throw new Error('mint quote never paid'); }, plain = n => plainAt(w, n);
const unspent = async (wal, ps) => (await wal.checkProofsStates(ps)).every(s => s.state === 'UNSPENT'), until = async (f, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(400); } return false; };
const relays = [startRelay({ port: 7361 }), startRelay({ port: 7362 })], capped = startRelay({ port: 7363, cap: 50 }); await Promise.all([...relays.map(r => r.ready), capped.ready]); const URLS = relays.map(r => r.url);
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async (rl = URLS) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }); await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, rl.join(','));
  const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(200); } return s; };
const wcheck = p => p.evaluate(() => window.__vetlock.wCheck()), reqOf = (p, id) => p.evaluate(id => window.__vetlock.wreqs().find(x => x.id === id), id), keysOf = p => p.evaluate(() => window.__vetlock.donorKeys());
const tokenOf = (mint, ps) => cashu.getEncodedToken({ mint, proofs: ps.map(p => ({ ...p, amount: amt(p.amount) })) }), lastToken = s => (String(s).match(/cashuB[A-Za-z0-9_\-=]+/g) || []).pop();
// a pending payment's next try now, not later (what the backoff would do in a while)
const tryNow = (p, id) => p.evaluate(id => { const V = window.__vetlock, x = V.wreqs().find(q => q.id === id); for (const k of Object.keys(x.pending || {})) x.pending[k].next = 0; V.saveWreq(x); }, id);
// "Pay with ecash" with this amount: the request it makes (the newest), once its screen says it waits
const openRequest = async (p, amount) => { await p.evaluate(() => { const v = window.__vetlock; if (!document.getElementById('donate').classList.contains('on')) v.openTab('donate'); const a = document.getElementById('d-again'); if (a) a.click(); });
  await p.fill('#d-amt', String(amount)); await p.evaluate(() => { document.getElementById('dw-state').textContent = ''; window.__vetlock.openTab('decash'); });
  await waitText(p, '#dw-state', /waiting for the payment|Failed|✗/); return (await p.evaluate(() => window.__vetlock.wreqs())).sort((a, b) => b.created - a.created)[0]; };
// a wallet pays it as cashu.me does: the NUT-18 payload in a NIP-17 message to the request's key, on its relays
const payTo = async (r, proofs, mint = MINT) => { const pub = K.getPublicKey(bytes(r.sk)), ev = K.wrapEvent({ kind: 14, content: JSON.stringify({ id: r.id, mint, unit: 'sat', proofs: proofs.map(p => ({ ...p, amount: amt(p.amount) })) }), tags: [['p', pub]] }, K.generateSecretKey(), pub);
  return (await R.publish(ev, r.relays)).filter(x => x.ok).length; };
const lockOf = (camp, pk) => new cashu.LockBuilder().addMainPubkey([camp.streetcat, camp.clinic]).requireMainSignatures(2).addRefundPubkey(pk).lockUntil(Number(camp.deadline)).sigAll();
const asLocked = (wal, mint, ps, lock) => wal.ops.receive(cashu.getEncodedToken({ mint, proofs: ps })).asLocked(lock).run();

// Streetcat's campaign at the plain mint, and the partner's key; the donor opens its link
const clinic = await page(); await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(900); const clinicPk = await txt(clinic, '#cs-pk');
const sc = await page(); await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(900); await tab(sc, 'campaign'); await sc.reload(); await tab(sc, 'campaign');
await sc.fill('#k-name', 'MOCHI'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk); await sc.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await sc.click('#k-go'); await waitText(sc, '#k-out', /is ready|cannot/); await sc.waitForTimeout(900);
const link = (await txt(sc, '#k-out')).match(/http\S+#c=\S+/)[0], camp = JSON.parse(Buffer.from(link.split('#c=')[1], 'base64url').toString());
const donor = await page(); await donor.goto(link); await donor.reload(); await donor.waitForTimeout(1500);

// 6.3 · one proof sent twice
{ const r = await openRequest(donor, 5), pre = await asLocked(w, MINT, await plain(5), lockOf(camp, r.pk)), twice = [...pre, pre[0]];
  await payTo(r, twice); const st = await waitText(donor, '#dw-state', /✗|LOCKED/, 30000), rr = await reqOf(donor, r.id), k = (await keysOf(donor)).find(x => x.pk === r.pk);
  check('ecash already carrying the lock, one proof sent twice: refused, and said why; the request stays open, and nothing is kept for more than it is worth', /✗ the same ecash is in it twice/.test(st) && rr.state === 'waiting' && !(k && k.lockedToken), st.slice(0, 80));
  await payTo(r, pre); const out = await waitText(donor, '#d-out', /LOCKED 5 sat|Failed/, 40000);
  check('…the same ecash sent once is taken, for what it is worth', /LOCKED 5 sat for MOCHI/.test(out)); }

// Ecash a wallet sends already locked the way of before 15 Nov (each proof signed apart): no new donation is made under that lock
{ const r = await openRequest(donor, 4), oldWay = new cashu.LockBuilder().addMainPubkey([camp.streetcat, camp.clinic]).requireMainSignatures(2).addRefundPubkey(r.pk).lockUntil(Number(camp.deadline)), pre = await asLocked(w, MINT, await plain(4), oldWay);
  await payTo(r, pre); const st = await waitText(donor, '#dw-state', /✗|LOCKED/, 30000), rr = await reqOf(donor, r.id), k = (await keysOf(donor)).find(x => x.pk === r.pk), held = k && k.lockedToken ? w.decodeToken(k.lockedToken).proofs.reduce((n, x) => n + C.amt(x.amount), 0) : 0;
  check('ecash that comes locked the way of before 15 Nov: not taken as a donation, and said why; it is kept here for its refund, and the request stays open', /locked the way of before 15 Nov/.test(st) && /not taken as a donation/.test(st) && rr.state === 'waiting' && held === 4 && !/LOCKED 4 sat/.test(await txt(donor, '#d-out')), `${st.slice(0, 90)} · kept ${held}`); }

// 6.5 · a second payment to the same request
{ const r = await openRequest(donor, 4); await payTo(r, await plain(4)); const o1 = await waitText(donor, '#d-out', /LOCKED 4 sat|Failed/, 40000), tok1 = lastToken(o1);
  await payTo(r, await plain(3)); await wcheck(donor); const o2 = await waitText(donor, '#d-out', /LOCKED 3 sat|Failed/, 40000), tok2 = lastToken(o2);
  const ks = await keysOf(donor), first = ks.find(x => x.lockedToken === tok1), second = ks.find(x => x.lockedToken === tok2);
  check('a second payment to a request already paid: a donation of its own, under a refund key of its own; the first one\'s token is still kept', /LOCKED 3 sat for MOCHI/.test(o2) && !!first && !!second && first.pk === r.pk && second.pk !== r.pk && first.amount === 4 && second.amount === 3 && /^[0-9a-f]{64}$/.test(second.sk || ''), `${ks.filter(x => x.lockedToken).length} tokens kept`);
  await donor.evaluate(pk => { const a = JSON.parse(localStorage.getItem('vetlock.donor.keys')); a.find(x => x.pk === pk).backup = { state: 'verified', at: new Date().toISOString() }; localStorage.setItem('vetlock.donor.keys', JSON.stringify(a)); }, r.pk);  /* its donor saved the first one's backup */
  const pre = await asLocked(w, MINT, await plain(2), lockOf(camp, r.pk)); await payTo(r, pre); await wcheck(donor); const o3 = await waitText(donor, '#d-out', /LOCKED 6 sat|Failed/, 40000);
  const k3 = (await keysOf(donor)).find(x => x.pk === r.pk), held = k3 && k3.lockedToken ? w.decodeToken(k3.lockedToken).proofs : [];
  check('…ecash that comes already locked with the request\'s key joins the first payment kept under that key, in one token (4 + 2 sat), and its backup is to be saved again', /LOCKED 6 sat for MOCHI/.test(o3) && k3.amount === 6 && sum(held) === 6 && pre.every(p => held.some(h => h.secret === p.secret)) && !(k3.backup && k3.backup.state), `${k3 && k3.amount} sat · backup ${k3 && k3.backup && k3.backup.state}`); }

// 6.11 · two payments together; one while the app shows another screen
{ const r = await openRequest(donor, 6), a = await plain(6), b2 = await plain(2); await payTo(r, a); await payTo(r, b2);
  check('two payments that come together are both taken', await until(async () => !(await unspent(w, a)) && !(await unspent(w, b2)), 20000));
  const c3 = await plain(3); await payTo(r, c3); const on = await donor.evaluate(() => document.querySelector('section.on').id); await donor.evaluate(() => window.__vetlock.tick());
  check('…and with the app on another screen, a payment that comes is taken at the app\'s own check (each minute while it is in front)', on !== 'decash' && await until(async () => { await donor.evaluate(() => window.__vetlock.tick()); return !(await unspent(w, c3)); }, 15000), on); }  /* the check asked again while it waits, as the app asks each minute: one asked while the two payments before were still being taken is not run (the probable cause of this check failing twice inside the whole battery and never alone; not proven) */

// 6.4 · the mint out of reach, for any number of tries
{ const r = await openRequest(donor, 7); await donor.route(MINT + '/v1/swap', rt => rt.abort()); const p = await plain(7); await payTo(r, p);
  await until(async () => { await wcheck(donor); return Object.keys((await reqOf(donor, r.id)).pending || {}).length > 0; }, 15000); const wrap = Object.keys((await reqOf(donor, r.id)).pending || {})[0];
  if (wrap) await donor.evaluate(([id, wrap]) => { const V = window.__vetlock, x = V.wreqs().find(q => q.id === id); x.pending[wrap] = { ...x.pending[wrap], n: 25, next: 0 }; V.saveWreq(x); }, [r.id, wrap]);  /* tried 25 times already (a mint out of reach for long) */
  await wcheck(donor); await donor.waitForTimeout(500); let rr = await reqOf(donor, r.id);
  check('a payment the mint is out of reach for is kept with its request and tried again after any number of tries (26 here), its message not marked as seen', !!wrap && !!(rr.pending || {})[wrap] && rr.pending[wrap].n >= 26 && !(rr.seen || []).includes(wrap) && await unspent(w, p), wrap ? `${rr.pending[wrap] && rr.pending[wrap].n} tries` : 'none kept');
  await donor.unroute(MINT + '/v1/swap'); await tryNow(donor, r.id); await wcheck(donor); const out = await waitText(donor, '#d-out', /LOCKED 7 sat|Failed/, 30000); rr = await reqOf(donor, r.id);
  check('…the mint back, it is taken, and goes from what is pending', /LOCKED 7 sat for MOCHI/.test(out) && !Object.keys(rr.pending || {}).length && !(await unspent(w, p))); }

// 6.15 · a request paid three days ago; 31 more requests paid since
{ const r = await openRequest(donor, 8); await payTo(r, await plain(8)); await waitText(donor, '#d-out', /LOCKED 8 sat|Failed/, 40000);
  await donor.evaluate(id => { const V = window.__vetlock, x = V.wreqs().find(q => q.id === id); V.saveWreq({ ...x, done: new Date(Date.now() - 3 * 86400e3).toISOString() }); }, r.id);
  await donor.reload(); await donor.waitForFunction(() => !!window.__vetlock, null, { timeout: 15000 });  /* the app opened another day */
  const p = await plain(2); await payTo(r, p); await donor.evaluate(() => window.__vetlock.tick());
  check('a request paid three days ago, its campaign still open, takes a later payment (its QR says nothing of an end)', await until(async () => { await wcheck(donor); return !(await unspent(w, p)); }, 20000));
  await donor.evaluate(c => { const V = window.__vetlock; for (let i = 0; i < 31; i++) V.saveWreq({ id: 'f' + i, sk: 'ab'.repeat(32), c, pk: '02' + '1'.repeat(64), amount: 1, state: 'done', done: new Date().toISOString(), created: Date.now(), seen: [] }); }, camp);
  check('…and 31 more requests paid since do not push out the key of one still open', !!(await reqOf(donor, r.id)));
  await donor.evaluate(() => localStorage.setItem('vetlock.walletreqs', JSON.stringify(JSON.parse(localStorage.getItem('vetlock.walletreqs')).filter(x => !/^f\d+$/.test(x.id))))); }

// the dest rule: a pot with one partner at the mint that enforces it
await tab(sc, 'home'); await sc.waitForTimeout(300); await sc.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await sc.waitForSelector('#skind.on'); await sc.click('#kd-camp'); await sc.waitForSelector('#campaign.on');
await sc.fill('#k-mint', DMINT); await sc.click('#k-par'); await sc.waitForSelector('#spick.on'); await waitText(sc, '#pp-head .title', /Choose partners/, 8000);
await sc.click('#pp-add'); await sc.fill('#pp-name', 'Clinica Sol'); await sc.fill('#pp-key', clinicPk); await sc.click('#pp-save'); await sc.waitForSelector('#pp-list button.req'); await sc.click('#pp-done'); await sc.waitForSelector('#campaign.on');
await sc.fill('#k-name', 'TNR SOL'); await sc.click('#k-go'); const madeD = await waitText(sc, '#k-out', /is ready|cannot|Failed/, 30000), linkD = (madeD.match(/http\S+#c=\S+/) || [])[0];
const campD = linkD ? JSON.parse(Buffer.from(linkD.split('#c=')[1], 'base64url').toString('utf8')) : {};
check('(a dest pot, for what follows)', campD.lock === 'dest', madeD.slice(0, 60));
const donor2 = await page(); await donor2.goto(linkD); await donor2.reload(); await donor2.waitForTimeout(1500);

// 6.21 · its mint's info out of reach while a payment comes
{ const r = await openRequest(donor2, 9); await donor2.evaluate(t => window.__vetlock.decodeTok(t), tokenOf(DMINT, await plainAt(dw, 1)));  /* the mint loaded already: only its info goes unanswered */
  await donor2.route(DMINT + '/v1/info', rt => rt.abort()); const p = await plainAt(dw, 9); await payTo(r, p, DMINT);
  await until(async () => { await wcheck(donor2); return Object.keys((await reqOf(donor2, r.id)).pending || {}).length > 0 && /did not say whether/.test(await txt(donor2, '#dw-state')); }, 15000);
  const st = await txt(donor2, '#dw-state'), rr = await reqOf(donor2, r.id), wrap = Object.keys(rr.pending || {})[0];
  check('a dest pot whose mint\'s info is out of reach while a payment comes: no "no", the payment is kept and tried again, its message not marked as seen', /did not say whether it enforces/.test(st) && /tried again by itself/.test(st) && !!wrap && !(rr.seen || []).includes(wrap) && await unspent(dw, p), st.slice(0, 100));
  await donor2.unroute(DMINT + '/v1/info'); await tryNow(donor2, r.id); await wcheck(donor2); const out = await waitText(donor2, '#d-out', /LOCKED 9 sat|Failed/, 30000);
  check('…its mint back, the payment is locked with the dest rule', /LOCKED 9 sat for TNR SOL/.test(out) && !(await unspent(dw, p))); }

// 6.16 · its mint no longer says it enforces the rule: the donor's app, a volunteer, Rescue
{ const vol = await page(), strip = async rt => { const res = await rt.fetch(), j = await res.json(); if (j.nuts && j.nuts['11']) delete j.nuts['11'].dest; return rt.fulfill({ response: res, json: j }); };
  const r = await openRequest(donor2, 10); for (const p of [donor2, vol, sc]) await p.route(DMINT + '/v1/info', strip);
  const ks = await dw.keyChain.ensureKeysetKeys(dw.keyChain.getCheapestKeyset().id), lock = { streetcat: campD.streetcat, payees: C.payeesOf(campD), deadline: Number(campD.deadline), refund: r.pk };
  const outs = [8, 2].map(a => { const s = C.destSecret(lock), bm = cashu.blindMessage(enc.encode(s)); return new cashu.OutputData({ amount: cashu.Amount.from(a), id: ks.id, B_: bm.B_.toHex(true) }, bm.r, enc.encode(s)); });
  const ins = await plainAt(dw, 10), res = await (await fetch(DMINT + '/v1/swap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inputs: ins.map(p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C })), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) }) })).json();
  const pre = outs.map((o, i) => o.toProof(res.signatures[i], ks)); await payTo(r, pre, DMINT); await wcheck(donor2);
  const st = await waitText(donor2, '#dw-state', /✗|LOCKED/, 20000), rr = await reqOf(donor2, r.id), k = (await keysOf(donor2)).find(x => x.pk === r.pk);
  check('a dest pot whose mint no longer says it enforces the rule: ecash already locked that way is not taken as a donation, and the donor is told why…', /no longer says it enforces where its donations may go/.test(st) && rr.state === 'waiting' && !/LOCKED 10 sat/.test(await txt(donor2, '#d-out')), st.slice(0, 100));
  check('…but kept for its refund (its refund key is this request\'s, held only here)', !!k && !!k.lockedToken && k.amount === 10);
  await vol.evaluate(t => window.__vetlock.openPayload(t, 'link'), await C.pack({ t: 'streetcat.handover', token: tokenOf(DMINT, pre), campaign: campD }));
  const vc = await waitText(vol, '#v-checks', /enforce/, 15000), dis = await vol.evaluate(() => document.getElementById('v-accept').disabled);
  check('a volunteer handed it is told the mint does not say it enforces where the money goes, and cannot accept it', /The mint does not say it enforces where the money goes/.test(vc) && dis, vc.slice(0, 120));
  const so = await sc.evaluate(t => window.__vetlock.openPayload(t, 'link').then(() => 'taken', e => '✗ ' + (e.message || e)), await C.pack({ t: 'streetcat.donation', token: tokenOf(DMINT, pre), campaign: campD }));
  check('…and Rescue does not count it, and says why', /^✗ .*no longer says it enforces where its donations may go/.test(so), so.slice(0, 110));
  for (const p of [donor2, vol, sc]) await p.unroute(DMINT + '/v1/info'); }

// 6.6, 5.22, 6.13 · a payment under 60 messages to the same key, at a relay that sends 50 for a query
const donor3 = await page([capped.url]); await donor3.goto(link); await donor3.reload(); await donor3.waitForTimeout(1500);
{ const r = await openRequest(donor3, 11), pub = K.getPublicKey(bytes(r.sk)), p = await plain(11), t = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 60; i++) capped.events.push(K.finalizeEvent({ kind: 1059, created_at: t + 1, tags: [['p', pub]], content: 'not a payment ' + i }, K.generateSecretKey()));  /* the flood first, newer than the payment (a wrap is dated up to two days back), so that no check takes the payment before it */
  await payTo(r, p);
  check('a payment under 60 messages to the same key, at a relay that sends 50 for a query, is read (page by page) and taken', await until(async () => { await wcheck(donor3); return !(await unspent(w, p)); }, 20000));
  const rr = await reqOf(donor3, r.id); check('…and what is not a payment is marked as seen, not opened again', (rr.seen || []).length >= 50, `${(rr.seen || []).length} marked`); }

// 6.28 · ecash from both keysets of a mint that has rotated (its own plain Nutshell, fake money)
{ const PY = process.env.NUTSHELL_PY || 'python3', PORT = 3345, RM = `http://127.0.0.1:${PORT}`, DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'walletpay-')), DB = DIR + '/db';
  const start = async dpath => { const out = fs.openSync(DIR + '/mint.log', 'a'), m = spawn(PY, ['-m', 'cashu.mint', '--port', String(PORT), '--host', '127.0.0.1'], { cwd: DIR, stdio: ['ignore', out, out],
      env: { ...process.env, PYTHONPATH: '', MINT_BACKEND_BOLT11_SAT: 'FakeWallet', FAKEWALLET_BRR: 'TRUE', MINT_PRIVATE_KEY: 'walletpay-rotation', MINT_DATABASE: DB, MINT_INPUT_FEE_PPK: '0', MINT_LISTEN_HOST: '127.0.0.1', MINT_LISTEN_PORT: String(PORT), MINT_DERIVATION_PATH: dpath } });
    for (let i = 0; i < 80; i++) { try { if ((await fetch(RM + '/v1/info')).ok) return m; } catch (_) {} await sleep(500); } m.kill(); return null; };
  const stop = m => new Promise(r => { if (!m) return r(); m.on('exit', r); m.kill('SIGTERM'); }), walletAt = async () => { const x = new cashu.Wallet(RM); await x.loadMint(); return x; };
  let m = await start("m/0'/0'/0'");
  if (!m) check('ecash from both keysets of a mint that has rotated is taken', false, `its mint did not start (NUTSHELL_PY: ${PY}; ${DIR}/mint.log)`);
  else { const sc2 = await page(); await tab(sc2, 'release'); await sc2.click('#s-new'); await sc2.waitForTimeout(900); await tab(sc2, 'campaign'); await sc2.reload(); await tab(sc2, 'campaign');
    await sc2.fill('#k-name', 'LUNA'); await sc2.fill('#k-mint', RM); await sc2.fill('#k-c', clinicPk); await sc2.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await sc2.click('#k-go'); await waitText(sc2, '#k-out', /is ready|cannot/); await sc2.waitForTimeout(900);
    const linkL = (await txt(sc2, '#k-out')).match(/http\S+#c=\S+/)[0], campL = JSON.parse(Buffer.from(linkL.split('#c=')[1], 'base64url').toString());
    const donor4 = await page(); await donor4.goto(linkL); await donor4.reload(); await donor4.waitForTimeout(1500); const r = await openRequest(donor4, 6);
    let x = await walletAt(); const L1 = await asLocked(x, RM, await plainAt(x, 4), lockOf(campL, r.pk)); await stop(m);
    { const py = `import sqlite3, glob\nfor f in glob.glob('${DB}/*.sqlite3'):\n  c = sqlite3.connect(f); c.execute("update keysets set active = 0 where id = ?", ('${L1[0].id}',)); c.commit(); c.close()`; spawnSync(PY, ['-c', py], { encoding: 'utf8' }); }
    m = await start("m/0'/0'/1'"); x = await walletAt(); const L2 = await asLocked(x, RM, await plainAt(x, 2), lockOf(campL, r.pk));
    await payTo(r, [...L1, ...L2], RM); await wcheck(donor4); const out = await waitText(donor4, '#d-out', /LOCKED|Failed/, 30000);
    check('ecash already locked, from both keysets of a mint that has rotated (the first retired), is checked against each and taken', L1[0].id !== L2[0].id && /LOCKED 6 sat for LUNA/.test(out), `${L1[0].id.slice(0, 10)}… and ${L2[0].id.slice(0, 10)}… · "${(await txt(donor4, '#dw-state')).slice(0, 80)}"`); }
  await stop(m); }

check('no page error', !errors.length, errors.slice(0, 3).join(' | '));
say(bad ? `walletpay: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'walletpay: every check passed'); await b.close(); for (const r of [...relays, capped]) await r.close(); process.exit(bad ? 1 : 0);
