// The donor's locked donation goes to Streetcat by itself. In the three apps (donor, Rescue, partner), against the local mint and local relays:
//  1. a donation locks: with no tap, the line says "sent to Streetcat ✓", the donor's outbox holds it once, and it is in Rescue's campaign;
//  2. no relay answers: the line says so in red, and the app keeps trying by itself;
//  3. the relay comes back: it goes, the line turns to "sent to Streetcat ✓", and Rescue's campaign has it, once.
// SHOT_DIR=dir: the donor's screen in each case, at 390 px @2x.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', SHOT = process.env.SHOT_DIR, say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('the mint did not pay the quote'); };
const up = [startRelay({ port: 7431 }), startRelay({ port: 7432 })]; await Promise.all(up.map(r => r.ready));
const LATE = 'ws://127.0.0.1:7433', ALL = [...up.map(r => r.url), LATE].join(',');  /* the third relay is down until case 3 */
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async relays => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 });
  await c.addInitScript(r => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', r); } catch (_) {} }, relays);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => { say('DIALOG', d.message()); d.accept(); }); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const shot = async (p, name) => { if (!SHOT) return; await p.evaluate(() => { const e = document.querySelector('#d-out .send-sc'); if (e) e.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(1200); await p.screenshot({ path: `${SHOT}/${name}.png` }); };
const ledger = p => p.evaluate(() => { const all = JSON.parse(localStorage.getItem('vetlock.sc.ledger') || '{}'); return Object.values(all).flatMap(L => Object.entries((L && L.entries) || {}).map(([ref, e]) => ({ ref, amount: Number(e.amount) }))); });
const waitLedger = async (p, n, ms = 40000) => { const t0 = Date.now(); let l = []; while (Date.now() - t0 < ms) { await p.evaluate(() => window.__vetlock.scCheck()).catch(() => {}); l = await ledger(p); if (l.length >= n) return l; await p.waitForTimeout(1000); } return l; };
const donations = p => p.evaluate(() => window.__vetlock.outbox().filter(x => x.t === 'streetcat.donation').map(x => ({ id: x.id, ref: x.ref, state: x.state, relays: x.relays })));

// the three apps, their keys, and a campaign with its partner (Rescue reads every relay, the late one too)
const partner = await page(ALL), rescue = await page(ALL), donor = await page(up.map(r => r.url).join(','));
await tab(partner, 'csettings'); await partner.click('#cs-new'); const clinicPk = await partner.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
await tab(rescue, 'release'); await rescue.click('#s-new'); await rescue.waitForTimeout(800); await rescue.reload(); await rescue.waitForTimeout(500);
await tab(rescue, 'home'); await rescue.waitForTimeout(300); await rescue.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await rescue.waitForSelector('#skind.on'); await rescue.click('#kd-camp'); await rescue.waitForSelector('#campaign.on');
await rescue.click('#k-par'); await rescue.waitForSelector('#spick.on'); await rescue.click('#pp-add'); await rescue.fill('#pp-name', 'Clínica Sol'); await rescue.fill('#pp-key', clinicPk); await rescue.click('#pp-save'); await rescue.waitForSelector('#campaign.on');
await rescue.fill('#k-name', 'AUTO SEND'); await rescue.fill('#k-mint', MINT); await rescue.click('#k-go'); const made = await waitText(rescue, '#k-out', /is ready|cannot/, 30000); const L1 = (made.match(/http\S+#c=\S+/) || [])[0];
if (!L1) { say('no campaign link:', made.slice(0, 300)); process.exit(1); }
await tab(rescue, 'home');
const lock = async n => { await donor.goto(L1); await donor.reload(); await tab(donor, 'decash'); await donor.fill('#d-token', await plain(n)); await donor.click('#d-go');
  const s = await waitText(donor, '#d-out', /LOCKED|Failed|✗/, 30000); if (!/LOCKED/.test(s)) throw new Error('not locked: ' + s.slice(0, 200)); return +((s.match(/LOCKED (\d+) sat/) || [])[1] || 0); };
const line = () => donor.$eval('#d-out .send-sc', e => ({ text: e.textContent.trim(), red: e.classList.contains('bad'), tag: e.tagName })).catch(() => null);
// the line stays inside its row on a narrow phone and a wide one (a long red text wraps, never runs off the screen)
const inRow = async () => { const out = []; for (const wd of [320, 390, 430]) { await donor.setViewportSize({ width: wd, height: 844 }); await donor.waitForTimeout(150);
    const ok = await donor.$eval('#d-out .send-sc', e => { const r = e.getBoundingClientRect(), p = e.parentElement.getBoundingClientRect(); return r.left >= p.left - .5 && r.right <= p.right + .5 && document.scrollingElement.scrollWidth <= innerWidth; }).catch(() => false); if (!ok) out.push(wd); }
  await donor.setViewportSize({ width: 390, height: 844 }); return out; };

// 1. relays that answer: no tap, sent, once, in the campaign
const n1 = await lock(30); const t1 = await waitText(donor, '#d-out .send-sc', /sent to Streetcat ✓|not sent|no relay/, 20000);
const step2 = await donor.$$eval('#d-out p.center', ps => ps.map(p => p.textContent).find(t => /^2 · /.test(t)) || '');
check('1 · the donation is locked and goes to Streetcat with no tap: "sent to Streetcat ✓"', t1 === 'sent to Streetcat ✓', t1);
check('…the screen says it goes by itself', step2 === '2 · The locked token goes to Streetcat by itself.', step2);
await shot(donor, 'as-1-sent');
const o1 = await donations(donor); check('…the donor\'s outbox made it once', o1.length === 1 && o1[0].state === 'sent', JSON.stringify(o1.map(x => x.state)));
const l1 = await waitLedger(rescue, 1); check('…and it is in Rescue\'s campaign', l1.length === 1 && l1[0].ref === o1[0].ref && l1[0].amount === n1, `${l1.length} in the ledger`);

// 2. no relay answers (the donor's only relay is down): said in red, tried again by itself
await donor.evaluate(late => localStorage.setItem('vetlock.relays', late), LATE); await donor.reload();
const n2 = await lock(40); const t2 = await waitText(donor, '#d-out .send-sc', /no relay took it yet|offline|sent to Streetcat ✓/, 30000); const s2 = await line();
check('2 · no relay answers: the line says so, in red', /^no relay took it yet · trying again by itself$/.test(t2) && s2 && s2.red, JSON.stringify(s2));
await shot(donor, 'as-2-no-relay'); const w2 = await inRow(); check('…the red line fits the screen at 320, 390 and 430 px', !w2.length, w2.length ? 'runs off at ' + w2.join(', ') + ' px' : '');
const o2 = (await donations(donor)).filter(x => x.ref !== o1[0].ref); check('…the donation waits in the outbox, still being sent', o2.length === 1 && o2[0].state === 'sending', JSON.stringify(o2.map(x => x.state)));

// 3. the relay comes back: it goes by itself, the line turns, and the campaign has it once
const late = startRelay({ port: 7433 }); await late.ready;
const t3 = await (async () => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < 45000) { await donor.evaluate(() => window.__vetlock.tick()).catch(() => {}); x = await txt(donor, '#d-out .send-sc').catch(() => ''); if (x === 'sent to Streetcat ✓') return x; await donor.waitForTimeout(1500); } return x; })();
const s3 = await line(); check('3 · the relay is back: it went by itself, "sent to Streetcat ✓", no longer red', t3 === 'sent to Streetcat ✓' && s3 && !s3.red, JSON.stringify(s3));
await shot(donor, 'as-3-sent-later'); const w3 = await inRow(); check('…and so does "sent to Streetcat ✓" after it', !w3.length, w3.length ? 'runs off at ' + w3.join(', ') + ' px' : '');
const l3 = await waitLedger(rescue, 2); const o3 = await donations(donor);
check('…Rescue\'s campaign has both donations, each once', l3.length === 2 && l3.some(x => x.ref === o2[0].ref && x.amount === n2), `${l3.length} in the ledger`);
check('…and the donor\'s outbox sent each once', o3.length === 2 && o3.every(x => x.state === 'sent') && new Set(o3.map(x => x.ref)).size === 2, JSON.stringify(o3.map(x => x.state)));

say(bad ? `autosend: ${bad} check(s) failed` : 'autosend: every check passed');
await b.close(); [...up, late].forEach(r => r.close && r.close()); process.exit(bad ? 1 : 0);
