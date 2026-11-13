// End-to-end test of app/index.html in a real browser: three parties, separate storage, local mint.
import { chromium } from 'playwright'; import fs from 'fs';
import { pinBrowser } from './pin.mjs';
const PAGE = 'http://127.0.0.1:8080/index.html', MINT = 'http://127.0.0.1:3338';
const tokens = JSON.parse(fs.readFileSync('../tokens.json', 'utf8'));
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})); const ctx = { donor: await b.newContext(), clinic: await b.newContext(), streetcat: await b.newContext() };
const pages = {}; for (const k in ctx) { pages[k] = await ctx[k].newPage(); pages[k].on('pageerror', e => console.log(k, 'PAGEERROR', e.message)); await pages[k].goto(PAGE); }
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t);  // picks the role that owns the tab, then opens it
const out = async (p, id) => (await p.textContent('#' + id)).trim();
const waitOut = async (p, id, re, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await out(p, id); if (re.test(s)) return s; await p.waitForTimeout(200); } return await out(p, id); };

// keys
await tab(pages.clinic, 'csettings'); await pages.clinic.click('#cs-new'); await pages.clinic.waitForTimeout(1500); const clinicPk = await pages.clinic.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
await tab(pages.streetcat, 'release'); await pages.streetcat.click('#s-new'); await pages.streetcat.waitForTimeout(1500); const scPk = (await pages.streetcat.textContent('#s-pk')).trim();
console.log('clinic pk', clinicPk.slice(0, 12), 'streetcat pk', scPk.slice(0, 12));

// campaign link (Streetcat)
await tab(pages.streetcat, 'campaign'); await pages.streetcat.reload(); await tab(pages.streetcat, 'campaign');
await pages.streetcat.fill('#k-name', 'MOCHI'); await pages.streetcat.fill('#k-mint', MINT); await pages.streetcat.fill('#k-c', clinicPk);
const d = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10); await pages.streetcat.fill('#k-dl', d); await pages.streetcat.click('#k-go');
await waitOut(pages.streetcat, 'k-out', /is ready|cannot|pick another/); await pages.streetcat.waitForTimeout(1500); const kout = await out(pages.streetcat, 'k-out'); const link = kout.match(/http\S+#c=\S+/)[0]; console.log('campaign link ok:', /MOCHI/.test(kout), link.length, 'chars');

// donate
await pages.donor.goto(link); await pages.donor.reload(); await pages.donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await pages.donor.fill('#d-token', tokens.t21); await pages.donor.click('#d-go');
const dout = await waitOut(pages.donor, 'd-out', /LOCKED|Failed/); console.log('donate:', dout.split('\n')[0]);
const lockedToken = dout.match(/cashuB[A-Za-z0-9_\-=]+/g).pop(), receipt = JSON.stringify(await pages.donor.evaluate(t => window.__vetlock.receiptOf(t), lockedToken));  // the receipt, as its file carries it

// certify
// What the partner's "Certify a token" did, before it was removed (review of 12 Nov: it signed any pasted token, with no request): its key
// signs every proof of a donation locked to it. Release still takes a token certified that way, so this test makes one in the page.
const certifyIn = (p, tok, memo = 'the operation was done') => p.evaluate(async ([t, m]) => { const V = window.__vetlock, { dec } = await V.decodeTok(t), info = V.lockInfo(dec.proofs), want = info.pubkeys.map(k => String(k).toLowerCase()), sk = V.heldKeys('clinic').find(k => want.includes(V.pubOf(k)));
  return sk ? cashu.getEncodedToken({ mint: dec.mint, proofs: cashu.signP2PKProofs(dec.proofs, sk), memo: `${(dec.memo || 'donation').split(' ')[0]} · certified: ${m} · signed by clinic ${V.pubOf(sk).slice(0, 10)}` }) : null; }, [tok, memo]);
const certified = await certifyIn(pages.clinic, lockedToken, 'MOCHI sterilised, invoice TEST-1'); console.log('certify:', certified ? 'CERTIFIED' : 'Failed');

// release: first try the LOCKED (uncertified) token -> mint must refuse; then the certified one
await tab(pages.streetcat, 'release'); await pages.streetcat.fill('#s-token', lockedToken); await pages.streetcat.click('#s-go');
console.log('release uncertified:', (await waitOut(pages.streetcat, 's-out', /RELEASED|refused/)).split('\n')[0]);
await pages.streetcat.fill('#s-token', certified); await pages.streetcat.waitForTimeout(1500); console.log('streetcat sees:', (await out(pages.streetcat, 's-info')).split('\n').slice(-2).join(' | '));
await pages.streetcat.click('#s-go'); console.log('release certified:', (await waitOut(pages.streetcat, 's-out', /RELEASED|refused/)).split('\n')[0]);

// refund path: campaign with a 4-second deadline, nobody certifies
const camp = await pages.streetcat.evaluate(c => window.scCore.signCampaign(c, window.__vetlock.heldKeys('streetcat')[0]), { ...JSON.parse(receipt).campaign, deadline: Math.floor(Date.now() / 1000) + 4 });  // a copy with a short deadline, signed again by Streetcat (an unsigned link takes no donation)
await pages.donor.goto(PAGE); await tab(pages.donor, 'donate'); await pages.donor.fill('#d-camp', JSON.stringify(camp)); await pages.donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await pages.donor.fill('#d-token', tokens.t8); await pages.donor.click('#d-go');
const dout2 = await waitOut(pages.donor, 'd-out', /LOCKED|Failed/); console.log('donate 2:', dout2.split('\n')[0]); const receipt2 = JSON.stringify(await pages.donor.evaluate(t => window.__vetlock.receiptOf(t), dout2.match(/cashuB[A-Za-z0-9_\-=]+/g).pop()));
await tab(pages.donor, 'refund'); await pages.donor.fill('#r-receipt', receipt2); await pages.donor.click('#r-go');
console.log('refund early:', (await waitOut(pages.donor, 'r-out', /REFUNDED|refused|Not yet/)).split('\n')[0]);
await pages.donor.waitForTimeout(5000); await pages.donor.click('#r-go');
console.log('refund late:', (await waitOut(pages.donor, 'r-out', /REFUNDED|refused/)).split('\n')[0]);
await b.close();
