// A request that takes a donation made before 15 Nov (today's lock signed proof by proof) and one made now (signed whole), through the
// pages: app/index.html in Chromium, the local mint (fake money) and two local Nostr relays (7497/7498). The old donation is locked in
// Node, as the donor's page locked one then, and reaches Rescue as that screen takes a token (pasted under Release); the new one comes
// from the donor's page by relay. Rescue asks the partner for part of each; the partner confirms; Rescue releases: one swap for the old
// one and one transaction for the new, both paid less only the mint's fee, one token under Release for the whole request, both written
// in the ledger with what went back under the lock; and the status page reads both from the mint as released, and the rests as locked.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken, LockBuilder, getPubKeyFromPrivKey, createRandomSecretKey } from '@cashu/cashu-ts';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7497 }), startRelay({ port: 7498 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); return p; };
const donor = await page(), clinic = await page(), sc = await page(), viewer = await page();
for (const p of [donor, clinic, sc]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(250); } return s; };
const lastToken = s => s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop(), clip = p => p.evaluate(() => navigator.clipboard.readText()), num = s => Number(String(s).replace(/ /g, ''));
async function showW(p, id){ await p.evaluate(id => { const x = document.getElementById(id); if (x && !x.classList.contains('on')) x.click(); }, id); await p.waitForFunction(() => !document.querySelector('#w-list [style*="max-height"]'), null, { timeout: 15000 }).catch(() => {}); }

// keys and the campaign, as in the app today
await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1200); const clinicPk = await txt(clinic, '#cs-pk');
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1200);
await tab(sc, 'campaign'); await sc.reload(); await tab(sc, 'campaign'); await sc.fill('#k-name', 'MOCHI'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk);
await sc.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await sc.click('#k-go'); await waitText(sc, '#k-out', /is ready|cannot|pick another/); await sc.waitForTimeout(1200);
const link = (await txt(sc, '#k-out')).match(/http\S+#c=\S+/)[0], camp = (await sc.evaluate(() => JSON.parse(localStorage.getItem('vetlock.campaigns') || '[]'))).map(x => x && x.c).find(c => c && c.name === 'MOCHI');

// the new donation, from the donor's page, by relay; the old one, locked as the donor's page locked one before 15 Nov, pasted under Release
await donor.goto(link); await donor.reload(); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(900)); await donor.click('#d-go');
const sW = await waitText(donor, '#d-out', /LOCKED|Failed/); await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000); const W = lastToken(sW);
const hexOf = x => Array.from(x, v => v.toString(16).padStart(2, '0')).join(''), oldLock = new LockBuilder().addMainPubkey([camp.streetcat, camp.clinic]).requireMainSignatures(2).addRefundPubkey(hexOf(getPubKeyFromPrivKey(createRandomSecretKey()))).lockUntil(Number(camp.deadline));
const O = getEncodedToken({ mint: MINT, proofs: await w.ops.receive(await plain(150)).asLocked(oldLock).run(), memo: 'MOCHI · donation' });
const sigOf = t => { const s = JSON.parse(w.decodeToken(t).proofs[0].secret)[1].tags.find(x => x[0] === 'sigflag'); return s ? s[1] : 'SIG_INPUTS'; };
check('the donor\'s page locks the new donation signed whole; the old one is signed proof by proof', sigOf(W) === 'SIG_ALL' && sigOf(O) === 'SIG_INPUTS', `${sigOf(W)} · ${sigOf(O)}`);
await tab(sc, 'release'); await sc.fill('#s-token', O); await waitText(sc, '#s-info', /signed|certified/); await sc.waitForTimeout(800);
await tab(sc, 'home'); await sc.click('#h-kinds button.tile'); await sc.click('#kd-pots button.req'); await sc.locator('#kd-pots .row2 button', { hasText: 'donations and requests' }).click();
await sc.click('#sc-check'); await waitText(sc, '#sc-net', /donation|checked/); await sc.waitForFunction(() => document.querySelectorAll('#sc-dons .item').length === 2, null, { timeout: 30000 }).catch(() => {});
check('both are in the pot', (await sc.$$eval('#sc-dons .item', xs => xs.length)) === 2);

