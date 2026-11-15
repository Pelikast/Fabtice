// Runs the app's networks on an audio file, outside the browser, exactly as
// the analysis worker does (app/src/analysis/worker/analysis.worker.ts):
// decode at 48 kHz, mono mix, resampling to 22.05 kHz and 44.1 kHz with the
// engine's own resampler (same taps), the same three ONNX files at the same
// pinned revisions (app/src/analysis/models.ts), ONNX Runtime Web 1.31.1
// (WebAssembly, the app's build) and the engine's `runNetworks`.
//
// The networks are the slow part (seconds per file); their outputs are small.
// They are cached per audio content (SHA-256 of the file) and per model set in
// data/cache/, so a variant that only changes the decoding re-runs in seconds.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web';
import { MODEL_REGISTRY, modelsFor, type ModelSpec } from '../../../../app/src/analysis/models';
import { runNetworks, type NetworkOutputs, type Sessions, type StepControl } from '../../../../app/src/analysis/engine/pipeline';
import { mixToMono, resampleRatioAsync } from '../../../../app/src/analysis/engine/resample';
import type { OrtLike, SessionLike } from '../../../../app/src/analysis/engine/session';
import { DATA } from './paths';

/** Bump when the way outputs are computed changes (invalidates the cache). */
const CACHE_VERSION = 1;

const ENGINE_SR = 48000;

const sha256 = (buf: Uint8Array | Buffer) => createHash('sha256').update(buf).digest('hex');

// ------------------------------------------------------------------ models

async function modelBytes(spec: ModelSpec): Promise<Uint8Array> {
  const dir = join(DATA, 'modeles');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${spec.id}.onnx`);
  if (existsSync(file)) {
    const b = readFileSync(file);
    if (sha256(b) === spec.sha256) return b;
  }
  process.stderr.write(`téléchargement de ${spec.name} (${(spec.bytes / 1e6).toFixed(1)} Mo)…\n`);
  // curl rather than fetch: it follows the machine's proxy settings.
  execFileSync('curl', ['-sSfL', '--retry', '3', '-o', `${file}.part`, spec.url], { stdio: ['ignore', 'ignore', 'inherit'] });
  const b = readFileSync(`${file}.part`);
  if (sha256(b) !== spec.sha256) throw new Error(`${spec.id}: SHA-256 does not match`);
  renameSync(`${file}.part`, file);
  return b;
}

let sessionsPromise: Promise<Sessions> | null = null;

function openSessions(): Promise<Sessions> {
  sessionsPromise ??= (async () => {
    ort.env.wasm.numThreads = Math.max(1, Number(process.env.BANC_THREADS ?? 4));
    ort.env.logLevel = 'error';
    const specs = modelsFor('light');
    const open = async (id: keyof typeof MODEL_REGISTRY) =>
      (await ort.InferenceSession.create(await modelBytes(MODEL_REGISTRY[id]), {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
        logSeverityLevel: 3,
      })) as unknown as SessionLike;
    if (specs.length !== 3) throw new Error('unexpected model set');
    return { logmel: await open('beat-this-logmel'), beat: await open('beat-this-small0'), crema: await open('crema-chords') };
  })();
  return sessionsPromise;
}

/** Ids and hashes of the models: part of the cache key. */
export function modelKey(): string {
  return sha256(Buffer.from(modelsFor('light').map((m) => m.sha256).join(','))).slice(0, 12);
}

// ------------------------------------------------------------------- audio

/** The file decoded at 48 kHz, one Float32Array per channel (as the app's decoder hands it). */
export function decodeAudio(path: string): { channels: Float32Array[]; sampleRate: number } {
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '2', '-ar', String(ENGINE_SR), '-'], {
    maxBuffer: 2 ** 31,
  });
  const inter = new Float32Array(out.buffer, out.byteOffset, out.byteLength / 4);
  const n = inter.length / 2;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = inter[2 * i]!;
    r[i] = inter[2 * i + 1]!;
  }
  return { channels: [l, r], sampleRate: ENGINE_SR };
}

const quiet: StepControl = { check() {}, progress() {}, yieldNow: () => Promise.resolve(), step() {} };

// ------------------------------------------------------------------- cache

interface Stored {
  v: number;
  models: string;
  duration: number;
  tuning: NetworkOutputs['tuning'];
  timeScale: number;
  act: { frames: number; fps: number };
  frames: { T: number; fps: number };
}

function save(file: string, o: NetworkOutputs, duration: number): void {
  const parts = [o.act.beat, o.act.down, o.frames.probs, o.frames.pitch, o.frames.bass];
  const meta: Stored = {
    v: CACHE_VERSION,
    models: modelKey(),
    duration,
    tuning: o.tuning,
    timeScale: o.timeScale,
    act: { frames: o.act.frames, fps: o.act.fps },
    frames: { T: o.frames.T, fps: o.frames.fps },
  };
  writeFileSync(`${file}.json`, JSON.stringify(meta));
  writeFileSync(`${file}.bin`, Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))));
}

function load(file: string): { outputs: NetworkOutputs; duration: number } | null {
  if (!existsSync(`${file}.json`) || !existsSync(`${file}.bin`)) return null;
  const meta = JSON.parse(readFileSync(`${file}.json`, 'utf8')) as Stored;
  if (meta.v !== CACHE_VERSION || meta.models !== modelKey()) return null;
  const bin = readFileSync(`${file}.bin`);
  const all = new Float32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  let at = 0;
  const take = (n: number) => all.slice(at, (at += n));
  const A = meta.act.frames;
  const T = meta.frames.T;
  const beat = take(A);
  const down = take(A);
  const probs = take(T * 169);
  const pitch = take(T * 12);
  const bass = take(T * 13);
  return {
    duration: meta.duration,
    outputs: {
      tuning: meta.tuning,
      timeScale: meta.timeScale,
      act: { beat, down, frames: A, fps: meta.act.fps },
      frames: { T, fps: meta.frames.fps, probs, pitch, bass },
    },
  };
}

export interface NetworkResult {
  outputs: NetworkOutputs;
  /** Duration of the piece in seconds. */
  duration: number;
  /** True when read from the cache. */
  cached: boolean;
}

/** The app's network outputs for an audio file, from the cache when they are there. */
export async function networks(path: string): Promise<NetworkResult> {
  const dir = join(DATA, 'cache');
  mkdirSync(dir, { recursive: true });
  const key = sha256(readFileSync(path)).slice(0, 24);
  const file = join(dir, `${key}-${modelKey()}`);
  const hit = load(file);
  if (hit) return { ...hit, cached: true };
  const { channels, sampleRate } = decodeAudio(path);
  const length = channels[0]!.length;
  const mono = new Float32Array(length);
  mixToMono(channels, mono);
  const a22 = await resampleRatioAsync(mono, sampleRate / 22050, 32, () => {});
  const a44 = await resampleRatioAsync(mono, sampleRate / 44100, 20, () => {});
  const sessions = await openSessions();
  const outputs = await runNetworks(ort as unknown as OrtLike, sessions, a22, a44, quiet);
  const duration = length / sampleRate;
  save(file, outputs, duration);
  return { outputs, duration, cached: false };
}
