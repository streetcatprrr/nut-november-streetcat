// A pot that pays its partners straight from the lock (`dest`), through the pages: Rescue's app, two partners' apps and a donor's, each
// with its own storage, by relay only, in Chromium against the patched test mint (mint/, port 3340) and two local relays; fake money.
// Rescue makes a sterilisation pot with a list of two clinics; two donations reach it. Its request asks the SECOND clinic for 2 201 sat:
// all of one donation and part of the other. Only that clinic's app gets it; it shows who is paid and what stays locked, and
// confirms. Rescue releases: the mint pays the clinic, nothing comes to Rescue's app, and the rest is in the pot again. Read from the
// mint in Node, the 2 201 sat are locked to that clinic's key alone. Then 150 sat of what was left are asked of the FIRST clinic,
// confirmed and paid the same way (what was put back is a donation's proof like any other). Which donation is taken whole is not
// fixed (they are of one day), so what is expected on the screens is worked out from the request itself; 2 201 splits a proof either way.
// It runs at a mint that charges input fees too (MINT=http://127.0.0.1:3341, a patched mint started with MINT_INPUT_FEE_PPK=100): there a
// donation locks for a little less than was given, each payment is what was asked less the mint's fee, and the screens say the fee. Not covered: the partner's payout to
// Lightning, the donor's refund, the status page, a mint with fees.
import { chromium } from 'playwright';
import fs from 'fs';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3340', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore;
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
if (!C.destMint(await (await fetch(MINT + '/v1/info')).json())) { say(`destflow: needs the patched mint at ${MINT} (see mint/README.md)`); process.exit(1); }
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return cashu.getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7441 }), startRelay({ port: 7442 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(r => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => { say('DIALOG', d.message()); d.accept(); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const lines = (p, s) => p.$$eval(s + ' button.req', bs => bs.map(b => ({ title: b.querySelector('.title').textContent, subs: [...b.children].slice(1).map(x => x.textContent) })));
const front = p => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));  // one turns to this app: it is in front again
const num = s => Number(String(s).replace(/\s/g, '')), fmt = n => String(n).replace(/\B(?=(\d{3})+$)/g, ' ') + ' sat';  /* amounts are written "2 400 sat" */
const addPartner = async (p, name, pk) => { await p.click('#pp-add'); await p.fill('#pp-name', name); await p.fill('#pp-key', pk); await p.click('#pp-save'); };
const clinicKey = async p => { await tab(p, 'csettings'); await p.click('#cs-new'); return p.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false))); };
const paidTo = async (q, pk) => { let n = 0; for (const k of q.contributions) n += (await C.destFind(w, await C.reqTx(q, k))).filter(x => !x.rest && x.to === pk).reduce((s, x) => s + x.amount, 0); return n; };
const openReq = async p => { await tab(p, 'work'); await p.waitForTimeout(400); await p.click('#w-pend'); await p.waitForSelector('#w-list .item'); await p.click('#w-list .item'); await p.waitForSelector('#creq.on'); await p.waitForFunction(() => !document.getElementById('cr-ok').disabled, null, { timeout: 30000 }).catch(() => {}); };

