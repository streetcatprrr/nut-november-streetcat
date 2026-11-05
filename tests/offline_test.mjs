// Certifying without coverage (app/index.html in Chromium, local Nutshell mint, fake money): the clinic opens the app once with a
// connection, then loses it. The app must still open (service worker), with its font, read a donation (the mint's keys kept from
// last time) and certify it; once back online, Streetcat releases what the clinic signed offline.
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
const camp = { name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: scPk, clinic: clinicPk, deadline: Math.floor(Date.now() / 1000) + 30 * 86400 };
await tab(donor, 'donate'); await donor.fill('#d-camp', JSON.stringify(camp)); await donor.evaluate(() => { window.__vetlock.openTab('decash'); }); await donor.fill('#d-token', await plain(21)); await donor.click('#d-go');
const tok = lastToken(await waitOut(donor, 'd-out', /LOCKED|Failed/));

// online, once: the service worker installs, and reading the donation keeps the mint's keys
say('service worker ready:', await clinic.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active)));
await clinic.reload(); say('page controlled by it:', await clinic.evaluate(() => !!navigator.serviceWorker.controller));
await tab(clinic, 'certify'); await clinic.fill('#c-token', tok); say('read online:', (await waitOut(clinic, 'c-info', /names|cannot/)).split('\n').pop());
await clinic.fill('#c-token', '');

// no connection: the clinic's server is off and the browser is offline
server.kill(); await new Promise(r => setTimeout(r, 300)); await ctx.clinic.setOffline(true);
await clinic.reload();
const shell = await clinic.evaluate(async () => { await document.fonts.ready; return { app: !!document.getElementById('c-go'), font: document.fonts.check('14px "Departure Mono"'), online: navigator.onLine }; });
say('offline, the app opens:', shell.app, '| with its font:', shell.font, '| navigator.onLine:', shell.online);
await tab(clinic, 'certify'); await clinic.fill('#c-token', tok); say('offline, reads the donation:', (await waitOut(clinic, 'c-info', /names|cannot/)).split('\n').pop());
await clinic.click('#c-go'); const c = await waitOut(clinic, 'c-out', /CERTIFIED|Failed/); say('offline, certifies:', c.split('\n')[0], '|', /without a connection/.test(c) ? 'says it was signed without a connection' : 'NO OFFLINE NOTE');
const st = await clinic.evaluate(async m => ({ status: await fetch('status.html').then(x => x.ok).catch(() => false), mint: await fetch(m + '/v1/info').then(() => 'reached').catch(() => 'unreachable') }), MINT);
say('offline, the status page is there too:', st.status, '| the mint is', st.mint);
await ctx.clinic.setOffline(false);

// back online: Streetcat releases what the clinic signed offline
await tab(streetcat, 'release'); await streetcat.fill('#s-token', lastToken(c)); await waitOut(streetcat, 's-info', /certified|signed/);
await streetcat.click('#s-go'); say('back online, Streetcat releases it:', (await waitOut(streetcat, 's-out', /RELEASED|Not possible|refused/)).split('\n')[0]);
await b.close(); server.kill();
