// The journals of Lightning payments and swaps (group 4 of the six scans, 14–15 Nov: 4.1, 4.3, 4.4, 4.8, 4.17, 4.22, 4.28), each
// tried the way it was found, in Chromium against the local mints (3338 plain, 3340 the dest rule, fake money) and a local Lightning
// address server (LUD-16) whose invoices are the plain mint's, so it can pay them. What was found, and what is checked:
// - a campaign could be made at a mint that does not say it restores (NUT-09), and its donor paid there with no warning (4.4): the mint
//   is refused now, for the maker and before any donation;
// - the record of a swap the mint did was dropped when the mint's restore came back empty once, and the donation with it (4.3): kept,
//   and finished when the mint hands it back;
// - with a PIN, a Lightning invoice written before 14 Nov kept its refund key in the clear beside it when the list of refund keys
//   could not take it (4.1): the invoices waiting are sealed with the keys now;
// - a dest campaign's mint stopped saying it enforces where donations go while an invoice was being paid (4.28): the sats, already
//   paid, come back to the donor as ecash, not donated;
// - a Lightning payout's "paid" mark on its released ecash, or its change, could not be kept and was lost (4.8, 4.17); the change of a
//   refund the same (4.22): the mark is put when the app opens, and the change is owed and asked back from the mint.
// Each check fails on the code before. The partner's payments (3.27) are in destpay_test. Not covered: a real mint that restores late.
import { chromium } from 'playwright';
import fs from 'fs'; import http from 'http';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', DMINT = process.env.DMINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, amt = C.amt, sum = ps => ps.reduce((s, p) => s + amt(p.amount), 0), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey()), now = () => Math.floor(Date.now() / 1000), sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
let dest = false; try { dest = C.destMint(await (await fetch(DMINT + '/v1/info')).json()); } catch (_) {}
const w = new cashu.Wallet(MINT); await w.loadMint(); const dw = new cashu.Wallet(DMINT); if (dest) await dw.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await sleep(300); } } throw new Error('mint quote never paid'); };
const tokenOf = (mint, ps) => cashu.getEncodedToken({ mint, proofs: ps.map(p => ({ ...p, amount: amt(p.amount) })) });
const liveSum = async (wal, tok) => { try { const ps = wal.decodeToken(tok).proofs, st = await wal.checkProofsStates(ps); return st.every(s => s.state === 'UNSPENT') ? sum(ps) : -1; } catch (_) { return -2; } };  /* what a token holds, if all of it is unspent */
// a Lightning address server: name@127.0.0.1:7482, its invoices the plain mint's, LN.short sat under what is asked (so change is left)
const LN = { port: 7482, short: 0 }, lnServer = http.createServer(async (req, res) => { const u = new URL(req.url, 'http://127.0.0.1'), send = j => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(j)); };
  if (/^\/\.well-known\/lnurlp\/[a-z]+$/.test(u.pathname)) return send({ tag: 'payRequest', callback: `http://127.0.0.1:${LN.port}/cb`, minSendable: 1000, maxSendable: 100000000, metadata: '[["text/plain","test"]]' });
  if (u.pathname === '/cb') { const sat = Math.max(1, Math.floor(Number(u.searchParams.get('amount')) / 1000) - LN.short), q = await w.createMintQuoteBolt11(sat); return send({ pr: q.request, routes: [] }); }
  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end(); }); await new Promise(r => lnServer.listen(LN.port, '127.0.0.1', r));
const SCADDR = `streetcat@127.0.0.1:${LN.port}`, DONADDR = `donor@127.0.0.1:${LN.port}`;
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
// the phone's storage refusing a key, as a full phone does: while sessionStorage 'refuse' lists it (with `has`, only a value holding that text)
const refuser = () => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { let rules = null; try { rules = JSON.parse(sessionStorage.getItem('refuse') || 'null'); } catch (_) {}
  if (this === localStorage && Array.isArray(rules) && rules.some(r => r.key === k && (!r.has || String(v).includes(r.has)))) throw new DOMException('no room', 'QuotaExceededError'); return set.call(this, k, v); }; };
