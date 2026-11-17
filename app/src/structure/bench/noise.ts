// Simulated analysis errors (Tier S): what the chord and beat analysis gets
// wrong on a real recording, applied to the truth.
//
//   parfait    the truth itself (chords as played, true bar lines).
//   realiste   about 25 % of the chord changes wrong or missing (half of the
//              wrong ones are family confusions such as maj7 <-> 7, the rest
//              relative / fifth / tritone / random roots), a few extra
//              changes, a few chords a beat early or late, extensions
//              unreliable, drum solos read as N.C. or noise; the grid loses a
//              beat once (every later bar line a beat off, as on the owner's
//              1945 record) and drops one bar line (two bars read as one).
//   mauvais    about 45 % wrong or missing, two beat shifts, three dropped
//              bar lines.
//
// The levels are rough figures from the chords bench (web/spikes/accords:
// « Couleur » around 55-75 % on the old-record condition) and from the
// owner's reports, not a measured model of the app's errors.

import type { ChordExtension, ChordQuality, ChordSymbol } from '../../model/harmony';
import { CHORD_EXTENSIONS } from '../../model/harmony';
import type { TruthPiece } from './cases';
import { pick, type Rng } from './rng';

export type NoiseLevel = 'parfait' | 'realiste' | 'mauvais';
export const NOISE_LEVELS: readonly NoiseLevel[] = ['parfait', 'realiste', 'mauvais'];

export interface Noise {
  /** Probability that a chord change is read wrong. */
  wrong: number;
  /** Probability that a chord change is missed (the chord before goes on). */
  missing: number;
  /** Probability of an extra (wrong) change inside a chord. */
  extra: number;
  /** Probability that a change is read a beat early or late. */
  shift: number;
  /** Extensions: probability to drop each one, to add a random one. */
  dropExtension: number;
  addExtension: number;
  /** Probability that a chord change inside a drum solo becomes N.C. */
  drumsNoChord: number;
  /** The grid loses one beat at this many places (every later bar line one beat off). */
  beatShifts: number;
  /** This many bar lines are missed (two bars read as one). */
  droppedBars: number;
  /** Probability that a wrong chord is flagged doubtful; a right one: a fifth of it. */
  doubtful: number;
  /** Lognormal spread of the simulated stem levels, and leak of every stem into the others. */
  levelSpread: number;
  leak: number;
  /** Simulated wind recogniser: probability of the right instrument, of « winds » (unsure); the rest is a wrong instrument. */
  windsRight: number;
  windsUnsure: number;
}

export const NOISE: Record<NoiseLevel, Noise> = {
  parfait: {
    wrong: 0, missing: 0, extra: 0, shift: 0, dropExtension: 0, addExtension: 0, drumsNoChord: 0,
    beatShifts: 0, droppedBars: 0, doubtful: 0, levelSpread: 0.03, leak: 0.02, windsRight: 0.95, windsUnsure: 0.05,
  },
  realiste: {
    wrong: 0.17, missing: 0.08, extra: 0.05, shift: 0.08, dropExtension: 0.5, addExtension: 0.15, drumsNoChord: 0.6,
    beatShifts: 1, droppedBars: 1, doubtful: 0.5, levelSpread: 0.2, leak: 0.1, windsRight: 0.6, windsUnsure: 0.3,
  },
  mauvais: {
    wrong: 0.32, missing: 0.13, extra: 0.08, shift: 0.15, dropExtension: 0.6, addExtension: 0.25, drumsNoChord: 0.8,
    beatShifts: 2, droppedBars: 3, doubtful: 0.4, levelSpread: 0.35, leak: 0.2, windsRight: 0.4, windsUnsure: 0.4,
  },
};

export interface TimedChord {
  time: number;
  chord: ChordSymbol | null;
  doubtful: boolean;
}

const FAMILY_SWAP: Partial<Record<ChordQuality, ChordQuality[]>> = {
  maj7: ['7', 'maj6', 'maj'], maj6: ['min7', 'maj7'], maj: ['7', 'min'], '7': ['maj7', 'min7', '7sus4', 'maj'],
  min7: ['7', 'hdim7', 'min6', 'maj'], min6: ['hdim7', 'min7'], min: ['maj', 'min7'], hdim7: ['min7', 'dim7', '7'],
  dim7: ['7', 'hdim7'], dim: ['min', 'dim7'], aug7: ['7'], aug: ['maj'], '7sus4': ['7', 'min7'], sus4: ['maj'],
  sus2: ['maj'], minmaj7: ['min7'],
};

