// Refunds (app/index.html in Chromium, local Nutshell mint with fake money): receipts opened in browsers that never held their keys.
// A campaign whose deadline is a few seconds away, its keys made here; four donations locked in the donor's page. Before the deadline:
// "Refund not available yet", with the date in UTC and local time. Streetcat and the clinic release one donation whole and 1 500 sat
// of another (the rest goes back under the lock). After the deadline: the released one says "Released"; one is taken back as ecash
// ("Refund completed" here, "Already refunded" in another browser); the split one's rest is found and paid to a Lightning address
// (LNURL-pay, a local test server); an invoice too large is refused with the exact most it can be; and a Lightning refund whose answer
// is lost shows "Refund in progress · Do not pay or claim again" until "check now" finds it paid. The estimate comes before any invoice.
// When the answer is lost, what the invoice did not ask for still comes back as ecash, once (review of 9 Nov, A05).
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import { pinBrowser, pin } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', SHOT = process.env.SHOT_DIR, say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey()), amt = C.amt, total = ps => ps.reduce((s, p) => s + amt(p.amount), 0);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plainProofs = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const plain = async n => cashu.getEncodedToken({ mint: MINT, proofs: await plainProofs(n) });
// a Lightning address on a local test server (LUD-16): its invoices are the local mint's, so the mint can pay them
const LN = { port: 7251, quotes: [] }, lnServer = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://127.0.0.1'), send = j => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(j)); };
  if (u.pathname === '/.well-known/lnurlp/donor') return send({ tag: 'payRequest', callback: `http://127.0.0.1:${LN.port}/cb`, minSendable: 1000, maxSendable: 100000000, metadata: '[["text/plain","test donor"]]' });
  if (u.pathname === '/cb') { const sat = Math.floor(Number(u.searchParams.get('amount')) / 1000), q = await w.createMintQuoteBolt11(sat); LN.quotes.push({ sat, quote: q.quote }); return send({ pr: q.request, routes: [] }); }
  res.writeHead(404); res.end(); }); await new Promise(r => lnServer.listen(LN.port, '127.0.0.1', r));
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1, timezoneId: 'Europe/Madrid' }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await c.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} });
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(200); } return s; };
const go = async (p, re, ms = 40000) => { await p.evaluate(() => { document.getElementById('r-out').textContent = ''; }); await p.click('#r-go'); return waitText(p, '#r-out', re, ms); };  /* never read the last answer for this one */
const shot = async (p, name) => { if (SHOT) { await p.waitForTimeout(1200); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };

// the campaign and four donations, locked in the donor's page
const sc = newSk(), cl = newSk(), now = () => Math.floor(Date.now() / 1000), camp = await C.signCampaign({ name: 'TEO', op: 'castration', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline: now() + 40 }, sc);  /* signed: an unsigned link takes no donation */ await pin(camp.streetcat);  /* the test's own Streetcat key, pinned next to the published one (pin.mjs) */
const donor = await page(); await tab(donor, 'donate');
const lock = async n => { await donor.evaluate(() => { const a = document.getElementById('d-again'); if (a) a.click(); }); await donor.fill('#d-camp', JSON.stringify(camp)); await donor.evaluate(() => { window.__vetlock.openTab('decash'); });
  await donor.fill('#d-token', await plain(n)); await donor.click('#d-go'); const s = await waitText(donor, '#d-out', /LOCKED|Failed/); const token = s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop(); return { token, receipt: JSON.stringify(await donor.evaluate(t => window.__vetlock.receiptOf(t), token)), proofs: w.decodeToken(token).proofs }; };
const A = await lock(21), B = await lock(13), D = await lock(2100), E = await lock(8), F = await lock(16);

// a browser with no key reads a receipt: before the deadline
const viewer = await page(); await tab(viewer, 'refund'); const open = async (p, r) => { await p.evaluate(() => { document.getElementById('r-out').textContent = ''; }); await p.fill('#r-receipt', r); return waitText(p, '#r-info', /Checked with the mint[\s\S]*(Refund|Released|refunded|Nothing|unavailable)/, 30000); };
let s = await open(viewer, A.receipt); check('before the deadline: "Refund not available yet", with when it opens in UTC and local time', /Refund not available yet/.test(s) && /It opens \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC \((\d{1,2} [A-Z][a-z]{2}, )?\d{2}:\d{2} CET in Madrid\)/.test(s), (s.match(/It opens [^.]*/) || [''])[0]);
check('…and the estimate of what can come back, before any invoice', /you receive at most about \d+ sat by Lightning, or 21 sat as ecash/.test(s) || /you receive at most about \d+ sat by Lightning, or \d+ sat as ecash/.test(s)); await shot(viewer, 'q1-refund-not-yet');
s = await go(viewer, /Not yet|REFUNDED|Failed/); check('…and taking it back is refused until then, saying when it opens in UTC and local time', /^Not yet: the deadline has not passed\. The refund opens \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC \((\d{1,2} [A-Z][a-z]{2}, )?\d{2}:\d{2} CET in Madrid\)/.test(s), s.split(';')[0]);

// Streetcat and the clinic release B whole, and 1 500 sat of D (the rest goes back under the lock), as the app does
const release = async (proofs, amount) => { const plan = C.planRelease(proofs, amount), q = await C.makeRequest({ campaign: camp, patient: 'TEO', procedure: 'castration', date: '2026-11-05', contributions: [{ release: amount, proofs: plan.inputs }] }), a = await C.certify(q, cl);
  const sigs = C.clinicSigsByY(q, a), inputs = cashu.signP2PKProofs(plan.inputs.map(p => C.withSig(p, sigs.get(C.yOf(p.secret)))), sc), fee = amt(w.getFeesForProofs(inputs)), ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id);
  const bits = n => { const o = []; for (let x = 1; n; x *= 2) { if (n & x) { o.push(x); n -= x; } } return o.reverse(); }, back = plan.split ? await C.remainderOutputs(plan.split, bits(plan.remainder), ks.id) : [];
  await w.ops.receive(inputs).asCustom([...cashu.OutputData.createRandomData(amount - fee, ks), ...back]).run(); return plan.remainder || 0; };
