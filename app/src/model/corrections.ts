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

import type { ChordSymbol, Key } from './harmony';
import type { Seconds, TimeRange } from './project';

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
  /** The key chosen by hand; null = the analysed key (or none). */
  key: Key | null;
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
  /** Section letters, ascending by time, at most one per bar line. */
  sections: SectionMark[];
}

export function emptyCorrections(): Corrections {
  return { key: null, tuningCents: null, tuningOfferDismissed: false, chords: [], handSpans: [], sections: [] };
}
