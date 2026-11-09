// A shop confirms a delivery (StreetCat, 7 Nov: a partner that is not a clinic, «un proveedor de alimentos… fotos del albarán del cuando se
// recibe el pedido o fotos del pedido»; «Perfecto, me parece bien lo que propones»): against the local mint and two local relays, with
// made-up keys. Rescue adds the shop as a partner and makes a food pot; a donor gives to it; Rescue sends a food request to the shop.
// The shop's phone shows it in its words (for which colony, what, "Confirm delivery"), asks for a photo of the delivery note or of the
// goods (no invoice's fingerprint), and refuses to confirm without one; with both, it confirms: the photos are named in its signed
// confirmation and go to Streetcat by relay in parts. Rescue checks the confirmation, shows the photos under the request, and releases.
// Every ✗ in red (colors.mjs). Fits 320 to 430 px.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1200); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7331 }), startRelay({ port: 7332 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const FIT = []; const fits = async (p, label) => { const vs = p.viewportSize(), over = []; for (const wd of [320, 375, 390, 430]) { await p.setViewportSize({ width: wd, height: 740 }); await p.waitForTimeout(80); const o = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${wd}px +${o}`); } await p.setViewportSize(vs); if (over.length) FIT.push(`${label}: ${over.join(', ')}`); };
const red = (p, s) => p.$eval(s, e => getComputedStyle(e).color === (() => { const i = document.createElement('i'); i.style.color = 'var(--bad)'; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; })());
// a photo of a delivery note (lines of text on paper) or of the goods (a sack), drawn in the page
const jpeg = async (p, what) => Buffer.from(await p.evaluate(async what => { const cv = new OffscreenCanvas(640, 480), g = cv.getContext('2d');
  if (what === 'note') { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#222'; g.font = '28px sans-serif'; g.fillText('ALBARÁN 2026-0412', 40, 70); for (let i = 0; i < 8; i++) g.fillRect(40, 120 + i * 38, 300 + (i * 53) % 220, 10); }
  else { g.fillStyle = '#6b8f5a'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#c9a66b'; g.beginPath(); g.ellipse(320, 260, 170, 200, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#7a5a2b'; g.font = '40px sans-serif'; g.fillText('20 kg', 270, 270); }
  const bl = await cv.convertToBlob({ type: 'image/jpeg', quality: .9 }), a = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s); }, what), 'base64');
const snap = async (p, slot) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(`#cr-shots .shot[data-slot="${slot}"]`)]); await fc.setFiles({ name: `IMG_${slot}.JPG`, mimeType: 'image/jpeg', buffer: await jpeg(p, slot) }); await p.waitForSelector(`#cr-shots .shot[data-slot="${slot}"].has`, { timeout: 30000 }); };