await release(B.proofs, total(B.proofs)); const restD = await release(D.proofs, 1500), backD = total(D.proofs) - 1500;  /* restD: what the one split proof put back; backD: all that is still locked, the untouched proofs too (the donation is cut in tenths, 8 Nov) */
await new Promise(r => setTimeout(r, Math.max(0, camp.deadline - now() + 2) * 1000));

// after the deadline
s = await open(viewer, B.receipt); check('a donation released with the clinic\'s confirmation says "Released"', /Released/.test(s) && /nothing is left to take back/.test(s));
const fmt = n => n.toLocaleString('en').replace(/,/g, ' ') + ' sat';
s = await open(viewer, A.receipt); check('a donation still locked: "Refund available"', /Refund available/.test(s) && s.includes(`${fmt(total(A.proofs))} can be taken back now`), (s.match(/\d[\d ]* sat can be taken back now/) || [''])[0]);
let out = await go(viewer, /REFUNDED|Failed|Not possible|Mint refused/); s = await waitText(viewer, '#r-info', /Refund completed/, 15000);
check('taken back as ecash: REFUNDED, and then "Refund completed"', /^REFUNDED \d+ sat\. Import this token into your wallet:/.test(out) && /Refund completed/.test(s), out.split('\n')[0]);
const other = await page(); await tab(other, 'refund'); s = await open(other, A.receipt); check('…in another browser the same receipt says "Already refunded"', /Already refunded/.test(s));
s = await open(viewer, D.receipt); check(`a split donation: its rest (${restD} sat put back, ${backD} sat still locked in all) is found and can be taken back`, /Refund available/.test(s) && restD > 0 && restD < 128 && new RegExp(`${backD} sat can be taken back now\\. 1 500 sat of this donation were released; the rest is still under the lock\\.`).test(s), (s.match(/\d[\d ]* sat can be taken back now\.[^\n]*/) || [''])[0]);
await shot(viewer, 'q2-refund-split-rest');
const big = await w.createMintQuoteBolt11(5000); await viewer.fill('#r-ln', big.request); out = await go(viewer, /Not possible|REFUNDED|Failed/);
const most = Number(String((out.match(/at most ([\d ]+) sat/) || [0, -1])[1]).replace(/ /g, '')); check('an invoice for more than there is: refused before anything moves, with the exact most', /^Not possible: this invoice is for 5 000 sat/.test(out) && most > 0 && most <= backD && !!(await viewer.$(`#r-out button:has-text("copy ${most}")`)), `at most ${most}`);
await viewer.fill('#r-ln', `donor@127.0.0.1:${LN.port}`); out = await go(viewer, /sent to your Lightning wallet|Failed|Not possible|Mint refused|in progress|Interrupted/);
const paidQ = LN.quotes.length ? await w.checkMintQuoteBolt11(LN.quotes[LN.quotes.length - 1].quote) : null;
s = await waitText(viewer, '#r-info', /Refund completed/, 15000); check('…and the panel then says how much went to the Lightning wallet', /came back to you: \d+ sat to your Lightning wallet\./.test(s), (s.match(/[^\n]*came back to you[^\n]*/) || [''])[0]);
check('the rest is paid to a Lightning address (LNURL-pay): the address\'s invoice is paid', /sent to your Lightning wallet/.test(out) && paidQ && /PAID|ISSUED/.test(paidQ.state), `${(out.match(/REFUNDED[^.]*\./) || [''])[0]} · invoice ${paidQ ? paidQ.state : 'none'} for ${LN.quotes.length ? LN.quotes[LN.quotes.length - 1].sat : '?'} sat`);