const refuse = (p, rules) => p.evaluate(r => sessionStorage.setItem('refuse', JSON.stringify(r)), rules);
const page = async ({ init } = {}) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(() => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} }); if (init) await c.addInitScript(init);
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const one = s => String(s).replace(/\s+/g, ' ').slice(0, 150);

const sc = newSk(), cl = newSk(); await b.pin(C.pubOf(sc));
const camp = await C.signCampaign({ name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline: now() + 30 * 86400 }, sc);
const linkOf = c => BASE + 'index.html#c=' + Buffer.from(JSON.stringify(c)).toString('base64url');
const donorAt = async (c, opt) => { const d = await page(opt); await d.goto(linkOf(c)); await d.reload(); await d.waitForTimeout(900); return d; };
const pasteGive = async (d, n) => { await d.fill('#d-amt', String(n)); await d.evaluate(() => window.__vetlock.openTab('decash')); await d.waitForTimeout(1200);
  await d.fill('#d-token', tokenOf(MINT, await plain(n))); await d.click('#d-go'); return waitText(d, '#de-out', /LOCKED|✗|Failed|Mint refused|Interrupted|Not possible/, 30000); };
// Rescue's app and a partner's, as payout_test has them: a donation locked as before 15 Nov (proof by proof), certified, released
const rescue = async ({ init } = {}) => { const clinic = await page(), s = await page({ init });
  await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1300); const clinicPk = await clinic.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
  await tab(s, 'release'); await s.click('#s-new'); await s.waitForTimeout(1300); const scPk = await txt(s, '#s-pk');
  const rc = await s.evaluate(c => window.scCore.signCampaign(c, window.__vetlock.heldKeys('streetcat')[0]), { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: scPk, clinic: clinicPk, deadline: now() + 30 * 86400 });
  const donate = async n => { const lock = new cashu.LockBuilder().addMainPubkey([rc.streetcat, rc.clinic]).requireMainSignatures(2).addRefundPubkey(C.pubOf(newSk())).lockUntil(rc.deadline);
    const locked = await w.ops.receive(tokenOf(MINT, await plain(n))).asLocked(lock).run(); return cashu.getEncodedToken({ mint: MINT, proofs: locked, memo: `${rc.name} · donation` }); };
  const certify = tok => clinic.evaluate(async t => { const V = window.__vetlock, { dec } = await V.decodeTok(t), info = V.lockInfo(dec.proofs), want = info.pubkeys.map(k => String(k).toLowerCase()), sk = V.heldKeys('clinic').find(k => want.includes(V.pubOf(k)));
    return sk ? cashu.getEncodedToken({ mint: dec.mint, proofs: cashu.signP2PKProofs(dec.proofs, sk), memo: `${(dec.memo || 'donation').split(' ')[0]} · certified: the operation was done · signed by clinic ${V.pubOf(sk).slice(0, 10)}` }) : null; }, tok);
  const release = async tok => { await tab(s, 'release'); await s.fill('#s-token', ''); await s.fill('#s-token', tok); await waitText(s, '#s-info', /certified/); await s.waitForTimeout(600); await s.click('#s-go');
    return waitText(s, '#s-out', /sent to|Not sent|has not said|Import this plain token|Not possible|Failed|could not keep/, 40000); };
  const setAddr = async a => { await tab(s, 'keys'); if (await s.$eval('#x-ln-box', e => e.hidden)) await s.click('#x-ln-b'); await s.fill('#h-ln', a); await s.press('#h-ln', 'Tab'); await s.waitForTimeout(200);
    for (let i = 0; i < 75; i++) { const t = await s.$eval('#h-ln-st', e => e.textContent.trim()); if (!/^checking/.test(t)) return t; await s.waitForTimeout(200); } return 'still checking'; };
  return { s, donate, certify, release, setAddr, close: async () => { await s.context().close(); await clinic.context().close(); } }; };

