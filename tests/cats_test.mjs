// The cat's record (StreetCat, 6 Nov: "que la interfaz de la clínica pudiese crear una ficha del gato … y esa fuese reenviada
// automáticamente a Streetcat"). First core.js: the record signed with the clinic's statement key and checked, and its photos in parts
// small enough for a relay. Then the app, on the local mint and a local relay: the clinic opens Streetcat's request for MOCHI and makes
// MOCHI's record from it, with four photos made small on the phone (without what the camera wrote in the file), signs it and it goes by
// itself; Streetcat, which knows the clinic from its campaign, gets the record and every photo, checks them, lists the cat, finds it and
// shows it. An edited record, a swapped photo and a record from a clinic of none of its campaigns are not trusted.
import fs from 'fs';
import { chromium } from 'playwright';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser, pin } from './pin.mjs';
const APP = new URL('../app/', import.meta.url).pathname, BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338';
eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;'); eval(fs.readFileSync(APP + 'core.js', 'utf8'));
const C = globalThis.scCore, say = (...a) => console.log(...a), now = () => Math.floor(Date.now() / 1000), today = new Date().toISOString().slice(0, 10);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), newSk = () => hex(cashu.createRandomSecretKey());
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };

// 1) core.js
const clSk = newSk(), clPk = C.pubOf(clSk), sha = 'ab'.repeat(32);
const F = { name: ' MOCHI ', colony: 'the marina', chip: '941 000 027 761 304', sex: 'female', ear: 'left', coat: 'calico', procedure: 'sterilisation (spay)', date: today, notes: 'weight 3.1 kg', photos: [{ slot: 'face', sha256: sha, bytes: 30000, w: 640, h: 480 }] };
const R0 = await C.signCat(F, clSk), v0 = await C.catCheck(R0);
check('a record is signed with the clinic\'s statement key, and checks out', v0.ok && /^CAT-[0-9A-F]{10}$/.test(R0.id) && R0.statement.clinic === clPk, v0.text);
check('…written as the clinic wrote it: the name trimmed, the microchip without spaces', R0.statement.name === 'MOCHI' && R0.statement.chip === '941000027761304' && R0.statement.ear === 'left');
const edited = structuredClone(R0); edited.statement.chip = '941000027761305';
check('an edited record does not check out', !(await C.catCheck(edited)).ok);
const moved = structuredClone(R0); moved.statement.clinic = C.pubOf(newSk());
check('…nor one that names another clinic key than the one that signed it', !(await C.catCheck(moved)).ok);
let refused = ''; try { await C.signCat({ ...F, chip: '94100002776130' }, clSk); } catch (e) { refused = e.message; }
check('a microchip number that is not 15 digits is not signed', /15 digits/.test(refused), refused);
const b64 = Buffer.from(new Uint8Array(37000).map(() => Math.random() * 256)).toString('base64'), parts = C.catPhotoParts(R0.id, 'face', sha, b64, clPk);
check('a photo goes in parts of at most 26 000 characters that rebuild it', parts.length === 2 && parts.every(p => p.data.length <= C.CAT_CHUNK && C.catPartOk(p)) && parts.map(p => p.data).join('') === b64, parts.map(p => p.data.length).join(' + '));
check('…and a part that is not one is refused', [{ ...parts[0], kind: 'face.1' }, { ...parts[0], data: parts[0].data + 'A' }, { ...parts[0], data: '<script>' }, { ...parts[0], part: 2 }, { ...parts[0], slot: 'tail', kind: 'tail.0' }].every(p => !C.catPartOk(p)));

