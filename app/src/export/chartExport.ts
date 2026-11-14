// A pure, export-ready representation of the chord chart: what the iReal Pro
// export (and later MusicXML, printing to PDF…) is built from. No iReal
// vocabulary here: the encoder maps `ChordSymbol` to it.
//
// Pitch: the chords are written in the key the user plays (transport
// semitones applied) at CONCERT pitch: the instrument choice of the chart
// (Si♭, Mi♭) is not applied, iReal Pro transposes for instruments itself.

import { chartBars, resolveChords, type ChartBar } from '../chart/layout';
import { transposeChord, chordText } from '../harmony/chord';
import { transposeKey } from '../harmony/key';
import { nominalBpm } from '../grid/tempoMap';
import type { ChordSymbol, Key } from '../model/harmony';
import type { Meter } from '../model/tempoMap';
import { keyInForce } from '../store/chartSelectors';
import { isTempoKnown } from '../store/derived';
import type { AppState } from '../store/store';

export interface ExportChord {
  /** 0-based beat in the bar where the chord starts. */
  beat: number;
  /** Written chord (transposed); null for « N.C. ». */
  chord: ChordSymbol | null;
  /** Our own text of it (« B♭7(♭9) »), for checks and fallbacks. */
  text: string;
  /** The analysis was unsure (iReal has no such notion; kept for a future « ? » option). */
  doubtful: boolean;
}

export interface ExportBar {
  /** Bar index (0 = « mesure 1 », negative for a pick-up). */
  bar: number;
  /** Section letter starting here (« A », « B »…), or null. */
  section: string | null;
  /** A double bar line before this bar (section change). */
  doubleBarBefore: boolean;
  /** Time signature, given on the first bar and where it changes; null elsewhere. */
  timeSignature: Meter | null;
  /** Chords starting in this bar, in order. */
  chords: ExportChord[];
  /** No chord starts here but the previous one goes on (iReal: one-bar repeat « x » or the chord again). */
  repeat: boolean;
  /** Last bar of the chart (final bar line). */
  final: boolean;
}

export interface ExportChart {
  title: string;
  /** Unknown in lot 2: the encoder writes its own default. */
  composer: string | null;
  /** Style (« Medium Swing »…): unknown in lot 2. */
  style: string | null;
  /** The key as written (transposed by the transport), or null if unknown. */
  key: Key | null;
  /** Time signature of the first bar. */
  timeSignature: Meter;
  /** Tempo of the recording, rounded (null while unknown); the transport's tempo change is not applied. */
  tempo: number | null;
  /** No repeat signs are detected or entered in lot 2: the chart is written out bar by bar. */
  repeats: 'none';
  bars: ExportBar[];
}

export interface ExportChartInput {
  title: string;
  bars: readonly ChartBar[];
  key: Key | null;
  /** Transport transposition in semitones. */
  semitones: number;
  tempo: number | null;
}

/** Builds the representation from chart bars (pure). */
export function buildExportChart({ title, bars, key, semitones, tempo }: ExportChartInput): ExportChart {
  const writtenKey = key ? transposeKey(key, semitones) : null;
  let meter: Meter | null = null;
  const out: ExportBar[] = bars.map((b, i) => {
    const m: Meter = { numerator: b.beats, denominator: 4 };
    const changed = !meter || meter.numerator !== m.numerator;
    meter = m;
    return {
      bar: b.bar,
      section: b.section,
      doubleBarBefore: b.doubleBar,
      timeSignature: changed ? m : null,
      chords: b.chords.map((c) => {
        const chord = c.chord ? transposeChord(c.chord, semitones) : null;
        return { beat: c.beatInBar, chord, text: chordText(chord, { key: writtenKey }), doubtful: c.doubtful };
      }),
      repeat: b.repeat,
      final: i === bars.length - 1,
    };
  });
  return {
    title,
    composer: null,
    style: null,
    key: writtenKey,
    timeSignature: out[0]?.timeSignature ?? { numerator: 4, denominator: 4 },
    tempo: tempo === null ? null : Math.round(tempo),
    repeats: 'none',
    bars: out,
  };
}

/** The chart of the open piece, ready for export; null without a piece. */
export function chartForExport(s: AppState): ExportChart | null {
  if (!s.project) return null;
  const chords = resolveChords(s.tempoMap, s.analysis?.chords ?? null, s.corrections);
  const bars = chartBars({ map: s.tempoMap, chords, sections: s.corrections.sections, duration: s.project.duration });
  return buildExportChart({
    title: s.project.title,
    bars,
    key: keyInForce(s).key,
    semitones: s.playback.semitones,
    tempo: isTempoKnown(s.tempoMap) ? nominalBpm(s.tempoMap, s.project.duration) : null,
  });
}