// 4.4 · a mint that does not say it restores (NUT-09)
{ const noRestore = async r => { const res = await r.fetch(), j = await res.json(); if (j && j.nuts) delete j.nuts['9']; return r.fulfill({ response: res, json: j }); };
  const c0 = await page(); await tab(c0, 'csettings'); await c0.click('#cs-new'); await c0.waitForTimeout(1300); const cpk = await txt(c0, '#cs-pk');
  const s = await page(); await tab(s, 'release'); await s.click('#s-new'); await s.waitForTimeout(1300); await s.route(MINT + '/v1/info', noRestore); await tab(s, 'campaign'); await s.reload(); await tab(s, 'campaign');
  await s.fill('#k-name', 'NUBE'); await s.fill('#k-mint', MINT); await s.fill('#k-c', cpk); await s.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await s.click('#k-go');
  const out = await waitText(s, '#k-out', /is ready|cannot hold|cannot read/, 30000);
  check('4.4 · no campaign is made at a mint that does not say it can hand back a lost answer (NUT-09)', /This mint cannot hold these donations/.test(out) && /✗ NUT-09/.test(out) && !/is ready/.test(out), one(out.split('\n').filter(l => /NUT-09|cannot hold|ready/.test(l)).join(' | ')));
  await s.context().close(); await c0.context().close();
  const d = await page(); await d.route(MINT + '/v1/info', noRestore); await d.goto(linkOf(camp)); await d.reload(); await d.waitForTimeout(900);
  await d.fill('#d-amt', '5'); await d.click('#d-ln'); const ln = await waitText(d, '#d-out', /waiting for the payment|Failed|LOCKED/, 20000);
  const p5 = await plain(5); await d.evaluate(() => window.__vetlock.openTab('decash')); await d.waitForTimeout(1200); await d.fill('#d-token', tokenOf(MINT, p5)); await d.click('#d-go'); const de = await waitText(d, '#de-out', /LOCKED|✗|Not possible|Failed/, 20000);
  check('4.4 · and nobody donates through one: no invoice is made, pasted ecash is not swapped, and both say why', /^Failed: .*does not say it can hand back an answer that is lost \(NUT-09/.test(ln) && /NUT-09/.test(de) && !/LOCKED/.test(de) && (await liveSum(w, tokenOf(MINT, p5))) === 5 && (await d.evaluate(() => window.__vetlock.pendings().length)) === 0, one(ln) + ' | ' + one(de)); await d.context().close(); }

// 4.3 · a swap the mint did, its answer an error, the mint's restore empty once: the record is kept, the donation recovered
{ const d = await donorAt(camp); let n = 0;
  await d.route('**/v1/swap', async r => { await r.fetch(); return r.fulfill({ status: 400, json: { detail: 'an error, although it was done', code: 11000 } }); });
  await d.route('**/v1/restore', r => n++ === 0 ? r.fulfill({ json: { outputs: [], signatures: [] } }) : r.continue());
  const st = await pasteGive(d, 5), fl1 = await d.evaluate(() => window.__vetlock.flights().length);
  check('4.3 · the mint did the swap and answered with an error, and its restore gave nothing yet: the swap\'s record is kept, and it says nothing is lost', fl1 === 1 && /Nothing is lost: this browser kept what it needs/.test(st), `records ${fl1} · ${one(st)}`);
  await d.unroute('**/v1/swap'); await d.unroute('**/v1/restore'); await d.reload(); await d.waitForFunction(() => !document.getElementById('recovered').hidden, null, { timeout: 30000 }).catch(() => {}); await d.waitForTimeout(800);
  const fl2 = await d.evaluate(() => window.__vetlock.flights().length), k = (await d.evaluate(() => window.__vetlock.donorKeys())).filter(x => x.lockedToken), rec = await txt(d, '#recovered').catch(() => '');
  check('4.3 · opened again, the mint hands it back: the donation is kept with its refund key, live at the mint, and only then the record goes', fl2 === 0 && k.length === 1 && (await liveSum(w, k[0].lockedToken)) === 5 && /donation: 5 sat/.test(rec), `records ${fl2} · kept ${k.length} · ${one(rec)}`); await d.context().close(); }

// 4.1 · with a PIN, a Lightning invoice of before 14 Nov (its refund key beside it), and no room to move the key to the list of refund keys
{ const d = await donorAt(camp, { init: refuser }); await d.evaluate(pin => window.scVault.set(pin), '48291736');
  const lsk = newSk(); await d.evaluate(l => localStorage.setItem('vetlock.pending', JSON.stringify(l)), [{ quote: 'legacy-q1', request: 'lnbc1legacy', amount: 5, campaign: camp, sk: lsk, created: new Date().toISOString() }]);
  await refuse(d, [{ key: 'vetlock.donor.keys' }]); await d.reload(); await d.waitForTimeout(2500);
  const raw = await d.evaluate(() => localStorage.getItem('vetlock.pending') || ''), on = await d.evaluate(() => window.scVault.on()), read = await d.evaluate(() => window.__vetlock.pendings().length);
  check('4.1 · with a PIN, the invoices waiting are sealed with the keys: one of before leaves no refund key in the clear, even with no room to move it, and the app still reads it', on && !raw.includes(lsk) && /^pin1:/.test(raw) && read === 1, `PIN ${on} · sealed ${/^pin1:/.test(raw)} · in the clear ${raw.includes(lsk)} · read ${read}`); await refuse(d, []); await d.context().close(); }

// 4.28 · a dest campaign: the invoice paid, and the mint no longer says it enforces where donations go
if (dest) { const dcamp = await C.signCampaign({ name: 'SOL', op: 'sterilisation', mint: DMINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), lock: 'dest', deadline: now() + 30 * 86400 }, sc);
  const d = await donorAt(dcamp); await d.route(DMINT + '/v1/mint/quote/bolt11/*', r => r.abort('failed'));  /* the page cannot see the invoice paid until the mint has changed */
  await d.fill('#d-amt', '8'); await d.click('#d-ln'); await waitText(d, '#d-st', /waiting for the payment|retrying/, 20000);
  await d.route(DMINT + '/v1/info', async r => { const res = await r.fetch(), j = await res.json(); if (j && j.nuts && j.nuts['11']) delete j.nuts['11'].dest; return r.fulfill({ response: res, json: j }); });
  await d.unroute(DMINT + '/v1/mint/quote/bolt11/*'); const out = await waitText(d, '#d-out', /taken back to you as ecash|LOCKED/, 40000);
  const k = (await d.evaluate(() => window.__vetlock.donorKeys())).find(x => x.refundToken), left = await d.evaluate(() => window.__vetlock.pendings().length), tok = k ? k.refundToken : '';
  check('4.28 · paid, and the mint stopped saying it enforces where donations go: the sats come back to the donor as plain ecash, kept here and said, and nothing is donated', /stopped saying it enforces where donations may go/.test(out) && /taken back to you as ecash/.test(out) && !!k && !k.lockedToken && (await liveSum(dw, tok)) === 8 && dw.decodeToken(tok).proofs.every(p => !String(p.secret).startsWith('[')) && left === 0, `${one(out)} · invoices waiting ${left}`); await d.context().close(); }

