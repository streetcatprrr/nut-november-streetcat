// The partner is paid by the mint and its app sends the payment on to its Lightning address, through the pages: Rescue's app, the partner's and a donor's, by relay only, in Chromium
// against the patched test mint (mint/, port 3340), two local relays and a local Lightning address server (LUD-16) whose invoices are
// that mint's, so it can pay them; fake money. A pot with one partner at the mint that enforces where donations go. Confirmed and
// not yet released, the partner's screen says the mint pays once Streetcat releases. Released, the partner's app finds its 600 sat
// at the mint by itself and sends them to its address; the invoices here are 3 sat short of what is asked, so 3 sat stay as ecash.
// With no address set, the next payment waits at the mint and that is said in red; the address set again, it goes by itself, the 3
// sat kept before with it. Asked again, nothing is paid twice. Not covered: a payment whose answer is lost (the code is Rescue's
// payout's, payout_test), a mint with fees, an address that stops answering.
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore;
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
if (!C.destMint(await (await fetch(MINT + '/v1/info')).json())) { say(`destpay: needs the patched mint at ${MINT} (see mint/README.md)`); process.exit(1); }
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return cashu.getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
// the partner's Lightning address on a local test server: its invoices are the mint's own, LN.short sat under what is asked (the local mint keeps no fee reserve, so that is what leaves change)
const LN = { port: 7256, quotes: [], short: 3 }, lnServer = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://127.0.0.1'), send = j => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(j)); };
  if (u.pathname === '/.well-known/lnurlp/clinic') return send({ tag: 'payRequest', callback: `http://127.0.0.1:${LN.port}/cb`, minSendable: 1000, maxSendable: 100000000, metadata: '[["text/plain","Clinica Sol"]]' });
  if (u.pathname === '/cb') { const sat = Math.max(1, Math.floor(Number(u.searchParams.get('amount')) / 1000) - LN.short), q = await w.createMintQuoteBolt11(sat); LN.quotes.push({ sat, quote: q.quote }); return send({ pr: q.request, routes: [] }); }
  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end(); }); await new Promise(r => lnServer.listen(LN.port, '127.0.0.1', r));
