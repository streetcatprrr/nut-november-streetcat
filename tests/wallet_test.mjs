// Paying from a Cashu wallet (NUT-18, experimental): app/index.html in Chromium, the local Nutshell mint with fake money and two local
// test relays. The donor's page shows a plain payment request (creqA): unit sat, the campaign's mint only, no lock in it, a Nostr
// transport to a key made for this donation. A "wallet" here (Node, cashu-ts, nostr-tools) pays it the way cashu.me does, by a NIP-17
// direct message with the NUT-18 payload. Plain ecash is locked on arrival into the campaign's lock with this donation's refund key; the
// payment is still picked up after a reload; ecash already locked to other keys is refused; ecash already carrying exactly that lock is
// taken as it is; and a token pasted by hand is locked too. SHOT_DIR=dir saves the request on screen (390 px @2x).
import { chromium } from 'playwright';
import fs from 'fs';
import { startRelay, loadKit } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', SHOT = process.env.SHOT_DIR, say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8')); const K = loadKit(); eval(fs.readFileSync(APP + 'relay.js', 'utf8'));
const C = globalThis.scCore, R = globalThis.scRelay, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), bytes = h => Uint8Array.from(h.match(/../g), x => parseInt(x, 16));
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7241 }), startRelay({ port: 7242 })]; await Promise.all(relays.map(r => r.ready)); const URLS = relays.map(r => r.url);
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, URLS.join(','));
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } })); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await txt(p, sel).catch(() => ''); if (re.test(s)) return s; await p.waitForTimeout(200); } return s; };
// NIP-19 nprofile, read back: the key and the relays a wallet sends to
const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', unbech = s => { const d = s.slice(s.lastIndexOf('1') + 1, -6).split('').map(c => B32.indexOf(c)), out = []; let acc = 0, bits = 0; for (const v of d) { acc = ((acc << 5) | v) & 0xffff; bits += 5; if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); } } return out; };
const readProfile = s => { const b = unbech(s), o = { relays: [] }; for (let i = 0; i < b.length;) { const t = b[i], l = b[i + 1], v = b.slice(i + 2, i + 2 + l); if (t === 0) o.pubkey = hex(v); if (t === 1) o.relays.push(String.fromCharCode(...v)); i += 2 + l; } return o; };
check('nprofile is NIP-19\'s (its example, both ways)', R.nprofile('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d', ['wss://r.x.com', 'wss://djbas.sadkb.com']) === 'nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p');

