// Shared by the bench variants `modele-*` (banc/variantes/): reads the chord-model
// candidates' frame outputs precomputed by modeles/bench_precompute.py, turns them into the
// engine's ChordFrames, and parses their Harte labels into the app's chord symbols.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { N_CHORDS, NO_CHORD, QUAL_PCS, QUALS, type ChordFrames } from '../../../../../app/src/analysis/engine/chords';
import type { ChordExtension, ChordQuality, ChordSymbol } from '../../../../../app/src/model/harmony';
import { sortExtensions } from '../../../../../app/src/harmony/parse';
import { DATA } from '../../banc/paths';

export interface ModelFrames {
  model: string;
  T: number;
  C: number;
  hop: number;
  t0: number;
  labels: string[];
  probs: Float32Array; // T x C
  probs169: Float32Array; // T x 169, the app's chord index
  bass: Float32Array | null; // T x 13 (C..B, none)
  pitch: Float32Array | null; // T x 12
  segments: [string, string, string][] | null; // own decoder: start, end, Harte label
}

const shaCache = new Map<string, string>();
export function audioSha(path: string): string {
  let h = shaCache.get(path);
  if (!h) {
    h = createHash('sha256').update(readFileSync(path)).digest('hex');
    shaCache.set(path, h);
  }
  return h;
}

export function readModel(model: string, audioPath: string): ModelFrames | null {
  const base = join(DATA, 'modeles', model, audioSha(audioPath));
  if (!existsSync(`${base}.json`) || !existsSync(`${base}.f32`)) return null;
  const meta = JSON.parse(readFileSync(`${base}.json`, 'utf8'));
  const bin = readFileSync(`${base}.f32`);
  const all = new Float32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const { T, C } = meta as { T: number; C: number };
  let at = 0;
  const take = (n: number) => all.subarray(at, (at += n));
  const probs = take(T * C);
  const probs169 = take(T * 169);
  const bass = meta.bass ? take(T * 13) : null;
  const pitch = meta.pitch ? take(T * 12) : null;
  return { model: meta.model, T, C, hop: meta.hop, t0: meta.t0, labels: meta.labels, probs, probs169, bass, pitch, segments: meta.segments ?? null };
}

/** Pitch-class and bass evidence implied by chord probabilities, for models that give none. */
function impliedPitchBass(p169: Float32Array, T: number): { pitch: Float32Array; bass: Float32Array } {
  const pitch = new Float32Array(T * 12);
  const bass = new Float32Array(T * 13);
  for (let t = 0; t < T; t++) {
    for (let c = 0; c < N_CHORDS; c++) {
      const v = p169[t * N_CHORDS + c]!;
      if (c === NO_CHORD) {
        bass[t * 13 + 12]! += v;
        continue;
      }
      const r = Math.floor(c / 14);
      bass[t * 13 + r]! += v;
      for (const i of QUAL_PCS[QUALS[c % 14]!]) pitch[t * 12 + ((r + i) % 12)]! += v;
    }
  }
  return { pitch, bass };
}

/** The model's output as the engine's ChordFrames (frame i at time i / fps: t0 must be 0). */
export function toChordFrames(m: ModelFrames): ChordFrames {
  if (Math.abs(m.t0) > 1e-9) throw new Error('t0 != 0 not supported');
  const implied = !m.pitch || !m.bass ? impliedPitchBass(m.probs169, m.T) : null;
  // The engine takes log(p + 1e-6): keep the rows normalised.
  return { T: m.T, fps: 1 / m.hop, probs: m.probs169, pitch: m.pitch ?? implied!.pitch, bass: m.bass ?? implied!.bass };
}

/** Resample a model's 169-chord probabilities onto CREMA's frame grid (nearest frame). */
export function onGrid(m: ModelFrames, T: number, fps: number, timeScale: number): Float32Array {
  const out = new Float32Array(T * N_CHORDS);
  for (let f = 0; f < T; f++) {
    const time = (f + 0.5) / fps / timeScale; // seconds of the original audio
    const g = Math.max(0, Math.min(m.T - 1, Math.floor((time - m.t0) / m.hop)));
    out.set(m.probs169.subarray(g * N_CHORDS, (g + 1) * N_CHORDS), f * N_CHORDS);
  }
  return out;
}

// ---------------------------------------------------------------- Harte labels

