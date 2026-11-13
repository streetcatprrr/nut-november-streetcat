// Nothing may be wider than the phone: every tab of every role, and the status page, at 320, 375, 390 and 430 px.
// Prints one line per width; a screen that overflows is named with how many pixels it sticks out and the widest element.
// Then every phone shows Donate as an iPhone 14–16 does: in
// Chromium's mobile emulation, which reads the viewport meta tag as phones do, fit.js lays the page out 390 px wide (a little wider on
// a short screen) and the browser scales it to the screen; opened from a signed campaign link with an amount chosen, Donate must not
// scroll in what Safari or Chrome shows with their bars, on seven phones from the first SE to the Pro Max.
import { chromium } from 'playwright';
import fs from 'fs';
import { pinBrowser, pin } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/';
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const TABS = [['donate'], ['refund'], ['dhand'], ['dcard'], ['decash'], ['work'], ['creq'], ['csettings'], ['coffline'], ['keys'], ['home'], ['scamp'], ['snew'], ['sreq'], ['shand'], ['release'], ['campaign'], ['keys', 'release'], ['catnew'], ['cats'], ['cat'], ['cats', 'release'], ['cat', 'release']];  // [tab, a tab of the role to be in first]
// (empty screens here; requests_test.mjs and handover_test.mjs check the same widths with the screens filled)
const widest = () => { let w = null, max = innerWidth; for (const e of document.querySelectorAll('body *')) { const r = e.getBoundingClientRect(); if (r.width && r.right > max + 0.5 && getComputedStyle(e).position !== 'fixed') { max = r.right; w = (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '')) + ' ' + Math.round(r.right); } } return w; };
let bad = 0;
for (const w of [320, 375, 390, 430]) {
  const p = await (await b.newContext({ viewport: { width: w, height: 740 } })).newPage(); p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); const row = [];
  for (const [t, via] of TABS) {
    if (via) { await p.evaluate(t => window.__vetlock.openTab(t), via); await p.evaluate(t => document.querySelector(`nav button[data-t="${t}"]`).click(), t); } else await p.evaluate(t => window.__vetlock.openTab(t), t);
    await p.waitForTimeout(150);
    const r = await p.evaluate(widest => ({ over: document.scrollingElement.scrollWidth - innerWidth, el: eval(widest)() }), '(' + widest.toString() + ')');
    if (r.over > 0) { bad++; row.push(`${t}${via ? '(' + via + ')' : ''} +${r.over} ${r.el || ''}`); }
  }
  for (const page of ['status.html']) { await p.goto(BASE + page); await p.waitForTimeout(300); const over = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (over > 0) { bad++; row.push(`${page} +${over}`); } }
  console.log(`${w}px:`, row.length ? 'OVERFLOW ' + row.join(' · ') : 'nothing overflows');
  await p.context().close();
}
console.log(bad ? `layout: ${bad} screen(s) overflow` : 'layout: every screen fits');

// Donate's height, with a signed campaign as Streetcat's page makes it (a key made here, pinned next to the published one)
const APP = new URL('../app/', import.meta.url).pathname, MINT = process.env.MINT || 'http://127.0.0.1:3338';
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, hex = x => Array.from(x, y => y.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
const scSk = newSk(); await pin(C.pubOf(scSk));
const camp = await C.signCampaign({ name: 'TNR MARINA', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(scSk), clinic: C.pubOf(newSk()), deadline: Math.floor(Date.now() / 1000) + 30 * 86400, hue: 200 }, scSk);
const link = BASE + 'index.html#c=' + Buffer.from(JSON.stringify(camp), 'utf8').toString('base64url');
let short = 0;
const PHONES = [['iPhone 14–16', 390, 664, 844], ['Pro Max', 430, 740, 932], ['13 mini', 375, 629, 812], ['SE', 375, 548, 667], ['first SE', 320, 460, 568], ['Android 16:9', 360, 560, 640], ['Pixel', 412, 780, 915]];  // [name, visible width, visible height, screen height]
for (const [what, w, h, sh] of PHONES) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: sh }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage(); p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(link); await p.reload();
  for (let i = 0, last = '', same = 0; i < 120 && same < 6; i++) { await p.waitForTimeout(150); const t = await p.evaluate(() => document.getElementById('d-campinfo').innerText); same = t === last && /signed by Streetcat/.test(t) ? same + 1 : 0; last = t; }  /* the campaign types itself in */
  await p.waitForTimeout(1500); await p.tap('button[data-amt="21"]'); await p.waitForTimeout(900);  /* an amount chosen: "Pay 21 sat with Lightning" */
  const m = await p.evaluate(() => ({ vw: innerWidth, vh: innerHeight, scale: visualViewport ? visualViewport.scale : 1, over: document.scrollingElement.scrollHeight - innerHeight, wide: document.scrollingElement.scrollWidth - innerWidth, end: Math.ceil(document.getElementById('d-links').getBoundingClientRect().bottom), signed: /signed by Streetcat/.test(document.getElementById('d-campinfo').innerText) }));
  const ok = m.over <= 0 && m.wide <= 0 && m.vw >= 390 && m.signed;
  if (!ok) short++; console.log((ok ? '✓ ' : '✗ ') + `Donate on a ${what} (${w}×${h} visible): laid out ${m.vw} px wide, scaled ×${m.scale.toFixed(2)}, ` + (m.over > 0 ? `scrolls by ${m.over} px` : `fits with ${m.vh - m.end - 24} px to spare`) + (m.wide > 0 ? `, ${m.wide} px too wide` : '') + (m.signed ? '' : ' · (the campaign did not say "signed by Streetcat")'));
  await p.context().close(); }
console.log(short ? `layout: Donate does not fit on ${short} of ${PHONES.length} phones` : `layout: Donate fits on all ${PHONES.length} phones, laid out as on an iPhone 14–16`);
await b.close();
if (bad || short) process.exitCode = 1;
