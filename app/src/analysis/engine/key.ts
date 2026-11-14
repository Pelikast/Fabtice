// Global key, ported unchanged from the prototype (`web/spikes/analyse/lib/key.js`):
// correlation of a pitch-class profile with key templates, optionally combined
// with how well the decoded chords fit each key (functional, jazz-aware fit
// from `decode.ts`).

import { keyFit } from './decode';

type Profile = readonly number[];

/** Krumhansl-Kessler probe-tone profiles and Temperley's (Kostka-Payne corpus) profiles. */
const PROFILES: Record<'kk' | 'temperley', { major: Profile; minor: Profile }> = {
  kk: {
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  },
  temperley: {
    major: [0.748, 0.06, 0.488, 0.082, 0.67, 0.46, 0.096, 0.715, 0.104, 0.366, 0.057, 0.4],
    minor: [0.712, 0.084, 0.474, 0.618, 0.049, 0.46, 0.105, 0.747, 0.404, 0.067, 0.133, 0.33],
  },
};

function corr(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let s = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    s += (a[i]! - ma) * (b[i]! - mb);
    sa += (a[i]! - ma) ** 2;
    sb += (b[i]! - mb) ** 2;
  }
  return s / Math.sqrt(sa * sb || 1);
}

export interface KeyOptions {
  profile: 'kk' | 'temperley';
  wChroma: number;
  wChords: number;
  temperature: number;
}

/**
 * Measured on GTZAN (jazz, blues), GuitarSet and synthetic jazz:
 * Krumhansl-Kessler on the chord model's pitch-class output alone was best or
 * close to best everywhere; adding the chord-fit term (wChords) helped on
 * synthetic jazz but hurt on GTZAN and GuitarSet.
 */
export const KEY_DEFAULTS: KeyOptions = { profile: 'kk', wChroma: 1, wChords: 0, temperature: 0.08 };

export interface KeyCandidate {
  tonic: number;
  minor: boolean;
  chroma: number;
  fit: number;
  score: number;
  /** Softmax probability over the 24 keys. */
  p: number;
}

/** The estimate as the rest of the analysis reads it (`p` is absent for a key the user chose). */
export interface KeyEstimate {
  best: { tonic: number; minor: boolean; p?: number };
  ranked: { tonic: number; minor: boolean; p?: number }[];
}

/** chroma: 12 values (any scale). chordSegs: [{chord, dur}] or null. */
export function estimateKey(
  chroma: ArrayLike<number>,
  chordSegs: readonly { chord: number; dur: number }[] | null,
  options: Partial<KeyOptions> = {},
): { best: KeyCandidate; ranked: KeyCandidate[] } {
  const o = { ...KEY_DEFAULTS, ...options };
  const prof = PROFILES[o.profile];
  const totalDur = chordSegs ? chordSegs.reduce((p, s) => p + s.dur, 0) : 0;
  const cands: KeyCandidate[] = [];
  for (let minor = 0; minor < 2; minor++) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const p = prof[minor ? 'minor' : 'major'];
      const rot = Array.from({ length: 12 }, (_, i) => p[(i - tonic + 12) % 12]!);
      const c = corr(chroma, rot);
      let f = 0;
      if (chordSegs && totalDur > 0) for (const s of chordSegs) f += (keyFit(s.chord, tonic, !!minor) * s.dur) / totalDur;
      cands.push({ tonic, minor: !!minor, chroma: c, fit: f, score: o.wChroma * c + o.wChords * f, p: 0 });
    }
  }
  const mx = Math.max(...cands.map((c) => c.score));
  let z = 0;
  for (const c of cands) {
    c.p = Math.exp((c.score - mx) / o.temperature);
    z += c.p;
  }
  for (const c of cands) c.p /= z;
  cands.sort((a, b) => b.score - a.score);
  return { best: cands[0]!, ranked: cands.slice(0, 5) };
}
