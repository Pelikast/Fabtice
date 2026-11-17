// Charts written as text for the structure tests (not used by the app).
//
//   chartBars('Em7 | A7 | Dmaj7 Bb7 | N.C. | ')   one bar per « | », chords spread on the beats
//
// Two chords in a 4-beat bar fall on beats 1 and 3, three on 1, 2, 3, four on
// every beat; an empty bar continues the chord before it; « N.C. » is no
// chord. Bars last `secondsPerBar`, from `start`, numbered from `firstBar`.

import { parseChord } from '../harmony/parse';
import type { ChordSymbol } from '../model/harmony';
import type { HarmonyBar, HarmonyChord, HarmonyInput } from './types';

export interface ChartOptions {
  beats?: number;
  secondsPerBar?: number;
  start?: number;
  firstBar?: number;
  /** Chords written as doubtful (all of them). */
  doubtful?: boolean;
}

export function chord(text: string): ChordSymbol | null {
  const p = parseChord(text);
  if (!p.ok) throw new Error(`test chart: cannot read ${text}`);
  return p.chord;
}

/** Bars from a text chart (see the header). */
export function chartBars(text: string, o: ChartOptions = {}): HarmonyBar[] {
  const beats = o.beats ?? 4;
  const spb = o.secondsPerBar ?? 2;
  const cells = text.split('|').map((c) => c.trim());
  if (cells[cells.length - 1] === '') cells.pop();
  let sounding: ChordSymbol | null = null;
  return cells.map((cell, i) => {
    const names = cell ? cell.split(/\s+/) : [];
    const at = names.length === 2 && beats >= 4 ? [0, beats / 2] : names.map((_, k) => Math.floor((k * beats) / Math.max(1, names.length)));
    const chords: HarmonyChord[] = names.map((n, k) => ({ beat: at[k]!, chord: chord(n), doubtful: !!o.doubtful, byHand: false }));
    const carried = chords[0]?.beat === 0 ? null : sounding;
    if (chords.length) sounding = chords[chords.length - 1]!.chord;
    const start = (o.start ?? 0) + i * spb;
    return { bar: (o.firstBar ?? 0) + i, start, end: start + spb, beats, meter: { numerator: beats, denominator: 4 }, chords, carried };
  });
}

/** The same chart text repeated `times` times. */
export function repeat(text: string, times: number): string {
  return Array.from({ length: times }, () => text.trim().replace(/\|\s*$/, '')).join(' | ');
}

/** A `HarmonyInput` around bars (no evidence, no known chart, mode auto). */
export function inputOf(bars: HarmonyBar[], extra: Partial<HarmonyInput> = {}): HarmonyInput {
  return {
    bars,
    duration: bars.length ? bars[bars.length - 1]!.end : 0,
    key: null,
    keyConfidence: 0,
    known: [],
    evidence: null,
    mode: 'auto',
    ...extra,
  };
}

/** An AABA standard of 32 bars in C (rhythm-changes-like A, a bridge on III7 VI7 II7 V7). */
export const AABA_A1 = 'Cmaj7 A7 | Dm7 G7 | Cmaj7 A7 | Dm7 G7 | Fmaj7 Fm7 | Em7 A7 | Dm7 G7 | Em7 A7';
export const AABA_A2 = 'Cmaj7 A7 | Dm7 G7 | Cmaj7 A7 | Dm7 G7 | Fmaj7 Fm7 | Em7 A7 | Dm7 G7 | Cmaj7';
export const AABA_B = 'E7 | E7 | A7 | A7 | D7 | D7 | G7 | G7';
export const AABA = [AABA_A1, AABA_A2, AABA_B, AABA_A2].join(' | ');
/** A 12-bar blues in F. */
export const BLUES = 'F7 | Bb7 | F7 | F7 | Bb7 | Bb7 | F7 | D7 | Gm7 | C7 | F7 D7 | Gm7 C7';
