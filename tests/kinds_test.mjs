// What Streetcat pays for (StreetCat, 7 Nov: «las peticiones pueden ser de muchos tipos… comida… una operación veterinaria…
// esterilización»; «Puede haber una hucha… para comida de una colonia, otra… para alguna determinada clínica»; «Perfecto. Implementalo.»):
// Home's four kinds in two rows of two, a screen per kind; pots (campaigns) of one kind, for a colony, with the partner who confirms the
// spending, each chosen from its own list ("+ New …" the first time); and requests paid only from a pot of their kind, the pot bringing
// its partner. Against the local mint and two local relays, with made-up keys: a clinic and a shop, each with its own key; Rescue adds
// them as partners and two colonies, makes three pots, a donor gives to each; a food request is paid from the right pot, its cost taking
// the pot's donations, and sent to the shop; the donor sees the same four kinds. Every ✗ in red (colors.mjs). Fits 320 to 430 px.
import { chromium } from 'playwright';
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { startRelay } from './nostr_relay.mjs';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', MINT = process.env.MINT || 'http://127.0.0.1:3338', say = (...a) => console.log(...a);
const SHOT = process.env.SHOT_DIR, shot = async (p, name) => { if (SHOT) { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1200); await p.screenshot({ path: `${SHOT}/${name}.png` }); } };
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const w = new Wallet(MINT); await w.loadMint();
const plain = async n => { const q = await w.createMintQuoteBolt11(n); for (let i = 0; i < 40; i++) { try { return getEncodedToken({ mint: MINT, proofs: await w.mintProofsBolt11(n, q) }); } catch { await new Promise(r => setTimeout(r, 300)); } } throw new Error('mint quote never paid'); };
const relays = [startRelay({ port: 7321 }), startRelay({ port: 7322 })]; await Promise.all(relays.map(r => r.ready)); const RELAYS = relays.map(r => r.url).join(',');
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async () => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1 });
  await c.addInitScript(r => { try { localStorage.setItem('vetlock.relays', r); } catch (_) {} }, RELAYS);
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => d.accept()); await p.route('**/api/v1/prices', r => r.fulfill({ json: { EUR: 88000, USD: 100000 } }));
  await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const FIT = []; const fits = async (p, label) => { const vs = p.viewportSize(), over = []; for (const wd of [320, 375, 390, 430]) { await p.setViewportSize({ width: wd, height: 740 }); await p.waitForTimeout(80); const o = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); if (o > 0) over.push(`${wd}px +${o}`); } await p.setViewportSize(vs); if (over.length) FIT.push(`${label}: ${over.join(', ')}`); };
const red = (p, s) => p.$eval(s, e => getComputedStyle(e).color === (() => { const i = document.createElement('i'); i.style.color = 'var(--bad)'; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; })());
const lines = (p, s) => p.$$eval(s + ' button.req', bs => bs.map(b => ({ title: b.querySelector('.title').textContent, subs: [...b.children].slice(1).map(x => x.textContent), grey: b.classList.contains('no'), h: b.style.getPropertyValue('--h') })));
const keyLines = (p, s) => p.$$eval(s + ' .kline', ls => ls.map(l => { const k = l.querySelector('.kk .key'); return { label: l.querySelector('small').textContent, text: l.querySelector('.kk').textContent, role: k ? k.dataset.role || '' : '' }; }));
// the donor's list types itself in, line after line: read it once it has stopped (no cursor, the same text twice)
const settled = async (p, sel, ms = 20000) => { const t0 = Date.now(); let a = null; while (Date.now() - t0 < ms) { const b = await p.evaluate(s => { const e = document.querySelector(s); return e && !e.querySelector('.cur') ? e.textContent : null; }, sel); if (b !== null && b === a) return b; a = b; await p.waitForTimeout(400); } return a; };
const pick = async (p, title) => { await p.waitForSelector('#spick.on'); await p.locator('#pp-list button.req', { hasText: title }).first().click(); };
const camp = p => p.evaluate(() => JSON.parse(localStorage.getItem('vetlock.campaigns')).pop());
const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