// Streetcat's campaign, signed; the donor opens its link
const clinic = await page(); await tab(clinic, 'csettings'); await clinic.click('#cs-new'); await clinic.waitForTimeout(900); const clinicPk = await txt(clinic, '#cs-pk');
const sc = await page(); await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(900); await tab(sc, 'campaign'); await sc.reload(); await tab(sc, 'campaign');
await sc.fill('#k-name', 'MOCHI'); await sc.fill('#k-mint', MINT); await sc.fill('#k-c', clinicPk); await sc.fill('#k-dl', new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10)); await sc.click('#k-go'); await waitText(sc, '#k-out', /is ready|cannot/); await sc.waitForTimeout(900);
const link = (await txt(sc, '#k-out')).match(/http\S+#c=\S+/)[0], camp = JSON.parse(Buffer.from(link.split('#c=')[1], 'base64url').toString());
const donor = await page(); await donor.goto(link); await donor.reload(); await donor.waitForTimeout(1500);
const openRequest = async amount => { await donor.evaluate(() => { const v = window.__vetlock; if (!document.getElementById('donate').classList.contains('on')) v.openTab('donate'); const a = document.getElementById('d-again'); if (a && a.offsetParent) a.click(); }); if (amount != null) await donor.fill('#d-amt', String(amount)); await donor.evaluate(() => { document.getElementById('dw-state').textContent = ''; window.__vetlock.openTab('decash'); });  /* "Pay with ecash": the request is made as the screen opens */
  await waitText(donor, '#dw-state', /waiting for the payment|Failed|✗/); await donor.click('#dw-copy'); await donor.waitForTimeout(200); const creq = await donor.evaluate(() => navigator.clipboard.readText()); return cashu.PaymentRequest.fromEncodedRequest(creq); };

// the request: plain, the campaign's mint, a Nostr transport to a key of this donation
let pr = await openRequest(21); const t0 = (pr.transport || [])[0] || {}, prof = t0.target ? readProfile(t0.target) : {};
check('the page shows a plain payment request: sat, the campaign\'s mint only, no lock in it', pr.unit === 'sat' && JSON.stringify(pr.mints) === JSON.stringify([MINT]) && !pr.nut10 && String(pr.amount) === '21' && pr.singleUse === true && /MOCHI/.test(pr.description || ''), `${pr.description}`);
check('…to be paid by NIP-17 to a key made for this donation, on the app\'s relays', t0.type === 'nostr' && JSON.stringify(t0.tags) === JSON.stringify([['n', '17']]) && /^[0-9a-f]{64}$/.test(prof.pubkey || '') && JSON.stringify(prof.relays) === JSON.stringify(URLS));
check('…as one QR a wallet can scan', (await donor.$$('#dw-term .qr svg')).length === 1);
{ const vs = donor.viewportSize(), over = []; for (const wd of [320, 375, 390, 430]) { await donor.setViewportSize({ width: wd, height: 740 }); await donor.waitForTimeout(80); const o = await donor.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${wd}px +${o}`); } await donor.setViewportSize(vs); check('…and the screen fits at 320, 375, 390 and 430 px', !over.length, over.join(', ')); } if (SHOT) { await donor.waitForTimeout(1200); await donor.screenshot({ path: `${SHOT}/w1-donor-wallet-request.png`, fullPage: true }); }
const reqs = () => donor.evaluate(() => window.__vetlock.wreqs()), refundPkOf = async id => (await reqs()).find(x => x.id === id).pk;

// a wallet pays it the way cashu.me does: the NUT-18 payload as a NIP-17 message to the nprofile
const pay = async (req, proofs) => { const to = readProfile(req.transport[0].target), ev = K.wrapEvent({ kind: 14, content: JSON.stringify({ id: req.id, mint: MINT, unit: 'sat', proofs: proofs.map(p => ({ ...p, amount: C.amt(p.amount) })) }), tags: [['p', to.pubkey]] }, K.generateSecretKey(), to.pubkey);
  const res = await R.publish(ev, to.relays); return res.filter(x => x.ok).length; };
const p21 = await plain(21); check('the wallet\'s message reaches the relays', await pay(pr, p21) === 2);
let out = await waitText(donor, '#d-out', /LOCKED|Failed/, 40000);
check('the plain ecash is locked on arrival: the campaign\'s lock, with this donation\'s refund key', /LOCKED 21 sat for MOCHI/.test(out), out.split('\n').find(l => /LOCKED|Failed/.test(l)) || out.slice(0, 80));
const rc = await donor.evaluate(t => window.__vetlock.receiptOf(t), out.match(/cashuB[A-Za-z0-9_\-=]+/g).pop()), lockedProofs = w.decodeToken(rc.donation.token).proofs, lk = C.lockOf(lockedProofs[0].secret);
check('…exactly: Streetcat + clinic 2 of 2, the deadline, the refund key kept with the request', lockedProofs.every(p => !C.lockProblem(C.lockOf(p.secret), camp)) && lk.refund[0] === rc.refund.pub && lk.refund[0] === await refundPkOf(pr.id));
check('…and the wallet\'s plain ecash is spent at the mint', (await w.checkProofsStates(p21)).every(s => s.state === 'SPENT'));

// picked up after a reload: the request is made, the page goes away, the wallet pays, the page comes back
pr = await openRequest(8); await donor.goto('about:blank'); const p8 = await plain(8); await pay(pr, p8); await donor.goto(link); await donor.reload();
out = await waitText(donor, '#d-out', /LOCKED|Failed/, 40000); check('a payment made while the page was closed is picked up when it opens again', /LOCKED 8 sat for MOCHI/.test(out));

// ecash already locked to something else is refused; exactly our lock is taken as it is
pr = await openRequest(5); const p5 = await plain(5);
const toStreetcat = await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: p5 })).asLocked(new cashu.LockBuilder().addMainPubkey(camp.streetcat)).run();  /* what a wallet applying only the lock's main key would make */
await pay(pr, toStreetcat); const st = await waitText(donor, '#dw-state', /✗|LOCKED/, 40000);
check('ecash already locked to other keys is refused, and says why', /✗ your wallet sent ecash that is already locked \(to /.test(st) && !/LOCKED 5 sat/.test(await txt(donor, '#d-out')), st.slice(0, 110));
check('…and the request stays open for another payment', (await reqs()).find(x => x.id === pr.id).state === 'waiting');
const p5b = await plain(5), exact = await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: p5b })).asLocked(new cashu.LockBuilder().addMainPubkey([camp.streetcat, camp.clinic]).requireMainSignatures(2).addRefundPubkey(await refundPkOf(pr.id)).lockUntil(Number(camp.deadline))).run();
await pay(pr, exact); out = await waitText(donor, '#d-out', /LOCKED 5 sat|Failed/, 40000);
check('ecash that already carries exactly this lock is taken as it is', /LOCKED 5 sat for MOCHI/.test(out) && w.decodeToken((await donor.evaluate(t => window.__vetlock.receiptOf(t), out.match(/cashuB[A-Za-z0-9_\-=]+/g).pop())).donation.token).proofs.map(p => p.secret).join() === exact.map(p => p.secret).join());

// in-band: a token pasted by hand from a wallet that has no transport
await openRequest(3); const p3 = await plain(3); await donor.fill('#d-token', cashu.getEncodedToken({ mint: MINT, proofs: p3 })); await donor.click('#d-go');
out = await waitText(donor, '#d-out', /LOCKED 3 sat|Failed/, 40000); check('a token pasted by hand is locked the same way', /LOCKED 3 sat for MOCHI/.test(out));
const other = await (async () => { const w2 = new cashu.Wallet('http://127.0.0.1:3339'); try { await w2.loadMint(); const q = await w2.createMintQuoteBolt11(2); await new Promise(r => setTimeout(r, 500)); return cashu.getEncodedToken({ mint: 'http://127.0.0.1:3339', proofs: await w2.mintProofsBolt11(2, q) }); } catch (_) { return null; } })();
if (other) { await openRequest(2); await donor.fill('#d-token', other); await donor.click('#d-go'); const so = await waitText(donor, '#de-out', /✗|Failed/, 20000); check('ecash from another mint is not taken', /is from http:\/\/127\.0\.0\.1:3339, but the campaign uses/.test(so)); }

await b.close(); await Promise.all(relays.map(r => r.close()));
say(bad ? `wallet: ${bad} check(s) failed` : 'wallet: every check passed'); process.exit(bad ? 1 : 0);
