// The whole browser-side chain in onnxruntime-web (WASM) under Node, on one bench file:
// decode at 48 kHz -> resampleTo25600 -> weight-free graph + the author's safetensors as
// external data -> runTsumugi with the app-detected beats and key. Prints the time per 30 s
// window, the total, the peak memory, and the agreement with the Python run of
// bench_precompute.py (data/modeles/tsumugi/<sha>.f32), when there is one.
//
//   node --experimental-strip-types --no-warnings ts/wasm-song.ts <audio> [threads] [--noinfo]
// (ORT_DIR: onnxruntime-web folder, default ../node_modules/onnxruntime-web)

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resampleTo25600 } from '../../../../../app/src/analysis/engine/tsumugiFeatures.ts';
import {
  BEAT_FEATURES,
  KEY_FEATURES,
  WINDOW_FRAMES,
  WINDOW_SAMPLES,
  beatFeatures,
  keyFeatures,
  stitch,
  windowPlan,
  windowWave,
  type KeySpan,
} from '../../../../../app/src/analysis/engine/tsumugiFeatures.ts';

// The window loop of app/src/analysis/engine/tsumugi.ts#runTsumugi (that file imports
// without extensions, which Node's type stripping cannot load): the same steps.
interface TsumugiInfo {
  beats: readonly number[];
  downbeats: readonly number[];
  keys: readonly KeySpan[];
}
async function runTsumugi(Tensor: any, session: any, left: Float32Array, right: Float32Array, info: TsumugiInfo | null, onWindow: () => void) {
  const { frames, windows } = windowPlan(left.length);
  const detail = new Float32Array(frames * 745);
  for (const w of windows) {
    const start = w.start / 25;
    const r = await session.run({
      wave: new Tensor('float32', windowWave(left, right, w), [1, 2, WINDOW_SAMPLES]),
      beats: new Tensor('float32', info ? beatFeatures(info.beats, info.downbeats, start) : new Float32Array(WINDOW_FRAMES * BEAT_FEATURES), [1, WINDOW_FRAMES, BEAT_FEATURES]),
      keys: new Tensor('float32', info ? keyFeatures(info.keys, start) : new Float32Array(WINDOW_FRAMES * KEY_FEATURES), [1, WINDOW_FRAMES, KEY_FEATURES]),
    });
    stitch(detail, r.detail.data as Float32Array, w, 745);
    onWindow();
  }
  return { frames, detail };
}

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const audio = args[0]!;
const threads = Number(args[1] ?? 1);
const noinfo = args.includes('--noinfo');
const data = process.env.BANC_DATA ?? '/home/user/banc/data';
const ortDir = process.env.ORT_DIR ?? join(here, '..', '..', 'node_modules', 'onnxruntime-web');
const ort = await import('file://' + join(ortDir, 'dist', 'ort.node.min.mjs'));
ort.env.wasm.numThreads = threads;
ort.env.logLevel = 'error';

let peak = 0;
const sample = () => (peak = Math.max(peak, process.memoryUsage().rss));
const timer = setInterval(sample, 50);

const graph = readFileSync(join(here, '..', 'cache', 'tsumugi-chords.graph.onnx'));
const weights = new Uint8Array(readFileSync(join(here, '..', 'cache', 'tsumugi-model.safetensors')));
const t0 = performance.now();
const session = await ort.InferenceSession.create(graph, {
  executionProviders: ['wasm'],
  externalData: [{ path: 'chord-model.safetensors', data: weights }],
});
const tLoad = (performance.now() - t0) / 1000;

const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', audio, '-f', 'f32le', '-ac', '2', '-ar', '48000', '-'], { maxBuffer: 2 ** 31 });
const inter = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
const n = inter.length / 2;
const l48 = new Float32Array(n);
const r48 = new Float32Array(n);
for (let i = 0; i < n; i++) {
  l48[i] = inter[2 * i]!;
  r48[i] = inter[2 * i + 1]!;
}
const t1 = performance.now();
const left = resampleTo25600(l48, 48_000);
const right = resampleTo25600(r48, 48_000);
const tRes = (performance.now() - t1) / 1000;

const sha = createHash('sha256').update(readFileSync(audio)).digest('hex');
let info: TsumugiInfo | null = null;
const gridFile = join(data, 'modeles', 'app-grid', `${sha}.json`);
if (!noinfo && existsSync(gridFile)) {
  const g = JSON.parse(readFileSync(gridFile, 'utf8')) as { beats: [number, number][]; key: string | null };
  info = {
    beats: g.beats.map((b) => b[0]),
    downbeats: g.beats.filter((b) => b[1] === 1).map((b) => b[0]),
    keys: g.key ? [{ start: 0, end: n / 48_000, key: g.key }] : [],
  };
}
const times: number[] = [];
let last = performance.now();
const t2 = performance.now();
const out = await runTsumugi(ort.Tensor, session, left, right, info, () => {
  const now = performance.now();
  times.push((now - last) / 1000);
  last = now;
});
const tRun = (performance.now() - t2) / 1000;
sample();
clearInterval(timer);
const seconds = n / 48_000;
console.log(
  `${audio.split('/').slice(-3).join('/')}: ${seconds.toFixed(0)} s of audio, ${threads} thread(s), info ${info ? 'app' : 'none'}\n` +
    `  load ${tLoad.toFixed(1)} s, resample ${tRes.toFixed(1)} s, ${times.length} windows: ${times.map((t) => t.toFixed(1)).join(' ')} s\n` +
    `  model ${tRun.toFixed(1)} s = RTF ${(tRun / seconds).toFixed(2)}; peak RSS ${(peak / 2 ** 20).toFixed(0)} MB`,
);
const ref = join(data, 'modeles', noinfo ? 'tsumugi-noinfo' : 'tsumugi', `${sha}.f32`);
if (existsSync(ref)) {
  const meta = JSON.parse(readFileSync(ref.replace(/\.f32$/, '.json'), 'utf8')) as { T: number; C: number };
  const buf = readFileSync(ref);
  const py = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + meta.T * meta.C * 4));
  const T = Math.min(meta.T, out.frames);
  let same = 0;
  let sameRoot = 0;
  for (let t = 0; t < T; t++) {
    let a = 0;
    let b = 0;
    for (let c = 1; c < 745; c++) {
      if (out.detail[t * 745 + c]! > out.detail[t * 745 + a]!) a = c;
      if (py[t * 745 + c]! > py[t * 745 + b]!) b = c;
    }
    if (a === b) same++;
    if ((a === 744 ? -1 : a % 12) === (b === 744 ? -1 : b % 12)) sameRoot++;
  }
  console.log(`  vs Python (${T} frames): chord argmax equal ${(same / T).toFixed(4)}, root equal ${(sameRoot / T).toFixed(4)}`);
}
