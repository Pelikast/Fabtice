// Tsumugi-Chords exactly as the app's worker runs it (app/src/analysis/worker/analysis.worker.ts,
// `fineChords`): the piece at 48 kHz, `tsumugiAudio`, `tsumugiInfo` from the first decoding
// (CREMA), `runTsumugi`, `tsumugiChordFrames` — the app's own code — with onnxruntime-node
// instead of the browser's WebAssembly build (same graph, same weights; faster here).
//
// Needs, in $BANC_DATA/poids/: chord-model.safetensors (the author's weights, see
// app/src/analysis/models.ts, `tsumugi-chords`). The graph is copied there from the app.
// onnxruntime-node is installed for the bench only (npm install --no-save onnxruntime-node).
// Outputs are cached in $BANC_DATA/modeles/tsumugi-app/<sha256 of audio + info>.bin.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChordFrames } from '../../../../../app/src/analysis/engine/chords';
import type { OrtLike, SessionLike } from '../../../../../app/src/analysis/engine/session';
import { runTsumugi, tsumugiAudio, tsumugiChordFrames, tsumugiInfo } from '../../../../../app/src/analysis/engine/tsumugi';
import type { AnalysisResult } from '../../../../../app/src/model/analysis';
import { decodeAudio } from '../../banc/networks';
import { DATA, ROOT } from '../../banc/paths';
import { audioSha } from './lire';

let session: Promise<{ ort: OrtLike; s: SessionLike }> | null = null;

function open(): Promise<{ ort: OrtLike; s: SessionLike }> {
  session ??= (async () => {
    const dir = join(DATA, 'poids');
    const graph = join(dir, 'tsumugi-chords.graph.onnx');
    if (!existsSync(graph)) copyFileSync(join(ROOT, '..', '..', '..', 'app', 'src', 'analysis', 'assets', 'tsumugi-chords.graph.onnx'), graph);
    if (!existsSync(join(dir, 'chord-model.safetensors'))) throw new Error(`missing ${dir}/chord-model.safetensors`);
    const ort = await import('onnxruntime-node');
    const s = await ort.InferenceSession.create(graph, {
      intraOpNumThreads: Number(process.env.TS_THREADS ?? 4),
      graphOptimizationLevel: 'all',
      logSeverityLevel: 3,
    });
    return { ort: ort as unknown as OrtLike, s: s as unknown as SessionLike };
  })();
  return session;
}

const quiet = { check() {}, yieldNow: async () => {}, progress() {} };

/** The beats and key the worker hands the fine model: those of the first decoding (`first`). */
export function infoOf(first: AnalysisResult, duration: number) {
  const b = first.beats;
  const n = b.meter.numerator;
  const numbers = b.times.map((_, i) => ((((i - b.downbeat) % n) + n) % n) + 1);
  const key = first.key ? { tonic: first.key.tonic, minor: first.key.mode === 'minor' } : null;
  return tsumugiInfo(b.times, numbers, key, duration);
}

/**
 * The fine model's ChordFrames (with `detail`, 745 classes) for an audio file, given the first
 * decoding of the piece (its beats and key). Cached; TS_EXT=0 drops `detail` (before 1.0.1).
 */
export async function tsumugiFrames(audioPath: string, first: AnalysisResult, duration: number): Promise<ChordFrames> {
  const info = infoOf(first, duration);
  const key = createHash('sha256').update(audioSha(audioPath)).update(JSON.stringify(info)).digest('hex').slice(0, 32);
  const dir = join(DATA, 'modeles', 'tsumugi-app');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${key}.bin`);
  let frames: ChordFrames;
  if (existsSync(file)) {
    const b = readFileSync(file);
    const all = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    const T = all[0]!;
    let at = 1;
    const take = (n: number) => all.slice(at, (at += n));
    frames = { T, fps: 25, probs: take(T * 169), pitch: take(T * 12), bass: take(T * 13), detail: take(T * 745) };
  } else {
    const { ort, s } = await open();
    const { channels, sampleRate } = decodeAudio(audioPath);
    const [left, right] = tsumugiAudio(channels, sampleRate);
    const t0 = Date.now();
    const out = await runTsumugi(ort, s, left, right, info, quiet);
    frames = tsumugiChordFrames(out);
    console.error(`  tsumugi ${audioPath.split('/').slice(-3).join('/')}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    const parts = [new Float32Array([frames.T]), frames.probs, frames.pitch, frames.bass, frames.detail!];
    writeFileSync(file, Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))));
  }
  if (process.env.TS_EXT === '0') {
    const { detail: _drop, ...rest } = frames;
    return rest;
  }
  return frames;
}
