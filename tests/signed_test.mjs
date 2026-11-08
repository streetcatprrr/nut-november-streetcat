// Campaigns signed by Streetcat (app/index.html in Chromium, local Nutshell mint with fake money). A new campaign's link carries a
// BIP-340 signature made with Streetcat's key; the donor's page says it is signed and takes the donation. A link changed afterwards (the
// clinic key, the deadline) says its signature does not match and moves no money: no swap, no invoice. An unsigned link (as every link
// made before) still works, with a notice, and a warning when its mint is not Streetcat's. Streetcat's published key is pinned in
// app/index.js (STREETCAT_KEYS); this test pins its own Streetcat key next to it (pin.mjs, by hand). A link naming any other key, signed
// with that key or not signed, says in red that it is not from Streetcat's published key and moves no money; Streetcat's own page will
// not make one. Streetcat's Home signs a campaign made before, when the browser holds its key; a browser without the key cannot make a
// campaign for it. SHOT_DIR=dir saves what the donor sees for a signed, an unsigned, a broken and an unpublished-key link (390 px @2x).
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import fs from 'fs';
import crypto from 'crypto';
import { pinBrowser, pin, PUBLISHED } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', SHOT = process.env.SHOT_DIR, say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), { auto: false });  /* only the keys named with pin() */
const page = async (o = {}) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await c.addInitScript(() => { try { localStorage.setItem('vetlock.relays', 'ws://127.0.0.1:9'); } catch (_) {} });  /* no relay: nothing here needs one */
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  p._calls = []; p.on('request', r => { if (r.url().startsWith(MINT)) p._calls.push(new URL(r.url()).pathname); });  /* any call to the mint */ await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(150); } return s; };
const b64 = { dec: s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8')), enc: o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url') };
const campOf = link => b64.dec(link.split('#c=')[1]), linkWith = (link, c) => link.split('#c=')[0] + '#c=' + b64.enc(c);
const FIT = []; const fits = async (p, label) => { const vs = p.viewportSize(), over = []; for (const wd of [320, 375, 390, 430]) { await p.setViewportSize({ width: wd, height: 740 }); await p.waitForTimeout(60); const o = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${wd}px +${o}`); } await p.setViewportSize(vs); if (over.length) FIT.push(`${label}: ${over.join(', ')}`); };
const shot = async (p, name) => { if (SHOT) { await p.waitForTimeout(1500); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };

// Streetcat: keys and a campaign; its link is signed
const clinic = await page(); await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(900); const clinicPk = await txt(clinic, '#cs-pk');
const sc = await page(); await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(900);
const scPk = await sc.evaluate(() => window.__vetlock.pubOf(window.__vetlock.heldKeys('streetcat')[0])); await pin(scPk);  /* this test's Streetcat key, pinned next to the published one */
check('the app pins Streetcat\'s published key, and only it', JSON.stringify(PUBLISHED) === JSON.stringify(['0294637dacb6799343eacb4654700ad781694838b8b6db80551d17af001b194121']), PUBLISHED.join(', '));
const makeCampaign = async (p, name) => { await tab(p, 'campaign'); await p.reload(); await tab(p, 'campaign'); await p.fill('#k-name', name); await p.fill('#k-mint', MINT); await p.fill('#k-c', clinicPk);
  await p.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await p.click('#k-go'); const out = await waitText(p, '#k-out', /is ready|cannot|pick another|Failed|sign/); await p.waitForTimeout(900); return { out, link: ((await txt(p, '#k-out')).match(/http\S+#c=\S+/) || [''])[0] }; };
const { link } = await makeCampaign(sc, 'MOCHI'), camp = campOf(link);
check('a new campaign\'s link carries Streetcat\'s signature', /^[0-9a-f]{128}$/.test(camp.sig || '') && await sc.evaluate(c => window.scCore.campaignSig(c), camp) === 'signed');

// the donor: signed → donates; broken → nothing moves; unsigned → a notice (and the mint warning)
const donor = await page(), info = () => txt(donor, '#d-campinfo');
// the campaign types itself in, line by line: wait until its last line is in and nothing changes any more
const typed = async (p, sel = '#d-campinfo') => { let last = '', same = 0; for (let i = 0; i < 120 && same < 5; i++) { await p.waitForTimeout(150); const t = await txt(p, sel); same = t === last && /signed by|not signed|does not match|✗/.test(t) ? same + 1 : 0; last = t; } return last; };
const open = async l => { await donor.goto(l); await donor.reload(); return typed(donor); };
const greyed = () => donor.evaluate(() => ['d-ln', 'd-toecash', 'd-go'].every(id => { const cs = getComputedStyle(document.getElementById(id)); return Number(cs.opacity) < .5 && cs.pointerEvents === 'none'; }));  /* Lightning, the "Pay with ecash" link, and the button on that screen */
const viaWallet = async n => { donor._calls.length = 0; await donor.evaluate(() => { document.getElementById('dw-state').textContent = ''; window.__vetlock.openTab('decash'); }); const st = await waitText(donor, '#dw-state', /Failed|Not possible|waiting/, 10000);
  await donor.fill('#d-token', await plain(n)); await donor.evaluate(() => document.getElementById('d-go').click()); await donor.waitForTimeout(1500); await donor.evaluate(() => window.__vetlock.openTab('donate')); return st; };  /* the Cashu-wallet request on the ecash screen, then its paste box */
const outcome = async () => { for (let i = 0; i < 240; i++) { const t = await donor.evaluate(() => { const ok = document.getElementById('d-out').textContent, bad = document.getElementById('de-out').textContent;  /* textContent: the token sits in a closed fold */ return document.getElementById('donate').classList.contains('on') && /LOCKED/.test(ok) ? ok : /Failed|Not possible/.test(bad) ? bad : ''; }); if (t) return t; await donor.waitForTimeout(150); } return ''; };
const donate = async n => { await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(n)); await donor.evaluate(() => document.getElementById('d-go').click()); const r = await outcome(); await donor.evaluate(() => { if (!document.getElementById('donate').classList.contains('on')) window.__vetlock.openTab('donate'); }); return r; };  /* .click(): a broken link greys the button out; a refusal is said on the ecash screen, then back to Donate */
let s = await open(link); check('the donor sees that the link is signed by Streetcat', s.includes(`✓ signed by Streetcat ${scPk.slice(0, 10)}…`) && !/not signed|does not match/.test(s)); await fits(donor, 'signed'); await shot(donor, 'sg1-donor-signed');
let r = await donate(21); const rc = (await donor.evaluate(t => window.__vetlock.receiptOf(t), r.match(/cashuB[A-Za-z0-9_\-=]+/g).pop())).campaign;
check('…and the donation goes through, its receipt naming the signed campaign', /LOCKED 21 sat for MOCHI/.test(r) && rc.sig === camp.sig);
const thief = await page(); await tab(thief, 'csettings'); await thief.click('#cs-new'); await thief.waitForTimeout(700); const thiefPk = await thief.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));  /* from the store: on screen the key may still be typing itself out */
for (const [what, c] of [['the clinic key', { ...camp, clinic: thiefPk }], ['the deadline', { ...camp, deadline: camp.deadline + 86400 }]]) {
  s = await open(linkWith(link, c)); donor._calls.length = 0;
  check(`a link with ${what} changed says its signature does not match, and greys out all three ways to pay`, /✗ The signature on this link does not match/.test(s) && await donor.evaluate(() => document.getElementById('donate').classList.contains('sigbad')) && await greyed());
  if (what === 'the clinic key') { await fits(donor, 'broken'); await shot(donor, 'sg3-donor-broken'); }
  r = await donate(8); await donor.fill('#d-amt', '21'); await donor.evaluate(() => document.getElementById('d-ln').click()); await donor.waitForTimeout(1200); const ln = await txt(donor, '#d-out');
  const calls = donor._calls.length, wst = await viaWallet(4);
  check(`…and moves no money by any route (ecash, Lightning, a Cashu wallet): no call to the mint`, /^Failed: the signature on this link does not match/.test(r) && /does not match/.test(ln) && /does not match/.test(wst) && calls === 0 && donor._calls.length === 0, `${calls} + ${donor._calls.length} mint calls · wallet: ${wst.slice(0, 60)}`); }
s = await open(linkWith(link, { ...camp, extra: 'x' })); r = await donate(5); const rx = (await donor.evaluate(t => window.__vetlock.receiptOf(t), r.match(/cashuB[A-Za-z0-9_\-=]+/g).pop())).campaign;
check('a field the signature does not cover is dropped, not used', /signed by Streetcat/.test(s) && /LOCKED 5 sat/.test(r) && !('extra' in rx));
const { sig, ...unsigned } = camp; s = await open(linkWith(link, unsigned));
check('an unsigned link (as every link made before) opens with a plain notice', /This link is not signed\. Donate only if it came from Streetcat itself\./.test(s) && !/does not match/.test(s));
check('…and a warning, as its mint is not the one Streetcat uses', /⚠ It uses the mint 127\.0\.0\.1:\d+, not the one Streetcat uses \(mint\.minibits\.cash\/Bitcoin\)/.test(s)); await fits(donor, 'unsigned'); await shot(donor, 'sg2-donor-unsigned');
r = await donate(3); check('…and it still takes a donation', /LOCKED 3 sat/.test(r));
s = await open(linkWith(link, { ...unsigned, mint: 'https://mint.minibits.cash/Bitcoin' })); check('an unsigned link to Streetcat\'s mint gets no mint warning', /not signed/.test(s) && !/⚠ It uses the mint/.test(s));

// a key that is not Streetcat's published one: a valid signature by it says nothing, and an unsigned link naming it is no better
const otherSk = crypto.randomBytes(32).toString('hex'), otherPk = await sc.evaluate(k => window.__vetlock.pubOf(k), otherSk);
const fake = linkWith(link, await sc.evaluate(([c, k]) => window.scCore.signCampaign(c, k), [{ ...unsigned, streetcat: otherPk }, otherSk]));
check('(a link signed by another key carries a valid signature)', await sc.evaluate(c => window.scCore.campaignSig(c), campOf(fake)) === 'signed');
const NP = /✗ This link is not from Streetcat's published key\. Do not donate through it\./;
const red = () => donor.evaluate(() => { const e = [...document.querySelectorAll('#d-campinfo .sig')].find(x => /published key/.test(x.textContent)); if (!e) return false;
  const probe = document.body.appendChild(document.createElement('i')); probe.style.color = 'var(--bad)'; const want = getComputedStyle(probe).color; probe.remove(); return e.classList.contains('bad') && getComputedStyle(e).color === want; });  /* the app's own red */
for (const [what, l] of [['signed by a key that is not Streetcat\'s published one', fake], ['not signed, naming a key that is not Streetcat\'s published one', linkWith(link, { ...unsigned, streetcat: otherPk })]]) {
  s = await open(l); donor._calls.length = 0; const grey = await donor.evaluate(() => document.getElementById('donate').classList.contains('sigbad'));
  check(`a link ${what} says so in red, never "signed by Streetcat", and greys out all three ways to pay`, NP.test(s) && !/✓ signed by Streetcat/.test(s) && await red() && grey && await greyed(), s.split('\n').filter(x => /✗|✓/.test(x)).join(' / '));
  if (l === fake) { await fits(donor, 'not published'); await shot(donor, 'sg4-donor-not-published'); }
  r = await donate(2); await donor.fill('#d-amt', '21'); await donor.evaluate(() => document.getElementById('d-ln').click()); await donor.waitForTimeout(1200); const ln = await txt(donor, '#d-out');
  const calls = donor._calls.length, wst = await viaWallet(4);
  check('…and moves no money by any route (ecash, Lightning, a Cashu wallet): no call to the mint', /^Failed: This link is not from Streetcat's published key/.test(r) && /published key/.test(ln) && /published key/.test(wst) && calls === 0 && donor._calls.length === 0, `${calls} + ${donor._calls.length} mint calls · wallet: ${wst.slice(0, 60)}`); }
const other = await page(); await tab(other, 'release'); await other.click('#s-new'); await other.waitForTimeout(700); const made = await makeCampaign(other, 'MOCHI');
check('Streetcat\'s own page will not make a campaign with a key that is not the published one', /this browser's Streetcat key \(0[23][0-9a-f]{8}…\) is not Streetcat's published key \(0294637dac…\): donors' pages would refuse its link/.test(made.out) && !made.link, made.out.slice(0, 120));

// Home: a campaign made before links were signed gets signed here, since this browser holds its key; a browser without it cannot make one
await sc.evaluate(c => { const a = JSON.parse(localStorage.getItem('vetlock.campaigns')); a.push({ c, link: location.origin + '/index.html#c=' + btoa(JSON.stringify(c)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), slug: 'teo', created: 1 }); localStorage.setItem('vetlock.campaigns', JSON.stringify(a)); },
  { name: 'TEO', op: 'castration', mint: MINT, streetcat: scPk, clinic: clinicPk, deadline: camp.deadline });
await sc.reload(); await tab(sc, 'home'); await sc.waitForTimeout(800); await sc.click('#h-kinds button.tile'); await sc.locator('#kd-pots button.req', { hasText: 'TEO' }).click(); const cb = sc.locator('#kd-pots .row2 button', { hasText: 'copy signed link' });
await cb.click(); const old = campOf(await sc.evaluate(() => navigator.clipboard.readText()));
check('Home signs a campaign made before, as the same campaign', old.name === 'TEO' && old.clinic === clinicPk && old.deadline === camp.deadline && await sc.evaluate(c => window.scCore.campaignSig(c), old) === 'signed');
const nokey = await page(); await tab(nokey, 'release'); await nokey.click('#s-new'); await nokey.waitForTimeout(500); await tab(nokey, 'campaign'); await nokey.reload(); await tab(nokey, 'campaign');  /* its own Streetcat key is not the published one (pinned here, held only by sc): the form has no field for another */
await nokey.fill('#k-name', 'TEO'); await nokey.fill('#k-mint', MINT); await nokey.fill('#k-c', clinicPk); await nokey.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await nokey.click('#k-go');
check('a browser without the campaign\'s Streetcat key cannot make its link', /cannot sign the donation link/.test(await waitText(nokey, '#k-out', /sign|ready/)));
check('the donor\'s screens fit at 320, 375, 390 and 430 px', !FIT.length, FIT.join(' · '));

await b.close(); say(bad ? `signed: ${bad} check(s) failed` : 'signed: every check passed'); process.exit(bad ? 1 : 0);