// 4.8 · paid out to Streetcat's address, and the "paid" mark on the released ecash could not be written
{ const R = await rescue({ init: refuser }); await R.setAddr(SCADDR);
  await R.s.route('**/v1/melt/bolt11', async r => { await refuse(R.s, [{ key: 'vetlock.released' }]); return r.continue(); });
  const out = await R.release(await R.certify(await R.donate(21))); await R.s.unroute('**/v1/melt/bolt11'); const before = await R.s.evaluate(() => window.__vetlock.releasedList().filter(x => !x.paid).length);
  await refuse(R.s, []); await R.s.reload(); await R.s.waitForTimeout(2500);
  const pay = await R.s.evaluate(() => window.__vetlock.payouts().slice(-1)[0] || {}), rel = await R.s.evaluate(t => window.__vetlock.releasedList().find(x => x.token === t) || null, pay.token), listed = await txt(R.s, '#s-saved').catch(() => '');
  check('4.8 · a payout whose "paid" mark could not be written: once the app opens the spent ecash is marked paid, and is not offered under Release', before === 1 && pay.state === 'paid' && !!rel && rel.paid === SCADDR && !/sat/.test(listed), `unmarked before ${before} · payout ${pay.state} · marked ${rel && rel.paid} · Release: "${one(listed)}" · ${one(out)}`); await R.close(); }

