// After the suites: every error, warning or odd state their pages showed (tests/colors.mjs, recorded in every browser suite run with
// COLORS_DIR set) must have been in the app's bad colour, var(--bad). Fails on any that was not, and names it, its page and the suite.
import fs from 'fs';
import path from 'path';
const DIR = process.env.COLORS_DIR, say = (...a) => console.log(...a);
if (!DIR || !fs.existsSync(DIR)) { say('colors: no records (run the browser suites with COLORS_DIR set first)'); process.exit(1); }
const all = []; for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort()) for (const r of JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))) all.push({ ...r, suite: f.replace(/\.json$/, '') });
const by = new Map(); for (const r of all) { const k = r.text.replace(/\d+/g, '#').slice(0, 70); const was = by.get(k); if (!was || (was.red && !r.red)) by.set(k, r); }
const notRed = [...by.values()].filter(r => !r.red), suites = new Set(all.map(r => r.suite));
say(`colors: ${by.size} different errors, warnings and odd states seen in ${suites.size} suites (${[...suites].join(', ')})`);
for (const r of [...by.values()].sort((a, b) => a.red - b.red || a.text.localeCompare(b.text))) say(`${r.red ? '✓ red ' : '✗ NOT RED'} · ${r.page} · ${r.suite} · ${r.text.slice(0, 110)}${r.red ? '' : ' · ' + r.color}`);
say(notRed.length ? `colors: ${notRed.length} not in the bad colour` : 'colors: every check passed'); process.exit(notRed.length ? 1 : 0);
