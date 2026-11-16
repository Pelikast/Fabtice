// « Imprimer »: the choices kept on the device, and the ways the sheets leave
// the dialog. What is on the sheets is `PrintSheets.tsx` (drawn once, in the
// dialog's preview, and printed as they are); how many fit a page is
// `printLayout.ts`. The dialog is `components/PrintDialog.tsx`.
//
// The page is ready to print as soon as the dialog is open: the sheets are in
// it, the `@page` rule says their size (`pageRule`), and the print style sheet
// shows nothing else (`styles/print.css`). Printing is then three ways:
//   - the browser's own print window (`window.print()`), which prints exactly
//     the sheets of the preview; « Enregistrer en PDF » is the same window
//     (the browser's printers include « Enregistrer au format PDF »);
//   - in the Mac app, the system's print dialog, or, when the system lists
//     printers, the printer and the number of copies chosen in the dialog
//     (`bridge.printChart`, silent; if that fails the system's dialog opens);
//   - in the Mac app again, a PDF file written by the main process
//     (`bridge.saveChartPdf`) after the system's save panel.

import { getDesktopBridge, type DesktopBridge, type PrinterInfo } from '../platform/desktopBridge';
import { PAPER_MM, defaultPrintOptions, normalizePrintOptions, type PrintLayout, type PrintOptions, type PrintPaper } from './printLayout';

/** Printing is written: the « Exporter » menu offers it. */
export const PRINT_READY = true;

// ---------------------------------------------------------------- the choices, kept

const PREFS_KEY = 'fabtice.print';
const PRINTER_KEY = 'fabtice.print.printer';

const locale = (): string | undefined => (typeof navigator !== 'undefined' ? navigator.language : undefined);

/** The last choices of the dialog (kept on this device; the page works without them). */
export function loadPrintOptions(): PrintOptions {
  try {
    return normalizePrintOptions(JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null'), locale());
  } catch {
    return defaultPrintOptions(locale());
  }
}

export function savePrintOptions(options: PrintOptions): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(options));
  } catch {
    /* private window or blocked storage: the choices are for this time only */
  }
}

/** The printer chosen last time in the Mac app (the system's own default when none, or when it is gone). */
export function loadPrinterName(): string | null {
  try {
    return localStorage.getItem(PRINTER_KEY);
  } catch {
    return null;
  }
}

export function savePrinterName(name: string | null): void {
  try {
    if (name === null) localStorage.removeItem(PRINTER_KEY);
    else localStorage.setItem(PRINTER_KEY, name);
  } catch {
    /* kept for this time only */
  }
}

// ---------------------------------------------------------------- the page rule

/** The `@page` rule of the sheets: their size and no margin (the margins are inside the sheets). */
export function pageRule(layout: Pick<PrintLayout, 'sheet'>): string {
  return `@page { size: ${layout.sheet.w}mm ${layout.sheet.h}mm; margin: 0; }`;
}

/** The paper as the Mac app's printing names it. */
export const bridgePaper = (paper: PrintPaper): 'A4' | 'Letter' => (paper === 'lettre' ? 'Letter' : 'A4');

/** Millimetres of a paper, for tests and the dialog's summary. */
export const paperSize = (paper: PrintPaper) => PAPER_MM[paper];

// ---------------------------------------------------------------- getting the page ready

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Waits for what must be on screen when the page is captured: the sheets drawn, the sizes fitted, the fonts loaded. */
export async function ready(): Promise<void> {
  await frame();
  await frame();
  try {
    await document.fonts.ready;
  } catch {
    /* no font loading API: the fonts are there or never will be */
  }
  await frame();
}

// ---------------------------------------------------------------- the ways out

type Bridge = Required<Pick<DesktopBridge, 'printChart' | 'saveChartPdf'>> & Pick<DesktopBridge, 'listPrinters'>;

/** What the Mac app can do for printing, if this is the Mac app (and a version that has it). */
export function printBridge(): Bridge | null {
  const bridge = getDesktopBridge();
  if (!bridge || !bridge.printChart || !bridge.saveChartPdf) return null;
  return {
    printChart: bridge.printChart.bind(bridge),
    saveChartPdf: bridge.saveChartPdf.bind(bridge),
    listPrinters: bridge.listPrinters?.bind(bridge),
  };
}

/** True where « Enregistrer en PDF » writes the file itself (the Mac app). */
export const canSavePdfDirectly = (): boolean => printBridge() !== null;

/** The printers the system lists, with the default one first (none in a browser, or when the system gives none). */
export async function listPrinters(): Promise<PrinterInfo[]> {
  const bridge = printBridge();
  if (!bridge?.listPrinters) return [];
  try {
    const answer = await bridge.listPrinters();
    if (!answer.ok) return [];
    return [...answer.printers].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  } catch {
    return [];
  }
}

export interface PrintTarget {
  /** System name of the printer chosen in the dialog, or null for the system's own dialog. */
  printer: string | null;
  copies: number;
}

export type PrintOutcome = { kind: 'done' } | { kind: 'cancelled' } | { kind: 'failed' };

/** How long the browser's `afterprint` is waited for once `window.print()` has returned (the print window may outlive the call). */
const AFTER_PRINT_MS = 1500;

/**
 * « Imprimer »: the sheets as they are on the page. The system's dialog (or the chosen printer) in the Mac app, the
 * browser's print window elsewhere; the dialog stays as it is, the caller closes it when `done`.
 */
export async function printSheets(options: PrintOptions, target: PrintTarget): Promise<PrintOutcome> {
  const bridge = printBridge();
  await ready();
  if (bridge) {
    const answer = await bridge.printChart({
      orientation: options.orientation === 'paysage' ? 'landscape' : 'portrait',
      paper: bridgePaper(options.paper),
      printer: target.printer,
      copies: target.copies,
    });
    return answer.ok ? { kind: 'done' } : { kind: answer.reason === 'cancelled' ? 'cancelled' : 'failed' };
  }
  await new Promise<void>((resolve) => {
    const finish = () => {
      window.removeEventListener('afterprint', finish);
      resolve();
    };
    window.addEventListener('afterprint', finish);
    try {
      window.print();
    } catch {
      finish();
      return;
    }
    // A browser whose window.print() returns at once still reports `afterprint`; one that never does must not hold the dialog.
    setTimeout(finish, AFTER_PRINT_MS);
  });
  return { kind: 'done' };
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
 * « Enregistrer en PDF »: in the Mac app a real PDF of the same sheets, through the main process and the
 * system's save panel; in a browser the print window opens on the same sheets, where PDF is one of the printers.
 */
export async function saveSheetsPdf(options: PrintOptions, title: string): Promise<SavePdfResult> {
  const bridge = printBridge();
  if (!bridge) {
    await printSheets(options, { printer: null, copies: 1 });
    return { kind: 'browser' };
  }
  await ready();
  const answer = await bridge.saveChartPdf({
    orientation: options.orientation === 'paysage' ? 'landscape' : 'portrait',
    paper: bridgePaper(options.paper),
    title,
  });
  return answer.ok ? { kind: 'saved' } : answer.reason === 'cancelled' ? { kind: 'cancelled' } : { kind: 'failed' };
}
