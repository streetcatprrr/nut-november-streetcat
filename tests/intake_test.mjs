// What Rescue's app counts as a donation (audit of 10 Nov: the third reviewer's A-02 and A-03, the second's F6 and F8): Rescue's real
// page in Chromium, a pot made in it at the patched test mint (mint/, port 3340), and "donations" made by hand in Node, some at the
// unpatched test mint (3338); fake money. A donation message says which campaign it is for, and the app used to take its word,
// its mint too: anyone who knew Streetcat's public key and a campaign's partner and deadline could send ecash of any other mint
// (its own), and it was filed under the real campaign and counted on Home as money to spend; a token that named the campaign's mint
// and held another's proofs later stopped the public status page for the whole campaign. Each of these is now refused, in words,
// and the pot stays as it was: a message naming another mint; a token naming the right mint with another's ecash; a campaign this
// phone did not make; a donation under two refund keys; a partner's key written 03… for 02…; a campaign whose name is a million
// letters (three such messages used to fill the phone's storage). A real donation is taken, and the pot counts it.
// Not covered: the same by relay (the relay path calls the same takeDonation; relay_test and threeapps_test send real ones).
import { chromium } from 'playwright';
import fs from 'fs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3340', OTHER = process.env.STOCK || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, amt = C.amt, enc = new TextEncoder(), hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), key = () => { const sk = hex(cashu.createRandomSecretKey()); return { sk, pk: C.pubOf(sk) }; };
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
if (!C.destMint(await (await fetch(MINT + '/v1/info')).json())) { say(`intake: needs the patched mint at ${MINT} (see mint/README.md)`); process.exit(1); }
const at = async url => { const w = new cashu.Wallet(url); await w.loadMint(); const ks = await w.keyChain.ensureKeysetKeys(w.keyChain.getCheapestKeyset().id), denoms = Object.keys(ks.keys).map(Number);
  const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 60; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
  const outOf = (a, s) => { const b = cashu.blindMessage(enc.encode(s)); return new cashu.OutputData({ amount: cashu.Amount.from(a), id: ks.id, B_: b.B_.toHex(true) }, b.r, enc.encode(s)); };
  const swapTo = async (inputs, outs) => { const res = await w.mint.swap({ inputs: inputs.map(p => ({ id: p.id, amount: amt(p.amount), secret: p.secret, C: p.C })), outputs: outs.map(o => ({ amount: amt(o.blindedMessage.amount), id: o.blindedMessage.id, B_: o.blindedMessage.B_ })) }); return outs.map((o, i) => o.toProof(res.signatures[i], ks)); };
  return { url, denoms, lockTo: async (n, locks) => swapTo(await plain(n), C.donationSplit(n, denoms).map((a, i) => outOf(a, C.destSecret(locks[i % locks.length])))) }; };
