// Streetcat's ledger, made by the app (Chromium, local Nutshell mint, fake money): Streetcat makes a campaign, a donor gives twice, the
// clinic certifies one donation and Streetcat releases it. Home's "copy ledger" must give a version 2 ledger with both donations by
// their DON- codes, the released one with what it released; and status.html must read it back from the mint.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block' }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }); const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); return p; };
const donor = await page(), clinic = await page(), sc = await page(), viewer = await page();
for (const p of [donor, clinic, sc]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), out = async (p, id) => (await p.textContent('#' + id)).trim();
const waitOut = async (p, id, re, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await out(p, id); if (re.test(s)) return s; await p.waitForTimeout(200); } return out(p, id); };
const lastToken = s => s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop();

await tab(clinic, 'certify'); await clinic.click('#c-new'); await clinic.waitForTimeout(1500); const clinicPk = await out(clinic, 'c-pk');
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1500);
await tab(sc, 'campaign'); await sc.reload(); await tab(sc, 'campaign'); await sc.fill('#k-name', 'MOCHI'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk);
await sc.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await sc.click('#k-go'); await waitOut(sc, 'k-out', /is ready|cannot|pick another/); await sc.waitForTimeout(1500);
const link = (await out(sc, 'k-out')).match(/http\S+#c=\S+/)[0];
const give = async n => { await donor.goto(link); await donor.reload(); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(n)); await donor.click('#d-go'); return lastToken(await waitOut(donor, 'd-out', /LOCKED|Failed/)); };
const A = await give(21), B = await give(8);
await tab(clinic, 'certify'); await clinic.fill('#c-token', A); await waitOut(clinic, 'c-info', /names/); await clinic.click('#c-go'); const cert = lastToken(await waitOut(clinic, 'c-out', /CERTIFIED|Failed/));
await tab(sc, 'release'); await sc.fill('#s-token', B); await waitOut(sc, 's-info', /signed|certified/);  // B arrives uncertified: it is a donation of the campaign all the same
await sc.fill('#s-token', ''); await sc.fill('#s-token', cert); await waitOut(sc, 's-info', /certified/); await sc.click('#s-go'); say('release:', (await waitOut(sc, 's-out', /RELEASED|Not possible|refused/)).split('\n')[0]);

// Home: the campaign's row, its "copy ledger"
await tab(sc, 'home'); await sc.click('#h-kinds button.tile'); await sc.click('#kd-pots button.req'); const btn = sc.locator('#kd-pots .row2 button', { hasText: 'copy ledger' });
await btn.click(); await sc.waitForTimeout(400); const L = JSON.parse(await sc.evaluate(() => navigator.clipboard.readText()));
check('"copy ledger" gives a version 2 ledger with both donations', L.v === 2 && L.entries.length === 2 && L.donations.length === 2 && /^DON-[0-9A-F]{8}$/.test(L.entries[0].ref), L.entries.map(e => `${e.ref} ${e.amount} sat${e.parts.length ? ' → ' + e.parts.map(p => p.amount).join('+') : ''}`).join(' | '));
check('the released one says what it released, and it holds no key', L.entries.some(e => e.amount === 21 && e.parts.length === 1 && e.parts[0].amount === 21) && !/refundKey|"sk"|privkey/.test(JSON.stringify(L)));
await viewer.route('**/campaigns/mochi.json', r => r.fulfill({ json: L })); await viewer.goto(BASE + 'status.html?l=campaigns/mochi.json');
await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 30000 });
const rows = await viewer.evaluate(() => [...document.querySelectorAll('.row')].map(x => `${x.dataset.ref} ${x.dataset.amount} ${x.dataset.status}`));
check('status.html reads it back from the mint', rows.length === 2 && rows.some(r => / 21 RELEASED$/.test(r)) && rows.some(r => / 8 LOCKED$/.test(r)), rows.join(' | '));
await b.close();
say(bad ? `publish: ${bad} check(s) failed` : 'publish: every check passed'); process.exit(bad ? 1 : 0);  /* audit of 10 Nov: as core_test, it exited 0 whatever it found */