const ADDR = `clinic@127.0.0.1:${LN.port}`;
// what reached the address, asked of the mint: the invoices it says it has paid for the partner's app (the test mint marks every invoice of its own as paid in a while, so its invoices' state says nothing)
const arrived = async () => { let n = 0; for (const m of await partner.evaluate(() => window.__vetlock.cPayouts().map(x => ({ quote: x.quote })))) { try { const q = await w.checkMeltQuoteBolt11(m.quote); if (q.state === 'PAID') n += C.amt(q.amount); } catch (_) {} } return n; };
const relays = [startRelay({ port: 7451 }), startRelay({ port: 7452 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(r => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); p.on('dialog', d => { say('DIALOG', d.message()); d.accept(); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const front = p => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));  // one turns to this app: it is in front again
const setAddr = async (p, a) => { await tab(p, 'csettings'); await p.fill('#cs-ln', a); await p.press('#cs-ln', 'Tab'); await p.waitForTimeout(200); for (let i = 0; i < 75; i++) { const t = await txt(p, '#cs-ln-st'); if (!/^checking/.test(t)) return t; await p.waitForTimeout(200); } return 'still checking'; };
const payOf = (p, id) => p.evaluate(id => (window.__vetlock.creqs().find(r => r.id === id) || {}).pay || null, id);
const waitPay = async (p, id, state, ms = 40000) => { const t0 = Date.now(); let x = null; while (Date.now() - t0 < ms) { x = await payOf(p, id); if (x && x.state === state) return x; await front(p); await p.waitForTimeout(1500); } return x; };
const showSet = async (p, group) => { await tab(p, 'work'); await p.waitForTimeout(400); if (!(await p.$eval(group, e => e.classList.contains('on')))) await p.click(group); await p.waitForTimeout(300); };  /* the partner's home: "pending" or "done", shown at a tap */
const openIn = async (p, id, group) => { await showSet(p, group); await p.locator('#w-list .item', { hasText: id }).click(); await p.waitForSelector('#creq.on'); await p.waitForTimeout(500); };

// THE PARTNER'S APP: its key and its Lightning address. RESCUE'S APP: Streetcat's key and a pot with that one partner
const partner = await page(), rescue = await page(), donor = await page();
await tab(partner, 'csettings'); await partner.click('#cs-new'); const A = await partner.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
const bogus = await setAddr(partner, 'not an address'), set = await setAddr(partner, ADDR);
check('the partner\'s settings take its Lightning address ("Paid to"): what is not one is refused in red, one that answers says nothing', /^✗ not an address is not a Lightning address/.test(bogus) && set === '' && (await partner.evaluate(() => localStorage.getItem('vetlock.clinic.payto'))) === ADDR, bogus + ' | ' + (set || '(nothing)'));
await tab(rescue, 'release'); await rescue.click('#s-new'); await rescue.waitForTimeout(800); await rescue.reload(); await rescue.waitForTimeout(500);
await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-camp'); await rescue.waitForSelector('#campaign.on');
await rescue.fill('#k-mint', MINT); await rescue.click('#k-par'); await rescue.waitForSelector('#spick.on'); await waitText(rescue, '#pp-head .title', /Choose partners/, 8000);
await rescue.click('#pp-add'); await rescue.fill('#pp-name', 'Clinica Sol'); await rescue.fill('#pp-key', A); await rescue.click('#pp-save'); await rescue.waitForSelector('#pp-list button.req'); await rescue.click('#pp-done'); await rescue.waitForSelector('#campaign.on');
await rescue.fill('#k-name', 'TNR SOL'); await rescue.click('#k-go'); const made = await waitText(rescue, '#k-out', /is ready|cannot|Failed/, 30000), link = (made.match(/http\S+#c=\S+/) || [])[0] || '';
const camp = link ? JSON.parse(Buffer.from(link.split('#c=')[1], 'base64url').toString('utf8')) : {};
check('a pot with one partner, at the mint that enforces where donations go, is one that pays from the lock', /is ready/.test(made) && camp.lock === 'dest' && camp.clinic === A && camp.partners === undefined, made.split('\n').find(l => /dest|cannot|✗/.test(l)) || made.slice(0, 80));
if (!link) { say('destpay: no campaign, nothing else can be tested'); await b.close(); relays.forEach(r => r.close && r.close()); lnServer.close(); process.exit(1); }
await donor.goto(link); await donor.reload(); await tab(donor, 'decash'); await donor.fill('#d-token', await plain(2000)); await donor.click('#d-go'); await waitText(donor, '#d-out', /LOCKED|Failed|✗/, 40000); await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000);
await tab(rescue, 'home'); await front(rescue); for (let i = 0; i < 60; i++) { await rescue.waitForTimeout(500); if (await rescue.evaluate(async () => Object.values(await window.__vetlock.ledgerAll()).reduce((s, L) => s + Object.keys(L.entries || {}).length, 0)) >= 1) break; await front(rescue); }

// a request of `sat`, confirmed by the partner; Rescue releases it when told
const ask = async (cat, sat) => { await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-req'); await rescue.waitForSelector('#snew.on');
  await rescue.fill('#sn-cat', cat); await rescue.fill('#sn-proc', 'Spay'); await rescue.fill('#sn-cost', String(sat)); await waitText(rescue, '#sn-cover', /✓/, 30000); const chips = await rescue.isVisible('#sn-pars'); await rescue.click('#sn-go'); await rescue.waitForSelector('#sreq.on', { timeout: 30000 });
  const id = (await txt(rescue, '#sq-head .mut')).replace(/^request /, ''); await waitText(rescue, '#sq-steps', /sent · 2\/2 relays/, 30000);
  await tab(partner, 'work'); await partner.waitForTimeout(1500); await front(partner); await partner.waitForFunction(id => window.__vetlock.creqs().some(r => r.id === id), id, { timeout: 20000 }).catch(() => {});
  await openIn(partner, id, '#w-pend'); await partner.waitForFunction(() => !document.getElementById('cr-ok').disabled, null, { timeout: 30000 }).catch(() => {}); await partner.check('#cr-ok'); await partner.click('#cr-go');
  return { id, chips, conf: await waitText(partner, '#cr-out', /received by Streetcat|✗|Failed|Not possible/, 30000) }; };
const release = async id => { await rescue.waitForTimeout(1500); await tab(rescue, 'home'); await front(rescue); await rescue.waitForSelector('#h-kinds button.req.torel', { timeout: 20000 }).catch(() => {});
  await rescue.click('#h-kinds button.req.torel'); await rescue.waitForSelector('#sreq.on'); await rescue.click('#sq-go'); return waitText(rescue, '#sq-steps', /✓ paid|✗/, 60000); };

// 600 SAT: confirmed, released, and sent on to the address by the partner's app itself
const r1 = await ask('Luna', 600);
check('with one partner the request form shows no choice of partner; confirmed and not yet released, the partner\'s screen says when it is paid', !r1.chips && /✓ (delivery )?confirmed/.test(r1.conf) && /· the mint pays on release/.test(r1.conf) && (await payOf(partner, r1.id)) === null, r1.conf.split('\n').slice(0, 2).join(' / '));
const rel1 = await release(r1.id), pay1 = await waitPay(partner, r1.id, 'paid'), got1 = await arrived();
check('Rescue releases: "paid 600 sat to the clinic by the mint"', /✓ paid 600 sat to the clinic/.test(rel1), rel1.split('\n').find(l => /paid|✗/.test(l)) || rel1.slice(-80));
check('the partner\'s app, in front again, finds its payment at the mint and sends it to its address: 597 sat arrive (the invoice is 3 short), 3 stay', !!pay1 && pay1.state === 'paid' && pay1.amount === 600 && pay1.sent === 597 && pay1.change === 3 && pay1.to === ADDR && got1 === 597, JSON.stringify(pay1) + ` · ${got1} sat arrived`);
await openIn(partner, r1.id, '#w-dn'); const out1 = await txt(partner, '#cr-out'); await showSet(partner, '#w-dn'); const st1 = await partner.$$eval('#w-list .item .st', xs => xs.map(x => x.textContent));
check('its request says so, and its list says "paid"', out1.includes('✓ paid 597 sat by the mint') && out1.includes(`→ ${ADDR}`) && out1.includes('· 3 sat kept here for the next payment') && st1.join() === 'paid', out1.split('\n').find(l => /sent to|✗/.test(l)) + ' · ' + st1.join());
await tab(partner, 'csettings'); const kept1 = await txt(partner, '#cs-kept'), tok1 = await partner.evaluate(() => window.__vetlock.cChange().map(x => x.token));
check('its settings show the 3 sat kept as ecash, to be copied or to go with the next payment', /^3 sat kept here as ecash: it goes with the next payment/.test(kept1) && tok1.length === 1, kept1);

// WITH NO ADDRESS the next payment waits at the mint, said in red; the address set again, it goes by itself
const cleared = await setAddr(partner, ''), r2 = await ask('Nube', 300), rel2 = await release(r2.id), pay2 = await waitPay(partner, r2.id, 'atmint');
await openIn(partner, r2.id, '#w-dn'); const out2 = await txt(partner, '#cr-out'), got2 = await arrived();
check('with no address set, a payment waits at the mint: "✗ 300 sat paid by the mint: set a Lightning address in settings to receive them"', cleared === '' && /✓ paid 300 sat/.test(rel2) && !!pay2 && pay2.state === 'atmint' && pay2.amount === 300 && out2.includes('✗ 300 sat paid by the mint · set a Lightning address in settings') && got2 === 597, out2.split('\n').find(l => /paid by the mint|sent to/.test(l)) || out2.slice(0, 80));
const again = await setAddr(partner, ADDR), pay3 = await waitPay(partner, r2.id, 'paid'), got3 = await arrived(), tok3 = await partner.evaluate(() => window.__vetlock.cChange().map(x => x.token));
check('the address set again, it goes by itself, the 3 sat kept before with it: 300 more arrive, and 3 stay anew', again === '' && !!pay3 && pay3.state === 'paid' && pay3.sent === 300 && pay3.change === 3 && got3 === 897 && tok3.length === 1 && tok3[0] !== tok1[0], JSON.stringify(pay3) + ` · ${got3} sat arrived in all`);
const before = LN.quotes.length; await partner.evaluate(() => window.__vetlock.cCollectAll()); await front(partner); await partner.waitForTimeout(2500); const got4 = await arrived(), recs = await partner.evaluate(() => window.__vetlock.cPayouts().map(m => m.state + ' ' + m.amount));
check('asked again, nothing is paid twice: no new invoice, the same two payments', LN.quotes.length === before && got4 === 897 && recs.join() === 'paid 597,paid 300', recs.join() + ` · ${LN.quotes.length - before} new invoices`);
// A PAYMENT WHOSE RECORD COULD NOT BE WRITTEN as paid (the phone's storage full for that write; six scans, 15 Nov, 3.27): its request
// said "paid" and its record stayed "pending", which nothing looked at again; and once it was, the change it had kept was kept twice,
// and the next payment, made of both, was refused by the mint as duplicate inputs
await partner.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (this === localStorage && window.__full && k === 'vetlock.clinic.payouts' && String(v).includes('"changeDue":false')) throw new DOMException('no room', 'QuotaExceededError'); return set.call(this, k, v); }; });
await partner.route('**/v1/melt/bolt11', async r => { await partner.evaluate(() => { window.__full = true; }); return r.continue(); });
const r5 = await ask('Sol', 40), rel5 = await release(r5.id), pay5 = await waitPay(partner, r5.id, 'paid'); await partner.waitForTimeout(1500); await partner.unroute('**/v1/melt/bolt11');
const stuck = await partner.evaluate(() => window.__vetlock.cPayouts().map(m => m.state).join());
await partner.reload(); await partner.waitForTimeout(2500); await front(partner); await partner.evaluate(() => window.__vetlock.cCollectAll()); await partner.waitForTimeout(2500);
const recs5 = await partner.evaluate(() => window.__vetlock.cPayouts().map(m => m.state).join()), ch5 = await partner.evaluate(() => window.__vetlock.cChange().map(x => x.token)), ys5 = ch5.flatMap(t => w.decodeToken(t).proofs.map(p => p.secret));
check('a payment whose record could not be written as paid is asked about again when the app opens, and its change is kept once', /✓ paid 40 sat/.test(rel5) && !!pay5 && stuck === 'paid,paid,pending' && recs5 === 'paid,paid,paid' && ys5.length > 0 && new Set(ys5).size === ys5.length, `${stuck} → ${recs5} · change tokens ${ch5.length}, proofs ${ys5.length}, different ${new Set(ys5).size}`);
const r6 = await ask('Mar', 20), rel6 = await release(r6.id), pay6 = await waitPay(partner, r6.id, 'paid');
check('…and the next payment goes, the change kept before with it', /✓ paid 20 sat/.test(rel6) && !!pay6 && pay6.state === 'paid' && pay6.sent > 0, JSON.stringify(pay6));
// ---------- requests and their records (six scans, 15 Nov, group 5: 3.4, 3.16, 3.24, 3.25, 3.35) ----------
const fillReq = async (cat, sat) => { await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-req'); await rescue.waitForSelector('#snew.on');
  await rescue.fill('#sn-cat', cat); await rescue.fill('#sn-proc', 'Spay'); await rescue.fill('#sn-cost', String(sat)); await waitText(rescue, '#sn-cover', /✓/, 30000); };
const mkReq = async (cat, sat) => { await fillReq(cat, sat); await rescue.click('#sn-go'); await rescue.waitForSelector('#sreq.on', { timeout: 30000 }); const id = (await txt(rescue, '#sq-head .mut')).replace(/^request /, ''); await waitText(rescue, '#sq-steps', /sent · 2\/2 relays/, 30000); return id; };
const creqOf = id => partner.evaluate(id => window.__vetlock.creqs().find(r => r.id === id) || null, id), recheck = async () => { await tab(partner, 'work'); await partner.waitForTimeout(300); await partner.click('#w-check'); await partner.waitForTimeout(2500); return txt(partner, '#w-net'); };
const queued = (p, what) => p.evaluate(t => window.__vetlock.outbox().filter(x => String(x.label || '').includes(t)).length, what);
// 3.16 · a copy of a request opened first from a link, unsigned and changed: Streetcat's own, by relay, takes its place
await partner.context().setOffline(true); const id7 = await mkReq('Rio', 10), q7 = await rescue.evaluate(id => window.__vetlock.sreqs().find(r => r.id === id).q, id7), { sig: _s7, ...u7 } = q7;
await partner.evaluate(t => window.__vetlock.openPayload(t, 'link'), JSON.stringify({ ...u7, patient: 'OTRO' })); await partner.waitForTimeout(800); const lesser = await creqOf(id7);
await partner.context().setOffline(false); await recheck(); await partner.waitForFunction(id => { const r = window.__vetlock.creqs().find(x => x.id === id); return !!r && r.q.patient === 'Rio'; }, id7, { timeout: 20000 }).catch(() => {}); const own7 = await creqOf(id7);
check('a copy of a request opened first from a link, not signed and changed, gives way to Streetcat\'s own when the relay brings it', !!lesser && lesser.q.patient === 'OTRO' && (lesser.unsigned || []).length === 1 && !!own7 && own7.q.patient === 'Rio' && !(own7.unsigned || []).length && own7.from === 'relay', JSON.stringify({ first: lesser && [lesser.q.patient, lesser.unsigned], then: own7 && [own7.q.patient, own7.unsigned || [], own7.from] }));
// 3.35 · what the mint said of a request's amounts is that request's, to the letter: a check made of another copy does not let it be confirmed
await openIn(partner, id7, '#w-pend'); await partner.waitForFunction(() => !document.getElementById('cr-ok').disabled, null, { timeout: 30000 }).catch(() => {}); const a7 = await partner.evaluate(id => { const r = window.__vetlock.creqs().find(x => x.id === id); return { has: !!r.amounts, same: !!r.amounts && r.amounts.for === window.__vetlock.qDigest(r.q) }; }, id7);
await partner.evaluate(id => { const k = 'vetlock.clinic.requests', a = JSON.parse(localStorage.getItem(k)); for (const r of a) if (r.id === id) r.amounts.for = '0:another'; localStorage.setItem(k, JSON.stringify(a)); }, id7);
await partner.check('#cr-ok'); await partner.click('#cr-go'); const no7 = await waitText(partner, '#cr-out', /cannot be confirmed|✓ confirmed|Failed/, 10000), st7 = (await creqOf(id7)).state;
check('the amounts checked with the mint are those of the request on screen: a check of another copy does not let the partner confirm', a7.has && a7.same && /this request cannot be confirmed: its amounts are not checked with the mint yet/.test(no7) && st7 === 'review', JSON.stringify(a7) + ' · ' + no7.slice(0, 110));
// 3.24 · a request the partner's phone could not keep: no "received" goes to Streetcat for it, and it is taken at the next check
await partner.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (this === localStorage && window.__noReq && k === 'vetlock.clinic.requests') throw new DOMException('no room', 'QuotaExceededError'); return set.call(this, k, v); }; });
await partner.context().setOffline(true); const id8 = await mkReq('Mia', 10); await partner.evaluate(() => { window.__noReq = true; }); await partner.context().setOffline(false);
const net8 = await recheck(), kept8 = !!(await creqOf(id8)), ack8 = await queued(partner, 'received ' + id8); await partner.evaluate(() => { window.__noReq = false; }); await recheck(); await partner.waitForTimeout(1500);
check('a request the partner\'s phone had no room to keep: said in red, no "received" goes out for it, and it is taken, and acknowledged, at the next check', /could not be taken yet/.test(net8) && !kept8 && ack8 === 0 && !!(await creqOf(id8)) && (await queued(partner, 'received ' + id8)) === 1, `${net8.split('\n').pop().slice(0, 90)} · kept ${kept8} · receipts ${ack8} → ${await queued(partner, 'received ' + id8)}`);
// …and one Rescue's phone could not keep is not sent
await rescue.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (this === localStorage && window.__noReq && k === 'vetlock.sc.requests') throw new DOMException('no room', 'QuotaExceededError'); return set.call(this, k, v); }; window.__noReq = true; });
const out0 = await queued(rescue, 'request '), n0 = await rescue.evaluate(() => window.__vetlock.sreqs().length); await fillReq('Sin', 10); await rescue.click('#sn-go'); const sn = await waitText(rescue, '#sn-out', /could not keep this request|Failed|✗/, 20000);
check('a request Rescue\'s phone had no room to keep is not sent, and it says so', /this browser could not keep this request \(its storage is full or blocked\), so it was not sent/.test(sn) && (await queued(rescue, 'request ')) === out0 && (await rescue.evaluate(() => window.__vetlock.sreqs().length)) === n0, sn.slice(0, 120)); await rescue.evaluate(() => { window.__noReq = false; });
// 3.25 · a request that lets go of the ecash it named (as after a release the mint refused whole): a new request can take it
const held8 = await rescue.evaluate(id => { const V = window.__vetlock, r = V.sreqs().find(x => x.id === id), ys = r.q.contributions.flatMap(k => k.proofs.map(p => window.scCore.yOf(p.secret))), before = ys.filter(y => V.reservedYs().has(y)).length; V.freeReq(r); return { n: ys.length, before, after: ys.filter(y => V.reservedYs().has(y)).length, freed: !!V.sreqs().find(x => x.id === id).freed }; }, id8);
check('a request whose release the mint refused whole lets go of the ecash it named, so that a new request can take it', held8.n > 0 && held8.before === held8.n && held8.after === 0 && held8.freed, JSON.stringify(held8));
// 3.4 · a payment already in the ledger, its mark with the request lost: released again, it is not written twice
const partsOf = id => rescue.evaluate(async id => Object.values(await window.__vetlock.ledgerAll()).flatMap(L => Object.values(L.entries || {})).flatMap(e => e.parts || []).filter(x => x.request === id).length, id), was6 = await partsOf(r6.id);
await rescue.evaluate(id => { const k = 'vetlock.sc.requests', a = JSON.parse(localStorage.getItem(k)); for (const r of a) if (r.id === id) { r.state = 'certified'; delete r.destDone; delete r.released; } localStorage.setItem(k, JSON.stringify(a)); }, r6.id); await rescue.reload(); await rescue.waitForTimeout(1200);
const again6 = await release(r6.id), now6 = await partsOf(r6.id);
check('a release whose mark was lost, released again: the mint is read, nothing is paid twice, and its part is in the ledger once', was6 === 1 && /✓ paid 20 sat/.test(again6) && now6 === 1, `parts ${was6} → ${now6} · ${again6.split('\n').pop().slice(0, 80)}`);
say(bad ? `destpay: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'destpay: every check passed');
await b.close(); relays.forEach(r => r.close && r.close()); lnServer.close(); process.exit(bad ? 1 : 0);