// a clinic and a shop, each with its own key; Rescue, with Streetcat's
const clinic = await page(), shop = await page(), sc = await page(), donor = await page();
const keyOf = p => p.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('clinic', false)));
await tab(clinic, 'csettings'); await clinic.click('#cs-new'); const clinicPk = await keyOf(clinic);
await tab(shop, 'csettings'); await shop.click('#cs-new'); const shopPk = await keyOf(shop);
await tab(sc, 'release'); await sc.click('#s-new'); await sc.waitForTimeout(800); await sc.reload(); await sc.waitForTimeout(500);
const scPk = await sc.evaluate(() => window.__vetlock.pubOf(window.__vetlock.key('streetcat', false)));

// HOME: what Streetcat pays for, two by two
await tab(sc, 'home'); await sc.waitForTimeout(300);
const tiles = await sc.$$eval('#h-kinds button.tile', bs => bs.map(b => { const r = b.getBoundingClientRect(); return { t: b.querySelector('.title').textContent, x: Math.round(r.x), y: Math.round(r.y), size: Math.round(r.width) + 'x' + Math.round(r.height), sub: [...b.querySelectorAll('.sub2')].map(s => s.textContent).join(' | '), h: b.style.getPropertyValue('--h') }; }));
check('Home shows what Streetcat pays for: the four kinds in two rows of two, all the same size', tiles.map(t => t.t).join() === 'Sterilisation,Vet care,Food,Other' && tiles[0].y === tiles[1].y && tiles[2].y === tiles[3].y && tiles[2].y > tiles[0].y && tiles[0].x === tiles[2].x && tiles[1].x === tiles[3].x && new Set(tiles.map(t => t.size)).size === 1, tiles.map(t => `${t.t} ${t.x},${t.y} ${t.size}`).join(' · '));
check('…each in its own colour; with nothing yet, each says so', new Set(tiles.map(t => t.h)).size === 4 && tiles.every(t => t.sub === 'no pots yet | tap to start one') && !(await sc.$('#h-list')), tiles.map(t => t.sub).join(' · '));
await fits(sc, 'Home'); await shot(sc, 'kd-1-home');

// ONE KIND: Food
await sc.locator('#h-kinds button.tile', { hasText: 'Food' }).click(); await sc.waitForSelector('#skind.on');
check('a kind opens its own screen: who confirms it, its pots, its requests, and a new request or campaign of that kind', (await txt(sc, '#kd-head .title')) === 'Food' && /confirmed by the shop that sells the feed/.test(await txt(sc, '#kd-head')) && (await txt(sc, '#kd-pots')) === 'No food pots yet.' && (await txt(sc, '#kd-reqs')) === 'No requests yet.' && (await txt(sc, '#kd-req')) === 'New food request' && (await txt(sc, '#kd-camp')) === 'New food campaign' && await sc.isVisible('#hd-back'));

