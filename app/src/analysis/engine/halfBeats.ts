// Chords between two beats (1.0.3, owner's request: up to eight chords in a 4/4 bar, by hand or
// found by the analysis). The decoder reads one chord per beat (`decode.ts`) and that reading is
// kept as it is; this is a second, careful look inside each beat: its two halves are pooled apart,
// and the beat is split only when they clearly hold two different chords.
//
// Careful on purpose (a chart covered with false passing chords is worse than a missed one):
//   - the beat keeps its decoded chord on one half, and the other half names another ROOT clearly
//     (each half's chord `margin` nats better than the other's on its own half, and at least
//     `minProb` for the network there);
//   - a chord that only comes half a beat early (the next beat's chord) or leaves half a beat late
//     (the beat before's) is NOT written: that is how the band plays a chart, not what the chart says;
//   - a half too short to be heard by the network (`minFrames`, `minSeconds`) decides nothing.
// Off by default (« À l'essai » in Réglages → Détection des accords): not measured on real records
// yet (v1/PLAN-ACCORDS-STRUCTURE.md, steps 0 and 1). Pure.

import { NO_CHORD, N_CHORDS, chordRoot, poolSegments, type ChordFrames } from './chords';

export interface HalfBeatOptions {
  /** Fewest frames of the network in each half of the beat. */
  minFrames: number;
  /** Shortest half of a beat looked at, in seconds (0.18 s: above about 165 beats a minute nothing is looked for). */
  minSeconds: number;
  /** How much better each half's chord must be than the other half's, on its own half (mean log posterior, nats). */
  margin: number;
  /** The network's posterior (geometric mean over the half) of the chord written between two beats, at least. */
  minProb: number;
}

export const HALF_BEATS: HalfBeatOptions = { minFrames: 3, minSeconds: 0.18, margin: 1.2, minProb: 0.5 };

/** A beat that holds two chords. */
export interface HalfBeatChord {
  /** Index of the beat. */
  beat: number;
  /**
   * `second`: the beat's decoded chord, then `chord` from its middle to the next beat;
   * `first`: `chord` on the beat, then the beat's decoded chord from its middle.
   */
  half: 'first' | 'second';
  /** Middle of the beat, in seconds. */
  time: number;
  /** Engine index of the other chord (never « no chord »). */
  chord: number;
  /** The network's posterior for it over its half (geometric mean). */
  p: number;
}

function best(logp: Float64Array): number {
  let b = 0;
  for (let c = 1; c < N_CHORDS; c++) if (logp[c]! > logp[b]!) b = c;
  return b;
}

/**
 * The beats that hold two chords. `segments`: [start, end) of every beat in seconds of the original
 * audio (`pipeline.ts#beatSegments`); `path`: the chord decoded for each beat.
 */
export function findHalfBeats(
  frames: ChordFrames,
  timeScale: number,
  segments: readonly (readonly [number, number])[],
  path: readonly number[],
  options: Partial<HalfBeatOptions> = {},
): HalfBeatChord[] {
  const o = { ...HALF_BEATS, ...options };
  const out: HalfBeatChord[] = [];
  const frameOf = (t: number) => Math.max(0, Math.min(frames.T, Math.ceil(t * timeScale * frames.fps)));
  for (let i = 0; i < segments.length && i < path.length; i++) {
    const own = path[i]!;
    if (own === NO_CHORD) continue;
    const [t0, t1] = segments[i]!;
    const mid = (t0 + t1) / 2;
    if (mid - t0 < o.minSeconds) continue;
    if (frameOf(mid) - frameOf(t0) < o.minFrames || frameOf(t1) - frameOf(mid) < o.minFrames) continue;
    const [h1, h2] = poolSegments(frames, [[t0, mid], [mid, t1]], timeScale) as [ReturnType<typeof poolSegments>[number], ReturnType<typeof poolSegments>[number]];
    const a = best(h1.logp);
    const b = best(h2.logp);
    const clear = (other: number, on: Float64Array, off: Float64Array) =>
      other !== NO_CHORD &&
      chordRoot(other) !== chordRoot(own) &&
      on[other]! - on[own]! >= o.margin &&
      off[own]! - off[other]! >= o.margin &&
      Math.exp(on[other]!) >= o.minProb;
    if (a === own && b !== own) {
      // Another chord from the middle of the beat — unless it is the next beat's, come early.
      const next = path[i + 1];
      const early = next !== undefined && next !== NO_CHORD && chordRoot(next) === chordRoot(b);
      if (!early && clear(b, h2.logp, h1.logp)) out.push({ beat: i, half: 'second', time: mid, chord: b, p: Math.exp(h2.logp[b]!) });
    } else if (b === own && a !== own) {
      // Another chord on the beat, the decoded one from its middle — unless it is the beat before's, leaving late.
      const before = i > 0 ? path[i - 1] : undefined;
      const late = before !== undefined && before !== NO_CHORD && chordRoot(before) === chordRoot(a);
      if (!late && clear(a, h1.logp, h2.logp)) out.push({ beat: i, half: 'first', time: mid, chord: a, p: Math.exp(h1.logp[a]!) });
    }
  }
  return out;
}
