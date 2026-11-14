// What the security scan of 14 Nov (Daybreak, Codex Security; the findings recovered from a scan cut short) found and was fixed, each
// tried the way it was found, in Chromium against the local mints (3338 plain, 3340 with the dest rule) and two local relays, with fake
// money and made-up keys:
// · Import all takes no Lightning address (C02: payments went to the one an export carried); a request waiting for review is checked for
//   Streetcat's signature (C03), and a cat record for its clinic's (M48); it says "✗" when the phone kept none of the refund keys (H16).
//   Export all no longer carries the Lightning address.
// · Donating with Lightning: the pending invoice holds no private key (H05), and one of before gives it up; the invoice goes only once
//   its donation is kept: a phone with no room says so in red and finishes it when the app opens again (H14).
// · Ecash pasted to give: the mint does the swap and answers with an error; the donation is kept, not lost (H07).
// · Paying from a Cashu wallet: a payment that fails for a moment (the mint out of reach) is taken at the next check (H10); a second
//   payment to a request already paid is locked too (H11).
// · A release under `dest` whose ledger write fails says so and is not called done; released again, it writes the ledger, paying
//   nothing twice (H15).
import { chromium } from 'playwright';
import fs from 'fs';
import { startRelay, loadKit } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', DMINT = process.env.DMINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8')); const K = loadKit(); eval(fs.readFileSync(APP + 'relay.js', 'utf8'));
const C = globalThis.scCore, R = globalThis.scRelay, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async (n, wl = w) => { const q = await wl.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await wl.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7491 }), startRelay({ port: 7492 })]; await Promise.all(relays.map(r => r.ready)); const URLS = relays.map(r => r.url);
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async ({ init, arg } = {}) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await c.addInitScript(r => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', r); } catch (_) {} }, URLS.join(','));
  if (init) await c.addInitScript(init, arg);
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), as = (p, role) => p.evaluate(r => { window.__vetlock.setRole(r); window.__vetlock.openTab('keys'); }, role), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const isRed = (p, s) => p.$eval(s, e => e.classList.contains('bad'));
const blockWrites = (p, key) => p.evaluate(k => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (a, v) { if (a === k) throw new DOMException('no room', 'QuotaExceededError'); return set.call(this, a, v); }; }, key);  /* the phone's storage refuses this one key */

// Streetcat's key and a clinic key, made here; a campaign at the plain mint, signed, and its link
const sc = newSk(), cl = newSk(); await b.pin(C.pubOf(sc));
const camp = await C.signCampaign({ name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline: Math.floor(Date.now() / 1000) + 30 * 86400 }, sc);
const link = BASE + 'index.html#c=' + Buffer.from(JSON.stringify(camp)).toString('base64url'), today = new Date().toISOString().slice(0, 10);
const lockOf = refundPk => new cashu.LockBuilder().addMainPubkey([camp.streetcat, camp.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(Number(camp.deadline));
const donated = async n => w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: await plain(n) })).asLocked(lockOf(C.pubOf(newSk()))).run();

