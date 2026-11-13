// End-to-end test of donating with Lightning (app/index.html in Chromium, local Nutshell mint, fake Lightning that pays its own invoices).
// Covers: the mint check on a new campaign, an invoice paid and minted straight into a locked token, a reload between payment and minting,
// release by clinic + Streetcat, a refund paid out to a Lightning invoice, a too-large invoice refused before anything moves, and a closed campaign.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338';
const say = (...a) => console.log(...a);
const now = () => Math.floor(Date.now() / 1000);
const w = new Wallet(MINT); await w.loadMint();

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const p = await (await b.newContext()).newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); return p; };
const donor = await page(), clinic = await page(), streetcat = await page();
for (const p of [donor, clinic, streetcat]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t);  // picks the role that owns the tab, then opens it
const out = async (p, id) => (await p.textContent('#' + id)).trim();
const waitOut = async (p, id, re, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await out(p, id); if (re.test(s)) return s; await p.waitForTimeout(200); } return out(p, id); };
const again = p => p.evaluate(() => { const a = document.getElementById('d-again'); if (a) a.click(); });  // after a LOCKED result the form is hidden
const lastToken = s => s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop();
const lockOf = token => { const s = JSON.parse(w.decodeToken(token).proofs[0].secret)[1]; const t = Object.fromEntries(s.tags.map(x => [x[0], x.slice(1)])); return { keys: [s.data, ...(t.pubkeys || [])], nsigs: Number(t.n_sigs[0]), refund: t.refund, locktime: Number(t.locktime[0]) }; };

await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1500); const clinicPk = await clinic.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
await tab(streetcat, 'release'); await streetcat.click('#s-new'); await streetcat.waitForTimeout(1500); const scPk = await out(streetcat, 's-pk');

