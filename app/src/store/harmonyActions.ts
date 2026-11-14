// Hand corrections of the harmony and the chart: chords (set, replace, split,
// remove, confirm, back to the analysis), key, tuning (correction and
// compensation), section letters, instrument. Chords are given as stored:
// concert pitch, original key (the chart editor un-transposes what the user
// typed with `untransposeForStorage`).

import { entriesOf, splitBeat, withBarChords, withoutBarEdit, withSection, type BarEntry } from '../chart/edits';
import { transposeChord } from '../harmony/chord';
import { sameKey } from '../harmony/key';
import type { ChordSymbol, Instrument, Key } from '../model/harmony';
import { emptyCorrections, type Corrections } from '../model/corrections';
import { clampCents } from './derived';
import { meterAtBar } from '../grid/tempoMap';
import { compensatingCents, selectBarChords, selectChartBars, selectDisplayContext, tuningInForce } from './chartSelectors';
import { appStore, type AppState } from './store';

const get = () => appStore.getState();
const set = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => appStore.setState(patch);

function edit(fn: (c: Corrections, s: AppState) => Corrections): void {
  const s = get();
  if (!s.project) return;
  set({ corrections: fn(s.corrections, s) });
}

/** A chord typed as displayed (transposed, for the chosen instrument) brought back to concert pitch in the original key. */
export function untransposeForStorage(chord: ChordSymbol, s: AppState = get()): ChordSymbol {
  return transposeChord(chord, -selectDisplayContext(s).shift);
}

// ---------------------------------------------------------------- chords

/** Bar `bar` holds exactly these chords from now on (stored pitch). An empty list: the previous chord goes on. */
export function setBarChords(bar: number, entries: readonly BarEntry[]): void {
  edit((c, s) => withBarChords(c, s.tempoMap, bar, entries));
}

function current(bar: number): BarEntry[] {
  return entriesOf(selectBarChords(get(), bar).chords);
}

/** Replaces the `index`-th chord of bar `bar` (stored pitch; null for « N.C. »). */
export function replaceChord(bar: number, index: number, chord: ChordSymbol | null): void {
  const entries = current(bar);
  if (index < 0 || index >= entries.length) {
    // An empty bar (or one going on): the chord goes on its first beat.
    setBarChords(bar, [...entries, { beatInBar: 0, chord }]);
    return;
  }
  setBarChords(bar, entries.map((e, i) => (i === index ? { ...e, chord } : e)));
}

/**
 * Splits bar `bar` in two: a second chord on the middle beat, a copy of the
 * chord in force there for now (the editor then replaces it). A bar that
 * already has two chords or more, or with no chord before it, is left as is.
 */
export function splitBar(bar: number): void {
  const s = get();
  const { chords } = selectBarChords(s, bar);
  if (chords.length >= 2) return;
  const mid = splitBeat(meterAtBar(s.tempoMap, bar).numerator);
  const first = chords[0];
  if (first && first.beatInBar < mid) {
    setBarChords(bar, [{ beatInBar: first.beatInBar, chord: first.chord }, { beatInBar: mid, chord: first.chord }]);
    return;
  }
  const going = chordGoingOnAt(s, bar);
  if (going === undefined) return;
  setBarChords(bar, [{ beatInBar: 0, chord: going }, { beatInBar: mid, chord: first ? first.chord : going }]);
}

/** Removes the `index`-th chord of bar `bar`; the chord before it goes on. */
export function removeChord(bar: number, index: number): void {
  setBarChords(bar, current(bar).filter((_, i) => i !== index));
}

/** The user checked bar `bar` and agrees: its chords become hand chords (no longer doubtful). */
export function confirmBar(bar: number): void {
  setBarChords(bar, current(bar));
}

/** Gives bar `bar` back to the analysis. */
export function resetBar(bar: number): void {
  edit((c, s) => withoutBarEdit(c, s.tempoMap, bar));
}

/** Drops every chord correction (the user asked): the analysis shows again everywhere. */
export function resetChordCorrections(): void {
  edit((c) => ({ ...c, chords: [], handSpans: [] }));
}

// ---------------------------------------------------------------- key and tuning

/** The key of the piece by hand; null goes back to the analysed key. Chord spelling follows. */
export function setKey(key: Key | null): void {
  edit((c, s) => {
    const analysed = s.analysis?.key ?? null;
    // Choosing the analysed key again is not a correction.
    const chosen = key && analysed && sameKey(key, analysed) ? null : key;
    return { ...c, key: chosen };
  });
}

/** Corrects the measured distance from A = 440 Hz (cents); null goes back to the analysed value. */
export function setTuningCorrection(cents: number | null): void {
  edit((c) => ({ ...c, tuningCents: cents === null ? null : Math.max(-50, Math.min(50, cents)) }));
}

/** Compensates the recording's tuning with the playback cents, so it sounds at A = 440 Hz. */
export function compensateTuning(): void {
  const s = get();
  const { cents } = tuningInForce(s);
  if (cents === null) return;
  set({ playback: { ...s.playback, cents: clampCents(compensatingCents(cents)) } });
}

/** The user declined the tuning offer for this piece. */
export function dismissTuningOffer(): void {
  edit((c) => ({ ...c, tuningOfferDismissed: true }));
}

// ---------------------------------------------------------------- sections and display

/** Places a section letter on bar `bar` (« A », « B », « Pont »…); null or empty removes it. */
export function setSection(bar: number, label: string | null): void {
  edit((c, s) => withSection(c, s.tempoMap, bar, label));
}

export function setInstrument(instrument: Instrument): void {
  set((s) => ({ view: { ...s.view, instrument } }));
}

/** Everything done by hand on the harmony goes (the user asked); sections stay. */
export function resetHarmonyCorrections(): void {
  edit((c) => ({ ...emptyCorrections(), sections: c.sections }));
}

// ---------------------------------------------------------------- helpers

/** The chord going on at the start of bar `bar` (the last one before it), or undefined if none. */
function chordGoingOnAt(s: AppState, bar: number): ChordSymbol | null | undefined {
  let going: ChordSymbol | null | undefined;
  for (const b of selectChartBars(s)) {
    if (b.bar >= bar) break;
    if (b.chords.length) going = b.chords[b.chords.length - 1]!.chord;
  }
  return going;
}
