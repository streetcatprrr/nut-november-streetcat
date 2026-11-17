// Six medium findings of part 3 of the six scans (14–15 Nov), gone through on 17 Nov, each tried the way it was found: in Chromium,
// against the local mint (3338, fake money), with made-up keys. The numbers are the scans'.
// · The partner: a request with no list of donations is not kept (3.33: it was, and the work list broke on it); the photos a file
//   carries are kept only for a request Streetcat signed (3.17: any file filled the phone with them); nothing is signed about a copy
//   Streetcat did not sign, a report included (3.7: the report then stood against Streetcat's own request); an invoice chosen for one
//   request does not land in another opened meanwhile (3.11); and an answer this phone could not keep is not sent (3.41: Streetcat
//   released on it, and this phone no longer knew it had confirmed).
// · Rescue: once released, the confirmation it was released on stays, against a later confirmation too (3.19).
// Not here: the findings of that part left as they are, and the four not reproduced (tests/README.md names them).
import fs from 'fs';
import { chromium } from 'playwright';
import { startRelay, loadKit } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8')); loadKit(); eval(fs.readFileSync(APP + 'relay.js', 'utf8'));
const C = globalThis.scCore, hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new cashu.Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return await w.mintProofsBolt11(n, q); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7483 }), startRelay({ port: 7484 })]; await Promise.all(relays.map(r => r.ready)); const URLS = relays.map(r => r.url);
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
// a page whose storage refuses the keys named in sessionStorage 'zz.refuse', as a full phone does (tests/retention_test.mjs)
const page = async ({ init, arg } = {}) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await c.addInitScript(r => { try { if (!localStorage.getItem('vetlock.relays')) localStorage.setItem('vetlock.relays', r); } catch (_) {}
    const set = Storage.prototype.setItem; Storage.prototype.setItem = function (key, v) { let no = []; try { no = JSON.parse(sessionStorage.getItem('zz.refuse') || '[]'); } catch (_) {}
      if (this === localStorage && no.includes(key)) throw new DOMException('refused by the test', 'QuotaExceededError'); return set.call(this, key, v); }; }, URLS.join(','));
  if (init) await c.addInitScript(init, arg);
  const p = await c.newPage(); p.on('pageerror', e => { bad++; say('✗ PAGEERROR', e.message); }); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const hashOf = link => link.slice(link.indexOf('#')), open = (p, text, from = 'link') => p.evaluate(([t, f]) => window.__vetlock.openPayload(t, f).then(() => 'ok', e => '✗ ' + (e.message || e)), [text, from]);
const withKey = (slot, sk) => ({ init: ([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch (_) {} }, arg: [slot, sk] });

const sc = newSk(), cl = newSk(); await b.pin(C.pubOf(sc));
const deadline = Math.floor(Date.now() / 1000) + 30 * 86400, today = new Date().toISOString().slice(0, 10), T = h => `${today}T${h}:00:00.000Z`;
const camp = await C.signCampaign({ name: 'MOCHI', op: 'sterilisation', mint: MINT, streetcat: C.pubOf(sc), clinic: C.pubOf(cl), deadline }, sc);
const lockOf = refundPk => new cashu.LockBuilder().addMainPubkey([camp.streetcat, camp.clinic]).requireMainSignatures(2).addRefundPubkey(refundPk).lockUntil(deadline);
const donated = async n => w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: await plain(n) })).asLocked(lockOf(C.pubOf(newSk()))).run();
const request = async (patient, n) => C.signRequest(await C.makeRequest({ campaign: camp, patient, procedure: 'spay', date: today, contributions: [{ release: n, proofs: await donated(n) }] }), sc);
const linkOf = async q => hashOf(await C.linkFor(BASE + 'index.html?role=clinic', q));