// Streetcat makes the campaign; the page reads the mint first
await tab(streetcat, 'campaign'); await streetcat.reload(); await tab(streetcat, 'campaign');
await streetcat.fill('#k-name', 'MOCHI'); await streetcat.fill('#k-mint', MINT); await streetcat.fill('#k-c', clinicPk); await streetcat.fill('#k-to', 'donaciones@streetcat.example');
await streetcat.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await streetcat.click('#k-go');
await waitOut(streetcat, 'k-out', /is ready|cannot|pick another/); await streetcat.waitForTimeout(1500); const kout = await out(streetcat, 'k-out');
say('mint check:\n  ' + kout.split('\n').filter(l => /^(Mint:|✓|✗|Input fee)/.test(l.trim())).join('\n  '));
const linkM = kout.match(/http\S+#c=\S+/); if (!linkM) { console.log('K-OUT:', kout.slice(0, 400)); process.exit(1); } const link = linkM[0];

// 1) pay an invoice: the page mints a token that is locked from the start
await donor.goto(link); await donor.reload(); await donor.fill('#d-amt', '21'); await donor.click('#d-ln');
const l1 = await waitOut(donor, 'd-out', /LOCKED|Failed|expired/); say('lightning donation:', l1.split('\n')[0], '| tells where to send it:', /donaciones@streetcat\.example/.test(l1));
const tok1 = lastToken(l1), r1 = await donor.evaluate(t => window.__vetlock.receiptOf(t), tok1), lk = lockOf(tok1);
const refundPk = r1.refund.pub;
say('  lock in the minted token:', lk.nsigs === 2 && lk.keys.sort().join() === [scPk, clinicPk].sort().join() ? '2 of [Streetcat, clinic]' : 'WRONG', '| refund key is the receipt\'s:', lk.refund[0] === refundPk, '| pending invoices left:', (await donor.evaluate(() => window.__vetlock.pendings().length)));

// 2) paid, but the page is gone before it collects the ecash (a phone switching apps): the reload must finish the job
await donor.route('**/v1/mint/bolt11', r => r.abort());
await again(donor); await donor.fill('#d-amt', '8'); await donor.click('#d-ln');
await donor.waitForFunction(() => /retrying|nothing is lost/.test(document.getElementById('d-out').textContent), null, { timeout: 30000 });
say('paid but not collected: QR shown:', await donor.evaluate(() => !!document.querySelector('#d-out .qr svg')), '| invoice kept in the browser:', await donor.evaluate(() => window.__vetlock.pendings().length));
await donor.unroute('**/v1/mint/bolt11'); await donor.reload();
const l2 = await waitOut(donor, 'd-out', /LOCKED|Failed|expired|already/); say('after the reload:', l2.split('\n')[0], '| pending invoices left:', await donor.evaluate(() => window.__vetlock.pendings().length));

// 2b) the mint issues the ecash but its answer never arrives: the page must get it back from the mint (NUT-09 restore)
let lost = 0; await donor.route('**/v1/mint/bolt11', async r => { if (lost++ === 0) { await r.fetch(); return r.abort(); } return r.continue(); });
await again(donor); await donor.fill('#d-amt', '34'); await donor.click('#d-ln');
const l2b = await waitOut(donor, 'd-out', /LOCKED|Failed|expired|could not get it back/); say('mint answer lost:', l2b.split('\n')[0], '| pending invoices left:', await donor.evaluate(() => window.__vetlock.pendings().length));
await donor.unroute('**/v1/mint/bolt11');

// 2c) a crafted link without a usable deadline would have no refund path: refused
await donor.goto(BASE + 'index.html'); await tab(donor, 'donate'); await donor.fill('#d-camp', JSON.stringify({ name: 'BAD', mint: MINT, streetcat: scPk, clinic: clinicPk, deadline: 'soon' })); await donor.fill('#d-amt', '5'); await donor.click('#d-ln');
say('link with a bad deadline:', (await waitOut(donor, 'd-out', /LOCKED|Failed/)).split('\n')[0].slice(0, 100) + '…');

// 3) clinic certifies, Streetcat releases the first one; the mint's answer to the release is lost once
// What the partner's "Certify a token" did, before it was removed (review of 12 Nov: it signed any pasted token, with no request): its key
// signs every proof of a donation locked to it. Release still takes a token certified that way, so this test makes one in the page.
const certifyIn = (p, tok, memo = 'the operation was done') => p.evaluate(async ([t, m]) => { const V = window.__vetlock, { dec } = await V.decodeTok(t), info = V.lockInfo(dec.proofs), want = info.pubkeys.map(k => String(k).toLowerCase()), sk = V.heldKeys('clinic').find(k => want.includes(V.pubOf(k)));
  return sk ? cashu.getEncodedToken({ mint: dec.mint, proofs: cashu.signP2PKProofs(dec.proofs, sk), memo: `${(dec.memo || 'donation').split(' ')[0]} · certified: ${m} · signed by clinic ${V.pubOf(sk).slice(0, 10)}` }) : null; }, [tok, memo]);
const cert = await certifyIn(clinic, tok1);
let lostSwap = 0; await streetcat.route('**/v1/swap', async r => { if (lostSwap++ === 0) { await r.fetch(); return r.abort(); } return r.continue(); });
await tab(streetcat, 'release'); await streetcat.fill('#s-token', cert); await streetcat.click('#s-go'); say('release, answer lost:', (await waitOut(streetcat, 's-out', /RELEASED|refused/)).split('\n')[0], '| kept in the browser:', (await streetcat.evaluate(() => window.__vetlock.releasedList().length)));
await streetcat.unroute('**/v1/swap');

// 3b) the release of the 8-sat donation: the answer is lost AND the mint cannot be asked again right now; reopening the page finishes it
const cert2 = await certifyIn(clinic, lastToken(l2));
let lostSwap2 = 0; await streetcat.route('**/v1/swap', async r => { if (lostSwap2++ === 0) { await r.fetch(); return r.abort(); } return r.continue(); }); await streetcat.route('**/v1/restore', r => r.abort());
await tab(streetcat, 'release'); await streetcat.fill('#s-token', cert2); await streetcat.click('#s-go'); say('release, answer lost, no restore yet:', (await waitOut(streetcat, 's-out', /RELEASED|refused|Interrupted/)).split('\n')[0].slice(0, 110) + '…', '| unfinished:', await streetcat.evaluate(() => window.__vetlock.flights().length));
await streetcat.unroute('**/v1/swap'); await streetcat.unroute('**/v1/restore'); await streetcat.reload();
await streetcat.waitForFunction(() => !document.getElementById('recovered').hidden, null, { timeout: 30000 }).catch(() => {});
say('after reopening:', (await out(streetcat, 'recovered')).split('\n').slice(0, 2).join(' / ').slice(0, 110), '| unfinished:', await streetcat.evaluate(() => window.__vetlock.flights().length), '| released kept:', await streetcat.evaluate(() => window.__vetlock.releasedList().length));

// 4) a short campaign nobody certifies: two Lightning donations, then refunds after the deadline
const teo = await streetcat.evaluate(c => window.scCore.signCampaign(c, window.__vetlock.heldKeys('streetcat')[0]), { name: 'TEO', op: 'sterilisation', mint: MINT, streetcat: scPk, clinic: clinicPk, deadline: now() + 12 });  /* signed by Streetcat: an unsigned link takes no donation */
const lnDonate = async (camp, n) => { await donor.goto(BASE + 'index.html'); await tab(donor, 'donate'); await donor.fill('#d-camp', JSON.stringify(camp)); await donor.fill('#d-amt', String(n)); await donor.click('#d-ln'); return lastToken(await waitOut(donor, 'd-out', /LOCKED|Failed/)); };
const tok3 = await lnDonate(teo, 13), tok4 = await lnDonate(teo, 5);
await donor.waitForTimeout(Math.max(0, teo.deadline - now() + 1) * 1000);
await again(donor); await donor.fill('#d-amt', '3'); await donor.click('#d-ln'); say('donating to the closed campaign:', (await waitOut(donor, 'd-out', /LOCKED|Failed/)).split('\n')[0].slice(0, 90) + '…');

await tab(donor, 'refund');
const saved = await donor.evaluate(() => [...document.querySelectorAll('#r-saved button')].map(x => x.textContent)); say('refund tab lists this browser\'s donations:', saved.length, saved.filter(s => /TEO/.test(s)).join(' | '));
const q10 = await w.createMintQuoteBolt11(10);   // the donor's Lightning wallet: an invoice for 10 sat
await donor.fill('#r-receipt', tok3); await donor.fill('#r-ln', q10.request); await donor.click('#r-go');
const r3 = await waitOut(donor, 'r-out', /sent to your Lightning|failed|refused|in flight|Not yet/); say('refund to Lightning:', r3.split('\n').slice(0, 2).join(' / '));
say('  the invoice was paid:', (await w.checkMintQuoteBolt11(q10.quote)).state);

const q50 = await w.createMintQuoteBolt11(50);
await donor.fill('#r-receipt', tok4); await donor.fill('#r-ln', q50.request); await donor.click('#r-go');
say('too large an invoice:', (await waitOut(donor, 'r-out', /REFUNDED|refused|Not possible|Not yet/)).split('\n')[0].slice(0, 120) + '…');
await donor.fill('#r-ln', ''); await donor.click('#r-go'); say('same donation, as ecash:', (await waitOut(donor, 'r-out', /REFUNDED|refused/)).split('\n')[0]);
await b.close();
