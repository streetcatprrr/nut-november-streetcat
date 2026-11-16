// Static checks (11 Nov): the code is read, not run. There is no contract here for a tool like Slither to read (the app is JavaScript,
// the mint's rule is Python), so this does the same kind of work with what fits:
//   1 · the app's own scripts and pages are searched for the calls through which text from outside could become code or markup
//       (innerHTML and its kin, eval, new Function, timers given text, document.write, javascript: links). Each use must be on the
//       short list below, with its reason; a new one fails until it is looked at and listed.
//   2 · nothing in the app's own code writes a private key into an address, a link or a query.
//   3 · the Python of the mint patch is given to ruff (security rules, undefined names, syntax), if ruff is installed here.
//   4 · the mint installer's own checks (its name, domain and port; settings that set up no backend but the fake one), run on their own.
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

// 4 · the mint installer's own checks, run on their own, in a folder of this test's own (14 Nov: a MINT_NAME with a line break in
// it, a second backend line further down, Nutshell's old name MINT_LIGHTNING_BACKEND or a name in lower case all passed the check
// that the script sets up only the fake backend; and a .env beside the mint, which Nutshell reads over its settings, was not looked for)
const inst = fs.readFileSync(ROOT + 'mint/install.sh', 'utf8'), from = inst.indexOf('# --- checks: begin ---'), to = inst.indexOf('# --- checks: end ---');
check('the installer\'s checks stand between their two marks', from > 0 && to > from);
const part = inst.slice(from, to), run = (code, ...args) => spawnSync('bash', ['-c', `set -uo pipefail\nopenssl() { printf '%064d\\n' 0; }\n${part}\n${code}`, 'check', ...args], { encoding: 'utf8' });
const sh = (code, ...args) => run(code, ...args).status === 0, write = name => run('DATA=/var/lib/nutshell-dest PORT=3338 NAME="$1" settings', name).stdout;
const DEF = 'Streetcat TEST mint (fake money)', EVIL = 'x"\nMINT_BACKEND_BOLT11_SAT=LndRestWallet\nX="';
check('a mint\'s name: the default and one with accents pass; one with a line break, a quote, a backslash, a $, a ` or over 80 characters does not',
  sh('name_ok "$1"', DEF) && sh('name_ok "$1"', 'Mint de pruebas · gatos (dinero falso)') && ![EVIL, 'a "b"', 'a\\b', 'a $HOME', 'a `id`', 'x'.repeat(81), '', 'x\r'].some(n => sh('name_ok "$1"', n)));
