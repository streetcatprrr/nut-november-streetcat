// EXPERIMENT. A proof that a blinded output pays a given key, without opening it.
//
// Public:  the payee's key (Px, Podd) and Bp = B_ + D, where B_ is the output and D a fixed point (the sum of the table's offsets).
// Private: a nonce and a blinding factor r.
// Proven:  B_ = hash_to_curve(secret) + r·G, where secret is exactly ["P2PK",{"nonce":"<48 hex>","data":"<the key>"}]
//          and hash_to_curve is Cashu's (NUT-00), stopping at its first counter.
//
// The curve is secp256k1 and the proof's field is not its field, so every number of the curve is three limbs of 86 bits and
// every equation modulo p is checked as an equation of integers (ZeroModP). The quotients, the slopes and the points in
// between are given by the prover and checked here.
pragma circom 2.1.6;
include "../node_modules/circomlib/circuits/sha256/sha256.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "tables.circom";
include "strings.circom";

template Limb(n) { signal input in; component b = Num2Bits(n); b.in <== in; }

// the product of two numbers of three limbs, as five coefficients (not carried)
template Mul3() { signal input a[3]; signal input b[3]; signal output o[5]; signal m[3][3];
  for (var i = 0; i < 3; i++) { for (var j = 0; j < 3; j++) { m[i][j] <== a[i] * b[j]; } }
  o[0] <== m[0][0]; o[1] <== m[0][1] + m[1][0]; o[2] <== m[0][2] + m[1][1] + m[2][0]; o[3] <== m[1][2] + m[2][1]; o[4] <== m[2][2]; }

// sum t[k]·2^(86k) = (q − 2^261)·p, as integers. t[k]: any sign, below 2^175 in size. q: limbs of 86, 86 and 90 bits.
// Sizes: |t − q·p + 2^261·p| < 2^178.3 per coefficient, so each carry is below 2^93 in size and nothing wraps in the proof's field.
template ZeroModP() { signal input t[5]; signal input q[3];
  var W = 1 << 86; var p[3] = [(1 << 86) - (1 << 32) - 977, (1 << 86) - 1, (1 << 84) - 1]; var K = 1 << 89;
  component rq[3]; for (var i = 0; i < 3; i++) { rq[i] = Limb(i == 2 ? 90 : 86); rq[i].in <== q[i]; }
  var u[5];
  u[0] = t[0] - q[0] * p[0];
  u[1] = t[1] - q[0] * p[1] - q[1] * p[0];
  u[2] = t[2] - q[0] * p[2] - q[1] * p[1] - q[2] * p[0] + K * p[0];
  u[3] = t[3] - q[1] * p[2] - q[2] * p[1] + K * p[1];
  u[4] = t[4] - q[2] * p[2] + K * p[2];
  signal c[4]; component rc[4];
  c[0] <-- u[0] / W; c[0] * W === u[0];
  for (var k = 1; k < 4; k++) { c[k] <-- (u[k] + c[k - 1]) / W; c[k] * W === u[k] + c[k - 1]; }
  for (var k = 0; k < 4; k++) { rc[k] = Limb(94); rc[k].in <== c[k] + (1 << 93); }
  u[4] + c[3] === 0; }

// o = a + b on the curve, for points with different x. lam is the slope, inv the inverse of (bx − ax): both from the prover.
template AddP() { signal input a[2][3]; signal input b[2][3]; signal input lam[3]; signal input inv[3]; signal input o[2][3]; signal input q[4][3];
  component rl[3]; component ri[3]; component ro[2][3];
  for (var l = 0; l < 3; l++) { rl[l] = Limb(86); rl[l].in <== lam[l]; ri[l] = Limb(86); ri[l].in <== inv[l];
    for (var c = 0; c < 2; c++) { ro[c][l] = Limb(86); ro[c][l].in <== o[c][l]; } }
  component m1 = Mul3(); component z1 = ZeroModP();   // lam·(bx − ax) = by − ay
  component m2 = Mul3(); component z2 = ZeroModP();   // lam·lam = ax + bx + ox
  component m3 = Mul3(); component z3 = ZeroModP();   // lam·(ax − ox) = ay + oy
  component m4 = Mul3(); component z4 = ZeroModP();   // inv·(bx − ax) = 1
  for (var l = 0; l < 3; l++) { m1.a[l] <== lam[l]; m1.b[l] <== b[0][l] - a[0][l]; m2.a[l] <== lam[l]; m2.b[l] <== lam[l];
    m3.a[l] <== lam[l]; m3.b[l] <== a[0][l] - o[0][l]; m4.a[l] <== inv[l]; m4.b[l] <== b[0][l] - a[0][l]; }
  for (var k = 0; k < 3; k++) {
    z1.t[k] <== m1.o[k] - b[1][k] + a[1][k];
    z2.t[k] <== m2.o[k] - a[0][k] - b[0][k] - o[0][k];
    z3.t[k] <== m3.o[k] - a[1][k] - o[1][k]; }
  z4.t[0] <== m4.o[0] - 1; z4.t[1] <== m4.o[1]; z4.t[2] <== m4.o[2];
  for (var k = 3; k < 5; k++) { z1.t[k] <== m1.o[k]; z2.t[k] <== m2.o[k]; z3.t[k] <== m3.o[k]; z4.t[k] <== m4.o[k]; }
  z1.q <== q[0]; z2.q <== q[1]; z3.q <== q[2]; z4.q <== q[3]; }

