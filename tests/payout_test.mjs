// What Streetcat releases goes straight to its Lightning address (StreetCat, 6 Nov: "lo suyo es que fuese directamente una dirección
// Lightning"), against the local mint and a local Lightning address server (LUD-16) whose invoices are the local mint's, so the mint
// can pay them. Home checks the address when it is saved; a release is then paid out at once, the most the mint can pay after its
// fees, and only the unused fee stays in this browser; if the mint's answer about the payment is lost, the page asks the mint and does
// not pay twice; and an address that does not answer keeps the released ecash here, said in red, with its copy button, as before.
import { chromium } from 'playwright';
import http from 'http';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { pinBrowser } from './pin.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', SHOT = process.env.SHOT_DIR;
const shot = async (p, name, wait = 1200) => { if (SHOT) { await p.waitForTimeout(wait); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };  /* SHOT_DIR=dir: the screens at 390 px @2x */
const say = (...a) => console.log(...a), now = () => Math.floor(Date.now() / 1000);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
// Streetcat's Lightning address on a local test server: streetcat@127.0.0.1:7252 takes payments, nobody@… does not exist.
// LN.short: its invoices are that many sat under what is asked, so the payment leaves change (the local mint keeps no fee reserve)
const LN = { port: 7252, quotes: [], short: 0 }, lnServer = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://127.0.0.1'), send = j => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(j)); };
  if (u.pathname === '/.well-known/lnurlp/streetcat') return send({ tag: 'payRequest', callback: `http://127.0.0.1:${LN.port}/cb`, minSendable: 1000, maxSendable: 100000000, metadata: '[["text/plain","Streetcat"]]' });
  if (u.pathname === '/cb') { const sat = Math.max(1, Math.floor(Number(u.searchParams.get('amount')) / 1000) - LN.short), q = await w.createMintQuoteBolt11(sat); LN.quotes.push({ sat, quote: q.quote }); return send({ pr: q.request, routes: [] }); }
  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end(); }); await new Promise(r => lnServer.listen(LN.port, '127.0.0.1', r));
const ADDR = `streetcat@127.0.0.1:${LN.port}`, NOBODY = `nobody@127.0.0.1:${LN.port}`;

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 }); await c.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} });
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); });  /* an uncaught error fails the test (9 Nov: one stopped the Rescue page from loading) */ p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), out = async (p, id) => ((await p.textContent('#' + id)) || '').trim();
const waitOut = async (p, id, re, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await out(p, id); if (re.test(s)) return s; await p.waitForTimeout(200); } return out(p, id); };
const donor = await page(), clinic = await page(), sc = await page();
await tab(clinic, 'certify'); await clinic.click('#c-new'); await clinic.waitForTimeout(1200); const clinicPk = await out(clinic, 'c-pk');
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1200); const scPk = await out(sc, 's-pk');
const camp = await sc.evaluate(c => window.scCore.signCampaign(c, window.__vetlock.heldKeys('streetcat')[0]), { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: scPk, clinic: clinicPk, deadline: now() + 30 * 86400 });  /* signed by Streetcat: an unsigned link takes no donation */
const donate = async n => { await tab(donor, 'donate'); await donor.evaluate(() => { const a = document.getElementById('d-again'); if (a) a.click(); }); await donor.fill('#d-camp', JSON.stringify(camp)); await donor.evaluate(() => window.__vetlock.openTab('decash'));
  await donor.fill('#d-token', await plain(n)); await donor.click('#d-go'); const s = await waitOut(donor, 'd-out', /LOCKED|Failed/); if (!/LOCKED/.test(s)) throw new Error(s); return s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop(); };
const certify = async tok => { await tab(clinic, 'certify'); await clinic.fill('#c-token', ''); await clinic.fill('#c-token', tok); await waitOut(clinic, 'c-info', /names/); await clinic.click('#c-go'); await waitOut(clinic, 'c-out', /CERTIFIED|Failed/);
  return clinic.evaluate(() => [...document.querySelectorAll('#c-out .mut.code')].map(e => e.textContent).find(t => /^cashuB/.test(t))); };
