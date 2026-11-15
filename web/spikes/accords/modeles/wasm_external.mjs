// Checks that onnxruntime-web (WASM) runs a graph whose weights are read from the authors'
// original .safetensors file (see external_weights.py), and gives the same output as the
// self-contained ONNX file.
//
//   ORT_DIR=/path/to/node_modules/onnxruntime-web node wasm_external.mjs \
//     cache/tsumugi-chords.graph.onnx cache/tsumugi-model.safetensors chord-model.safetensors cache/tsumugi-chords.onnx

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ortDir = process.env.ORT_DIR;
const ort = await import('file://' + join(ortDir, 'dist', 'ort.node.min.mjs'));
ort.env.wasm.numThreads = 1;
const [graph, weights, location, full] = process.argv.slice(2);

const n = 768000;
const wave = Float32Array.from({ length: 2 * n }, (_, i) => Math.sin(i * 0.0137) * 0.1 + Math.sin(i * 0.0291) * 0.05);
const feeds = () => ({
  wave: new ort.Tensor('float32', wave, [1, 2, n]),
  beats: new ort.Tensor('float32', new Float32Array(750 * 11), [1, 750, 11]),
  keys: new ort.Tensor('float32', new Float32Array(750 * 25), [1, 750, 25]),
});

const a = await ort.InferenceSession.create(readFileSync(graph), {
  executionProviders: ['wasm'],
  externalData: [{ path: location, data: new Uint8Array(readFileSync(weights)) }],
});
const ra = await a.run(feeds());
const b = await ort.InferenceSession.create(readFileSync(full), { executionProviders: ['wasm'] });
const rb = await b.run(feeds());
for (const k of Object.keys(ra)) {
  const x = ra[k].data;
  const y = rb[k].data;
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - y[i]));
  console.log(`${k.padEnd(9)} max |diff| ${m.toExponential(2)}`);
}