// ---- IMPORT ALL (C02, C03, M48, H16) ----
{ const q1 = await C.makeRequest({ campaign: camp, patient: 'LUNA', procedure: 'spay', date: today, contributions: [{ release: 64, proofs: await donated(64) }] });
  const q2 = await C.signRequest(await C.makeRequest({ campaign: camp, patient: 'NUBE', procedure: 'spay', date: today, contributions: [{ release: 32, proofs: await donated(32) }] }), sc);
  const at = new Date().toISOString(), recs = [{ id: q1.id, q: q1, from: 'relay', at, state: 'review' }, { id: q2.id, q: q2, from: 'relay', at, state: 'review' }];  /* both say they came by relay: an export can say anything */
  const shot = { slot: 'face', sha256: 'ab'.repeat(32), bytes: 1000, w: 100, h: 100 }, good = await C.signCat({ name: 'LUNA', procedure: 'spay', date: today, photos: [shot] }, cl), forged = await C.signCat({ name: 'NUBE', procedure: 'spay', date: today, photos: [shot] }, cl);
  forged.statement = { ...forged.statement, name: 'TIGRE' };  /* changed after it was signed */
  const cat = r => ({ id: r.id, rec: r, from: r.statement.clinic, at, via: 'file' });
  const exp = { clinic: cl, clinicOld: [], data: { 'vetlock.clinic.payto': 'thief@evil.example', 'vetlock.clinic.requests': JSON.stringify(recs), 'vetlock.clinic.cats': JSON.stringify([cat(good), cat(forged)]) } };
  const partner = await page(); await as(partner, 'clinic'); await partner.fill('#x-box', JSON.stringify(exp)); await partner.click('#x-imp'); const imp = await waitText(partner, '#x-out', /Imported|✗/, 15000);
  check('C02 · Import all takes no Lightning address: it says so, in red, and the browser has none', /^⚠ Imported, as the partner\./.test(imp) && /Its Lightning address is not imported: set yours here\./.test(imp) && await isRed(partner, '#x-out') && (await partner.evaluate(() => localStorage.getItem('vetlock.clinic.payto'))) === null, imp.slice(0, 120));
  const got = await partner.evaluate(() => window.__vetlock.creqs().map(r => ({ id: r.id, unsigned: r.unsigned || null }))), u1 = got.find(r => r.id === q1.id), u2 = got.find(r => r.id === q2.id);
  check('C03 · a request waiting for review that Streetcat did not sign cannot be confirmed after Import all, though the export says it came by relay; the one Streetcat signed can', !!u1 && !!u1.unsigned && /not signed by Streetcat/.test(u1.unsigned[0]) && !!u2 && !u2.unsigned, JSON.stringify(got));
  await tab(partner, 'work'); await partner.waitForTimeout(300); if (!(await partner.$eval('#w-pend', e => e.classList.contains('on')))) await partner.click('#w-pend'); await partner.waitForTimeout(300);
  await partner.waitForFunction(ids => { const t = [...document.querySelectorAll('#w-list .item')].map(x => x.textContent).join('\n'); return ids.every(id => t.includes(id)); }, [q1.id, q2.id], { timeout: 15000 }).catch(() => {});  /* the list types itself in */
  const items = await partner.$$eval('#w-list .item', xs => xs.map(x => x.textContent));
  check('…its line in the partner\'s list says "✗ not valid", the other\'s does not', items.some(t => t.includes(q1.id) && /✗ not valid/.test(t)) && items.some(t => t.includes(q2.id) && !/not valid/.test(t)), items.join(' | ').slice(0, 160));
  const cats = await partner.evaluate(() => window.__vetlock.ccats().map(x => x.id));
  check('M48 · a cat record not signed by the clinic key it names is left out, and the import says so; the signed one comes', cats.includes(good.id) && !cats.includes(forged.id) && /1 cat record left out: not signed by the clinic key it names\./.test(imp), cats.join());
  await partner.evaluate(() => localStorage.setItem('vetlock.clinic.payto', 'clinic@shop.example')); await as(partner, 'clinic'); await partner.click('#x-exp'); await waitText(partner, '#x-term', /in your clipboard|✗/, 20000);
  const out = JSON.parse(await partner.evaluate(() => navigator.clipboard.readText()));
  check('…and Export all no longer carries the Lightning address', !('vetlock.clinic.payto' in (out.data || {})) && out.clinic === cl, Object.keys(out.data || {}).join());
  // H16: the refund keys, with a phone that refuses to keep them
  const rescue = await page(), refund = newSk(), exp2 = { donorKeys: [{ sk: refund, pk: C.pubOf(refund), campaign: 'MOCHI' }] };
  await as(rescue, 'streetcat'); await blockWrites(rescue, 'vetlock.donor.keys'); await rescue.fill('#x-box', JSON.stringify(exp2)); await rescue.click('#x-imp'); const no = await waitText(rescue, '#x-out', /Imported|✗/, 15000);
  check('H16 · a phone that keeps none of the refund keys does not say "Imported": "✗ This browser could not save everything"', /^✗ This browser could not save everything/.test(no) && !(await rescue.evaluate(() => window.__vetlock.donorKeys().length)), no.slice(0, 90));
  await rescue.reload(); await as(rescue, 'streetcat'); await rescue.fill('#x-box', JSON.stringify(exp2)); await rescue.click('#x-imp'); const yes = await waitText(rescue, '#x-out', /Imported|✗/, 15000);
  check('…with room, the same export is imported, and the key is there', /^Imported, as Rescue\./.test(yes) && (await rescue.evaluate(pk => window.__vetlock.donorKeys().some(k => k.pk === pk && !!k.sk), C.pubOf(refund))), yes.slice(0, 60));
  await partner.context().close(); await rescue.context().close(); }

