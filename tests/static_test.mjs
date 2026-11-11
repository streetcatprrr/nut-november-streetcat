// Static checks (11 Nov): the code is read, not run. There is no contract here for a tool like Slither to read (the app is JavaScript,
// the mint's rule is Python), so this does the same kind of work with what fits:
//   1 · the app's own scripts and pages are searched for the calls through which text from outside could become code or markup
//       (innerHTML and its kin, eval, new Function, timers given text, document.write, javascript: links). Each use must be on the
//       short list below, with its reason; a new one fails until it is looked at and listed.
//   2 · nothing in the app's own code writes a private key into an address, a link or a query.
//   3 · the Python of the mint patch is given to ruff (security rules, undefined names, syntax), if ruff is installed here.
// Needs nothing running. Not a proof: it finds patterns, not meanings.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawnSync } from 'child_process';
const ROOT = new URL('../', import.meta.url).pathname, APP = ROOT + 'app/', say = (...a) => console.log(...a);
let bad = 0; const check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
const own = fs.readdirSync(APP).filter(f => /\.(js|mjs|html)$/.test(f) && !/bundle|\.min\./.test(f)).sort(), lines = Object.fromEntries(own.map(f => [f, fs.readFileSync(APP + f, 'utf8').split('\n')]));

// 1 · where text could become code or markup
const SINKS = [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function\b/, /set(?:Timeout|Interval)\s*\(\s*['"`]/, /\.srcdoc\b/, /javascript:/i, /createContextualFragment/, /\bDOMParser\b/, /\bimportScripts\b/, /\.setAttribute\(\s*['"]on/i];
// the uses that were looked at: file, what the line must contain, and why it is safe
const KNOWN = [['index.js', 'box.innerHTML = q.createSvgTag(', 'the QR code: markup made by the QR library from the text to encode, which only ever becomes the size and place of squares']];
const found = []; for (const f of own) lines[f].forEach((line, i) => { for (const re of SINKS) if (re.test(line)) found.push({ f, n: i + 1, re: re.source, line }); });
const listed = x => KNOWN.some(([f, has]) => f === x.f && x.line.includes(has)), unknown = found.filter(x => !listed(x)), unused = KNOWN.filter(([f, has]) => !found.some(x => x.f === f && x.line.includes(has)));
check(`no call through which text from outside could become code or markup, but the ${KNOWN.length} looked at (${own.length} files read)`, !unknown.length, unknown.map(x => `${x.f}:${x.n} ${x.re}: ${x.line.trim().slice(0, 140)}`).join(' | ') || found.map(x => `${x.f}:${x.n}`).join(', '));
check('every use on the list is still in the code (a list that outlives its code hides the next one)', !unused.length, unused.map(x => x[0] + ': ' + x[1]).join(' | '));

// 2 · a private key never goes into an address, a link or a query
const leaks = []; for (const f of own) lines[f].forEach((line, i) => { if (/(location\.(href|hash|search)\s*=|history\.(push|replace)State\(|searchParams\.set\(|encodeURIComponent\()[^;]*\b(sk|privkey|secretKey|nsec)\b/.test(line)) leaks.push(`${f}:${i + 1} ${line.trim().slice(0, 140)}`); });
check('no private key is written into an address, a link or a query', !leaks.length, leaks.join(' | '));

// 3 · the mint patch's Python, read by ruff
const patch = fs.readFileSync(ROOT + 'mint/nutshell-0.21.0-dest.patch', 'utf8'), at = patch.indexOf('+++ b/cashu/mint/dest.py'), end = patch.indexOf('\ndiff -ruN', at);
const py = patch.slice(at, end < 0 ? undefined : end).split('\n').slice(2).filter(l => l.startsWith('+')).map(l => l.slice(1)).join('\n') + '\n';
check('the rule\'s own file is whole in the patch', py.includes('class LedgerDestConditions') && py.includes('def _verify_dest_main_path') && py.length > 8000, `${py.split('\n').length} lines`);
const has = spawnSync('ruff', ['--version'], { encoding: 'utf8' });
if (has.status !== 0) say('· ruff is not installed here: the Python of the patch was not analysed (pip install ruff)');
else { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dest-')), file = path.join(dir, 'dest.py'); fs.writeFileSync(file, py);
  const r = spawnSync('ruff', ['check', '--isolated', '--no-cache', '--select', 'S,F,E9,PLE', '--ignore', 'S110' /* one except-pass, meant: a witness that cannot be read has no signatures, and the spend is refused */, '--output-format', 'concise', file], { encoding: 'utf8' }), out = (r.stdout || '').trim().split('\n').filter(l => /dest\.py:\d+/.test(l));
  check(`ruff finds nothing in it (security rules, undefined names, errors; ${has.stdout.trim()})`, r.status === 0 && !out.length, out.map(l => l.replace(dir + '/', '')).slice(0, 5).join(' | ')); }
say(bad ? `static: ${bad} check(s) failed` : 'static: every check passed'); process.exit(bad ? 1 : 0);
