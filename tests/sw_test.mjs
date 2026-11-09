// The service worker's version (review of 9 Nov): sw.js's BUILD is the hash of the files it keeps (tools/stamp-sw.mjs), so a change to
// any of them makes a new version, fetched whole before it is used. Fails when a file changed and `node tools/stamp-sw.mjs` was not run.
import fs from 'fs';
import { APP, stampOf, shellOf } from '../tools/stamp-sw.mjs';
const say = (...a) => console.log(...a); let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const sw = fs.readFileSync(APP + 'sw.js', 'utf8'), m = sw.match(/const BUILD = '([0-9a-f]*)';/), files = shellOf(sw);
check('every file the service worker keeps is there', files.every(f => fs.existsSync(APP + f)), files.filter(f => !fs.existsSync(APP + f)).join(', '));
const now = stampOf();
check('sw.js says the version of those files (after changing one: node tools/stamp-sw.mjs)', !!m && m[1] === now, `sw.js ${m && m[1]} · the files ${now}`);
say(bad ? `sw: ${bad} check(s) failed` : 'sw: every check passed'); process.exit(bad ? 1 : 0);
