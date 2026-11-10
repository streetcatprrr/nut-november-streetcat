// The partner's payment when a request is paid in more than one go (audit of 10 Nov, the second reviewer's F2): the partner's real
// page in Chromium, Rescue played from Node with the app's own code (app/core.js), the patched test mint (mint/, port 3340), fake
// money. No port is opened: the partner's Lightning address is answered inside the browser (its invoices are that mint's).
// A request has one transaction for each donation, and Streetcat's app sends them one after another: the partner's check can fall
// between two of them, or the release can be finished later (an answer lost, a donation refused). Before, the partner's app wrote
// "paid" as soon as what it had found was sent on and never looked again: of a 300 + 300 sat request, the second 300 sat stayed
// at the mint for good while the screen said "✓ 300 sat sent". Here: after the first transaction the request is "part" (300 of
// 600, the rest to come); after the second, "paid", 600 sat sent, nothing left at the mint, nothing paid twice. And when one of a
// request's donations goes another way (here Rescue pays it out under another request; a donor's refund does the same), the
// request ends "paid" for what came, and says in red what did not; one of which nothing can come any more says "not paid".
// Not covered: a mint with fees, a payment whose answer is lost (payout_test has Rescue's, the code is shared).
import { chromium } from 'playwright';
import fs from 'fs';
import { pinBrowser, pin } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, amt = C.amt, enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), key = () => { const sk = hex(cashu.createRandomSecretKey()); return { sk, pk: C.pubOf(sk) }; }, sum = ps => ps.reduce((a, p) => a + amt(p.amount), 0);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
if (!C.destMint(await (await fetch(MINT + '/v1/info')).json())) { say(`destpart: needs the patched mint at ${MINT} (see mint/README.md)`); process.exit(1); }
const w = new cashu.Wallet(MINT); await w.loadMint(); const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), denoms = Object.keys(ks.keys).map(Number), dest = { keysetId: ks.id, denoms, fee: ps => amt(w.getFeesForProofs(ps)) };
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 60; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const outOf = (a, s) => { const b = cashu.blindMessage(enc.encode(s)); return new cashu.OutputData({ amount: cashu.Amount.from(a), id: ks.id, B_: b.B_.toHex(true) }, b.r, enc.encode(s)); };
const swapTo = async (inputs, outs) => { const res = await w.mint.swap({ inputs: inputs.map(p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C })), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) }); return outs.map((o, i) => o.toProof(res.signatures[i], ks)); };

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})), ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} });  /* no relay: the request is handed over as a link's text */
const partner = await ctx.newPage(); partner.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); partner.on('dialog', d => d.accept()); await partner.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
const LN = []; await partner.route('http://127.0.0.1:7999/**', async r => { const u = new URL(r.request().url()), json = j => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify(j) });
  if (u.pathname === '/.well-known/lnurlp/clinic') return json({ tag: 'payRequest', callback: 'http://127.0.0.1:7999/cb', minSendable: 1000, maxSendable: 100000000, metadata: '[["text/plain","clinic"]]' });
  if (u.pathname === '/cb') { const sat = Math.floor(Number(u.searchParams.get('amount')) / 1000), q = await w.createMintQuoteBolt11(sat); LN.push(sat); return json({ pr: q.request, routes: [] }); } return r.fulfill({ status: 404 }); });
