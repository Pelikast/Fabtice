// What the printed sheets are made of: the chart as it stands in the store
// (bars in lines of four, chords written for an instrument) and the words of
// the title block. The sheets themselves are `PrintSheets.tsx`; how many fit a
// page is `printLayout.ts`.
//
// `printLines` is where the choice « ce qu'on imprime » will plug in (C14): the
// full chart is the lines of the bars as they are; a simplified chart or one
// section is another list of lines (`ChartLine[]`) handed to the same sheets.

import { useMemo } from 'react';
import { nominalBpm } from '../grid/tempoMap';
import { displayContext, type DisplayContext } from '../harmony/display';
import { keyLabel } from '../harmony/key';
import { formatNumber, t } from '../i18n';
import type { Instrument } from '../model/harmony';
import type { Meter } from '../model/tempoMap';
import { barContextsOf, keyInForce, selectChartBars } from '../store/chartSelectors';
import { isTempoKnown, shownBpm } from '../store/derived';
import { useApp } from '../store/store';
import { chartLines, type ChartBar, type ChartLine } from './layout';
import type { PrintHeader } from './printLayout';

export interface PrintChart {
  title: string;
  /** The key as written for the instrument (« A♭ », « Fm »), or null when none is known. */
  key: string | null;
  meter: Meter;
  /** Displayed tempo, or null when it is not known. */
  bpm: number | null;
  /** The lines of bars to print. */
  lines: ChartLine[];
  /** The main key's context (the title row). */
  ctx: DisplayContext;
  /** C10: each bar's context, by bar number (spelled in the key of its passage); `ctx` for a bar not in it. */
  contexts: ReadonlyMap<number, DisplayContext>;
}

/** The lines to print. Today the full chart; a simplified chart or a section will be another list (C14). */
export function printLines(bars: readonly ChartBar[]): ChartLine[] {
  return chartLines(bars);
}

/** The chart for printing, written for `instrument` (the print dialog's own choice: the screen is left as it is). */
export function usePrintChart(instrument: Instrument): PrintChart | null {
  const title = useApp((s) => s.project?.title ?? null);
  const bars = useApp(selectChartBars);
  const analysis = useApp((s) => s.analysis);
  const corrections = useApp((s) => s.corrections);
  const semitones = useApp((s) => s.playback.semitones);
  const minor = useApp((s) => s.settings.minorNotation);
  const meter = useApp((s) => s.tempoMap.meters[0]!.meter);
  const bpm = useApp((s) => (isTempoKnown(s.tempoMap) ? shownBpm(s.tempoMap, nominalBpm(s.tempoMap, s.project?.duration), s.project?.duration) : null));
  return useMemo(() => {
    if (title === null) return null;
    const main = keyInForce({ analysis, corrections }).key;
    const ctx = displayContext(main, semitones, instrument, minor);
    const contexts = barContextsOf(bars, main, semitones, instrument, minor);
    return { title, key: ctx.key ? keyLabel(ctx.key, minor) : null, meter, bpm, lines: printLines(bars), ctx, contexts };
  }, [title, bars, analysis, corrections, semitones, minor, meter, bpm, instrument]);
}

/** True when the chart has at least one chord (otherwise there is nothing to print). */
export const hasChords = (bars: readonly ChartBar[]): boolean => bars.some((b) => b.chords.length > 0);

/** The title row, or null when it is left out (or the piece has no title). */
export function headerTitle(chart: Pick<PrintChart, 'title'>, header: PrintHeader): string | null {
  return header.title && chart.title.trim() !== '' ? chart.title : null;
}

const upFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The parts of the row under the title, in order (plain text, the caller writes the ♭ and ♯): the key with the
 * instrument it is written for; the instrument alone when the key is left out and it is not in C; the meter and the tempo.
 */
export function headerInfo(chart: Pick<PrintChart, 'key' | 'meter' | 'bpm'>, header: PrintHeader, instrument: Instrument): string[] {
  const parts: string[] = [];
  const forInstrument = t('chart.forInstrument', { instrument: t(`chart.instrument.${instrument}`) });
  if (header.key && chart.key !== null) parts.push(`${t('chart.keyOf')} ${chart.key} ${forInstrument}`);
  else if (instrument !== 'ut') parts.push(upFirst(forInstrument));
  if (header.tempo) {
    const meter = `${chart.meter.numerator}/${chart.meter.denominator}`;
    parts.push(chart.bpm !== null ? `${meter} · ${t('chart.tempo', { bpm: formatNumber(Math.round(chart.bpm), 0) })}` : meter);
  }
  return parts;
}
