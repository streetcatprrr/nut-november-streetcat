// Release only what the clinic really certified (app/index.html in Chromium, local Nutshell mint, fake money):
// a token with one proof unsigned, or signed with another key, is refused before anything is sent to the mint; a part the donor
// already took back is left out of the release; a clinic can still certify after the deadline (with a warning); and the status
// page counts each proof once, however many ledger entries list it. Once certified or released, the button says so and cannot be
// pressed again (StreetCat, 5 Nov: "tiene que quedar claro que el token se ha liberado"), the phone buzzes, and the same token pasted
// again says at once that it was released, before anyone presses anything.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken, schnorrSignMessage, createRandomSecretKey } from '@cashu/cashu-ts';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338';
const say = (...a) => console.log(...a), now = () => Math.floor(Date.now() / 1000);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const amt = a => (a && typeof a === 'object' && typeof a.toNumber === 'function') ? a.toNumber() : Number(a);
const total = ps => ps.reduce((s, p) => s + amt(p.amount), 0);

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext(); await c.addInitScript(() => { navigator.vibrate = (...a) => { (window.__vib = window.__vib || []).push(a); return true; }; });  /* every buzz is counted */
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); return p; };
const btnState = (p, id) => p.evaluate(id => { const b = document.getElementById(id); return `${b.textContent.trim()} · ${b.disabled ? 'cannot be pressed' : 'can be pressed'}`; }, id), buzzes = p => p.evaluate(() => (window.__vib || []).length);
const donor = await page(), clinic = await page(), streetcat = await page(), viewer = await page();
for (const p of [donor, clinic, streetcat]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t);
const out = async (p, id) => (await p.textContent('#' + id)).trim();
const waitOut = async (p, id, re, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await out(p, id); if (re.test(s)) return s; await p.waitForTimeout(200); } return out(p, id); };
const lastToken = s => s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop();
let swaps = 0; await streetcat.route('**/v1/swap', r => { swaps++; return r.continue(); });

await tab(clinic, 'certify'); await clinic.click('#c-new'); await clinic.waitForTimeout(1500); const clinicPk = await out(clinic, 'c-pk');
await tab(streetcat, 'release'); await streetcat.click('#s-new'); await streetcat.waitForTimeout(1500); const scPk = await out(streetcat, 's-pk');
const signed = c => streetcat.evaluate(c => window.scCore.signCampaign(c, window.__vetlock.heldKeys('streetcat')[0]), c);  /* an unsigned link takes no donation */
const donate = async (camp, n) => { await donor.goto(BASE + 'index.html'); await tab(donor, 'donate'); await donor.fill('#d-camp', JSON.stringify(await signed(camp))); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(n)); await donor.click('#d-go');
  const s = await waitOut(donor, 'd-out', /LOCKED|Failed/); if (!/LOCKED/.test(s)) throw new Error(s); return lastToken(s); };
const certify = async tok => { await tab(clinic, 'certify'); await clinic.fill('#c-token', ''); await clinic.fill('#c-token', tok); await waitOut(clinic, 'c-info', /names|no clinic key/); const info = await out(clinic, 'c-info'); await clinic.click('#c-go'); const o = await waitOut(clinic, 'c-out', /CERTIFIED|Failed/); return { info, out: o, token: /CERTIFIED/.test(o) ? lastToken(o) : null }; };
const release = async tok => { await tab(streetcat, 'release'); await streetcat.fill('#s-token', ''); await streetcat.fill('#s-token', tok); const info = await waitOut(streetcat, 's-info', /certified|signed|Signed/); const before = swaps; await streetcat.click('#s-go'); const o = await waitOut(streetcat, 's-out', /RELEASED|Not possible|refused|Interrupted/); return { info: info.split('\n')[0], out: o.split('\n')[0], swaps: swaps - before }; };

const mochi = { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: scPk, clinic: clinicPk, deadline: now() + 30 * 86400 };
const teo = { ...mochi, name: 'TEO', deadline: now() + 12 };
const A = await donate(mochi, 21), B = await donate(teo, 13);
const decA = w.decodeToken(A), decB = w.decodeToken(B);
say('donations:', decA.proofs.length, 'proofs (21 sat) and', decB.proofs.length, 'proofs (13 sat)');

