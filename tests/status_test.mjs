// End-to-end test of app/status.html: real donations made with app/index.html in Chromium, a local mint, fake money.
// Two campaign ledgers (one still open, one past its deadline) and one tampered token; the page must report each from the mint alone.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { pinBrowser } from './pin.mjs';
import fs from 'fs';
import { releaseLikeApp } from './apprelease.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338';
const say = (...a) => console.log(...a);
const now = () => Math.floor(Date.now() / 1000);

// plain ecash straight from the fake-lightning mint (what a donor's wallet would send)
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const p = await (await b.newContext()).newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); return p; };
const donor = await page(), clinic = await page(), streetcat = await page(), viewer = await page();
for (const p of [donor, clinic, streetcat]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t);  // picks the role that owns the tab, then opens it
const out = async (p, id) => (await p.textContent('#' + id)).trim();
const waitOut = async (p, id, re, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await out(p, id); if (re.test(s)) return s; await p.waitForTimeout(200); } return out(p, id); };
const lastToken = s => s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop();

await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1500); const clinicPk = await clinic.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
await tab(streetcat, 'release'); await streetcat.click('#s-new'); await streetcat.waitForTimeout(1500); const scPk = await out(streetcat, 's-pk');

const signed = c => streetcat.evaluate(c => window.scCore.signCampaign(c, window.__vetlock.heldKeys('streetcat')[0]), c);  /* an unsigned link takes no donation */
const donate = async (camp, amount) => { await donor.goto(BASE + 'index.html'); await tab(donor, 'donate'); await donor.fill('#d-camp', JSON.stringify(await signed(camp))); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(amount)); await donor.click('#d-go');
  const s = await waitOut(donor, 'd-out', /LOCKED|Failed/); if (!/LOCKED/.test(s)) throw new Error(s); return { receipt: JSON.stringify(await donor.evaluate(t => window.__vetlock.receiptOf(t), lastToken(s))), token: lastToken(s) }; };

const open = { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: scPk, clinic: clinicPk, deadline: now() + 30 * 86400 };
const soon = { ...open, name: 'TEO', deadline: now() + 8 };
const A = await donate(open, 21), B = await donate(open, 8);   // A will be released, B stays locked
const C = await donate(soon, 5), D = await donate(soon, 3);    // C will be refunded, nobody touches D
const keys = [A, B, C, D].map(x => JSON.parse(x.receipt).refund.key);
say('fresh refund key per donation:', new Set(keys).size === 4 ? 'yes (4 different keys)' : 'NO', '| kept in the browser:', await donor.evaluate(() => window.__vetlock.donorKeys().length));

// What the partner's "Certify a token" did, before it was removed (review of 12 Nov: it signed any pasted token, with no request): its key
// signs every proof of a donation locked to it. Release still takes a token certified that way, so this test makes one in the page.
const certifyIn = (p, tok, memo = 'the operation was done') => p.evaluate(async ([t, m]) => { const V = window.__vetlock, { dec } = await V.decodeTok(t), info = V.lockInfo(dec.proofs), want = info.pubkeys.map(k => String(k).toLowerCase()), sk = V.heldKeys('clinic').find(k => want.includes(V.pubOf(k)));
  return sk ? cashu.getEncodedToken({ mint: dec.mint, proofs: cashu.signP2PKProofs(dec.proofs, sk), memo: `${(dec.memo || 'donation').split(' ')[0]} · certified: ${m} · signed by clinic ${V.pubOf(sk).slice(0, 10)}` }) : null; }, [tok, memo]);
// A is released as Rescue's app releases a donation signed whole (every one the donor's page makes since 15 Nov): a request, the
// partner's confirmation, one transaction (tests/apprelease.mjs), with the keys these pages hold
const APP = new URL('../app/', import.meta.url).pathname; eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
{ const SC = globalThis.scCore, bw = new globalThis.cashu.Wallet(MINT); await bw.loadMint(); const scSk = await streetcat.evaluate(() => window.__vetlock.heldKeys('streetcat')[0]), clSk = await clinic.evaluate(() => window.__vetlock.key('clinic', false));
  const got = await releaseLikeApp({ C: SC, cashu: globalThis.cashu, w: bw, campaign: open, sc: scSk, cl: clSk, proofs: bw.decodeToken(A.token).proofs, amount: 21 }); say('release A:', `RELEASED ${got.pay.reduce((a, p) => a + SC.amt(p.amount), 0)} sat, signed whole`); void certifyIn; }

