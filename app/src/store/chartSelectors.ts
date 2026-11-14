// Values derived from the analysis and the hand corrections: what is in force
// (key, tuning, chords), how it is displayed (transposition, instrument), and
// the bars of the chart. Pure functions of the state, memoised on the
// references they read so React selectors can call them on every change.

import { chartBars, resolveChords, sectionBar, type BarChord, type ChartBar, type ChartChord } from '../chart/layout';
import { displayContext, type DisplayContext } from '../harmony/display';
import type { Key } from '../model/harmony';
import type { AppState } from './store';

/** Where a value in force comes from. */
export type Provenance = 'analysis' | 'manual' | 'none';

/** Remembers the last call: same arguments (by reference), same result. */
function memoN<A extends readonly unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let last: A | null = null;
  let value: R;
  return (...args: A) => {
    if (!last || args.length !== last.length || args.some((a, i) => a !== last![i])) {
      last = args;
      value = fn(...args);
    }
    return value;
  };
}

// ---------------------------------------------------------------- key and tuning

export interface KeyInForce {
  key: Key | null;
  origin: Provenance;
  /** The analysis' confidence, when the key comes from it. */
  confidence: number | null;
}

export function keyInForce(s: Pick<AppState, 'analysis' | 'corrections'>): KeyInForce {
  if (s.corrections.key) return { key: s.corrections.key, origin: 'manual', confidence: null };
  const k = s.analysis?.key;
  // The stored object itself (an `AnalysedKey` is a `Key`): stable for React selectors.
  if (k) return { key: k, origin: 'analysis', confidence: k.confidence };
  return { key: null, origin: 'none', confidence: null };
}

export interface TuningInForce {
  /** Distance of the recording from A = 440 Hz, in cents; null when unknown. */
  cents: number | null;
  origin: Provenance;
}

export function tuningInForce(s: Pick<AppState, 'analysis' | 'corrections'>): TuningInForce {
  if (s.corrections.tuningCents !== null) return { cents: s.corrections.tuningCents, origin: 'manual' };
  if (s.analysis?.tuning) return { cents: s.analysis.tuning.cents, origin: 'analysis' };
  return { cents: null, origin: 'none' };
}

/** Below this, a recording is « at 440 » for the player: no offer to compensate. */
export const TUNING_OFFER_MIN_CENTS = 5;

/** The playback cents that bring the recording back to A = 440 Hz. */
export function compensatingCents(cents: number): number {
  return Math.round(-cents);
}

/** Whether to offer the tuning compensation: a known offset, not yet compensated, not declined. */
export function tuningOffer(s: Pick<AppState, 'analysis' | 'corrections' | 'playback' | 'project'>): { cents: number; compensation: number } | null {
  if (!s.project) return null;
  const { cents } = tuningInForce(s);
  if (cents === null || Math.abs(cents) < TUNING_OFFER_MIN_CENTS || s.corrections.tuningOfferDismissed) return null;
  const compensation = compensatingCents(cents);
  return s.playback.cents === compensation ? null : { cents, compensation };
}

// ---------------------------------------------------------------- display

/** Transposition (transport semitones) + instrument + key + minor notation: how chords are written. */
export const chartDisplayContext = memoN(
  (analysis: AppState['analysis'], corrections: AppState['corrections'], semitones: number, instrument: AppState['view']['instrument'], minor: AppState['settings']['minorNotation']): DisplayContext =>
    displayContext(keyInForce({ analysis, corrections }).key, semitones, instrument, minor),
);

export function selectDisplayContext(s: AppState): DisplayContext {
  return chartDisplayContext(s.analysis, s.corrections, s.playback.semitones, s.view.instrument, s.settings.minorNotation);
}

/** The key as displayed (transposed, instrument applied), or null if unknown. */
export function selectDisplayedKey(s: AppState): Key | null {
  return selectDisplayContext(s).key;
}

// ---------------------------------------------------------------- chords and bars

const chordsMemo = memoN((map: AppState['tempoMap'], analysis: AppState['analysis'], corrections: AppState['corrections']) =>
  resolveChords(map, analysis?.chords ?? null, corrections),
);

/** The chords in force (analysis outside the hand-rewritten bars, plus hand chords), on the grid in force. */
export function selectChords(s: AppState): ChartChord[] {
  return chordsMemo(s.tempoMap, s.analysis, s.corrections);
}

/** True once there is anything to draw in a chord row or chart. */
export function selectHasChords(s: AppState): boolean {
  return selectChords(s).length > 0;
}

const barsMemo = memoN((chords: ChartChord[], map: AppState['tempoMap'], sections: AppState['corrections']['sections'], duration: number) =>
  chartBars({ map, chords, sections, duration }),
);

/** Every bar of the chart (stored chords, not yet transposed: write them with `selectDisplayContext`). */
export function selectChartBars(s: AppState): ChartBar[] {
  return barsMemo(selectChords(s), s.tempoMap, s.corrections.sections, s.project?.duration ?? 0);
}

/**
 * « Chords of bar N as displayed »: the chords starting in bar `bar`, each
 * with the stored chord and the display context to write it (transposed,
 * instrument applied). An empty list for a bar where the previous chord goes on.
 */
export function selectBarChords(s: AppState, bar: number): { chords: BarChord[]; ctx: DisplayContext; repeat: boolean } {
  const found = selectChartBars(s).find((b) => b.bar === bar);
  return { chords: found?.chords ?? [], ctx: selectDisplayContext(s), repeat: found?.repeat ?? false };
}

/** Section label at a bar, if any. */
export function selectSectionAt(s: AppState, bar: number): string | null {
  for (const m of s.corrections.sections) if (sectionBar(s.tempoMap, m.time) === bar) return m.label;
  return null;
}

/** Status of the analysis for the interface: never analysed, running, failed, done. */
export type AnalysisStatus = 'none' | 'running' | 'error' | 'done';

export const selectAnalysisStatus = (s: AppState): AnalysisStatus =>
  s.analysisRun.status === 'running' ? 'running' : s.analysisRun.status === 'error' ? 'error' : s.analysis ? 'done' : 'none';

/** Something was corrected by hand (grid, key, tuning, chords): a new analysis will keep it. */
export function selectHasCorrections(s: Pick<AppState, 'corrections' | 'tempoMap'>): boolean {
  const c = s.corrections;
  return s.tempoMap.origin === 'corrected' || s.tempoMap.origin === 'manual' || c.key !== null || c.tuningCents !== null || c.handSpans.length > 0;
}