const release = async tok => { await tab(sc, 'release'); await sc.fill('#s-token', ''); await sc.fill('#s-token', tok); await waitOut(sc, 's-info', /certified/); await sc.waitForTimeout(600); await sc.click('#s-go');
  return waitOut(sc, 's-out', /sent to|Not sent|has not said|Import this plain token|Not possible|Failed/, 40000); };
const setAddr = async a => { await tab(sc, 'keys'); if (await sc.$eval('#x-ln-box', e => e.hidden)) await sc.click('#x-ln-b'); await sc.fill('#h-ln', a);  /* in Keys, behind its long button, since 9 Nov */ await sc.press('#h-ln', 'Tab');
  await sc.waitForTimeout(200); for (let i = 0; i < 75; i++) { const t = await sc.$eval('#h-ln-st', e => e.textContent.trim()); if (!/^checking/.test(t)) return t; await sc.waitForTimeout(200); } return 'still checking'; };  /* an address that answers leaves no line (9 Nov); what is wrong is said in red */
const kept = () => sc.evaluate(() => window.__vetlock.releasedList().filter(r => !r.paid).map(r => r.amount)), total = a => a.reduce((s, x) => s + x, 0);

// the address is checked when it is saved
let st = await setAddr(NOBODY); check('an address that does not answer is said in red when it is saved', /^✗ nobody@127\.0\.0\.1:7252: it answered HTTP 404\. Until it answers, what is released stays in this browser\./.test(st), st.slice(0, 100));
st = await setAddr('not an address'); check('…and something that is not a Lightning address is not saved', /is not a Lightning address \(name@domain\): nothing was saved/.test(st) && await sc.evaluate(() => localStorage.getItem('vetlock.sc.payto')) === NOBODY);
st = await setAddr(ADDR); const saved9 = await sc.evaluate(() => localStorage.getItem('vetlock.sc.payto'));
check('an address that takes payments is saved, and leaves no line under it (only what is wrong is said, in red)', st === '' && saved9 === 'streetcat@127.0.0.1:7252', JSON.stringify({ st, saved9 }));
// where the address lives (StreetCat, 9 Nov, 00:24): not on Rescue's Home, but in Keys behind a long button; the Partner's Keys has none
await tab(sc, 'home'); await sc.waitForTimeout(400);
const home9 = await sc.evaluate(() => ({ field: !!document.querySelector('#home #h-ln'), text: document.getElementById('home').textContent }));
check('Rescue\'s Home has no Lightning address field, no "Every release is paid at once…" and no "What Streetcat pays for" line', !home9.field && !/Every release is paid|What Streetcat pays for/.test(home9.text), JSON.stringify({ field: home9.field }));
await tab(sc, 'keys'); await sc.waitForTimeout(300);
const k9 = await sc.evaluate(() => ({ row: !document.getElementById('x-ln-row').hidden, label: document.getElementById('x-ln-b').textContent.trim(), w: Math.round(document.getElementById('x-ln-b').getBoundingClientRect().width), val: document.getElementById('h-ln').value }));
check('…it is in Keys, as Rescue: a long button, "Lightning address", with the address saved behind it', k9.row && k9.label === 'Lightning address' && k9.w >= 300 && k9.val === 'streetcat@127.0.0.1:7252', JSON.stringify(k9));
await tab(clinic, 'keys'); await clinic.waitForTimeout(300); const kc = await clinic.evaluate(() => !document.getElementById('x-ln-row').hidden);
check('…and the Partner\'s Keys has no such button', !kc, String(kc));