// ---- DONATING WITH LIGHTNING (H05, H14) ----
{ const lsk = newSk(), legacy = { quote: 'legacy-' + hex(crypto.getRandomValues(new Uint8Array(6))), request: 'lnbcrt1legacy', amount: 5, expiry: null, campaign: camp, pk: C.pubOf(lsk), sk: lsk, created: new Date().toISOString() };
  const donor = await page({ init: p => { try { if (!localStorage.getItem('test.seeded')) { localStorage.setItem('vetlock.pending', JSON.stringify([p])); localStorage.setItem('test.seeded', '1'); } } catch (_) {} }, arg: legacy });
  await donor.reload(); const was = await donor.evaluate(q => window.__vetlock.pendings().find(x => x.quote === q) || null, legacy.quote);
  const kept = await donor.evaluate(pk => window.__vetlock.donorKeys().some(k => k.pk === pk && !!k.sk), legacy.pk);
  check('H05 · a pending invoice of before gives up its refund key, once the list of refund keys (which a PIN seals) holds it', !!was && !('sk' in was) && was.pk === legacy.pk && kept, JSON.stringify(was && Object.keys(was)));
  await donor.evaluate(q => localStorage.setItem('vetlock.pending', JSON.stringify(window.__vetlock.pendings().filter(x => x.quote !== q))), legacy.quote);
  let slow = true; await donor.route('**/v1/mint/quote/bolt11/*', async r => { if (slow && r.request().method() === 'GET') await new Promise(res => setTimeout(res, 2500)); return r.continue(); });  /* the mint says "paid" a little later: time to look */
  await donor.goto(link); await donor.reload(); await donor.fill('#d-amt', '21'); await donor.click('#d-ln'); await waitText(donor, '#d-st', /waiting for the payment/, 30000);
  const p = await donor.evaluate(() => window.__vetlock.pendings()[0] || null), hasKey = p && await donor.evaluate(pk => window.__vetlock.donorKeys().some(k => k.pk === pk && !!k.sk), p.pk);
  check('H05 · a new pending invoice holds no private key: its refund key is in the list of refund keys', !!p && !('sk' in p) && /^0[23][0-9a-f]{64}$/.test(p.pk) && hasKey, JSON.stringify(p && Object.keys(p)));
  await blockWrites(donor, 'vetlock.donor.keys');  /* the phone fills up while the invoice is being paid */
  const l1 = await waitText(donor, '#d-out', /LOCKED|Failed|expired/, 60000), still = await donor.evaluate(q => window.__vetlock.pendings().some(x => x.quote === q), p.quote);
  const redLine = await donor.evaluate(() => { const d = [...document.querySelectorAll('#d-out div')].find(x => /No room in this browser/.test(x.textContent) && !x.children.length); return !!d && d.classList.contains('bad'); });
  check('H14 · paid, with no room to keep the donation: it is shown with a red line that says so, and the invoice is kept to finish it', /LOCKED 21 sat/.test(l1) && /✗ No room in this browser to keep this donation: save the receipt below now/.test(l1) && redLine && still, l1.split('\n').slice(0, 2).join(' / '));
  slow = false; await donor.reload(); const l2 = await waitText(donor, '#d-out', /LOCKED|Failed|stuck/, 60000);
  const after = await donor.evaluate(([q, pk]) => ({ pending: window.__vetlock.pendings().some(x => x.quote === q), token: (window.__vetlock.donorKeys().find(k => k.pk === pk) || {}).lockedToken || '' }), [p.quote, p.pk]);
  check('…opened again with room, it is finished: the donation is kept with its refund key, and only then the invoice goes', /LOCKED 21 sat/.test(l2) && !/No room/.test(l2) && !after.pending && /^cashuB/.test(after.token), JSON.stringify({ pending: after.pending, token: after.token.slice(0, 12) }));
  await donor.context().close(); }