// one request: 300 sat of the new one, 100 of the old
await sc.click('#sc-new'); await sc.waitForFunction(() => document.querySelectorAll('#sn-dons input').length === 2, null, { timeout: 30000 });
await sc.fill('#sn-cat', 'LUNA'); await sc.fill('#sn-proc', 'spay');
const rows = await sc.$$eval('#sn-dons .item', xs => xs.map(x => ({ ref: x.querySelector('.nm').textContent, avail: Number(x.querySelector('.sub2').textContent.match(/^([\d ]+) sat/)[1].replace(/ /g, '')) })));
const rW = rows.find(r => r.avail > 500), rO = rows.find(r => r.avail < 500); await sc.fill('#sn-use-' + rW.ref, '300'); await sc.fill('#sn-use-' + rO.ref, '100');
await sc.click('#sn-go'); const sent = await waitText(sc, '#sq-steps', /sent · \d\/2 relays|✗/, 30000); check('the request goes to the partner by relay', /sent · [12]\/2 relays/.test(sent), sent.split('\n')[1]);

// the partner confirms; Rescue checks the answer
await tab(clinic, 'work'); await clinic.click('#w-check'); await waitText(clinic, '#w-n', /^1$/); await showW(clinic, 'w-pend'); await clinic.click('#w-list .item');
const gives = (await txt(clinic, '#cr-gives')).replace(/(\d) (\d{3})\b/g, '$1$2'), warn = await txt(clinic, '#cr-warn');
check('the partner sees what each donation releases out of the proofs that pay it (four 64s, the 4 and the 64 split; 16, 4, 2 and the 128 split), and no problem with either', /300 sat of 324 sat/.test(gives) && /100 sat of 150 sat/.test(gives) && !/✗/.test(warn), gives.replace(/\n/g, ' | ') + (warn ? ' · ' + warn : ''));
await clinic.check('#cr-ok'); await clinic.click('#cr-go'); await waitText(clinic, '#cr-out', /✓ (delivery )?confirmed/); await clinic.waitForTimeout(1500);
await tab(sc, 'scamp'); await sc.click('#sc-check'); await waitText(sc, '#sc-net', /answer/); await sc.click('#sc-reqs .item');
const state = await waitText(sc, '#sq-state', /certified|✗/);
check('Rescue reads the answer: every donation signed with the partner\'s key, one whole and the other proof by proof', /✓ certified: every donation signed with MOCHI's clinic key \(1 signed whole, the others proof by proof\)/.test(state), state.split('\n').find(l => /certified/.test(l)) || state.slice(0, 160));

// the release: 300 of the new one (four 64s, the 4 and a 64 split: 24 back) and 100 of the old (16, 4, 2 and the 128 split: 50 back)
// first the old donation's swap is done at the mint and its answer lost, the mint not to be asked either (six scans, 15 Nov, 3.3): the
// released ecash comes back when the app opens; before, the request stayed "certified" with nothing in its ledger, and releasing again
// was refused ("no longer locked"). Released again, it is finished from the mint's record, and nothing is sent twice.
let lost = 0, swaps = 0; await sc.route('**/v1/swap', async r => { swaps++; if (lost++ === 0) { await r.fetch(); return r.abort('failed'); } return r.continue(); }); await sc.route('**/v1/restore', r => r.abort('failed'));
await sc.click('#sq-go'); const rel0 = await waitText(sc, '#sq-out', /RELEASED|Not possible|refused|Interrupted/, 40000); await sc.unroute('**/v1/restore');
await sc.reload(); await sc.waitForFunction(() => !document.getElementById('recovered').hidden, null, { timeout: 30000 }).catch(() => {}); await sc.waitForTimeout(800);
const mid = await sc.evaluate(async () => { const V = window.__vetlock, r = V.sreqs()[0]; return { state: r.state, done: !!r.inputsDone, flights: V.flights().length, kept: V.releasedList().filter(x => !x.paid).length, parts: Object.values(await V.ledgerAll()).flatMap(L => Object.values(L.entries || {})).flatMap(e => e.parts || []).length }; });
check('the old donation\'s swap done at the mint, its answer lost: the app opened again keeps what it released, and the request is still to be finished', /Interrupted/.test(rel0) && mid.state === 'certified' && !mid.done && mid.flights === 0 && mid.kept === 1 && mid.parts === 0, rel0.slice(0, 60) + ' · ' + JSON.stringify(mid));
await sc.evaluate(() => window.__vetlock.openTab('home')); await sc.waitForSelector('#h-kinds button.req.torel', { timeout: 20000 }); await sc.click('#h-kinds button.req.torel'); await sc.waitForSelector('#sreq.on'); const before = swaps;
await sc.click('#sq-go'); const rel = await waitText(sc, '#sq-out', /RELEASED|Not possible|refused|Interrupted/, 40000), relAmt = num((rel.match(/RELEASED ([\d ]+) sat/) || [0, '0'])[1]), back = num((rel.match(/([\d ]+) sat went back under the same lock/) || [0, '0'])[1]);
check('released: both paid, less only the mint\'s fee, and the rest of each back under its lock', relAmt > 0 && relAmt <= 400 && relAmt >= 396 && back === 74, rel.split('\n')[0]);
check('…the old donation finished from the mint\'s record, with no second swap for it: one swap more, the new donation\'s', swaps - before === 1, `${swaps - before} swap(s)`);
const rel2 = await sc.evaluate(() => { try { return JSON.parse(localStorage.getItem('vetlock.released') || '[]').filter(x => !x.paid); } catch (_) { return []; } });
check('…kept under Release as one token for the request, of what it released', rel2.length === 1 && rel2[0].amount === relAmt, rel2.map(x => `${x.amount} sat${x.request ? ' · ' + x.request : ''}`).join(' | '));

// the ledger and the status page
await tab(sc, 'home'); await sc.click('#h-kinds button.tile'); await sc.click('#kd-pots button.req'); await sc.locator('#kd-pots .row2 button', { hasText: 'copy ledger' }).click(); await sc.waitForTimeout(300); const L = JSON.parse(await clip(sc));
const eW = L.entries.find(e => e.amount > 500), eO = L.entries.find(e => e.amount < 500);
check('the ledger writes what each paid and what went back under its lock', !!eW && !!eO && eW.parts.map(x => x.amount).join() === '300' && eO.parts.map(x => x.amount).join() === '100' && eW.remainders.length === 1 && eO.remainders.length === 1, eW && eO && `${eW.amount} → ${eW.parts.map(x => x.amount)} + ${eW.remainders.length} rest · ${eO.amount} → ${eO.parts.map(x => x.amount)} + ${eO.remainders.length} rest`);
await viewer.route('**/campaigns/mochi.json', r => r.fulfill({ json: L })); await viewer.goto(BASE + 'status.html?l=campaigns/mochi.json');
await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 40000 }); await viewer.waitForTimeout(1500);
const page2 = await viewer.evaluate(() => document.body.innerText), sumOn = re => [...page2.matchAll(re)].reduce((t, m) => t + num(m[1]), 0);
const released = sumOn(/(\d[\d ]*) sat released/g), locked = sumOn(/(\d[\d ]*) sat locked/g);
check('the status page reads both from the mint: 400 sat released (the mint\'s fee with it), and the rest still locked', released === 400 && locked === 1050 - 400, `released ${released} · locked ${locked}`);

say(bad ? `wholemix: ${bad} check(s) failed` : 'wholemix: every check passed');
await b.close(); relays.forEach(r => r.close && r.close()); process.exit(bad ? 1 : 0);
