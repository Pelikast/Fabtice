// Listening to the separated instruments (CLAUDE.md, analysis, means 1).
//
// The chord network is run on each separated part (stem) as well as on the
// mix. This file decides, piece by piece and from the audio only, which parts
// carry the harmony, and pools the evidence. Pure.

import type { BassBeat } from './bassline';
import type { EvidenceSource } from './evidence';
import { N_CHORDS, NO_CHORD, chordPcs, chordRoot, type ChordFrames, type PooledUnit } from './chords';

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

/** Two listenings of the same beats pooled log-linearly: `mixWeight` of `a`, the rest of `b`. */
export function blendUnits(a: readonly PooledUnit[], b: readonly PooledUnit[], mixWeight: number): PooledUnit[] {
  const wa = mixWeight;
  const wb = 1 - wa;
  return a.map((u, i) => {
    const v = b[i];
    if (!v) return u;
    const logp = new Float64Array(N_CHORDS);
    for (let c = 0; c < N_CHORDS; c++) logp[c] = wa * u.logp[c]! + wb * v.logp[c]!;
    return {
      ...u,
      logp,
      pitch: Float64Array.from(u.pitch, (x, k) => wa * x + wb * v.pitch[k]!),
      bass: Float64Array.from(u.bass, (x, k) => wa * x + wb * v.bass[k]!),
    };
  });
}

export interface BassCueOptions {
  /** Weight of the cue in nats per beat at full strength (the decoder then multiplies emissions by gamma = 3). */
  weight: number;
  /** Share credited when the bass plays another chord tone than the root (third, fifth: walking, inversions). */
  tones: number;
  /** Floor of the bass evidence: the bass may play none of the chord's notes (approach notes, pedals). */
  floor: number;
  /** Strength of the cue on beat 1, on the middle beat of an even bar, and on the other beats. */
  positions: readonly [number, number, number];
}

/**
 * Measured on the dev half of the bench (separated bass, harmonic summation):
 * the bass note of beat 1 is the root 9 times out of 10, of the other beats
 * only a third of the time (walking: thirds, fifths, approach notes), hence
 * the positions. Weight and tone credit chosen on the dev half.
 */
export const BASS_CUE: BassCueOptions = { weight: 4, tones: 0.4, floor: 0.08, positions: [1, 0.3, 0.1] };

/**
 * The bass as soft evidence for the root, added to the per-beat evidence (new
 * units). A beat where no bass note is clearly heard (`strength` low) counts
 * little; the bass may also play the third or the fifth (credited), or
 * nothing of the chord (the floor): a cue, not a rule.
 */
export function applyBassCue(
  units: readonly PooledUnit[],
  bass: readonly BassBeat[],
  numbers: readonly number[],
  beatsPerBar: number,
  options: Partial<BassCueOptions> = {},
): PooledUnit[] {
  const o = { ...BASS_CUE, ...options };
  const tones: number[][] = [];
  for (let c = 0; c < NO_CHORD; c++) tones.push(chordPcs(c));
  return units.map((u, i) => {
    const b = bass[i];
    if (!b) return u;
    const q = Float64Array.from(b.pcs, (v) => b.strength * v + (1 - b.strength) / 12);
    const nb = numbers[i] ?? 0;
    const pos = nb === 1 ? o.positions[0] : beatsPerBar % 2 === 0 && nb === beatsPerBar / 2 + 1 ? o.positions[1] : o.positions[2];
    const w = o.weight * pos;
    const logp = Float64Array.from(u.logp);
    for (let c = 0; c < NO_CHORD; c++) {
      const t = tones[c]!;
      let s = q[t[0]!]!;
      for (let k = 1; k < t.length; k++) s += o.tones * q[t[k]!]!;
      logp[c]! += w * Math.log(o.floor + s);
    }
    return { ...u, logp };
  });
}

/**
 * The same cue as a source of evidence (`evidence.ts`): per beat, log(floor +
 * the chord's bass support), « no chord » left at 0, and the weight of the
 * beat's position times how clearly the bass sounds. `applyEvidence` with it
 * gives the decoder exactly what `applyBassCue` gives.
 */
export function bassSource(
  bass: readonly BassBeat[],
  numbers: readonly number[],
  beatsPerBar: number,
  options: Partial<BassCueOptions> = {},
): EvidenceSource {
  const o = { ...BASS_CUE, ...options };
  const tones: number[][] = [];
  for (let c = 0; c < NO_CHORD; c++) tones.push(chordPcs(c));
  const logp: (Float64Array | null)[] = [];
  const weight: number[] = [];
  for (let i = 0; i < numbers.length; i++) {
    const b = bass[i];
    if (!b) {
      logp.push(null);
      weight.push(0);
      continue;
    }
    const q = Float64Array.from(b.pcs, (v) => b.strength * v + (1 - b.strength) / 12);
    const l = new Float64Array(N_CHORDS);
    for (let c = 0; c < NO_CHORD; c++) {
      const t = tones[c]!;
      let s = q[t[0]!]!;
      for (let k = 1; k < t.length; k++) s += o.tones * q[t[k]!]!;
      l[c] = Math.log(o.floor + s);
    }
    const nb = numbers[i]!;
    const pos = nb === 1 ? o.positions[0] : beatsPerBar % 2 === 0 && nb === beatsPerBar / 2 + 1 ? o.positions[1] : o.positions[2];
    logp.push(l);
    weight.push(o.weight * pos);
  }
  return { name: 'bass', logp, weight };
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

/** Least share of the candidates' energy (level² × activity) a part needs to be heard at all. */
export const MIN_SHARE = 0.05;

/** Parts that are never harmony candidates: the bass (listened to for the root) and the drums. */
const NOT_HARMONY = new Set(['bass', 'drums', 'kick', 'snare', 'hihat', 'toms', 'cymbals']);

export function harmonyScore(f: StemFeatures): number {
  return f.polyphony - 4 * f.noChord;
}

export function selectHarmony(features: Readonly<Record<string, StemFeatures>>, threshold = HARMONY_THRESHOLD): string[] {
  const all = Object.entries(features).filter(([name]) => !NOT_HARMONY.has(name));
  // A real separation also gives parts the band does not have: nearly silent, but the network
  // still hears « chords » in what leaks into them. Only parts with a share of the sound count.
  const energy = (f: StemFeatures) => f.level * f.level * f.activity;
  const total = all.reduce((n, [, f]) => n + energy(f), 0);
  const cands = all.filter(([, f]) => f.activity > 0.05 && total > 0 && energy(f) / total >= MIN_SHARE);
  if (!cands.length) return [];
  const kept = cands.filter(([, f]) => harmonyScore(f) >= threshold).map(([n]) => n);
  if (kept.length) return kept.sort();
  let bestName = cands[0]![0];
  for (const [n, f] of cands) if (harmonyScore(f) > harmonyScore(features[bestName]!)) bestName = n;
  return [bestName];
}
