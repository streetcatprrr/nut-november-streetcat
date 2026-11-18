// Writes circuits/tables.circom: one lookup per window of the blinding factor, its 256 fixed points written as limbs.
import fs from 'fs';
import { table, limbs, NWIN, P, W } from './lib.mjs';
let out = '// Written by gen.mjs. T_i[w] = (w * 256^i) * G + D_i, each coordinate as three limbs of 86 bits.\npragma circom 2.1.6;\n\n';
for (let i = 0; i < NWIN; i++) { const T = table(i);
  out += `template Lookup${i}() { signal input sel[256]; signal output o[2][3];\n`;
  for (let c = 0; c < 2; c++) for (let l = 0; l < 3; l++)
    out += `  o[${c}][${l}] <== ${T.map((p, w) => `${limbs(c ? p.y : p.x)[l]}*sel[${w}]`).join(' + ')};\n`;
  out += '}\n'; }
out += `template Lookup(i) { signal input sel[256]; signal output o[2][3];\n${Array.from({ length: NWIN }, (_, i) => `  if (i == ${i}) { component c${i} = Lookup${i}(); c${i}.sel <== sel; o <== c${i}.o; }`).join('\n')}\n}\n`;
fs.mkdirSync('circuits', { recursive: true }); fs.writeFileSync('circuits/tables.circom', out);
const bytes = s => `[${[...Buffer.from(s)].join(', ')}]`;
fs.writeFileSync('circuits/strings.circom', `// Written by gen.mjs: the fixed parts of the message hashed.\npragma circom 2.1.6;\nfunction PREFIX() { return ${bytes('Secp256k1_HashToCurve_Cashu_["P2PK",{"nonce":"')}; }\nfunction MIDDLE() { return ${bytes('","data":"')}; }\nfunction SUFFIX() { return ${bytes('"}]')}; }\n`);
const pl = limbs(P); console.log('tables written', (out.length / 1e6).toFixed(1) + ' MB', 'p limbs', pl.join(' '), 'W', W.toString());