// 4.17 · paid out with change, and the change could not be kept
{ const R = await rescue({ init: refuser }); await R.setAddr(SCADDR); LN.short = 3;
  await R.s.route('**/v1/melt/bolt11', async r => { await refuse(R.s, [{ key: 'vetlock.released', has: '"memo":"change"' }]); return r.continue(); });
  const out = await R.release(await R.certify(await R.donate(21))); LN.short = 0; await R.s.unroute('**/v1/melt/bolt11'); const due = await R.s.evaluate(() => window.__vetlock.payouts().slice(-1)[0] || {});
  await refuse(R.s, []); await R.s.reload(); await R.s.waitForTimeout(5000);
  const pay = await R.s.evaluate(() => window.__vetlock.payouts().slice(-1)[0] || {}), ch = await R.s.evaluate(() => window.__vetlock.releasedList().filter(x => x.memo === 'change' && !x.paid).map(x => x.token));
  check('4.17 · a payout\'s change that could not be kept is owed: shown to copy, and asked back from the mint and kept once the app opens, once', /could not keep the other 3 sat/.test(out) && due.changeDue === true && pay.state === 'paid' && !pay.changeDue && ch.length === 1 && (await liveSum(w, ch[0])) === 3, `owed ${due.changeDue} → ${pay.changeDue} · change kept ${ch.length} · ${one(out)}`); await R.close(); }

// 4.22 · the donor's refund by Lightning, with change, and the change could not be kept with its key
{ const sc2 = newSk(), cl2 = newSk(); await b.pin(C.pubOf(sc2)); const rc = await C.signCampaign({ name: 'TEO', op: 'castration', mint: MINT, streetcat: C.pubOf(sc2), clinic: C.pubOf(cl2), deadline: now() + 30 }, sc2);
  const d = await donorAt(rc, { init: refuser }); await pasteGive(d, 21); const lockedTok = ((await d.evaluate(() => window.__vetlock.donorKeys())).find(k => k.lockedToken) || {}).lockedToken;
  await sleep(Math.max(0, (rc.deadline - now() + 3) * 1000));
  await tab(d, 'refund'); await d.fill('#r-receipt', lockedTok || ''); await d.dispatchEvent('#r-receipt', 'input'); await d.waitForTimeout(3000); LN.short = 2; await d.fill('#r-ln', DONADDR);
  await d.route('**/v1/melt/bolt11', async r => { await refuse(d, [{ key: 'vetlock.donor.keys' }]); return r.continue(); });
  await d.evaluate(() => { document.getElementById('r-out').textContent = ''; }); await d.click('#r-go'); const out = await waitText(d, '#r-out', /sent to your Lightning wallet|Failed|Not possible|Mint refused|in progress|Interrupted|Not yet/, 40000); LN.short = 0;
  await d.unroute('**/v1/melt/bolt11'); const due = await d.evaluate(() => window.__vetlock.melts().slice(-1)[0] || {}); await refuse(d, []); await d.reload(); await d.waitForTimeout(5000);
  const m = await d.evaluate(() => window.__vetlock.melts().slice(-1)[0] || {}), k = (await d.evaluate(() => window.__vetlock.donorKeys())).find(x => x.lockedToken === lockedTok) || {};
  check('4.22 · a refund\'s change that could not be kept with its key is owed, and asked back from the mint and kept with the key once the app opens', /19 sat sent to your Lightning wallet/.test(out) && due.changeDue === true && m.state === 'paid' && !m.changeDue && (await liveSum(w, k.refundToken || '')) === 2, `owed ${due.changeDue} → ${m.changeDue} · with the key: ${await liveSum(w, k.refundToken || '')} sat live · ${one(out)}`); await d.context().close(); }

say(bad ? `journals: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'journals: every check passed');
await b.close(); lnServer.close(); process.exit(bad ? 1 : 0);
