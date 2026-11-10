// The donor's refund of a donation to a pot that pays from the lock (`dest`), from the app (app/index.html in Chromium, the patched
// test mint of mint/ on port 3340, fake money): receipts opened in a browser that never held their keys. A campaign whose deadline is
// a little over a minute away; three donations locked in the donor's page. Before the deadline: "Refund not available yet", and
// taking it back is refused (by the page, and by the mint when the donor's key signs anyway). Streetcat and the partner release one
// donation whole and 1 500 sat of another, as the app does (one transaction each, signed whole; the rest back under the lock). After
// the deadline: the released one says "Released"; the split one says how much was released and how much can be taken back, the
// proofs never touched and the rest put back together, and they come back as ecash in one spend signed whole with the refund key;
// the third goes to a Lightning address; another browser reads "Already refunded" from the mint alone. The signers can no longer
// pay the partner what the donor took back. Not covered: a refund whose answer is lost (refund_test, the same code), a mint with fees.
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import { pinBrowser, pin } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey()), amt = C.amt, total = ps => ps.reduce((s, p) => s + amt(p.amount), 0);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
if (!C.destMint(await (await fetch(MINT + '/v1/info')).json())) { say(`destrefund: needs the patched mint at ${MINT} (see mint/README.md)`); process.exit(1); }
const w = new cashu.Wallet(MINT); await w.loadMint(); const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), denoms = Object.keys(ks.keys).map(Number);
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return cashu.getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const fails = async f => { try { await f(); return ''; } catch (e) { return String(e && e.message || e); } };
// a Lightning address on a local test server (LUD-16): its invoices are the mint's own, so the mint can pay them
const LN = { port: 7257 }, lnServer = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://127.0.0.1'), send = j => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(j)); };
  if (u.pathname === '/.well-known/lnurlp/donor') return send({ tag: 'payRequest', callback: `http://127.0.0.1:${LN.port}/cb`, minSendable: 1000, maxSendable: 100000000, metadata: '[["text/plain","test donor"]]' });
  if (u.pathname === '/cb') return send({ pr: (await w.createMintQuoteBolt11(Math.floor(Number(u.searchParams.get('amount')) / 1000))).request, routes: [] });
  res.writeHead(404); res.end(); }); await new Promise(r => lnServer.listen(LN.port, '127.0.0.1', r));
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Madrid' });
  await c.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} });
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(200); } return s; };
const go = async (p, re, ms = 40000) => { await p.evaluate(() => { document.getElementById('r-out').textContent = ''; }); await p.click('#r-go'); return waitText(p, '#r-out', re, ms); };  /* never read the last answer for this one */
const fmt = n => String(n).replace(/\B(?=(\d{3})+$)/g, ' ') + ' sat';

// the campaign (one partner, paid from the lock) and three donations, locked in the donor's page
const sc = newSk(), cl = newSk(), now = () => Math.floor(Date.now() / 1000), camp = await C.signCampaign({ name: 'TEO', op: 'castration', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), lock: 'dest', deadline: now() + 75 }, sc); await pin(camp.streetcat);  /* signed: an unsigned link takes no donation; the test's own Streetcat key, pinned next to the published one (pin.mjs) */
const donor = await page(); await tab(donor, 'donate');
const lock = async n => { await donor.evaluate(() => { const a = document.getElementById('d-again'); if (a) a.click(); }); await donor.fill('#d-camp', JSON.stringify(camp)); await donor.evaluate(() => { window.__vetlock.openTab('decash'); });
  await donor.fill('#d-token', await plain(n)); await donor.click('#d-go'); const s = await waitText(donor, '#d-out', /LOCKED|Failed|✗/, 40000), token = (s.match(/cashuB[A-Za-z0-9_\-=]+/g) || []).pop(); if (!token) throw new Error('not locked: ' + s.slice(0, 200));
  return { token, receipt: JSON.stringify(await donor.evaluate(t => window.__vetlock.receiptOf(t), token)), proofs: w.decodeToken(token).proofs, sk: await donor.evaluate(t => (window.__vetlock.donorKeys().find(k => k.lockedToken === t) || {}).sk, token) }; };
const A = await lock(64), B = await lock(96), D = await lock(2100);
check('three donations are locked under the campaign\'s lock, the one that says where they may go', [A, B, D].every(x => x.proofs.every(p => C.lockProblem(C.lockOf(p.secret), camp) === '' && C.lockOf(p.secret).dest === 'pubkeys')), `${A.proofs.length + B.proofs.length + D.proofs.length} proofs`);

// a browser with no key reads a receipt: before the deadline
const viewer = await page(); await tab(viewer, 'refund'); const open = async (p, r) => { await p.evaluate(() => { document.getElementById('r-out').textContent = ''; }); await p.fill('#r-receipt', ''); await p.fill('#r-receipt', r); return waitText(p, '#r-info', /Checked with the mint[\s\S]*(Refund|Released|refunded|Nothing|unavailable)/, 30000); };
let s = await open(viewer, A.receipt); check('before the deadline: "Refund not available yet"', /Refund not available yet/.test(s) && /It opens \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC/.test(s) && camp.deadline > now(), (s.match(/It opens [^.]*/) || [''])[0]);
s = await go(viewer, /Not yet|REFUNDED|Failed/); check('…and taking it back is refused until then', /^Not yet: the deadline has not passed/.test(s), s.slice(0, 70));
const early = await fails(() => w.ops.receive(A.proofs).privkey(A.sk).asCustom(cashu.OutputData.createRandomData(total(A.proofs), ks)).run());
check('…by the mint too, when the donor\'s key signs anyway', !!early && camp.deadline > now(), early || 'ACCEPTED');

