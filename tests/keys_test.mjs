// Keys are never lost (app/index.html in Chromium, local Nutshell mint, fake Lightning that pays its own invoices).
// A clinic that makes a new key, or imports one, can still sign donations locked to its older key; a browser without the key a
// token needs signs nothing, and Release without the Streetcat key does not ask the mint; a key that cannot be saved changes nothing.
// (The clinic's key is made in its settings: "Certify a token" is gone, review of 12 Nov; its signing is done here as it did it.)
import { chromium } from 'playwright';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338';
const say = (...a) => console.log(...a);

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const dialogs = [];
const page = async () => { const p = await (await b.newContext()).newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); return p; };
const donor = await page(), clinic = await page(), streetcat = await page(), other = await page();
for (const p of [donor, clinic, streetcat, other]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t);  // picks the role that owns the tab, then opens it
const out = async (p, id) => (await p.textContent('#' + id)).trim();
const waitOut = async (p, id, re, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await out(p, id); if (re.test(s)) return s; await p.waitForTimeout(200); } return out(p, id); };
const lastToken = s => s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop();
const names = {}; const anon = s => s.replace(/[0-9a-f]{10}…/g, m => names[m] || m);

await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1500); const k1 = await out(clinic, 'cs-pk');
await tab(streetcat, 'release'); await streetcat.click('#s-new'); await streetcat.waitForTimeout(1500); const sc = await out(streetcat, 's-pk');
Object.assign(names, { [k1.slice(0, 10) + '…']: '<clinic key 1>', [sc.slice(0, 10) + '…']: '<Streetcat key>' });
const camp = await streetcat.evaluate(c => window.scCore.signCampaign(c, window.__vetlock.heldKeys('streetcat')[0]), { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: sc, clinic: k1, deadline: Math.floor(Date.now() / 1000) + 30 * 86400 });  /* signed by Streetcat: an unsigned link takes no donation */
const lnDonate = async n => { await donor.goto(BASE + 'index.html'); await tab(donor, 'donate'); await donor.fill('#d-camp', JSON.stringify(camp)); await donor.fill('#d-amt', String(n)); await donor.click('#d-ln'); return lastToken(await waitOut(donor, 'd-out', /LOCKED|Failed/)); };
const tokA = await lnDonate(21), tokB = await lnDonate(8);

// 1) the clinic makes a new key after the donations: the page asks, keeps the old key, and certifies with it
await clinic.click('#cs-new'); await clinic.waitForTimeout(1500); const k2 = await out(clinic, 'cs-pk'); names[k2.slice(0, 10) + '…'] = '<clinic key 2>';
say('new clinic key:', k2 !== k1 ? 'a different one' : 'THE SAME', '| asked first, saying the old one is kept:', /current key stays/.test(dialogs.at(-1)), '| shown:', await out(clinic, 'cs-pk-old'));
// What the partner's "Certify a token" did, before it was removed (review of 12 Nov: it signed any pasted token, with no request): its key
// signs every proof of a donation locked to it. Release still takes a token certified that way, so this test makes one in the page.
const certifyIn = (p, tok, memo = 'the operation was done') => p.evaluate(async ([t, m]) => { const V = window.__vetlock, { dec } = await V.decodeTok(t), info = V.lockInfo(dec.proofs), want = info.pubkeys.map(k => String(k).toLowerCase()), sk = V.heldKeys('clinic').find(k => want.includes(V.pubOf(k)));
  return sk ? cashu.getEncodedToken({ mint: dec.mint, proofs: cashu.signP2PKProofs(dec.proofs, sk), memo: `${(dec.memo || 'donation').split(' ')[0]} · certified: ${m} · signed by clinic ${V.pubOf(sk).slice(0, 10)}` }) : null; }, [tok, memo]);
const certA = await certifyIn(clinic, tokA); say('signed with the kept key:', certA ? 'CERTIFIED' : 'Failed');
await streetcat.fill('#s-token', certA); say('Streetcat sees:', (await waitOut(streetcat, 's-info', /names|no Streetcat key/)).split('\n').pop());
await streetcat.click('#s-go'); const relA = await waitOut(streetcat, 's-out', /RELEASED|refused|Not possible/); say('release:', relA.split('\n')[0]);

// 2) a browser holding another clinic key: it says which keys the token needs, and does not sign
await tab(other, 'csettings'); await other.click('#cs-new'); await other.waitForTimeout(1500); const k3 = await out(other, 'cs-pk'); names[k3.slice(0, 10) + '…'] = '<other clinic key>';
say('other browser, with another clinic key, signs:', (await certifyIn(other, tokB)) ? 'IT SIGNED' : 'nothing (no key for it)');

// 3) it imports the clinic's export: its own key is kept too, and key 1 now certifies there
await tab(clinic, 'keys'); await clinic.click('#x-exp'); const exp = JSON.parse(await clinic.inputValue('#x-box'));
say('export carries the kept key:', exp.clinicOld.length === 1 && exp.clinicOld[0] !== exp.clinic);
await tab(other, 'keys'); await other.fill('#x-box', JSON.stringify(exp)); await other.click('#x-imp');
say('import:', await out(other, 'x-out'), '| clinic keys held there:', await other.evaluate(() => window.__vetlock.heldKeys('clinic').length), '| current:', anon((await out(other, 'x-c')).slice(0, 10) + '…'), anon(await out(other, 'x-c-old')));
const certB = await certifyIn(other, tokB); say('other browser signs now:', certB ? 'CERTIFIED' : 'Failed');

// 4) the Streetcat tab of a browser without the Streetcat key: it says so and sends nothing to the mint
let swaps = 0; await other.route('**/v1/swap', r => { swaps++; return r.continue(); });
await tab(other, 'release'); await other.fill('#s-token', certB); await other.click('#s-go');
say('release without the Streetcat key:', anon((await waitOut(other, 's-out', /RELEASED|refused|Not possible/)).split('\n')[0]), '| swaps sent:', swaps);
await other.unroute('**/v1/swap');
await streetcat.fill('#s-token', certB); await streetcat.click('#s-go'); say('release where the key is:', (await waitOut(streetcat, 's-out', /RELEASED 8|refused|Not possible/)).split('\n')[0]);

// 5) a plain token in the clinic tab, and a new key that cannot be saved: nothing changes
await tab(clinic, 'csettings'); await clinic.waitForTimeout(300); const before = await out(clinic, 'cs-pk');
await clinic.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (/\.old$/.test(k)) throw new Error('quota'); return set.call(this, k, v); }; });
await clinic.click('#cs-new');  /* the key is typed out again on screen: read it once that is over (under load it took longer) */
const settled = await clinic.waitForFunction(b => document.getElementById('cs-pk').textContent.trim() === b, before, { timeout: 8000 }).then(() => true, () => false);
say('storage refuses the kept list:', dialogs.at(-1), '| clinic key unchanged:', settled && (await out(clinic, 'cs-pk')) === before);
await b.close();
