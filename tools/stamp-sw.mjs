// The version of the app's shell, written into app/sw.js: the first 12 hex digits of SHA-256 over the files sw.js keeps (its SHELL, in
// order, each with its name; and vercel.json, whose headers the cached responses keep). A new version is then a new cache, filled whole before the app uses it, and never a mix of two (review of
// 9 Nov). Run `node tools/stamp-sw.mjs` before committing a change to any of those files: tests/sw_test.mjs fails when it was not run.
// `stampOf(dir)` works on another copy of the app too (the update test makes one).
import fs from 'fs';
import crypto from 'crypto';
export const APP = new URL('../app/', import.meta.url).pathname;
export const shellOf = sw => JSON.parse(sw.match(/const SHELL = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
export function stampOf(dir = APP){ const sw = fs.readFileSync(dir + 'sw.js', 'utf8'), h = crypto.createHash('sha256');
  h.update(sw.replace(/const BUILD = '[0-9a-f]*';/, "const BUILD = '';") + '\0');  /* the service worker itself too, without its own stamp */
  for (const f of shellOf(sw)) { h.update(f + '\0'); h.update(fs.readFileSync(dir + f)); h.update('\0'); }
  if (fs.existsSync(dir + 'vercel.json')) { h.update('vercel.json\0'); h.update(fs.readFileSync(dir + 'vercel.json')); }  /* the headers too (the CSP): a cached response keeps those of its version */
  return h.digest('hex').slice(0, 12); }
export function stamp(dir = APP){ const sw = fs.readFileSync(dir + 'sw.js', 'utf8'), s = stampOf(dir), next = sw.replace(/const BUILD = '[0-9a-f]*';/, `const BUILD = '${s}';`);
  if (!/const BUILD = '[0-9a-f]*';/.test(sw)) throw new Error('sw.js has no BUILD line');
  if (next !== sw) fs.writeFileSync(dir + 'sw.js', next); return { stamp: s, written: next !== sw }; }
if (import.meta.url === `file://${process.argv[1]}`) { const r = stamp(); console.log('sw.js BUILD', r.stamp, r.written ? '(written)' : '(as it was)'); }
