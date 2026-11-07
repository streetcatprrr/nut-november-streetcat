// The cat recognition, away from the page (catid.js asks, this answers). onnxruntime-web 1.30.0 (MIT; WebAssembly, one thread)
// runs two small models kept with the app in ai/1/: YOLOS-tiny finds the cat in a photo, DINOv2 small turns the cat into 384
// numbers (ai/1/LICENSES.txt says where each file comes from). Nothing leaves the phone. Messages, each with its id:
//   { op: 'load' }                 → { ok } after every file is here and both models are open, with { op: 'progress', got, of } on the way
//   { op: 'find', x, dims }        → { logits, ldims, boxes }   YOLOS-tiny, x = the photo, normalised, 1 × 3 × H × W
//   { op: 'embed', x, dims }       → { e }                      DINOv2 small, x = the cat, normalised, 1 × 3 × 224 × 224; e = its CLS token
// Version 2 adds two, in ai/2/ (ai/2/LICENSES.txt): AnyFace finds the cat's face and five points, PetFace turns the face into 512 numbers.
//   { op: 'face', x, dims }        → { o, dims }                AnyFace, x = the photo on grey, 1 × 3 × 384 × 384, 0–1; o: per box x, y, w, h, object, 5 points, class
//   { op: 'pet', x, dims }         → { e }                      PetFace, x = the face on the template, normalised, 1 × 3 × 224 × 224
import * as ort from './ai/1/ort.wasm.bundle.min.js';
ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;  // no SharedArrayBuffer without cross-origin isolation: one thread
const FILES = [['ai/1/ort-wasm-simd-threaded.wasm', 14239897], ['ai/1/yolos-tiny-q8.onnx', 9661148], ['ai/1/dinov2-small-q8.onnx', 24427763], ['ai/2/anyface-384-q8.onnx', 47598496], ['ai/2/petface-r50-q8.onnx', 24731418]], OF = FILES.reduce((s, f) => s + f[1], 0);
let LOADING = null, FIND = null, EMBED = null, FACE = null, PET = null;
async function fetchAll(id){ let got = 0, last = 0; const out = [];
  for (const [f, size] of FILES) { const res = await fetch(new URL(f, import.meta.url)); if (!res.ok) throw new Error(`${f.split('/').pop()} could not be fetched (${res.status})`);
    if (!res.body || !res.body.getReader) { const b = new Uint8Array(await res.arrayBuffer()); got += b.length; out.push(b); continue; }
    const rd = res.body.getReader(), parts = []; let n = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; got += value.length;
      if (got - last > 512 * 1024) { last = got; postMessage({ op: 'progress', id, got, of: OF }); } }
    const b = new Uint8Array(n); let o = 0; for (const p of parts) { b.set(p, o); o += p.length; } if (size && n !== size) throw new Error(`${f.split('/').pop()} came incomplete (${n} of ${size} bytes)`); out.push(b); }
  postMessage({ op: 'progress', id, got: OF, of: OF }); return out; }
const load = id => LOADING || (LOADING = (async () => { const [wasm, find, embed, face, pet] = await fetchAll(id); ort.env.wasm.wasmBinary = wasm;
  const opt = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  FIND = await ort.InferenceSession.create(find, opt); EMBED = await ort.InferenceSession.create(embed, opt); FACE = await ort.InferenceSession.create(face, opt); PET = await ort.InferenceSession.create(pet, opt); })().catch(e => { LOADING = null; throw e; }));
onmessage = async ({ data: m }) => { try {
    if (m.op === 'load') { await load(m.id); postMessage({ id: m.id, ok: true }); return; }
    await load(m.id); const s = { find: FIND, embed: EMBED, face: FACE, pet: PET }[m.op]; if (!s) throw new Error('unknown op ' + m.op);
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', m.x, m.dims) });
    if (m.op === 'find') { const l = out.logits, b = out.pred_boxes; postMessage({ id: m.id, logits: l.data, ldims: l.dims, boxes: b.data }); return; }  /* copied, small */
    if (m.op === 'face') { const t = out[s.outputNames[0]], o = t.data.slice(); postMessage({ id: m.id, o, dims: t.dims }, [o.buffer]); return; }  /* a copy, sent */
    if (m.op === 'pet') { const e = out[s.outputNames[0]].data.slice(); postMessage({ id: m.id, e }, [e.buffer]); return; }
    const h = out.last_hidden_state, e = h.data.slice(0, h.dims[2]); postMessage({ id: m.id, e }, [e.buffer]);
  } catch (e) { postMessage({ id: m.id, error: String((e && e.message) || e) }); } };
