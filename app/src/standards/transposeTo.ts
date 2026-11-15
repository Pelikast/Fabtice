// A chart read from iReal (`StandardChart`) put in the key of the recording, and « which chord
// sounds here » for a chart played over several choruses. Small and pure; the chords are the
// app's own, so `transposeChord` and `transposeKey` of `../harmony` do the work.

import { transposeChord } from '../harmony/chord';
import { transposeKey } from '../harmony/key';
import { pc } from '../harmony/pitch';
import type { ChordSymbol, Key } from '../model/harmony';
import type { ReadAlternate, ReadBar, ReadChord, StandardChart } from './irealRead';

/**
 * The shortest shift (−6…+6 semitones) that takes `from` to `to`. Tonics only: a minor chart asked for a
 * major key is read in that key's relative minor (« A- » to « C » is 0), so the mode never changes.
 */
export function semitonesBetween(from: Key, to: Key): number {
  const target = from.mode === to.mode ? to.tonic : from.mode === 'minor' ? pc(to.tonic + 9) : pc(to.tonic + 3);
  const d = pc(target - from.tonic);
  return d > 6 ? d - 12 : d;
}

const shiftChord = (c: ReadChord, semitones: number): ReadChord => ({ ...c, chord: c.chord ? transposeChord(c.chord, semitones) : null });
const shiftAlternate = (a: ReadAlternate, semitones: number): ReadAlternate => ({ ...a, chord: a.chord ? transposeChord(a.chord, semitones) : null });

/** The chart with every chord (and its key) moved by `semitones`. The texts (`text`) stay those of the original chart. */
export function transposeChart(chart: StandardChart, semitones: number): StandardChart {
  if (semitones % 12 === 0) return chart;
  return {
    ...chart,
    key: chart.key ? transposeKey(chart.key, semitones) : null,
    bars: chart.bars.map((b) => ({ ...b, chords: b.chords.map((c) => shiftChord(c, semitones)), alternates: b.alternates.map((a) => shiftAlternate(a, semitones)) })),
  };
}

/** The chart in `key` (see `semitonesBetween`); null when the chart has no key of its own. */
export function transposeChartToKey(chart: StandardChart, key: Key): StandardChart | null {
  if (!chart.key) return null;
  return transposeChart(chart, semitonesBetween(chart.key, key));
}

// ---------------------------------------------------------------- which chord sounds here

/** What sounds at one beat of a chart played over choruses. */
export interface SoundingChord {
  /** null = « N.C. ». */
  chord: ChordSymbol | null;
  text: string;
  approximate: boolean;
  /** A chord STARTS on this beat (false: it goes on from an earlier beat). */
  onset: boolean;
  /** Bar of the chart (index into `chart.bars`) and chorus (0-based) this beat belongs to. */
  barInForm: number;
  chorus: number;
}

/** Beats of one chorus of the chart (the sum of its bars' meters). */
export function beatsInForm(chart: StandardChart): number {
  return chart.bars.reduce((n, b) => n + b.meter.numerator, 0);
}

/**
 * The chord that sounds at beat `beat` (0-based) of bar `bar` (0-based, counted over the whole piece: a
 * 32-bar chart played three times has bars 0…95), for a chart repeated `choruses` times (default 1).
 * A chord goes on until the next one starts, also over bar lines and from one chorus to the next (the
 * form is a loop). Null outside the piece, or before the chart's first chord.
 */
export function chordAt(chart: StandardChart, bar: number, beat: number, choruses = 1): SoundingChord | null {
  const n = chart.bars.length;
  if (n === 0 || !Number.isInteger(bar) || !Number.isInteger(beat) || bar < 0 || beat < 0) return null;
  if (bar >= n * Math.max(1, choruses)) return null;
  const chorus = Math.floor(bar / n);
  const inForm = bar % n;
  const here: ReadBar = chart.bars[inForm]!;
  if (beat >= here.meter.numerator) return null;
  const at = (b: ReadBar, upTo: number): ReadChord | null => {
    let found: ReadChord | null = null;
    for (const c of b.chords) if (c.beat <= upTo) found = c;
    return found;
  };
  const onsetNow = here.chords.find((c) => c.beat === beat);
  let found = at(here, beat);
  // look back through the earlier bars, round the loop when this is not the first chorus
  const limit = chorus === 0 ? inForm : n;
  for (let k = 1; found === null && k <= limit; k++) {
    const b = chart.bars[(inForm - k + n) % n]!;
    found = at(b, b.meter.numerator);
  }
  if (found === null) return null;
  return { chord: found.chord, text: found.text, approximate: found.approximate, onset: onsetNow !== undefined, barInForm: inForm, chorus };
}
