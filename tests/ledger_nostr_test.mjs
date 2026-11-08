// The ledger published by Nostr (app/index.html and app/status.html in Chromium, local Nutshell mint with fake money, two local test
// relays from nostr_relay.mjs; made-up keys only, nothing goes to a public relay). Streetcat's Home publishes the campaign's ledger v2 as
// one replaceable event (kind 30078, d = the campaign's id) signed with the ledger key derived from its Streetcat key; the status page
// opened with n=<id> fetches the newest one and counts every donation from the mint. Events under that id signed by any other key, or
// naming another campaign, are ignored, even when newer. Publishing again replaces the ledger. With no relay, l= the file is used.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import fs from 'fs';
import { startRelay, loadKit } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8')); const K = loadKit(); eval(fs.readFileSync(APP + 'relay.js', 'utf8'));
const C = globalThis.scCore, R = globalThis.scRelay, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.waitForTimeout(1600); await p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }); } };  /* SHOT_DIR=dir: 390 px @2x */
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
let relays = [startRelay({ port: 7231 }), startRelay({ port: 7232 })]; await Promise.all(relays.map(r => r.ready)); const URLS = relays.map(r => r.url);
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, URLS.join(','));
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(200); } return s; };

// a campaign, and donations that reach Streetcat by relay
const clinic = await page(); await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(900); const clinicPk = await txt(clinic, '#cs-pk');
const sc = await page(); await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(900); await tab(sc, 'campaign'); await sc.reload(); await tab(sc, 'campaign');
await sc.fill('#k-name', 'MOCHI'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk); await sc.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await sc.click('#k-go'); await waitText(sc, '#k-out', /is ready|cannot/); await sc.waitForTimeout(900);
const link = (await txt(sc, '#k-out')).match(/http\S+#c=\S+/)[0], camp = JSON.parse(Buffer.from(link.split('#c=')[1], 'base64url').toString()), id = await C.campaignId(camp);
const donor = await page(); const give = async n => { await donor.goto(link); await donor.reload(); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(n)); await donor.click('#d-go');
  await waitText(donor, '#d-out', /LOCKED|Failed/); await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000); };
const homeRow = async () => { await tab(sc, 'home'); await sc.waitForTimeout(400); await sc.click('#h-kinds button.tile'); if (!(await sc.$('#kd-pots .row2'))) await sc.click('#kd-pots button.req'); };  /* Home, the kind, the pot */
const receive = async () => { await homeRow(); await sc.locator('#kd-pots .row2 button', { hasText: 'donations and requests' }).click(); await sc.click('#sc-check'); await waitText(sc, '#sc-net', /checked/); };
const publish = async () => { await homeRow(); const pb = sc.locator('#kd-pots .row2 button', { hasText: 'publish ledger' }); await pb.click(); return waitText(sc, '#kd-pots .row2', /published · \d+ of \d+ relays(?![a-z])|no relay took it|not published|too large: copy it/); };  /* the label settles after its flap */
await give(21); await give(8); await receive();