// 1) one proof without the clinic's signature: "partly signed", and nothing goes to the mint
const certA = (await certify(A)).token, cA = w.decodeToken(certA);
const partly = getEncodedToken({ mint: MINT, proofs: cA.proofs.map((p, i) => i === cA.proofs.length - 1 ? { ...p, witness: undefined } : p), memo: cA.memo });
const r1 = await release(partly); say('one proof unsigned:', r1.info, '|', r1.out, '| swaps sent:', r1.swaps);

// 2) every proof signed, but with a key that is not the campaign's clinic key
const other = hex(createRandomSecretKey());
const wrong = getEncodedToken({ mint: MINT, proofs: decA.proofs.map(p => ({ ...p, witness: JSON.stringify({ signatures: [schnorrSignMessage(p.secret, other)] }) })), memo: decA.memo });
const r2 = await release(wrong); say('signed with another key:', r2.info, '|', r2.out, '| swaps sent:', r2.swaps);

// 3) the real certified token
const r3 = await release(certA); say('certified by the clinic:', r3.info, '|', r3.out);
say('after certifying, the clinic\'s button:', await btnState(clinic, 'c-go'), '| buzzed:', (await buzzes(clinic)) > 0);
say('after releasing, Streetcat\'s button:', await btnState(streetcat, 's-go'), '| buzzed:', (await buzzes(streetcat)) > 0);
await streetcat.click('#s-again a'); await streetcat.waitForTimeout(300); say('"release another token":', await btnState(streetcat, 's-go'), '| box empty:', (await streetcat.inputValue('#s-token')) === '');
{ const before = swaps; await streetcat.fill('#s-token', certA); const again = await waitOut(streetcat, 's-out', /Already released|Nothing left|Not possible/); say('the same token pasted again:', again.split(':')[0], '|', await btnState(streetcat, 's-go'), '| swaps sent:', swaps - before); }

// 4) past TEO's deadline the donor takes part of B back; the clinic still certifies B (with a warning); the release leaves that part out
await donor.waitForTimeout(Math.max(0, teo.deadline - now() + 1) * 1000);
const part = getEncodedToken({ mint: MINT, proofs: [decB.proofs[0]], memo: decB.memo });
await tab(donor, 'refund'); await donor.fill('#r-receipt', part); await donor.click('#r-go'); say('donor takes back', amt(decB.proofs[0].amount), 'sat of B:', (await waitOut(donor, 'r-out', /REFUNDED|refused|Not yet/)).split('\n')[0]);
const cB = await certify(B); say('clinic, past the deadline:', cB.info.split('\n')[0].slice(0, 70) + '…', '|', cB.out.split('\n').slice(0, 2).join(' / ').slice(0, 110) + '…');
const r4 = await release(cB.token); say('release B:', r4.out);

// 5) the status page counts a proof once: a part of A listed first, then A, then its certified copy (the same proofs)
const head = getEncodedToken({ mint: MINT, proofs: decA.proofs.slice(0, 2), memo: decA.memo });
await viewer.route('**/campaigns/dup.json', r => r.fulfill({ json: { campaign: mochi, donations: [head, A, certA] } }));
await viewer.goto(BASE + 'status.html?l=campaigns/dup.json');
await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 30000 });
const rows = await viewer.evaluate(() => [...document.querySelectorAll('.row')].map(x => `${x.dataset.amount} ${x.dataset.status}` + ([...x.querySelectorAll('.mut')].map(e => e.textContent).find(t => /earlier entry/.test(t)) ? ' (' + [...x.querySelectorAll('.mut')].map(e => e.textContent).find(t => /earlier entry/.test(t)) + ')' : '')));
const tot = await viewer.evaluate(() => document.querySelector('#tot div:nth-child(2) b').textContent);
say('status, a proof listed three times:', rows.join(' | '), '| released total:', tot, '| expected', total(decA.proofs.slice(0, 2)), '+', total(decA.proofs.slice(2)), '=', total(decA.proofs));
await b.close();
