// Keys are never lost (app/index.html in Chromium, local Nutshell mint, fake Lightning that pays its own invoices).
// A clinic that makes a new key, or imports one, can still certify tokens locked to its older key; a browser without the
// key a token needs says which key that is and does not ask the mint; a key that cannot be saved changes nothing.
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338';
const say = (...a) => console.log(...a);

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const dialogs = [];
const page = async () => { const p = await (await b.newContext()).newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); return p; };
const donor = await page(), clinic = await page(), streetcat = await page(), other = await page();
for (const p of [donor, clinic, streetcat, other]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t);  // picks the role that owns the tab, then opens it
const out = async (p, id) => (await p.textContent('#' + id)).trim();
const waitOut = async (p, id, re, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await out(p, id); if (re.test(s)) return s; await p.waitForTimeout(200); } return out(p, id); };
const lastToken = s => s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop();
const names = {}; const anon = s => s.replace(/[0-9a-f]{10}…/g, m => names[m] || m);

await tab(clinic, 'certify'); await clinic.click('#c-new'); const k1 = await out(clinic, 'c-pk');
await tab(streetcat, 'release'); await streetcat.click('#s-new'); const sc = await out(streetcat, 's-pk');
Object.assign(names, { [k1.slice(0, 10) + '…']: '<clinic key 1>', [sc.slice(0, 10) + '…']: '<Streetcat key>' });
const camp = { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: sc, clinic: k1, deadline: Math.floor(Date.now() / 1000) + 30 * 86400 };
const lnDonate = async n => { await donor.goto(BASE + 'index.html'); await tab(donor, 'donate'); await donor.fill('#d-camp', JSON.stringify(camp)); await donor.fill('#d-amt', String(n)); await donor.click('#d-ln'); return lastToken(await waitOut(donor, 'd-out', /LOCKED|Failed/)); };
const tokA = await lnDonate(21), tokB = await lnDonate(8);

// 1) the clinic makes a new key after the donations: the page asks, keeps the old key, and certifies with it
await clinic.click('#c-new'); const k2 = await out(clinic, 'c-pk'); names[k2.slice(0, 10) + '…'] = '<clinic key 2>';
say('new clinic key:', k2 !== k1 ? 'a different one' : 'THE SAME', '| asked first, saying the old one is kept:', /current key stays in this browser/.test(dialogs.at(-1)), '| shown:', await out(clinic, 'c-pk-old'));
await clinic.fill('#c-token', tokA); say('clinic sees:', anon((await waitOut(clinic, 'c-info', /names|no clinic key/)).split('\n').pop()));
await clinic.click('#c-go'); const certA = lastToken(await waitOut(clinic, 'c-out', /CERTIFIED|Failed/)); say('certify with the kept key:', (await out(clinic, 'c-out')).split('\n')[0]);
await streetcat.fill('#s-token', certA); say('Streetcat sees:', (await waitOut(streetcat, 's-info', /names|no Streetcat key/)).split('\n').pop());
await streetcat.click('#s-go'); const relA = await waitOut(streetcat, 's-out', /RELEASED|refused|Not possible/); say('release:', relA.split('\n')[0]);

// 2) a browser holding another clinic key: it says which keys the token needs, and does not sign
await tab(other, 'certify'); await other.click('#c-new'); const k3 = await out(other, 'c-pk'); names[k3.slice(0, 10) + '…'] = '<other clinic key>';
await other.fill('#c-token', tokB); say('other browser sees:', anon((await waitOut(other, 'c-info', /names|no clinic key/)).split('\n').slice(-3).join(' / ')));
await other.click('#c-go'); say('other browser certifies:', anon((await waitOut(other, 'c-out', /CERTIFIED|Failed/)).split('\n')[0]));

// 3) it imports the clinic's export: its own key is kept too, and key 1 now certifies there
await tab(clinic, 'keys'); await clinic.click('#x-exp'); const exp = JSON.parse(await clinic.inputValue('#x-box'));
say('export carries the kept key:', exp.clinicOld.length === 1 && exp.clinicOld[0] !== exp.clinic);
await tab(other, 'keys'); await other.fill('#x-box', JSON.stringify(exp)); await other.click('#x-imp');
say('import:', dialogs.at(-1), '| clinic keys held there:', await other.evaluate(() => window.__vetlock.heldKeys('clinic').length), '| current:', anon((await out(other, 'x-c')).slice(0, 10) + '…'), anon(await out(other, 'x-c-old')));
await tab(other, 'certify'); await other.fill('#c-token', ''); await other.fill('#c-token', tokB); await waitOut(other, 'c-info', /names|no clinic key/);
await other.click('#c-go'); const certB = lastToken(await waitOut(other, 'c-out', /CERTIFIED|Failed/)); say('other browser certifies now:', (await out(other, 'c-out')).split('\n')[0]);

// 4) the Streetcat tab of a browser without the Streetcat key: it says so and sends nothing to the mint
let swaps = 0; await other.route('**/v1/swap', r => { swaps++; return r.continue(); });
await tab(other, 'release'); await other.fill('#s-token', certB); await other.click('#s-go');
say('release without the Streetcat key:', anon((await waitOut(other, 's-out', /RELEASED|refused|Not possible/)).split('\n')[0]), '| swaps sent:', swaps);
await other.unroute('**/v1/swap');
await streetcat.fill('#s-token', certB); await streetcat.click('#s-go'); say('release where the key is:', (await waitOut(streetcat, 's-out', /RELEASED 8|refused|Not possible/)).split('\n')[0]);

// 5) a plain token in the clinic tab, and a new key that cannot be saved: nothing changes
await tab(clinic, 'certify'); await clinic.fill('#c-token', lastToken(relA)); say('plain token in the clinic tab:', await waitOut(clinic, 'c-info', /cannot read|names/));
const before = await out(clinic, 'c-pk');
await clinic.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (/\.old$/.test(k)) throw new Error('quota'); return set.call(this, k, v); }; });
await clinic.click('#c-new'); say('storage refuses the kept list:', dialogs.at(-1), '| clinic key unchanged:', (await out(clinic, 'c-pk')) === before);
await b.close();
