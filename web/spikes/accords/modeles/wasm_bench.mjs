// Runs each candidate's ONNX graph with onnxruntime-web's WASM backend (the app's runtime,
// same version as app/package.json) in Node, on 30 s of input, to check that every operator
// loads and to get an order of magnitude of the browser CPU cost.
//
//   npm install onnxruntime-web@1.31.1   (in a scratch folder; pass it with ORT_DIR)
//   ORT_DIR=/path/to/node_modules/onnxruntime-web node wasm_bench.mjs [threads]
//
// Prints seconds per 30 s of audio, i.e. the real-time factor x 30.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ortDir = process.env.ORT_DIR;
const ort = await import(join(ortDir, 'dist', 'ort.node.min.mjs').replace(/^/, 'file://')).catch(
  async () => import(join(ortDir, 'dist', 'ort.min.mjs').replace(/^/, 'file://')),
);
const threads = Number(process.argv[2] ?? 1);
ort.env.wasm.numThreads = threads;
ort.env.wasm.wasmPaths = join(ortDir, 'dist') + '/';

const rand = (n, scale = 0.1) => Float32Array.from({ length: n }, () => (Math.random() * 2 - 1) * scale);
const zeros = (n) => new Float32Array(n);

// [file, inputs(seconds) -> feeds, audio seconds covered by one run]
const cases = [
  ['crema.onnx', () => ({ audio: new ort.Tensor('float32', rand(44100 * 30), [1, 44100 * 30]) }), 30],
  ['btc-large.onnx', () => ({ feature: new ort.Tensor('float32', rand(3 * 108 * 144, 1), [3, 108, 144]) }), 30],
  ['chordmini-2e1d.onnx', () => ({ features: new ort.Tensor('float32', rand(16 * 108 * 144, 1), [16, 108, 144]) }), 16 * 10],
  ['jiang2019.onnx', () => ({ cqt: new ort.Tensor('float32', rand(1292 * 288, 0.01).map(Math.abs), [1, 1292, 288]) }), 30],
  [
    'tsumugi-chords.onnx',
    () => ({
      wave: new ort.Tensor('float32', rand(2 * 768000), [1, 2, 768000]),
      beats: new ort.Tensor('float32', zeros(750 * 11), [1, 750, 11]),
      keys: new ort.Tensor('float32', zeros(750 * 25), [1, 750, 25]),
    }),
    20, // the runner keeps the middle 20 s of each 30 s window
  ],
];

for (const [file, feeds, seconds] of cases) {
  const path = join(here, 'cache', file);
  if (!existsSync(path)) {
    console.log(`${file}: missing (run fetch_models.py / the converters)`);
    continue;
  }
  try {
    const t0 = performance.now();
    const s = await ort.InferenceSession.create(readFileSync(path), { executionProviders: ['wasm'] });
    const tLoad = (performance.now() - t0) / 1000;
    const f = feeds();
    await s.run(f); // warm-up
    const t1 = performance.now();
    await s.run(f);
    const dt = (performance.now() - t1) / 1000;
    console.log(`${file.padEnd(22)} load ${tLoad.toFixed(1)} s, one run ${dt.toFixed(2)} s for ${seconds} s of audio: ` +
      `${((dt / seconds) * 30).toFixed(2)} s per 30 s (RTF ${(dt / seconds).toFixed(3)}), ${threads} thread(s)`);
  } catch (e) {
    console.log(`${file}: FAILED ${String(e).slice(0, 300)}`);
  }
}
