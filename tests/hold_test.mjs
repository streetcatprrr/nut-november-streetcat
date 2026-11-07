// Hold to confirm (StreetCat, 7 Nov: «que la barra hubiese que pulsarla durante… 3 segundos hasta que se cargase entera… y luego… algún
// parpadeo»; «cuando sea una acción definitiva»), against the local mint and a local test relay (made-up keys, fake money). Every button
// that moves money or signs needs holding; Pay with Lightning, which only shows an invoice, stays a tap. A tap does nothing and says
// "hold to confirm"; let go early, the fill empties and nothing happens; held its full time (the app's own, read from the page), the
// fill reaches the right in the colour of whose screen it is (Streetcat green, the donor orange, the clinic blue), blinks twice and the
// button acts: a campaign is made, a donation locked (held with the keyboard's Space), a token certified. Done, it cannot be held again.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relay = startRelay({ port: 7291 }); await relay.ready;
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), { hold: true });
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }); await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, relay.url);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); return p; };
const clinic = await page(), sc = await page(), donor = await page();
for (const p of [clinic, sc, donor]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(100); } return x; };
const at = async (p, sel) => { await p.locator(sel).scrollIntoViewIfNeeded(); const r = await p.locator(sel).boundingBox(); await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2); };
const fill = (p, sel) => p.$eval(sel, b => { const m = getComputedStyle(b, '::before').transform; return m === 'none' ? 0 : Number(m.match(/^matrix\(([-\d.e]+)/)[1]); });  /* how far the fill has come, 0–1 */
const fillColor = (p, sel) => p.$eval(sel, b => { const c = getComputedStyle(b, '::before').backgroundColor, i = document.createElement('i'); i.style.color = getComputedStyle(document.body).getPropertyValue('--hold'); document.body.appendChild(i); const want = getComputedStyle(i).color; i.remove(); return { c, want, role: document.body.dataset.role }; });
const setHold = (p, ms) => p.evaluate(ms => { if (ms == null) localStorage.removeItem('vetlock.holdms'); else localStorage.setItem('vetlock.holdms', String(ms)); }, ms);

// which buttons need holding
const held = await sc.evaluate(() => window.__vetlock.HOLD.map(id => [id, document.getElementById(id).classList.contains('hold')]));
check('every button that moves money or signs needs holding (11), Pay with Lightning stays a tap', held.length === 11 && held.every(x => x[1]) && !(await donor.$eval('#d-ln', b => b.classList.contains('hold'))), held.map(x => x[0]).join(' '));

// keys, then Streetcat's campaign, held for the app's own time
await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1200); const clinicPk = await txt(clinic, '#cs-pk');
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1200); await sc.reload(); await tab(sc, 'campaign');
await sc.fill('#k-name', 'MOCHI'); await sc.fill('#k-op', 'sterilisation'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk); await sc.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10));
const T = await sc.evaluate(() => window.__vetlock.holdMs());
await at(sc, '#k-go'); await sc.mouse.down(); await sc.waitForTimeout(150); await sc.mouse.up(); await sc.waitForTimeout(700);
check('a tap does nothing, and the button says "hold to confirm"', !(await txt(sc, '#k-out')) && /hold to confirm/i.test(await txt(sc, '#k-go')), await txt(sc, '#k-go'));
await sc.waitForTimeout(1600); await at(sc, '#k-go'); await sc.mouse.down(); await sc.waitForTimeout(T / 2); const half = await fill(sc, '#k-go'); const col = await fillColor(sc, '#k-go'); await sc.mouse.up(); await sc.waitForTimeout(600);
check(`held half its time (the app's: ${T} ms), it is half full, in Streetcat's green`, half > .3 && half < .7 && col.role === 'streetcat' && col.c === col.want, `${half.toFixed(2)} · ${col.c}`);
check('…let go, it empties, and nothing happens', (await fill(sc, '#k-go')) === 0 && !(await txt(sc, '#k-out')));
await sc.waitForTimeout(1600); await at(sc, '#k-go'); const t0 = Date.now(); await sc.mouse.down(); await sc.waitForTimeout(T - 300); const early = await txt(sc, '#k-out');
await sc.waitForFunction(() => document.getElementById('k-go').classList.contains('held'), null, { timeout: 3000 }).catch(() => {}); const blink = await sc.$eval('#k-go', b => b.classList.contains('held') && getComputedStyle(b, '::before').animationName === 'held');
await sc.mouse.up(); const made = await waitText(sc, '#k-out', /is ready|cannot/, 30000);
check('held its full time: nothing before, then full, it blinks, and the campaign is made', !early && blink && /Campaign MOCHI is ready/.test(made), `${Date.now() - t0} ms`);
const link = made.match(/http\S+#c=\S+/)[0];

// the donor locks a donation, held with the keyboard: orange
await setHold(donor, 600); await donor.goto(link); await donor.reload(); await tab(donor, 'decash'); await donor.fill('#d-token', await plain(2100));
await donor.focus('#d-go'); await donor.keyboard.down('Space'); await donor.waitForTimeout(300); const dcol = await fillColor(donor, '#d-go'), dfill = await fill(donor, '#d-go');
await donor.waitForTimeout(700); await donor.keyboard.up('Space'); const locked = await waitText(donor, '#d-out', /LOCKED|Failed/, 30000);
check('the donor holds Space on "Lock my donation": it fills in orange, and the donation is locked', dcol.role === 'donor' && dcol.c === dcol.want && dfill > .2 && /LOCKED 2100 sat for MOCHI/.test(locked), `${dcol.c} · ${(locked.match(/LOCKED 2100 sat for MOCHI/) || [locked.slice(0, 60)])[0]}`);
const token = await donor.evaluate(() => window.__vetlock.donorKeys().map(k => k.lockedToken).filter(Boolean).pop());

// the clinic certifies it, held: blue; done, it cannot be held again
await setHold(clinic, 600); await tab(clinic, 'certify'); await clinic.fill('#c-token', token); await clinic.waitForTimeout(800);
await at(clinic, '#c-go'); await clinic.mouse.down(); await clinic.waitForTimeout(300); const ccol = await fillColor(clinic, '#c-go'); await clinic.waitForTimeout(700); await clinic.mouse.up();
const cert = await waitText(clinic, '#c-out', /CERTIFIED|Failed|Not possible/, 30000);
check('the clinic holds "Certify": it fills in blue, and the token is certified', ccol.role === 'clinic' && ccol.c === ccol.want && /^CERTIFIED 2100 sat/.test(cert), `${ccol.c} · ${cert.split('\n')[0]}`);
await at(clinic, '#c-go'); await clinic.mouse.down(); await clinic.waitForTimeout(300); const again = await clinic.$eval('#c-go', b => b.classList.contains('holding')); await clinic.mouse.up();
check('…done ("✓ Certified"), it cannot be held again', !again && /Certified/.test(await txt(clinic, '#c-go')), await txt(clinic, '#c-go'));
check('the three colours differ: green, orange, blue', new Set([col.c, dcol.c, ccol.c]).size === 3, [col.c, dcol.c, ccol.c].join(' · '));

await b.close(); await relay.close(); say(bad ? `hold: ${bad} check(s) failed` : 'hold: every check passed'); process.exit(bad ? 1 : 0);
