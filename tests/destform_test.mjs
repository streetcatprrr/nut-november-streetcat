// A campaign with a list of partners, in Chromium against the patched test mint (mint/, port
// 3340) and a mint without the patch (STOCK, port 3338); fake money, no relay. Where the campaign's mint enforces where donations may
// go (core.js, `dest`), "Choose partner" opens a ticked list: a tap puts a partner in or takes it out, "+ New partner" adds one ticked,
// "Done" goes back; the form shows the first and how many more, and a key line for each. The campaign made is signed with its lock
// and its partners. A donor's ecash locked through its link carries that lock on every proof. At a mint without the patch the list
// is what it was (a tap chooses one and goes back), and a link that asks for this lock there takes no donation. Not covered here: the
// request, its confirmation and the release (destreq_test in Node, destflow_test through the pages); nor, anywhere yet, the partner's
// payout, the refund and the status page for these campaigns.
import { chromium } from 'playwright';
import fs from 'fs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3340', STOCK = process.env.STOCK || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newPk = () => C.pubOf(hex(cashu.createRandomSecretKey()));
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const info = async u => (await fetch(u + '/v1/info')).json();
if (!C.destMint(await info(MINT)) || C.destMint(await info(STOCK))) { say(`destform: needs the patched mint at ${MINT} and one without the patch at ${STOCK} (see mint/README.md)`); process.exit(1); }
const wallets = {}, wallet = async u => { if (!wallets[u]) { wallets[u] = new cashu.Wallet(u); await wallets[u].loadMint(); } return wallets[u]; };
const plain = async (u, n) => { const w = await wallet(u), q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return cashu.getEncodedToken({ mint: u, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async role => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); localStorage.setItem('vetlock.role', r); } catch (_) {} }, role);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const settled = async (p, s, re, ms = 30000) => { await waitText(p, s, re, ms); let a = '', n = 0; for (let i = 0; i < 40 && n < 4; i++) { const x = await txt(p, s).catch(() => ''); n = x === a ? n + 1 : 0; a = x; await p.waitForTimeout(250); } return a; };  /* a text that types itself out: read once it has stopped changing */
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const lines = (p, s) => p.$$eval(s + ' button.req', bs => bs.map(b => ({ title: b.querySelector('.title').textContent, subs: [...b.children].slice(1).map(x => x.textContent) })));
const row = (p, name) => p.locator('#pp-list button.req', { hasText: name }).first();
const addPartner = async (p, name, pk) => { await p.click('#pp-add'); await p.fill('#pp-name', name); await p.fill('#pp-key', pk); await p.click('#pp-save'); };
const fromLink = l => JSON.parse(Buffer.from(l.split('#c=')[1], 'base64url').toString('utf8'));

