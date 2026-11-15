// Listening to the separated instruments (CLAUDE.md, analysis, means 1).
//
// The chord network is run on each separated part (stem) as well as on the
// mix. This file decides, piece by piece and from the audio only, which parts
// carry the harmony, and pools the evidence. Pure.

import { N_CHORDS, NO_CHORD, chordRoot, type ChordFrames, type PooledUnit } from './chords';

/** What the selector reads from one part. */
export interface StemFeatures {
  /** Share of the frames where the part sounds. */
  activity: number;
  /** Mean RMS over the frames where it sounds. */
  level: number;
  /** Mean number of pitch classes the network hears at once (sigmoid > 0.5), where it sounds. */
  polyphony: number;
  /** Mean over beats of the network's best chord posterior (geometric mean over the beat). */
  chordness: number;
  /** Mean over beats of the « no chord » posterior. */
  noChord: number;
  /** Mean over beats of the Bhattacharyya coefficient between its chord posteriors and the mix's. */
  agreement: number;
  /** Share of beats where its best chord has the same root as the mix's best chord. */
  rootAgreement: number;
}

function best(u: PooledUnit): number {
  let b = 0;
  for (let c = 1; c < N_CHORDS; c++) if (u.logp[c]! > u.logp[b]!) b = c;
  return b;
}

function softmax(logp: Float64Array): Float64Array {
  let m = -Infinity;
  for (const v of logp) if (v > m) m = v;
  const p = Float64Array.from(logp, (v) => Math.exp(v - m));
  let s = 0;
  for (const v of p) s += v;
  for (let c = 0; c < p.length; c++) p[c]! /= s || 1;
  return p;
}

export function stemFeatures(
  frames: ChordFrames,
  rms: Float32Array,
  units: readonly PooledUnit[],
  mixUnits: readonly PooledUnit[],
  _numbers: readonly number[],
): StemFeatures {
  const T = frames.T;
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const p90 = sorted[Math.floor(0.9 * (T - 1))] ?? 0;
  const floor = Math.max(1e-4, 0.1 * p90);
  let active = 0;
  let level = 0;
  let poly = 0;
  for (let f = 0; f < T; f++) {
    if (rms[f]! < floor) continue;
    active++;
    level += rms[f]!;
    let n = 0;
    for (let k = 0; k < 12; k++) if (frames.pitch[f * 12 + k]! > 0.5) n++;
    poly += n;
  }
  let chordness = 0;
  let noChord = 0;
  let agreement = 0;
  let rootAgree = 0;
  const n = Math.min(units.length, mixUnits.length);
  for (let i = 0; i < n; i++) {
    const u = units[i]!;
    const b = best(u);
    chordness += Math.exp(u.logp[b]!);
    noChord += Math.exp(u.logp[NO_CHORD]!);
    const ps = softmax(u.logp);
    const pm = softmax(mixUnits[i]!.logp);
    let bc = 0;
    for (let c = 0; c < N_CHORDS; c++) bc += Math.sqrt(ps[c]! * pm[c]!);
    agreement += bc;
    const bm = best(mixUnits[i]!);
    if (b !== NO_CHORD && bm !== NO_CHORD && chordRoot(b) === chordRoot(bm)) rootAgree++;
  }
  return {
    activity: T ? active / T : 0,
    level: active ? level / active : 0,
    polyphony: active ? poly / active : 0,
    chordness: n ? chordness / n : 0,
    noChord: n ? noChord / n : 0,
    agreement: n ? agreement / n : 0,
    rootAgreement: n ? rootAgree / n : 0,
  };
}

/**
 * Parts that carry the harmony, from their features alone (the bass and the
 * drums are not candidates: the bass is always listened to, for the root;
 * the drums never). A part that plays chords is heard as several pitch
 * classes at once and is rarely « no chord »; a melody or a solo is one
 * line, and the network often hears no chord in it. Measured on the dev half
 * of the bench (ideal stems): harmony parts score 2.9 to 3.8, melodies and
 * solos 0.2 to 1.9; the counterpoint of a traditional-jazz front line sits in
 * between (1.9 to 2.9). When no part reaches the threshold, the best one is
 * taken: some part of the band plays the chords.
 */
export const HARMONY_THRESHOLD = 2.4;

export function harmonyScore(f: StemFeatures): number {
  return f.polyphony - 4 * f.noChord;
}

export function selectHarmony(features: Readonly<Record<string, StemFeatures>>, threshold = HARMONY_THRESHOLD): string[] {
  const cands = Object.entries(features).filter(([name, f]) => name !== 'bass' && name !== 'drums' && f.activity > 0.05);
  if (!cands.length) return [];
  const kept = cands.filter(([, f]) => harmonyScore(f) >= threshold).map(([n]) => n);
  if (kept.length) return kept.sort();
  let bestName = cands[0]![0];
  for (const [n, f] of cands) if (harmonyScore(f) > harmonyScore(features[bestName]!)) bestName = n;
  return [bestName];
}
