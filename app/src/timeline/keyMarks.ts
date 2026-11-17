// The modulations on the ruler of « Pistes » (C10): at the bar line where the key changes, the line is drawn a
// little stronger and the new key is written in a small pill of the chart's own look (a thin box, ink-soft text, ink
// when the user wrote the modulation), after the bar number (or the signature). The name is left out, never drawn
// over something, when there is no room before the next bar line; the stronger line stays. Pure (tested in
// keyMarks.test.ts); `drawing.ts` draws what this decides.

import type { Seconds } from '../model/project';

/** The pill's font: the ruler's, with the music font for ♭ and ♯ (as the chords write them). */
export const KEY_MARK_FONT = '600 11px "Instrument Sans", "Noto Music", "Helvetica Neue", Arial, sans-serif';
/** Space inside the pill, left and right of the text. */
export const KEY_MARK_PAD_X = 5;
/** Space between what comes before (the bar number, the signature) and the pill. */
export const KEY_MARK_GAP = 7;
/** Space kept between the pill and the next bar line. */
export const KEY_MARK_END_GAP = 6;

/** A modulation to write: at the start of bar `bar` (index), the key as the chart writes it. */
export interface KeyMarkView {
  bar: number;
  time: Seconds;
  /** « A♭ », « F♯m »: the key as displayed (transposition, instrument and minor sign applied). */
  text: string;
  /** Written by the user (the whole list is theirs once they touched it), not the analysis. */
  byHand: boolean;
}

/** Where the pill goes: it starts at `left`, must end `KEY_MARK_END_GAP` before `end`; null when it does not fit. */
export function layoutKeyMark(left: number, end: number, textWidth: number): { x: number; width: number } | null {
  const width = textWidth + 2 * KEY_MARK_PAD_X;
  return left + width + KEY_MARK_END_GAP <= end ? { x: left, width } : null;
}

/** What the browser checks read (`data-modulations` on the timeline): « 9:F♯m 17:A♭ », bars as shown (1-based). */
export function describeKeyMarks(written: readonly { bar: number; text: string }[]): string {
  return written.map((m) => `${m.bar + 1}:${m.text}`).join(' ');
}

/** The modulations in `bars` order as views; used by the controller from the chart's bars. */
export function indexKeyMarks(views: readonly KeyMarkView[]): ReadonlyMap<number, KeyMarkView> {
  return new Map(views.map((v) => [v.bar, v]));
}
