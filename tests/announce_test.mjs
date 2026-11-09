// "Check for requests" (StreetCat, 7 Nov: «un botón … comprobar si hay request de la asociación», the fourth big button; the campaigns «en el
// formato del texto ese de arriba … en colorines … seleccionables con el dedo»), against the local mint and two local test relays (made-up
// keys, fake money). Each campaign Streetcat makes is announced on the relays as it is made, and says so. A donor's phone with no link asks
// the relays and lists the open campaigns where the campaign shows, each in its own colour, the newest on top and the earlier ones in a
// box under it, newest first (9 Nov: each announcement says when its campaign was made); a tap
// opens it as its link would, signed. What is not Streetcat's to announce is never listed: an announcement whose campaign was changed after
// it was signed, a closed campaign, a campaign of a key that is not Streetcat's published one. No relay reached: said in red; nothing open:
// said so, not in red. A campaign made with no relay to take it says so in red, and Home announces it again by itself, with no tap, as it
// does one from before the announcements (StreetCat, 7 Nov: «Esa y todas las campañas»). Fits 320 to 430 px.
import { chromium } from 'playwright';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1600); await p.screenshot({ path: `${SHOT}/${name}.png` }); } };
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const PORTS = [7281, 7282]; let relays = PORTS.map(port => startRelay({ port })); await Promise.all(relays.map(r => r.ready));
const RELAYS = relays.map(r => r.url).join(','), EMPTY = startRelay({ port: 7283 }); await EMPTY.ready;
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async (rl = RELAYS) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, rl);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); return p; };
const clinic = await page(), sc = await page(), donor = await page();
for (const p of [clinic, sc, donor]) await p.goto(BASE + 'index.html');
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(200); } return x; };
const day = n => new Date(Date.now() + 86400000 * n).toISOString().slice(0, 10);
const FIT = [], FITBAD = []; const fits = async (p, label) => { const vs = p.viewportSize(), over = []; for (const wd of [320, 375, 390, 430]) { await p.setViewportSize({ width: wd, height: 740 }); await p.waitForTimeout(80); const o = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${wd}px +${o}`); }
  await p.setViewportSize(vs); FIT.push(label); if (over.length) FITBAD.push(`${label}: ${over.join(', ')}`); };
const ANN = /✓ Announced to donors: 2 of 2 relays have it\. "Check for requests" lists it until its deadline\.|✗ Not announced to donors: [^\n]*?Announce it again from Home\./;
let clinicPk = '';
const make = async (name, op, days, first) => { await tab(sc, 'campaign'); if (!first) await sc.locator('#k-out button', { hasText: 'another campaign' }).click();
  await sc.fill('#k-name', name); await sc.fill('#k-op', op); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk); await sc.fill('#k-dl', day(days)); await sc.click('#k-go');
  await waitText(sc, '#k-out', /is ready|cannot|pick another/, 30000); const t = await waitText(sc, '#k-out', ANN, 30000); return { line: (t.match(ANN) || [''])[0], red: await sc.$$eval('#k-out .bad', es => es.some(e => /Not announced/.test(e.textContent))) }; };
const lines = () => donor.$$eval('#d-reqs button.req', bs => bs.map(b => ({ name: b.querySelector('.title').textContent, sub: b.querySelector('.sub2').textContent, h: b.style.getPropertyValue('--h'), color: getComputedStyle(b.querySelector('.title')).color })));
const checkReqs = async n => { await donor.click('#d-check'); await donor.waitForFunction(n => document.querySelectorAll('#d-reqs button.req').length === n || /✗|No open/.test(document.getElementById('d-reqs').textContent), n, { timeout: 30000 }).catch(() => {}); await donor.waitForTimeout(4500); };  /* the lines type in */

// keys, then two campaigns: each is announced as it is made
await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(1200); clinicPk = await txt(clinic, '#cs-pk');
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(1200); await sc.reload();
const A = await make('TNR MARINA', 'sterilisation', 30, true); await shot(sc, 'an-1-streetcat-announced');
check('a new campaign is announced to donors as it is made, and says so', /^✓ Announced to donors: 2 of 2 relays have it\./.test(A.line) && !A.red, A.line);
const B = await make('THE OLD PORT', 'sterilisation and vaccines', 9); check('…a second one too', /^✓ Announced/.test(B.line), B.line);
const hues = await sc.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('vetlock.campaigns')).map(k => [k.c.name, k.c.hue])));

// what is not Streetcat's to announce, put on the same relays: a changed campaign, a closed one, one of a key that is not the published one
const forged = await sc.evaluate(async () => { const V = window.__vetlock, C = window.scCore, R = window.scRelay, sk = V.key('streetcat', false), relays = localStorage.getItem('vetlock.relays').split(',');
  const camps = JSON.parse(localStorage.getItem('vetlock.campaigns')), c0 = camps.find(k => k.c.name === 'THE OLD PORT').c, out = [];
  const changed = { ...c0, name: 'THE OLD PORT 2' }; out.push((await R.publish(await R.announceEvent(changed, sk), relays)).filter(x => x.ok).length);  /* its signature no longer holds */
  const closed = await C.signCampaign({ ...C.campaignOf(c0), name: 'LAST YEAR', hue: c0.hue, deadline: Math.floor(Date.now() / 1000) - 3600 }, sk); out.push((await R.publish(await R.announceEvent(closed, sk), relays)).filter(x => x.ok).length);
  const osk = Array.from(cashu.createRandomSecretKey(), x => x.toString(16).padStart(2, '0')).join(''), opk = V.pubOf(osk);
  const other = await C.signCampaign({ ...C.campaignOf(c0), name: 'NOT STREETCAT', streetcat: opk, deadline: c0.deadline }, osk); out.push((await R.publish(await R.announceEvent(other, osk), relays)).filter(x => x.ok).length);
  return out; });
check('three announcements that must not be listed are on the relays too (changed, closed, another key)', forged.every(n => n === 2), forged.join(' · '));
// the states a request may show donors (review of 8 Nov, point 5): never 'paid' (the sats go to Streetcat's reserve, not to the partner);
// an announcement of before that says 'paid' is read as 'released'
const states = await sc.evaluate(async () => { const V = window.__vetlock, C = window.scCore, R = window.scRelay, sk = V.key('streetcat', false), c0 = JSON.parse(localStorage.getItem('vetlock.campaigns')).find(k => k.c.name === 'THE OLD PORT').c;
  const ev = await R.announceEvent(c0, sk, { cats: [{ name: 'A', procedure: 'spay', state: 'released' }, { name: 'B', procedure: 'spay', state: 'paid' }, { name: 'C', procedure: 'spay', state: 'done' }, { name: 'D', procedure: 'spay', state: 'nonsense' }] });
  const ok = await R.announcedOk(ev); return { tags: ev.tags.filter(t => t[0] === 'cat').map(t => t[3]), read: ok ? ok.cats.map(x => x.state) : null }; });
check('an announcement names a request released as "released", never "paid"; an older "paid" is read as "released"; anything else as "requested"', states.tags.join() === 'released,released,done,requested' && states.read && states.read.join() === 'released,released,done,requested', JSON.stringify(states));

// the donor, with no link: the fourth big button
await donor.reload(); const four = await donor.$$eval('#donate .pay button.go.big, #d-links button.go', bs => bs.map(b => b.textContent.trim()));
check('the donor\'s screen has a fourth big button, "Check for requests", under the other three', four.join(' | ') === 'Pay with Lightning | Pay with ecash | Take my sats back | Check for requests', four.join(' | '));
await shot(donor, 'an-2-donor-four');
await checkReqs(2); const L = await lines(), head = await txt(donor, '#d-reqs > .mut');
const inBox = await donor.$$eval('#d-reqs .rold button.req .title', ts => ts.map(t => t.textContent));
check('a tap lists the open campaigns where the campaign shows: the latest on top (THE OLD PORT, made after TNR MARINA), the earlier one in the box under it', L.map(x => x.name).join(' · ') === 'THE OLD PORT · TNR MARINA' && inBox.join() === 'TNR MARINA' && head === 'Latest request from Streetcat · tap it', `${head} | ${L.map(x => `${x.name} (${x.sub})`).join(' · ')} | in the box: ${inBox.join(' · ')}`);
check('…each in its own colour, the campaign\'s', L.length === 2 && L.every(x => Number(x.h) === Number(hues[x.name])) && L[0].color !== L[1].color, L.map(x => `${x.name} ${x.h} ${x.color}`).join(' · '));
check('…with what it is for and the days left', L.length === 2 && /^sterilisation and vaccines · (9|10) days left$/.test(L[0].sub) && /^sterilisation · (30|31) days left$/.test(L[1].sub), L.map(x => x.sub).join(' · '));
check('nothing that is not Streetcat\'s to announce is listed: changed, closed, another key', !L.some(x => /OLD PORT 2|LAST YEAR|NOT STREETCAT/.test(x.name)));
check('…and the campaign link field gives way to the list', await donor.isHidden('#d-paste'));
await fits(donor, 'the open requests'); await shot(donor, 'an-3-donor-requests');
await donor.locator('#d-reqs button.req', { hasText: 'TNR MARINA' }).click(); const opened = await waitText(donor, '#d-campinfo', /signed by Streetcat/, 15000);
check('a tap opens it as its link would: the campaign, signed by Streetcat, ready to pay', /^TNR MARINA/.test(opened) && /✓ signed by Streetcat/.test(opened) && await donor.isHidden('#d-reqs') && (await donor.evaluate(() => location.hash)).startsWith('#c=') && !(await donor.evaluate(() => document.getElementById('donate').classList.contains('sigbad'))), opened.replace(/\s+/g, ' ').slice(0, 90));
await fits(donor, 'a campaign opened from the list'); await shot(donor, 'an-4-donor-opened');

// nothing open: said so, not in red; no relay reached: said in red
const empty = await page(EMPTY.url); await empty.goto(BASE + 'index.html'); await empty.click('#d-check'); const none = await waitText(empty, '#d-reqs', /No open|✗/);
check('with nothing announced, it says so, and not in red', none === 'No open requests from Streetcat right now.' && !(await empty.$$eval('#d-reqs .bad', es => es.length)) && await empty.isVisible('#d-paste'), none);
for (const r of relays) await r.close(); await donor.click('#d-check'); const down = await waitText(donor, '#d-reqs', /✗|No open/, 30000);
check('with no relay reached, it says so in red', down === '✗ Could not reach the relays: check the connection and try again.' && await donor.$eval('#d-reqs .out', e => e.classList.contains('bad')), down);
await shot(donor, 'an-5-donor-no-relays');

// a campaign made with no relay: said in red; once there is one, Home announces it again by itself (no tap), and its line says so
const C3 = await make('BAKERY COLONY', 'sterilisation', 40); check('a campaign made with no relay to take it says so, in red', /^✗ Not announced to donors: /.test(C3.line) && C3.red, C3.line);
relays = PORTS.map(port => startRelay({ port })); await Promise.all(relays.map(r => r.ready));
const annOf = name => sc.waitForFunction(n => { const k = JSON.parse(localStorage.getItem('vetlock.campaigns') || '[]').find(x => x.c.name === n); return !!(k && k.ann && k.ann.ok === 2); }, name, { timeout: 30000 }).then(() => true, () => false);
await tab(sc, 'home'); const auto = await annOf('BAKERY COLONY');
await sc.click('#h-kinds button.tile'); await sc.locator('#kd-pots button.req', { hasText: 'BAKERY COLONY' }).click(); const said = await waitText(sc, '#kd-pots', /announced to donors · \d of \d relays|announce to donors/, 20000);
const annNow = await sc.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('vetlock.campaigns')).map(k => [k.c.name, k.ann || null])));
check('Home announces it again by itself, with no tap, and its line says so', auto && /announced to donors · 2 of 2 relays/.test(said), (said.match(/announced to donors · \d of \d relays|announce to donors/) || [''])[0] + (auto ? '' : ' · ' + annNow));
await checkReqs(1); const L2 = await lines(); check('…and donors see it (the two announced less than a day ago are not sent again)', L2.length === 1 && L2[0].name === 'BAKERY COLONY', L2.map(x => x.name).join(' · '));
// one from before the announcements, never announced: Home announces it too, by itself
await sc.evaluate(() => { const a = JSON.parse(localStorage.getItem('vetlock.campaigns')); for (const k of a) if (k.c.name === 'TNR MARINA') delete k.ann; localStorage.setItem('vetlock.campaigns', JSON.stringify(a)); });
await tab(sc, 'campaign'); await tab(sc, 'home'); const old = await annOf('TNR MARINA');
await checkReqs(2); const L3 = await lines(); check('a campaign from before the announcements is announced by itself too when Home opens, and donors see it, newest first (BAKERY COLONY on top: made later, though it closes later too)', old && L3.map(x => x.name).join(' · ') === 'BAKERY COLONY · TNR MARINA', L3.map(x => x.name).join(' · '));

// relays slow to confirm (StreetCat, 8 Nov, 18:00: «Segunda vez que me pasa esto. Creo campaña y no funciona»): the campaign was on nostr.mom,
// which confirmed half a minute late, and nos.lol never answered; the app said "Not announced". Here one relay keeps the announcement
// 10 s after it is sent and the other never answers: the line says it is still asking (not in red), then that one relay has it, and
// names in red the one that never answered
const LATE = startRelay({ port: 7284, storeDelay: 10000 }), MUTE = startRelay({ port: 7285, mute: true }); await Promise.all([LATE.ready, MUTE.ready]);
await sc.evaluate(u => localStorage.setItem('vetlock.relays', u), [LATE.url, MUTE.url].join(','));
await tab(sc, 'campaign'); await sc.locator('#k-out button', { hasText: 'another campaign' }).click();
await sc.fill('#k-name', 'TNR CALLE'); await sc.fill('#k-op', 'sterilisation'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk); await sc.fill('#k-dl', day(30)); await sc.click('#k-go');
await waitText(sc, '#k-out', /is ready/, 30000); const redK = re => sc.$$eval('#k-out .bad', (es, s) => es.some(e => new RegExp(s).test(e.textContent)), re.source);
const ask = await waitText(sc, '#k-out', /· announcing it to donors: no relay has confirmed it yet/, 15000); await shot(sc, 'an-6-streetcat-announcing-late');
check('a relay that confirms late: the campaign is not said "Not announced"; the line says the relays are asked again, not in red', /· announcing it to donors: no relay has confirmed it yet, they are asked again in a moment…/.test(ask) && !/Not announced/.test(ask) && !(await redK(/announcing/)), (ask.match(/· announcing[^\n]*/) || [''])[0]);
const got = await waitText(sc, '#k-out', /✓ Announced to donors: 1 of 2 relays have it\./, 30000);
check('…asked again, the late relay has it: "Announced to donors: 1 of 2", and the other is said to be still asked', /✓ Announced to donors: 1 of 2 relays have it\. "Check for requests" lists it until its deadline\.\n· 127\.0\.0\.1:7285: not confirmed yet, asked again in a moment/.test(got), (got.match(/✓ Announced[^\n]*\n?[^\n]*/) || [''])[0]);
const end = await waitText(sc, '#k-out', /✗ 127\.0\.0\.1:7285: no answer/, 40000); await shot(sc, 'an-7-streetcat-announced-late');
check('…and the relay that never answers is named in red, with why; the campaign stays announced', /✓ Announced to donors: 1 of 2 relays have it\./.test(end) && await redK(/^✗ 127\.0\.0\.1:7285: no answer$/) && !/Not announced/.test(end), (end.match(/✗ 127[^\n]*/) || [''])[0]);
const annLate = await sc.evaluate(() => (JSON.parse(localStorage.getItem('vetlock.campaigns')).find(k => k.c.name === 'TNR CALLE') || {}).ann || null);
check('…and Home keeps it as announced (1 of 2), so its own pass does not send it again', annLate && annLate.ok === 1 && annLate.n === 2, JSON.stringify(annLate));
const lateDonor = await page(LATE.url); await lateDonor.goto(BASE + 'index.html'); await lateDonor.click('#d-check'); await lateDonor.waitForFunction(() => document.querySelectorAll('#d-reqs button.req').length > 0 || /✗|No open/.test(document.getElementById('d-reqs').textContent), null, { timeout: 30000 }).catch(() => {}); await lateDonor.waitForTimeout(4500);  /* the lines type in */
const seenLate = await lateDonor.$$eval('#d-reqs button.req .title', ts => ts.map(t => t.textContent)); check('…donors reading that relay see it', seenLate.includes('TNR CALLE'), seenLate.join(' · '));
await sc.evaluate(u => localStorage.setItem('vetlock.relays', u), RELAYS);

check('every screen fits the phone at 320, 375, 390 and 430 px', FITBAD.length === 0, FITBAD.join(' | ') || `${FIT.length} screens`);
await b.close(); for (const r of [...relays, EMPTY, LATE, MUTE]) if (r.close) await r.close(); say(bad ? `announce: ${bad} check(s) failed` : 'announce: every check passed'); process.exit(bad ? 1 : 0);
