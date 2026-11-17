// Values derived from the analysis and the hand corrections: what is in force
// (key, tuning, chords), how it is displayed (transposition, instrument), and
// the bars of the chart. Pure functions of the state, memoised on the
// references they read so React selectors can call them on every change.

import { chartBars, resolveChords, sectionBar, type BarChord, type ChartBar, type ChartChord } from '../chart/layout';
import { displayContext, type DisplayContext } from '../harmony/display';
import type { AnalysisResult } from '../model/analysis';
import type { Key, KeyChange } from '../model/harmony';
import { keyAt, keyChangesInForce } from './keySelectors';
import type { AppState } from './store';
import { sectionsInForce } from './structureSelectors';

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

/**
 * One display context per (key, transposition, instrument, notation): the same object for the same
 * values, so that a chart cell, a chord editor or the timeline comparing contexts by reference sees
 * no change when nothing changed (a chord edit, a refresh of the modulations that finds the same).
 */
const contexts = new Map<string, DisplayContext>();

function sharedContext(key: Key | null, semitones: number, instrument: AppState['view']['instrument'], minor: AppState['settings']['minorNotation']): DisplayContext {
  const id = `${key ? `${key.tonic}${key.mode}` : '-'}|${semitones}|${instrument}|${minor}`;
  let ctx = contexts.get(id);
  if (!ctx) {
    if (contexts.size > 512) contexts.clear();
    ctx = displayContext(key, semitones, instrument, minor);
    contexts.set(id, ctx);
  }
  return ctx;
}

/** Transposition (transport semitones) + instrument + key + minor notation: how chords are written. */
export const chartDisplayContext = (
  analysis: AppState['analysis'],
  corrections: AppState['corrections'],
  semitones: number,
  instrument: AppState['view']['instrument'],
  minor: AppState['settings']['minorNotation'],
): DisplayContext => sharedContext(keyInForce({ analysis, corrections }).key, semitones, instrument, minor);

/** The display context of the main key (the first passage): the title, the key editor, the transposition of what is typed. */
export function selectDisplayContext(s: AppState): DisplayContext {
  return chartDisplayContext(s.analysis, s.corrections, s.playback.semitones, s.view.instrument, s.settings.minorNotation);
}

/** The key as displayed (transposed, instrument applied), or null if unknown. */
export function selectDisplayedKey(s: AppState): Key | null {
  return selectDisplayContext(s).key;
}

/** C10: the display context of the key passage heard at `time` (source seconds): chords there are spelled in its key. */
export function selectDisplayContextAt(s: AppState, time: number): DisplayContext {
  return sharedContext(keyAt(s, time), s.playback.semitones, s.view.instrument, s.settings.minorNotation);
}

/**
 * The display context of each bar, by bar number: `main` until a bar where a later passage starts
 * (`ChartBar.keyChange`), that passage's key from there. Pure; contexts are shared (`sharedContext`).
 */
export function barContextsOf(
  bars: readonly ChartBar[],
  mainKey: Key | null,
  semitones: number,
  instrument: AppState['view']['instrument'],
  minor: AppState['settings']['minorNotation'],
): Map<number, DisplayContext> {
  const out = new Map<number, DisplayContext>();
  let ctx = sharedContext(mainKey, semitones, instrument, minor);
  for (const b of bars) {
    if (b.keyChange) ctx = sharedContext(b.keyChange, semitones, instrument, minor);
    out.set(b.bar, ctx);
  }
  return out;
}

const barContextsMemo = memoN(
  (bars: ChartBar[], main: Key | null, semitones: number, instrument: AppState['view']['instrument'], minor: AppState['settings']['minorNotation']): ReadonlyMap<number, DisplayContext> =>
    barContextsOf(bars, main, semitones, instrument, minor),
);

/**
 * C10: the display context of every bar of the chart, by bar number: the main key's until a bar where
 * a later passage starts (`ChartBar.keyChange`), that passage's key from there. The same map while the
 * bars and the display do not change; every context is shared (`sharedContext`).
 */
export function selectBarContexts(s: AppState): ReadonlyMap<number, DisplayContext> {
  return barContextsMemo(selectChartBars(s), keyInForce(s).key, s.playback.semitones, s.view.instrument, s.settings.minorNotation);
}

/** C10: the display context of bar `bar` (the main key's for a bar outside the chart). */
export function selectBarContext(s: AppState, bar: number): DisplayContext {
  return selectBarContexts(s).get(bar) ?? selectDisplayContext(s);
}

// ---------------------------------------------------------------- chords and bars

const chordsMemo = memoN((map: AppState['tempoMap'], analysed: AnalysisResult['chords'] | null, corrections: AppState['corrections']) =>
  resolveChords(map, analysed, corrections),
);

/** The chords in force (analysis outside the hand-rewritten bars, plus hand chords), on the grid in force. */
export function selectChords(s: AppState): ChartChord[] {
  // On the analysed chords, not the whole result: a refresh of the modulations or the structure leaves them alone.
  return chordsMemo(s.tempoMap, s.analysis?.chords ?? null, s.corrections);
}

/** True once there is anything to draw in a chord row or chart. */
export function selectHasChords(s: AppState): boolean {
  return selectChords(s).length > 0;
}

/** Lot 4: the piece has a section letter (the user's, or the detected ones in force) or a named loop (the ruler then shows its « Repères » row). */
export function selectHasMarkers(s: AppState): boolean {
  return sectionsInForce(s).length > 0 || s.markers.loops.length > 0;
}

const barsMemo = memoN((chords: ChartChord[], map: AppState['tempoMap'], sections: AppState['corrections']['sections'], duration: number, keyChanges: KeyChange[]) =>
  chartBars({ map, chords, sections, duration, keyChanges }),
);

/** Every bar of the chart (stored chords, not yet transposed: write them with `selectBarContexts`). */
export function selectChartBars(s: AppState): ChartBar[] {
  return barsMemo(selectChords(s), s.tempoMap, sectionsInForce(s), s.project?.duration ?? 0, keyChangesInForce(s));
}

/**
 * « Chords of bar N as displayed »: the chords starting in bar `bar`, each
 * with the stored chord and the display context to write it (transposed,
 * instrument applied, spelled in the key of the passage the bar is in). An
 * empty list for a bar where the previous chord goes on.
 */
export function selectBarChords(s: AppState, bar: number): { chords: BarChord[]; ctx: DisplayContext; repeat: boolean } {
  const found = selectChartBars(s).find((b) => b.bar === bar);
  return { chords: found?.chords ?? [], ctx: selectBarContext(s, bar), repeat: found?.repeat ?? false };
}

/** Section label at a bar, if any (the letters in force). */
export function selectSectionAt(s: AppState, bar: number): string | null {
  for (const m of sectionsInForce(s)) if (sectionBar(s.tempoMap, m.time) === bar) return m.label;
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
