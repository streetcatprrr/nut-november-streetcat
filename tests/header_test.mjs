// The header and the clinic's home. The header is the three roles, the one on screen marked, and the status
// page apart. A first visit opens on Donate and says what the page is; a role in the header switches to it, the role on screen goes back to
// its first screen, and the role is kept for the next visit; a campaign link always opens Donate; an address of one role shows only that
// role. The status page has the same header, and a role there opens the app as that role. The clinic's home is six buttons of one size,
// two by three, that fit an iPhone 14-16 screen with three requests listed; the offline one keeps its red "not ready" state.
import fs from 'fs';
import { chromium } from 'playwright';
import { pinBrowser, pin } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338';
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, say = (...a) => console.log(...a), now = () => Math.floor(Date.now() / 1000), today = new Date().toISOString().slice(0, 10);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey()), b64u = s => Buffer.from(s).toString('base64url');
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (ok || !more ? '' : ' · ' + more)); };

// a campaign, and three requests from Streetcat to the clinic, each on a donation locked to the campaign
const scSk = newSk(), clSk = newSk(), scPk = C.pubOf(scSk), clPk = C.pubOf(clSk); await pin(scPk);
const camp = await C.signCampaign({ name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: scPk, clinic: clPk, deadline: now() + 30 * 86400 }, scSk);
const w = new cashu.Wallet(MINT); await w.loadMint();
const lockOne = async n => { const q0 = await w.createMintQuoteBolt11(n); let plain = null; for (let i = 0; i < 40 && !plain; i++) { try { plain = await w.mintProofsBolt11(n, q0); } catch { await new Promise(r => setTimeout(r, 300)); } }
  const lock = new cashu.LockBuilder().addMainPubkey([scPk, clPk]).requireMainSignatures(2).addRefundPubkey(C.pubOf(newSk())).lockUntil(Number(camp.deadline));
  return w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: plain })).asLocked(lock).run(); };
const reqs = []; for (const [cat, n] of [['MOCHI', 210], ['LUNA', 150], ['TOFU', 90]]) reqs.push(await C.makeRequest({ campaign: camp, patient: cat, procedure: 'sterilisation (spay)', date: today, contributions: [{ proofs: await lockOne(n) }] }));

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const open = async (url, store = {}) => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await c.addInitScript(s => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); localStorage.setItem('vetlock.relays', '[]'); } catch (_) {} }, store);
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('PAGEERROR', e.message); });
  await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(url); await p.waitForTimeout(1200); return p; };
const head = p => p.evaluate(() => ({ role: document.body.dataset.role, on: [...document.querySelectorAll('#hd-roles button.on')].map(b => b.dataset.r), shown: [...document.querySelectorAll('#hd-roles button')].filter(b => b.offsetParent).map(b => b.dataset.r), back: !document.getElementById('hd-back').hidden, screen: document.querySelector('section.on')?.id, status: !!document.getElementById('hd-status')?.offsetParent }));
const J = JSON.stringify;

// a first visit: Donate, saying what the page is; the three roles and Status in the header
const A = await open(BASE + 'index.html');
let h = await head(A); check('a first visit opens on Donate', h.role === 'donor' && h.screen === 'donate', J(h));
check('the header shows Donor, Rescue, Partner and Status, Donor marked', h.shown.join() === 'donor,streetcat,clinic' && h.on.join() === 'donor' && h.status && (await A.evaluate(() => [...document.querySelectorAll('#hd-roles button')].map(b => b.dataset.label || b.textContent).join())) === 'Donor,Rescue,Partner', J(h));
check('Status is the magnifier icon, named "Status" for screen readers', await A.evaluate(() => { const a = document.getElementById('hd-status'); return a.getAttribute('aria-label') === 'Status' && !!a.querySelector('svg') && !a.textContent.trim(); }));
check('…the header fits in one line', await A.evaluate(() => document.querySelector('.sc-header').getBoundingClientRect().height <= 60 && document.scrollingElement.scrollWidth <= innerWidth));
check('no "Who are you?" screen, and no block of text on Donate', await A.evaluate(() => !document.getElementById('who') && !/Who are you|Donations in ecash that nobody/.test(document.body.innerText)));
await A.click('#hd-roles button[data-r="clinic"]'); h = await head(A); check('Clinic in the header opens the clinic\'s home, marked', h.role === 'clinic' && h.screen === 'work' && h.on.join() === 'clinic', J(h));
await A.click('#hd-roles button[data-r="streetcat"]'); h = await head(A); check('Streetcat in the header opens Streetcat\'s home', h.role === 'streetcat' && h.screen === 'home', J(h));
await A.evaluate(() => window.__vetlock.openTab('cats')); h = await head(A);
check('the back arrow is a framed button, 36 px square', await A.evaluate(() => { const r = document.getElementById('hd-back').getBoundingClientRect(), cs = getComputedStyle(document.getElementById('hd-back')); return Math.round(r.width) === 36 && Math.round(r.height) === 36 && cs.borderTopWidth === '1px'; }));
check('an inner screen has the back arrow, and the header still fits', h.back && h.screen === 'cats' && await A.evaluate(() => document.querySelector('.sc-header').getBoundingClientRect().height <= 60), J(h));
await A.click('#hd-roles button[data-r="streetcat"]'); h = await head(A); check('the role on screen, tapped again, goes back to its first screen', h.screen === 'home' && !h.back, J(h));
check('the role is kept for the next visit', await A.evaluate(() => localStorage.getItem('vetlock.role')) === 'streetcat');
await A.reload(); await A.waitForTimeout(1000); h = await head(A); check('…and the next visit opens in it', h.role === 'streetcat' && h.screen === 'home', J(h));