// ---- ECASH PASTED: THE MINT DOES THE SWAP, AND ANSWERS WITH AN ERROR (H07) ----
{ const donor = await page(); await donor.goto(link); await donor.reload(); await donor.waitForTimeout(800); await donor.fill('#d-amt', '7'); await tab(donor, 'decash'); await waitText(donor, '#dw-state', /waiting for the payment|✗/, 20000);
  let err = 1; await donor.route('**/v1/swap', async r => { if (err-- > 0) { await r.fetch(); return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ detail: 'the answer was lost on the way', code: 11111 }) }); } return r.continue(); });
  const p7 = await plain(7); await donor.fill('#d-token', cashu.getEncodedToken({ mint: MINT, proofs: p7 })); await donor.click('#d-go');
  const o = await waitText(donor, '#d-out', /LOCKED|Failed|refused/, 40000), de = await txt(donor, '#de-out'), fl = await donor.evaluate(() => window.__vetlock.flights().length);
  check('H07 · the mint did the swap and answered with an error: the page asks the mint, gets the result back, and the donation is locked, not lost', /LOCKED 7 sat for MOCHI/.test(o) && !/refused/.test(de) && fl === 0 && (await w.checkProofsStates(p7)).every(s => s.state === 'SPENT'), (o.split('\n')[0] || de).slice(0, 90));
  await donor.context().close(); }

// ---- PAYING FROM A CASHU WALLET (H10, H11) ----
{ const donor = await page(); await donor.goto(link); await donor.reload(); await donor.waitForTimeout(800);
  const openRequest = async amount => { await donor.evaluate(() => { const v = window.__vetlock; if (!document.getElementById('donate').classList.contains('on')) v.openTab('donate'); const a = document.getElementById('d-again'); if (a) a.click(); }); await donor.fill('#d-amt', String(amount)); await donor.evaluate(() => { document.getElementById('dw-state').textContent = ''; window.__vetlock.openTab('decash'); });
    await waitText(donor, '#dw-state', /waiting for the payment|Failed|✗/); await donor.click('#dw-copy'); await donor.waitForTimeout(200); return cashu.PaymentRequest.fromEncodedRequest(await donor.evaluate(() => navigator.clipboard.readText())); };
  const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', unbech = s => { const d = s.slice(s.lastIndexOf('1') + 1, -6).split('').map(c => B32.indexOf(c)), out = []; let acc = 0, bits = 0; for (const v of d) { acc = ((acc << 5) | v) & 0xffff; bits += 5; if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); } } return out; };
  const readProfile = s => { const x = unbech(s), o = { relays: [] }; for (let i = 0; i < x.length;) { const t = x[i], l = x[i + 1], v = x.slice(i + 2, i + 2 + l); if (t === 0) o.pubkey = hex(v); if (t === 1) o.relays.push(String.fromCharCode(...v)); i += 2 + l; } return o; };
  const pay = async (req, proofs) => { const to = readProfile(req.transport[0].target), ev = K.wrapEvent({ kind: 14, content: JSON.stringify({ id: req.id, mint: MINT, unit: 'sat', proofs: proofs.map(x => ({ ...x, amount: C.amt(x.amount) })) }), tags: [['p', to.pubkey]] }, K.generateSecretKey(), to.pubkey);
    await R.publish(ev, to.relays); return ev.id; };
  const pr = await openRequest(13), off = MINT + '/v1/**'; await donor.route(off, r => r.abort());  /* the mint out of reach from this phone, for a moment */
  const id1 = await pay(pr, await plain(13)); await donor.evaluate(() => window.__vetlock.wCheck()); const st1 = await waitText(donor, '#dw-state', /It is tried again by itself|LOCKED|✗/, 30000);
  const r1 = await donor.evaluate(id => window.__vetlock.wreqs().find(x => x.id === id), pr.id);
  check('H10 · a payment that fails for a moment is not marked as seen: it says it is tried again, and the request still waits', /✗ .*It is tried again by itself\./.test(st1) && r1.state === 'waiting' && !(r1.seen || []).includes(id1) && (r1.tries || {})[id1] >= 1, st1.slice(0, 100));
  await donor.unroute(off); await donor.evaluate(() => window.__vetlock.wCheck()); const o1 = await waitText(donor, '#d-out', /LOCKED 13 sat|Failed/, 40000);
  const r1b = await donor.evaluate(id => window.__vetlock.wreqs().find(x => x.id === id), pr.id);
  check('…the mint back, the next check takes it: locked', /LOCKED 13 sat for MOCHI/.test(o1) && r1b.state === 'done' && (r1b.seen || []).includes(id1), o1.split('\n')[0]);
  // a request of its own, paid as usual (done), then paid again
  const pr2 = await openRequest(9); await pay(pr2, await plain(9)); await donor.evaluate(() => window.__vetlock.wCheck()); const o3 = await waitText(donor, '#d-out', /LOCKED 9 sat|Failed/, 40000), done2 = (await donor.evaluate(id => window.__vetlock.wreqs().find(x => x.id === id), pr2.id)).state;
  const id2 = await pay(pr2, await plain(4)); await donor.evaluate(() => window.__vetlock.wCheck()); const o2 = await waitText(donor, '#d-out', /LOCKED 4 sat|Failed/, 40000);
  check('H11 · a second payment to a request already paid is locked too, not left in the relay', /LOCKED 9 sat for MOCHI/.test(o3) && done2 === 'done' && /LOCKED 4 sat for MOCHI/.test(o2) && (await donor.evaluate(id => window.__vetlock.wreqs().find(x => x.id === id).seen || [], pr2.id)).includes(id2), `${done2} · ` + o2.split('\n')[0]);
  await donor.context().close(); }