const here = await at(MINT), there = await at(OTHER);

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})), ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} });
const rescue = await ctx.newPage(); rescue.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); rescue.on('dialog', d => d.accept()); await rescue.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
await rescue.goto(BASE + 'index.html');
const tab = t => rescue.evaluate(t => window.__vetlock.openTab(t), t), txt = async s => ((await rescue.textContent(s)) || '').trim();
const waitText = async (s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(s).catch(() => ''); if (re.test(x)) return x; await rescue.waitForTimeout(150); } return x; };
// Rescue: Streetcat's key and a pot with one partner, at the mint that enforces where donations go
const A = key(); await tab('release'); await rescue.click('#s-new'); await rescue.waitForTimeout(800); await rescue.reload(); await rescue.waitForTimeout(500);
await tab('home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-camp'); await rescue.waitForSelector('#campaign.on');
await rescue.fill('#k-mint', MINT); await rescue.click('#k-par'); await rescue.waitForSelector('#spick.on'); await waitText('#pp-head .title', /Choose partners/, 8000);
await rescue.click('#pp-add'); await rescue.fill('#pp-name', 'Clinica Sol'); await rescue.fill('#pp-key', A.pk); await rescue.click('#pp-save'); await rescue.waitForSelector('#pp-list button.req'); await rescue.click('#pp-done'); await rescue.waitForSelector('#campaign.on');
await rescue.fill('#k-name', 'TNR SOL'); await rescue.click('#k-go'); const made = await waitText('#k-out', /is ready|cannot|Failed/, 30000), link = (made.match(/http\S+#c=\S+/) || [])[0] || '';
if (!link) { say('intake: no campaign, nothing can be tested · ' + made.slice(0, 120)); await b.close(); process.exit(1); }
const camp = JSON.parse(Buffer.from(link.split('#c=')[1], 'base64url').toString('utf8')), rule = () => ({ streetcat: camp.streetcat, payees: C.payeesOf(camp), deadline: camp.deadline, refund: key().pk });
const pot = async () => { await tab('home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.waitForTimeout(300); return (await rescue.$$eval('#kd-pots .req', xs => xs.map(x => x.textContent.replace(/\s+/g, ' ').trim()))).join(' | '); };
const entries = () => rescue.evaluate(c => window.__vetlock.ledgerFor(c).entries.length, camp), stored = () => rescue.evaluate(() => Object.keys(localStorage).reduce((n, k) => n + k.length + String(localStorage.getItem(k)).length, 0));
const send = async (campaign, mint, proofs) => { const msg = { t: 'streetcat.donation', v: 1, id: await C.donRef(proofs.map(p => C.yOf(p.secret))), campaign, token: cashu.getEncodedToken({ mint, proofs }), from: key().pk, at: new Date().toISOString() };
  return rescue.evaluate(t => window.__vetlock.openPayload(t, 'file').then(r => 'TAKEN ' + JSON.stringify(r), e => 'REFUSED: ' + e.message), JSON.stringify(msg)); };
const before = await pot(); check('the pot is made in Rescue\'s app, and is empty', camp.lock === 'dest' && /0 sat given/.test(before) && (await entries()) === 0, before);

// ---------- what is not this campaign's donation ----------
const tries = [
  ['a message that names another mint, its ecash locked there for this campaign\'s keys', { ...camp, mint: OTHER }, OTHER, await there.lockTo(5000, [rule()]), /names a mint .* that is not TNR SOL's/],
  ['a token that names the campaign\'s mint and holds another mint\'s ecash', camp, MINT, await there.lockTo(512, [rule()]), /not of TNR SOL's mint|cannot be checked/],
  ['a campaign this phone did not make (another deadline)', { ...camp, deadline: camp.deadline + 60 }, MINT, await here.lockTo(64, [{ ...rule(), deadline: camp.deadline + 60 }]), /campaign this phone did not make/],
  ['a donation whose proofs are under two refund keys', camp, MINT, await here.lockTo(640, [rule(), rule()]), /more than one lock/],
  ['a donation that writes the partner\'s key 03… for 02…', camp, MINT, await here.lockTo(64, [{ ...rule(), payees: [(A.pk.startsWith('02') ? '03' : '02') + A.pk.slice(2)] }]), /not written as the campaign writes them/],
];
for (const [what, c, mint, proofs, re] of tries) { const res = await send(c, mint, proofs); check('refused: ' + what, re.test(res) && /^REFUSED/.test(res) && (await entries()) === 0, res.slice(0, 150)); }
const size0 = await stored(), t0 = Date.now(), long = await send({ ...camp, name: 'A'.repeat(1000000) }, MINT, await here.lockTo(8, [rule()])), size1 = await stored();
check('refused: a campaign whose name is a million letters, at once, and nothing of it is kept', /^REFUSED: its campaign cannot be read/.test(long) && long.length < 300 && size1 - size0 < 2000 && Date.now() - t0 < 15000, `${long.slice(0, 90)} · storage grew by ${size1 - size0} characters`);
const after = await pot(); check('after all of them the pot is as it was: nothing given, nothing to spend', after === before && (await entries()) === 0, after);

// ---------- and what is ----------
const good = await send(camp, MINT, await here.lockTo(640, [rule()])), then = await pot();
check('a real donation, locked at the campaign\'s mint as the campaign says, is taken and counted', /^TAKEN/.test(good) && /"amount":640/.test(good) && (await entries()) === 1 && /640 sat given/.test(then), good.slice(0, 80) + ' · ' + then);
say(bad ? `intake: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'intake: every check passed'); await b.close(); process.exit(bad ? 1 : 0);
