// Beat and downbeat tracking with Beat This! (Foscarin, Schlüter, Widmer, ISMIR 2024),
// run through ONNX Runtime. Feature extraction uses the published log-mel graph so the
// network sees exactly the features it was trained on.
// Chunking and the "minimal" post-processing follow beat_this/inference.py and
// beat_this/model/postprocessor.py.

export const BT = { sr: 22050, hop: 441, fps: 50, chunk: 1500, border: 6 };

const MEL_SEG_FRAMES = 3000; // compute the log-mel in 60 s segments to bound memory

// Log-mel frames [frames x 128] for mono 22.05 kHz audio. The STFT is centred with
// reflect padding, so interior segments are fed with two hops of real context on each
// side and those context frames are dropped; results equal a single pass.
export async function logMel(ort, session, audio) {
  const n = audio.length;
  const total = Math.floor(n / BT.hop) + 1;
  const out = new Float32Array(total * 128);
  const ctx = 2;
  for (let k0 = 0; k0 < total; k0 += MEL_SEG_FRAMES) {
    const k1 = Math.min(total, k0 + MEL_SEG_FRAMES);
    const first = k0 === 0;
    const last = k1 === total;
    const s0 = first ? 0 : (k0 - ctx) * BT.hop;
    const s1 = last ? n : Math.min(n, (k1 - 1 + ctx) * BT.hop + 1);
    const seg = audio.subarray(s0, s1);
    const res = await session.run({ audio: new ort.Tensor('float32', seg, [1, seg.length]) });
    const mel = res[session.outputNames[0]].data;
    const skip = first ? 0 : ctx;
    out.set(mel.subarray(skip * 128, (skip + (k1 - k0)) * 128), k0 * 128);
  }
  return { data: out, frames: total };
}

// Run the beat network over the whole piece in 30 s chunks (keep_first aggregation).
export async function beatLogits(ort, session, mel, onProgress) {
  const { chunk, border } = BT;
  const T = mel.frames;
  const beat = new Float32Array(T).fill(-1000);
  const down = new Float32Array(T).fill(-1000);
  const starts = [];
  for (let s = -border; s < T - border; s += chunk - 2 * border) starts.push(s);
  if (T > chunk - 2 * border) starts[starts.length - 1] = T - (chunk - border);
  const preds = [];
  for (let ci = 0; ci < starts.length; ci++) {
    const start = starts[ci];
    const a = Math.max(start, 0);
    const b = Math.min(start + chunk, T);
    const left = Math.max(0, -start);
    const right = Math.max(0, Math.min(border, start + chunk - T));
    const len = left + (b - a) + right;
    const x = new Float32Array(len * 128);
    x.set(mel.data.subarray(a * 128, b * 128), left * 128);
    const res = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', x, [1, len, 128]) });
    const ob = res[session.outputNames[0]].data;
    const od = res[session.outputNames[1]].data;
    preds.push({ start, beat: ob.slice(border, len - border), down: od.slice(border, len - border) });
    if (onProgress) onProgress((ci + 1) / starts.length);
  }
  // Reverse order so that earlier chunks overwrite later ones.
  for (let i = preds.length - 1; i >= 0; i--) {
    const p = preds[i];
    const off = p.start + border;
    for (let j = 0; j < p.beat.length; j++) {
      const t = off + j;
      if (t < 0 || t >= T) continue;
      beat[t] = p.beat[j];
      down[t] = p.down[j];
    }
  }
  return { beat, down, frames: T, fps: BT.fps };
}

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// Peaks: local maxima within +/-3 frames with logit > 0, adjacent peaks merged.
function pickPeaks(logits) {
  const T = logits.length;
  const peaks = [];
  for (let t = 0; t < T; t++) {
    const v = logits[t];
    if (v <= 0) continue;
    let isMax = true;
    for (let k = Math.max(0, t - 3); k <= Math.min(T - 1, t + 3); k++) if (logits[k] > v) { isMax = false; break; }
    if (isMax) peaks.push(t);
  }
  const out = [];
  let i = 0;
  while (i < peaks.length) {
    let j = i, sum = peaks[i];
    while (j + 1 < peaks.length && peaks[j + 1] - peaks[j] <= 1) { j++; sum += peaks[j]; }
    out.push(sum / (j - i + 1));
    i = j + 1;
  }
  return out;
}

// Sub-frame peak position by fitting a parabola through the logits around frame f.
// At 50 frames/s a beat is otherwise quantised to 20 ms, i.e. +/-4 % tempo at 140 BPM.
export function refinePeak(logits, f) {
  const k = Math.round(f);
  if (k <= 0 || k >= logits.length - 1) return f;
  const a = logits[k - 1], b = logits[k], c = logits[k + 1];
  const den = a - 2 * b + c;
  if (!(den < 0)) return f;
  const d = (0.5 * (a - c)) / den;
  return Math.abs(d) <= 0.5 ? k + d : f;
}

// The authors' recommended post-processing: no tempo model at all.
export function postMinimal(act, { refine = true } = {}) {
  const beats = pickPeaks(act.beat).map((f) => (refine ? refinePeak(act.beat, f) : f) / act.fps);
  const downs = pickPeaks(act.down).map((f) => f / act.fps);
  const snapped = new Set();
  for (const d of downs) {
    if (!beats.length) break;
    let best = 0;
    for (let i = 1; i < beats.length; i++) if (Math.abs(beats[i] - d) < Math.abs(beats[best] - d)) best = i;
    snapped.add(best);
  }
  return { beats, downbeatIdx: [...snapped].sort((a, b) => a - b) };
}

// Per-beat downbeat probability: max downbeat sigmoid within +/-2 frames of each beat.
export function beatDownProb(act, beats) {
  return beats.map((t) => {
    const f = Math.round(t * act.fps);
    let m = -1000;
    for (let k = f - 2; k <= f + 2; k++) if (k >= 0 && k < act.frames && act.down[k] > m) m = act.down[k];
    return sigmoid(m);
  });
}

// Per-beat tempo (BPM) from inter-beat intervals, plus a smoothed curve: local
// least-squares slope of beat time against beat index over +/-4 beats, after
// discarding intervals that are far from the local median (missed or extra beats).
export function tempoCurve(beats, half = 4) {
  const bpm = [];
  for (let i = 0; i + 1 < beats.length; i++) bpm.push(60 / (beats[i + 1] - beats[i]));
  const sm = bpm.map((_, i) => {
    const a = Math.max(0, i - half + 1), b = Math.min(beats.length - 1, i + half);
    const ibis = [];
    for (let j = a; j < b; j++) ibis.push(beats[j + 1] - beats[j]);
    const med = [...ibis].sort((x, y) => x - y)[ibis.length >> 1];
    // Robust slope: mean of intervals within 25 % of the local median.
    let s = 0, n = 0;
    for (const v of ibis) if (Math.abs(v / med - 1) < 0.25) { s += v; n++; }
    return 60 / (n ? s / n : med);
  });
  const sorted = [...sm].sort((a, b) => a - b);
  const q = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN;
  return { times: beats.slice(0, -1).map((t, i) => (t + beats[i + 1]) / 2), bpm, smooth: sm, p05: q(0.05), median: q(0.5), p95: q(0.95) };
}