// Home publishes the ledger; its status link finds it by the campaign's id
const pub = await publish(); await shot(sc, 'n1-home-published'); check('Home publishes the campaign\'s ledger to the relays', /published · 2 of 2 relays/.test(pub), (pub.match(/published · [^\n]*/) || [pub.slice(0, 40)])[0]);
const evs = relays[0].events.filter(e => e.kind === 30078 && !e.tags.some(t => t[0] === 't' && t[1] === 'streetcat-campaign')), ev = evs[0];
const ann = relays[0].events.filter(e => e.kind === 30078 && e.tags.some(t => t[0] === 't' && t[1] === 'streetcat-campaign'));
check('the campaign\'s announcement to donors (made with it) is an event of its own, under another d tag: it never replaces the ledger', ann.length === 1 && ann[0].tags.some(t => t[0] === 'd' && t[1] === 'announce:' + id) && ann[0].pubkey === (await C.derivedPub(C.TAG.ledger, camp.streetcat)).slice(2), ann.map(e => (e.tags.find(t => t[0] === 'd') || [])[1]).join(' · '));
check('…as one kind 30078 event under the campaign\'s id, signed with the key derived from Streetcat\'s', evs.length === 1 && ev.tags.some(t => t[0] === 'd' && t[1] === id) && ev.pubkey === (await C.derivedPub(C.TAG.ledger, camp.streetcat)).slice(2) && ev.pubkey !== camp.streetcat.slice(2));
check('…holding the ledger v2, with no key in it', JSON.parse(ev.content).v === 2 && !/refundKey|"sk"|privkey/.test(ev.content) && await R.ledgerOk(ev, id) !== null);
await homeRow(); const statusHref = await sc.$eval('#kd-pots .row2 a.sm', a => a.href);
check('the status link names the campaign\'s id', statusHref.includes('status.html?n=' + id), statusHref.replace(BASE, ''));
const viewer = await page(); const status = async (href = statusHref) => { await viewer.goto(href); await viewer.waitForFunction(() => /Checked|Failed/.test(document.getElementById('l-out').textContent), null, { timeout: 40000 }); await viewer.waitForTimeout(1200); return viewer.evaluate(() => document.body.innerText); };
let s = await status(); check('the status page fetches it from the relays and counts both donations at the mint', /29 sat locked · 2/.test(s.replace(/\s+/g, ' ')), (s.match(/ledger from Nostr[^\n]*/) || ['no Nostr note'])[0].slice(0, 90));
check('…and says where the ledger came from', /ledger from Nostr, signed with the campaign's ledger key/.test(s)); await shot(viewer, 'n2-status-from-nostr');

// someone else publishes under the same id, later: their events are ignored
const thief = newSk(), fake = { ...JSON.parse(ev.content), entries: [], donations: [] }, later = Math.floor(Date.now() / 1000) + 60;
const forged = [K.finalizeEvent({ kind: 30078, created_at: later, tags: [['d', id]], content: JSON.stringify(fake) }, cashu.hexToBytes ? cashu.hexToBytes(thief) : Uint8Array.from(thief.match(/../g), h => parseInt(h, 16)))];
const thiefCamp = { ...camp, streetcat: C.pubOf(thief) }; forged.push(K.finalizeEvent({ kind: 30078, created_at: later, tags: [['d', id]], content: JSON.stringify({ ...fake, campaign: thiefCamp }) }, Uint8Array.from((await C.derivedSk(C.TAG.ledger, thief)).match(/../g), h => parseInt(h, 16))));
for (const f of forged) await R.publish(f, URLS);
check('an event under that id signed by another key, or naming another campaign, does not pass', (await Promise.all(forged.map(f => R.ledgerOk(f, id)))).every(x => x === null));
s = await status(); check('…and the status page still shows Streetcat\'s ledger, not the newer forgeries', /ledger from Nostr/.test(s) && /29 sat locked · 2/.test(s.replace(/\s+/g, ' ')) && (await R.latestLedger(id, { relays: URLS })).found.ev.id === ev.id);

// publishing again replaces it
await give(5); await receive(); await sc.waitForTimeout(1100); const pub2 = await publish(); const newest = (await R.latestLedger(id, { relays: URLS })).found;
check('publishing again replaces the ledger with the newer one', /published ·/.test(pub2) && newest.ev.id !== ev.id && newest.L.entries.length === 3, `${newest.L.entries.length} donations`);
s = await status(); check('…which the status page reads', /34 sat locked · 3/.test(s.replace(/\s+/g, ' ')));

// no relay: the file
await Promise.all(relays.map(r => r.close())); relays = [];
await viewer.route('**/campaigns/mochi.json', r => r.fulfill({ json: newest.L })); s = await status(BASE + `status.html?n=${id}&l=campaigns/mochi.json`);
check('with no relay, the status page falls back to the ledger\'s file', /not found on the relays: this is the ledger's file/.test(s));
await viewer.unroute('**/campaigns/mochi.json'); await viewer.goto(BASE + `status.html?n=${id}`); await viewer.waitForFunction(() => /Failed|Checked/.test(document.getElementById('l-out').textContent), null, { timeout: 40000 });
check('…and without a file it says the ledger was not found', /not found on the relays/.test(await txt(viewer, '#l-out')));

await b.close(); say(bad ? `ledger_nostr: ${bad} check(s) failed` : 'ledger_nostr: every check passed'); process.exit(bad ? 1 : 0);