// 2) the app: Streetcat's campaign and its request for MOCHI, made here with a donation locked to it
const relay = startRelay({ port: 7313 }); await relay.ready;
const scSk = newSk(), scPk = C.pubOf(scSk); await pin(scPk);
const camp = await C.signCampaign({ name: 'TNR MARINA', op: 'sterilisation', mint: MINT, streetcat: scPk, clinic: clPk, deadline: now() + 30 * 86400, hue: 200 }, scSk);
const w = new cashu.Wallet(MINT); await w.loadMint();
const mq = await w.createMintQuoteBolt11(2100); let plain = null; for (let i = 0; i < 40 && !plain; i++) { try { plain = await w.mintProofsBolt11(2100, mq); } catch { await new Promise(r => setTimeout(r, 300)); } }
const lock = new cashu.LockBuilder().addMainPubkey([scPk, clPk]).requireMainSignatures(2).addRefundPubkey(C.pubOf(newSk())).lockUntil(Number(camp.deadline));
const locked = await w.ops.receive(cashu.getEncodedToken({ mint: MINT, proofs: plain })).asLocked(lock).run();
const q = await C.makeRequest({ campaign: camp, patient: 'MOCHI', procedure: 'sterilisation (spay)', date: today, contributions: [{ proofs: locked }] });

const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async (role, sk) => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
  await c.addInitScript(([u, k, r]) => { try { localStorage.setItem('vetlock.relays', u); if (k) localStorage.setItem(r === 'clinic' ? 'vetlock.clinic.sk' : 'vetlock.streetcat.sk', k); } catch (_) {} }, [relay.url, sk, role]);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', role, e.message)); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html?role=' + role); return p; };
const text = async (p, sel) => ((await p.textContent(sel)) || '').trim();
const waitText = async (p, sel, re, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await text(p, sel); if (re.test(s)) return s; await p.waitForTimeout(200); } return text(p, sel); };

// photos as a phone takes them: big (the face is 3000 × 2250, noisy, a few MB) and with the camera's data in the file (an EXIF block
// carrying a made-up GPS label), which must not reach Streetcat
const sc = await page('streetcat', scSk);
await sc.evaluate(c => localStorage.setItem('vetlock.campaigns', JSON.stringify([{ c, link: location.origin + '/index.html#c=x', slug: 'tnr-marina', created: Date.now() }])), camp);
const cl = await page('clinic', clSk);
const jpeg = async (wd, ht, seed) => Buffer.from(await cl.evaluate(([wd, ht, seed]) => { const cv = document.createElement('canvas'); cv.width = wd; cv.height = ht; const g = cv.getContext('2d'), im = g.createImageData(wd, ht); let s = seed;
  for (let i = 0; i < im.data.length; i += 4) { s = (s * 16807) % 2147483647; const v = s & 255; im.data[i] = v; im.data[i + 1] = (v * 7) & 255; im.data[i + 2] = (v * 13) & 255; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); return cv.toDataURL('image/jpeg', .95).split(',')[1]; }, [wd, ht, seed]), 'base64');
const withExif = j => { const tag = Buffer.from('Exif\0\0II*\0\x08\0\0\0\0\0GPS-STREETCAT-TEST', 'latin1'), len = Buffer.alloc(2); len.writeUInt16BE(tag.length + 2); return Buffer.concat([j.subarray(0, 2), Buffer.from([0xff, 0xe1]), len, tag, j.subarray(2)]); };
const photos = { face: withExif(await jpeg(3000, 2250, 7)), left: await jpeg(1600, 1200, 11), right: await jpeg(1600, 1200, 13), nose: await jpeg(1200, 1200, 17) };
say(`(the photos: ${Object.entries(photos).map(([k, v]) => `${k} ${Math.round(v.length / 1000)} kB`).join(', ')})`);

