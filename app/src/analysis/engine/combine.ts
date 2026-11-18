// « Combinaison SheetSage2 + Tsumugi » (1.0.2, à l'essai): the chord decided in two steps.
//
//   1. The skeleton of the chord (root, major or minor, seventh: the app's 169 chords): SheetSage2's
//      and Tsumugi's evidence vote, frame by frame, as a weighted product of their probabilities
//      (a sum of log-probabilities, `COMBINE_WEIGHTS`). The other voices the app already has join
//      in the decoding that follows, as with any model: the repeats of the form, the known chart of
//      the standard, the separated parts when « Écouter aussi les instruments séparés » is ticked,
//      the chords written by hand (`analyse.ts#resultFromOutputs`).
//   2. The details, once the skeleton is decided, from Tsumugi alone: the extensions are those of
//      its best class among the ones that fold onto the chord decided (`tsumugiExtensions.ts`, via
//      `detail`), the bass is its bass (then checked by the bass band and the separated bass, as
//      with Tsumugi alone).
//
// The weights were chosen on the bench (web/spikes/accords/modeles/RECHERCHE.md, « Version 1.0.2 »).

import { N_CHORDS, type ChordFrames } from './chords';

export interface CombineWeights {
  sheetsage2: number;
  tsumugi: number;
}

/** Weights of the vote on the skeleton (bench, « Version 1.0.2 »). */
export const COMBINE_WEIGHTS: CombineWeights = { sheetsage2: 0.5, tsumugi: 1 };

/**
 * The owner's idea (18 November 2026): where the two models name the same chord, it is taken as
 * right, Tsumugi's extensions with it; where they do not, the chord is marked doubtful. A chord
 * counts as « agreed » when the two models agree on at least `minShare` of its frames. Measured on
 * the bench (RECHERCHE.md, « Version 1.0.2 »): the doubtful mark then flags 54 % of the wrong
 * chords instead of 15 to 17 % (synthetic jazz), the chords found unchanged; leaving out the
 * extensions of the chords in doubt loses « complet » points (67 → 64 %): kept off.
 */
export const COMBINE_AGREEMENT = { minShare: 0.5, doubt: true, dropExtensions: false };

const EPS = 1e-4;

/**
 * Tsumugi's frames with their chord probabilities replaced by the vote of both models. Both are at
 * 25 frames per second from time 0; the result has Tsumugi's length (SheetSage2's last chord holds
 * if it is shorter).
 */
export function combineFrames(tsumugi: ChordFrames, sheetsage2: ChordFrames, w: CombineWeights = COMBINE_WEIGHTS): ChordFrames {
  if (Math.abs(tsumugi.fps - sheetsage2.fps) > 1e-9) throw new Error('the two models do not share a frame rate');
  const T = tsumugi.T;
  const probs = new Float32Array(T * N_CHORDS);
  const agree = new Float32Array(T);
  const logs = new Float64Array(N_CHORDS);
  for (let t = 0; t < T; t++) {
    const s = Math.min(t, sheetsage2.T - 1);
    agree[t] = argmax(tsumugi.probs, t * N_CHORDS) === argmax(sheetsage2.probs, s * N_CHORDS) ? 1 : 0;
    let m = -Infinity;
    for (let c = 0; c < N_CHORDS; c++) {
      const v = w.tsumugi * Math.log(tsumugi.probs[t * N_CHORDS + c]! + EPS) + w.sheetsage2 * Math.log(sheetsage2.probs[s * N_CHORDS + c]! + EPS);
      logs[c] = v;
      if (v > m) m = v;
    }
    let sum = 0;
    for (let c = 0; c < N_CHORDS; c++) sum += logs[c] = Math.exp(logs[c]! - m);
    for (let c = 0; c < N_CHORDS; c++) probs[t * N_CHORDS + c] = logs[c]! / sum;
  }
  return { ...tsumugi, probs, agree };
}

function argmax(p: Float32Array, at: number): number {
  let best = 0;
  for (let c = 1; c < N_CHORDS; c++) if (p[at + c]! > p[at + best]!) best = c;
  return best;
}
