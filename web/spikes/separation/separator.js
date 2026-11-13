// Separation pipeline: model download and caching, ONNX Runtime sessions, and the
// chunked inference of the reference implementations (MSST demix for the spectral
// models, Demucs apply_model for HTDemucs), with STFT / iSTFT done here in JS.

import { stftPair, istftPair, makeWindow, padPair, fadeWindow, triangleWindow } from './dsp.js';

const CACHE_NAME = 'fabtice-separation-models-v1';
const ORT_DIR = new URL('./vendor/ort/', import.meta.url).href;

export const ENGINES = {
  native: { file: 'ort.webgpu.min.mjs', label: 'WebGPU natif (Dawn, asyncify)' },
  jsep: { file: 'ort.min.mjs', label: 'WebGPU JSEP (noyaux JavaScript)' },
};

const ortModules = {};

export async function loadOrt(engine, threads) {
  if (!ortModules[engine]) {
    const ort = await import(ORT_DIR + ENGINES[engine].file);
    ort.env.wasm.wasmPaths = ORT_DIR;
    ort.env.wasm.numThreads = threads;
    ort.env.logLevel = 'warning';
    ortModules[engine] = ort;
  }
  return ortModules[engine];
}

// ---------------------------------------------------------------- model files

async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Models are kept in Cache Storage; when that refuses a large file (seen in Chromium for
// 353 MB), in the origin private file system (OPFS) under their SHA-256.
async function opfsDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('fabtice-models', { create: true });
}

async function readStored(model) {
  const errors = [];
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(model.url);
    if (hit) {
      const bytes = new Uint8Array(await hit.arrayBuffer());
      if (bytes.length === model.bytes) return { bytes, store: 'Cache Storage' };
      await cache.delete(model.url);
    }
  } catch (e) { errors.push('cache : ' + String(e && e.message || e)); }
  try {
    const fh = await (await opfsDir()).getFileHandle(model.sha256 + '.onnx');
    const file = await fh.getFile();
    if (file.size === model.bytes) return { bytes: new Uint8Array(await file.arrayBuffer()), store: 'OPFS' };
  } catch (e) {
    if (!(e && e.name === 'NotFoundError')) errors.push('OPFS : ' + String(e && e.message || e));
  }
  return { bytes: null, errors };
}

async function store(model, bytes) {
  const errors = [];
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(model.url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));
    return { store: 'Cache Storage', errors };
  } catch (e) { errors.push('cache : ' + String(e && e.message || e)); }
  try {
    const fh = await (await opfsDir()).getFileHandle(model.sha256 + '.onnx', { create: true });
    const w = await fh.createWritable();
    await w.write(bytes);
    await w.close();
    return { store: 'OPFS', errors };
  } catch (e) { errors.push('OPFS : ' + String(e && e.message || e)); }
  return { store: null, errors };
}

// Returns { bytes: Uint8Array, fromCache, store, seconds, cacheError }.
export async function fetchModel(model, onProgress) {
  const t0 = performance.now();
  const hit = await readStored(model);
  if (hit.bytes) return { bytes: hit.bytes, fromCache: true, store: hit.store, seconds: (performance.now() - t0) / 1000 };
  const resp = await fetch(model.url, { mode: 'cors', credentials: 'omit' });
  if (!resp.ok) throw new Error(`téléchargement du modèle : HTTP ${resp.status}`);
  const total = model.bytes;
  const bytes = new Uint8Array(total);
  const reader = resp.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (got + value.length > total) throw new Error('taille du modèle inattendue');
    bytes.set(value, got);
    got += value.length;
    onProgress && onProgress(got / total);
  }
  if (got !== total) throw new Error(`modèle incomplet (${got} / ${total} octets)`);
  const hash = await sha256Hex(bytes);
  if (hash !== model.sha256) throw new Error('empreinte SHA-256 du modèle incorrecte');
  const seconds = (performance.now() - t0) / 1000;
  const saved = await store(model, bytes);
  const errs = hit.errors.concat(saved.errors);
  return { bytes, fromCache: false, store: saved.store, seconds, cacheError: errs.length ? errs.join(' ; ') : null };
}