await tab(donor, 'refund'); await donor.fill('#r-receipt', C.token); await donor.click('#r-go'); say('refund C before the deadline:', (await waitOut(donor, 'r-out', /REFUNDED|refused|Not yet/)).split('\n')[0]);
await donor.waitForTimeout(Math.max(0, soon.deadline - now() + 1) * 1000);
await donor.click('#r-go'); say('refund C after the deadline (token only, key kept by this browser):', (await waitOut(donor, 'r-out', /REFUNDED|refused|Not yet/)).split('\n')[0]);

// a forged entry: B with a later deadline written into its secret
const dec = w.decodeToken(B.token); const forged = getEncodedToken({ mint: MINT, proofs: dec.proofs.map(p => { const s = JSON.parse(p.secret); s[1].tags = s[1].tags.map(t => t[0] === 'locktime' ? ['locktime', String(open.deadline + 365 * 86400)] : t); return { ...p, secret: JSON.stringify(s) }; }) });

const ledgers = { mochi: { campaign: open, clinicKeySource: 'https://clinic.example/cashu-key', donations: [A.token, B.token, B.token] }, teo: { campaign: soon, donations: [C.token, D.token] }, forged: { campaign: open, donations: [forged] } };
await viewer.route('**/campaigns/*.json', r => r.fulfill({ json: ledgers[r.request().url().split('/').pop().replace('.json', '')] }));
const rows = async name => { await viewer.goto(BASE + `status.html?l=campaigns/${name}.json`);
  await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 30000 });
  const r = await viewer.evaluate(() => [...document.querySelectorAll('.row')].map(x => `${x.dataset.amount} ${x.dataset.status}${x.dataset.ok === '1' ? '' : ' (not counted: ' + [...x.querySelectorAll('.mut.bad')].map(e => e.textContent.replace('✗ ', '')).join('; ') + ')'}`));
  const t = await viewer.evaluate(() => [...document.querySelectorAll('#tot div')].map(x => x.textContent.replace(/(\d+ sat)/, '$1 ')).join(' · '));
  return r.join(' | ') + '\n    totals: ' + t; };
say('status MOCHI:', await rows('mochi'));
const lookup = async v => { if (!(await viewer.evaluate(() => document.body.classList.contains('lookup')))) await viewer.click('#m-open'); await viewer.fill('#m-tok', v); await viewer.click('#m-go'); return (await waitOut(viewer, 'm-out', /LISTED|Failed/)).split('\n')[0]; };
say('lookup, receipt of B:', await lookup(B.receipt));
say('lookup, token of D:', await lookup(D.token));
say('status TEO:', await rows('teo'));
say('status forged:', await rows('forged'));

// the donor's own browser: status.html lists what it donated, from its own copies of the locked tokens, checked at the mint
await donor.goto(BASE + 'status.html');
await donor.waitForFunction(() => /Checked|could not/.test(document.getElementById('here-out').textContent), null, { timeout: 30000 });
say('this browser\'s donations:', (await donor.evaluate(() => { const g = {}; for (const x of document.querySelectorAll('#here .hrow')) (g[x.dataset.campaign] = g[x.dataset.campaign] || []).push(`${x.dataset.amount} ${x.dataset.status}`); return Object.entries(g).map(([k, v]) => `${k}: ${v.join(' | ')}`); })).join(' / '));
await donor.click('#here-copy'); const led = JSON.parse((await waitOut(donor, 'here-out', /^(Copied|Select)/)).replace(/^[^\n]*\n/, ''));
say('  as ledgers:', led.map(l => `${l.campaign.name} · ${l.donations.length} tokens · keys in their roles: ${l.campaign.streetcat === scPk && l.campaign.clinic === clinicPk} · deadline: ${l.campaign.deadline === (l.campaign.name === 'MOCHI' ? open : soon).deadline} · no refund keys: ${!/refundKey|"sk"/.test(JSON.stringify(l))}`).join(' | '));
ledgers.mine = led.find(l => l.campaign.name === 'MOCHI'); say('  published and read back:', await rows('mine'));
await b.close();
