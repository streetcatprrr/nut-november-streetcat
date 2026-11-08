// The campaign form asks only for the name (StreetCat, 7 Nov: «menos parámetros para crear una nueva campaña… que me des una lista»; «Si»):
// against the local mint (answering for Minibits' address) and a local test relay, with made-up keys. One browser holds Streetcat's
// and the clinic's keys, as StreetCat's does: the form shows the name, one line with the rest filled in (sterilisation, refunds after 30
// days, Minibits) and "edit", and the two keys in their colours, Streetcat green and the clinic blue («tienen que estar en sus colores»).
// Held, the keys shuffle and land as the button fills («que se estén barajando las claves»); let go early, they are back at once. A
// campaign made with only its name carries all that, signed. The next one starts from it; "edit" opens every field with those values,
// and the clinic's key, changed there, shows at once in blue (in red while it is not a key). With no clinic to give, the fields are open;
// a browser without Streetcat's key says so in red before anything and cannot make the link. Fits 320 to 430 px.
import { chromium } from 'playwright';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', MB = 'https://mint.minibits.cash/Bitcoin', say = (...a) => console.log(...a);
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1600); await p.screenshot({ path: `${SHOT}/${name}.png` }); } };
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const relay = startRelay({ port: 7296 }); await relay.ready;
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), { hold: true, form: 'short' });
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); localStorage.setItem('vetlock.holdms', '1200'); } catch (_) {} }, relay.url);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.route(MB + '/**', async r => { const res = await fetch(r.request().url().replace(MB, MINT), { method: r.request().method(), body: r.request().postData() || undefined, headers: { 'content-type': 'application/json' } });
    r.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }); });  /* the local mint answers for Minibits */
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const FIT = []; const fits = async (p, label) => { const vs = p.viewportSize(), over = []; for (const wd of [320, 375, 390, 430]) { await p.setViewportSize({ width: wd, height: 740 }); await p.waitForTimeout(80); const o = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${wd}px +${o}`); } await p.setViewportSize(vs); if (over.length) FIT.push(`${label}: ${over.join(', ')}`); };
const visible = p => p.$$eval('#campaign input', xs => xs.filter(x => x.checkVisibility()).map(x => x.id));  /* a closed <details> hides with content-visibility: offsetParent would not tell */
const keyLines = p => p.$$eval('#k-keys .kline', ls => ls.map(l => { const k = l.querySelector('.kk .key'); return { label: l.querySelector('small').textContent, text: l.querySelector('.kk').textContent, role: k ? k.dataset.role || '' : '', h: l.style.getPropertyValue('--h'), bad: !!l.querySelector('.kk.bad') }; }));
const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

// one browser with Streetcat's key and the clinic's
const p = await page(); await tab(p, 'csettings'); await p.click('#cs-new'); await p.waitForTimeout(1000); const clinicPk = await txt(p, '#cs-pk');
await tab(p, 'release'); await p.click('#s-new'); await p.waitForTimeout(1000); await p.reload(); await p.waitForTimeout(500); const scPk = await p.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('streetcat', false)));
await tab(p, 'home'); await p.click('#h-new'); await p.waitForSelector('#campaign.on');
check('a new campaign asks for the name and shows the refund date (30 days), as a long control; operation, partner key and mint are folded (StreetCat, 8 Nov: no small print, no "edit")', JSON.stringify(await visible(p)) === '["k-name","k-dl"]' && (await p.inputValue('#k-dl')) === in30 && !(await p.$eval('#k-more', d => d.open)) && (await txt(p, '#k-more summary')) === 'Operation, partner key and mint', (await visible(p)).join(' '));
check('…nothing over the kinds, and the deadline control is as wide and high as the choose buttons', !(await p.$$eval('#campaign > label', ls => ls.some(l => /What it pays/.test(l.textContent)))) && await p.$eval('#k-dl', d => { const r = d.getBoundingClientRect(), c = document.getElementById('k-col').getBoundingClientRect(); return Math.abs(r.width - c.width) < 2 && Math.abs(r.height - c.height) < 2; }));
const K = await keyLines(p);
check('the two keys show in their colours: Streetcat green, the partner (this browser\'s clinic key, not named yet) blue', K.length === 2 && K[0].label === 'Streetcat' && K[0].text === scPk && K[0].role === 'streetcat' && Number(K[0].h) === 150 && K[1].label === 'partner' && K[1].text === clinicPk && K[1].role === 'clinic' && Number(K[1].h) === 250, K.map(k => `${k.label} ${k.text.slice(0, 10)}… ${k.role} ${k.h}`).join(' · '));
const hues = await p.$$eval('#k-keys .kline', ls => ls.map(l => [...l.querySelectorAll('.key i[style]')].map(i => Number(i.style.getPropertyValue('--h')))));
check('…every piece of each key in its role\'s shades (green 136–164, blue 236–264)', hues.length === 2 && hues[0].length > 10 && hues[0].every(h => h >= 136 && h <= 164) && hues[1].every(h => h >= 236 && h <= 264), hues.map(h => `${Math.min(...h)}–${Math.max(...h)}`).join(' · '));
await fits(p, 'the short form'); await shot(p, 'kf-1-short');

// held: the keys shuffle; let go early, they are back; held its full time, they land and the campaign is made from the name alone
await p.fill('#k-name', 'MOCHI'); const go = p.locator('#k-go'); await go.scrollIntoViewIfNeeded(); const bx = await go.boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
await p.mouse.down(); await p.waitForTimeout(250); const mid = await keyLines(p); await p.mouse.up(); await p.waitForTimeout(150); const back = await keyLines(p);
check('held, the keys shuffle, in their colours', mid.length === 2 && mid[0].text !== scPk && mid[1].text !== clinicPk && /^[0-9a-f]{66}$/.test(mid[0].text) && mid[0].role === 'streetcat' && mid[1].role === 'clinic', `${mid[0].text.slice(0, 12)}… · ${mid[1].text.slice(0, 12)}…`);
check('…let go early, they are back at once, and nothing is made', back[0].text === scPk && back[1].text === clinicPk && !(await txt(p, '#k-out')));
await p.waitForTimeout(1700); await p.mouse.down(); await p.waitForTimeout(1350); const landed = await keyLines(p); await p.mouse.up();
check('…held its full time, they have landed as it fills', landed[0].text === scPk && landed[1].text === clinicPk, `${landed[0].text.slice(0, 12)}…`);
const made = await waitText(p, '#k-out', /is ready|cannot|Failed/, 30000), c1 = await p.evaluate(() => JSON.parse(localStorage.getItem('vetlock.campaigns')).pop().c);
check('a campaign made from the name alone: sterilisation, Minibits, this clinic, refunds after 30 days, signed with Streetcat\'s key', /Campaign MOCHI is ready/.test(made) && c1.name === 'MOCHI' && c1.op === 'sterilisation' && c1.mint === MB && c1.clinic === clinicPk && c1.streetcat === scPk && c1.deadline === Math.floor(new Date(in30 + 'T23:59:59Z').getTime() / 1000) && await p.evaluate(c => window.scCore.campaignSig(c), c1) === 'signed', `${c1.name} · ${c1.op} · ${c1.mint} · ${String(c1.clinic).slice(0, 10)}… · ${new Date(c1.deadline * 1000).toISOString().slice(0, 10)}`);

// the next one starts from it; "edit" opens every field with those values; a clinic changed there shows at once, in blue, or red if not a key
await p.locator('#k-out button', { hasText: 'another campaign' }).click(); await p.waitForTimeout(300);
check('the next campaign starts from the one before, short again', JSON.stringify(await visible(p)) === '["k-name","k-dl"]' && !(await p.inputValue('#k-name')) && (await keyLines(p))[1].text === clinicPk);
await p.click('#k-more summary'); const vals = await p.evaluate(() => ['k-op', 'k-c', 'k-dl', 'k-mint', 'k-to'].map(id => document.getElementById(id).value));
check('the fold opens every field, with those values', (await visible(p)).join(' ') === 'k-name k-dl k-op k-c k-mint k-to' && JSON.stringify(vals) === JSON.stringify(['sterilisation', clinicPk, in30, MB, '']), vals.join(' | '));
const other = '03' + 'ab'.repeat(32); await p.fill('#k-c', other); const k2 = await keyLines(p);
await p.fill('#k-c', '03abc'); const k3 = await keyLines(p); await fits(p, 'the form with every field'); await shot(p, 'kf-2-edit');
check('…a clinic key changed there shows at once, in blue; not a key yet, in red', k2[1].text === other && k2[1].role === 'clinic' && k3[1].bad && /not a public key/.test(k3[1].text), `${k2[1].text.slice(0, 10)}… ${k2[1].role} · ${k3[1].text}`);

// no clinic to give: the fields are open; a browser without Streetcat's key says so in red, and cannot make the link
const q = await page(); await tab(q, 'release'); await q.click('#s-new'); await q.waitForTimeout(1000); await q.reload(); await tab(q, 'campaign');
const qk = await keyLines(q); check('with no partner to give, the fold is open, and the partner line asks to choose it', (await visible(q)).includes('k-c') && await q.$eval('#k-more', d => d.open) && qk[1].text === 'choose the partner above' && !qk[1].bad, qk[1].text);
const n = await page(); await tab(n, 'campaign'); const nk = await txt(n, '#k-keys');
check('a browser without Streetcat\'s key says so in red, before anything', /^✗ This browser does not hold Streetcat's key \(0[23][0-9a-f]{8}…\): import it in Keys\.$/.test(nk) && await n.$eval('#k-keys', e => e.classList.contains('bad')), nk);
await n.fill('#k-name', 'TEO'); await n.fill('#k-c', clinicPk); await n.evaluate(() => { const b = document.getElementById('k-go'); b._holdOk = true; b.click(); b._holdOk = false; });  /* an ordinary click past the hold */
const nout = await waitText(n, '#k-out', /cannot sign|ready/, 15000);
check('…and cannot make the link, in red', /cannot sign the donation link/.test(nout) && await n.$eval('#k-out', e => e.classList.contains('bad')), nout.slice(0, 90));
await fits(n, 'no Streetcat key');

check('every screen fits the phone at 320, 375, 390 and 430 px', FIT.length === 0, FIT.join(' | ') || '4 screens');
await b.close(); await relay.close(); say(bad ? `kform: ${bad} check(s) failed` : 'kform: every check passed'); process.exit(bad ? 1 : 0);