export async function clearModelCache() {
  await caches.delete(CACHE_NAME);
  try { await (await navigator.storage.getDirectory()).removeEntry('fabtice-models', { recursive: true }); } catch (_) { /* none */ }
}

// ---------------------------------------------------------------- sessions

// Collects ONNX Runtime console output while a session is created (placement warnings).
function captureConsole() {
  const lines = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const grab = (kind) => (...args) => {
    const s = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
    if (/onnxruntime|ort|placed on|Number of nodes|not assigned|fallback|WebGPU|webgpu/i.test(s)) lines.push(s.slice(0, 400));
    orig[kind].apply(console, args);
  };
  console.log = grab('log'); console.warn = grab('warn'); console.error = grab('error'); console.info = grab('info');
  return { lines, restore() { Object.assign(console, orig); } };
}

// Creates a session on the requested backend; 'auto' tries WebGPU then WebAssembly.
// Returns { session, backend, seconds, attempts: [{backend, error}], logs }.
export async function createSession(ort, bytes, backend, verbose) {
  const order = backend === 'auto' ? ['webgpu', 'wasm'] : [backend];
  const attempts = [];
  for (const ep of order) {
    if (ep === 'webgpu' && !navigator.gpu) {
      attempts.push({ backend: ep, error: 'navigator.gpu absent' });
      continue;
    }
    const cap = captureConsole();
    const t0 = performance.now();
    try {
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: [ep],
        graphOptimizationLevel: 'all',
        freeDimensionOverrides: { batch: 1 },
        logSeverityLevel: verbose ? 0 : 2,
        logVerbosityLevel: 0,
      });
      cap.restore();
      return { session, backend: ep, seconds: (performance.now() - t0) / 1000, attempts, logs: cap.lines };
    } catch (e) {
      cap.restore();
      attempts.push({ backend: ep, error: String(e && e.message || e) });
    }
  }
  const err = new Error('aucun backend n’a pu charger le modèle : ' + attempts.map((a) => `${a.backend}: ${a.error}`).join(' | '));
  err.attempts = attempts;
  throw err;
}

// ---------------------------------------------------------------- per-chunk runners