const PCS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEGREE: Record<string, number> = {
  '1': 0, b2: 1, '2': 2, '#2': 3, b3: 3, '3': 4, '4': 5, '#4': 6, b5: 6, '5': 7, '#5': 8, b6: 8, '6': 9, bb7: 9, b7: 10, '7': 11,
  b9: 1, '9': 2, '#9': 3, '11': 5, '#11': 6, b13: 8, '13': 9,
};
// shorthand -> [quality, implied extensions]
const SHORT: Record<string, [ChordQuality, ChordExtension[]]> = {
  '': ['maj', []], maj: ['maj', []], '5': ['maj', []], '1': ['maj', []], min: ['min', []], aug: ['aug', []], dim: ['dim', []],
  sus2: ['sus2', []], sus4: ['sus4', []], '7': ['7', []], maj7: ['maj7', []], min7: ['min7', []], minmaj7: ['minmaj7', []],
  maj6: ['maj6', []], min6: ['min6', []], dim7: ['dim7', []], hdim7: ['hdim7', []],
  '9': ['7', ['9']], '11': ['7', ['9', '11']], '13': ['7', ['9', '13']], maj9: ['maj7', ['9']], maj13: ['maj7', ['9', '13']],
  min9: ['min7', ['9']], min11: ['min7', ['9', '11']], min13: ['min7', ['9', '13']],
};
const EXT = new Set<string>(['b9', '9', '#9', '11', '#11', 'b5', '#5', 'b13', '13']);

function rootOf(s: string): number {
  let r = PCS[s[0]!.toUpperCase()]!;
  for (const ch of s.slice(1)) r += ch === '#' ? 1 : ch === 'b' ? -1 : 0;
  return ((r % 12) + 12) % 12;
}

/** A Harte label ("A:min7(9)/b7", "N") as the app's chord symbol (null for N / X). */
export function harteToSymbol(label: string): ChordSymbol | null {
  if (label === 'N' || label === 'X' || !label) return null;
  const [rootS, restS = 'maj'] = label.split(':') as [string, string?];
  const root = rootOf(rootS);
  const [body, bassS] = restS.split('/') as [string, string?];
  const m = /^([^(]*)(?:\((.*)\))?$/.exec(body)!;
  const [quality0, implied] = SHORT[m[1]!] ?? ['maj', []];
  let quality: ChordQuality = quality0;
  const ext = new Set<string>(implied);
  for (const d of (m[2] ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    if (d.startsWith('*')) continue;
    if (quality === 'sus4' && d === 'b7') quality = '7sus4';
    else if (quality === 'aug' && d === 'b7') quality = 'aug7';
    else if (quality === 'aug' && d === '7') {
      quality = 'maj7';
      ext.add('#5');
    } else if (d === '6' && quality === 'maj') quality = 'maj6';
    else if (EXT.has(d)) ext.add(d);
  }
  const bass = bassS && DEGREE[bassS] !== undefined ? (root + DEGREE[bassS]!) % 12 : null;
  return { root, quality, extensions: sortExtensions([...ext] as ChordExtension[]), bass: bass === root ? null : bass };
}

/** Mean log-probability of every class over frames whose centre is in [t0, t1). */
export function pooledArgmax(m: ModelFrames, t0: number, t1: number): { index: number; p: number } {
  let f0 = Math.ceil((t0 - m.t0) / m.hop - 0.5);
  let f1 = Math.ceil((t1 - m.t0) / m.hop - 0.5);
  f0 = Math.max(0, Math.min(m.T - 1, f0));
  f1 = Math.max(f0 + 1, Math.min(m.T, f1));
  const acc = new Float64Array(m.C);
  for (let f = f0; f < f1; f++) for (let c = 0; c < m.C; c++) acc[c]! += Math.log(m.probs[f * m.C + c]! + 1e-6);
  let best = 0;
  for (let c = 1; c < m.C; c++) if (acc[c]! > acc[best]!) best = c;
  return { index: best, p: Math.exp(acc[best]! / (f1 - f0)) };
}

/** Pooled bass head over [t0, t1): pitch class or null (none). */
export function pooledBass(m: ModelFrames, t0: number, t1: number): number | null {
  if (!m.bass) return null;
  const f0 = Math.max(0, Math.min(m.T - 1, Math.floor((t0 - m.t0) / m.hop)));
  const f1 = Math.max(f0 + 1, Math.min(m.T, Math.ceil((t1 - m.t0) / m.hop)));
  const acc = new Float64Array(13);
  for (let f = f0; f < f1; f++) for (let k = 0; k < 13; k++) acc[k]! += m.bass[f * 13 + k]!;
  let best = 0;
  for (let k = 1; k < 13; k++) if (acc[k]! > acc[best]!) best = k;
  return best === 12 ? null : best;
}
