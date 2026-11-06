// Which cat is this? A hint on the phone, never a proof (StreetCat, 6 Nov: «sí, empieza»). A photo is cut down to its cat (YOLOS-tiny)
// and turned into 384 numbers (DINOv2 small); photos of one cat give numbers close to each other. Chosen on 6 Nov among four models,
// on 58 photos of 14 named cats from Wikimedia Commons (docs/HANDOFF.md). The models run in catid-worker.js; their files (ai/1/,
// 48 MB) come only when the clinic or Streetcat asks for them, and then the service worker keeps them, for without a connection.
// A photo's numbers are kept here, in IndexedDB, under the photo's SHA-256, so each photo is worked out once.
const CATID = (() => {
  const DIR = new URL('ai/1/', location.href).href, TAG = 'catid1', CAT = 17;  // COCO's class 17: cat
  const MEAN = [.485, .456, .406], STD = [.229, .224, .225], PAD = MEAN.map(m => Math.trunc(m * 255));
  const FILES = ['ort-wasm-simd-threaded.wasm', 'yolos-tiny-q8.onnx', 'dinov2-small-q8.onnx'], SIZE = 48328808;

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
  async function pixels(bytes){ const bmp = await createImageBitmap(new Blob([bytes])), w = bmp.width, h = bmp.height;
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
  async function load(onProgress){ progress = onProgress || null; try { await call({ op: 'load' }); LOADED = true; } finally { progress = null; } }
  // are its files kept on this phone, for without a connection? (the engine's code too: the worker imports it)
  const AI = 'streetcat-ai-1', KEEP = { 'ort.wasm.bundle.min.js': 73054, 'ort-wasm-simd-threaded.wasm': 14239897, 'yolos-tiny-q8.onnx': 9661148, 'dinov2-small-q8.onnx': 24427763 };
  async function here(){ try { if (!self.caches) return false; for (const f in KEEP) if (!(await caches.match(DIR + f))) return false; return true; } catch (_) { return false; } }
  // Offline setup: the files kept ahead of time, on wifi, without starting the recognition, in the service worker's copy (sw.js reads
  // it under the same name, AI), so this works even before the service worker controls the page; what is kept already is skipped
  async function keep(onProgress){ const c = await caches.open(AI), all = Object.values(KEEP).reduce((s, n) => s + n, 0); let got = 0;
    for (const [f, size] of Object.entries(KEEP)) { const u = DIR + f; if (await c.match(u)) { got += size; continue; }
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
    for (let q = 0; q < Q; q++) { const L = r.logits.subarray(q * K, q * K + K); let mx = -Infinity, am = 0; for (let k = 0; k < K; k++) if (L[k] > mx) { mx = L[k]; am = k; }
      if (am !== CAT) continue; let z = 0; for (let k = 0; k < K; k++) z += Math.exp(L[k] - mx); if (1 / z > .5) found.push([1 / z, Array.from(r.boxes.subarray(q * 4, q * 4 + 4))]); }
    found.sort((a, b) => b[0] - a[0]);
    let x0 = 0, y0 = 0, x1 = w, y1 = h, p = 0, n = 0;
    if (found.length) { const [cx, cy, bw, bh] = found[0][1], m = .1; p = found[0][0]; n = 1 + found.slice(1).filter(([q, b]) => q > .7 && iou(b, found[0][1]) < .3).length;
      x0 = Math.trunc(Math.max(0, (cx - bw / 2 - m * bw) * w)); y0 = Math.trunc(Math.max(0, (cy - bh / 2 - m * bh) * h)); x1 = Math.trunc(Math.min(w, (cx + bw / 2 + m * bw) * w)); y1 = Math.trunc(Math.min(h, (cy + bh / 2 + m * bh) * h)); }
    const cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0), side = Math.max(cw, ch), sq = new Uint8Array(side * side * 3), ox = Math.floor((side - cw) / 2), oy = Math.floor((side - ch) / 2);
    for (let i = 0; i < side * side; i++) { sq[i * 3] = PAD[0]; sq[i * 3 + 1] = PAD[1]; sq[i * 3 + 2] = PAD[2]; }
    for (let y = 0; y < ch; y++) sq.set(px.subarray(((y0 + y) * w + x0) * 3, ((y0 + y) * w + x0 + cw) * 3), ((oy + y) * side + ox) * 3);
    const { e } = await call({ op: 'embed', x: tensor(resize(sq, side, side, 256, 256, CUBIC), 256, 256, 16, 16, 224), dims: [1, 3, 224, 224] });
    let t = 0; for (const v of e) t += v * v; t = Math.sqrt(t) || 1; for (let i = 0; i < e.length; i++) e[i] /= t;
    return { e, box: [x0, y0, x1, y1], p, n }; }

  // kept: the numbers of a photo, under its SHA-256
  const DB = (() => { let d = null;
    const open = () => d || (d = new Promise((res, rej) => { const r = indexedDB.open('streetcat-catid', 1); r.onupgradeneeded = () => r.result.createObjectStore('vec'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }).catch(e => { d = null; throw e; }));
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction('vec', mode), q = fn(t.objectStore('vec')); t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error); }));
    return { get: k => run('readonly', s => s.get(k)), put: (k, v) => run('readwrite', s => s.put(v, k)) }; })();
  async function vecOf(sha, bytes){ const k = TAG + ':' + sha; try { const v = await DB.get(k); if (v && v.e) return v; } catch (_) {}
    const b = typeof bytes === 'function' ? await bytes() : bytes; if (!b) return null; const v = await compute(b); try { await DB.put(k, v); } catch (_) {} return v; }
  const sim = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

  // the records in the order of how much they look like a new cat: each photo of it finds its closest photo in a record, and the
  // record's score is the mean of those. Only an order: in the evaluation the right record came first 66 % of the time and among the
  // first three 97 % (one new photo, 14 records), but no score told a cat already recorded from a new one (to warn of only one new
  // cat in ten, it would have warned of three recorded cats in ten), so the app shows the first three and says nothing more.
  // probe: [{ slot, sha256, bytes }]; recs: [{ id, photos: [{ slot, sha256 }] }]; bytesOf(sha) → bytes; slots: the views compared
  // (the nose, a close-up, is not); onStep(done, of): the records' photos, each worked out once
  async function rank(probe, recs, bytesOf, slots, onStep){ const use = p => !slots || slots.includes(p.slot), pv = [];
    for (const p of probe.filter(use)) { const v = await vecOf(p.sha256, p.bytes); if (v) pv.push(v); }
    const out = [], of = recs.reduce((s, r) => s + r.photos.filter(use).length, 0); let done = 0;
    for (const r of recs) { const best = pv.map(() => -2); let top = -2, sha = null;  /* sha: the record's photo most like one of the new ones, to show */
      for (const ph of r.photos.filter(use)) { const v = await vecOf(ph.sha256, () => bytesOf(ph.sha256)); done++; if (onStep) onStep(done, of); if (!v) continue;
        pv.forEach((q, i) => { const s = sim(q.e, v.e); best[i] = Math.max(best[i], s); if (s > top) { top = s; sha = ph.sha256; } }); }
      if (pv.length && best[0] > -2) out.push({ id: r.id, s: best.reduce((a, b) => a + b, 0) / best.length, sha }); }
    return out.sort((a, b) => b.s - a.s); }

  return { SIZE, FILES, DIR, here, keep, load, loaded: () => LOADED, vecOf, compute, sim, rank };
})();