const sym = (root: number, quality: ChordQuality): ChordSymbol => ({ root: ((root % 12) + 12) % 12, quality, extensions: [], bass: null });

/** A wrong reading of `c`, as a chord recogniser makes them. */
export function wrongChord(c: ChordSymbol, r: Rng): ChordSymbol {
  const x = r();
  if (x < 0.5) return sym(c.root, pick(r, FAMILY_SWAP[c.quality] ?? ['maj']));
  if (x < 0.7) {
    // the relative / a third away
    if (c.quality === 'min7' || c.quality === 'min' || c.quality === 'min6') return sym(c.root + 3, 'maj7');
    if (c.quality === 'maj7' || c.quality === 'maj' || c.quality === 'maj6') return sym(c.root + 9, 'min7');
    if (c.quality === '7') return sym(c.root + 4, 'dim7');
    return sym(c.root + 3, 'maj');
  }
  if (x < 0.85) return sym(c.root + 7, c.quality);
  if (x < 0.9) return sym(c.root + 6, c.quality);
  return sym(c.root + 1 + Math.floor(r() * 11), pick(r, ['maj', 'min', '7', 'min7', 'maj7'] as const));
}

function noisyExtensions(c: ChordSymbol, n: Noise, r: Rng): ChordSymbol {
  let ext: ChordExtension[] = c.extensions.filter(() => r() >= n.dropExtension);
  if (r() < n.addExtension) {
    const e = pick(r, CHORD_EXTENSIONS);
    if (!ext.includes(e)) ext = [...ext, e];
  }
  return { ...c, extensions: ext };
}

function inDrumSolo(piece: TruthPiece, time: number): boolean {
  const b = piece.bars.find((x) => time >= x.start && time < x.end);
  return !!b && Object.keys(b.play).length === 1 && 'drums' in b.play;
}

/** The truth chord changes read through the errors of `n`. */
export function noisyChords(truth: readonly TimedChord[], piece: TruthPiece, n: Noise, r: Rng): TimedChord[] {
  const beat = 60 / piece.bpm;
  const out: TimedChord[] = [];
  for (let i = 0; i < truth.length; i++) {
    const t = truth[i]!;
    const nextTime = truth[i + 1]?.time ?? piece.duration;
    let time = t.time;
    let chord = t.chord;
    let doubtful = false;
    if (chord && n.drumsNoChord > 0 && inDrumSolo(piece, time + beat / 2) && r() < n.drumsNoChord) {
      out.push({ time, chord: r() < 0.6 ? null : wrongChord(chord, r), doubtful: true });
      continue;
    }
    const x = r();
    if (x < n.missing && out.length > 0) continue;
    if (chord && x < n.missing + n.wrong) {
      chord = wrongChord(chord, r);
      doubtful = r() < n.doubtful;
    } else if (chord) {
      chord = noisyExtensions(chord, n, r);
      doubtful = r() < n.doubtful / 5;
    }
    if (r() < n.shift) time += (r() < 0.5 ? -1 : 1) * beat;
    if (out.length && time <= out[out.length - 1]!.time) time = out[out.length - 1]!.time + beat / 4;
    out.push({ time, chord, doubtful });
    if (chord && r() < n.extra && nextTime - time > 2.5 * beat) {
      const at = time + beat * (1 + Math.floor(r() * Math.max(1, Math.floor((nextTime - time) / beat) - 1)));
      out.push({ time: at, chord: wrongChord(chord, r), doubtful: r() < n.doubtful });
    }
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

/** The true bar lines read through the grid errors of `n` (beat shifts, dropped lines). */
export function noisyGrid(lines: readonly number[], meter: number, n: Noise, r: Rng): number[] {
  let out = [...lines];
  const count = out.length - 1;
  for (let s = 0; s < n.beatShifts; s++) {
    // from a bar in the middle half on, every bar line is one beat late
    const k = Math.floor(count * (0.25 + 0.5 * r()));
    out = out.map((t, i) => {
      if (i < k || i >= out.length - 1) return t;
      const len = (out[i + 1]! - out[i]!) / meter;
      return t + len;
    });
  }
  for (let d = 0; d < n.droppedBars; d++) {
    const k = 1 + Math.floor((out.length - 3) * r());
    out.splice(k, 1);
  }
  return out;
}