// a release is paid out at once: the most the mint can pay after its fees
const N = MINT.endsWith('3339') ? '\\d+' : null;  /* on the fee mint each swap costs a little, so the amounts released are smaller */
const certA = await certify(await donate(21)); const relA = await release(certA), qA = LN.quotes[LN.quotes.length - 1], relAmt = Number((/^RELEASED (\d+) sat/.exec(relA) || [])[1] || 0);
const paidA = qA ? (await w.checkMintQuoteBolt11(qA.quote)).state : '';
check('the release is paid at once to Streetcat\'s Lightning address, and its invoice is paid', !!qA && new RegExp(`^RELEASED ${N || 21} sat\\. ${qA.sat} sat sent to streetcat@127\\.0\\.0\\.1:7252 ✓`).test(relA) && /PAID|ISSUED/.test(paidA), relA.split('\n')[0].slice(0, 140));
const k1 = await kept(); check('…what was sent is no longer kept in this browser; at most the unused fee stays, as ecash', !!qA && relAmt > 0 && !k1.includes(relAmt) && total(k1) <= relAmt - qA.sat, `kept: ${k1.join(', ') || 'nothing'}`);
check('…and the button says it is done', (await sc.textContent('#s-go')).trim() === '✓ Released' && await sc.isDisabled('#s-go'));

// the mint pays but its answer is lost: the page asks the mint, says it was sent, and pays nothing twice
const changes = () => sc.evaluate(() => window.__vetlock.releasedList().filter(r => r.memo === 'change' && !r.paid).map(r => ({ token: r.token, amount: r.amount })));
const live = async cs => { const ps = cs.flatMap(x => w.decodeToken(x.token).proofs); if (!ps.length) return false; return (await w.checkProofsStates(ps)).every(s => s.state === 'UNSPENT'); };
const lastPay = () => sc.evaluate(() => JSON.parse(localStorage.getItem('vetlock.sc.payouts') || '[]').slice(-1)[0] || {});
const ch0 = await changes();
await sc.route('**/v1/melt/bolt11', async r => { await r.fetch().catch(() => {}); return r.abort('failed'); });
const n0 = LN.quotes.length, certB = await certify(await donate(13)); LN.short = 3; const relB = await release(certB); LN.short = 0; await sc.unroute('**/v1/melt/bolt11');
const qB = LN.quotes[LN.quotes.length - 1], paidB = qB ? (await w.checkMintQuoteBolt11(qB.quote)).state : '';
check('if the mint\'s answer about the payment is lost, the page asks the mint and says it was sent', new RegExp(`^RELEASED ${N || 13} sat\\. \\d+ sat sent to streetcat@127\\.0\\.0\\.1:7252 ✓`).test(relB) && /PAID|ISSUED/.test(paidB) && LN.quotes.length - n0 <= 2, relB.split('\n')[0].slice(0, 120));
check('…and that payment is not pending any more', await sc.evaluate(() => JSON.parse(localStorage.getItem('vetlock.sc.payouts') || '[]').every(x => x.state !== 'pending')));
// …and its change comes back too: what the mint did not use of its fee reserve, asked back from it with the blank outputs the payment was
// sent with (NUT-08/09), kept under Release, once (review of 9 Nov, A05: a lost answer settled the payment and lost its change)
{ const pB = await lastPay(), chB = (await changes()).filter(x => !ch0.some(y => y.token === x.token)), relBAmt = Number((/^RELEASED (\d+) sat/.exec(relB) || [])[1] || 0);
  check('…and its change, which the mint did not use of its fee reserve, comes back as ecash under Release, once, live at the mint', pB.state === 'paid' && !pB.changeDue && pB.change > 0 && chB.length === 1 && chB[0].amount === pB.change && (N || pB.change === relBAmt - qB.sat) && await live(chB),
    `paid ${qB && qB.sat} of ${relBAmt}, change ${pB.change} · kept: ${chB.map(x => x.amount).join(', ') || 'nothing'}`); } await shot(sc, 'p1-payout-answer-lost-change');