// Streetcat and the partner release B whole and 1 500 sat of D, as the app does: one transaction each, signed whole
const dest = { keysetId: ks.id, denoms, fee: ps => amt(w.getFeesForProofs(ps)) };
const release = async (proofs, amount) => { const plan = C.planRelease(proofs, amount), q = await C.makeRequest({ campaign: camp, patient: 'TEO', procedure: 'castration', date: '2026-11-10', contributions: [{ release: amount, proofs: plan.inputs }], dest }), a = await C.certify(q, cl), tx = await C.reqTx(q, q.contributions[0]);
  await C.destSwap(w, tx, [C.destSign(tx, sc), a.sigs[0]]); return { rest: tx.rest, tx }; };
await release(B.proofs, total(B.proofs)); const relD = await release(D.proofs, 1500), backD = total(D.proofs) - 1500;  /* relD.rest: what the one split proof put back; backD: all that is still locked, the untouched proofs too */
await new Promise(r => setTimeout(r, Math.max(0, camp.deadline - now() + 2) * 1000));

// after the deadline
s = await open(viewer, B.receipt); check('a donation released whole says "Released", from the mint\'s record of the transaction', /Released/.test(s) && s.includes(`Streetcat released ${fmt(total(B.proofs))}: nothing is left to take back`), (s.match(/The clinic confirmed[^\n]*/) || [s.slice(-120)])[0]);
s = await open(viewer, D.receipt); check(`a split donation: ${fmt(backD)} can be taken back (the proofs never touched and the ${relD.rest} sat put back), 1 500 sat were released`, /Refund available/.test(s) && relD.rest > 0 && s.includes(`${fmt(backD)} can be taken back now. 1 500 sat of this donation were released; the rest is still under the lock.`), (s.match(/\d[\d ]* sat can be taken back now\.[^\n]*/) || [s.slice(-140)])[0]);
let out = await go(viewer, /REFUNDED|Failed|Not possible|Mint refused/); s = await waitText(viewer, '#r-info', /Nothing left to take back|Refund completed|Already refunded/, 15000);
check('…taken back as ecash in one spend, signed whole with the refund key', out.startsWith(`REFUNDED ${fmt(backD)}. Import this token into your wallet:`) && s.includes(`1 500 sat released · ${fmt(backD)} taken back`), out.split('\n')[0] + ' · ' + (s.match(/[\d ]+ sat released ·[^\n]*/) || [''])[0]);
const tokD = (out.match(/cashuB[A-Za-z0-9_\-=]+/g) || []).pop(), plainD = tokD ? w.decodeToken(tokD).proofs : [], stD = plainD.length ? await w.checkProofsStates(plainD) : [];
check('…and what came back is plain ecash, unspent at the mint, under no lock', total(plainD) === backD && stD.every(x => x.state === 'UNSPENT') && plainD.every(p => !C.lockOf(p.secret)), `${total(plainD)} sat in ${plainD.length} proofs`);
s = await open(viewer, A.receipt); check('a donation still locked: "Refund available"', /Refund available/.test(s) && s.includes(`${fmt(total(A.proofs))} can be taken back now`), (s.match(/\d[\d ]* sat can be taken back now/) || [''])[0]);
await viewer.fill('#r-ln', `donor@127.0.0.1:${LN.port}`); out = await go(viewer, /sent to your Lightning wallet|Failed|Not possible|Mint refused|in progress|Interrupted/); s = await waitText(viewer, '#r-info', /Refund completed/, 15000);
check('…taken back to a Lightning address', /^REFUNDED 64 sat: \d+ sat sent to your Lightning wallet/.test(out) && /Refund completed/.test(s), out.split('\n')[0]);
const other = await page(); await tab(other, 'refund'); s = await open(other, A.receipt); check('in another browser the same receipt says "Already refunded", read from the mint alone', /Already refunded/.test(s) && s.includes(`refund key: ${fmt(total(A.proofs))}`), (s.match(/Taken back[^\n]*/) || [s.slice(-100)])[0]);
// what the donor took back cannot be paid to the partner any more: the transaction that would have paid it is refused
const late = await fails(async () => { const left = D.proofs.filter(p => !relD.tx.inputs.some(x => x.secret === p.secret)), plan = C.planRelease(left, 100), q = await C.makeRequest({ campaign: camp, patient: 'TEO', procedure: 'castration', date: '2026-11-10', contributions: [{ release: 100, proofs: plan.inputs }], dest }), a = await C.certify(q, cl), tx = await C.reqTx(q, q.contributions[0]); await C.destSwap(w, tx, [C.destSign(tx, sc), a.sigs[0]]); });
check('what the donor took back cannot be paid to the partner afterwards', /already spent/i.test(late), late || 'ACCEPTED');
say(bad ? `destrefund: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'destrefund: every check passed');
await b.close(); lnServer.close(); process.exit(bad ? 1 : 0);
