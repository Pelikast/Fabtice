// SheetSage2 exactly as the app runs it (app/src/analysis/engine/sheetsage2.ts: mel front end,
// encoder parts, decoder under the grammar), with onnxruntime-web (WASM) under Node, on one audio
// file, against the authors' PyTorch run of dump_sheetsage2.py: same tokens? Prints the time and
// the chords.
//
//   node ../node_modules/esbuild/bin/esbuild ts/ss2-parity.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/ss2-parity.mjs --external:onnxruntime-web
//   ORT_DIR=... node /tmp/ss2-parity.mjs <graphs dir> <SheetSage2 safetensors> <MERT safetensors> <audio> [dump.json]

import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { runSheetSage2, ss2Label, type Ss2GraphInfo, type Ss2Manifest, type Ss2Runtime, type Ss2Session } from '../../../../../app/src/analysis/engine/sheetsage2';
import { SS2_FRONT_BYTES, melFront } from '../../../../../app/src/analysis/engine/sheetsage2Mel';

const [graphs, ss2File, mertFile, audioPath, dumpPath] = process.argv.slice(2) as [string, string, string, string, string?];
const ort = await import('file://' + join(process.env.ORT_DIR!, 'dist', 'ort.node.min.mjs'));
ort.env.wasm.numThreads = Number(process.env.THREADS ?? 4);

function range(path: string, start: number, end: number): Uint8Array {
  const fd = openSync(path, 'r');
  const buf = Buffer.alloc(end - start);
  readSync(fd, buf, 0, end - start, start);
  closeSync(fd);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

const manifest = JSON.parse(readFileSync(join(graphs, 'sheetsage2-manifest.json'), 'utf8')) as Ss2Manifest;
const rt: Ss2Runtime = {
  Tensor: ort.Tensor,
  async open(info: Ss2GraphInfo): Promise<Ss2Session> {
    const s = await ort.InferenceSession.create(readFileSync(join(graphs, info.graph)), {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      externalData: info.slices.map((x) => ({ path: x.name, data: range(x.file === 'mert' ? mertFile : ss2File, x.start, x.end) })),
    });
    return { run: (f) => s.run(f), release: () => s.release() };
  },
};
const front = melFront(range(mertFile, 0, SS2_FRONT_BYTES).slice().buffer);
const raw = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', audioPath, '-vn', '-ac', '1', '-ar', '24000', '-f', 'f32le', 'pipe:1'], { maxBuffer: 1 << 30 });
const audio = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
const t0 = performance.now();
let last = -1;
const out = await runSheetSage2(rt, manifest, front, audio, { check() {}, progress() {}, yieldNow: async () => {} }, ({ fraction: f }) => {
  const p = Math.floor(f * 20);
  if (p !== last) {
    last = p;
    process.stderr.write(`${(f * 100).toFixed(0)}% ${((performance.now() - t0) / 1000).toFixed(0)} s\n`);
  }
});
const secs = (performance.now() - t0) / 1000;
console.log(`${out.chords.length} chords, ${out.tokens[0]!.length} tokens, ${secs.toFixed(0)} s, peak rss ${(process.resourceUsage().maxRSS / 1e6).toFixed(2)} GB`);
console.log(out.chords.slice(0, 12).map((c) => `${c.time.toFixed(2)} ${ss2Label(c.label)} (${Math.max(...c.probs).toFixed(2)})`).join('\n'));
if (dumpPath) {
  const ref = JSON.parse(readFileSync(dumpPath, 'utf8')) as { tokens: number[]; chords: { label: string }[] };
  const a = out.tokens[0]!;
  let same = 0;
  while (same < Math.min(a.length, ref.tokens.length) && a[same] === ref.tokens[same]) same++;
  console.log(`tokens identical to the PyTorch run: ${same} / ${ref.tokens.length} (ours ${a.length})`);
  const ours = out.chords.map((c) => ss2Label(c.label));
  const theirs = ref.chords.map((c) => c.label);
  let agree = 0;
  for (let i = 0; i < Math.min(ours.length, theirs.length); i++) if (ours[i] === theirs[i]) agree++;
  console.log(`chords: ours ${ours.length}, theirs ${theirs.length}, same in order ${agree}`);
}
