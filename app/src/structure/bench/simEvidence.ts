// Simulated `StructureEvidence` (Tier S): what the audio says about who plays,
// bar by bar, made from the truth's nominal stem levels.
//
// IDEALISED: the stems are a perfect separation (each instrument in its own
// track) blurred by a lognormal spread and a leak of every track into the
// others; the timbre of the mix is a fixed spectral template per track; the
// wind recogniser is a dice with the right / « winds » / wrong rates of the
// noise level, drawn once per part (its errors are correlated, as a real
// recogniser's would be) and re-drawn on a few bars. Tier R measures real
// levels on rendered tracks instead (still an ideal separation).

import type { StemId } from '../../model/separation';
import type { HarmonyBar, InstrumentGuess, StructureEvidence } from '../types';
import type { TruthPiece } from './cases';
import type { Noise } from './noise';
import { gauss, pick, type Rng } from './rng';

export type EvidenceKind = 'stems' | 'mix' | 'none';
export const EVIDENCE_KINDS: readonly EvidenceKind[] = ['stems', 'mix', 'none'];

/** The tracks of the separation the corpus is split into (the names of `app/src/separation/models.json`). */
export const BENCH_STEMS: readonly StemId[] = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];

export const TIMBRE_BANDS = 8;
/** Rough share of each track's energy in 8 log-spaced bands (60 Hz … 12 kHz). */
const TEMPLATE: Record<string, number[]> = {
  drums: [0.25, 0.1, 0.05, 0.05, 0.08, 0.12, 0.17, 0.18],
  bass: [0.45, 0.35, 0.12, 0.05, 0.02, 0.01, 0, 0],
  piano: [0.05, 0.15, 0.3, 0.25, 0.15, 0.07, 0.02, 0.01],
  guitar: [0.02, 0.1, 0.28, 0.3, 0.18, 0.08, 0.03, 0.01],
  other: [0, 0.04, 0.16, 0.3, 0.28, 0.14, 0.06, 0.02],
  vocals: [0, 0.05, 0.2, 0.32, 0.25, 0.12, 0.05, 0.01],
};

const WINDS = ['trumpet', 'saxophone', 'trombone', 'clarinet', 'flute'];

/** Truth bars overlapping [start, end), with their overlap in seconds. */
function overlaps(piece: TruthPiece, start: number, end: number): { i: number; w: number }[] {
  const out: { i: number; w: number }[] = [];
  piece.bars.forEach((b, i) => {
    const w = Math.min(end, b.end) - Math.max(start, b.start);
    if (w > 1e-6) out.push({ i, w });
  });
  return out;
}

/** Simulated recogniser reading for one part led by `instrument` in the « other » track. */
function guess(instrument: string, n: Noise, r: Rng): InstrumentGuess {
  const x = r();
  if (x < n.windsRight) return { instrument, confidence: 0.6 + 0.4 * r() };
  if (x < n.windsRight + n.windsUnsure) return { instrument: 'winds', confidence: 0.2 + 0.3 * r() };
  const wrong = [...WINDS, 'vibraphone'].filter((w) => w !== instrument);
  return { instrument: pick(r, wrong), confidence: 0.5 + 0.3 * r() };
}

export function simulatedEvidence(piece: TruthPiece, bars: readonly HarmonyBar[], kind: EvidenceKind, n: Noise, r: Rng): StructureEvidence | null {
  if (kind === 'none') return null;
  const levels: Record<string, Float32Array> = {};
  for (const s of BENCH_STEMS) levels[s] = new Float32Array(bars.length);
  const timbre = new Float32Array(bars.length * TIMBRE_BANDS);
  const winds: (InstrumentGuess | null)[] = [];
  const partGuess = new Map<number, InstrumentGuess>();
  bars.forEach((bar, k) => {
    const ov = overlaps(piece, bar.start, bar.end);
    const total = ov.reduce((a, o) => a + o.w, 0) || 1;
    const clean: Record<string, number> = {};
    for (const s of BENCH_STEMS) clean[s] = 0;
    for (const o of ov) for (const [s, v] of Object.entries(piece.bars[o.i]!.play)) clean[s] = (clean[s] ?? 0) + (v * o.w) / total;
    const sum = BENCH_STEMS.reduce((a, s) => a + clean[s]!, 0);
    for (const s of BENCH_STEMS) {
      const v = (clean[s]! + n.leak * (sum - clean[s]!) / (BENCH_STEMS.length - 1)) * Math.exp(n.levelSpread * gauss(r));
      levels[s]![k] = v;
    }
    for (let band = 0; band < TIMBRE_BANDS; band++) {
      let e = 1e-6;
      for (const s of BENCH_STEMS) e += clean[s]! ** 2 * TEMPLATE[s]![band]!;
      timbre[k * TIMBRE_BANDS + band] = Math.log(e) + n.levelSpread * gauss(r);
    }
    // the recogniser on the « other » track: the lead of the bar that covers most of it
    const main = ov.sort((a, b) => b.w - a.w)[0];
    const tb = main ? piece.bars[main.i]! : null;
    if (tb?.lead && tb.lead.stem === 'other') {
      let g = partGuess.get(tb.part);
      if (!g) {
        g = guess(tb.lead.instrument, n, r);
        partGuess.set(tb.part, g);
      }
      winds.push(r() < 0.1 ? guess(tb.lead.instrument, n, r) : g);
    } else if ((clean.other ?? 0) > 0.02) {
      winds.push({ instrument: 'winds', confidence: 0.1 + 0.2 * r() });
    } else winds.push(null);
  });
  if (kind === 'mix') return { stems: null, timbre: { bands: TIMBRE_BANDS, data: timbre }, winds: null };
  return { stems: levels as Partial<Record<StemId, Float32Array>>, timbre: { bands: TIMBRE_BANDS, data: timbre }, winds };
}