// Each runner turns one stereo chunk (Float32Array pair of model.segment samples) into
// stems[s] = [left, right] of the same length. prepare() is synchronous CPU work,
// run() is the ONNX call, finish() the CPU post-processing; splitting them lets the
// caller overlap a chunk's post-processing with the next chunk's GPU inference.
function makeRunner(model, ort, session) {
  const st = { ...model.stft, window: makeWindow(model.stft.window, model.stft.nfft) };
  const S = model.stems.length;

  if (model.io === 'scnet') {
    // SCNet.forward pads the end so that the frame count is even.
    const hop = st.hop;
    let pad = hop - (model.segment % hop);
    if (((model.segment + pad) / hop) % 2 === 0) pad += hop;
    return {
      prepare(l, r) {
        const [pl, pr] = padPair(l, r, 0, pad, 'zero');
        const z = stftPair(pl, pr, st);
        const n = z.F * z.T;
        const x = new Float32Array(4 * n);
        x.set(z.lre, 0); x.set(z.lim, n); x.set(z.rre, 2 * n); x.set(z.rim, 3 * n);
        return { feeds: { mix_spec: new ort.Tensor('float32', x, [1, 4, z.F, z.T]) }, F: z.F, T: z.T };
      },
      finish(p, out) {
        const y = out.stems_spec.data, n = p.F * p.T, stems = [];
        for (let s = 0; s < S; s++) {
          const b = (c, k) => y.subarray(((s * 2 + c) * 2 + k) * n, ((s * 2 + c) * 2 + k + 1) * n);
          const [L, R] = istftPair({ lre: b(0, 0), lim: b(0, 1), rre: b(1, 0), rim: b(1, 1) }, p.F, p.T, st, model.segment + pad);
          stems.push([L.subarray(0, model.segment), R.subarray(0, model.segment)]);
        }
        return stems;
      },
    };
  }

  if (model.io === 'roformer') {
    return {
      prepare(l, r) {
        const z = stftPair(l, r, st);
        const n = z.F * z.T;
        const re = new Float32Array(2 * n), im = new Float32Array(2 * n);
        re.set(z.lre, 0); re.set(z.rre, n); im.set(z.lim, 0); im.set(z.rim, n);
        return {
          feeds: {
            spec_real: new ort.Tensor('float32', re, [1, 2, z.F, z.T]),
            spec_imag: new ort.Tensor('float32', im, [1, 2, z.F, z.T]),
          },
          F: z.F, T: z.T,
        };
      },
      finish(p, out) {
        const yr = out.out_spec_real.data, yi = out.out_spec_imag.data, n = p.F * p.T, stems = [];
        for (let s = 0; s < S; s++) {
          const b = (y, c) => y.subarray((s * 2 + c) * n, (s * 2 + c + 1) * n);
          stems.push(istftPair({ lre: b(yr, 0), lim: b(yi, 0), rre: b(yr, 1), rim: b(yi, 1) }, p.F, p.T, st, model.segment));
        }
        return stems;
      },
    };
  }

  if (model.io === 'unblend-demucs') {
    // HTDemucs._spec / _ispec framing: reflect pad by 3/4 hop, drop the Nyquist bin and two edge frames.
    const hop = st.hop, seg = model.segment;
    const le = Math.ceil(seg / hop);
    const pad = (hop / 2) * 3;
    const F = st.nfft / 2, T = le;
    return {
      prepare(l, r) {
        const [pl, pr] = padPair(l, r, pad, pad + le * hop - seg, 'reflect');
        const z = stftPair(pl, pr, st);
        const n = F * T;
        const re = new Float32Array(2 * n), im = new Float32Array(2 * n);
        for (let k = 0; k < F; k++) {
          const src = k * z.T + 2, dst = k * T;
          re.set(z.lre.subarray(src, src + T), dst);
          re.set(z.rre.subarray(src, src + T), n + dst);
          im.set(z.lim.subarray(src, src + T), dst);
          im.set(z.rim.subarray(src, src + T), n + dst);
        }
        const audio = new Float32Array(2 * seg);
        audio.set(l, 0); audio.set(r, seg);
        return {
          feeds: {
            spec_real: new ort.Tensor('float32', re, [1, 2, F, T]),
            spec_imag: new ort.Tensor('float32', im, [1, 2, F, T]),
            audio: new ort.Tensor('float32', audio, [1, 2, seg]),
          },
        };
      },
      finish(p, out) {
        const yr = out.out_spec_real.data, yi = out.out_spec_imag.data, w = out.out_wave.data;
        const n = F * T, stems = [];
        for (let s = 0; s < S; s++) {
          const b = (y, c) => y.subarray((s * 2 + c) * n, (s * 2 + c + 1) * n);
          const [L, R] = istftPair({ lre: b(yr, 0), lim: b(yi, 0), rre: b(yr, 1), rim: b(yi, 1) }, F, T, st,
            le * hop + 2 * pad, 2, T + 4);
          const outL = new Float32Array(seg), outR = new Float32Array(seg);
          const wl = (s * 2) * seg, wr = (s * 2 + 1) * seg;
          for (let i = 0; i < seg; i++) {
            outL[i] = L[pad + i] + w[wl + i];
            outR[i] = R[pad + i] + w[wr + i];
          }
          stems.push([outL, outR]);
        }
        return stems;
      },
    };
  }
  throw new Error('modèle inconnu : ' + model.io);
}

function disposeAll(outputs) {
  for (const k in outputs) {
    try { outputs[k].dispose(); } catch (_) { /* CPU tensors */ }
  }
}

// ---------------------------------------------------------------- chunk plans