// THE TWO PARTNERS' APPS, each with its key. RESCUE'S APP: Streetcat's key, and a sterilisation pot with both of them
const norte = await page(), sur = await page(), rescue = await page(), donor = await page();
const A = await clinicKey(norte), B = await clinicKey(sur);
await tab(rescue, 'release'); await rescue.click('#s-new'); await rescue.waitForTimeout(800); await rescue.reload(); await rescue.waitForTimeout(500);
await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-camp'); await rescue.waitForSelector('#campaign.on');
await rescue.fill('#k-mint', MINT); await rescue.click('#k-par'); await rescue.waitForSelector('#spick.on'); await waitText(rescue, '#pp-head .title', /Choose partners/, 8000);
await addPartner(rescue, 'Clinica Norte', A); await rescue.waitForSelector('#pp-list button.req'); await addPartner(rescue, 'Clinica Sur', B); await rescue.waitForFunction(() => document.querySelectorAll('#pp-list button.req').length === 2);
await rescue.click('#pp-done'); await rescue.waitForSelector('#campaign.on'); await rescue.fill('#k-name', 'TNR LISTA'); await rescue.click('#k-go');
const made = await waitText(rescue, '#k-out', /is ready|cannot|Failed/, 30000), link = (made.match(/http\S+#c=\S+/) || [])[0] || '';
check('Rescue\'s pot with a list of two clinics is made at the mint that enforces where its donations go', /is ready/.test(made) && /dest:/.test(made) && !!link, made.split('\n').find(l => /dest|cannot|✗/.test(l)) || made.slice(0, 80));
if (!link) { say('destflow: no campaign, nothing else can be tested'); await b.close(); relays.forEach(r => r.close && r.close()); process.exit(1); }

// THE DONORS' APP: two donations, sent to Streetcat by relay
const give = async n => { await donor.goto(link); await donor.reload(); await tab(donor, 'decash'); await donor.fill('#d-token', await plain(n)); await donor.click('#d-go'); const t = await waitText(donor, '#d-out', /LOCKED|Failed|✗/, 40000); await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000); return t; };
const g1 = await give(2100), g2 = await give(300);
await tab(rescue, 'home'); await front(rescue); for (let i = 0; i < 60; i++) { await rescue.waitForTimeout(500); if (await rescue.evaluate(() => Object.values(JSON.parse(localStorage.getItem('vetlock.sc.ledger') || '{}')).reduce((s, L) => s + Object.keys(L.entries || {}).length, 0)) >= 2) break; await front(rescue); }
const pot = async () => { await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); const ps = await lines(rescue, '#kd-pots'); const m = ((ps[0] && ps[0].subs[1]) || '').match(/^([\d\s]+) sat given · ([\d\s]+) sat to spend$/); return m ? { given: num(m[1]), spend: num(m[2]), n: ps.length } : { n: ps.length, raw: JSON.stringify(ps) }; };
const p0 = await pot();
check('two donations (2 100 and 300 sat, less what locking costs at a mint with fees) reach the pot in Rescue\'s app by relay', /LOCKED/.test(g1) && /LOCKED/.test(g2) && p0.n === 1 && p0.given > 2380 && p0.given <= 2400 && p0.spend === p0.given, JSON.stringify(p0));

// RESCUE's request: 2 201 sat, of the second clinic
await rescue.click('#kd-req'); await rescue.waitForSelector('#snew.on'); await rescue.fill('#sn-cat', 'Luna'); await rescue.fill('#sn-proc', 'Spay'); await rescue.fill('#sn-cost', '2201'); await waitText(rescue, '#sn-cover', /✓|✗/, 30000);
const chips = await rescue.$$eval('#sn-pars button', bs => bs.map(x => (x.classList.contains('on') ? '[x] ' : '[ ] ') + x.textContent)), go0 = await txt(rescue, '#sn-go');
check('the request form shows the pot\'s two partners, the first chosen, and sends to it', await rescue.isVisible('#sn-pars') && chips.join() === '[x] Clinica Norte,[ ] Clinica Sur' && go0 === 'Send to Clinica Norte', chips.join() + ' · ' + go0);
await rescue.locator('#sn-pars button', { hasText: 'Clinica Sur' }).click(); const go1 = await txt(rescue, '#sn-go'), kl = await rescue.$$eval('#sn-keys .kline', ls => ls.map(l => l.querySelector('small').textContent + ' ' + l.querySelector('.kk').textContent));
check('…a tap chooses the other: the button and the key line say so', go1 === 'Send to Clinica Sur' && kl.length === 2 && kl[1] === 'Clinica Sur · clinic ' + B, go1 + ' · ' + kl[1]);
await waitText(rescue, '#sn-cover', /✓/, 30000); await rescue.click('#sn-go'); await rescue.waitForSelector('#sreq.on', { timeout: 30000 });
const qid = (await txt(rescue, '#sq-head .mut')).replace(/^request /, ''), sent = await waitText(rescue, '#sq-steps', /sent · 2 of 2/, 30000), q = await rescue.evaluate(id => window.__vetlock.sreqs().find(r => r.id === id).q, qid);
const sp = C.requestSplit(q), back = sp.reduce((s, x) => s + x.rest, 0), paid = sp.reduce((s, x) => s + x.pay, 0), fee = sp.reduce((s, x) => s + x.fee, 0);  /* what its transactions do: to the clinic, back under each lock, and to the mint where it charges */
check('it is sent, naming the second clinic, and says what each donation\'s transaction is: 2 201 sat in all, and what is left of a proof goes back under its lock', /sent · 2 of 2/.test(sent) && q.payee === B && sp.length === 2 && paid + fee === 2201 && back > 0 && sp.every(x => x.fee === C.amt(w.getFeesForProofs(q.contributions[sp.indexOf(x)].proofs))) && !C.requestProblems(q).length, sp.map(x => `${x.pay} + ${x.rest}${x.fee ? ` + ${x.fee} fee` : ''} of ${x.total}`).join(' | '));

