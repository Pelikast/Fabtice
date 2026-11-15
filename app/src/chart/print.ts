// « Imprimer la grille »: the chart, alone, on white paper. The print styles are
// in `styles/print.css` (only `.feuille` is left; four bars per line, page
// breaks between lines, no veil, no hairline, no doubtful styling).
//
// What the dialog (`components/PrintDialog.tsx`) lets the user choose is the
// orientation of the page and its size: as it is (as many pages as the lines
// need) or fitted to one page when the piece allows it. Both go to the style
// sheet through the root element and one `@page` rule, then the chart is printed
// in one of three ways:
//   - the browser's own dialog (`window.print()`), where paper, margins and
//     « save as PDF » are the browser's;
//   - in the Mac app, the system's print dialog (`bridge.printChart`): there
//     `window.print()` does not work, which is why the menu entry did nothing;
//   - in the Mac app again, a PDF file written by the main process
//     (`bridge.saveChartPdf`) after the system's save panel.
//
// From the tracks view the chart is switched to first, and the view comes back
// once the printing is done. Paper size is the system's or the browser's choice
// (A4 or US Letter): the margins are in the style sheet and nothing depends on
// the size.

import { getDesktopBridge, type DesktopBridge } from '../platform/desktopBridge';
import { selectChartBars } from '../store/chartSelectors';
import { setViewMode } from '../store/actions';
import { appStore } from '../store/store';
import { chartLines } from './layout';

/** Printing is written: the « Exporter » menu offers it. */
export const PRINT_READY = true;

export type PrintOrientation = 'portrait' | 'paysage';
/** `libre`: as it is, as many pages as the lines need; `une`: all the lines on one page. */
export type PrintSize = 'libre' | 'une';

export interface PrintOptions {
  orientation: PrintOrientation;
  size: PrintSize;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = { orientation: 'portrait', size: 'libre' };

// ---------------------------------------------------------------- « fitted to one page »

/** Height available to the lines of bars, on the smaller of A4 and Letter, in mm (page less margins less the title line). */
const LINES_ROOM_MM: Record<PrintOrientation, number> = { portrait: 247 - 24, paysage: 178 - 24 };

/** A line shorter than this is too low for its chords: the piece does not « fit » any more. */
export const MIN_LINE_MM = 18;

/** How many lines of four bars fit on one page in this orientation. */
export function linesPerPage(orientation: PrintOrientation): number {
  return Math.floor(LINES_ROOM_MM[orientation] / MIN_LINE_MM);
}

/** True when `lines` lines of bars can be fitted to one page without becoming too small to read. */
export function fitsOnePage(lines: number, orientation: PrintOrientation): boolean {
  return lines >= 1 && lines <= linesPerPage(orientation);
}

/** Lines of four bars in the chart as it is now. */
export function chartLineCount(): number {
  return chartLines(selectChartBars(appStore.getState())).length;
}

// ---------------------------------------------------------------- the choices, kept

const PREFS_KEY = 'fabtice.print';

/** The last choices of the dialog (kept on this device; the page works without them). */
export function loadPrintOptions(): PrintOptions {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<PrintOptions> | null;
    return {
      orientation: raw?.orientation === 'paysage' ? 'paysage' : 'portrait',
      size: raw?.size === 'une' ? 'une' : 'libre',
    };
  } catch {
    return DEFAULT_PRINT_OPTIONS;
  }
}

export function savePrintOptions(options: PrintOptions): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(options));
  } catch {
    /* private window or blocked storage: the choices are for this time only */
  }
}

// ---------------------------------------------------------------- getting the page ready

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Waits for what must be on screen when the page is captured: the chart drawn, the sizes fitted, the fonts loaded. */
async function ready(): Promise<void> {
  await frame();
  await frame();
  try {
    await document.fonts.ready;
  } catch {
    /* no font loading API: the fonts are there or never will be */
  }
}

/**
 * Writes the choices where the style sheet reads them: the page's orientation
 * (`@page` cannot depend on an attribute, so a rule is added) and the size.
 * Returns what puts everything back.
 */
