// Shared arithmetic for the experiment: Cashu's hash_to_curve, limbs, the table of fixed points and its offsets.
import { createHash } from 'crypto';
import { secp256k1 } from '@noble/curves/secp256k1';

export const Pt = secp256k1.ProjectivePoint, G = Pt.BASE;
export const P = secp256k1.CURVE.Fp.ORDER, N = secp256k1.CURVE.n;
export const LB = 86n, W = 1n << LB, NL = 3, WIN = 8, NWIN = 32;
export const sha256 = (...parts) => { const h = createHash('sha256'); for (const p of parts) h.update(p); return h.digest(); };
export const big = b => BigInt('0x' + Buffer.from(b).toString('hex'));
export const limbs = v => [v & (W - 1n), (v >> LB) & (W - 1n), v >> (2n * LB)];
export const mod = (a, m = P) => ((a % m) + m) % m;
export const inv = (a, m = P) => { let [r0, r1, s0, s1] = [mod(a, m), m, 1n, 0n]; while (r1) { const q = r0 / r1; [r0, r1, s0, s1] = [r1, r0 - q * r1, s1, s0 - q * s1]; } return mod(s0, m); };

const DOMAIN = Buffer.from('Secp256k1_HashToCurve_Cashu_');
// Cashu's hash_to_curve (NUT-00), with the counter it stopped at
export function hashToCurve(msg) { const h = sha256(DOMAIN, msg);
  for (let c = 0; c < 65536; c++) { const cb = Buffer.alloc(4); cb.writeUInt32LE(c); const x = sha256(h, cb);
    try { return { point: Pt.fromHex(Buffer.concat([Buffer.from([2]), x])), counter: c, x: big(x) }; } catch (_) {} }
  throw new Error('no point'); }

// One offset per window, a point nobody knows the logarithm of: no table entry is the point at infinity, and none can be met on purpose.
export const offsets = Array.from({ length: NWIN }, (_, i) => hashToCurve(Buffer.from(`streetcat/dest-zk/offset/${i}`)).point);
export const offsetSum = offsets.reduce((a, b) => a.add(b));
// T[i][w] = (w · 256^i)·G + D_i
export function table(i) { const step = G.multiply(1n << BigInt(WIN * i)); const out = []; let acc = offsets[i];
  for (let w = 0; w < 1 << WIN; w++) { out.push(acc.toAffine()); acc = acc.add(step); } return out; }

export const paySecret = (nonceHex, keyHex) => `["P2PK",{"nonce":"${nonceHex}","data":"${keyHex}"}]`;
export const NONCE_HEX = 48;
