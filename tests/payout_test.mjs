// What Streetcat releases goes straight to its Lightning address (StreetCat, 6 Nov: "lo suyo es que fuese directamente una dirección
// Lightning"), against the local mint and a local Lightning address server (LUD-16) whose invoices are the local mint's, so the mint
// can pay them. Home checks the address when it is saved; a release is then paid out at once, the most the mint can pay after its
// fees, and only the unused fee stays in this browser; if the mint's answer about the payment is lost, the page asks the mint and does
// not pay twice; and an address that does not answer keeps the released ecash here, said in red, with its copy button, as before.
import { chromium } from 'playwright';
import http from 'http';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338';
const say = (...a) => console.log(...a), now = () => Math.floor(Date.now() / 1000);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
// Streetcat's Lightning address on a local test server: streetcat@127.0.0.1:7252 takes payments, nobody@… does not exist
const LN = { port: 7252, quotes: [] }, lnServer = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://127.0.0.1'), send = j => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(j)); };
  if (u.pathname === '/.well-known/lnurlp/streetcat') return send({ tag: 'payRequest', callback: `http://127.0.0.1:${LN.port}/cb`, minSendable: 1000, maxSendable: 100000000, metadata: '[["text/plain","Streetcat"]]' });
  if (u.pathname === '/cb') { const sat = Math.floor(Number(u.searchParams.get('amount')) / 1000), q = await w.createMintQuoteBolt11(sat); LN.quotes.push({ sat, quote: q.quote }); return send({ pr: q.request, routes: [] }); }
  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end(); }); await new Promise(r => lnServer.listen(LN.port, '127.0.0.1', r));
const ADDR = `streetcat@127.0.0.1:${LN.port}`, NOBODY = `nobody@127.0.0.1:${LN.port}`;

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }); await c.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} });
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), out = async (p, id) => ((await p.textContent('#' + id)) || '').trim();
const waitOut = async (p, id, re, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await out(p, id); if (re.test(s)) return s; await p.waitForTimeout(200); } return out(p, id); };
const donor = await page(), clinic = await page(), sc = await page();
await tab(clinic, 'certify'); await clinic.click('#c-new'); await clinic.waitForTimeout(1200); const clinicPk = await out(clinic, 'c-pk');
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1200); const scPk = await out(sc, 's-pk');
const camp = { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: scPk, clinic: clinicPk, deadline: now() + 30 * 86400 };
const donate = async n => { await tab(donor, 'donate'); await donor.evaluate(() => { const a = document.getElementById('d-again'); if (a) a.click(); }); await donor.fill('#d-camp', JSON.stringify(camp)); await donor.evaluate(() => window.__vetlock.openTab('decash'));
  await donor.fill('#d-token', await plain(n)); await donor.click('#d-go'); const s = await waitOut(donor, 'd-out', /LOCKED|Failed/); if (!/LOCKED/.test(s)) throw new Error(s); return s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop(); };
const certify = async tok => { await tab(clinic, 'certify'); await clinic.fill('#c-token', ''); await clinic.fill('#c-token', tok); await waitOut(clinic, 'c-info', /names/); await clinic.click('#c-go'); await waitOut(clinic, 'c-out', /CERTIFIED|Failed/);
  return clinic.evaluate(() => [...document.querySelectorAll('#c-out .mut.code')].map(e => e.textContent).find(t => /^cashuB/.test(t))); };
const release = async tok => { await tab(sc, 'release'); await sc.fill('#s-token', ''); await sc.fill('#s-token', tok); await waitOut(sc, 's-info', /certified/); await sc.waitForTimeout(600); await sc.click('#s-go');
  return waitOut(sc, 's-out', /sent to|Not sent|has not said|Import this plain token|Not possible|Failed/, 40000); };
const setAddr = async a => { await tab(sc, 'home'); await sc.fill('#h-ln', a); await sc.press('#h-ln', 'Tab'); return waitOut(sc, 'h-ln-st', /✓|✗|Empty/, 15000); };
const kept = () => sc.evaluate(() => window.__vetlock.releasedList().filter(r => !r.paid).map(r => r.amount)), total = a => a.reduce((s, x) => s + x, 0);

// the address is checked when it is saved
let st = await setAddr(NOBODY); check('an address that does not answer is said in red when it is saved', /^✗ nobody@127\.0\.0\.1:7252: it answered HTTP 404\. Until it answers, what is released stays in this browser\./.test(st), st.slice(0, 100));
st = await setAddr('not an address'); check('…and something that is not a Lightning address is not saved', /is not a Lightning address \(name@domain\): nothing was saved/.test(st) && await sc.evaluate(() => localStorage.getItem('vetlock.sc.payto')) === NOBODY);
st = await setAddr(ADDR); check('an address that takes payments is saved, and says so', /^✓ Every release is paid at once to streetcat@127\.0\.0\.1:7252\./.test(st));

// a release is paid out at once: the most the mint can pay after its fees
const N = MINT.endsWith('3339') ? '\\d+' : null;  /* on the fee mint each swap costs a little, so the amounts released are smaller */
const certA = await certify(await donate(21)); const relA = await release(certA), qA = LN.quotes[LN.quotes.length - 1], relAmt = Number((/^RELEASED (\d+) sat/.exec(relA) || [])[1] || 0);
const paidA = qA ? (await w.checkMintQuoteBolt11(qA.quote)).state : '';
check('the release is paid at once to Streetcat\'s Lightning address, and its invoice is paid', !!qA && new RegExp(`^RELEASED ${N || 21} sat\\. ${qA.sat} sat sent to streetcat@127\\.0\\.0\\.1:7252 ✓`).test(relA) && /PAID|ISSUED/.test(paidA), relA.split('\n')[0].slice(0, 140));
const k1 = await kept(); check('…what was sent is no longer kept in this browser; at most the unused fee stays, as ecash', !!qA && relAmt > 0 && !k1.includes(relAmt) && total(k1) <= relAmt - qA.sat, `kept: ${k1.join(', ') || 'nothing'}`);
check('…and the button says it is done', (await sc.textContent('#s-go')).trim() === '✓ Released' && await sc.isDisabled('#s-go'));

// the mint pays but its answer is lost: the page asks the mint, says it was sent, and pays nothing twice
await sc.route('**/v1/melt/bolt11', async r => { await r.fetch().catch(() => {}); return r.abort('failed'); });
const n0 = LN.quotes.length, certB = await certify(await donate(13)); const relB = await release(certB); await sc.unroute('**/v1/melt/bolt11');
const qB = LN.quotes[LN.quotes.length - 1], paidB = qB ? (await w.checkMintQuoteBolt11(qB.quote)).state : '';
check('if the mint\'s answer about the payment is lost, the page asks the mint and says it was sent', new RegExp(`^RELEASED ${N || 13} sat\\. \\d+ sat sent to streetcat@127\\.0\\.0\\.1:7252 ✓`).test(relB) && /PAID|ISSUED/.test(paidB) && LN.quotes.length - n0 <= 2, relB.split('\n')[0].slice(0, 120));
check('…and that payment is not pending any more', await sc.evaluate(() => JSON.parse(localStorage.getItem('vetlock.sc.payouts') || '[]').every(x => x.state !== 'pending')));

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
