// Which cat is this? A hint on the phone, never a proof. A photo is cut down to its cat (YOLOS-tiny)
// and turned into 384 numbers (DINOv2 small); photos of one cat give numbers close to each other. Chosen on 6 Nov among four models,
// on 58 photos of 14 named cats from Wikimedia Commons (README.md, Progress, 7 Nov). The models run in catid-worker.js; their files (ai/1/ and
// ai/2/, 121 MB) come only when the clinic or Streetcat asks for them, and then the service worker keeps them, for without a connection.
// A photo's numbers are kept here, in IndexedDB, under the photo's SHA-256, so each photo is worked out once.
// VERSION 2 (7 Nov; in the app at Streetcat's decision, PetFace's weights being for non-commercial research: ai/2/LICENSES.txt): the cat's
// FACE as well. AnyFace (YOLOv5l6 with five face points, MIT; 8-bit, at 384 px) finds the face, its eyes, nose and mouth corners; the face
// is turned and scaled onto PetFace's cat template (224 × 224), and PetFace (ResNet-50, Shinoda and Shiohara, ECCV 2024) turns it into 512
// numbers. Two photos are compared by both: each cosine is put on one scale (how far above the usual cosine of two different cats it is,
// in their spread, Z below) and the two are averaged; when either photo has no face found, by DINOv2 alone. On 45 photos of 13 cats
// (README.md, Progress, 7 Nov) the right cat came first 89 % of the time, against 63 % with DINOv2 alone (the browser's numbers, 54 photos). Its two files are in ai/2/ (72 MB more).
const CATID = (() => {
  const ROOT = new URL('./', location.href).href, DIR = ROOT + 'ai/1/', TAG = 'catid2', CAT = 17;  // COCO's class 17: cat
  const MEAN = [.485, .456, .406], STD = [.229, .224, .225], PAD = MEAN.map(m => Math.trunc(m * 255));
  const KEEP = { 'ai/1/ort.wasm.bundle.min.js': 73054, 'ai/1/ort-wasm-simd-threaded.wasm': 14239897, 'ai/1/yolos-tiny-q8.onnx': 9661148, 'ai/1/dinov2-small-q8.onnx': 24427763,
    'ai/2/anyface-384-q8.onnx': 47598496, 'ai/2/petface-r50-q8.onnx': 24731418 };
  const FILES = Object.keys(KEEP).filter(f => !f.endsWith('.js')), SIZE = FILES.reduce((s, f) => s + KEEP[f], 0);

  // resizing as Pillow does it (the library of the evaluation): bicubic or bilinear, the filter widened when shrinking, rounded to
  // whole values after each pass; so a photo gives the same numbers on every browser, which resizing on a canvas would not
  const CUBIC = [x => { x = Math.abs(x); return x < 1 ? (1.5 * x - 2.5) * x * x + 1 : x < 2 ? (((x - 5) * x + 8) * x - 4) * -.5 : 0; }, 2];
  const LINEAR = [x => { x = Math.abs(x); return x < 1 ? 1 - x : 0; }, 1];
  function weights(n, m, [f, sup]){ const scale = n / m, fs = Math.max(scale, 1), s = sup * fs, out = [];
    for (let i = 0; i < m; i++) { const c = (i + .5) * scale, lo = Math.max(0, Math.trunc(c - s + .5)), hi = Math.min(n, Math.trunc(c + s + .5)), w = new Float64Array(Math.max(0, hi - lo)); let t = 0;
      for (let x = lo; x < hi; x++) t += (w[x - lo] = f((x - c + .5) / fs)); if (t) for (let k = 0; k < w.length; k++) w[k] /= t; out.push([lo, w]); }
    return out; }
  const r8 = v => v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
  function resize(px, w, h, W, H, filt){  // px: RGB bytes, w × h → W × H, across then down
    const tmp = new Uint8Array(W * h * 3), out = new Uint8Array(W * H * 3);
    const wx = weights(w, W, filt); for (let y = 0; y < h; y++) for (let X = 0; X < W; X++) { const [lo, k] = wx[X]; let r = 0, g = 0, b = 0;
      for (let j = 0, o = (y * w + lo) * 3; j < k.length; j++, o += 3) { r += px[o] * k[j]; g += px[o + 1] * k[j]; b += px[o + 2] * k[j]; }
      const o = (y * W + X) * 3; tmp[o] = r8(r); tmp[o + 1] = r8(g); tmp[o + 2] = r8(b); }
    const wy = weights(h, H, filt); for (let Y = 0; Y < H; Y++) { const [lo, k] = wy[Y]; for (let X = 0; X < W; X++) { let r = 0, g = 0, b = 0;
      for (let j = 0, o = (lo * W + X) * 3; j < k.length; j++, o += W * 3) { r += tmp[o] * k[j]; g += tmp[o + 1] * k[j]; b += tmp[o + 2] * k[j]; }
      const o = (Y * W + X) * 3; out[o] = r8(r); out[o + 1] = r8(g); out[o + 2] = r8(b); } }
    return out; }
  // the model's input: channels apart, each value normalised as in training; S: a square of that side at x0, y0
  function tensor(px, W, H, x0 = 0, y0 = 0, S = 0){ const w = S || W, h = S || H, n = w * h, t = new Float32Array(3 * n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = ((y + y0) * W + x + x0) * 3, p = y * w + x;
      t[p] = (px[o] / 255 - MEAN[0]) / STD[0]; t[n + p] = (px[o + 1] / 255 - MEAN[1]) / STD[1]; t[2 * n + p] = (px[o + 2] / 255 - MEAN[2]) / STD[2]; }
    return t; }
  /* A PHOTO'S SIZE IS LOOKED AT BEFORE IT IS OPENED (six scans, 15 Nov, 5.21): a file of a few kilobytes can say it is tens of thousands of
     pixels a side, and opening it whole, with its copies, took the phone's memory before anything was compared. Its size is read from its
     first bytes (PNG, JPEG) and, whatever the format, again once opened; over PX_MAX it is refused, and one wider than SIDE_MAX is made
     smaller before it is copied (a phone's own photos are under it, and compare as before). */
  const PX_MAX = 50e6, SIDE_MAX = 4096, TOO_BIG = 'this photo is too large to compare here';
  function dims(b){ try { const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
      if (b.length > 24 && v.getUint32(0) === 0x89504e47) return { w: v.getUint32(16), h: v.getUint32(20) };
      if (b.length > 4 && v.getUint16(0) === 0xffd8) { let i = 2; while (i + 9 < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m === 0xff) { i++; continue; }
          if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: v.getUint16(i + 5), w: v.getUint16(i + 7) };
          if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; } i += 2 + v.getUint16(i + 2); } }
    } catch (_) {} return null; }
  async function pixels(bytes){ const says = dims(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); if (says && says.w * says.h > PX_MAX) throw new Error(TOO_BIG);
    let bmp = await createImageBitmap(new Blob([bytes])); if (bmp.width * bmp.height > PX_MAX) { if (bmp.close) bmp.close(); throw new Error(TOO_BIG); }
    if (Math.max(bmp.width, bmp.height) > SIDE_MAX) { const k = SIDE_MAX / Math.max(bmp.width, bmp.height), small = await createImageBitmap(bmp, { resizeWidth: Math.max(1, Math.round(bmp.width * k)), resizeHeight: Math.max(1, Math.round(bmp.height * k)), resizeQuality: 'high' }); if (bmp.close) bmp.close(); bmp = small; }
    const w = bmp.width, h = bmp.height;
    const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0); if (bmp.close) bmp.close(); const d = cx.getImageData(0, 0, w, h).data, px = new Uint8Array(w * h * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { px[j] = d[i]; px[j + 1] = d[i + 1]; px[j + 2] = d[i + 2]; } return { px, w, h }; }
  const half = v => { const f = Math.floor(v), d = v - f; return d > .5 ? f + 1 : d < .5 ? f : f % 2 ? f + 1 : f; };  // Python's round()

  // the worker, one question at a time
  let W = null, seq = 0, chain = Promise.resolve(), LOADED = false, progress = null; const waiting = new Map();
  function worker(){ if (W) return W; W = new Worker(new URL('catid-worker.js', location.href), { type: 'module' });
    W.onmessage = ({ data: m }) => { if (m.op === 'progress') { if (progress) progress(m.got, m.of); return; } const p = waiting.get(m.id); if (!p) return; waiting.delete(m.id); m.error ? p.rej(new Error(m.error)) : p.res(m); };
    W.onerror = e => { e.preventDefault(); const err = new Error('the cat recognition could not start on this phone'); for (const p of waiting.values()) p.rej(err); waiting.clear(); W = null; LOADED = false; };
    return W; }
  const ask = m => new Promise((res, rej) => { const id = ++seq; waiting.set(id, { res, rej }); worker().postMessage({ ...m, id }); });
  const call = m => (chain = chain.then(() => ask(m), () => ask(m)));
  async function load(onProgress){ if (onProgress) progress = onProgress; try { await call({ op: 'load' }); LOADED = true; } finally { if (progress === onProgress) progress = null; } }  /* one without its own progress (a photo looked at as it is taken) leaves the other's */
  // are its files kept on this phone, for without a connection? (the engine's code too: the worker imports it)
  const AI = 'streetcat-ai-1';
  async function here(){ try { if (!self.caches) return false; for (const f in KEEP) if (!(await caches.match(ROOT + f))) return false; return true; } catch (_) { return false; } }
  // Offline setup: the files kept ahead of time, on wifi, without starting the recognition, in the service worker's copy (sw.js reads
  // it under the same name, AI), so this works even before the service worker controls the page; what is kept already is skipped
  async function keep(onProgress){ const c = await caches.open(AI), all = Object.values(KEEP).reduce((s, n) => s + n, 0); let got = 0;
    for (const [f, size] of Object.entries(KEEP)) { const u = ROOT + f; if (await c.match(u)) { got += size; continue; }
      const res = await fetch(u); if (!res.ok || !res.body) throw new Error(`${f} could not be fetched (${res.status})`);
      const put = c.put(u, res.clone()), rd = res.body.getReader(); put.catch(() => {}); let n = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (onProgress) onProgress(got + n, all); }
      await put; if (n !== size) { await c.delete(u).catch(() => {}); throw new Error(`${f} came incomplete (${n} of ${size} bytes)`); } got += n; }
    if (onProgress) onProgress(all, all); }

  // a photo → its cat → 384 numbers (unit length); n: cats YOLOS found (0: none, the whole photo was used)
  const iou = (a, b) => { const ax0 = a[0] - a[2] / 2, ay0 = a[1] - a[3] / 2, ax1 = a[0] + a[2] / 2, ay1 = a[1] + a[3] / 2, bx0 = b[0] - b[2] / 2, by0 = b[1] - b[3] / 2, bx1 = b[0] + b[2] / 2, by1 = b[1] + b[3] / 2;
    const i = Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0)) * Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0)); return i / (a[2] * a[3] + b[2] * b[3] - i + 1e-9); };
  async function compute(bytes){ const { px, w, h } = await pixels(bytes);
    const s0 = Math.min(512 / Math.min(w, h), 1333 / Math.max(w, h)), FW = Math.max(16, half(w * s0 / 16) * 16), FH = Math.max(16, half(h * s0 / 16) * 16);
    const r = await call({ op: 'find', x: tensor(resize(px, w, h, FW, FH, LINEAR), FW, FH), dims: [1, 3, FH, FW] }), [, Q, K] = r.ldims, found = [];
    let pc = 0;  /* the highest chance of a cat in any box, under .5 too: catIn() below */
    for (let q = 0; q < Q; q++) { const L = r.logits.subarray(q * K, q * K + K); let mx = -Infinity, am = 0; for (let k = 0; k < K; k++) if (L[k] > mx) { mx = L[k]; am = k; }
      let z = 0; for (let k = 0; k < K; k++) z += Math.exp(L[k] - mx); pc = Math.max(pc, Math.exp(L[CAT] - mx) / z);
      if (am === CAT && 1 / z > .5) found.push([1 / z, Array.from(r.boxes.subarray(q * 4, q * 4 + 4))]); }
    found.sort((a, b) => b[0] - a[0]);
    let x0 = 0, y0 = 0, x1 = w, y1 = h, p = 0, n = 0;
    if (found.length) { const [cx, cy, bw, bh] = found[0][1], m = .1; p = found[0][0]; n = 1 + found.slice(1).filter(([q, b]) => q > .7 && iou(b, found[0][1]) < .3).length;
      x0 = Math.trunc(Math.max(0, (cx - bw / 2 - m * bw) * w)); y0 = Math.trunc(Math.max(0, (cy - bh / 2 - m * bh) * h)); x1 = Math.trunc(Math.min(w, (cx + bw / 2 + m * bw) * w)); y1 = Math.trunc(Math.min(h, (cy + bh / 2 + m * bh) * h)); }
    const cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0), side = Math.max(cw, ch), sq = new Uint8Array(side * side * 3), ox = Math.floor((side - cw) / 2), oy = Math.floor((side - ch) / 2);
    for (let i = 0; i < side * side; i++) { sq[i * 3] = PAD[0]; sq[i * 3 + 1] = PAD[1]; sq[i * 3 + 2] = PAD[2]; }
    for (let y = 0; y < ch; y++) sq.set(px.subarray(((y0 + y) * w + x0) * 3, ((y0 + y) * w + x0 + cw) * 3), ((oy + y) * side + ox) * 3);
    const { e } = await call({ op: 'embed', x: tensor(resize(sq, side, side, 256, 256, CUBIC), 256, 256, 16, 16, 224), dims: [1, 3, 224, 224] });
    unit(e); const fc = await faceOf(px, w, h);
    return { e, box: [x0, y0, x1, y1], p, n, pc, f: fc ? fc.f : null, fs: fc ? fc.s : 0, fl: fc ? fc.l : null }; }
  const unit = v => { let t = 0; for (const x of v) t += x * x; t = Math.sqrt(t) || 1; for (let i = 0; i < v.length; i++) v[i] /= t; return v; };

  // the face (version 2): the photo letterboxed into 384 × 384 on grey, as AnyFace was trained; its best face (score: object × class,
  // above .3) and five points, back in the photo's pixels; the face moved onto PetFace's cat template by the similarity (turn, scale,
  // shift) that fits the five points best, sampled as OpenCV's warp does (bilinear, black outside); then PetFace's 512 numbers
  const FS = 384, TPL = [[56, 114.75323], [168, 114.5801], [111.15503, 156.37077], [76.158394, 183.4699], [147.3222, 183.47365]];  // PetFace's keypoints/cat.npy
  function fit(P, Q){ const n = P.length, mp = [0, 0], mq = [0, 0]; for (let i = 0; i < n; i++) { mp[0] += P[i][0] / n; mp[1] += P[i][1] / n; mq[0] += Q[i][0] / n; mq[1] += Q[i][1] / n; }
    let sa = 0, sb = 0, sp = 0; for (let i = 0; i < n; i++) { const px = P[i][0] - mp[0], py = P[i][1] - mp[1], qx = Q[i][0] - mq[0], qy = Q[i][1] - mq[1]; sa += qx * px + qy * py; sb += qy * px - qx * py; sp += px * px + py * py; }
    const a = sa / sp, b = sb / sp; return [a, b, mq[0] - (a * mp[0] - b * mp[1]), mq[1] - (b * mp[0] + a * mp[1])]; }  // x' = a x - b y + tx, y' = b x + a y + ty
  function warp(px, w, h, [a, b, tx, ty], S = 224){ const out = new Uint8Array(S * S * 3), d = a * a + b * b, at = (x, y, c) => x < 0 || y < 0 || x >= w || y >= h ? 0 : px[(y * w + x) * 3 + c];
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) { const X = u - tx, Y = v - ty, sx = (a * X + b * Y) / d, sy = (a * Y - b * X) / d, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      for (let c = 0; c < 3; c++) out[(v * S + u) * 3 + c] = r8((at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy) + (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy); }
    return out; }
  async function faceOf(px, w, h){ const g = Math.min(FS / h, FS / w), nw = Math.max(1, half(w * g)), nh = Math.max(1, half(h * g)), left = Math.floor((FS - nw) / 2), top = Math.floor((FS - nh) / 2), n = FS * FS;
    const sm = resize(px, w, h, nw, nh, LINEAR), x = new Float32Array(3 * n).fill(114 / 255);
    for (let y = 0; y < nh; y++) for (let k = 0; k < nw; k++) { const o = (y * nw + k) * 3, p = (y + top) * FS + k + left; x[p] = sm[o] / 255; x[n + p] = sm[o + 1] / 255; x[2 * n + p] = sm[o + 2] / 255; }
    const r = await call({ op: 'face', x, dims: [1, 3, FS, FS] }), [, N, R] = r.dims, o = r.o; let best = -1, bs = .3;
    for (let i = 0; i < N; i++) { const sc = o[i * R + 4] * o[i * R + R - 1]; if (sc > bs) { bs = sc; best = i; } }
    if (best < 0) return null;
    const l = []; for (let k = 0; k < 5; k++) l.push([(o[best * R + 5 + 2 * k] - left) / g, (o[best * R + 6 + 2 * k] - top) / g]);
    const { e } = await call({ op: 'pet', x: tensor(warp(px, w, h, fit(l, TPL)), 224, 224), dims: [1, 3, 224, 224] });
    return { f: unit(e), s: bs, l }; }

  // kept: the numbers of a photo, under its SHA-256
  const DB = (() => { let d = null;
    const open = () => d || (d = new Promise((res, rej) => { const r = indexedDB.open('streetcat-catid', 1); r.onupgradeneeded = () => r.result.createObjectStore('vec'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }).catch(e => { d = null; throw e; }));
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction('vec', mode), q = fn(t.objectStore('vec')); t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error); }));
    return { get: k => run('readonly', s => s.get(k)), put: (k, v) => run('readwrite', s => s.put(v, k)) }; })();
  const WORKING = new Map();  /* a photo asked for again while it is being worked out waits for that, not for a second time */
  function vecOf(sha, bytes){ const k = TAG + ':' + sha; if (WORKING.has(k)) return WORKING.get(k);
    const p = (async () => { try { const v = await DB.get(k); if (v && v.e) return v; } catch (_) {}
      const b = typeof bytes === 'function' ? await bytes() : bytes; if (!b) return null; const v = await compute(b); try { await DB.put(k, v); } catch (_) {} return v; })();
    WORKING.set(k, p); const done = () => { if (WORKING.get(k) === p) WORKING.delete(k); }; p.then(done, done); return p; }
  const sim = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  // two photos: each model's cosine on one scale, (cosine − the median of two different cats') / their spread, and the two averaged;
  // without a face in either, DINOv2's alone. A face counts only from a score of 0.6 (FACE): on the evaluation's photos real cat faces
  // scored 0.69–0.99 but one (0.43), while AnyFace also "found" faces of 0.56–0.72 in the tests' drawn rings, and below 0.6 in a drawn
  // triangle, which hid another cat. The medians and spreads are those of the browser's own numbers for the evaluation's 54 photos of
  // 13 cats (README.md, Progress, 7 Nov). WARN: below it, a record "may not be the cat" of a request (index.js); at it, the right cat was flagged
  // 5 % of the time with two or three photos a side, as v1's 0.40 was, and another cat 84–89 % (v1: 66–76 %).
  const Z = { e: [.2871, .1272], f: [.0793, .1445] }, WARN = 1.0, FACE = .6, face = v => v.f && v.fs >= FACE;
  const pair = (a, b) => { const d = (sim(a.e, b.e) - Z.e[0]) / Z.e[1]; return face(a) && face(b) ? (d + (sim(a.f, b.f) - Z.f[0]) / Z.f[1]) / 2 : d; };
  // IS THERE A CAT IN IT? (13 Nov) A hand against trousers came out "nothing points to another cat": the models compare whatever they are
  // given. A cat is there when YOLOS finds one (n), or gives a cat a chance of 0.1 or more in some box (pc: it can call a cat a dog), or
  // AnyFace finds a face and YOLOS gives a cat at least 0.01 (a close-up: AnyFace alone finds faces in a smiley, in drawn rings and in a
  // drawn person). Measured in the browser on 73 photos of real cats and 106 pictures of no cat (photos of screens, of a pallet, of a
  // forest; app screenshots; drawings, a drawn hand and trousers, noise): one cat missed (small, dark, in the grass: pc 0.07), no
  // picture taken for a cat (the highest pc, a photo of a laptop's screen: 0.04). Numbers kept before 13 Nov have no pc: YOLOS or a face.
  const PC = .1, PCF = .01, catIn = v => !!v && (v.n > 0 || (v.pc == null ? !!face(v) : v.pc >= PC || (!!face(v) && v.pc >= PCF)));

  // the records in the order of how much they look like a new cat: each photo of it finds its closest photo in a record (by pair()),
  // and the record's score is the mean of those. Only an order: with v2, one new photo against 13 cats' others, the right cat came
  // first 89 % of the time and among the first three 98 % (v1, DINOv2 alone: 63 % and 96 %); no score tells a recorded cat from a new
  // one, so the app shows the first three and says nothing more.
  // probe: [{ slot, sha256, bytes }]; recs: [{ id, photos: [{ slot, sha256 }] }]; bytesOf(sha) → bytes; slots: the views compared
  // (the nose, a close-up, is not); onStep(done, of): the records' photos, each worked out once
  async function rank(probe, recs, bytesOf, slots, onStep){ const use = p => !slots || slots.includes(p.slot), pv = [];
    for (const p of probe.filter(use)) { const v = await vecOf(p.sha256, p.bytes); if (v) pv.push(v); }
    const out = [], of = recs.reduce((s, r) => s + r.photos.filter(use).length, 0); let done = 0;
    for (const r of recs) { const best = pv.map(() => -Infinity); let top = -Infinity, sha = null;  /* sha: the record's photo most like one of the new ones, to show */
      for (const ph of r.photos.filter(use)) { const v = await vecOf(ph.sha256, () => bytesOf(ph.sha256)); done++; if (onStep) onStep(done, of); if (!v) continue;
        pv.forEach((q, i) => { const s = pair(q, v); best[i] = Math.max(best[i], s); if (s > top) { top = s; sha = ph.sha256; } }); }
      if (pv.length && Number.isFinite(best[0])) out.push({ id: r.id, s: best.reduce((a, b) => a + b, 0) / best.length, sha }); }
    return out.sort((a, b) => b.s - a.s); }

  return { V: 2, WARN, SIZE, FILES, KEEP, DIR, ROOT, here, keep, load, loaded: () => LOADED, vecOf, compute, sim, pair, Z, rank, catIn };
})();
