// Tier R with the app's fine chord model (Réglages avancés → Modèle d'accords → Détaillé,
// Tsumugi-Chords): what the app's worker does (`app/src/analysis/worker/analysis.worker.ts`,
// `fineChords`), in Node with onnxruntime-web (WASM, the app's runtime):
//   1. the standard analysis first (CREMA, `analyses/<id>.<condition>.json`): its beats and key
//      are what the fine model is given, as in the app;
//   2. Tsumugi-Chords over the mix (30 s windows, `engine/tsumugi.ts#runTsumugi`), its frames
//      as the engine's ChordFrames (`tsumugiChordFrames`);
//   3. the same decoding (`resultFromOutputs`) with those frames, as the chords bench's `app-fin`.
// The result goes to analyses-fin/<id>.<condition>.json (same shape as analyses/; the evidence is
// the standard analysis' when the beats are the same, measured again otherwise).
//
// The weights are not in the repository (CC BY-NC 4.0): FABTICE_TSUMUGI_WEIGHTS names the
// author's `chord-model.safetensors` (67 647 992 bytes, SHA-256 6b62daef…0ee0a, from
// huggingface.co/anime-song/Tsumugi-Chords). About 2.5 GB of memory and 30 s per 30 s window.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ortWeb from 'onnxruntime-web';
import { resultFromOutputs } from '../../../../app/src/analysis/engine/analyse';
import { TSUMUGI_WEIGHTS_LOCATION, runTsumugi, tsumugiAudio, tsumugiChordFrames, tsumugiInfo } from '../../../../app/src/analysis/engine/tsumugi';
import { CHORD_MODEL_ID, MODEL_REGISTRY, modelsFor, TSUMUGI_GRAPH } from '../../../../app/src/analysis/models';
import type { OrtLike, SessionLike } from '../../../../app/src/analysis/engine/session';
import type { StemId } from '../../../../app/src/model/separation';
import { networks } from '../../accords/banc/networks';
import { lowAudio } from '../../accords/banc/ecoute';
import { knownFor } from '../../accords/banc/variantes/app';
import { barsFromAnalysis, measureEvidence } from './adapter';
import type { DetectedAnalysis } from './analyse';
import { ROOT } from './paths';

export const ANALYSES_FIN = join(ROOT, 'analyses-fin');
const GRAPH = join(ROOT, '..', '..', '..', 'app', 'src', 'analysis', 'assets', 'tsumugi-chords.graph.onnx');

export function finPath(id: string, condition: string): string {
  return join(ANALYSES_FIN, `${id}.${condition}.json`);
}

export function readFineAnalysis(id: string, condition: string): DetectedAnalysis | null {
  const f = finPath(id, condition);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as DetectedAnalysis) : null;
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

type Ort = OrtLike & { InferenceSession: { create(model: Uint8Array, options: unknown): Promise<SessionLike & { release(): Promise<void> }> }; env: { wasm: { numThreads: number } } };
let ortModule: Ort | null = null;
let session: (SessionLike & { release(): Promise<void> }) | null = null;

async function fineSession(): Promise<{ ort: Ort; session: SessionLike }> {
  if (session && ortModule) return { ort: ortModule, session };
  const weightsPath = process.env.FABTICE_TSUMUGI_WEIGHTS;
  if (!weightsPath || !existsSync(weightsPath)) throw new Error('FABTICE_TSUMUGI_WEIGHTS: the path of chord-model.safetensors (see the header)');
  const weights = new Uint8Array(readFileSync(weightsPath));
  const spec = MODEL_REGISTRY['tsumugi-chords'];
  if (weights.byteLength !== spec.bytes || sha256(weights) !== spec.sha256) throw new Error('chord-model.safetensors: not the expected file');
  const graph = new Uint8Array(readFileSync(GRAPH));
  if (graph.byteLength !== TSUMUGI_GRAPH.bytes || sha256(graph) !== TSUMUGI_GRAPH.sha256) throw new Error('the graph of the fine model is not the shipped one');
  ortModule = ortWeb as unknown as Ort;
  ortModule.env.wasm.numThreads = Number(process.env.FABTICE_TSUMUGI_THREADS ?? 4);
  session = await ortModule.InferenceSession.create(graph, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    logSeverityLevel: 3,
    externalData: [{ path: TSUMUGI_WEIGHTS_LOCATION, data: weights }],
  });
  return { ort: ortModule, session };
}

function decodeStereo(path: string, sampleRate: number): Float32Array[] {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '2', '-ar', String(sampleRate), '-'], { maxBuffer: 2 ** 31 });
  const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const n = all.length >> 1;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = all[2 * i]!;
    r[i] = all[2 * i + 1]!;
  }
  return [l, r];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** The fine model's analysis of one render, from its standard analysis (see the header). Written to analyses-fin/. */
export async function analyseFine(base: DetectedAnalysis, title: string, mixPath: string, stemPaths: Partial<Record<StemId, string>>): Promise<DetectedAnalysis> {
  const { ort, session: s } = await fineSession();
  const net = await networks(mixPath);
  const [left, right] = tsumugiAudio(decodeStereo(mixPath, 48000), 48000);
  const b = base.beats;
  const n = b.beatsPerBar;
  const numbers = b.times.map((_, i) => ((((i - b.downbeat) % n) + n) % n) + 1);
  const info = tsumugiInfo(b.times, numbers, base.key ? { tonic: base.key.tonic, minor: base.key.mode === 'minor' } : null, net.duration);
  const t0 = Date.now();
  const out = await runTsumugi(ort, s, left, right, info, { check() {}, progress() {}, yieldNow: async () => {} }, (done, total) =>
    process.stderr.write(`\r  ${base.id} ${base.condition}: fenêtre ${done}/${total}   `),
  );
  process.stderr.write(`${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
  const result = resultFromOutputs({
    outputs: { ...net.outputs, frames: tsumugiChordFrames(out), timeScale: 1, listening: { harmony: null, bass: { low: await lowAudio({ paths: [mixPath], transform: 'bass' }), from: 'band' } } },
    grid: null,
    key: null,
    known: await knownFor(title),
    duration: net.duration,
    models: modelsFor('light').map((m) => (m.id === CHORD_MODEL_ID.crema ? CHORD_MODEL_ID.fine : m.id)),
  });
  const a: Omit<DetectedAnalysis, 'evidence'> = {
    id: base.id,
    condition: base.condition,
    timeScale: base.timeScale,
    duration: r3(net.duration),
    beats: { times: result.beats.times.map(r3), downbeat: result.beats.downbeat, beatsPerBar: result.beats.meter.numerator },
    key: result.key ? { tonic: result.key.tonic, mode: result.key.mode } : null,
    chords: result.chords.map((c) => ({ time: r3(c.time), chord: c.chord, doubtful: !!c.doubtful })),
    analyser: 'app, modèle d’accords détaillé (Tsumugi-Chords), mélange seul (web/spikes/structure/banc/fin.ts)',
  };
  const sameBeats = a.beats.downbeat === base.beats.downbeat && a.beats.beatsPerBar === base.beats.beatsPerBar && JSON.stringify(a.beats.times) === JSON.stringify(base.beats.times);
  const full: DetectedAnalysis = { ...a, evidence: sameBeats ? base.evidence : measureEvidence(barsFromAnalysis(a), mixPath, stemPaths) };
  mkdirSync(ANALYSES_FIN, { recursive: true });
  writeFileSync(finPath(base.id, base.condition), JSON.stringify(full) + '\n');
  return full;
}