check('a domain and a port: plain ones pass; one with a line break in it, in capitals or out of range does not',
  sh('domain_ok "$1" && port_ok "$2"', 'mint.example.org', '3338') && ![['mint.example.org\nexample.org', '3338'], ['Mint.example.org', '3338'], ['mint.example.org', '3338\nExecStartPre=+/bin/true'], ['mint.example.org', '0'], ['mint.example.org', '65536'], ['mint.example.org', '03338']].some(([d, p]) => sh('domain_ok "$1" && port_ok "$2"', d, p)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-')), env = path.join(tmp, 'env'), made = write(DEF), fake = text => { fs.writeFileSync(env, text); return sh('fake_only "$1"', env); };
check('the settings the script writes pass: the fake backend, once', fake(made) && /^MINT_BACKEND_BOLT11_SAT=FakeWallet$/m.test(made) && (made.match(/^MINT_BACKEND_/gm) || []).length === 1, `${made.split('\n').length - 1} lines`);
const worse = [
  ['a second backend line further down (systemd takes the last)', made + 'MINT_BACKEND_BOLT11_SAT=LndRestWallet\n'],
  ['MINT_LIGHTNING_BACKEND, the old name, which wins over the new one', made + 'MINT_LIGHTNING_BACKEND=LndRestWallet\n'],
  ['a real backend for another unit', made + 'MINT_BACKEND_BOLT11_EUR=LNbitsWallet\n'],
  ['a backend named in lower case, which Nutshell reads too', made + 'mint_backend_bolt11_sat=LndRestWallet\n'],
  ['a line that begins with a space', made + ' MINT_BACKEND_BOLT11_SAT=LndRestWallet\n'],
  ['a quoted value open over three lines, which hides a line from a check that reads lines', made.replace('MINT_BACKEND_BOLT11_SAT=FakeWallet\n', 'MINT_BACKEND_BOLT11_SAT=LndRestWallet\nMINT_INFO_ABOUT="\nMINT_BACKEND_BOLT11_SAT=FakeWallet\n"\n')],
  ['a value that goes on to the next line (a backslash at its end)', made + 'MINT_INFO_ABOUT=x\\\n'],
  ['the settings written with a name that holds a line break', write(EVIL)],
  ['no backend line at all', made.replace('MINT_BACKEND_BOLT11_SAT=FakeWallet\n', '')],
];
const passed = worse.filter(([, text]) => fake(text)).map(([what]) => what);
check(`settings that would set up a real backend, or that it cannot read whole, are refused (${worse.length} kinds)`, !passed.length, passed.join(' | ') || worse.map(([w]) => w).join('; '));
check('…and a second fake backend, for another unit, is not refused', fake(made + 'MINT_BACKEND_BOLT11_USD=FakeWallet\n'));
const data = path.join(tmp, 'data'), home = path.join(tmp, 'home'), stray = () => sh('stray_env "$1" "$2"', data, home);
fs.mkdirSync(data); fs.mkdirSync(path.join(home, '.cashu'), { recursive: true }); const clean = stray();
fs.writeFileSync(path.join(home, '.cashu', '.env'), 'MINT_BACKEND_BOLT11_SAT=LndRestWallet\n'); const inHome = !stray(); fs.rmSync(path.join(home, '.cashu', '.env'));
fs.writeFileSync(path.join(data, '.env'), 'MINT_BACKEND_BOLT11_SAT=LndRestWallet\n'); const inData = !stray();
check('a .env that Nutshell would read over the settings, in the folder it runs in or in .cashu in its home, stops the script', clean && inHome && inData, `none: ${clean} · in its home: ${inHome} · in its folder: ${inData}`);
fs.rmSync(tmp, { recursive: true, force: true });
// 5. NO EXAMPLE IN A BOX TO FILL IN (16 Nov): a box with a label above it is empty until something is written in it. The grey text
// stays only where it is all that says what a box is for (a token to paste, a Lightning address, a PIN to repeat, "Choose name").
{ const html = fs.readFileSync(APP + 'index.html', 'utf8'), js = fs.readFileSync(APP + 'index.js', 'utf8'), boxes = ['k-op', 'k-c', 'k-mint', 'k-to', 'sn-cat', 'sn-proc', 'sn-note', 'pp-key', 'pp-name', 'dk-msg', 'cn-name', 'cn-proc', 'cn-coat', 'cn-notes'];
  const still = boxes.filter(id => { const m = html.match(new RegExp('<(?:input|textarea)[^>]*id="' + id + '"[^>]*>')); return !m || /placeholder=/.test(m[0]) || new RegExp("\\$\\('" + id + "'\\)\\.placeholder = '[^']").test(js) || new RegExp("\\$\\('" + id + "'\\)\\.placeholder = [a-z]").test(js); });
  check('the boxes to fill in under a label carry no example text', still.length === 0, still.join(', ') || `${boxes.length} boxes`);
  check('…and the ones with no label keep the text that says what they are for', /id="k-name"[^>]*placeholder="Choose name"|placeholder="Choose name"[^>]*id="k-name"/.test(html) && /id="cn-colony"[^>]*placeholder="Choose colony"|placeholder="Choose colony"[^>]*id="cn-colony"/.test(html) && /id="d-token"[^>]*placeholder=/.test(html)); }

say(bad ? `static: ${bad} check(s) failed` : 'static: every check passed'); process.exit(bad ? 1 : 0);