// the clinic: from the request, its cat's record
await cl.evaluate(t => window.__vetlock.openPayload(t, 'relay'), await C.pack(q)); await cl.waitForSelector('#creq.on');
check('the request names its cat\'s record, still to be made', /^MOCHI's record: photos, chip$/.test(await text(cl, '#cr-cat-a')) && await cl.isVisible('#cr-cat-a'));
await cl.click('#cr-cat-a'); await cl.waitForSelector('#catnew.on');
check('…which opens with the cat, the procedure and the date of the request, in one line (StreetCat: "es muy larga")', await cl.inputValue('#cn-name') === 'MOCHI' && await cl.inputValue('#cn-proc') === 'sterilisation (spay)' && await cl.inputValue('#cn-date') === today && /^MOCHI\s*TNR MARINA · request R-/.test(await text(cl, '#cn-head'))
  && (await text(cl, '#cn-sum')) === `sterilisation (spay) · ${today} · edit` && !(await cl.isVisible('#cn-name')) && !(await cl.isVisible('#cn-proc')) && !(await cl.isVisible('#cn-coat')), await text(cl, '#cn-sum'));
check('a photo is taken with the camera straight away, not chosen from the gallery', await cl.getAttribute('#cn-file', 'capture') === 'environment' && await cl.getAttribute('#cn-file', 'accept') === 'image/*');
for (const s of ['face', 'left', 'right', 'nose']) { const [fc] = await Promise.all([cl.waitForEvent('filechooser'), cl.click(`#cn-shots .shot[data-slot="${s}"]`)]); await fc.setFiles({ name: `IMG_${s}.JPG`, mimeType: 'image/jpeg', buffer: photos[s] }); await cl.waitForSelector(`#cn-shots .shot[data-slot="${s}"].has`, { timeout: 30000 }); }
check('four photos taken, each made small on the phone', /^4 of 4 photos · \d+ kB, made small here, without location data$/.test(await text(cl, '#cn-shots-st')), await text(cl, '#cn-shots-st'));
await cl.fill('#cn-colony', 'the marina'); await cl.fill('#cn-chip', '94100002776130'); await cl.click('#cn-sex button[data-v="female"]'); await cl.click('#cn-ear button[data-v="left"]');
{ const m = await cl.evaluate(() => ({ over: document.scrollingElement.scrollHeight - innerHeight, w: innerWidth, h: innerHeight })); check('the record of a request, photos taken and filled in, fits in one screen of an iPhone 14–16 (390 × 844)', m.w === 390 && m.h === 844 && m.over <= 0, `${m.over > 0 ? m.over + ' px too tall' : 'fits'}`); }
await cl.click('#cn-edit'); check('"edit" opens the cat, the procedure and the date', await cl.isVisible('#cn-name') && await cl.isVisible('#cn-proc') && await cl.isVisible('#cn-date') && !(await cl.isVisible('#cn-sum')));
await cl.click('#cn-more summary'); await cl.fill('#cn-coat', 'calico, white chest and paws');
await cl.click('#cn-go'); const wrong = await waitText(cl, '#cn-out', /15 digits/);
check('a microchip number of 14 digits: said in red, and nothing is signed', /^Not possible: the microchip number has 14 characters: it must be 15 digits$/.test(wrong) && await cl.evaluate(() => document.getElementById('cn-out').classList.contains('bad')) && (await cl.evaluate(() => window.__vetlock.ccats().length)) === 0, wrong);
await cl.fill('#cn-chip', '941 000 027 761 304'); await cl.click('#cn-go');
const sent = await waitText(cl, '#cn-out', /Streetcat gets it/, 60000);
check('signed and sent: the record by the relay and every part of every photo', /^SIGNED · .+ · CAT-[0-9A-F]{10}\nrecord: sent · 1 of 1 relays have it\nphotos: (\d+) of \1 parts sent\nStreetcat gets it the next time its app checks\./.test(sent), sent.split('\n').slice(0, 3).join(' | '));
check('…and its button says so, and cannot be pressed again', (await text(cl, '#cn-go')) === '✓ Signed' && await cl.isDisabled('#cn-go'));
const kept = await cl.evaluate(async () => { const x = window.__vetlock.ccats()[0], db = await new Promise(r => { const q = indexedDB.open('streetcat', 1); q.onsuccess = () => r(q.result); });
  const get = k => new Promise(r => { const t = db.transaction('photos').objectStore('photos').get(k); t.onsuccess = () => r(t.result); });
  const out = []; for (const p of x.rec.statement.photos) { const b = await get(p.sha256); out.push({ slot: p.slot, n: b ? b.length : 0, jpeg: !!b && b[0] === 0xff && b[1] === 0xd8, exif: !!b && new TextDecoder('latin1').decode(b).includes('Exif'), gps: !!b && new TextDecoder('latin1').decode(b).includes('GPS-STREETCAT'), w: p.w, h: p.h }); } return out; });
check('the photos the record names are JPEG, at most 38 kB and 640 px, and carry none of the camera\'s data', kept.length === 4 && kept.every(k => k.jpeg && k.n > 0 && k.n <= 38000 && Math.max(k.w, k.h) <= 640 && !k.exif && !k.gps), kept.map(k => `${k.slot} ${Math.round(k.n / 1000)} kB ${k.w}×${k.h}`).join(', '));
const sizes = relay.events.map(e => JSON.stringify(e).length);
check('every message a relay gets is under 56 kB (many relays take at most 64 kB)', sizes.length >= 5 && Math.max(...sizes) <= 56000, `${sizes.length} messages, the largest ${Math.max(...sizes)} bytes`);

// Streetcat: the record and its photos arrive, checked
await sc.evaluate(() => window.__vetlock.openTab('cats')); await sc.click('#ca-check'); const row = await waitText(sc, '#ca-list', /✓/);
check('Streetcat gets MOCHI: signed by the clinic of its campaign, every photo there', /^MOCHI\s*the marina · chip …761304\s*sterilisation \(spay\) · \d{4}-\d{2}-\d{2}\s*✓$/.test(row) && await text(sc, '#ca-n') === '1' && await text(sc, '#ca-m') === '1', row);
await sc.click('#ca-list .item'); await sc.waitForSelector('#cat.on'); const said = await waitText(sc, '#c1-out', /Signed/);
const imgs = await sc.evaluate(async () => { const a = [...document.querySelectorAll('#c1-pics img')]; await Promise.all(a.map(i => i.decode().catch(() => {}))); return a.map(i => i.naturalWidth > 0 && i.src.startsWith('blob:')); });
check('…and shows it: its four photos, its microchip, and who signed it', said === '✓ Signed by the clinic of TNR MARINA: every photo is the one it signed.' && imgs.length === 4 && imgs.every(Boolean) && /Microchip941 000 027 761 304/.test(await text(sc, '#c1-dl')) && /ClinicTNR MARINA · /.test(await text(sc, '#c1-dl')), said);
for (const [qy, n] of [['marina', 1], ['7761', 1], ['calico', 1], ['zzz', 0]]) { await sc.evaluate(() => window.__vetlock.openTab('cats')); await sc.fill('#ca-q', qy); await sc.waitForTimeout(150);
  const items = await sc.locator('#ca-list .item').count(); check(`a search for "${qy}" finds ${n ? 'MOCHI' : 'nothing, and says so'}`, items === n && (n || /No cat matches that/.test(await text(sc, '#ca-list')))); }
await sc.fill('#ca-q', '');
await cl.evaluate(() => window.__vetlock.openTab('cats')); check('the clinic\'s list: MOCHI, sent', /^MOCHI.*sent$/s.test(await waitText(cl, '#ca-list', /sent$/)) && await text(cl, '#ca-m') === '0');
await cl.evaluate(() => window.__vetlock.openTab('creq')); check('…and its request now names the record as sent', /^MOCHI's record · sent$/.test(await text(cl, '#cr-cat-a')));

// files: the clinic's own (it carries the photos), then three that must not be trusted
await cl.evaluate(id => { window.__vetlock.catCur(id); window.__vetlock.openTab('cat'); }, await cl.evaluate(() => window.__vetlock.ccats()[0].id)); await cl.waitForSelector('#cat.on');
const [dl] = await Promise.all([cl.waitForEvent('download'), cl.click('#c1-acts button:has-text("save as file")')]); const file = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
check('the clinic\'s file holds the signed record and its four photos', (await C.catCheck(file)).ok && Object.keys(file.photos || {}).length === 4);
const addFile = async (obj, name) => { await sc.evaluate(() => window.__vetlock.openTab('cats')); await sc.evaluate(() => { document.getElementById('ca-add').open = true; });
  const [fc] = await Promise.all([sc.waitForEvent('filechooser'), sc.click('#ca-pick')]); await fc.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) }); await sc.waitForTimeout(700); return text(sc, '#ca-out'); };