// THE PARTNERS' APPS: only the one asked gets it
await tab(sur, 'work'); await sur.waitForTimeout(1500); await front(sur); await tab(norte, 'work'); await front(norte);
const came = await sur.waitForFunction(id => window.__vetlock.creqs().some(r => r.id === id), qid, { timeout: 20000 }).then(() => true).catch(() => false);
await norte.waitForTimeout(2500); const others = await norte.evaluate(() => window.__vetlock.creqs().length);
check('the clinic asked has the request; the pot\'s other clinic has nothing', came && others === 0, `asked: ${came}, the other: ${others}`);
await openReq(sur);
const dl = await sur.$$eval('#cr-dl dt', ds => ds.map(d => d.textContent + ': ' + d.nextElementSibling.textContent)), gives = (await txt(sur, '#cr-gives')).split('\n'), warn = await txt(sur, '#cr-warn');
check('its screen says who is paid (its own key) and, donation by donation, what goes to it and what stays locked', dl.includes('Releases: 2 201 sat') && dl.includes(`Paid to: you · ${B.slice(0, 10)}…`) && gives.join('|') === sp.map(x => `${x.ref} · ${fmt(x.pay)} to you${x.rest ? ` · ${fmt(x.rest)} stay locked` : ''}${x.fee ? ` · ${fmt(x.fee)} mint fee` : ''}`).join('|') && !/✗/.test(warn), gives.join(' | ') + (warn ? ' · ' + warn : ''));
await sur.check('#cr-ok'); await sur.click('#cr-go'); const conf = await waitText(sur, '#cr-out', /CONFIRMED|✗|Failed|Not possible/, 30000);
check('…and it confirms', /CONFIRMED/.test(conf), conf.split('\n')[0]);

// RESCUE releases: the mint pays the clinic
await rescue.waitForTimeout(1500); await tab(rescue, 'home'); await front(rescue);
const ready = await rescue.waitForSelector('#h-kinds button.req.torel', { timeout: 20000 }).then(() => true).catch(() => false), torel = await lines(rescue, '#h-kinds');
check('Rescue\'s Home lists it to release, confirmed by the clinic that was asked', ready && torel.length === 1 && torel[0].subs[0] === `2 201 sat from TNR LISTA · ${qid}` && /^✓ confirmed by Clinica Sur · /.test(torel[0].subs[1]), JSON.stringify(torel));
check('before the release the mint has paid nothing', (await paidTo(q, B)) === 0);
await rescue.click('#h-kinds button.req.torel'); await rescue.waitForSelector('#sreq.on'); const goR = await txt(rescue, '#sq-go');
await rescue.click('#sq-go'); const rel = await waitText(rescue, '#sq-steps', /✓ paid|✗/, 60000), out = await waitText(rescue, '#sq-out', /PAID|Mint refused|Not possible|Interrupted/, 20000);
check('"Release 2 201 sat": the mint pays the clinic, and what is left of the proof that was split goes back under its donor\'s lock', goR === 'Release 2 201 sat' && rel.includes(`✓ paid ${fmt(paid)} to Clinica Sur by the mint · ${fmt(back)} put back under the lock`) && out.startsWith(`PAID ${fmt(paid)} to Clinica Sur, by the mint${fee ? ` (${fmt(fee)} mint fee)` : ''}. ${fmt(back)} went back under the same lock`), (rel.split('\n').find(l => /paid|✗/.test(l)) || rel.slice(-80)) + ' · ' + out.slice(0, 60));
const atMint = await paidTo(q, B), toNorte = await paidTo(q, A), kept = await rescue.evaluate(() => window.__vetlock.releasedList().length);
check('read from the mint: what was asked, less the mint\'s fee where it charges one, locked to that clinic\'s key; none to the other, and nothing came to Rescue\'s app', atMint === paid && toNorte === 0 && kept === 0, `${atMint} to the clinic asked, ${toNorte} to the other, ${kept} kept by Rescue`);
const p1 = await pot();
check('the pot has 2 201 sat less to spend', p1.given === p0.given && p1.spend === p0.given - 2201, JSON.stringify(p1));