function applyOptions(options: PrintOptions): () => void {
  const root = document.documentElement;
  const wasOrientation = root.dataset.impression;
  const wasSize = root.dataset.pageImpression;
  const fitted = options.size === 'une' && fitsOnePage(chartLineCount(), options.orientation);
  root.dataset.impression = options.orientation;
  root.dataset.pageImpression = fitted ? 'une' : 'libre';
  root.style.setProperty('--lignes-impression', String(Math.max(1, chartLineCount())));
  const rule = document.createElement('style');
  rule.dataset.impression = 'page';
  rule.textContent = `@page { size: ${options.orientation === 'paysage' ? 'landscape' : 'portrait'}; }`;
  document.head.append(rule);
  return () => {
    rule.remove();
    root.style.removeProperty('--lignes-impression');
    if (wasOrientation === undefined) delete root.dataset.impression;
    else root.dataset.impression = wasOrientation;
    if (wasSize === undefined) delete root.dataset.pageImpression;
    else root.dataset.pageImpression = wasSize;
  };
}

let busy = false;

/**
 * Runs `work` with the page ready to be printed: the chart on screen, the
 * choices applied; then gives the view back. `work` receives `done` for a
 * caller that is told later that the printing ended (the browser's
 * `afterprint`); returning means done.
 */
async function withPrintablePage(options: PrintOptions, work: (done: () => void) => Promise<'now' | 'later'>): Promise<void> {
  if (busy) return;
  busy = true;
  const before = appStore.getState().view.mode;
  const undo = applyOptions(options);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    undo();
    busy = false;
    if (before !== 'grille') setViewMode(before);
  };
  try {
    if (before !== 'grille') setViewMode('grille');
    await ready();
    if ((await work(done)) === 'now') done();
  } catch (e) {
    done();
    throw e;
  }
}

// ---------------------------------------------------------------- the three ways

/** What the Mac app can do for printing, if this is the Mac app (and a version that has it). */
export function printBridge(): Required<Pick<DesktopBridge, 'printChart' | 'saveChartPdf'>> | null {
  const bridge = getDesktopBridge();
  if (!bridge || !bridge.printChart || !bridge.saveChartPdf) return null;
  return { printChart: bridge.printChart.bind(bridge), saveChartPdf: bridge.saveChartPdf.bind(bridge) };
}

/** True where « Enregistrer en PDF… » writes the file itself (the Mac app). */
export const canSavePdfDirectly = (): boolean => printBridge() !== null;

/**
 * « Imprimer… »: the system's print dialog in the Mac app, the browser's elsewhere.
 * The choices of the dialog are applied; the view comes back afterwards.
 */
export async function printChart(options: PrintOptions = loadPrintOptions()): Promise<void> {
  const bridge = printBridge();
  await withPrintablePage(options, async (done) => {
    if (bridge) {
      await bridge.printChart({ orientation: options.orientation === 'paysage' ? 'landscape' : 'portrait' });
      return 'now';
    }
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    return 'later';
  });
}

export type SavePdfResult =
  /** The Mac app wrote the file. */
  | { kind: 'saved' }
  /** The user closed the save panel. */
  | { kind: 'cancelled' }
  /** The Mac app could not write it. */
  | { kind: 'failed' }
  /** A browser: the page cannot write a PDF; its print window can (« Enregistrer au format PDF »). */
  | { kind: 'browser' };

/**
 * « Enregistrer en PDF… »: in the Mac app a real PDF through the main process
 * and the system's save panel; in a browser, nothing is written here and the
 * answer says so (the dialog explains that the browser's print window saves as PDF).
 */
export async function saveChartPdf(options: PrintOptions = loadPrintOptions()): Promise<SavePdfResult> {
  const bridge = printBridge();
  if (!bridge) return { kind: 'browser' };
  let result: SavePdfResult = { kind: 'failed' };
  await withPrintablePage(options, async () => {
    const title = appStore.getState().project?.title ?? '';
    const answer = await bridge.saveChartPdf({ orientation: options.orientation === 'paysage' ? 'landscape' : 'portrait', title });
    result = answer.ok ? { kind: 'saved' } : answer.reason === 'cancelled' ? { kind: 'cancelled' } : { kind: 'failed' };
    return 'now';
  });
  return result;
}
