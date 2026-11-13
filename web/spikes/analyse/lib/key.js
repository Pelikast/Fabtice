// Global key: correlation of a pitch-class profile with key templates, combined with how
// well the decoded chords fit each key (functional, jazz-aware fit from harmony.js).

import { keyFit } from './harmony.js';

// Krumhansl-Kessler probe-tone profiles and Temperley's (Kostka-Payne corpus) profiles.
const PROFILES = {
  kk: {
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  },
  temperley: {
    major: [0.748, 0.06, 0.488, 0.082, 0.67, 0.46, 0.096, 0.715, 0.104, 0.366, 0.057, 0.4],
    minor: [0.712, 0.084, 0.474, 0.618, 0.049, 0.46, 0.105, 0.747, 0.404, 0.067, 0.133, 0.33],
  },
};

function corr(a, b) {
  const n = a.length;
  const ma = a.reduce((p, q) => p + q, 0) / n, mb = b.reduce((p, q) => p + q, 0) / n;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return s / Math.sqrt(sa * sb || 1);
}

export const KEY_DEFAULTS = { profile: 'temperley', wChroma: 1, wChords: 1, temperature: 0.08 };

// chroma: 12 values (any scale). chordSegs: [{chord, dur}] or null.
export function estimateKey(chroma, chordSegs, options = {}) {
  const o = { ...KEY_DEFAULTS, ...options };
  const prof = PROFILES[o.profile];
  const totalDur = chordSegs ? chordSegs.reduce((p, s) => p + s.dur, 0) : 0;
  const cands = [];
  for (let minor = 0; minor < 2; minor++) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const p = prof[minor ? 'minor' : 'major'];
      const rot = Array.from({ length: 12 }, (_, i) => p[(i - tonic + 12) % 12]);
      const c = corr(chroma, rot);
      let f = 0;
      if (chordSegs && totalDur > 0) for (const s of chordSegs) f += (keyFit(s.chord, tonic, !!minor) * s.dur) / totalDur;
      cands.push({ tonic, minor: !!minor, chroma: c, fit: f, score: o.wChroma * c + o.wChords * f });
    }
  }
  const mx = Math.max(...cands.map((c) => c.score));
  let z = 0;
  for (const c of cands) { c.p = Math.exp((c.score - mx) / o.temperature); z += c.p; }
  for (const c of cands) c.p /= z;
  cands.sort((a, b) => b.score - a.score);
  return { best: cands[0], ranked: cands.slice(0, 5) };
}
