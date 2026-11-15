// Decodes an audio file at 48 kHz (as the app's decoder hands it), resamples it to 25.6 kHz
// with resampleTo25600, and writes the stereo result as raw float32 (left then right), so that
// ts_parity.py can run the model on it and compare with the Python pipeline.
//
//   node --experimental-strip-types --no-warnings ts/dump-resampled.ts in.flac out.f32

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resampleTo25600 } from '../../../../../app/src/analysis/engine/tsumugiFeatures.ts';

const [inPath, outPath] = process.argv.slice(2) as [string, string];
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', inPath, '-f', 'f32le', '-ac', '2', '-ar', '48000', '-'], { maxBuffer: 2 ** 31 });
const inter = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
const n = inter.length / 2;
const l = new Float32Array(n);
const r = new Float32Array(n);
for (let i = 0; i < n; i++) {
  l[i] = inter[2 * i]!;
  r[i] = inter[2 * i + 1]!;
}
const t = performance.now();
const L = resampleTo25600(l, 48_000);
const R = resampleTo25600(r, 48_000);
const out = new Float32Array(L.length * 2);
out.set(L, 0);
out.set(R, L.length);
writeFileSync(outPath, Buffer.from(out.buffer));
console.error(`${L.length} samples per channel, resampled in ${((performance.now() - t) / 1000).toFixed(1)} s`);
