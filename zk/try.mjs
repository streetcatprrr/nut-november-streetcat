// A first trial: an honest witness satisfies the circuit, and changed ones do not. Cross-checked with the app's own Cashu library.
import fs from 'fs'; import * as snarkjs from 'snarkjs';
import { inputsOf, findNonce, publicOf } from './witness.mjs'; import { Pt, G, N, big, sha256 } from './lib.mjs';
const APP = new URL('../app/', import.meta.url).pathname; eval(fs.readFileSync(APP + 'cashu-bundle.js', 'utf8') + ';globalThis.cashu = cashu;');
const wasm = 'build/paydest_js/paydest.wasm';
const sat = async input => { try { const w = { type: 'mem' }; await snarkjs.wtns.calculate(input, wasm, w); return true; } catch (e) { return String(e.message || e).split('\n').slice(0, 2).join(' ').slice(0, 110); } };
let bad = 0; const check = (l, ok, more = '') => { if (!ok) bad++; console.log((ok ? '✓ ' : '✗ ') + l + (more ? ' · ' + more : '')); };
const sk = big(sha256(Buffer.from('a made-up clinic key'))) % N, keyHex = G.multiply(sk).toHex(true), r = big(sha256(Buffer.from('a blinding factor'))) % N;
const nonce = findNonce(keyHex, 'trial'); const t0 = Date.now(), w = inputsOf({ keyHex, nonce, r }); console.log('secret', w.secret, '· key', keyHex.slice(0, 12) + '…', '· inputs in', Date.now() - t0, 'ms');
const lib = cashu.blindMessage(new TextEncoder().encode(w.secret), r).B_.toHex(true);
check('the output is the one the Cashu library makes from the same secret and blinding factor', lib === w.B_, lib.slice(0, 16));
let t = Date.now(); check('an honest witness satisfies the circuit', (await sat(w.input)) === true, (Date.now() - t) + ' ms');
const J = x => JSON.parse(JSON.stringify(x));
const other = G.multiply(sk + 1n).toHex(true);
{ const i = J(w.input); Object.assign(i, { Px: publicOf(other, Pt.fromHex(w.B_)).Px, Podd: publicOf(other, Pt.fromHex(w.B_)).Podd }); const s = await sat(i); check('refused: the same output shown as paying another key', s !== true, s); }
{ const i = J(w.input); i.Podd = i.Podd === '1' ? '0' : '1'; const s = await sat(i); check('refused: the key with its other prefix (02 for 03)', s !== true, s); }
{ const i = J(w.input); i.Bp = publicOf(keyHex, Pt.fromHex(w.B_).add(G)).Bp; const s = await sat(i); check('refused: another output', s !== true, s); }
{ const i = J(w.input); i.nonce[5] = String((Number(i.nonce[5]) + 1) % 16); const s = await sat(i); check('refused: another nonce with the same points', s !== true, s); }
{ const i = J(w.input); i.r[0] = i.r[0] === '1' ? '0' : '1'; const s = await sat(i); check('refused: another blinding factor', s !== true, s); }
{ const i = J(w.input); i.nonce[0] = '16'; const s = await sat(i); check('refused: a nonce digit that is not a hex digit', s !== true, s); }
{ // the thief's case: an output that hides the thief's own secret, with the honest path's numbers
  const thief = inputsOf({ keyHex: other, nonce: findNonce(other, 'thief'), r }); const i = J(thief.input); Object.assign(i, { Px: w.input.Px, Podd: w.input.Podd });
  const s = await sat(i); check('refused: an output that pays a thief, shown as paying the clinic', s !== true, s); }
console.log(bad ? `${bad} failed` : 'every check passed'); process.exit(bad ? 1 : 0);
