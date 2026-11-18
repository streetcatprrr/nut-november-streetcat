// The prover's side: from a payee's key, a nonce and a blinding factor, everything the circuit asks for.
// The prover works the curve out with ordinary arithmetic and hands the circuit each slope, inverse, point and quotient to check.
import { Pt, G, P, N, W, LB, NWIN, WIN, limbs, mod, inv, hashToCurve, table, offsetSum, paySecret, NONCE_HEX, sha256 } from './lib.mjs';

const K = 1n << 261n;
const quot = v => { if (v % P !== 0n) throw new Error('not a multiple of p'); const q = v / P + K; if (q < 0n || q >> 262n) throw new Error('quotient out of range'); return limbs(q).map(String); };
const L = v => limbs(v).map(String);
const TABLES = Array.from({ length: NWIN }, (_, i) => table(i));

// what the verifier needs, from what is public: the key and the output
export function publicOf(keyHex, B_) { const x = BigInt('0x' + keyHex.slice(2)), bp = B_.add(offsetSum).toAffine();
  return { Px: [String(x >> 128n), String(x & ((1n << 128n) - 1n))], Podd: keyHex.startsWith('03') ? '1' : '0', Bp: [L(bp.x), L(bp.y)] }; }
// the public signals in the order the circuit declares them
export const signalsOf = pub => [...pub.Px, pub.Podd, ...pub.Bp[0], ...pub.Bp[1]];

// a nonce whose secret hashes to a point at the first counter (one in two does); `seed` makes it repeatable
export function findNonce(keyHex, seed) { for (let i = 0; ; i++) { const nonce = sha256(Buffer.from(`${seed}/${i}`)).toString('hex').slice(0, NONCE_HEX);
  const h = hashToCurve(Buffer.from(paySecret(nonce, keyHex))); if (h.counter === 0 && (h.x >> 128n) !== (1n << 128n) - 1n) return nonce; } }

export function inputsOf({ keyHex, nonce, r }) {
  if (!/^0[23][0-9a-f]{64}$/.test(keyHex)) throw new Error('the key is not 02… or 03… in lower case'); if (!new RegExp(`^[0-9a-f]{${NONCE_HEX}}$`).test(nonce)) throw new Error('the nonce is not 48 hex digits');
  r = mod(BigInt(r), N); const secret = paySecret(nonce, keyHex), h = hashToCurve(Buffer.from(secret));
  if (h.counter !== 0) throw new Error('this nonce needs a second counter: take another');
  const Y = h.point.toAffine(), B_ = h.point.add(r === 0n ? Pt.ZERO : G.multiply(r));
  const xx = mod(Y.x * Y.x), qc = [quot(Y.x * Y.x - xx), quot(Y.y * Y.y - xx * Y.x - 7n)];
  const lam = [], invs = [], mid = [], q = []; let a = Y;
  for (let i = 0; i < NWIN; i++) { const w = Number((r >> BigInt(WIN * i)) & 255n), b = TABLES[i][w];
    if (a.x === b.x) throw new Error('the two points share an x (this does not happen)');
    const iv = inv(b.x - a.x), l = mod((b.y - a.y) * iv), ox = mod(l * l - a.x - b.x), oy = mod(l * (a.x - ox) - a.y);
    lam.push(L(l)); invs.push(L(iv)); if (i < NWIN - 1) mid.push([L(ox), L(oy)]);
    q.push([quot(l * (b.x - a.x) - (b.y - a.y)), quot(l * l - a.x - b.x - ox), quot(l * (a.x - ox) - a.y - oy), quot(iv * (b.x - a.x) - 1n)]);
    a = { x: ox, y: oy }; }
  const bp = B_.add(offsetSum).toAffine(); if (a.x !== bp.x || a.y !== bp.y) throw new Error('the sum is not the output');
  const pub = publicOf(keyHex, B_);
  return { secret, B_: B_.toHex(true), pub, input: { ...pub, nonce: [...nonce].map(c => String(parseInt(c, 16))), r: Array.from({ length: 256 }, (_, i) => String((r >> BigInt(i)) & 1n)),
    y: L(Y.y), xx: L(xx), qc, lam, inv: invs, mid, q } }; }
