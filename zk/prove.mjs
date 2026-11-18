// Makes one proof that a blinded output pays a given key, then checks it the way a mint would: from the key and the output alone.
// Run after the setup: node prove.mjs
import fs from 'fs';
import * as snarkjs from 'snarkjs';
import { secp256k1 } from '@noble/curves/secp256k1';
import { inputsOf, publicOf, signalsOf, findNonce } from './witness.mjs';
import { Pt, G, sha256, big } from './lib.mjs';

const B = 'build/', WASM = B + 'paydest_js/paydest.wasm', ZKEY = B + 'paydest.zkey';
const keyOf = seed => Buffer.from(secp256k1.getPublicKey(sha256(Buffer.from(seed)), true)).toString('hex');
const clinic = keyOf('demo clinic'), thief = keyOf('demo thief');
const vkey = JSON.parse(fs.readFileSync(B + 'vkey.json'));
let bad = 0; const check = (name, ok) => { console.log(ok ? 'ok  ' : 'FAIL', name); if (!ok) bad++; };

const w = inputsOf({ keyHex: clinic, nonce: findNonce(clinic, 'prove'), r: big(sha256(Buffer.from('prove/r'))) });
const t0 = Date.now(); const { proof, publicSignals } = await snarkjs.groth16.fullProve(w.input, WASM, ZKEY); const proveMs = Date.now() - t0;
fs.writeFileSync(B + 'proof.json', JSON.stringify(proof));

// the verifier never takes the prover's word for the public signals: it works them out from the key and the output
const B_ = Pt.fromHex(w.B_), verify = (keyHex, out, p = proof) => snarkjs.groth16.verify(vkey, signalsOf(publicOf(keyHex, out)), p);
const t1 = Date.now(); const good = await verify(clinic, B_); const verifyMs = Date.now() - t1;
check('the proof verifies for the clinic and this output', good);
check('the signals the prover reports are the ones the verifier works out', JSON.stringify(publicSignals) === JSON.stringify(signalsOf(publicOf(clinic, B_))));
check('refused: same proof shown for another key', !(await verify(thief, B_)));
check('refused: same proof shown for another output', !(await verify(clinic, B_.add(G))));
const forged = JSON.parse(JSON.stringify(proof)); [forged.pi_a, forged.pi_c] = [forged.pi_c, forged.pi_a];
check('refused: a proof with two of its parts swapped', !(await verify(clinic, B_, forged)));

// an output that really pays the thief cannot be proved as paying the clinic
const t = inputsOf({ keyHex: thief, nonce: findNonce(thief, 'prove'), r: 7n });
let refused = false; try { await snarkjs.groth16.fullProve({ ...t.input, ...publicOf(clinic, Pt.fromHex(t.B_)) }, WASM, ZKEY); } catch (_) { refused = true; }
check('refused: no proof can be made that the thief\'s output pays the clinic', refused);

console.log(JSON.stringify({ proveMs, verifyMs, peakRssMB: Math.round(process.resourceUsage().maxRSS / 1024), proofBytes: JSON.stringify(proof).length,
  zkeyMB: +(fs.statSync(ZKEY).size / 1e6).toFixed(1), vkeyBytes: fs.statSync(B + 'vkey.json').size, wasmMB: +(fs.statSync(WASM).size / 1e6).toFixed(1) }));
console.log(bad ? `${bad} check(s) failed` : 'every check passed'); process.exit(bad ? 1 : 0);
