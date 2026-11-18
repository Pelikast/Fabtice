// The chords the user wrote by hand as evidence for a new analysis (1.0.1, owner's decision:
// « Garder mes corrections » makes them a strong hint). A hand chord stays as written (the chart
// shows it over the analysis); here it helps read the rest of the piece:
//   - on its own beats, a strong weight, so that the decoder's neighbours fit it (a ii-V read
//     a fifth off next to a chord the user confirmed becomes unlikely);
//   - on the same beats of the other choruses (the bars the repeats pair with its bar), a weight
//     that grows where the audio is in doubt: a chord clearly heard otherwise in another chorus
//     (a substitution, other extensions) still wins.
// Pure.

import { N_CHORDS, NO_CHORD, type PooledUnit } from './chords';
import { barsOf, type EvidenceSource } from './evidence';
import { priorAround } from './knownChart';
import type { RepeatAnalysis } from './repeats';

export interface HandHint {
  time: number;
  /** Engine index (0…168), `NO_CHORD` for « N.C. ». */
  chord: number;
}

/**
 * Measured on the bench (1.0.1, variant `modele-mains`: a user who corrects every wrong bar of the
 * first chorus; colour per beat of the rest, against the same corrections given as no hint): own
 * 0.5, partner 3: +2.0 points on clean synthetic jazz, +2.9 on the old records, +0.2 / 0 on
 * GuitarSet. A stronger own weight (6) drags the neighbours of a corrected bar along (−2.4 on
 * GuitarSet old records); the partners carry the gain.
 */
export const HAND = { own: 0.5, partner: 3, exact: 0.6, colour: 0.25, tritone: 0.03 };

function logNoChord(): Float64Array {
  const p = new Float64Array(N_CHORDS).fill(Math.log(0.2 / N_CHORDS));
  p[NO_CHORD] = Math.log(0.8);
  return p;
}

/** The hand chord sounding at the middle of each beat (null: none written there). */
export function handOfBeats(units: readonly PooledUnit[], hand: readonly HandHint[]): (number | null)[] {
  const out: (number | null)[] = [];
  let k = -1;
  for (const u of units) {
    const mid = (u.t0 + u.t1) / 2;
    while (k + 1 < hand.length && hand[k + 1]!.time <= mid + 1e-6) k++;
    out.push(k >= 0 ? hand[k]!.chord : null);
  }
  return out;
}

/**
 * The evidence of the hand chords. A hand chord lasts until the next one, so only the bars where
 * one starts count as written by the user.
 */
export function handSource(units: readonly PooledUnit[], numbers: readonly number[], hand: readonly HandHint[], rep: RepeatAnalysis | null, o = HAND): EvidenceSource {
  const N = units.length;
  const logp: (Float64Array | null)[] = new Array<Float64Array | null>(N).fill(null);
  const weight = new Array<number>(N).fill(0);
  const of = handOfBeats(units, hand);
  const dist = (c: number) => (c === NO_CHORD ? logNoChord() : priorAround(c, o));
  // Bars as the repeats see them (`evidence.ts#barsOf`: the pickup is no bar).
  const layout = barsOf(numbers);
  const barOf = layout.barOfBeat;
  // Only bars where a hand chord starts are « written » (a hand chord lasts until the next one).
  const writtenBar = new Set<number>();
  for (const h of hand) {
    const i = units.findIndex((u) => h.time < u.t1 - 1e-6);
    if (i >= 0 && barOf[i]! >= 0) writtenBar.add(barOf[i]!);
  }
  for (let i = 0; i < N; i++) {
    const c = of[i];
    if (c === null || c === undefined || !writtenBar.has(barOf[i]!)) continue;
    logp[i] = dist(c);
    weight[i] = o.own;
  }
  if (rep) {
    for (const b of writtenBar) {
      const own = layout.bars[b] ?? [];
      const partners: { bar: number; weight: number }[] = rep.partners[b] ?? [];
      for (const partner of partners) {
        if (writtenBar.has(partner.bar)) continue;
        const theirs = layout.bars[partner.bar] ?? [];
        for (let j = 0; j < Math.min(own.length, theirs.length); j++) {
          const i = theirs[j]!;
          const c = of[own[j]!];
          if (c === null || c === undefined) continue;
          // Doubt of the audio at that beat: 1 − its best chord's probability.
          let m = -Infinity;
          for (const v of units[i]!.logp) if (v > m) m = v;
          const doubt = 1 - Math.min(1, Math.exp(m));
          const add = o.partner * partner.weight * (0.25 + 0.75 * doubt);
          if (add <= weight[i]!) continue;
          logp[i] = dist(c);
          weight[i] = add;
        }
      }
    }
  }
  return { name: 'hand', logp, weight };
}