// a campaign link opens Donate, whatever role was kept
const D = await open(BASE + 'index.html#c=' + b64u(J(camp)), { 'vetlock.role': 'clinic' }); await D.waitForFunction(() => /MOCHI/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
h = await head(D); check('a campaign link opens Donate, after another role', h.role === 'donor' && h.screen === 'donate' && h.on.join() === 'donor', J(h));

// an address of one role: only that role, no switching
for (const r of ['clinic', 'streetcat', 'donor']) { const F = await open(BASE + 'index.html?role=' + r); h = await head(F);
  check(`an address of one role (${r}) shows only that role, and Status`, h.shown.join() === r && h.role === r && h.status, J(h)); await F.context().close(); }

// the clinic's home with three requests: six buttons of one size, two by three, all on the screen
const K = await open(BASE + 'index.html', { 'vetlock.role': 'clinic', 'vetlock.clinic.sk': clSk });
for (const q of reqs.slice(0, 2)) { await K.evaluate(t => window.__vetlock.openPayload(t, 'relay'), await C.pack(q)); await K.waitForSelector('#creq.on'); }
await K.evaluate(() => window.__vetlock.openTab('work')); await K.waitForSelector('#work.on'); await K.waitForTimeout(400);
const g0 = await K.evaluate(() => ({ hidden: document.getElementById('w-list').hidden, items: [...document.querySelectorAll('#w-list .item')].filter(x => x.offsetParent).length, pend: document.getElementById('w-n').textContent, done: document.getElementById('w-done').textContent, labels: [...document.querySelectorAll('#work .wtabs span')].map(x => x.textContent) }));
check('entering Partner: no requests shown, only the two numbers (pending, done) and the buttons', g0.hidden && g0.items === 0 && g0.pend === '2' && g0.done === '0' && J(g0.labels) === J(['pending', 'done']), J(g0));
await showW(K, 'w-pend'); await K.waitForFunction(() => /offline/.test(document.getElementById('w-offline').title) && document.querySelectorAll('#w-list .item').length === 2, null, { timeout: 10000 }).catch(() => {}); await K.waitForTimeout(800);
/* measured with the line of its check of the relays there, as a phone shows it: the relays here cannot be reached, and how long that takes to
   say varies (0.6 to 5 s each; five relays since 8 Nov), so the line is waited for rather than a fixed time */
await K.waitForFunction(() => document.getElementById('w-net').textContent.trim().length > 0, null, { timeout: 30000 }).catch(() => {});
const g = await K.evaluate(() => { const bs = [...document.querySelectorAll('#work .actions button')], r = bs.map(x => x.getBoundingClientRect());
  return { ids: bs.map(x => x.id), sizes: [...new Set(r.map(x => Math.round(x.width) + 'x' + Math.round(x.height)))], cols: new Set(r.map(x => Math.round(x.left))).size, bottom: Math.round(Math.max(...r.map(x => x.bottom)) + scrollY), page: document.scrollingElement.scrollHeight, view: innerHeight, links: document.querySelectorAll('#work p.lnk a').length,
    off: document.getElementById('w-offline').textContent, offTitle: document.getElementById('w-offline').title, offRed: getComputedStyle(document.getElementById('w-offline')).color === getComputedStyle(document.documentElement).getPropertyValue('--bad').trim().replace(/^#(..)(..)(..)$/, (_, a, b, c) => `rgb(${parseInt(a, 16)}, ${parseInt(b, 16)}, ${parseInt(c, 16)})`) }; });
check('the clinic\'s home is five buttons of one size, full width, one under another (no "Certify a token": review of 12 Nov)', J(g.ids) === J(['w-check', 'w-open', 'w-offline', 'w-cats', 'w-settings']) && g.sizes.length === 1 && g.cols === 1 && /^350x56$/.test(g.sizes[0]) && g.links === 0, J(g));
check('with two requests listed it all fits an iPhone 14-16 screen (390 x 844)', g.page <= g.view && g.bottom <= g.view, J(g));
await K.evaluate(t => window.__vetlock.openPayload(t, 'relay'), await C.pack(reqs[2])); await K.waitForSelector('#creq.on'); await K.evaluate(() => window.__vetlock.openTab('work')); await K.waitForTimeout(600); await showW(K, 'w-pend');
const g3 = await K.evaluate(() => ({ items: document.querySelectorAll('#w-list .item').length, over: document.scrollingElement.scrollHeight - innerHeight }));
check('with a third request it fits, or scrolls only a little (the list comes first)', g3.items === 3 && g3.over < 60, J(g3));
// the two numbers: a tap shows that one's requests typed in, a tap again hides them; done shows the done ones; entering Partner hides them
const wState = () => K.evaluate(() => ({ hidden: document.getElementById('w-list').hidden, pend: document.getElementById('w-pend').classList.contains('on'), done: document.getElementById('w-dn').classList.contains('on'), items: document.querySelectorAll('#w-list .item').length, typing: document.querySelectorAll('#w-list [style*="max-height"]').length }));
if ((await wState()).pend) await K.click('#w-pend');  /* from none shown */
await K.click('#w-pend'); const t1 = await wState(); await K.waitForTimeout(150); await K.click('#w-pend'); const t2 = await wState();
await K.click('#w-pend'); const t3 = await wState(); await K.click('#w-dn'); const t4 = await wState();
check('a tap on "pending" shows its requests, typed in (as the donor\'s list); a tap again hides them', !t1.hidden && t1.pend && t1.items === 3 && t1.typing > 0 && t2.hidden && !t2.pend && t2.items === 0, J({ t1, t2 }));
check('…a tap on "done" shows the done ones instead (none here), "pending" no longer marked', !t3.hidden && t3.pend && !t4.hidden && t4.done && !t4.pend && t4.items === 0, J({ t3, t4 }));
await K.click('#w-pend'); await K.click('#hd-roles button[data-r="clinic"]'); await K.waitForTimeout(400); const t5 = await wState();
check('…and entering Partner again (its tab in the header) starts with none shown', t5.hidden && !t5.pend && !t5.done, J(t5));
check('the offline button, right after Open a request, says "Offline setup", in red while the phone is not ready', g.off === 'Offline setup' && g.offRed && /^not ready for offline: \d+ to fix$/.test(g.offTitle), J(g));
for (const [id, t] of [['w-cats', 'cats'], ['w-settings', 'csettings'], ['w-offline', 'coffline'], ['w-check', 'work']]) {
  await K.evaluate(() => window.__vetlock.openTab('work')); await K.click('#' + id); await K.waitForTimeout(300); check(`${id} opens ${t}`, (await head(K)).screen === t); }
await K.evaluate(() => window.__vetlock.openTab('work')); await K.click('#w-open'); check('Open a request shows the box for a request', await K.isVisible('#w-paste'));
// the phone's own back (history) goes back one screen inside the app; the header arrow does the same
await K.click('#w-offline'); await K.waitForTimeout(300); const u0 = K.url(); await K.goBack({ waitUntil: 'commit' }).catch(() => {}); await K.waitForTimeout(600);
check('the phone\'s back from Offline setup goes back to the clinic\'s home, inside the app', (await head(K)).screen === 'work' && K.url() === u0, K.url());
await K.click('#w-settings'); await K.waitForTimeout(300); await K.click('#hd-back'); await K.waitForTimeout(600); check('the header arrow from Settings goes back to the clinic\'s home', (await head(K)).screen === 'work');
await K.click('#w-cats'); await K.waitForTimeout(300); await K.goBack({ waitUntil: 'commit' }).catch(() => {}); await K.waitForTimeout(600); check('…and the phone\'s back after it too, still in the app', (await head(K)).screen === 'work' && K.url() === u0, K.url());

// the status page: the same header, Status marked; a role there opens the app as that role
const S = await open(BASE + 'status.html');
const sh = await S.evaluate(() => ({ icon: !!document.querySelector('.sc-st.on svg'), roles: [...document.querySelectorAll('.sc-roles a')].map(a => a.dataset.r + '>' + a.getAttribute('href')), names: [...document.querySelectorAll('.sc-roles a')].map(a => a.textContent).join(), on: document.querySelector('.sc-st.on')?.getAttribute('aria-label'), fits: document.querySelector('.sc-header').getBoundingClientRect().height <= 60 }));
check('the status page has the same header (Donor, Rescue, Clinic), Status marked', J(sh.roles) === J(['donor>index.html', 'streetcat>index.html', 'clinic>index.html']) && sh.names === 'Donor,Rescue,Clinic' && sh.on === 'Status' && sh.icon && sh.fits, J(sh));
await Promise.all([S.waitForNavigation(), S.click('.sc-roles a[data-r="clinic"]')]); await S.waitForTimeout(1000); h = await head(S);
check('Clinic on the status page opens the app as the clinic', h.role === 'clinic' && h.screen === 'work', J(h));

await b.close(); say(bad ? `header: ${bad} check(s) failed` : 'header: every check passed'); process.exit(bad ? 1 : 0);

// the partner's home shows its requests only once one of its two numbers is tapped (9 Nov): show that one (if not shown) and wait for it typed in
async function showW(p, id){ await p.evaluate(id => { const b = document.getElementById(id); if (b && !b.classList.contains('on')) b.click(); }, id); await p.waitForFunction(() => !document.querySelector('#w-list [style*="max-height"]'), null, { timeout: 15000 }).catch(() => {}); }