// Describes the chunks of a track: for each, where its input is read and how its
// output is weighted back. Mirrors MSST demix (generic mode, batch size 1) and
// Demucs apply_model (split=True, shifts=0).
function planChunks(model, length) {
  const seg = model.segment;
  if (model.family === 'msst') {
    const step = Math.floor(seg / model.overlap);
    const fade = Math.floor(seg / 10);
    const border = seg - step;
    const padded = length > 2 * border && border > 0;
    const total = padded ? length + 2 * border : length;
    const chunks = [];
    for (let i = 0; i < total; i += step) chunks.push({ start: i, len: Math.min(seg, total - i) });
    const base = fadeWindow(seg, fade);
    chunks.forEach((c, j) => {
      const w = base.slice();
      if (j === 0) w.fill(1, 0, fade);
      if (j === chunks.length - 1) w.fill(1, seg - fade);
      c.weight = w;
      c.trim = 0;
    });
    return { chunks, total, border: padded ? border : 0 };
  }
  // demucs
  const stride = Math.floor((1 - model.overlap) * seg);
  const weight = triangleWindow(seg);
  const chunks = [];
  for (let off = 0; off < length; off += stride) {
    const len = Math.min(seg, length - off);
    const delta = seg - len;
    chunks.push({ start: off, len, readStart: off - Math.floor(delta / 2), trim: Math.floor(delta / 2), weight });
  }
  return { chunks, total: length, border: 0 };
}

function meanStd(l, r, unbiased) {
  const n = l.length;
  let m = 0;
  for (let i = 0; i < n; i++) m += (l[i] + r[i]) * 0.5;
  m /= n;
  let v = 0;
  for (let i = 0; i < n; i++) { const d = (l[i] + r[i]) * 0.5 - m; v += d * d; }
  v /= unbiased ? n - 1 : n;
  return [m, Math.sqrt(v) || 1];
}

// Reads the input of one chunk as the reference does.
function chunkInput(model, plan, c, xl, xr) {
  const seg = model.segment;
  const l = new Float32Array(seg), r = new Float32Array(seg);
  if (model.family === 'msst') {
    const pl = xl.subarray(c.start, c.start + c.len), pr = xr.subarray(c.start, c.start + c.len);
    if (c.len === seg) { l.set(pl); r.set(pr); return [l, r]; }
    return padPair(pl, pr, 0, seg - c.len, c.len > seg / 2 ? 'reflect' : 'zero');
  }
  const n = xl.length;
  for (let i = 0; i < seg; i++) {
    const s = c.readStart + i;
    if (s >= 0 && s < n) { l[i] = xl[s]; r[i] = xr[s]; }
  }
  return [l, r];
}

// ---------------------------------------------------------------- whole track

// A backend that silently computes garbage (zeros, NaN) must not pass for a result:
// the stems of the first chunk must be finite and carry a sensible share of its energy.
function checkOutput(stems, input, len) {
  let ein = 0, eout = 0;
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < len; i++) ein += input[ch][i] * input[ch][i];
  for (const st of stems) {
    for (let ch = 0; ch < 2; ch++) {
      const x = st[ch];
      for (let i = 0; i < len; i++) {
        const v = x[i];
        if (!Number.isFinite(v)) { const e = new Error('le modèle a rendu des valeurs invalides (NaN)'); e.code = 'BAD_OUTPUT'; throw e; }
        eout += v * v;
      }
    }
  }
  if (ein > 1e-3 && eout < ein * 1e-4) {
    const e = new Error('le modèle a rendu des pistes presque vides');
    e.code = 'BAD_OUTPUT';
    throw e;
  }
}

