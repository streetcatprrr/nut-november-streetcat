// Requests without pasting tokens (app/index.html in Chromium, local Nutshell mint with fake money, three local Nostr relays from
// nostr_relay.mjs, one of which refuses every event). A donor locks two donations and sends them to Streetcat from the app; Streetcat
// sees them arrive, asks the clinic for 1 500 sat of the first and all of the second; the clinic, offline for a moment, confirms the
// procedure; Streetcat releases it, and the 600 sat not needed go back under the same lock, findable from the donor's token alone.
// Then a request by link only: the clinic reports a problem and Streetcat opens the answer link; a phone with another clinic key
// cannot confirm; and the published ledger shows the split on the status page.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { startRelay } from './nostr_relay.mjs';
import crypto from 'crypto';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.waitForTimeout(1600); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };  /* after the header's flap */  /* SHOT_DIR=dir: the filled screens at 390 px @2x */
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7211 }), startRelay({ port: 7212 }), startRelay({ port: 7213, refuse: true })]; await Promise.all(relays.map(r => r.ready));
const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: process.env.SHOT_DIR ? 2 : 1 }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); p._ctx = c; return p; };
const donor = await page(), clinic = await page(), sc = await page(), other = await page(), viewer = await page();
for (const p of [donor, clinic, sc, other]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(250); } return s; };
const lastToken = s => s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop(), clip = p => p.evaluate(() => navigator.clipboard.readText());
// a filled screen must fit the phone too: 320, 375, 390 and 430 px wide
const FIT = [], FITBAD = []; const fits = async (p, label) => { const vs = p.viewportSize(), over = []; for (const w of [320, 375, 390, 430]) { await p.setViewportSize({ width: w, height: 740 }); await p.waitForTimeout(80); const o = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${w}px +${o}`); }
  await p.setViewportSize(vs); FIT.push(label); if (over.length) FITBAD.push(`${label}: ${over.join(', ')}`); };

// keys and the campaign (as Streetcat and the clinic do it today)
await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1200); const clinicPk = await txt(clinic, '#cs-pk');
check('the clinic makes its key in settings', /^0[23][0-9a-f]{64}$/.test(clinicPk));
await tab(other, 'csettings'); await other.click('#cs-new'); await other.waitForTimeout(600);
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1200);
await tab(sc, 'campaign'); await sc.reload(); await tab(sc, 'campaign'); await sc.fill('#k-name', 'MOCHI'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk);
await sc.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await sc.click('#k-go'); await waitText(sc, '#k-out', /is ready|cannot|pick another/); await sc.waitForTimeout(1200);
const link = (await txt(sc, '#k-out')).match(/http\S+#c=\S+/)[0];

// two donations, each sent to Streetcat from the donor's app
const give = async n => { await donor.goto(link); await donor.reload(); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(n)); await donor.click('#d-go');
  const s = await waitText(donor, '#d-out', /LOCKED|Failed/); if (!/LOCKED/.test(s)) throw new Error(s); /* it goes to Streetcat by itself */
  const lbl = await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000); return { token: lastToken(s), lbl, amount: Number(s.match(/LOCKED ([\d ]+) sat/)[1].replace(/ /g, '')) }; };
const A = await give(2100), B = await give(21), REST = A.amount - 1500;  /* 600 sat on a free mint; on a mint with input fees the lock itself cost one */
check('the donor\'s app sends each locked donation to Streetcat by relay', /sent to Streetcat/.test(A.lbl) && /sent to Streetcat/.test(B.lbl), A.lbl + ' | ' + B.lbl);

// Streetcat: the donations arrive by themselves
await tab(sc, 'home'); await sc.click('#h-kinds button.tile'); await sc.click('#kd-pots button.req'); await sc.locator('#kd-pots .row2 button', { hasText: 'donations and requests' }).click();
await sc.click('#sc-check'); const net1 = await waitText(sc, '#sc-net', /donation|checked/);
const dons = await sc.$$eval('#sc-dons .item .nm', xs => xs.map(x => x.textContent));
await fits(sc, 'Streetcat\'s campaign'); await shot(sc, 'r1-streetcat-campaign'); check('Streetcat receives both donations from the relays, checked against the campaign', dons.length === 2 && dons.every(x => /^DON-[0-9A-F]{8}$/.test(x)), net1);

// a request: 1 500 sat of the first donation, all of the second
await sc.click('#sc-new'); await sc.waitForFunction(() => document.querySelectorAll('#sn-dons input').length === 2, null, { timeout: 30000 });
await sc.fill('#sn-cat', 'MOCHI'); await sc.fill('#sn-proc', 'sterilisation (spay)');
const rows = await sc.$$eval('#sn-dons .item', xs => xs.map(x => ({ ref: x.querySelector('.nm').textContent, avail: Number(x.querySelector('.sub2').textContent.match(/^([\d ]+) sat/)[1].replace(/ /g, '')) })));
const big = rows.find(r => r.avail > 1000), small = rows.find(r => r.avail < 1000);
await sc.fill('#sn-use-' + big.ref, '1500'); await sc.locator(`#sn-dons .item:has-text("${small.ref}") button`, { hasText: 'all' }).click();
await fits(sc, 'the new request'); await shot(sc, 'r2-new-request'); const total = 1500 + small.avail; check('the request adds up what each donation pays: it is its cost, and the line under the pot says it is covered', (await sc.inputValue('#sn-cost')) === String(total) && (await txt(sc, '#sn-cover')).replace(/ /g, '').startsWith(`${total}of${total}sat✓`), `${await sc.inputValue('#sn-cost')} · ${await txt(sc, '#sn-cover')}`);
await sc.click('#sn-go'); const sent = await waitText(sc, '#sq-steps', /sent · [23] of 3/, 30000);
check('the request goes to the clinic by relay (two relays confirm; the third refuses)', /sent · 2 of 3/.test(sent), sent.split('\n')[1]);
check('…so no buttons to send it another way, only a small link to show it as QR', await sc.isHidden('#sq-send') && await sc.isVisible('#sq-qra') && (await txt(sc, '#sq-qra')) === 'Clinic offline? Show it as QR');

// the clinic: the request arrives; nothing can be confirmed before ticking the box; offline, the answer waits
await tab(clinic, 'work'); await clinic.click('#w-check'); await waitText(clinic, '#w-n', /^1$/); await showW(clinic, 'w-pend');
check('the request appears on the clinic\'s list, to review', (await txt(clinic, '#w-list')).includes('MOCHI · sterilisation (spay)')); await fits(clinic, 'the clinic\'s requests'); await shot(clinic, 'r3-clinic-requests');
await clinic.click('#w-list .item'); const dl = await txt(clinic, '#cr-dl');
check('the clinic sees the cat, the procedure and what it releases', /MOCHI/.test(dl) && dl.replace(/ /g, '').includes(String(total)), dl.replace(/\s+/g, ' ').slice(0, 120));
check('"Confirm procedure" stays off until the box is ticked', await clinic.isDisabled('#cr-go')); await fits(clinic, 'a request to review'); await shot(clinic, 'r4-clinic-review');
// the vet's invoice: only its fingerprint goes into the declaration
const INV = Buffer.from('%PDF-1.4\n% invoice 2026-118 · MOCHI · spay · test only\n'), INV_SHA = crypto.createHash('sha256').update(INV).digest('hex');
{ const [fc] = await Promise.all([clinic.waitForEvent('filechooser'), clinic.click('#cr-inv')]); await fc.setFiles({ name: 'invoice-2026-118.pdf', mimeType: 'application/pdf', buffer: INV }); }
// wait for the fingerprint itself: the line before a file is picked also says "fingerprint" ("only the file's fingerprint (SHA-256) goes…")
const evl = await waitText(clinic, '#cr-ev', /fingerprint [0-9a-f]{16}…/); await shot(clinic, 'r12-clinic-invoice-added');
check('the clinic adds the invoice: its fingerprint is shown, the file stays on the phone', evl.includes(`invoice · fingerprint ${INV_SHA.slice(0, 16)}… · invoice-2026-118.pdf stays on this phone`), evl);
await clinic._ctx.setOffline(true); await clinic.check('#cr-ok'); await clinic.click('#cr-go'); const conf = await waitText(clinic, '#cr-out', /CONFIRMED/);
const confRed = await clinic.$$eval('#cr-out .bad', es => es.some(e => /^✗ Not sent: no connection/.test(e.textContent)));
check('offline, the clinic confirms; the answer says in red that it is not sent, and only then offers the other ways', /✗ Not sent: no connection\. It goes by itself once there is one\.\nOr give it to Streetcat another way:/.test(conf) && confRed && await clinic.isVisible('#cr-out button:has-text("copy link for Streetcat")') && await clinic.isVisible('#cr-out button:has-text("show as QR")'), conf.split('\n').slice(-2).join(' / '));
await shot(clinic, 'r5-clinic-confirmed-offline'); await tab(clinic, 'work'); await showW(clinic, 'w-pend'); await shot(clinic, 'r6-clinic-waiting'); check('…listed under "Waiting to be sent"', (await txt(clinic, '#w-list')).includes('Waiting to be sent'));
await clinic._ctx.setOffline(false); await clinic.evaluate(() => window.__vetlock.flush()); await clinic.waitForTimeout(800); await tab(clinic, 'work');
await showW(clinic, 'w-pend'); const pend82 = await txt(clinic, '#w-list'); await showW(clinic, 'w-dn'); const done82 = await txt(clinic, '#w-list');
check('back online, it goes out and moves to "Done"', /Done/.test(done82) && /MOCHI/.test(done82) && !/Waiting to be sent/.test(pend82), pend82 + ' | ' + done82);
await clinic.locator('#w-list .item', { hasText: 'MOCHI' }).click(); const sentNow = await waitText(clinic, '#cr-out', /✓ sent to Streetcat/);
check('…and the answer says so: sent to Streetcat, no buttons to copy it, a small link to show it as QR', /✓ sent to Streetcat · 2 of 3 relays have it\n· received by Streetcat/.test(sentNow) && !(await clinic.isVisible('#cr-out button:has-text("copy link for Streetcat")')) && await clinic.isVisible('#cr-out a:has-text("Streetcat offline? Show it as QR")'), sentNow.split('\n').slice(-2).join(' / '));
await fits(clinic, 'the answer, sent'); await shot(clinic, 'r13-clinic-answer-sent');

// Streetcat: the answer arrives, it is checked, and the release puts the rest back under the lock
await tab(sc, 'scamp'); await sc.click('#sc-check'); await waitText(sc, '#sc-net', /answer/); await sc.click('#sc-reqs .item');
const steps = await txt(sc, '#sq-steps'); check('Streetcat checks the answer: every proof and the declaration', /✓ certified: all \d+ proofs signed with MOCHI's clinic key, and its declaration names exactly them/.test(steps), steps.split('\n')[3]);
check('…and sees that the clinic received the request', /received by the clinic · /.test(steps));
await tab(clinic, 'work'); await clinic.click('#w-check'); await clinic.waitForTimeout(1500); await showW(clinic, 'w-dn'); await clinic.locator('#w-list .item', { hasText: 'MOCHI' }).click(); const recd = await waitText(clinic, '#cr-out', /✓ received by Streetcat/, 20000);
check('…and the clinic\'s answer then says "received by Streetcat"', /✓ sent to Streetcat · 2 of 3 relays have it\n✓ received by Streetcat · /.test(recd), recd.split('\n').slice(-2).join(' / '));
await shot(clinic, 'r14-clinic-answer-received');
await sc.click('#sq-go'); const rel = await waitText(sc, '#sq-out', /RELEASED|Not possible|refused|Interrupted/, 40000);
await fits(sc, 'the released request'); await shot(sc, 'r7-streetcat-released'); const relAmt = Number((rel.match(/RELEASED ([\d ]+) sat/) || [0, '0'])[1].replace(/ /g, ''));
check('the release pays the procedure, less only the mint fee', relAmt > 0 && relAmt <= total && relAmt >= total - 3, rel.split('\n')[0]);
const back1 = Number((rel.match(/(\d+) sat went back under the same lock/) || [0, 0])[1]);
check(`what the one split proof gives back goes under the same lock, and it is small: the donation is cut in tenths (8 Nov), so under 128 sat of the ${REST} not needed; the rest was never touched`, back1 > 0 && back1 < 128 && back1 <= REST, `${back1} sat went back`);
const released = lastToken(await sc.evaluate(() => window.__vetlock.releasedList().map(r => r.token).join(' ')));
const relProofs = w.decodeToken(released).proofs; check('the released ecash is plain (Streetcat\'s to spend)', relProofs.every(p => !String(p.secret).startsWith('["P2PK"')), relProofs.length + ' proofs');

// the donor's token alone finds the rest at the mint (core.js, NUT-09), without trusting anything Streetcat publishes
const rest = await donor.evaluate(async tok => { const w = new cashu.Wallet(cashu.getTokenMetadata(tok).mint); await w.loadMint(); const t = await window.scCore.traceDonation(w, w.decodeToken(tok).proofs); return t.filter(x => x.state === 'UNSPENT').reduce((s, x) => s + window.scCore.amt(x.proof.amount), 0); }, A.token);
check(`the donor's own token finds the ${REST} sat still locked`, rest === REST, rest + ' sat');

// a second request, by link only (no relay copy is read): the clinic reports a problem, Streetcat opens the answer link
await tab(sc, 'scamp'); await sc.click('#sc-new'); await sc.waitForFunction(() => document.querySelectorAll('#sn-dons input').length === 1, null, { timeout: 30000 });
await sc.fill('#sn-cat', 'TEO'); await sc.fill('#sn-proc', 'castration'); await sc.locator('#sn-dons button', { hasText: 'all' }).click();
await sc.evaluate(u => localStorage.setItem('vetlock.relays', u), relays[2].url);  /* for this one, only the relay that refuses every event */
await sc.click('#sn-go'); await sc.waitForFunction(() => document.getElementById('sreq').classList.contains('on') && /TEO/.test(document.getElementById('sq-dl').textContent), null, { timeout: 30000 });
const nots = await waitText(sc, '#sq-send-st', /Not sent/); await shot(sc, 'r15-streetcat-request-not-sent');
check('when no relay takes it, Streetcat\'s request says so in red, and only then offers the other ways', nots === '✗ Not sent: no relay took it.\nOr give it to the clinic another way:' && await sc.$$eval('#sq-send-st .bad', es => es.length === 1) && await sc.isVisible('#sq-link') && await sc.isHidden('#sq-qrl'), nots.split('\n')[0]);
await sc.click('#sq-link'); const qlink = await clip(sc); await sc.evaluate(u => localStorage.setItem('vetlock.relays', u), RELAYS); check('the request also travels as a link that opens as the clinic', /[?&]role=clinic#q=sc[01]\./.test(qlink), qlink.slice(0, 70) + '…');
await other.goto(qlink); await waitText(other, '#cr-dl', /TEO/); const ow = await txt(other, '#cr-warn');
await fits(other, 'a request for another clinic key'); await shot(other, 'r8-clinic-other-key'); check('a phone with another clinic key cannot confirm it', /no clinic key for MOCHI/.test(ow) && await other.isDisabled('#cr-ok'), ow.split('\n')[0]);
await clinic.goto(qlink); await waitText(clinic, '#cr-dl', /TEO/); await clinic._ctx.setOffline(true); await clinic.click('#cr-prob summary'); await clinic.click('#cr-why button[data-r="postponed"]'); await clinic.fill('#cr-note', 'the cat was not caught today'); await clinic.click('#cr-report');
const rep = await waitText(clinic, '#cr-out', /PROBLEM REPORTED/); await shot(clinic, 'r9-clinic-reported'); check('the clinic reports a problem instead of confirming', /PROBLEM REPORTED \(postponed\)/.test(rep));
await clinic.locator('#cr-out button', { hasText: 'copy link for Streetcat' }).click(); const alink = await clip(clinic); await clinic._ctx.setOffline(false);
await sc.goto(alink); const st2 = await waitText(sc, '#sq-steps', /reports a problem/);
check('Streetcat opens the answer link and reads the signed report', /the clinic reports a problem \(postponed\): the cat was not caught today/.test(st2)); check('…and nothing can be released for it', await sc.isDisabled('#sq-go'));

// a third request, in person, with no connection at the clinic: the request is a QR on Streetcat's screen, the answer a QR on the clinic's.
// It pays 100 sat from the rest of the first donation, so that rest is split again (its own rest goes back under the lock too).
const scanIn = async (p, parts) => { for (const f of parts.slice().reverse()) { await p.evaluate(t => window.__vetlock.scanFeed(t), f); await p.waitForTimeout(30); } };
await clinic._ctx.setOffline(true);  /* before the request exists: the app's own check of the relays (every minute) cannot bring it first */
await tab(sc, 'scamp'); await sc.click('#sc-new'); await sc.waitForFunction(() => document.querySelectorAll('#sn-dons input').length === 1, null, { timeout: 30000 });
await sc.fill('#sn-cat', 'TEO'); await sc.fill('#sn-proc', 'castration'); await sc.fill('#sn-dons input', '100'); await sc.click('#sn-go'); await waitText(sc, '#sq-steps', /made/);
await sc.click('#sq-qra'); await sc.waitForSelector('#sq-term .qr'); await shot(sc, 'r11-streetcat-request-qr'); const fq = await sc.evaluate(() => window.__vetlock.frames('sq-term')); check('Streetcat shows the request as a QR (animated when long)', fq.length >= 1, fq.length + ' part' + (fq.length > 1 ? 's' : ''));
await tab(clinic, 'work'); await clinic.click('#w-open'); await clinic.click('#w-scan'); await scanIn(clinic, fq);
const dl3 = await waitText(clinic, '#cr-dl', /TEO/); check('the clinic, offline, scans it and the request opens', /in person, by QR/.test(dl3), (dl3.match(/Arrived.*$/) || [''])[0]);
await clinic.check('#cr-ok'); await clinic.click('#cr-go'); await waitText(clinic, '#cr-out', /CONFIRMED/);
await clinic.locator('#cr-out button', { hasText: 'show as QR' }).click(); await clinic.waitForSelector('#cr-out .term .qr'); const fans = await clinic.evaluate(() => document.querySelector('#cr-out .term')._frames || []);
await fits(clinic, 'the answer as a QR'); await shot(clinic, 'r10-clinic-answer-qr'); await clinic.evaluate(() => window.__vetlock.tick()); await clinic.waitForTimeout(300); check('…and shows its answer as a QR, which stays on screen', fans.length >= 1 && !!(await clinic.$('#cr-out .term .qr')), fans.length + ' part' + (fans.length > 1 ? 's' : ''));
await tab(sc, 'scamp'); await sc.evaluate(() => { document.getElementById('sc-add').open = true; }); await sc.click('#sc-scan'); await scanIn(sc, fans);
const st3 = await waitText(sc, '#sq-steps', /certified|✗/); check('Streetcat scans the answer and checks it like any other', /✓ certified: all \d+ proofs signed with MOCHI's clinic key/.test(st3));
await sc.click('#sq-go'); const rel3 = await waitText(sc, '#sq-out', /RELEASED|Not possible|refused|Interrupted/, 40000);
const back3 = Number((rel3.match(/(\d+) sat went back under the same lock/) || [0, 0])[1]);
check('…and releases it: what a split gives back, if any, is small again (under 128 sat)', /^RELEASED/.test(rel3) && back3 < 128, rel3.split('\n')[0].slice(0, 90));
await clinic._ctx.setOffline(false);
const rest2 = await donor.evaluate(async tok => { const w = new cashu.Wallet(cashu.getTokenMetadata(tok).mint); await w.loadMint(); const t = await window.scCore.traceDonation(w, w.decodeToken(tok).proofs); return t.filter(x => x.state === 'UNSPENT').reduce((s, x) => s + window.scCore.amt(x.proof.amount), 0); }, A.token);
check(`the donor's token still finds what is left (${REST - 100} sat), two splits on`, rest2 === REST - 100, rest2 + ' sat');

// the ledger Streetcat publishes: each donation by its code, the split with what it paid and what went back
await tab(sc, 'home'); await sc.click('#h-kinds button.tile'); await sc.click('#kd-pots button.req'); await sc.locator('#kd-pots .row2 button', { hasText: 'copy ledger' }).click(); await sc.waitForTimeout(300); const L = JSON.parse(await clip(sc));
const eA = L.entries.find(e => e.amount > 1000); check('the ledger lists the split donation with its parts and its rests', eA && eA.parts.map(x => x.amount).join('+') === '1500+100' && eA.remainders.length === 2, eA && `${eA.ref} ${eA.amount} → ${eA.parts.map(x => x.amount).join('+')} + ${eA.remainders.length} rest tokens`);
check('…and holds no key', !/refundKey|"sk"|privkey/.test(JSON.stringify(L)));
const evs = L.certificates.map(x => x.statement.evidence).filter(Boolean);
check('the clinic\'s declaration carries the invoice\'s fingerprint, and nothing of the file', evs.length === 1 && evs[0].sha256 === INV_SHA && evs[0].kind === 'invoice' && !JSON.stringify(L).includes('invoice-2026-118') && !JSON.stringify(L).includes(INV.toString('base64').slice(0, 24)));
await viewer.route('**/campaigns/mochi.json', r => r.fulfill({ json: L })); await viewer.goto(BASE + 'status.html?l=campaigns/mochi.json');
await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 40000 }); await viewer.waitForTimeout(1500);
const page2 = await viewer.evaluate(() => document.body.innerText); const evText = async () => viewer.$$eval('.ev', xs => xs.map(x => x.textContent));
const evLines = await evText(); check('the status page shows the fingerprint, and says when a declaration has none', evLines.some(t => t.startsWith(`invoice fingerprint ${INV_SHA.slice(0, 16)}…`)) && evLines.some(t => t === 'no receipt fingerprint'), evLines.join(' | '));
const checkFile = async buffer => { const [fc] = await Promise.all([viewer.waitForEvent('filechooser'), viewer.locator('.ev a', { hasText: 'check a file' }).first().click()]); await fc.setFiles({ name: 'invoice-2026-118.pdf', mimeType: 'application/pdf', buffer }); await viewer.waitForTimeout(500); return (await evText()).find(t => t.startsWith('invoice fingerprint')); };
check('…the invoice itself matches it, checked in the browser', /✓ invoice-2026-118\.pdf is the file the clinic declared/.test(await checkFile(INV))); await viewer.evaluate(() => { const e = document.querySelector('.ev'); if (e) e.scrollIntoView({ block: 'center' }); }); await shot(viewer, 'r13-status-fingerprint-matches');
check('…and a changed copy does not', /✗ invoice-2026-118\.pdf is not the file the clinic declared/.test(await checkFile(Buffer.concat([INV, Buffer.from(' ')]))));
const sumOnPage = re => [...page2.matchAll(re)].reduce((t, m) => t + Number(m[1].replace(/ /g, '')), 0), lockedOnPage = sumOnPage(/(\d[\d ]*) sat locked/g), releasedOnPage = sumOnPage(/(\d[\d ]*) sat released/g);
check(`the status page shows the splits from the mint: 1600 released in two releases (whole proofs, and a put-back rest spent later), and what is locked (put back, or never touched) adds up to ${REST - 100}`, releasedOnPage === 1600 && lockedOnPage === REST - 100, (page2.match(/\d+ sat released[^\n]*/g) || []).join(' | ') + ` · locked on page: ${lockedOnPage}`);

// the app keeps how far each relay was read (review of 9 Nov: relay load): after a check, the next asks from two days back, not nine
{ const marks = await clinic.evaluate(() => JSON.parse(localStorage.getItem('vetlock.clinic.relaymarks') || '{}')), n0 = relays[0].stats.reqs.length;
  await clinic.evaluate(() => window.__vetlock.tick()); await clinic.waitForTimeout(1500); const asked = relays[0].stats.reqs.slice(n0).flat().filter(f => f.kinds && f.kinds.includes(1059)).map(f => f.since), t = Math.floor(Date.now() / 1000);
  check('the partner\'s app keeps a mark per relay, and its next check reads two days back, not nine', Object.keys(marks).some(u => u === relays[0].url) && asked.length > 0 && asked.every(s => t - s < 2 * 86400 + 1200), `${Object.keys(marks).length} relays marked · read back ${asked.map(s => ((t - s) / 86400).toFixed(2)).join(', ')} days`); }

check('these filled screens fit at 320, 375, 390 and 430 px', !FITBAD.length, FITBAD.length ? 'wider: ' + FITBAD.join(' · ') : FIT.join(' · '));
await b.close(); await Promise.all(relays.map(r => r.close()));
say(bad ? `requests: ${bad} check(s) failed` : 'requests: every check passed'); process.exit(bad ? 1 : 0);

// the partner's home shows its requests only once one of its two numbers is tapped (9 Nov): show that one (if not shown) and wait for it typed in
async function showW(p, id){ await p.evaluate(id => { const b = document.getElementById(id); if (b && !b.classList.contains('on')) b.click(); }, id); await p.waitForFunction(() => !document.querySelector('#w-list [style*="max-height"]'), null, { timeout: 15000 }).catch(() => {}); }