await partner.goto(BASE + 'index.html');
const tab = t => partner.evaluate(t => window.__vetlock.openTab(t), t), txt = async s => ((await partner.textContent(s)) || '').trim(), ADDR = 'clinic@127.0.0.1:7999';
await tab('csettings'); await partner.click('#cs-new'); const Ask = await partner.evaluate(() => window.__vetlock.key('clinic', false)), A = { sk: Ask, pk: C.pubOf(Ask) };
await partner.fill('#cs-ln', ADDR); await partner.press('#cs-ln', 'Tab'); await partner.waitForTimeout(1500);
// Rescue, in Node: a pot that pays from the lock, four donations of four donors
const S = key(); await pin(S.pk); const deadline = Math.floor(Date.now() / 1000) + 30 * 86400, camp = C.campaignOf({ name: 'POT', op: 'sterilisation', mint: MINT, streetcat: S.pk, clinic: A.pk, lock: 'dest', deadline });
const donate = async n => { const lock = { streetcat: S.pk, payees: C.payeesOf(camp), deadline, refund: key().pk }; return swapTo(await plain(n), C.donationSplit(n, denoms).map(a => outOf(a, C.destSecret(lock)))); };  /* one donor, one refund key, one lock */
const d1 = await donate(300), d2 = await donate(300), d3 = await donate(200), d4 = await donate(100), d5 = await donate(64);
// what reached the address, asked of the mint: the invoices it says it has paid for the partner's app (the app asks its address for two invoices to find the largest that fits, and pays one)
const arrived = async () => { let n = 0; for (const m of await partner.evaluate(() => window.__vetlock.cPayouts().map(x => ({ quote: x.quote })))) { try { const q = await w.checkMeltQuoteBolt11(m.quote); if (q.state === 'PAID') n += amt(q.amount); } catch (_) {} } return n; };
const payOf = id => partner.evaluate(id => (window.__vetlock.creqs().find(r => r.id === id) || {}).pay || null, id), look = async () => { await partner.evaluate(() => window.__vetlock.cCollectAll()); await partner.waitForTimeout(700); };
// a request handed to the partner's page, confirmed there; its transactions, for the mint to take one by one
const ask = async (cat, parts) => { const q = await C.makeRequest({ campaign: camp, patient: cat, procedure: 'spay', date: '2026-11-12', contributions: parts.map(([release, proofs]) => ({ release, proofs })), payee: A.pk, dest });
  await partner.evaluate(t => window.__vetlock.openPayload(t, 'link'), JSON.stringify(q)); await partner.waitForSelector('#creq.on'); await partner.waitForFunction(() => !document.getElementById('cr-ok').disabled, null, { timeout: 30000 });
  await partner.check('#cr-ok'); await partner.click('#cr-go'); await partner.waitForFunction(id => { const r = window.__vetlock.creqs().find(x => x.id === id); return !!(r && r.answer); }, q.id, { timeout: 30000 });
  const a = await partner.evaluate(id => window.__vetlock.creqs().find(x => x.id === id).answer, q.id), txs = []; for (const k of q.contributions) txs.push(await C.reqTx(q, k));
  return { q, a, txs, take: i => C.destSwap(w, txs[i], [C.destSign(txs[i], S.sk), a.sigs[i]]) }; };
const screen = async id => { await tab('work'); await partner.waitForTimeout(300); for (const g of ['#w-dn', '#w-pend']) { if (!(await partner.$eval(g, e => e.classList.contains('on')))) await partner.click(g); await partner.waitForTimeout(300); if (await partner.locator('#w-list .item', { hasText: id }).count()) break; }
  await partner.locator('#w-list .item', { hasText: id }).click(); await partner.waitForSelector('#creq.on'); await partner.waitForTimeout(600); return txt('#cr-out'); };