// ---------- Rescue: a campaign at the mint that enforces the rule ----------
const A = newPk(), B = newPk(), sc = await page('streetcat');
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1000); await sc.reload(); await sc.waitForTimeout(500);
const scPk = await sc.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('streetcat', false)));
await tab(sc, 'home'); await sc.click('#h-new'); await sc.waitForSelector('#campaign.on'); await sc.fill('#k-c', ''); await sc.fill('#k-mint', MINT);
await sc.click('#k-par'); await sc.waitForSelector('#spick.on'); const head = await waitText(sc, '#pp-head .title', /Choose partners/, 8000);
check('at a mint that enforces where donations may go, "Choose partner" opens a list to tick, with "Done" under "+ New partner"', head === 'Choose partners' && await sc.isVisible('#pp-done') && (await txt(sc, '#pp-add')) === '+ New partner' && (await txt(sc, '#pp-done')) === 'Done', head);
await addPartner(sc, 'Clinica Norte', A); await sc.waitForSelector('#pp-list button.req'); await addPartner(sc, 'Clinica Sur', B); await sc.waitForFunction(() => document.querySelectorAll('#pp-list button.req').length === 2);
let L = await lines(sc, '#pp-list');
check('a new partner joins the list ticked, and the list stays to choose more', await sc.isVisible('#spick.on') && L.map(l => l.title).join() === '[x] Clinica Norte,[x] Clinica Sur' && L.every(l => l.subs.includes('✓ chosen')), JSON.stringify(L.map(l => l.title)));
await row(sc, 'Clinica Sur').click(); const off = (await lines(sc, '#pp-list')).map(l => l.title).join(); await row(sc, 'Clinica Sur').click(); const on = (await lines(sc, '#pp-list')).map(l => l.title).join();
check('a tap takes a partner out and puts it back, without leaving the list', off === '[x] Clinica Norte,[ ] Clinica Sur' && on === '[x] Clinica Norte,[x] Clinica Sur' && await sc.isVisible('#spick.on'), off);
await sc.click('#pp-done'); await sc.waitForSelector('#campaign.on'); const kl = await sc.$$eval('#k-keys .kline', ls => ls.map(l => l.querySelector('small').textContent + ' ' + l.querySelector('.kk').textContent));
check('"Done" goes back to the form: the first partner and how many more, and a key line for each', (await txt(sc, '#k-par')) === 'CLINICA NORTE +1' && kl.length === 3 && kl[0] === 'Streetcat ' + scPk && kl[1] === 'Clinica Norte · clinic ' + A && kl[2] === 'Clinica Sur · clinic ' + B, `${await txt(sc, '#k-par')} · ${kl.length} key lines`);
await sc.fill('#k-name', 'TNR LISTA'); await sc.click('#k-go'); const made = await settled(sc, '#k-out', /is ready|cannot hold|Failed/, 30000), link = (made.match(/http\S+#c=\S+/) || [])[0] || '';
const c = link ? fromLink(link) : {}, sig = link ? await sc.evaluate(c => window.scCore.campaignSig(c), c) : '';
check('the campaign is made: the mint\'s answer says it enforces the rule, and the signed link carries the lock and both partners', /✓ dest:/.test(made) && c.lock === 'dest' && c.clinic === A && JSON.stringify(c.partners) === JSON.stringify([B]) && sig === 'signed', made.split('\n').find(l => /dest|cannot|✗/.test(l)) || made.slice(0, 80));
const stripped = link ? await sc.evaluate(c => window.scCore.campaignSig({ ...c, partners: undefined }), c) : '', swapped = link ? await sc.evaluate(([c, x]) => window.scCore.campaignSig({ ...c, partners: [x] }), [c, newPk()]) : '';
check('…a link with a partner taken off or changed afterwards is no longer Streetcat\'s', stripped === 'broken' && swapped === 'broken', `${stripped}, ${swapped}`);
check('the campaign\'s id counts its partners: the same pot with one of them only is another campaign', !!link && (await C.campaignId(c)) !== (await C.campaignId({ ...c, partners: undefined })));

// ---------- a donor gives through the link ----------
const donor = await page('donor'); await donor.goto(link); await donor.reload(); await tab(donor, 'decash'); await donor.fill('#d-token', await plain(MINT, 640)); await donor.click('#d-go');
const locked = await waitText(donor, '#d-out', /LOCKED|Failed|✗|CHECK FAILED/, 40000), kept = await donor.evaluate(() => { const k = window.__vetlock.donorKeys().find(x => x.lockedToken); return k ? { tok: k.lockedToken, pk: window.__vetlock.pubOf(k.sk) } : null; });
const proofs = kept ? (await wallet(MINT)).decodeToken(kept.tok).proofs : [], locks = proofs.map(p => C.lockOf(p.secret));
check('a donor\'s 640 sat are locked through it', /LOCKED/.test(locked) && proofs.reduce((s, p) => s + C.amt(p.amount), 0) === 640, locked.split('\n')[0].slice(0, 90));
check('…every proof under the campaign\'s lock: Streetcat orders, the two partners can be paid, the donor\'s key refunds, signatures cover the whole spend', proofs.length > 1 && locks.every(l => l && C.lockProblem(l, c) === '' && l.dest === 'pubkeys' && l.sigflag === 'SIG_ALL' && l.main.join() === [scPk, A, B].join() && l.refund.join() === kept.pk),
  `${proofs.length} proofs, the largest ${Math.max(0, ...proofs.map(p => C.amt(p.amount)))}`);
const asToday = [...new Set(locks.map(l => C.lockProblem(l, { streetcat: scPk, clinic: A, deadline: c.deadline })))];
check('…and none of it passes for a donation of a campaign of today\'s kind with the same keys', proofs.length > 0 && asToday.every(Boolean), asToday.join('; '));
const asked = await C.makeRequest({ campaign: c, patient: 'MOCHI', procedure: 'sterilisation (spay)', date: new Date().toISOString().slice(0, 10), contributions: [{ proofs }] }).then(() => 'MADE', e => e.message);
check('a request is not made for it without the mint\'s keyset: it has to say where every sat goes (destreq_test, destflow_test)', /needs the mint's keyset/.test(asked), asked);

// ---------- a mint without the patch ----------
await tab(sc, 'home'); await sc.click('#h-new'); await sc.waitForSelector('#campaign.on'); await sc.fill('#k-mint', STOCK); await sc.click('#k-par'); await sc.waitForSelector('#spick.on'); await sc.waitForTimeout(900);
L = await lines(sc, '#pp-list');
check('at a mint without the rule the list is what it was: no ticks, no "Done"', (await txt(sc, '#pp-head .title')) === 'Choose a partner' && !(await sc.isVisible('#pp-done')) && L.map(l => l.title).sort().join() === 'Clinica Norte,Clinica Sur', JSON.stringify(L.map(l => l.title)));
await row(sc, 'Clinica Sur').click(); await sc.waitForSelector('#campaign.on');
check('…a tap chooses the one partner and goes back', (await txt(sc, '#k-par')) === 'CLINICA SUR' && (await sc.$$eval('#k-keys .kline', ls => ls.length)) === 2, await txt(sc, '#k-par'));
await sc.fill('#k-name', 'TNR UNO'); await sc.click('#k-go'); const made2 = await settled(sc, '#k-out', /is ready|cannot hold|Failed/, 30000), c2 = fromLink((made2.match(/http\S+#c=\S+/) || ['#c=e30'])[0]);
check('…and its campaign is one of today\'s kind, with one partner', /is ready/.test(made2) && !/dest/.test(made2) && c2.lock === undefined && c2.partners === undefined && c2.clinic === B, made2.split('\n')[0].slice(0, 80));
const forged = await sc.evaluate(async ([c, mint]) => { const sk = window.__vetlock.key('streetcat', false), s = await window.scCore.signCampaign({ ...c, sig: undefined, mint, name: 'TNR OTRO' }, sk); return location.href.split('#')[0] + '#c=' + btoa(JSON.stringify(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }, [c, STOCK]);
const donor2 = await page('donor'); await donor2.goto(forged); await donor2.reload(); await tab(donor2, 'decash'); await donor2.fill('#d-token', await plain(STOCK, 64)); await donor2.click('#d-go');
const refused = await waitText(donor2, '#de-out', /LOCKED|Failed|✗|does not say it does/, 40000), none = await donor2.evaluate(() => window.__vetlock.donorKeys().filter(x => x.lockedToken).length);
check('a link that asks for this lock at a mint that does not enforce it takes no donation, and says why in red', /needs a mint that enforces where its donations may go/.test(refused) && !/LOCKED/.test(refused) && none === 0 && !/LOCKED/.test(await txt(donor2, '#d-out')) && await donor2.$eval('#de-out', e => e.classList.contains('bad')), (refused || 'nothing said').replace(/\s+/g, ' ').slice(0, 160));

await b.close(); say(bad ? `destform: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'destform: every check passed'); process.exit(bad ? 1 : 0);
