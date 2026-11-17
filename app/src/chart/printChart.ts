// What the printed sheets are made of: the chart as it stands in the store
// (bars in lines of four, chords written for an instrument) and the words of
// the title block. The sheets themselves are `PrintSheets.tsx`; how many fit a
// page is `printLayout.ts`.
//
// « Ce qu'on imprime » (C14) is chosen in the dialog and read here: the full
// chart is the lines of the bars as they are; one part of the structure is the
// lines of ITS bars (bar numbers kept), named under the title; the simplified
// chart will be its own lines handed to the same sheets (`PrintChart.simplified`
// carries it; until its renderer exists it prints the full chart).

import { useMemo } from 'react';
import { nominalBpm } from '../grid/tempoMap';
import { displayContext, type DisplayContext } from '../harmony/display';
import { keyLabel } from '../harmony/key';
import { formatNumber, t } from '../i18n';
import type { Instrument } from '../model/harmony';
import type { Meter } from '../model/tempoMap';
import { formatBarNumber, RANGE_DASH } from '../grid/format';
import { partName } from '../model/structureLabels';
import { keyInForce, selectChartBars } from '../store/chartSelectors';
import { isTempoKnown, shownBpm } from '../store/derived';
import { selectSimplifiedChart } from '../store/simplifiedSelectors';
import { useApp, type ChartDisplay } from '../store/store';
import { structureInForce } from '../store/structureSelectors';
import type { SimplifiedChart } from '../structure';
import { chartLines, type ChartBar, type ChartLine } from './layout';
import type { PrintHeader } from './printLayout';
import { barsOfRange, partBars, type PartBars } from './structureDisplay';

export interface PrintChart {
  title: string;
  /** The key as written for the instrument (« A♭ », « Fm »), or null when none is known. */
  key: string | null;
  meter: Meter;
  /** Displayed tempo, or null when it is not known. */
  bpm: number | null;
  /** The form of the piece (« AABC »), or null when it is not known. */
  form: string | null;
  /** « Thème 1 · mesures 3–10 » when one part is printed, else null. */
  partLabel: string | null;
  /**
   * The simplified chart, when « Grille complète simplifiée » is what is printed and there is one. Its renderer
   * comes later: until then `lines` stay the full chart's and this is only carried along.
   */
  simplified: SimplifiedChart | null;
  /** The lines of bars to print. */
  lines: ChartLine[];
  ctx: DisplayContext;
}

/** The lines to print: the bars of the chart, or those of one part (`range`: bar indexes), in lines of four. */
export function printLines(bars: readonly ChartBar[], range: PartBars | null = null): ChartLine[] {
  return chartLines(range ? barsOfRange(bars, range) : bars);
}

/** « Thème 1 · mesures 3–10 »: the line that says which part is on the paper (bar numbers as musicians count them). */
export function partCaption(name: string, bars: readonly ChartBar[]): string | null {
  const first = bars[0];
  const last = bars[bars.length - 1];
  if (!first || !last) return null;
  const range = first.bar === last.bar ? formatBarNumber(first.bar) : `${formatBarNumber(first.bar)}${RANGE_DASH}${formatBarNumber(last.bar)}`;
  return t('structure.shown', { name, bars: range });
}

/**
 * The chart for printing, written for `instrument` (the print dialog's own choice: the screen is left as it is),
 * of what is chosen to print (`what`: the same three displays as the screen; a part that is gone prints the whole chart).
 */
export function usePrintChart(instrument: Instrument, what: ChartDisplay = { kind: 'full' }): PrintChart | null {
  const title = useApp((s) => s.project?.title ?? null);
  const bars = useApp(selectChartBars);
  const analysis = useApp((s) => s.analysis);
  const corrections = useApp((s) => s.corrections);
  const semitones = useApp((s) => s.playback.semitones);
  const minor = useApp((s) => s.settings.minorNotation);
  const meter = useApp((s) => s.tempoMap.meters[0]!.meter);
  const bpm = useApp((s) => (isTempoKnown(s.tempoMap) ? shownBpm(s.tempoMap, nominalBpm(s.tempoMap, s.project?.duration), s.project?.duration) : null));
  const structure = useApp((s) => structureInForce(s));
  const map = useApp((s) => s.tempoMap);
  const duration = useApp((s) => s.project?.duration ?? 0);
  const simplified = useApp(selectSimplifiedChart);
  const partId = what.kind === 'part' ? what.id : null;
  const wantSimplified = what.kind === 'simplified';
  return useMemo(() => {
    if (title === null) return null;
    const ctx = displayContext(keyInForce({ analysis, corrections }).key, semitones, instrument, minor);
    const part = partId === null ? null : (structure.parts.find((p) => p.id === partId) ?? null);
    const last = bars[bars.length - 1];
    const range = part ? partBars(map, part, duration, last ? last.bar : 0) : null;
    const lines = printLines(bars, range);
    const caption = part && range ? partCaption(partName(part, t), barsOfRange(bars, range)) : null;
    return {
      title,
      key: ctx.key ? keyLabel(ctx.key, minor) : null,
      meter,
      bpm,
      form: structure.form || null,
      partLabel: caption,
      simplified: wantSimplified ? simplified : null,
      lines,
      ctx,
    };
  }, [title, bars, analysis, corrections, semitones, minor, meter, bpm, instrument, structure, map, duration, simplified, partId, wantSimplified]);
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

/** « Forme : AABC », or null when it is left out or not known. */
export function headerForm(chart: Pick<PrintChart, 'form'>, header: PrintHeader): string | null {
  return header.form && chart.form ? t('print.formLine', { form: chart.form }) : null;
}

/** The line that names the part printed, or null for the whole chart. */
export function headerPart(chart: Pick<PrintChart, 'partLabel'>): string | null {
  return chart.partLabel;
}