// a Lightning refund whose answer is lost: in progress until "check now" finds it paid; never paid twice
s = await open(viewer, E.receipt); const inv = await w.createMintQuoteBolt11(5); await viewer.fill('#r-ln', inv.request);
await viewer.route('**/v1/melt/bolt11', async r => { await r.fetch(); await r.abort('failed'); }); await viewer.route('**/v1/melt/quote/bolt11/**', r => r.abort('failed'));
out = await go(viewer, /in progress|sent to your|Failed|did not go|went through/); s = await waitText(viewer, '#r-info', /Refund in progress/, 15000);
check('the payment went out but its answer was lost: "Refund in progress · Do not pay or claim again"', /Refund in progress · Do not pay or claim again/.test(out) && /Refund in progress · Do not pay or claim again/.test(s) && !(await viewer.isHidden('#r-check')));
check('…and taking it back again is refused meanwhile', /a refund of these sats is in progress/.test(await go(viewer, /in progress|REFUNDED|Failed/))); await shot(viewer, 'q3-refund-in-progress');
await viewer.unroute('**/v1/melt/bolt11'); await viewer.unroute('**/v1/melt/quote/bolt11/**'); await viewer.click('#r-check');
out = await waitText(viewer, '#r-out', /Refund completed|did not go|Still in flight|did not answer/); check('"check now" asks the mint: the invoice was paid, "Refund completed"', /^Refund completed: 5 sat reached your Lightning wallet/.test(out) && (await w.checkMintQuoteBolt11(inv.quote)).state !== 'UNPAID', out.split('\n')[0]);
const ml = await viewer.evaluate(() => window.__vetlock.melts()); check('the melt log kept it from the start, and now says paid', ml.length >= 2 && ml.find(m => m.quote && m.state === 'paid' && m.amount === 5) && !ml.some(m => m.state === 'pending'));
// …and what the invoice did not ask for (8 sat refunded, 5 asked) comes back as ecash, asked back from the mint with the blank outputs the
// payment was sent with (review of 9 Nov, A05: a lost answer lost the change): live at the mint, kept with the receipt's key, once
// what the mint owes back: the refunded sats less the invoice and the payment's input fee (its test Lightning backend charges no routing fee);
// on the fee mint 8 sat come back as 6 after the refund's swap and nothing is left for change, so none is claimed
const owed = m => { const ps = m.token ? w.decodeToken(m.token).proofs : []; return Math.max(0, total(ps) - (m.amount || 0) - amt(w.getFeesForProofs(ps))); };
const changeOf = async (text, m) => { const tok = (text.match(/came back as ecash\. Import it into any Cashu wallet:\n(cashuB[A-Za-z0-9_\-=]+)$/) || [])[1] || '', ps = tok ? w.decodeToken(tok).proofs : [], due = owed(m);
  const liveP = ps.length ? (await w.checkProofsStates(ps)).every(x => x.state === 'UNSPENT') : false, kept = await viewer.evaluate(pk => (window.__vetlock.donorKeys().find(k => k.pk === pk) || {}).refundToken, m.pk);
  const line = new RegExp(`\\nThe other ${due} sat \\(what the invoice did not ask for, plus any unused fee\\) came back as ecash\\.`).test(text);
  return { tok, n: total(ps), due, liveP, ok: m.state === 'paid' && !m.changeDue && (due ? line && total(ps) === due && liveP && m.change === tok && kept === tok : !tok && !/came back as ecash/.test(text)) }; };
