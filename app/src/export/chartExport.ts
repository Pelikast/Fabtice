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
import { nominalBpm, sameMeter } from '../grid/tempoMap';
import type { ChordSymbol, Key } from '../model/harmony';
import type { Meter } from '../model/tempoMap';
import { keyInForce } from '../store/chartSelectors';
import { isTempoKnown } from '../store/derived';
import type { AppState } from '../store/store';
import { keyChangesInForce } from '../store/keySelectors';
import { sectionsInForce } from '../store/structureSelectors';
import { selectChartDisplay } from '../store/chartDisplay';
import { selectSimplifiedChart } from '../store/simplifiedSelectors';
import { buildSimplifiedExportChart } from './simplifiedExport';

export interface ExportChord {
  /** 0-based beat in the bar where the chord starts. */
  beat: number;
  /** Written chord (transposed); null for « N.C. ». */
  chord: ChordSymbol | null;
  /** Our own text of it (« B♭7(♭9) »), for checks and fallbacks. */
  text: string;
  /** The analysis was unsure (iReal has no such notion; kept for a future « ? » option). */
  doubtful: boolean;
  /** The written chord it goes to (transposed like it; `harmony/chord.ts#approachTargets`): its spelling. */
  next?: ChordSymbol | null;
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
  /** Chords starting in this bar, in order (`beat` in the bar's own beats). */
  chords: ExportChord[];
  /** No chord starts here but the previous one goes on (iReal: one-bar repeat « x » or the chord again). */
  repeat: boolean;
  /** Last bar of the chart (final bar line). */
  final: boolean;
  /**
   * C10: the key the bar's chords are spelled in (its passage's, transposed); null when no key is known.
   * iReal Pro has one key per chart (`ExportChart.key`, the main one): the others are written as comments.
   * Absent: the chart's key.
   */
  key?: Key | null;
  /** C10: a later key passage starts at this bar: its key (transposed), written as a comment « Ton : La♭ »; null or absent elsewhere. */
  keyChange?: Key | null;
  /** C14, the simplified chart: a repeat sign opens before this bar (`{`). */
  repeatStart?: boolean;
  /** C14: a repeat sign closes after this bar (`}`). */
  repeatEnd?: boolean;
  /** C14: a short text written as a comment on the bar (« A2 », « 3x »). */
  note?: string;
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
  /** `none`: the chart is written out bar by bar (the full chart); `written`: the bars carry repeat signs (the simplified chart, C14). */
  repeats: 'none' | 'written';
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
  // The key of the passage: the main one until a bar where another starts (`ChartBar.keyChange`).
  let passageKey = writtenKey;
  const out: ExportBar[] = bars.map((b, i) => {
    const keyChange = b.keyChange ? transposeKey(b.keyChange, semitones) : null;
    if (keyChange) passageKey = keyChange;
    const spelling = passageKey;
    // The bar's own signature (C13: any of 1…64 over 4, 8, 16, 32; the encoder writes what its format knows).
    const m: Meter = { ...b.meter };
    const changed = !meter || !sameMeter(meter, m);
    meter = m;
    return {
      bar: b.bar,
      section: b.section,
      doubleBarBefore: b.doubleBar,
      timeSignature: changed ? m : null,
      chords: b.chords.map((c) => {
        const chord = c.chord ? transposeChord(c.chord, semitones) : null;
        const next = c.next ? transposeChord(c.next, semitones) : null;
        return { beat: c.beatInBar, chord, text: chordText(chord, { key: spelling, next }), doubtful: c.doubtful, next };
      }),
      repeat: b.repeat,
      final: i === bars.length - 1,
      key: spelling,
      keyChange,
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
  const bars = chartBars({ map: s.tempoMap, chords, sections: sectionsInForce(s), duration: s.project.duration, keyChanges: keyChangesInForce(s) });
  return buildExportChart({
    title: s.project.title,
    bars,
    key: keyInForce(s).key,
    semitones: s.playback.semitones,
    tempo: isTempoKnown(s.tempoMap) ? nominalBpm(s.tempoMap, s.project.duration) : null,
  });
}

/**
 * The chart the user is looking at, ready for export (C14): the simplified chart with its repeats when the display is
 * « Grille complète simplifiée » (and there is one to show), else the full chart.
 */
export function chartForExportShown(s: AppState): ExportChart | null {
  if (!s.project) return null;
  const simplified = selectChartDisplay(s).kind === 'simplified' ? selectSimplifiedChart(s) : null;
  if (!simplified) return chartForExport(s);
  return buildSimplifiedExportChart({
    title: s.project.title,
    chart: simplified,
    key: keyInForce(s).key,
    semitones: s.playback.semitones,
    tempo: isTempoKnown(s.tempoMap) ? nominalBpm(s.tempoMap, s.project.duration) : null,
  });
}
