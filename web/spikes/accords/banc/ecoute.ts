// The chord network on other audio than the mix: one stem, a remix of
// several stems, or the bass register of the mix. Same network, same
// resampling and same tuning correction as the app (the mix's tuning estimate
// is used, as the app would: the stems come from the same recording). Cached
// in data/cache/ (prefix `ecoute-`), next to the bench's own cache.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web';
import { bassBand } from '../../../../app/src/analysis/engine/bassband';
import { BASS_SR, bassAudio } from '../../../../app/src/analysis/engine/bassline';
import type { ChordFrames } from '../../../../app/src/analysis/engine/chords';
import { chordStage } from '../../../../app/src/analysis/engine/pipeline';
import { mixToMono, resampleRatioAsync } from '../../../../app/src/analysis/engine/resample';
import type { OrtLike } from '../../../../app/src/analysis/engine/session';
import type { TuningEstimate } from '../../../../app/src/analysis/engine/tuning';
import { decodeAudio, modelKey, openSessions } from './networks';
import { DATA } from './paths';

const VERSION = 1;
const quiet = { check() {}, progress() {}, yieldNow: () => Promise.resolve() };

const fileHash = new Map<string, string>();
function hashOf(path: string): string {
  let h = fileHash.get(path);
  if (!h) {
    h = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 24);
    fileHash.set(path, h);
  }
  return h;
}

export interface Listened {
  frames: ChordFrames;
  timeScale: number;
  /** RMS of the audio the network heard, per network frame (hop 4096 at 44.1 kHz, model time). */
  rms: Float32Array;
}

export interface ListenSpec {
  paths: string[];
  /** Gain of each path (default 1). */
  gains?: number[];
  /** `bass`: the 40–300 Hz band only. */
  transform?: 'bass';
}

async function audio44(spec: ListenSpec): Promise<Float32Array> {
  let sum: Float32Array | null = null;
  for (let k = 0; k < spec.paths.length; k++) {
    const { channels, sampleRate } = decodeAudio(spec.paths[k]!);
    const mono = new Float32Array(channels[0]!.length);
    mixToMono(channels, mono);
    const a = await resampleRatioAsync(mono, sampleRate / 44100, 20, () => {});
    const g = spec.gains?.[k] ?? 1;
    if (!sum) sum = a.map((v) => v * g);
    else for (let i = 0; i < Math.min(sum.length, a.length); i++) sum[i]! += g * a[i]!;
  }
  if (!sum) throw new Error('nothing to listen to');
  return spec.transform === 'bass' ? bassBand(sum, 44100) : sum;
}

/** The chord network's frames on `spec`, tuning-corrected with the mix's estimate. */
export async function listen(spec: ListenSpec, tuning: TuningEstimate): Promise<Listened> {
  const dir = join(DATA, 'cache');
  mkdirSync(dir, { recursive: true });
  const key = createHash('sha256')
    .update(JSON.stringify({ v: VERSION, m: modelKey(), f: spec.paths.map(hashOf), g: spec.gains ?? null, t: spec.transform ?? null, c: Math.round(tuning.cents * 1000) }))
    .digest('hex')
    .slice(0, 24);
  const file = join(dir, `ecoute-${key}`);
  if (existsSync(`${file}.json`) && existsSync(`${file}.bin`)) {
    const meta = JSON.parse(readFileSync(`${file}.json`, 'utf8')) as { T: number; fps: number; timeScale: number };
    const bin = readFileSync(`${file}.bin`);
    const all = new Float32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
    const T = meta.T;
    let at = 0;
    const take = (n: number) => all.slice(at, (at += n));
    const probs = take(T * 169);
    const pitch = take(T * 12);
    const bass = take(T * 13);
    const rms = take(T);
    return { frames: { T, fps: meta.fps, probs, pitch, bass }, timeScale: meta.timeScale, rms };
  }
  const a = await audio44(spec);
  const sessions = await openSessions();
  const { frames, timeScale } = await chordStage(ort as unknown as OrtLike, sessions, a, tuning, quiet);
  const rms = new Float32Array(frames.T);
  const hop = 4096 / timeScale;
  for (let f = 0; f < frames.T; f++) {
    const i0 = Math.floor(f * hop);
    const i1 = Math.min(a.length, Math.floor((f + 1) * hop));
    let s = 0;
    for (let i = i0; i < i1; i++) s += a[i]! * a[i]!;
    rms[f] = i1 > i0 ? Math.sqrt(s / (i1 - i0)) : 0;
  }
  writeFileSync(`${file}.json`, JSON.stringify({ T: frames.T, fps: frames.fps, timeScale }));
  const parts = [frames.probs, frames.pitch, frames.bass, rms];
  writeFileSync(`${file}.bin`, Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))));
  return { frames, timeScale, rms };
}

/** The audio of `spec` at the bass estimate's rate (`bassline.ts`), cached. */
export async function lowAudio(spec: ListenSpec): Promise<Float32Array> {
  const dir = join(DATA, 'cache');
  mkdirSync(dir, { recursive: true });
  const key = createHash('sha256')
    .update(JSON.stringify({ v: VERSION, low: BASS_SR, f: spec.paths.map(hashOf), g: spec.gains ?? null, t: spec.transform ?? null }))
    .digest('hex')
    .slice(0, 24);
  const file = join(dir, `ecoute-grave-${key}.f32`);
  if (existsSync(file)) {
    const b = readFileSync(file);
    return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
  const low = bassAudio(await audio44(spec), 44100);
  writeFileSync(file, Buffer.from(low.buffer, low.byteOffset, low.byteLength));
  return low;
}