// the review's case: the answer is lost and the page cannot even ask, so it is closed with the payment pending; opened again, the mint says
// it went through, and the change comes back, once, also after the page is opened once more
const ch1 = await changes();
await sc.route('**/v1/melt/bolt11', async r => { await r.fetch().catch(() => {}); return r.abort('failed'); }); await sc.route('**/v1/melt/quote/bolt11/*', r => r.abort('failed'));
const certD = await certify(await donate(17)); LN.short = 3; const relD = await release(certD), qD = LN.quotes[LN.quotes.length - 1]; LN.short = 0; await sc.unroute('**/v1/melt/bolt11'); await sc.unroute('**/v1/melt/quote/bolt11/*');
const pD0 = await lastPay(); check('an answer lost and the mint not reachable: the payment stays pending, said in red, its change\'s blank outputs kept with it', pD0.state === 'pending' && /has not said yet/.test(relD) && Array.isArray(pD0.outs) && pD0.outs.length > 0, `${pD0.state} · ${(pD0.outs || []).length} blank outputs`);
await sc.reload(); if (SHOT) { await tab(sc, 'release'); await shot(sc, 'p2-payout-pending-reopened', 150); }  /* before the page asks the mint again (2 s) */
const up = await sc.evaluate(() => { const p = JSON.parse(localStorage.getItem('vetlock.sc.payouts') || '[]').slice(-1)[0] || {}, red = [...document.querySelectorAll('#s-saved .mut.bad')].map(e => e.textContent).join(' | ');
  return { app: !!window.__vetlock, pending: p.state === 'pending', red }; });  /* read at once, before the page asks the mint again (2 s) */
check('the page opens while a payment is pending, and Release says it in red (9 Nov: its list stopped the page loading, "Cannot access \'el\' before initialization")', up.app && (!up.pending || /being sent to streetcat@127\.0\.0\.1:7252: the mint has not said yet that it went through/.test(up.red)), JSON.stringify(up).slice(0, 160));
for (let i = 0; i < 40; i++) { await sc.waitForTimeout(250); const p = await lastPay(); if (p.state !== 'pending' && !p.changeDue) break; }
{ const pD = await lastPay(), chD = (await changes()).filter(x => !ch1.some(y => y.token === x.token)), relDAmt = Number((/^⚠ RELEASED (\d+) sat/.exec(relD) || [])[1] || 0);
  check('opened again: the mint says it went through, and its change comes back, once, under Release, live at the mint', pD.id === pD0.id && pD.state === 'paid' && !pD.changeDue && pD.change > 0 && chD.length === 1 && chD[0].amount === pD.change && (N || pD.change === relDAmt - qD.sat) && await live(chD),
    `${pD.state}, paid ${qD && qD.sat} of ${relDAmt}, change ${pD.change} · kept: ${chD.map(x => x.amount).join(', ') || 'nothing'}`);
  await sc.reload(); await sc.waitForTimeout(4000); const chD2 = (await changes()).filter(x => !ch1.some(y => y.token === x.token));
  check('…and opened once more, that change is not kept twice', chD2.length === 1 && chD2[0].token === (chD[0] || {}).token, chD2.map(x => x.amount).join(', ')); }

// an address that does not answer: the released ecash stays here, said in red, with its copy button
await sc.evaluate(a => localStorage.setItem('vetlock.sc.payto', a), NOBODY);
const certC = await certify(await donate(8)); const relC = await release(certC), sumC = MINT.endsWith('3339') ? '\\d+' : '8';
check('an address that does not answer keeps the released ecash in this browser, said in red', new RegExp(`^✗ RELEASED ${sumC} sat\\. Not sent to nobody@127\\.0\\.0\\.1:7252: nobody@127\\.0\\.0\\.1:7252 answered HTTP 404\\. The ${sumC} sat stay in this browser`).test(relC) && await sc.evaluate(() => document.getElementById('s-out').classList.contains('bad')) && !!(await sc.$('#s-out button.sm')), relC.split('\n')[0].slice(0, 140));

// Home counts only what is still here
await tab(sc, 'home'); const rel = await out(sc, 'h-rel'), still = total(await kept());
check('Home counts only what is still in this browser', rel === `${still} sat`, rel);
{ const vs = sc.viewportSize(), over = []; for (const wd of [320, 375, 390, 430]) { await sc.setViewportSize({ width: wd, height: 740 }); await sc.waitForTimeout(80); const o = await sc.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${wd}px +${o}`); } await sc.setViewportSize(vs); check('Home with its address fits at 320, 375, 390 and 430 px', !over.length, over.join(', ')); }
await b.close(); lnServer.close();
say(bad ? `payout: ${bad} check(s) failed` : 'payout: every check passed'); process.exit(bad ? 1 : 0);