const mE = ml.find(m => m.amount === 5 && m.state === 'paid') || {}, cE = await changeOf(out, mE);
check('…and the rest, which the invoice did not ask for, comes back as ecash: live at the mint, kept with the receipt\'s key', cE.ok && (MINT.endsWith('3339') || cE.due === 3), `${cE.n} of ${cE.due} sat owed · live ${cE.liveP}`); await shot(viewer, 'q4-refund-change');
// the answer lost but the mint answers at once: "REFUNDED", paid, and the rest comes back the same way
s = await open(viewer, F.receipt); const invF = await w.createMintQuoteBolt11(5); await viewer.fill('#r-ln', invF.request); await viewer.route('**/v1/melt/bolt11', async r => { await r.fetch(); await r.abort('failed'); });
out = await go(viewer, /went through|in progress|sent to your|Failed|did not go/); await viewer.unroute('**/v1/melt/bolt11');
const mF = (await viewer.evaluate(() => window.__vetlock.melts())).find(m => m.amount === 5 && m.pk !== mE.pk && m.state === 'paid') || {}, cF = await changeOf(out, mF);
check('an answer lost, the mint asked at once: "REFUNDED…the Lightning payment went through", and its rest comes back as ecash, last, to be copied', /^REFUNDED \d+ sat, and the mint says the Lightning payment went through, although its answer was lost: check your wallet\./.test(out) && cF.ok && cF.due > 0 && (MINT.endsWith('3339') || cF.due === 11), `${out.split('\n')[0].slice(0, 110)} · ${cF.n} of ${cF.due} sat owed · live ${cF.liveP}`); await shot(viewer, 'q5-refund-answer-lost-change');
await viewer.reload(); await viewer.waitForTimeout(4000); const mF2 = (await viewer.evaluate(() => window.__vetlock.melts())).find(m => m.id === mF.id) || {};
check('…and opened again, that rest is not asked back twice', mF2.change === cF.tok && !mF2.changeDue && (await viewer.evaluate(pk => (window.__vetlock.donorKeys().find(k => k.pk === pk) || {}).refundToken, mF.pk)) === cF.tok);

await b.close(); lnServer.close(); say(bad ? `refund: ${bad} check(s) failed` : 'refund: every check passed'); process.exit(bad ? 1 : 0);
