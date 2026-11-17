// The manual tempo actions of the bar menu, on the store side: applying one
// (`analysis/runner.ts#runTempoFix` computes it), undoing one.
//
// What an action changes:
//   - the grid: from the chosen bar on, the new beats; before it, nothing
//     (beat for beat). It is a correction by hand (origin `corrected`): a new
//     analysis keeps it, « Revenir à l'analyse » in the panel drops it with the
//     other grid corrections;
//   - the analysed chords from the chosen bar on, decoded on the new grid;
//     those before it stay as they were. The analysed beats, the analysed
//     key, modulations and structure stay as they were (they are what
//     « Revenir à l'analyse » goes back to);
//   - `corrections.tempoFixes`: where it starts and the grid just before it.
// What it never changes: what was done by hand. Hand chords, rewritten
// stretches, section letters, loops and named loops are kept in source time
// (seconds in the recording): they stay with the same music, and the chart and
// the ruler place them on the nearest beat or bar line of the new grid.
// The signatures are kept too (C13): the first one as it was (the analyser
// only knows its number of beats), the changes further on placed again on
// the new grid by time (`grid/meters.ts#withMetersOf`); before the chosen bar
// the beats are the same, so they stay on the same bars there.
// A bar that starts between two beats of the grid (after a bar with an odd
// number of eighths, 7/8 or 7/16, « la noire reste la noire »): the grid sent
// to the analysis has the bar's start as a beat (`analysis/runner.ts`), and the
// map is spliced there (`tempoMapForFix`): the map before the bar as it was,
// the new beats from the bar on, counted from the bar's own position.

import { MIN_BEAT_GAP, tempoMapFromBeats } from '../grid/beats';
import { withMetersOf } from '../grid/meters';
import { bpmAt, timeToBeat } from '../grid/tempoMap';
import type { AnalysisResult } from '../model/analysis';
import type { TempoFix } from '../model/corrections';
import type { TempoMap, TempoSegment } from '../model/tempoMap';
import { transact } from './history';
import { appStore, gridInForce, type AppState } from './store';

const EPS = 1e-6;

/**
 * The grid after a manual tempo action whose result is `beats` (the grid sent, computed again from
 * the bar starting at `time`), on the grid in force of `s`. Throws when the beats make no grid.
 */
export function tempoMapForFix(s: Pick<AppState, 'tempoMap' | 'tempoPreview'>, beats: AnalysisResult['beats'], time: number): TempoMap {
  const map = gridInForce(s);
  const at = timeToBeat(map, time);
  if (Math.abs(at - Math.round(at)) < 1e-6) {
    // The beats come back in the units of the grid sent (`beatGridOf`): the first signature's denominator is the grid's.
    const first = map.meters[0]!.meter;
    const meter = { numerator: beats.meter.numerator, denominator: first.denominator };
    return withMetersOf(tempoMapFromBeats(beats.times, beats.downbeat, meter, 'corrected'), map);
  }
  // The bar starts between two beats of the grid: the map is spliced at it.
  // The bar's start stays where it is (the analysis keeps it: `anchored`), the new beats after it.
  const after: number[] = [time];
  for (const t of beats.times) if (t > time + 1e-3 && t - after[after.length - 1]! >= MIN_BEAT_GAP) after.push(t);
  if (after.length < 2) throw new RangeError('a beat grid needs at least two beats');
  const segments: TempoSegment[] = map.segments.filter((sg) => sg.time < time - 1e-9).map((sg) => ({ ...sg }));
  // The first segment extends backwards: one in force before the bar keeps the beats there.
  if (!segments.length) segments.push({ time: time - 60, beat: timeToBeat(map, time - 60), bpm: bpmAt(map, time - 60) });
  for (let i = 0; i + 1 < after.length; i++) segments.push({ time: after[i]!, beat: at + i, bpm: 60 / (after[i + 1]! - after[i]!) });
  return withMetersOf({ origin: 'corrected', segments, meters: [{ ...map.meters[0]!, meter: { ...map.meters[0]!.meter } }] }, map);
}

/** Stores the result of a manual tempo action (see above). */
export function applyTempoFix(result: AnalysisResult, fix: TempoFix): void {
  const s = appStore.getState();
  if (!s.project) return;
  let tempoMap;
  try {
    tempoMap = tempoMapForFix(s, result.beats, fix.time);
  } catch {
    appStore.setState({ analysisRun: { status: 'idle' } });
    return;
  }
  const old = s.analysis;
  const analysis: AnalysisResult = old
    ? {
        ...result,
        beats: old.beats,
        key: old.key,
        keyChanges: old.keyChanges,
        tuning: old.tuning,
        structure: old.structure,
        chords: [...old.chords.filter((c) => c.time < fix.time - EPS), ...result.chords.filter((c) => c.time >= fix.time - EPS)],
      }
    : result;
  // A new action at the same bar replaces the one there (its « previous » grid is the one to go back to).
  const before = s.corrections.tempoFixes;
  const same = before.findIndex((f) => Math.abs(f.time - fix.time) < 1e-3);
  const tempoFixes = same >= 0 ? [...before.slice(0, same), { ...fix, previous: before[same]!.previous }, ...before.slice(same + 1)] : [...before, fix];
  // One undo step for the three together (`store/history.ts`): the grid, the analysed chords, the fixes.
  transact('history.what.tempoFix', () => appStore.setState({ tempoMap, tempoPreview: null, analysis, corrections: { ...s.corrections, tempoFixes }, analysisRun: { status: 'idle' } }));
}

/** The manual tempo action that starts at this bar start (source time), if any. */
export function tempoFixAt(fixes: readonly TempoFix[], time: number): TempoFix | null {
  return fixes.find((f) => Math.abs(f.time - time) < 1e-3) ?? null;
}

/**
 * « Revenir à l'analyse » on the bar of a manual tempo action: the grid goes
 * back to what it was just before it, and the actions made after it (computed
 * on its grid) go too.
 */
export function undoTempoFix(time: number): void {
  const s = appStore.getState();
  const i = s.corrections.tempoFixes.findIndex((f) => Math.abs(f.time - time) < 1e-3);
  if (i < 0) return;
  const fix = s.corrections.tempoFixes[i]!;
  // The signatures changed further in the piece are the user's as they are now (some may be newer than the action).
  appStore.setState({ tempoMap: withMetersOf(fix.previous, gridInForce(s)), tempoPreview: null, corrections: { ...s.corrections, tempoFixes: s.corrections.tempoFixes.slice(0, i) } });
}

/** Undoes the last manual tempo action (« Annuler »). */
export function undoLastTempoFix(): void {
  const fixes = appStore.getState().corrections.tempoFixes;
  const last = fixes[fixes.length - 1];
  if (last) undoTempoFix(last.time);
}