// Separates a stereo track. Returns { stems: {name: [L, R]}, chunkTimes, seconds }.
export async function separate(model, ort, session, left, right, { onProgress, signal } = {}) {
  const t0 = performance.now();
  const runner = makeRunner(model, ort, session);
  const S = model.stems.length;
  const length = left.length;

  // Track normalization: MSST's normalize_audio (mono mean / std) or Demucs' (unbiased std).
  let mean = 0, std = 1;
  const norm = model.family === 'demucs' || model.normalize;
  if (norm) [mean, std] = meanStd(left, right, model.family === 'demucs');
  let xl = new Float32Array(length), xr = new Float32Array(length);
  for (let i = 0; i < length; i++) { xl[i] = (left[i] - mean) / std; xr[i] = (right[i] - mean) / std; }

  const plan = planChunks(model, length);
  if (plan.border) [xl, xr] = padPair(xl, xr, plan.border, plan.border, 'reflect');
  const total = plan.total;
  const acc = Array.from({ length: S }, () => [new Float32Array(total), new Float32Array(total)]);
  const counter = new Float32Array(total);
  const chunkTimes = [];

  const start = (j) => {
    const c = plan.chunks[j];
    const [l, r] = chunkInput(model, plan, c, xl, xr);
    const p = runner.prepare(l, r);
    const t = performance.now();
    return { p, t, input: [l, r], promise: session.run(p.feeds) };
  };

  let pending = start(0);
  let tPrev = performance.now();
  for (let j = 0; j < plan.chunks.length; j++) {
    if (signal && signal.aborted) throw new Error('séparation interrompue');
    const cur = pending;
    const out = await cur.promise;
    const tDone = performance.now();
    const tRun = tDone - cur.t;
    if (j + 1 < plan.chunks.length) {
      pending = start(j + 1);
      // Let ONNX Runtime submit the next chunk's GPU work before this chunk's iSTFT.
      await new Promise((res) => setTimeout(res, 0));
    }
    const tp = performance.now();
    const stems = runner.finish(cur.p, out);
    disposeAll(out);
    const c = plan.chunks[j];
    if (j === 0) checkOutput(stems, cur.input, c.len);
    for (let s = 0; s < S; s++) {
      for (let ch = 0; ch < 2; ch++) {
        const src = stems[s][ch], dst = acc[s][ch];
        for (let i = 0; i < c.len; i++) dst[c.start + i] += src[c.trim + i] * c.weight[i];
      }
    }
    for (let i = 0; i < c.len; i++) counter[c.start + i] += c.weight[i];
    chunkTimes.push({ run: tRun / 1000, post: (performance.now() - tp) / 1000, wall: (tDone - tPrev) / 1000 });
    tPrev = tDone;
    onProgress && onProgress((j + 1) / plan.chunks.length, j + 1, plan.chunks.length);
    if (j + 1 >= plan.chunks.length) await new Promise((res) => setTimeout(res, 0));
  }

  const result = {};
  for (let s = 0; s < S; s++) {
    const out = [new Float32Array(length), new Float32Array(length)];
    for (let ch = 0; ch < 2; ch++) {
      const a = acc[s][ch];
      for (let i = 0; i < length; i++) {
        const k = i + plan.border;
        const v = a[k] / counter[k];
        out[ch][i] = (Number.isFinite(v) ? v : 0) * std + mean;
      }
    }
    result[model.stems[s]] = out;
    acc[s] = null;
  }
  return { stems: result, chunkTimes, seconds: (performance.now() - t0) / 1000, chunks: plan.chunks.length };
}

// Seconds of compute per second of audio for one chunk's time, given the chunk plan.
export function rtfFromChunkTime(model, chunkSeconds) {
  const segSec = model.segment / 44100;
  const audioPerChunk = model.family === 'msst' ? segSec / model.overlap : segSec * (1 - model.overlap);
  return chunkSeconds / audioPerChunk;
}

// Benchmark: runs `n` chunks of a synthetic signal (with post-processing) and returns the times.
export async function benchmarkChunks(model, ort, session, n = 3) {
  const runner = makeRunner(model, ort, session);
  const seg = model.segment;
  const l = new Float32Array(seg), r = new Float32Array(seg);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) - 0.5;
  for (let i = 0; i < seg; i++) {
    const t = i / 44100;
    const tone = 0.2 * Math.sin(2 * Math.PI * 220 * t) + 0.1 * Math.sin(2 * Math.PI * 55 * t);
    l[i] = tone + 0.05 * rnd();
    r[i] = tone * 0.8 + 0.05 * rnd();
  }
  const times = [];
  for (let k = 0; k < n; k++) {
    const t0 = performance.now();
    const p = runner.prepare(l, r);
    const out = await session.run(p.feeds);
    const stems = runner.finish(p, out);
    disposeAll(out);
    times.push((performance.now() - t0) / 1000);
    if (k === 0) checkOutput(stems, [l, r], seg);
    await new Promise((res) => setTimeout(res, 0));
  }
  return times;
}