// ---- A RELEASE UNDER `dest` WHOSE LEDGER WRITE FAILS (H15) ----
if (!C.destMint(await (await fetch(DMINT + '/v1/info')).json())) check(`H15 · needs the patched mint at ${DMINT}`, false);
else { const dw = new cashu.Wallet(DMINT); await dw.loadMint();
  const front = p => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const partner = await page(), rescue = await page(), donor = await page();
  await tab(partner, 'csettings'); await partner.click('#cs-new'); await partner.waitForTimeout(600); const A = await partner.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
  await tab(rescue, 'release'); await rescue.click('#s-new'); await rescue.waitForTimeout(800); await rescue.reload(); await rescue.waitForTimeout(500);
  await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-camp'); await rescue.waitForSelector('#campaign.on');
  await rescue.fill('#k-mint', DMINT); await rescue.click('#k-par'); await rescue.waitForSelector('#spick.on'); await waitText(rescue, '#pp-head .title', /Choose partners/, 8000);
  await rescue.click('#pp-add'); await rescue.fill('#pp-name', 'Clinica Sol'); await rescue.fill('#pp-key', A); await rescue.click('#pp-save'); await rescue.waitForSelector('#pp-list button.req'); await rescue.click('#pp-done'); await rescue.waitForSelector('#campaign.on');
  await rescue.fill('#k-name', 'TNR SOL'); await rescue.click('#k-go'); const made = await waitText(rescue, '#k-out', /is ready|cannot|Failed/, 30000), dlink = (made.match(/http\S+#c=\S+/) || [])[0] || '';
  if (!dlink) check('H15 · a pot at the dest mint', false, made.slice(0, 120));
  else { await donor.goto(dlink); await donor.reload(); await tab(donor, 'decash'); await donor.fill('#d-token', cashu.getEncodedToken({ mint: DMINT, proofs: await plain(1000, dw) })); await donor.click('#d-go'); await waitText(donor, '#d-out', /LOCKED|Failed|✗/, 40000); await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000);
    await tab(rescue, 'home'); await front(rescue); for (let i = 0; i < 60; i++) { await rescue.waitForTimeout(500); if (await rescue.evaluate(async () => Object.values(await window.__vetlock.ledgerAll()).reduce((s, L) => s + Object.keys(L.entries || {}).length, 0)) >= 1) break; await front(rescue); }
    await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-req'); await rescue.waitForSelector('#snew.on');
    await rescue.fill('#sn-cat', 'Luna'); await rescue.fill('#sn-proc', 'Spay'); await rescue.fill('#sn-cost', '600'); await waitText(rescue, '#sn-cover', /✓/, 30000); await rescue.click('#sn-go'); await rescue.waitForSelector('#sreq.on', { timeout: 30000 });
    const qid = (await txt(rescue, '#sq-head .mut')).replace(/^request /, ''); await waitText(rescue, '#sq-steps', /sent · 2\/2 relays/, 30000);
    await tab(partner, 'work'); await partner.waitForTimeout(1500); await front(partner); await partner.waitForFunction(id => window.__vetlock.creqs().some(r => r.id === id), qid, { timeout: 20000 }).catch(() => {});
    await tab(partner, 'work'); await partner.waitForTimeout(400); if (!(await partner.$eval('#w-pend', e => e.classList.contains('on')))) await partner.click('#w-pend'); await partner.locator('#w-list .item', { hasText: qid }).click(); await partner.waitForSelector('#creq.on');
    await partner.waitForFunction(() => !document.getElementById('cr-ok').disabled, null, { timeout: 30000 }).catch(() => {}); await partner.check('#cr-ok'); await partner.click('#cr-go'); await waitText(partner, '#cr-out', /received by Streetcat|✗|Failed|Not possible/, 30000);
    await rescue.waitForTimeout(1500); await tab(rescue, 'home'); await front(rescue); await rescue.waitForSelector('#h-kinds button.req.torel', { timeout: 30000 }).catch(() => {}); await rescue.click('#h-kinds button.req.torel'); await rescue.waitForSelector('#sreq.on');
    await rescue.evaluate(() => { const put = IDBObjectStore.prototype.put; window.__put = put; IDBObjectStore.prototype.put = function (...a) { if (this.name === 'ledger') throw new DOMException('no room', 'QuotaExceededError'); return put.apply(this, a); }; });  /* the ledger cannot be written */
    await rescue.click('#sq-go'); const e1 = await waitText(rescue, '#sq-out', /Interrupted|Not possible|Mint refused|PAID/, 60000);
    const s1 = await rescue.evaluate(async id => { const r = window.__vetlock.sreqs().find(x => x.id === id), L = await window.__vetlock.ledgerAll(); return { state: r.state, parts: Object.values(L).flatMap(x => Object.values(x.entries || {})).flatMap(e => e.parts || []).filter(p => p.request === id).length }; }, qid);
    check('H15 · the mint pays, the ledger cannot be written: it says so, the request is not called released, and the ledger has nothing of it yet', /^Interrupted: paid, but this phone has no room to write DON-[0-9A-F]{8} in the ledger\. Free some room and release again/.test(e1) && s1.state !== 'released' && s1.parts === 0, `${e1.slice(0, 110)} · ${JSON.stringify(s1)}`);
    await rescue.evaluate(() => { IDBObjectStore.prototype.put = window.__put; }); await rescue.click('#sq-go'); const e2 = await waitText(rescue, '#sq-out', /^PAID|Interrupted|Not possible|Mint refused/, 60000);
    const s2 = await rescue.evaluate(async id => { const r = window.__vetlock.sreqs().find(x => x.id === id), L = await window.__vetlock.ledgerAll(); return { state: r.state, amount: r.released && r.released.amount, parts: Object.values(L).flatMap(x => Object.values(x.entries || {})).flatMap(e => e.parts || []).filter(p => p.request === id).length }; }, qid);
    check('…released again with room: the ledger has it once, the request is released, and the mint paid 600 sat once', /^PAID 600 sat/.test(e2) && s2.state === 'released' && s2.amount === 600 && s2.parts === 1, `${e2.slice(0, 60)} · ${JSON.stringify(s2)}`); }
  await Promise.all([partner, rescue, donor].map(p => p.context().close())); }

await b.close(); await Promise.all(relays.map(r => r.close()));
say(bad ? `daybreak: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'daybreak: every check passed'); process.exit(bad ? 1 : 0);