const ed = structuredClone(file); ed.statement.chip = '941000027761305'; ed.id = ed.statement.id = 'CAT-0000000001';
const said2 = await addFile(ed, 'edited.json');
check('an edited record is refused, in red', /^Not possible: a cat record that does not check out: it is not signed with the clinic key it names/.test(said2) && await sc.evaluate(() => document.getElementById('ca-out').classList.contains('bad')), said2.slice(0, 90));
const four = ['face', 'left', 'right', 'nose'].map(s => ({ slot: s, data: Buffer.from('photo of the ' + s + ' ' + Math.random()) }));
const shas = await Promise.all(four.map(async x => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', x.data)))));
const R2 = await C.signCat({ ...F, name: 'TEO', chip: '', photos: four.map((x, i) => ({ slot: x.slot, sha256: shas[i], bytes: x.data.length })) }, clSk);
const swapped = { ...R2, photos: Object.fromEntries(four.map((x, i) => [x.slot, (i === 3 ? four[0] : x).data.toString('base64')])) };  /* the nose replaced by another photo */
await addFile(swapped, 'swapped.json'); await sc.evaluate(id => { window.__vetlock.catCur(id); window.__vetlock.openTab('cat'); }, R2.id); const said3 = await waitText(sc, '#c1-out', /here/);
check('a swapped photo is not kept: the record says 3 of its 4 photos are here', /photos: 3 of 4 here, the rest on their way/.test(said3), said3.replace(/\n/g, ' | '));
const R3 = await C.signCat({ ...F, name: 'LINO', chip: '', photos: [] }, newSk());
await addFile(R3, 'stranger.json'); await sc.evaluate(() => window.__vetlock.openTab('cats'));
const lino = sc.locator('#ca-list .item', { hasText: 'LINO' }).first(); const st3 = ((await lino.locator('.st').textContent()) || '').trim(), red3 = await lino.locator('.st.bad').count();
await lino.click(); await sc.waitForSelector('#cat.on'); const said4 = await waitText(sc, '#c1-out', /Signed/);
check('a record from a clinic of none of the campaigns: "unknown clinic", in red, and not trusted', st3 === 'unknown clinic' && red3 === 1 && /^✗ Signed with a clinic key that is in none of your campaigns: ask the clinic before trusting it\.$/.test(said4), `${st3} · ${said4.slice(0, 60)}`);

// a new record from nothing: the form comes back empty, with the colony of the last cat
await cl.evaluate(() => window.__vetlock.openCatnew(null)); await cl.waitForSelector('#catnew.on');
check('"record another cat": an empty form with the name to write, the colony and the procedure of the cat before, today, its button back', await cl.inputValue('#cn-name') === '' && await cl.isVisible('#cn-name') && await cl.inputValue('#cn-colony') === 'the marina'
  && (await text(cl, '#cn-sum')) === `sterilisation (spay) · ${today} · edit` && !(await cl.isVisible('#cn-coat')) && (await text(cl, '#cn-go')) === 'Sign and send to Streetcat' && !(await cl.isDisabled('#cn-go')) && (await cl.locator('#cn-shots .shot.has').count()) === 0);

// nothing wider than the phone
{ const over = []; for (const wd of [320, 375, 390, 430]) { for (const [p, who, tabs] of [[cl, 'clinic', ['catnew', 'cats', 'cat']], [sc, 'streetcat', ['cats', 'cat']]]) { await p.setViewportSize({ width: wd, height: 740 });
      for (const t of tabs) { if (t === 'cat') await p.evaluate(r => window.__vetlock.catCur((r === 'clinic' ? window.__vetlock.ccats() : window.__vetlock.scats())[0].id), who); await p.evaluate(t => window.__vetlock.openTab(t), t); await p.waitForTimeout(250);
        const o = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${who} ${t} at ${wd}px +${o}`); } } }
  check('the record, the list and the cat fit at 320, 375, 390 and 430 px', !over.length, over.join(', ')); }
await b.close(); await relay.close();
say(bad ? `cats: ${bad} check(s) failed` : 'cats: every check passed'); process.exit(bad ? 1 : 0);
