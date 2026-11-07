// Moving the keys from one browser to another on the same phone (StreetCat, 7 Nov: from Safari to the app on the home screen, which keeps
// its own storage: «No funciona así… me pone JSON, no sé qué»). An iPhone lets a page copy only while the tap counts, so the export is
// copied at once, before the keys type themselves out; if the phone still refuses, the export stays in the box, selected, with a red line
// that says so. Import takes the box, or what was copied when the box is empty; it accepts the curly quotes a phone may put in, and says
// in red, on the page, what is wrong (public keys only, not an export, nothing pasted). A browser with no keys exports nothing, and an
// export with no keys in it imports nothing (StreetCat, 7 Nov, 22:51: «No se importan»: an empty export had said «Imported»). Every ✗ in red (colors.mjs).
import { chromium } from 'playwright';
import { pinBrowser } from './pin.mjs';
const BASE = 'http://127.0.0.1:8080/', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const b = pinBrowser(await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const page = async ({ clip = true, refuse = false } = {}) => { const c = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, ...(clip ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}) });
  if (refuse) await c.addInitScript(() => { try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('NotAllowedError')), readText: () => Promise.reject(new Error('NotAllowedError')) } }); document.execCommand = () => false; } catch (_) {} });  /* as an iPhone does, once the tap no longer counts */
  const p = await c.newPage(); p.on('pageerror', e => say('PAGEERROR', e.message)); p.on('dialog', d => { say('DIALOG', d.message()); d.accept(); }); await p.goto(BASE + 'index.html'); return p; };
const tab = (p, t) => p.evaluate(t => window.__vetlock.openTab(t), t), txt = async (p, s) => ((await p.textContent(s)) || '').trim();
const waitText = async (p, s, re, ms = 30000) => { const t0 = Date.now(); let x = ''; while (Date.now() - t0 < ms) { x = await txt(p, s).catch(() => ''); if (re.test(x)) return x; await p.waitForTimeout(150); } return x; };
const red = (p, s) => p.$eval(s, e => getComputedStyle(e).color === (() => { const i = document.createElement('i'); i.style.color = 'var(--bad)'; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; })());
const held = (p, r) => p.evaluate(r => window.__vetlock.heldKeys(r).map(k => window.__vetlock.pubOf(k)), r);

