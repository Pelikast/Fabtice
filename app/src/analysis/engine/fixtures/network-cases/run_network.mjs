// Runs the app's beat stage (the real Beat This! light network, ONNX Runtime
// Web in Node, the app's own resampler and log-mel graph) on the demo piece
// and on the files `make_audio.py` made, and writes the network's outputs
// (beat and downbeat logits, rounded to 0.01) to `network-cases.json`, which
// `repair.network.test.ts` reads. Run from app/:
//
//   python3 src/analysis/engine/fixtures/network-cases/make_audio.py ../web/spikes/analyse/demo/demo-swing.mp3 <dir>
//   node src/analysis/engine/fixtures/network-cases/run_network.mjs <dir> <models dir>
//
// <models dir> holds logmel.onnx and beat_this_small0.onnx as listed in
// `analysis/models.ts` (checked by their SHA-256). Needs ffmpeg.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '../../../../..');
const [, , dir, models] = process.argv;
const demo = path.resolve(app, '../web/spikes/analyse/demo/demo-swing.mp3');

// name → [file, passage altered (s) or null]
const CASES = {
  demo: [demo, null],
  old: [path.join(dir, 'old.wav'), null],
  'gap-14.3-19.7': [path.join(dir, 'gap-14.3-19.7.wav'), [14.3, 19.7]],
  'silence-14.3-19.7': [path.join(dir, 'silence-14.3-19.7.wav'), [14.33, 19.73]],
  'wind-8.8-14.3': [path.join(dir, 'wind-8.8-14.3.wav'), [8.79, 14.33]],
  'wind-21.5-26.9': [path.join(dir, 'wind-21.5-26.9.wav'), [21.49, 26.85]],
  'muffled-8.8-12.5': [path.join(dir, 'muffled-8.8-12.5.wav'), [8.79, 12.49]],
};

const server = await createServer({ root: app, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const ort = await import(path.join(app, 'node_modules/onnxruntime-web/dist/ort.node.min.mjs'));
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = 'error';
  const { MODEL_REGISTRY } = await server.ssrLoadModule('/src/analysis/models.ts');
  const { resampleRatio } = await server.ssrLoadModule('/src/analysis/engine/resample.ts');
  const { beatStage } = await server.ssrLoadModule('/src/analysis/engine/pipeline.ts');
  const { noControl } = await server.ssrLoadModule('/src/analysis/engine/session.ts');
  const open = async (file, id) => {
    const bytes = fs.readFileSync(path.join(models, file));
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== MODEL_REGISTRY[id].sha256) throw new Error(`${file}: not the file listed in models.ts`);
    return ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'] });
  };
  const sessions = { logmel: await open('logmel.onnx', 'beat-this-logmel'), beat: await open('beat_this_small0.onnx', 'beat-this-small0') };
  const out = { fps: 50, cases: {} };
  for (const [name, [file, passage]] of Object.entries(CASES)) {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
    const mono = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    const act = await beatStage(ort, sessions, resampleRatio(mono, 48000 / 22050), noControl);
    const round = (a) => Array.from(a, (v) => Math.round(v * 100) / 100);
    out.cases[name] = { passage, beat: round(act.beat), down: round(act.down) };
    console.log(name, act.frames, 'frames');
  }
  fs.writeFileSync(path.join(here, 'network-cases.json'), JSON.stringify(out));
} finally {
  await server.close();
}