// A FOOD POT: the kind chosen; the colony and the partner from their lists, "+ New …" the first time
await sc.click('#kd-camp'); await sc.waitForSelector('#campaign.on');
const chips = await sc.$$eval('#k-type button', bs => bs.map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, on: b.classList.contains('on'), y: Math.round(r.y), w: Math.round(r.width) }; }));
check('the campaign form opens on that kind: the four kinds two by two, food chosen', chips.map(c => c.t).join() === 'sterilisation,vet care,food,other' && chips.filter(c => c.on).map(c => c.t).join() === 'food' && chips[0].y === chips[1].y && chips[2].y === chips[3].y && chips[2].y > chips[0].y && new Set(chips.map(c => c.w)).size === 1, chips.map(c => c.t + (c.on ? '*' : '')).join(' '));
check('…with "Choose colony" and "Choose partner" one under the other', (await txt(sc, '#k-col')) === 'Choose colony' && (await txt(sc, '#k-par')) === 'Choose partner' && (await sc.$eval('#k-par', b => b.getBoundingClientRect().y)) > (await sc.$eval('#k-col', b => b.getBoundingClientRect().y)));
await fits(sc, 'the campaign form'); await shot(sc, 'kd-2-campaign');
await sc.click('#k-col'); await sc.waitForSelector('#spick.on'); let L = await lines(sc, '#pp-list');
check('"Choose colony" opens the colonies, a list like the pots\'; none yet: only "every colony", chosen', (await txt(sc, '#pp-head .title')) === 'Choose a colony' && L.map(l => l.title).join() === 'Every colony' && L[0].subs.includes('✓ chosen') && (await txt(sc, '#pp-add')) === '+ New colony', JSON.stringify(L));
await sc.click('#pp-add'); await sc.click('#pp-save'); const noName = await txt(sc, '#pp-out');
check('…"+ New colony" without a name says so, in red', noName === '✗ Write the colony\'s name.' && await red(sc, '#pp-out'), noName);
await sc.fill('#pp-name', 'colony Marina'); await sc.click('#pp-save'); await sc.waitForSelector('#campaign.on');
check('…with its name, it is kept and chosen: back on the form, on its button, in its colour', (await txt(sc, '#k-col')) === 'COLONY MARINA' && await sc.$eval('#k-col', b => b.classList.contains('set') && !!b.style.getPropertyValue('--h')));
await sc.click('#k-par'); await sc.waitForSelector('#spick.on');
check('"Choose partner" with none yet says so, and offers "+ New partner"', /No partners yet/.test(await txt(sc, '#pp-list')) && (await txt(sc, '#pp-add')) === '+ New partner');
await sc.click('#pp-add'); const pk0 = await sc.$$eval('#pp-kind button', bs => bs.map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join()), does0 = await sc.$$eval('#pp-does button.on', bs => bs.map(b => b.textContent).join());
check('…a new partner for food is a shop, and a shop confirms food and other things', pk0 === 'clinic,shop*,other' && does0 === 'food,other', pk0 + ' · ' + does0);
await fits(sc, 'a new partner'); await shot(sc, 'kd-3-new-partner');
const off = await sc.evaluate(() => { for (let i = 1; ; i++) { const k = '02' + i.toString(16).padStart(64, '0'); if (!window.scCore.pointOk(k)) return k; } });
await sc.fill('#pp-name', 'Pienso Sur'); await sc.fill('#pp-key', off); await sc.click('#pp-save'); const offSaid = await txt(sc, '#pp-out');
check('…66 hex characters that are not a point of the curve are no key: refused, in red (what is locked to one could only be refunded)', /^✗ This is not a public key/.test(offSaid) && await red(sc, '#pp-out') && await sc.isVisible('#spick'), offSaid);
await sc.fill('#pp-key', scPk); await sc.click('#pp-save'); const ownSaid = await txt(sc, '#pp-out');
check('…nor is Streetcat\'s own key', /^✗ That is Streetcat's own key/.test(ownSaid) && await red(sc, '#pp-out'), ownSaid);
await sc.fill('#pp-key', shopPk); await sc.click('#pp-save'); await sc.waitForSelector('#campaign.on'); let K = await keyLines(sc, '#k-keys');
check('…with its key, it is kept and chosen: its name on the button, its key in blue under Streetcat\'s, named', (await txt(sc, '#k-par')) === 'PIENSO SUR' && K.length === 2 && K[0].text === scPk && K[1].label === 'Pienso Sur · shop' && K[1].text === shopPk && K[1].role === 'clinic', K.map(k => k.label).join(' · '));
await sc.fill('#k-name', 'COMIDA MARINA'); await sc.fill('#k-mint', MINT); await sc.click('#k-go'); let made = await waitText(sc, '#k-out', /is ready|cannot|✗/, 30000); const L1 = (made.match(/http\S+#c=\S+/) || [])[0];
const c1 = await camp(sc), sig1 = await sc.evaluate(c => window.scCore.campaignSig(c), c1.c);
check('the pot is made: food, for colony Marina, confirmed by Pienso Sur, a shop; signed with the rest', /Campaign COMIDA MARINA is ready/.test(made) && c1.c.type === 'food' && c1.c.colony === 'colony Marina' && c1.c.partner === 'Pienso Sur' && c1.c.pkind === 'shop' && c1.c.clinic === shopPk && c1.c.op === 'food' && sig1 === 'signed', `${c1.c.type} · ${c1.c.colony} · ${c1.c.partner} · ${c1.c.pkind} · ${sig1}`);
await sc.click('#hd-back'); await sc.waitForSelector('#skind.on'); L = await lines(sc, '#kd-pots');
check('back on Food, the pot is listed: its colony, its partner, its days left, what it was given and has to spend', L.length === 1 && L[0].title === 'COMIDA MARINA' && /^colony Marina · Pienso Sur · 3[01] days left$/.test(L[0].subs[0]) && L[0].subs[1] === '0 sat given · 0 sat to spend', JSON.stringify(L));
// a second food pot of the same shop, the same day, for another colony
await sc.click('#kd-camp'); await sc.waitForSelector('#campaign.on');
check('the next food campaign starts with that shop as its partner', (await txt(sc, '#k-par')) === 'PIENSO SUR');
await sc.fill('#k-name', 'COMIDA PLAYA'); await sc.click('#k-col'); await sc.waitForSelector('#spick.on'); await sc.click('#pp-add'); await sc.fill('#pp-name', 'colony Playa'); await sc.click('#pp-save'); await sc.waitForSelector('#campaign.on');
await sc.fill('#k-mint', MINT); await sc.click('#k-go'); made = await waitText(sc, '#k-out', /is ready|cannot|✗/, 30000); const L2 = (made.match(/http\S+#c=\S+/) || [])[0]; const c2 = await camp(sc);
check('two pots of one shop made the same day lock differently: the second refunds one second earlier, on the same date', /is ready/.test(made) && c2.c.clinic === c1.c.clinic && c2.c.deadline === c1.c.deadline - 1 && new Date(c2.c.deadline * 1000).toISOString().slice(0, 10) === in30, `${c1.c.deadline} · ${c2.c.deadline}`);
// a sterilisation pot: the clinic, added; the shop in grey
await tab(sc, 'home'); await sc.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await sc.click('#kd-camp'); await sc.waitForSelector('#campaign.on'); await sc.fill('#k-name', 'TNR MARINA');
await sc.click('#k-col'); await sc.waitForSelector('#spick.on'); L = await lines(sc, '#pp-list');
check('the colonies list says, for each, its pots of this kind', L.map(l => l.title).join() === 'Every colony,colony Marina,colony Playa' && L[1].subs[0] === 'no sterilisation pots yet', L.map(l => `${l.title}: ${l.subs.join(' / ')}`).join(' · '));
await pick(sc, 'colony Marina'); await sc.waitForSelector('#campaign.on'); await sc.click('#k-par'); await sc.waitForSelector('#spick.on'); L = await lines(sc, '#pp-list');
check('a partner that does not do the kind is in grey, says so, and cannot be chosen', L.length === 1 && L[0].title === 'Pienso Sur' && L[0].grey && L[0].subs.includes('does not do sterilisation'), JSON.stringify(L));
await sc.locator('#pp-list button.req', { hasText: 'Pienso Sur' }).click(); await sc.waitForTimeout(300);
check('…a tap on it does nothing', await sc.isVisible('#spick') && !(await sc.isVisible('#campaign')));
await sc.click('#pp-add'); const pk1 = await sc.$$eval('#pp-kind button.on', bs => bs.map(b => b.textContent).join());
await sc.fill('#pp-name', 'Clínica Puerto'); await sc.fill('#pp-key', clinicPk); await sc.click('#pp-save'); await sc.waitForSelector('#campaign.on');
await sc.fill('#k-mint', MINT); await sc.click('#k-go'); made = await waitText(sc, '#k-out', /is ready|cannot|✗/, 30000); const L3 = (made.match(/http\S+#c=\S+/) || [])[0]; const c3 = await camp(sc);
check('…a new partner for sterilisation is a clinic; the pot names it', pk1 === 'clinic' && c3.c.type === 'sterilisation' && c3.c.partner === 'Clínica Puerto' && c3.c.pkind === 'clinic' && c3.c.clinic === clinicPk, `${pk1} · ${c3.c.partner} ${c3.c.pkind}`);

// a donor gives to each pot, from the app; Rescue receives them, each in its own pot
const give = async (link, n) => { await donor.goto(link); await donor.reload(); await donor.evaluate(() => window.__vetlock.openTab('decash')); await donor.fill('#d-token', await plain(n)); await donor.click('#d-go');
  const s = await waitText(donor, '#d-out', /LOCKED|Failed|✗/, 30000); if (!/LOCKED/.test(s)) throw new Error(s); await donor.locator('#d-out button', { hasText: 'send it to Streetcat' }).click(); await waitText(donor, '#d-out .send-sc', /sent to Streetcat|relay|copy/, 20000); };
await give(L2, 5000); await give(L1, 21000); await give(L1, 21000); await give(L3, 30000);
await tab(sc, 'home'); await sc.locator('#h-kinds button.tile', { hasText: 'Food' }).click(); await sc.locator('#kd-pots button.req', { hasText: 'COMIDA MARINA' }).click(); await sc.locator('#kd-pots .row2 button', { hasText: 'donations and requests' }).click();
await sc.click('#sc-check'); await waitText(sc, '#sc-net', /checked/, 30000);
check('the pot\'s screen names its kind, colony and partner', /^food · colony Marina · Pienso Sur · 3[01] days left$/.test(await txt(sc, '#sc-head .mut')), await txt(sc, '#sc-head .mut'));
await tab(sc, 'home'); await sc.locator('#h-kinds button.tile', { hasText: 'Food' }).click(); L = await lines(sc, '#kd-pots');
const given = Object.fromEntries(L.map(l => [l.title, l.subs[1]]));
check('each donation is in its own pot, though both pots are the same shop\'s and of the same day', given['COMIDA MARINA'] === '42 000 sat given · 42 000 sat to spend' && given['COMIDA PLAYA'] === '5 000 sat given · 5 000 sat to spend', JSON.stringify(given));
await fits(sc, 'a kind with its pots'); await shot(sc, 'kd-4-food');

// A FOOD REQUEST: what, not a cat; the colony brings its one food pot, the pot its shop; the cost takes the pot's donations
await sc.click('#kd-req'); await sc.waitForSelector('#snew.on');
check('a food request asks what it is, not a cat: no cat, no photos; with two food pots, none is chosen for it', await sc.isHidden('#sn-catbox') && (await txt(sc, '#sn-proc-l')) === 'What' && (await txt(sc, '#sn-pot')) === 'Choose pot' && (await sc.$$eval('#sn-type button.on', bs => bs.map(b => b.textContent).join())) === 'food');
await sc.fill('#sn-proc', '20 kg dry feed'); await sc.fill('#sn-cost', '18000'); await sc.click('#sn-col'); await pick(sc, 'colony Marina'); await sc.waitForSelector('#snew.on');
const cover = await waitText(sc, '#sn-cover', /✓|✗/, 30000); K = await keyLines(sc, '#sn-keys');
check('choosing colony Marina brings its one food pot, and the pot its shop, with its key; "Send to Pienso Sur"', (await txt(sc, '#sn-col')) === 'COLONY MARINA' && (await txt(sc, '#sn-pot')) === 'COMIDA MARINA · 42 000 sat' && K.length === 2 && K[1].label === 'Pienso Sur · shop' && K[1].text === shopPk && (await txt(sc, '#sn-go')) === 'Send to Pienso Sur', `${await txt(sc, '#sn-pot')} · ${K.map(k => k.label).join(' / ')}`);
const uses = await sc.$$eval('#sn-dons input', xs => xs.map(x => x.value));
check('the cost takes the pot\'s donations, the oldest first, the last one in part; the line under the pot says it is covered', cover === '18 000 of 18 000 sat ✓ · from COMIDA MARINA · 1 donation' && uses.join() === '18000,', `${cover} · ${uses.join(' / ')}`);
await fits(sc, 'a food request'); await shot(sc, 'kd-5-request');
await sc.click('#sn-pot'); await sc.waitForSelector('#spick.on'); L = await lines(sc, '#pp-list');
check('"Choose pot": the one that can pay it first, enough and chosen; in grey the others, and why', L.map(l => l.title + (l.grey ? '·grey' : '')).join() === 'COMIDA MARINA,COMIDA PLAYA·grey,TNR MARINA·grey' && /42 000 sat to spend ✓ enough/.test(L[0].subs[1]) && L[0].subs.includes('✓ chosen') && L[1].subs[1] === 'another colony: colony Playa' && L[2].subs[1] === 'another kind: sterilisation', L.map(l => `${l.title}: ${l.subs.join(' / ')}`).join(' · '));
await fits(sc, 'the pots to choose'); await shot(sc, 'kd-6-pots');
await sc.click('#hd-back'); await sc.waitForSelector('#snew.on'); await waitText(sc, '#sn-cover', /✓|✗/, 30000);
await sc.fill('#sn-cost', '50000'); const short = await waitText(sc, '#sn-cover', /✗/, 10000);
check('more than the pot holds: said in red, and it cannot be sent', /^✗ 42 000 of 50 000 sat in COMIDA MARINA: choose another pot, or wait for donations$/.test(short) && await red(sc, '#sn-cover') && await sc.$eval('#sn-go', b => b.disabled), short);
await sc.fill('#sn-cost', '18000'); await waitText(sc, '#sn-cover', /✓/, 10000); await sc.click('#sn-go');
const steps = await waitText(sc, '#sq-steps', /sent · \d of 2/, 30000), dl = await txt(sc, '#sq-dl');
check('sent to the shop by relay; the request says what and for which colony, and names the shop', /sent · 2 of 2/.test(steps) && /received by Pienso Sur/.test(steps) && /answered by Pienso Sur/.test(steps) && dl.startsWith('Forcolony MarinaWhat20 kg dry feed') && (await txt(sc, '#sq-go')) === 'Release, once Pienso Sur confirms' && (await txt(sc, '#sq-qra')) === 'Pienso Sur offline? Show it as QR', `${dl.slice(0, 50)} · ${await txt(sc, '#sq-go')}`);
await tab(sc, 'home'); const food = (await sc.$$eval('#h-kinds button.tile', bs => bs.map(b => [...b.querySelectorAll('.sub2')].map(s => s.textContent).join(' | '))))[2];
check('Home counts it: the food pots, the request, and what is left to spend', food === '2 pots · 1 request | 29 000 sat to spend', food);
await sc.locator('#h-kinds button.tile', { hasText: 'Food' }).click(); L = await lines(sc, '#kd-reqs');
check('the kind\'s screen lists the request: what, for which colony, how much from which pot, and how far it is', L.length === 1 && L[0].title === '20 kg dry feed' && L[0].subs[0] === 'colony Marina · 18 000 sat from COMIDA MARINA' && /^· (sent|received)/.test(L[0].subs[1]), JSON.stringify(L));
const atShop = await (async () => { await tab(shop, 'work'); await shop.click('#w-check'); return waitText(shop, '#w-list', /20 kg dry feed/, 30000); })();
check('…and it reaches the shop\'s phone', /20 kg dry feed/.test(atShop), atShop.slice(0, 80));
// a sterilisation request: the cat and its photos again; its one pot comes by itself
await tab(sc, 'home'); await sc.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); await sc.click('#kd-req'); await sc.waitForSelector('#snew.on');
check('a sterilisation request asks for the cat, its photos and the procedure; its one pot comes by itself, with its colony', await sc.isVisible('#sn-cat') && await sc.isVisible('#sn-shots') && (await txt(sc, '#sn-proc-l')) === 'Procedure' && (await txt(sc, '#sn-pot')).startsWith('TNR MARINA') && (await txt(sc, '#sn-col')) === 'COLONY MARINA');

// THE DONOR: the same four kinds, two by two, none chosen: all of them
await donor.goto(BASE + 'index.html'); await donor.click('#d-check'); await donor.waitForFunction(() => document.querySelectorAll('#d-reqs button.req').length === 3, null, { timeout: 30000 }).catch(() => {}); await settled(donor, '#d-reqs');
const dk = await donor.$$eval('#d-kinds button', bs => bs.map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, on: b.classList.contains('on'), y: Math.round(r.y) }; }));
let D = await lines(donor, '#d-reqs');
check('the donor sees the same four kinds two by two, none chosen (no "all"), and every open pot', dk.map(x => x.t).join() === 'sterilisation,vet care,food,other' && !dk.some(x => x.on) && dk[0].y === dk[1].y && dk[2].y > dk[0].y && D.length === 3, dk.map(x => x.t).join() + ' · ' + D.map(d => d.title).join());
const dm = D.find(d => d.title === 'COMIDA MARINA') || { subs: [] };
check('…each pot with what it pays for, its colony and the days left, and what its requests pay for', /^food · colony Marina · 3[01] days left$/.test(dm.subs[0]) && dm.subs[1] === '· colony Marina · 20 kg dry feed · requested', dm.subs.join(' / '));
await fits(donor, 'the donor\'s list'); await shot(donor, 'kd-7-donor');
await donor.locator('#d-kinds button', { hasText: 'food' }).click(); await donor.waitForTimeout(300); await settled(donor, '#d-reqs'); D = await lines(donor, '#d-reqs');
check('a kind tapped shows only its pots', D.map(d => d.title).sort().join() === 'COMIDA MARINA,COMIDA PLAYA' && (await txt(donor, '#d-reqs > .mut')) === '2 open requests from Streetcat · food · tap one' && await donor.$eval('#d-kinds button.on', b => b.textContent) === 'food', await txt(donor, '#d-reqs > .mut'));
await donor.locator('#d-kinds button', { hasText: 'vet care' }).click(); await donor.waitForTimeout(300); await settled(donor, '#d-reqs'); const none = await txt(donor, '#d-reqs > .mut');
check('…a kind with nothing open says so, and not in red', none === 'Nothing open for vet care right now.' && !(await red(donor, '#d-reqs > .mut')), none);
await donor.locator('#d-kinds button', { hasText: 'vet care' }).click(); await donor.waitForTimeout(300); await settled(donor, '#d-reqs');
check('…tapped again, all of them again', (await lines(donor, '#d-reqs')).length === 3 && !(await donor.$('#d-kinds button.on')));

// a campaign made before the kinds pays for what its operation said: under Sterilisation, for every colony
await sc.evaluate(c => { const a = JSON.parse(localStorage.getItem('vetlock.campaigns')); const { type, colony, partner, pkind, sig, ...old } = c.c; a.unshift({ slug: 'old-tnr', link: '', created: 1, c: { ...old, name: 'OLD TNR', op: 'castration', deadline: c.c.deadline - 86400 } }); localStorage.setItem('vetlock.campaigns', JSON.stringify(a)); }, c3);
await sc.reload(); await tab(sc, 'home'); await sc.locator('#h-kinds button.tile', { hasText: 'Sterilisation' }).click(); L = await lines(sc, '#kd-pots');
const old = L.find(l => l.title === 'OLD TNR');
check('a campaign made before the kinds is listed under what its operation says, for every colony', !!old && /^every colony · Clínica Puerto · /.test(old.subs[0]), old ? old.subs.join(' / ') : L.map(l => l.title).join());

check('these screens fit at 320, 375, 390 and 430 px', !FIT.length, FIT.join(' · '));
say(bad ? `kinds: ${bad} check(s) failed` : 'kinds: every check passed');
await b.close(); for (const r of relays) await r.close(); process.exit(bad ? 1 : 0);