template OneHot4() { signal input b[4]; signal output o[16];
  signal lo <== b[0] * b[1]; signal hi <== b[2] * b[3];
  var A[4] = [1 - b[0] - b[1] + lo, b[0] - lo, b[1] - lo, lo]; var B[4] = [1 - b[2] - b[3] + hi, b[2] - hi, b[3] - hi, hi];
  for (var i = 0; i < 4; i++) { for (var j = 0; j < 4; j++) { o[i + 4 * j] <== A[i] * B[j]; } } }
template OneHot8() { signal input b[8]; signal output sel[256];
  component lo = OneHot4(); component hi = OneHot4(); for (var i = 0; i < 4; i++) { lo.b[i] <== b[i]; hi.b[i] <== b[4 + i]; }
  for (var i = 0; i < 16; i++) { for (var j = 0; j < 16; j++) { sel[i + 16 * j] <== lo.o[i] * hi.o[j]; } } }

// a hex digit (four bits, b[3] the highest) as the bits of its lower-case character, highest first
template HexChar() { signal input b[4]; signal output o[8];
  signal t <== b[1] * b[2]; signal g <== b[3] * (b[1] + b[2] - t);   // g: the digit is ten or more
  component n = Num2Bits(8); n.in <== b[0] + 2 * b[1] + 4 * b[2] + 8 * b[3] + 48 + 39 * g;
  for (var i = 0; i < 8; i++) { o[i] <== n.out[7 - i]; } }