// ---- THE PARTNER ----
{ const p = await page(withKey('vetlock.clinic.sk', cl)); await p.evaluate(() => window.__vetlock.setRole('clinic'));
  const creq = id => p.evaluate(id => window.__vetlock.creqs().find(r => r.id === id) || null, id), checked = () => p.waitForFunction(() => !document.getElementById('cr-ok').disabled, null, { timeout: 30000 }).then(() => true, () => false);
  // 3.33 · a request with no list of donations
  const q33 = { ...(await request('NALA', 16)), contributions: null }, o33 = await open(p, JSON.stringify(q33), 'file');
  check('3.33 · a request with no list of donations is not kept, and it says why', /^✗/.test(o33) && !(await creq(q33.id)), o33.slice(0, 90) + ' · kept: ' + !!(await creq(q33.id)));
  // 3.17 · the photos a file carries, for a request Streetcat did not sign
  const bytes = cashu.createRandomSecretKey(), sha = await C.sha256hex(bytes), q17 = await request('KIRA', 16);
  const forged = { ...q17, patient: 'KIRA II', photos: [{ slot: C.REQ_SLOTS[0], sha256: sha, bytes: bytes.length, w: 4, h: 8 }], photoData: { [C.REQ_SLOTS[0]]: Buffer.from(bytes).toString('base64') } };
  const o17 = await open(p, JSON.stringify(forged), 'file'), here17 = await p.evaluate(s => window.__vetlock.photoHere(s), sha), r17 = await creq(q17.id);
  check('3.17 · a file with a request Streetcat did not sign: shown with its warning, and its photos are not kept on this phone', !here17 && !!r17 && (r17.unsigned || []).length > 0, `${o17.slice(0, 40)} · photo kept: ${here17} · warned: ${!!r17 && (r17.unsigned || []).length > 0}`);
  // 3.7 · a report about that copy
  await p.waitForSelector('#creq.on'); await p.click('#cr-prob summary'); await p.click('#cr-why button[data-r="other"]'); await p.click('#cr-report'); await p.waitForTimeout(2500);
  const r7 = await creq(q17.id), out7 = (await txt(p, '#cr-out')).replace(/\s+/g, ' ');
  check('3.7 · nothing is signed about a copy Streetcat did not sign: no report goes out, and it says why', !!r7 && !r7.answer && /not signed by Streetcat|does not match/.test(out7), `answer: ${r7 && r7.answer ? r7.answer.kind : 'none'} · ${out7.slice(0, 90)}`);
  // 3.11 · an invoice chosen for one request, another opened before the file comes
  const qa = await request('LUNA', 16), qb = await request('TEO', 16); await open(p, await linkOf(qb)); await open(p, await linkOf(qa)); await p.waitForSelector('#creq.on'); await checked();
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#cr-inv')]); await open(p, await linkOf(qb)); await p.waitForTimeout(400);
  await fc.setFiles({ name: 'invoice-luna.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 the invoice of LUNA') }); await p.waitForTimeout(800);
  const cur = await txt(p, '#cr-ev');
  check('3.11 · an invoice chosen for one request does not land in the one opened meanwhile', !/invoice-luna/.test(cur), 'on TEO\'s screen: ' + (cur.slice(0, 70) || 'nothing'));
  // 3.41 · a confirmation this phone cannot keep
  await checked(); await p.check('#cr-ok'); const before = await p.evaluate(() => window.__vetlock.outbox().length);
  await p.evaluate(() => sessionStorage.setItem('zz.refuse', JSON.stringify(['vetlock.clinic.requests']))); await p.click('#cr-go'); await p.waitForTimeout(3500);
  const after = await p.evaluate(() => window.__vetlock.outbox().length), rb = await creq(qb.id), out41 = (await txt(p, '#cr-out')).replace(/\s+/g, ' ');
  check('3.41 · a confirmation this phone could not keep is not sent to Streetcat, and it says there is no room', after === before && !(rb && rb.answer) && /no room/.test(out41), `outbox ${before} → ${after} · kept answer: ${!!(rb && rb.answer)} · ${out41.slice(0, 70)}`);
  await p.evaluate(() => sessionStorage.removeItem('zz.refuse')); await p.context().close(); }

// ---- RESCUE ----
{ const at = new Date().toISOString(), qs = await request('MIA', 16);
  const p = await page({ init: ([sk, reqs]) => { try { if (!localStorage.getItem('vetlock.streetcat.sk')) { localStorage.setItem('vetlock.streetcat.sk', sk); localStorage.setItem('vetlock.sc.requests', reqs); } } catch (_) {} }, arg: [sc, JSON.stringify([{ id: qs.id, q: qs, state: 'sent', at }])] });
  await p.evaluate(() => window.__vetlock.setRole('streetcat')); const sreq = id => p.evaluate(id => window.__vetlock.sreqs().find(r => r.id === id) || null, id);
  const answer = async a => open(p, hashOf(await C.linkFor(BASE + 'index.html?role=streetcat', a)));
  await answer(await C.certify(qs, cl, T('10')));
  await p.evaluate(id => { const a = JSON.parse(localStorage.getItem('vetlock.sc.requests')); for (const x of a) if (x.id === id) x.state = 'released'; localStorage.setItem('vetlock.sc.requests', JSON.stringify(a)); }, qs.id);
  await answer(await C.certify(qs, cl, T('13'), { sha256: await C.sha256hex('%PDF-1.4 another invoice'), kind: 'invoice' }));
  const r = await sreq(qs.id);
  check('3.19 · once released, a later confirmation does not take the place of the one it was released on', !!r && r.state === 'released' && r.answer.statement.signed === T('10') && !r.answer.statement.evidence, `${r && r.state} · signed ${r && r.answer.statement.signed.slice(11, 13)}h · evidence: ${!!(r && r.answer.statement.evidence)}`);
  await p.context().close(); }

await b.close(); for (const r of relays) await (r.close && r.close());
say(bad ? `medium3: ${bad} check(s) failed` : 'medium3: every check passed'); process.exit(bad ? 1 : 0);
