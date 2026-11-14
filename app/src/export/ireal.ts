// Export of the chord chart to iReal Pro: the CONTRACT only. The encoding
// (iReal's chord vocabulary, the `irealb://` link format, the obfuscation of
// the chart string, the page that hands the link over) is written by the
// follow-up agent; until then `IREAL_EXPORT_READY` is false and the
// « Exporter » menu shows the item as « bientôt ».
//
// What is handed to the user: one `irealb://` link holding the chart. Opening
// it (a click in the browser, or in Safari on the iPhone) imports the chart
// into iReal Pro. On the Mac app and the web the link is delivered in a small
// HTML file the user opens, and can be copied; both come from `IRealExport`.

import type { ExportChart } from './chartExport';

export interface IRealExport {
  /** The `irealb://…` link (one song). */
  url: string;
  /** A self-contained HTML page with the link and a sentence in French (to save or open). */
  html: string;
  /** Suggested file name for `html` (« Blues du dimanche.html »). */
  fileName: string;
}

export class ExportNotReadyError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet`);
    this.name = 'ExportNotReadyError';
  }
}

/** False until `exportToIRealPro` is implemented. */
export const IREAL_EXPORT_READY = false;

/**
 * Encodes the chart for iReal Pro. Throws `ExportNotReadyError` for now.
 * Contract: pure (no I/O); every bar of `chart.bars` becomes one iReal cell
 * group of four; sections, double bars and time signatures are kept; chords
 * are mapped to iReal's vocabulary (nearest one when iReal lacks it, e.g.
 * `minmaj7` -> « -^7 »); `repeat` bars become « x » ; `doubtful` is ignored.
 */
export function exportToIRealPro(chart: ExportChart): IRealExport {
  void chart;
  throw new ExportNotReadyError('iReal Pro export');
}