template PayDest() {
  signal input Px[2];        // public: the key's x, its high and low 128 bits
  signal input Podd;         // public: 0 for a key written 02…, 1 for 03…
  signal input Bp[2][3];     // public: B_ + D
  signal input nonce[48];    // hex digits
  signal input r[256];       // bits, lowest first
  signal input y[3];         // the even root of x^3 + 7
  signal input xx[3]; signal input qc[2][3];
  signal input lam[32][3]; signal input inv[32][3]; signal input mid[31][2][3]; signal input q[32][4][3];

  // ---- the message hashed: the domain, then the secret ----
  var PRE[46] = PREFIX(); var MID[10] = MIDDLE(); var END[3] = SUFFIX(); var LEN = 46 + 48 + 10 + 66 + 3;
  component h1 = Sha256(LEN * 8); var at = 0;
  for (var i = 0; i < 46; i++) { for (var k = 0; k < 8; k++) { h1.in[at * 8 + k] <== (PRE[i] >> (7 - k)) & 1; } at++; }
  component nb[48]; component nc[48];
  for (var i = 0; i < 48; i++) { nb[i] = Num2Bits(4); nb[i].in <== nonce[i]; nc[i] = HexChar(); nc[i].b <== nb[i].out;
    for (var k = 0; k < 8; k++) { h1.in[at * 8 + k] <== nc[i].o[k]; } at++; }
  for (var i = 0; i < 10; i++) { for (var k = 0; k < 8; k++) { h1.in[at * 8 + k] <== (MID[i] >> (7 - k)) & 1; } at++; }
  Podd * (Podd - 1) === 0;
  for (var k = 0; k < 8; k++) { h1.in[at * 8 + k] <== (48 >> (7 - k)) & 1; } at++;                              // '0'
  for (var k = 0; k < 7; k++) { h1.in[at * 8 + k] <== (50 >> (7 - k)) & 1; } h1.in[at * 8 + 7] <== Podd; at++;   // '2' or '3'
  component pb[2]; component pc[64];
  for (var h = 0; h < 2; h++) { pb[h] = Num2Bits(128); pb[h].in <== Px[h]; }
  for (var i = 0; i < 64; i++) { pc[i] = HexChar(); var top = 127 - 4 * (i % 32);
    for (var k = 0; k < 4; k++) { pc[i].b[3 - k] <== pb[i \ 32].out[top - k]; }
    for (var k = 0; k < 8; k++) { h1.in[at * 8 + k] <== pc[i].o[k]; } at++; }
  for (var i = 0; i < 3; i++) { for (var k = 0; k < 8; k++) { h1.in[at * 8 + k] <== (END[i] >> (7 - k)) & 1; } at++; }

  // ---- x = sha256(that hash, counter 0), read as a number ----
  component h2 = Sha256(288);
  for (var i = 0; i < 256; i++) { h2.in[i] <== h1.out[i]; }
  for (var i = 256; i < 288; i++) { h2.in[i] <== 0; }
  signal x[3]; var top128 = 0;
  for (var l = 0; l < 3; l++) { var s = 0; for (var i = 86 * l; i < 86 * (l + 1) && i < 256; i++) { s += h2.out[255 - i] * (1 << (i - 86 * l)); } x[l] <== s; }
  for (var i = 0; i < 128; i++) { top128 += h2.out[i]; }
  component xs = IsEqual(); xs.in[0] <== top128; xs.in[1] <== 128; xs.out === 0;   // x is below p (true of every x but one in 2^128)

  // ---- (x, y) is on the curve, and y is the even root below p: the point Cashu reads from 02 || x ----
  component yb[3]; var ytop = 0;
  for (var l = 0; l < 3; l++) { yb[l] = Num2Bits(l == 2 ? 84 : 86); yb[l].in <== y[l]; }
  yb[0].out[0] === 0;
  for (var i = 0; i < 84; i++) { ytop += yb[2].out[i]; }
  for (var i = 42; i < 86; i++) { ytop += yb[1].out[i]; }
  component ys = IsEqual(); ys.in[0] <== ytop; ys.in[1] <== 128; ys.out === 0;
  component rx[3]; for (var l = 0; l < 3; l++) { rx[l] = Limb(86); rx[l].in <== xx[l]; }
  component ma = Mul3(); component za = ZeroModP();   // x·x = xx
  component mb = Mul3(); component mc = Mul3(); component zb = ZeroModP();   // y·y = xx·x + 7
  for (var l = 0; l < 3; l++) { ma.a[l] <== x[l]; ma.b[l] <== x[l]; mb.a[l] <== y[l]; mb.b[l] <== y[l]; mc.a[l] <== xx[l]; mc.b[l] <== x[l]; }
  for (var k = 0; k < 3; k++) { za.t[k] <== ma.o[k] - xx[k]; }
  za.t[3] <== ma.o[3]; za.t[4] <== ma.o[4];
  zb.t[0] <== mb.o[0] - mc.o[0] - 7; for (var k = 1; k < 5; k++) { zb.t[k] <== mb.o[k] - mc.o[k]; }
  za.q <== qc[0]; zb.q <== qc[1];

  // ---- Y + r·G + D = Bp: one table point per byte of r ----
  component oh[32]; component look[32]; component add[32];
  for (var i = 0; i < 256; i++) { r[i] * (r[i] - 1) === 0; }
  for (var i = 0; i < 32; i++) { oh[i] = OneHot8(); for (var k = 0; k < 8; k++) { oh[i].b[k] <== r[8 * i + k]; }
    look[i] = Lookup(i); look[i].sel <== oh[i].sel;
    add[i] = AddP(); add[i].b <== look[i].o; add[i].lam <== lam[i]; add[i].inv <== inv[i]; add[i].q <== q[i];
    if (i == 0) { add[i].a[0] <== x; add[i].a[1] <== y; } else { add[i].a <== mid[i - 1]; }
    if (i == 31) { add[i].o <== Bp; } else { add[i].o <== mid[i]; } }
}
component main { public [Px, Podd, Bp] } = PayDest();
