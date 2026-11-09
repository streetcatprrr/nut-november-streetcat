// Certifying without coverage (app/index.html in Chromium, local Nutshell mint, fake money): the clinic opens the app once with a
// connection, then loses it. The app must still open (service worker), with its font, read a donation (the mint's keys kept from
// last time) and certify it; once back online, Streetcat releases what the clinic signed offline. The cat recognition, got ahead of
// time in Offline setup, must work offline too, with the numbers Streetcat's phone gives; a donor's phone must keep none of it.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { spawn } from 'child_process';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338';
// the clinic's copy of the app comes from its own server, which this test switches off: offline, nothing can come from the network
const OWN = 'http://127.0.0.1:8093/', server = spawn('python3', ['-m', 'http.server', '8093', '--bind', '127.0.0.1', '--directory', new URL('../app', import.meta.url).pathname], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const say = (...a) => console.log(...a);
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const ctx = { donor: await b.newContext(), clinic: await b.newContext(), streetcat: await b.newContext() }, pages = {};
for (const k in ctx) { pages[k] = await ctx[k].newPage(); pages[k].on('pageerror', e => say(k, 'PAGEERROR', e.message)); await pages[k].goto((k === 'clinic' ? OWN : BASE) + 'index.html'); }
const { donor, clinic, streetcat } = pages;
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t);
const out = async (p, id) => (await p.textContent('#' + id)).trim();
const waitOut = async (p, id, re, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await out(p, id); if (re.test(s)) return s; await p.waitForTimeout(200); } return out(p, id); };
const lastToken = s => s.match(/cashuB[A-Za-z0-9_\-=]+/g).pop();

await tab(clinic, 'certify'); await clinic.click('#c-new'); await clinic.waitForTimeout(1500); const clinicPk = await out(clinic, 'c-pk');
await tab(streetcat, 'release'); await streetcat.click('#s-new'); await streetcat.waitForTimeout(1500); const scPk = await out(streetcat, 's-pk');
const camp = await streetcat.evaluate(c => window.scCore.signCampaign(c, window.__vetlock.heldKeys('streetcat')[0]), { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: scPk, clinic: clinicPk, deadline: Math.floor(Date.now() / 1000) + 30 * 86400 });  /* signed by Streetcat: an unsigned link takes no donation */
await tab(donor, 'donate'); await donor.fill('#d-camp', JSON.stringify(camp)); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(21)); await donor.click('#d-go');
const tok = lastToken(await waitOut(donor, 'd-out', /LOCKED|Failed/));

// online, once: the service worker installs, and reading the donation keeps the mint's keys
say('service worker ready:', await clinic.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active)));
await clinic.reload(); say('page controlled by it:', await clinic.evaluate(() => !!navigator.serviceWorker.controller));
await tab(clinic, 'certify'); await clinic.fill('#c-token', tok); say('read online:', (await waitOut(clinic, 'c-info', /names|cannot/)).split('\n').pop());
await clinic.fill('#c-token', '');
// the cat recognition (catid.js), got ahead of time in Offline setup, on wifi, without starting it; the numbers to expect for a photo
// drawn here are worked out on Streetcat's phone. A donor's phone, which never asked for it, keeps none of its 121 MB.
const on = await streetcat.evaluate(async () => { const cv = new OffscreenCanvas(320, 240), cx = cv.getContext('2d'); cx.fillStyle = '#d28a3c'; cx.fillRect(0, 0, 320, 240); cx.fillStyle = '#222'; cx.beginPath(); cx.arc(160, 120, 70, 0, 7); cx.fill();
  const bytes = new Uint8Array(await (await cv.convertToBlob({ type: 'image/jpeg', quality: .9 })).arrayBuffer()); await CATID.load(); const v = await CATID.compute(bytes); return { e: Array.from(v.e), bytes: Array.from(bytes) }; });
await tab(clinic, 'coffline'); await clinic.waitForSelector('#co-ai', { timeout: 10000 }); const before = await clinic.evaluate(() => CATID.here()); await clinic.click('#co-ai');
const got = await clinic.waitForFunction(() => [...document.querySelectorAll('#co-list li.ok span')].some(s => /^The cat recognition is saved/.test(s.textContent)), null, { timeout: 120000 }).then(() => true, () => false);
say('Offline setup gets the cat recognition ahead of time:', !before && got && await clinic.evaluate(() => CATID.loaded() === false && CATID.here()), '| a donor phone keeps none of it:', !(await donor.evaluate(() => caches.keys())).some(k => k.startsWith('streetcat-ai-')));

// no connection: the clinic's server is off and the browser is offline
server.kill(); await new Promise(r => setTimeout(r, 300)); await ctx.clinic.setOffline(true);
await clinic.reload();
const shell = await clinic.evaluate(async () => { await document.fonts.ready; return { app: !!document.getElementById('c-go'), font: document.fonts.check('14px "Departure Mono"'), online: navigator.onLine }; });
say('offline, the app opens:', shell.app, '| with its font:', shell.font, '| navigator.onLine:', shell.online);
await tab(clinic, 'certify'); await clinic.fill('#c-token', tok); say('offline, reads the donation:', (await waitOut(clinic, 'c-info', /names|cannot/)).split('\n').pop());
await clinic.click('#c-go'); const c = await waitOut(clinic, 'c-out', /CERTIFIED|Failed/); say('offline, certifies:', c.split('\n')[0], '|', /without a connection/.test(c) ? 'says it was signed without a connection' : 'NO OFFLINE NOTE');
const st = await clinic.evaluate(async m => ({ status: await fetch('status.html').then(x => x.ok).catch(() => false), mint: await fetch(m + '/v1/info').then(() => 'reached').catch(() => 'unreachable') }), MINT);
say('offline, the status page is there too:', st.status, '| the mint is', st.mint);
const off = await clinic.evaluate(async ([bytes, e]) => { const here = await CATID.here(); await CATID.load(); const v = await CATID.compute(new Uint8Array(bytes)); let d = 0; for (let i = 0; i < e.length; i++) d = Math.max(d, Math.abs(e[i] - v.e[i])); return { here, d }; }, [on.bytes, on.e]).catch(x => ({ err: x.message.split('\n')[0] }));
say('offline, the cat recognition loads from the phone and gives the same numbers:', off.err || (off.here && off.d < 1e-6), off.err ? '' : `| largest difference ${off.d}`);
await ctx.clinic.setOffline(false);

// back online: Streetcat releases what the clinic signed offline
await tab(streetcat, 'release'); await streetcat.fill('#s-token', lastToken(c)); await waitOut(streetcat, 's-info', /certified|signed/);
await streetcat.click('#s-go'); say('back online, Streetcat releases it:', (await waitOut(streetcat, 's-out', /RELEASED|Not possible|refused/)).split('\n')[0]);
await b.close(); server.kill();