// the shop, Rescue and a donor
const shop = await page(), sc = await page(), donor = await page();
await tab(shop, 'csettings'); await shop.click('#cs-new'); const shopPk = await shop.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(800); await sc.reload(); await sc.waitForTimeout(500);
// Rescue: the shop as a partner, and a food pot for colony Marina
await tab(sc, 'home'); await sc.locator('#h-kinds button.tile', { hasText: 'Food' }).click(); await sc.click('#kd-camp'); await sc.waitForSelector('#campaign.on'); await sc.fill('#k-name', 'COMIDA MARINA');
await sc.click('#k-col'); await sc.waitForSelector('#spick.on'); await sc.click('#pp-add'); await sc.fill('#pp-name', 'colony Marina'); await sc.click('#pp-save'); await sc.waitForSelector('#campaign.on');
await sc.click('#k-par'); await sc.waitForSelector('#spick.on'); await sc.click('#pp-add'); await sc.fill('#pp-name', 'Pienso Sur'); await sc.fill('#pp-key', shopPk); await sc.click('#pp-save'); await sc.waitForSelector('#campaign.on');
await sc.fill('#k-mint', MINT); await sc.click('#k-go'); const made = await waitText(sc, '#k-out', /is ready|cannot|✗/, 30000); const link = (made.match(/http\S+#c=\S+/) || [])[0];
check('Rescue makes a food pot for colony Marina, confirmed by the shop', /Campaign COMIDA MARINA is ready/.test(made), made.slice(-60));
// a donor gives to it
await donor.goto(link); await donor.reload(); await donor.evaluate(() => window.__vetlock.openTab('decash')); await donor.fill('#d-token', await plain(21000)); await donor.click('#d-go');
const locked = await waitText(donor, '#d-out', /LOCKED|Failed|✗/, 30000); await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000);
// Rescue: the donation, then a food request to the shop
await tab(sc, 'home'); await sc.locator('#h-kinds button.tile', { hasText: 'Food' }).click(); await sc.locator('#kd-pots button.req', { hasText: 'COMIDA MARINA' }).click(); await sc.locator('#kd-pots .row2 button', { hasText: 'donations and requests' }).click();
await sc.click('#sc-check'); await waitText(sc, '#sc-net', /checked/, 30000);
check('the donation reaches Rescue, in the pot', /LOCKED/.test(locked) && (await sc.$$eval('#sc-dons .item', xs => xs.length)) === 1);
await sc.click('#sc-new'); await sc.waitForSelector('#snew.on'); await sc.fill('#sn-proc', '20 kg dry feed'); await sc.fill('#sn-cost', '18000'); await waitText(sc, '#sn-cover', /✓|✗/, 30000);
await sc.click('#sn-go'); const sent = await waitText(sc, '#sq-steps', /sent · \d of 2/, 30000);
check('the request goes to the shop: 20 kg dry feed for colony Marina, 18 000 sat', /sent · 2 of 2/.test(sent) && /^Forcolony MarinaWhat20 kg dry feed/.test(await txt(sc, '#sq-dl')), (await txt(sc, '#sq-dl')).slice(0, 60));

// THE SHOP: the request, in its words
await tab(shop, 'work'); await shop.click('#w-check'); await showW(shop, 'w-pend'); await waitText(shop, '#w-list', /20 kg dry feed/, 30000); await shop.click('#w-list .item'); await shop.waitForSelector('#creq.on');
const dl = await txt(shop, '#cr-dl');
check('the shop sees what to deliver and for which colony, not a cat and a procedure', /^Forcolony MarinaWhat20 kg dry feedDate\d{4}-\d{2}-\d{2}Releases18 000 sat/.test(dl), dl.slice(0, 70));
check('…a box to say it was delivered, and the photos it takes: the delivery note and the goods; no invoice\'s fingerprint', (await txt(shop, '#cr-ok-t')) === 'I confirm this was delivered as it says, on this date.' && await shop.isVisible('#cr-shots') && (await shop.$$eval('#cr-shots .shot span', ss => ss.map(s => s.textContent).join())) === 'delivery note,the goods' && await shop.isHidden('#cr-evrow') && await shop.isHidden('#cr-ev') && (await txt(shop, '#cr-shots-l')) === 'Photos of the delivery');
check('…and "Confirm delivery"', (await txt(shop, '#cr-go')) === 'Confirm delivery');
await fits(shop, 'the shop\'s request'); await shot(shop, 'dv-1-shop-request');
await shop.check('#cr-ok'); await shop.click('#cr-go'); const noPhoto = await waitText(shop, '#cr-out', /✗|Failed/, 10000);
check('without a photo it does not confirm: it says so, in red', /^Failed: add a photo first: delivery note, or the goods$/.test(noPhoto) && await red(shop, '#cr-out') && !(await shop.evaluate(() => window.__vetlock.creqs()[0].answer)), noPhoto);
await snap(shop, 'note'); await snap(shop, 'goods');
check('…the two photos show where they were taken, made small here', (await shop.$$eval('#cr-shots .shot img', is => is.length)) === 2 && /^2 of 2 · \d+ kB/.test(await txt(shop, '#cr-shots-st')), await txt(shop, '#cr-shots-st'));
await fits(shop, 'the shop\'s request with its photos'); await shot(shop, 'dv-2-shop-photos');
await shop.click('#cr-go'); const conf = await waitText(shop, '#cr-out', /DELIVERY CONFIRMED[\s\S]*✓ sent to Streetcat/, 30000);
const a = await shop.evaluate(() => window.__vetlock.creqs()[0].answer);
check('confirmed: its two photos are named in the signed confirmation, by fingerprint', /^DELIVERY CONFIRMED/.test(conf) && a && a.kind === 'certified' && (a.statement.photos || []).map(p => p.slot).join() === 'note,goods' && a.statement.photos.every(p => /^[0-9a-f]{64}$/.test(p.sha256)), conf.split('\n').slice(0, 2).join(' / '));
const photosSent = await waitText(shop, '#cr-out', /with 2 photos, named in it · ✓ sent/, 60000);
check('…and they go to Streetcat by relay', /✓ sent/.test(photosSent), photosSent.split('\n')[1]);
await shot(shop, 'dv-3-shop-confirmed');

// RESCUE: the confirmation checks out, the photos come, and the request is released
await tab(sc, 'home'); await sc.locator('#h-kinds button.tile', { hasText: 'Food' }).click(); await sc.locator('#kd-pots button.req', { hasText: 'COMIDA MARINA' }).click(); await sc.locator('#kd-pots .row2 button', { hasText: 'donations and requests' }).click();
await sc.click('#sc-check'); await waitText(sc, '#sc-net', /answer/, 30000); await sc.click('#sc-reqs .item'); await sc.waitForSelector('#sreq.on');
for (let i = 0; i < 6 && (await sc.$$eval('#sq-ans-pics img', is => is.length)) < 2; i++) { await sc.evaluate(() => window.__vetlock.scCheck()); await sc.evaluate(() => window.__vetlock.openTab('sreq')); await sc.waitForTimeout(800); }
const steps = await txt(sc, '#sq-steps'), ansL = await txt(sc, '#sq-ans-l'), nimg = await sc.$$eval('#sq-ans-pics img', is => is.length);
check('Rescue checks the shop\'s confirmation: signed with its key, naming exactly this request', /✓ certified/.test(steps) && /answered|certified/.test(steps), steps.split('\n').slice(3, 5).join(' / '));
check('…and shows its photos under the request: the delivery note and the goods, from Pienso Sur', ansL === 'Photos of the delivery · from Pienso Sur' && nimg === 2 && /named in its signed confirmation/.test(await txt(sc, '#sq-ans-st')), `${ansL} · ${nimg} photos`);
await fits(sc, 'the request with the shop\'s photos'); await shot(sc, 'dv-4-rescue');
const here = await sc.evaluate(async hs => { const out = []; for (const h of hs) out.push(await window.__vetlock.photoHere(h)); return out; }, a.statement.photos.map(p => p.sha256));
check('…each photo here is the one named (its SHA-256 checked when it came)', here.every(Boolean), here.join(' · '));
await sc.click('#sq-go'); const rel = await waitText(sc, '#sq-out', /RELEASED|✗|Not possible/, 60000);
const paid = Number(((rel.match(/^RELEASED ([\d ]+) sat/) || [])[1] || '0').replace(/ /g, ''));
check('Rescue releases what the shop confirmed, less only the mint\'s fee', paid <= 18000 && paid >= 18000 - 3, rel.slice(0, 80));  /* a mint with input fees takes its sat on the release */
// a confirmation whose photos were swapped afterwards does not check out
const swapped = await sc.evaluate(async () => { const r = window.__vetlock.sreqs()[0], a = JSON.parse(JSON.stringify(r.answer)); a.statement.photos[0].sha256 = 'f'.repeat(64); return (await window.scCore.checkAnswer(r.q, a)).ok; });
check('a confirmation whose photos were swapped afterwards is not certified', swapped === false);

check('these screens fit at 320, 375, 390 and 430 px', !FIT.length, FIT.join(' · '));
say(bad ? `delivery: ${bad} check(s) failed` : 'delivery: every check passed');
await b.close(); for (const r of relays) await r.close(); process.exit(bad ? 1 : 0);

// the partner's home shows its requests only once one of its two numbers is tapped (9 Nov): show that one (if not shown) and wait for it typed in
async function showW(p, id){ await p.evaluate(id => { const b = document.getElementById(id); if (b && !b.classList.contains('on')) b.click(); }, id); await p.waitForFunction(() => !document.querySelector('#w-list [style*="max-height"]'), null, { timeout: 15000 }).catch(() => {}); }
