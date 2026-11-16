// The status page holds up against a ledger that is not Streetcat's (group 8 of the six scans, 14–15 Nov, the first part: 5.5, 5.8,
// 5.11, 5.13, 5.17, 5.18, 5.26, 5.29), in Chromium against the local mint (3338, fake money). A ledger is a file anyone can write, and
// the page is public. Checked: a campaign text too long to be Streetcat's is not shown; a pasted ledger over the size limit is not read
// at all; `parts` that is not a list, and declarations that cannot be read, stop nothing; the same token listed many times is asked of
// the mint once; a check started while another runs is the one that counts; and "your sats are safe either way" is said only of a
// token that checked out. On the code before, six of the seven checks fail (the seventh is the good case). Not tried apart: a file that unpacks past the limit while it is
// read (5.1: it is read piece by piece now; a test server here cannot send one that the old code would not also refuse, later).
import { chromium } from 'playwright';
import fs from 'fs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, amt = C.amt, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }), viewer = await ctx.newPage(); viewer.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); viewer.on('dialog', d => d.accept());
await viewer.goto(BASE + 'status.html'); await viewer.waitForFunction(() => !!(window.scCore && document.getElementById('l-src')));
const txt = async s => ((await viewer.textContent(s)) || '').trim(), waitText = async (s, re, ms = 40000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(s).catch(() => ''); if (re.test(x)) return x; await viewer.waitForTimeout(150); } return x; };
const put = v => viewer.evaluate(v => { document.getElementById('l-out').textContent = ''; const ta = document.getElementById('l-src'); ta.value = v; ta.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const status = async L => { await put(typeof L === 'string' ? L : JSON.stringify(L)); const out = await waitText('#l-out', /Checked|Failed/); await viewer.waitForTimeout(600); return out; };
const sc = newSk(), cl = newSk(); await b.pin(C.pubOf(sc)); const deadline = Math.floor(Date.now() / 1000) + 30 * 86400;
const camp = await C.signCampaign({ name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline }, sc), camp2 = await C.signCampaign({ name: 'LUNA', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline: deadline - 60 }, sc);
const donated = async (c, n) => cashu.getEncodedToken({ mint: MINT, proofs: await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: await plain(n) })).asLocked(new cashu.LockBuilder().addMainPubkey([c.streetcat, c.clinic]).requireMainSignatures(2).addRefundPubkey(C.pubOf(newSk())).lockUntil(Number(c.deadline))).run(), memo: c.name });
const tA = await donated(camp, 21), tB = await donated(camp2, 13);

// 5.5 · a campaign text too long to be Streetcat's
{ const out = await status({ campaign: { ...camp, name: 'M'.repeat(5000) }, donations: [tA] });
  check('a ledger whose campaign name is 5 000 letters long is not shown: "too long to be one of Streetcat\'s"', /^Failed: the campaign's name is too long to be one of Streetcat's \(5000 characters\)/.test(out), out.slice(0, 90)); }
// 5.11 · a pasted ledger over the size limit is not read at all
{ let parsed = 0; await viewer.evaluate(() => { const real = JSON.parse; window.__parsed = 0; JSON.parse = function (t) { if (typeof t === 'string' && t.length > 4e6) window.__parsed++; return real.apply(this, arguments); }; });
  const out = await status('{"campaign":' + JSON.stringify(camp) + ',"donations":[],"pad":"' + 'x'.repeat(4100000) + '"}'); parsed = await viewer.evaluate(() => window.__parsed);
  check('a pasted ledger over 4 MB is refused before it is read: never handed to the JSON reader', /^Failed: this ledger is 4\.\d MB: too big/.test(out) && parsed === 0, `${out.slice(0, 60)} · read ${parsed} time(s)`); }
// 5.26, 5.29, 5.8 · parts that are not a list, declarations that cannot be read
{ const ref = await C.donRef(w.decodeToken(tA).proofs.map(p => C.yOf(p.secret))), odd = { statement: { request: 5, contributions: 'not a list' }, sig: 'zz' };
  const out = await status({ v: 2, campaign: camp, donations: [tA], entries: [{ ref, token: tA, amount: 21, parts: 'not a list', remainders: { a: 1 } }], certificates: [odd, odd, odd, { statement: { request: 'R-1', contributions: [null, 7, { ref }] }, sig: 5 }, { statement: 'text' }, null, { statement: { big: 'y'.repeat(70000) } }] });
  check('a ledger whose `parts` is not a list, with declarations that cannot be read: the donation is still checked at the mint and shown', /^Checked 1 donation/.test(out) && / 21 satLOCKED/.test((await txt('body')).replace(/\s+/g, ' ')), out.slice(0, 60)); }
// 5.17 · the same token listed many times is asked of the mint once
{ let asks = 0; const count = r => { if (/\/v1\/checkstate$/.test(r.url())) asks++; }; viewer.on('request', count);
  await status({ campaign: camp, donations: [tA] }); const one = asks; asks = 0; const out = await status({ campaign: camp, donations: Array(40).fill(tA) }); viewer.off('request', count);
  check('a ledger that lists the same token 40 times asks the mint no more than for one', /^Checked 1 donation/.test(out) && one > 0 && asks === one, `${one} question(s) for one · ${asks} for forty`); }
// 5.18 · a check started while another runs is the one that counts
{ let slow = true; await viewer.route('**/v1/checkstate', async r => { if (slow) { slow = false; await new Promise(x => setTimeout(x, 2500)); } return r.continue(); });
  await put(JSON.stringify({ campaign: camp, donations: [tA] })); await viewer.waitForTimeout(400); await put(JSON.stringify({ campaign: camp2, donations: [tB] }));
  await waitText('#l-out', /Checked/); await viewer.waitForTimeout(3500); await viewer.unroute('**/v1/checkstate');
  const body = (await txt('body')).replace(/\s+/g, ' ');
  check('two checks at once: the page ends on the one asked for last, its campaign and its donation, and the first writes nothing over it', /LUNA ?sterilisation/.test(body) && !/MOCHI ?sterilisation/.test(body) && / 13 satLOCKED/.test(body) && !/ 21 satLOCKED/.test(body), (body.match(/(LUNA|MOCHI) ?sterilisation/) || [''])[0] + ' · ' + (body.match(/ \d+ satLOCKED/) || [''])[0]); }
// 5.13 · "your sats are safe either way" is said only of a token that checked out
{ await status({ campaign: camp, donations: [tA] }); const look = async t => { await viewer.evaluate(t => { document.getElementById('m-out').textContent = ''; document.getElementById('m-tok').value = t; document.getElementById('m-go').click(); }, t); return waitText('#m-out', /LISTED|Failed/, 20000); };
  const loose = await look(cashu.getEncodedToken({ mint: MINT, proofs: await plain(5) })), good = await look(await donated(camp, 8));
  check('a token that is not a donation of this campaign, not listed: nothing is promised of it', /NOT LISTED ✗/.test(loose) && !/Your sats are safe/.test(loose) && /nothing can be said here of who can spend it/.test(loose), loose.replace(/\n/g, ' | ').slice(0, 150));
  check('…and one that checks out, not listed yet: "Your sats are safe either way"', /NOT LISTED ✗/.test(good) && /Your sats are safe either way/.test(good), good.replace(/\n/g, ' | ').slice(0, 110)); }

say(bad ? `statuslimits: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'statuslimits: every check passed');
await b.close(); process.exit(bad ? 1 : 0);