// Safari: Streetcat's key and a clinic key
const safari = await page();
await tab(safari, 'release'); await safari.click('#s-new'); await safari.waitForTimeout(500); await tab(safari, 'csettings'); await safari.click('#cs-new'); await safari.waitForTimeout(500);
const want = { streetcat: (await held(safari, 'streetcat'))[0], clinic: (await held(safari, 'clinic'))[0] };
await tab(safari, 'keys'); await safari.click('#x-exp'); const said = await waitText(safari, '#x-term', /in your clipboard/, 20000);
const copied = await safari.evaluate(() => navigator.clipboard.readText()); let exp = null; try { exp = JSON.parse(copied); } catch (_) {}
check('Export copies the whole export at once (while the tap counts), and says so once the keys have typed out', !!exp && !!exp.streetcat && !!exp.clinic && /in your clipboard/.test(said), said.slice(-90));
// the home screen's app: its own storage, no keys; the box empty, Import takes what was copied
const home = await page();
await tab(home, 'keys'); check('the other browser has no keys of its own yet', !(await held(home, 'streetcat')).length);
await home.evaluate(t => navigator.clipboard.writeText(t), copied); await home.click('#x-imp'); const imp = await waitText(home, '#x-out', /Imported|✗/, 10000);
check('…with the box empty, Import keys takes what was copied: Streetcat\'s key and the clinic\'s are there', /^Imported\. The keys this browser had before are kept too/.test(imp) && (await held(home, 'streetcat')).includes(want.streetcat) && (await held(home, 'clinic')).includes(want.clinic), imp.slice(0, 60));
check('…and the box is emptied, and it says to copy something else (no keys left in the clipboard)', (await home.inputValue('#x-box')) === '' && /Copy something else now/.test(imp) && !(await red(home, '#x-out')));
// curly quotes, as a phone may put in, and words around the export
const curly = (exp ? JSON.stringify(exp) : '{}').replace(/"([^"]*)":/g, '“$1”:').replace(/:"([^"]*)"/g, ':“$1”');
const third = await page(); await tab(third, 'keys'); await third.fill('#x-box', 'my keys ' + curly + ' end'); await third.click('#x-imp'); const imp2 = await waitText(third, '#x-out', /Imported|✗/, 10000);
check('an export with curly quotes and words around it imports too', /^Imported/.test(imp2) && (await held(third, 'streetcat')).includes(want.streetcat), imp2.slice(0, 60));
// what is not an export: said on the page, in red, no dialog (in a browser that may not read what was copied, so the box is all there is)
const empty = await page({ clip: false }); await tab(empty, 'keys');
await empty.fill('#x-box', `Streetcat\n${want.streetcat}\nclinic\n${want.clinic}`); await empty.click('#x-imp'); const pub = await waitText(empty, '#x-out', /✗/, 5000);
check('public keys only (the lines on screen, copied by hand): it says those are public keys, in red', /^✗ Those are public keys: an export carries the private ones/.test(pub) && await red(empty, '#x-out'), pub.slice(0, 70));
await empty.fill('#x-box', 'JSON, no sé qué'); await empty.click('#x-imp'); const junk = await waitText(empty, '#x-out', /✗/, 5000);
check('…anything else: it is not an export, nothing imported, in red', /^✗ This is not an export of keys: nothing imported/.test(junk) && await red(empty, '#x-out'), junk.slice(0, 60));
await empty.fill('#x-box', ''); await empty.click('#x-imp'); const none = await waitText(empty, '#x-out', /✗/, 5000);
check('…nothing pasted, and nothing it may read: paste an export first, in red', /^✗ Paste an export first/.test(none) && await red(empty, '#x-out'), none);
// StreetCat, 7 Nov, 22:52: the app on his home screen had no keys; Export keys there had put its own empty export in the box, and Import
// keys took it and said «Imported». Now a browser with no keys exports nothing (the box stays empty, a red line says why); with an
// export with no keys in the box, Import keys takes what was copied; and an export with no keys in it imports nothing, and says so.
const fresh = await page(); await tab(fresh, 'keys'); await fresh.evaluate(t => navigator.clipboard.writeText(t), copied);
await fresh.click('#x-exp'); const nokeys = await waitText(fresh, '#x-out', /✗/, 5000), still = await fresh.evaluate(() => navigator.clipboard.readText());
check('a browser with no keys exports nothing: the box stays empty, what was copied stays, a red line says why', /^✗ This browser has no keys yet: nothing to export/.test(nokeys) && await red(fresh, '#x-out') && (await fresh.inputValue('#x-box')) === '' && still === copied, nokeys.slice(0, 60));
const emptyExp = JSON.stringify({ clinic: null, clinicOld: [], streetcat: null, streetcatOld: [], donor: null, donorKeys: [] }, null, 1);
await fresh.fill('#x-box', emptyExp); await fresh.click('#x-imp'); const took = await waitText(fresh, '#x-out', /Imported|✗/, 10000);
check('an empty export in the box and the real one copied: Import keys takes what was copied', /^Imported/.test(took) && (await held(fresh, 'streetcat')).includes(want.streetcat) && (await held(fresh, 'clinic')).includes(want.clinic), took.slice(0, 60));
check('…and «no keys in this browser yet», typed over the box by Export keys, goes', await fresh.evaluate(() => !document.querySelector('#x-term .term-text')));
await empty.fill('#x-box', emptyExp); await empty.click('#x-imp'); const noIn = await waitText(empty, '#x-out', /✗/, 5000);
check('…and where nothing copied may be read: an export with no keys in it imports nothing, and says so in red', /^✗ This export has no keys in it: nothing imported/.test(noIn) && await red(empty, '#x-out') && !(await held(empty, 'streetcat')).length && !(await held(empty, 'clinic')).length, noIn.slice(0, 60));
// a phone that does not let the page copy it at all: the export in the box, selected, and a red line
const iphone = await page({ refuse: true }); await tab(iphone, 'release'); await iphone.click('#s-new'); await iphone.waitForTimeout(500); await tab(iphone, 'keys'); await iphone.click('#x-exp');
const refused = await waitText(iphone, '#x-out', /✗/, 20000), sel = await iphone.evaluate(() => { const t = document.getElementById('x-box'); return { shown: !document.querySelector('#x-term .term-text'), all: t.selectionStart === 0 && t.selectionEnd === t.value.length && t.value.length > 0, json: (() => { try { return !!JSON.parse(t.value).streetcat; } catch (_) { return false; } })() }; });
check('where the phone refuses to copy: the export stays in the box, selected, and a red line says to copy it by hand', /^✗ This phone did not let the page copy it/.test(refused) && await red(iphone, '#x-out') && sel.shown && sel.all && sel.json, refused.slice(0, 60) + ' · ' + JSON.stringify(sel));
say(bad ? `keymove: ${bad} check(s) failed` : 'keymove: every check passed');
await b.close(); process.exit(bad ? 1 : 0);
