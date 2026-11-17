// What the user changed or added by hand, kept apart from the analysis result
// (`model/analysis.ts`). A later analysis never overwrites any of this unless
// the user asks (`store/analysisActions.ts#applyAnalysis`).
//
// The beat grid is the exception: the grid in force is `ProjectDocument.tempoMap`
// itself, and its `origin` says who made it (`default`, `manual` from the
// lot 1 panel, `analysis`, or `corrected`: analysed beats corrected by hand).
// The analysed beats stay in the result, so « back to the analysis » is
// always possible.
//
// Positions are source time (seconds in the recording), not bars: a chord or a
// section stays with the music when the grid is corrected (first beat moved,
// tempo doubled, meter changed). The chart rounds them to the nearest beat or
// bar line of the grid in force (see `chart/layout.ts`).

import type { ChordSymbol, Key, KeyChange } from './harmony';
import type { Seconds, TimeRange } from './project';
import { emptyStructureCorrections, type StructureCorrections } from './structure';
import type { TempoMap } from './tempoMap';

/**
 * A manual tempo action of the bar menu (« Corriger un changement de tempo
 * indésirable », « Réanalyser le tempo à partir de cette mesure », and from
 * version 6 « Correction de la courbe en tapant le tempo »): from the bar
 * starting at `time`, the grid was computed again. The grid itself is the
 * tempo map in force (origin `corrected`); this keeps where the action starts
 * (a mark on the ruler) and the grid as it was just before, so that the action
 * can be undone (« Revenir à l'analyse » on that bar).
 */
export type TempoFix = AnalysedTempoFix | TappedTempoFix;

export type TempoFixKind = TempoFix['kind'];
export const TEMPO_FIX_KINDS: readonly TempoFixKind[] = ['continuity', 'fresh', 'tapped'];

interface TempoFixBase {
  /** Source time of the chosen bar's start (a downbeat, before and after). */
  time: Seconds;
  /** The grid in force just before the action. */
  previous: TempoMap;
}

/** The two actions computed by the analysis alone. */
export interface AnalysedTempoFix extends TempoFixBase {
  /** `continuity`: the tempo before goes on; `fresh`: analysed again from there. */
  kind: 'continuity' | 'fresh';
}

/**
 * Version 6: the user tapped the beats of a difficult passage. The grid from
 * `time` to `end` was placed from the taps, the rest of the piece analysed
 * again after it. The taps are kept so that the passage can be computed again
 * (a later, better algorithm) without asking the user to tap again.
 */
export interface TappedTempoFix extends TempoFixBase {
  kind: 'tapped';
  /**
   * Every tap as heard (`analysis/tapFix.ts#tapNow` takes the output latency
   * off), in source seconds, ascending (equal times allowed), before
   * compensating the user's usual advance or delay and before snapping to
   * the network's beats. Taps made along the count-in on the last two bars
   * before `time` are kept too (they tell the user's usual advance); earlier
   * ones are not.
   */
  taps: Seconds[];
  /** Source time where the tapped passage ends (its last beat placed from the taps), after `time`. */
  end: Seconds;
}

/** A chord written by hand: it starts at `time` and lasts until the next chord. */
export interface HandChord {
  time: Seconds;
  /** Null for « N.C. ». */
  chord: ChordSymbol | null;
}

/** A section letter (« A », « B », « Pont »…), placed by the user on a bar line. */
export interface SectionMark {
  /** Source time of the bar line where the section starts. */
  time: Seconds;
  /** Short text, 1 to 12 characters, shown boxed above the bar. */
  label: string;
}

export interface Corrections {
  /** The main key chosen by hand (the first passage, from 0); null = the analysed key (or none). */
  key: Key | null;
  /**
   * Version 6: the later passages (modulations) as the user wants them, or
   * null = the analysed ones (`AnalysisResult.keyChanges`). Once the user adds,
   * moves, changes or deletes one, this is the whole list (an analysed one
   * deleted is simply absent), so a new analysis never undoes it. Ascending,
   * each strictly after 0 and after the one before.
   */
  keyChanges: KeyChange[] | null;
  /**
   * The recording's distance from A = 440 Hz as corrected by hand, in cents;
   * null = the analysed value. Compensating it is a separate act: it sets the
   * playback cents (`PlaybackSettings.cents`).
   */
  tuningCents: number | null;
  /** The user declined the offer to compensate the tuning: do not offer it again for this piece. */
  tuningOfferDismissed: boolean;
  /** Chords written by hand, ascending by time. */
  chords: HandChord[];
  /**
   * Stretches the user rewrote by hand (whole bars at the time of the edit),
   * ascending, never overlapping. Analysed chords starting inside them are
   * hidden; hand chords inside them are shown. A rewritten stretch with no hand
   * chord means « no new chord here »: the previous chord goes on.
   */
  handSpans: TimeRange[];
  /**
   * Section letters placed by hand, ascending by time, at most one per bar
   * line (the letters in force when there is one, or when
   * `structure.lettersByHand`: see `model/structure.ts`).
   */
  sections: SectionMark[];
  /** Version 6: the structure corrected by hand (mode, parts), see `model/structure.ts`. */
  structure: StructureCorrections;
  /**
   * Manual tempo actions, in the order they were made (each one computed on the
   * grid the one before left). Dropped with the grid corrections.
   */
  tempoFixes: TempoFix[];
}

export function emptyCorrections(): Corrections {
  return {
    key: null,
    keyChanges: null,
    tuningCents: null,
    tuningOfferDismissed: false,
    chords: [],
    handSpans: [],
    sections: [],
    structure: emptyStructureCorrections(),
    tempoFixes: [],
  };
}
