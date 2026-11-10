// The service worker's version (review of 9 Nov): sw.js's BUILD is the hash of the files it keeps (tools/stamp-sw.mjs), so a change to
// any of them makes a new version, fetched whole before it is used. Fails when a file changed and `node tools/stamp-sw.mjs` was not run.
import fs from 'fs';
import { APP, stampOf, shellOf } from '../tools/stamp-sw.mjs';
const say = (...a) => console.log(...a); let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const sw = fs.readFileSync(APP + 'sw.js', 'utf8'), m = sw.match(/const BUILD = '([0-9a-f]*)';/), files = shellOf(sw);
check('every file the service worker keeps is there', files.every(f => fs.existsSync(APP + f)), files.filter(f => !fs.existsSync(APP + f)).join(', '));
const now = stampOf();
check('sw.js says the version of those files (after changing one: node tools/stamp-sw.mjs)', !!m && m[1] === now, `sw.js ${m && m[1]} · the files ${now}`);
// NOTHING OF THE DEMO BUILD IS HERE (audit of 10 Nov). The branch dest-demo adds app/demo.js, which takes any key for Streetcat's and
// talks to a test mint: it must never reach this branch or main, and nothing but this check would stop a merge. The pages load the
// scripts they are known to load and no other, and the one pinned key is the published one.
const pages = { 'index.html': ['cashu-bundle.js', 'catid.js', 'core.js', 'fit.js', 'index.js', 'nostr-bundle.js', 'qrcode.min.js', 'relay.js'], 'status.html': ['cashu-bundle.js', 'core.js', 'fit.js', 'nostr-bundle.js', 'relay.js', 'status.js'] };
const loaded = f => [...fs.readFileSync(APP + f, 'utf8').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(x => x[1].split('?')[0]).sort();
const odd = Object.entries(pages).flatMap(([f, want]) => loaded(f).filter(x => !want.includes(x)).map(x => `${f} loads ${x}`)), inline = Object.keys(pages).filter(f => /<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/.test(fs.readFileSync(APP + f, 'utf8')));
check('the pages load only their own scripts, and none written into the page', !odd.length && !inline.length, [...odd, ...inline.map(f => f + ' has a script written into it')].join('; ') || Object.entries(pages).map(([f]) => `${f}: ${loaded(f).length}`).join(' · '));
const src = fs.readdirSync(APP).filter(f => /\.(js|mjs|html|json)$/.test(f) && !/bundle|\.min\./.test(f)), marks = [/SC_DEMO/, /vercel\.run/, /published\s*=\s*\(\)\s*=>/, /STREETCAT_KEYS\.length\s*=/, /DEMO ONLY/];
const found = src.flatMap(f => marks.filter(re => re.test(fs.readFileSync(APP + f, 'utf8'))).map(re => `${f}: ${re.source}`));
check('nothing of the demo build is in the app (no demo.js, no key taken for Streetcat\'s but the pinned one)', !fs.existsSync(APP + 'demo.js') && !found.length, fs.existsSync(APP + 'demo.js') ? 'app/demo.js is here' : found.join('; '));
const pinned = (fs.readFileSync(APP + 'core.js', 'utf8').match(/const STREETCAT_KEYS = (\[[^\]\n]*\]);/) || [])[1] || '';
check('one key is pinned as Streetcat\'s: the published one', pinned === "['0294637dacb6799343eacb4654700ad781694838b8b6db80551d17af001b194121']" && /const published = k => STREETCAT_KEYS\.includes\(lc\(k\)\);/.test(fs.readFileSync(APP + 'core.js', 'utf8')), pinned);
say(bad ? `sw: ${bad} check(s) failed` : 'sw: every check passed'); process.exit(bad ? 1 : 0);