// ---------- 300 + 300 sat, taken by the mint one after the other ----------
const r1 = await ask('LUNA', [[300, d1], [300, d2]]), ok1 = (await C.checkAnswer(r1.q, r1.a)).ok;
await look(); check('confirmed and not released: nothing yet', ok1 && (await payOf(r1.q.id)) === null);
await r1.take(0); await look(); await look(); const p1 = await payOf(r1.q.id), s1 = await screen(r1.q.id);
check('the mint takes the first transaction: the partner\'s app sends its 300 sat on, and the request is paid in part, not "paid"', !!p1 && p1.state === 'part' && p1.amount === 300 && p1.of === 600 && p1.sent === 300 && (await arrived()) === 300, JSON.stringify(p1) + ` · ${await arrived()} sat arrived`);
check('…its screen says what was sent and what is to come', s1.includes(`✓ 300 sat sent to ${ADDR}`) && s1.includes('· 300 sat to come once Streetcat releases it'), s1.split('\n').filter(l => /sent|to come|✗/.test(l)).join(' / '));
await r1.take(1); await look(); await look(); const p2 = await payOf(r1.q.id), s2 = await screen(r1.q.id);
const second = (await C.destFind(w, r1.txs[1])).filter(x => !x.rest).map(x => x.proof), st2 = [...new Set((await w.checkProofsStates(second)).map(x => x.state))].join();
check('the mint takes the second: its 300 sat are sent on too (before the audit they stayed at the mint for good), and the request is paid', !!p2 && p2.state === 'paid' && p2.amount === 600 && p2.sent === 600 && (await arrived()) === 600 && sum(second) === 300 && st2 === 'SPENT', JSON.stringify(p2) + ` · the second payment at the mint: ${st2}`);
check('…its screen says so, with nothing missing', s2.includes(`✓ 600 sat sent to ${ADDR}`) && !/were not paid|to come/.test(s2), s2.split('\n').filter(l => /sent|to come|✗/.test(l)).join(' / '));
const asked = LN.length; await look(); await partner.evaluate(() => window.__vetlock.tick()); await partner.waitForTimeout(1200);
check('asked again, nothing is paid twice: no new invoice, the same two payments', LN.length === asked && (await arrived()) === 600 && (await partner.evaluate(() => window.__vetlock.cPayouts().map(m => m.state + ' ' + m.amount).join())) === 'paid 300,paid 300', `${LN.length - asked} new invoices · ${await arrived()} sat arrived in all`);

// ---------- 200 + 100 sat: the first is paid; the second donation goes another way ----------
const r2 = await ask('NUBE', [[200, d3], [100, d4]]); await r2.take(0); await look(); await look(); const p3 = await payOf(r2.q.id);
check('another request, its first transaction taken: paid in part (200 of 300)', !!p3 && p3.state === 'part' && p3.amount === 200 && p3.of === 300, JSON.stringify(p3));
const q3 = await C.makeRequest({ campaign: camp, patient: 'SOL', procedure: 'spay', date: '2026-11-12', contributions: [{ release: 100, proofs: d4 }], payee: A.pk, dest }), a3 = await C.certify(q3, A.sk), t3 = await C.reqTx(q3, q3.contributions[0]);
await C.destSwap(w, t3, [C.destSign(t3, S.sk), a3.sigs[0]]); await look(); await look(); const p4 = await payOf(r2.q.id), s4 = await screen(r2.q.id);
check('its second donation is spent another way (under another request here; a donor\'s refund is the same to this request): it ends paid for what came, and nothing of the other payment is taken for its own', !!p4 && p4.state === 'paid' && p4.amount === 200 && p4.of === 300 && p4.sent === 200 && (await arrived()) === 800, JSON.stringify(p4) + ` · ${await arrived()} sat arrived in all`);
check('…and its screen says in red what was not paid', s4.includes(`✓ 200 sat sent to ${ADDR}`) && s4.includes('✗ 100 sat of 300 sat were not paid: that donation is no longer locked. Ask Streetcat.'), s4.split('\n').filter(l => /sent|to come|✗/.test(l)).join(' / '));
// ---------- 64 sat: confirmed, and then its only donation is paid under another request ----------
const r4 = await ask('RAYO', [[64, d5]]), q5 = await C.makeRequest({ campaign: camp, patient: 'MAR', procedure: 'spay', date: '2026-11-12', contributions: [{ release: 64, proofs: d5 }], payee: A.pk, dest }), a5 = await C.certify(q5, A.sk), t5 = await C.reqTx(q5, q5.contributions[0]);
await C.destSwap(w, t5, [C.destSign(t5, S.sk), a5.sigs[0]]); await look(); await look(); const p5 = await payOf(r4.q.id), s5 = await screen(r4.q.id), kept = LN.length; await look();
check('a confirmed request whose donation is spent another way before anything of it is paid: "not paid", in red, instead of waiting for ever; and it is not asked about again', !!p5 && p5.state === 'none' && p5.amount === 0 && s5.includes('✗ Not paid: its donations are no longer locked') && !/once Streetcat releases/.test(s5) && LN.length === kept && (await arrived()) === 800, JSON.stringify(p5) + ' · ' + (s5.split('\n').find(l => /Not paid|once Streetcat/.test(l)) || ''));
say(bad ? `destpart: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'destpart: every check passed'); await b.close(); process.exit(bad ? 1 : 0);