// WHAT WAS LEFT pays the first clinic: 150 of the 199 sat, the rest that was put back among them
await rescue.click('#kd-req'); await rescue.waitForSelector('#snew.on'); await rescue.fill('#sn-cat', 'Nube'); await rescue.fill('#sn-proc', 'Neuter'); await rescue.fill('#sn-cost', '150'); await waitText(rescue, '#sn-cover', /✓|✗/, 30000);
const cover = await txt(rescue, '#sn-cover'); await rescue.click('#sn-go'); await rescue.waitForSelector('#sreq.on', { timeout: 30000 });
const qid2 = (await txt(rescue, '#sq-head .mut')).replace(/^request /, ''); await waitText(rescue, '#sq-steps', /sent · 2 of 2/, 30000); const q2 = await rescue.evaluate(id => window.__vetlock.sreqs().find(r => r.id === id).q, qid2);
const sp2 = C.requestSplit(q2), back2 = sp2.reduce((s, x) => s + x.rest, 0), paid2 = sp2.reduce((s, x) => s + x.pay, 0), fee2 = sp2.reduce((s, x) => s + x.fee, 0), restYs = new Set((await Promise.all(q.contributions.map(k => C.reqTx(q, k)))).flatMap(t => t.open.map(o => C.yOf(o.secret))));
check('a second request, of the first clinic, is paid from what was left, the proofs put back among them', /150 of 150 sat ✓/.test(cover) && q2.payee === A && paid2 + fee2 === 150 && q2.contributions.some(k => k.proofs.some(x => restYs.has(C.yOf(x.secret)))), cover + ' · ' + sp2.map(x => `${x.pay} + ${x.rest} of ${x.total}`).join(' | '));
await tab(norte, 'work'); await norte.waitForTimeout(1500); await front(norte); await norte.waitForFunction(id => window.__vetlock.creqs().some(r => r.id === id), qid2, { timeout: 20000 }).catch(() => {});
await openReq(norte); await norte.check('#cr-ok'); await norte.click('#cr-go'); const conf2 = await waitText(norte, '#cr-out', /CONFIRMED|✗|Failed|Not possible/, 30000);
await rescue.waitForTimeout(1500); await tab(rescue, 'home'); await front(rescue); await rescue.waitForSelector('#h-kinds button.req.torel', { timeout: 20000 }).catch(() => {});
await rescue.click('#h-kinds button.req.torel'); await rescue.waitForSelector('#sreq.on'); await rescue.click('#sq-go'); const rel2 = await waitText(rescue, '#sq-steps', /✓ paid|✗/, 60000);
const atMint2 = await paidTo(q2, A), p2 = await pot();
check('…confirmed by it and paid to it by the mint; the pot has 150 sat less again', /CONFIRMED/.test(conf2) && rel2.includes(`✓ paid ${fmt(paid2)} to Clinica Norte by the mint${back2 ? ` · ${fmt(back2)} put back under the lock` : ''}`) && atMint2 === paid2 && p2.given === p0.given && p2.spend === p0.given - 2201 - 150, (rel2.split('\n').find(l => /paid|✗/.test(l)) || conf2.split('\n')[0]) + ' · ' + JSON.stringify(p2));
say(bad ? `destflow: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'destflow: every check passed');
await b.close(); relays.forEach(r => r.close && r.close()); process.exit(bad ? 1 : 0);
