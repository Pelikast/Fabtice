'use strict';

// Printing the chord chart from the Mac app. `window.print()` is no use inside
// Electron (it has no print window of its own: the page just stops answering),
// so the interface asks the main process, which prints the page itself:
//
//   - « Imprimer »: the interface lists the printers the system knows
//     (`getPrintersAsync`) and the person picks one, with a number of copies, in
//     the print dialog of the app; then `webContents.print` prints there
//     silently. When no printer is listed, none is chosen, or the silent
//     printing fails, `webContents.print` opens the system's print dialog, as it
//     always did;
//   - « Enregistrer en PDF »: the system's save panel (French, in the Downloads
//     folder, named after the piece), then `webContents.printToPDF` and the file
//     is written here.
//
// The page is already the sheets of the print dialog and nothing else (the
// interface's print style sheet: app/src/styles/print.css), each sheet exactly
// one page of the paper chosen, margin 0 (`@page`): both ways print them as they
// are. What the page may ask for is checked here: two orientations, the two
// papers, a printer that the system lists, a number of copies, a title.

const path = require('node:path');
const fsp = require('node:fs/promises');
const { saveName } = require('./downloads');

const ORIENTATIONS = ['portrait', 'landscape'];
const PAPERS = ['A4', 'Letter'];
const MAX_TITLE = 300;
const MAX_PRINTER = 256;
const MAX_COPIES = 99;

/**
 * What the page asked for, checked. `paper` is null when the page did not say (the region's paper is then used);
 * `printer` is null when none was chosen; `copies` is a whole number from 1 to 99 (1 when missing or odd).
 * @param {unknown} options
 * @returns {{ ok: true, landscape: boolean, title: string, paper: 'A4' | 'Letter' | null, printer: string | null, copies: number } | { ok: false }}
 */
function parsePrintRequest(options) {
  if (!options || typeof options !== 'object') return { ok: false };
  const { orientation, title, paper, printer, copies } = /** @type {Record<string, unknown>} */ (options);
  if (typeof orientation !== 'string' || !ORIENTATIONS.includes(orientation)) return { ok: false };
  if (title !== undefined && (typeof title !== 'string' || title.length > MAX_TITLE)) return { ok: false };
  if (paper !== undefined && paper !== null && (typeof paper !== 'string' || !PAPERS.includes(paper))) return { ok: false };
  if (printer !== undefined && printer !== null && (typeof printer !== 'string' || printer.length > MAX_PRINTER)) return { ok: false };
  const n = typeof copies === 'number' && Number.isInteger(copies) && copies >= 1 && copies <= MAX_COPIES ? copies : 1;
  return {
    ok: true,
    landscape: orientation === 'landscape',
    title: typeof title === 'string' ? title : '',
    paper: typeof paper === 'string' ? /** @type {'A4' | 'Letter'} */ (paper) : null,
    printer: typeof printer === 'string' && printer !== '' ? printer : null,
    copies: n,
  };
}

/** US Letter where the region uses it (United States, Canada, Mexico…), A4 elsewhere. */
function paperFor(locale) {
  const region = /[-_]([A-Za-z]{2})\b/.exec(String(locale || ''));
  return region && ['US', 'CA', 'MX', 'CL', 'CO', 'PH', 'VE'].includes(region[1].toUpperCase()) ? 'Letter' : 'A4';
}

/** The PDF's file name: the piece's title, cleaned, plus « .pdf » (« Grille » when there is no title). */
function pdfName(title) {
  const base = saveName(title && title.trim() ? title : 'Grille').replace(/\.pdf$/i, '').trim() || 'Grille';
  return `${base}.pdf`;
}

/** Options of the save panel: a French title, the Downloads folder, the piece's name. */
function pdfSaveOptions(title, folder) {
  return {
    title: 'Enregistrer la grille en PDF',
    buttonLabel: 'Enregistrer',
    defaultPath: path.join(folder, pdfName(title)),
    filters: [{ name: 'Document PDF', extensions: ['pdf'] }],
  };
}

/**
 * The printers the system lists, the default one first; `ok: false` when it cannot say.
 * @returns {Promise<{ ok: true, printers: { name: string, displayName: string, isDefault: boolean }[] } | { ok: false }>}
 */
async function listPrinters(contents) {
  try {
    const found = await contents.getPrintersAsync();
    if (!Array.isArray(found)) return { ok: false };
    const printers = found
      .filter((p) => p && typeof p.name === 'string' && p.name !== '')
      .map((p) => ({ name: p.name, displayName: typeof p.displayName === 'string' && p.displayName ? p.displayName : p.name, isDefault: Boolean(p.isDefault) }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return { ok: true, printers };
  } catch {
    return { ok: false };
  }
}

/** One call of `webContents.print`, as a promise. */
function printOnce(contents, options) {
  return new Promise((resolve) => {
    try {
      contents.print(options, (success, reason) => {
        if (success) resolve({ ok: true });
        else resolve({ ok: false, reason: /cancel/i.test(String(reason)) ? 'cancelled' : 'failed' });
      });
    } catch {
      resolve({ ok: false, reason: 'failed' });
    }
  });
}

/**
 * Prints the page: to the printer chosen in the interface's dialog when the system lists it (silently, `copies` times),
 * otherwise (none chosen, not listed, or the silent printing failed) through the system's print dialog.
 * The sheets are the paper's size with no margin of their own: no margin is asked of the printing either.
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'cancelled' | 'failed' }>}
 */
async function printPage(contents, { landscape, paper, printer, copies }, locale) {
  const base = { printBackground: false, landscape, pageSize: paper || paperFor(locale), margins: { marginType: 'none' } };
  if (printer) {
    const known = await listPrinters(contents);
    if (known.ok && known.printers.some((p) => p.name === printer)) {
      const silent = await printOnce(contents, { ...base, silent: true, deviceName: printer, copies: copies || 1 });
      if (silent.ok || silent.reason === 'cancelled') return silent;
      // The printer did not take the job: the system's dialog is the way out, as with no printer chosen.
    }
  }
  return printOnce(contents, { ...base, silent: false });
}

/**
 * Asks where to save, makes the PDF and writes it. `dialog` and `contents` are
 * used as they are at call time (a test stands in for the save panel).
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'cancelled' | 'failed' }>}
 */
async function savePagePdf({ dialog, window, contents, request, folder, locale }) {
  let chosen;
  try {
    chosen = await dialog.showSaveDialog(window, pdfSaveOptions(request.title, folder));
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (!chosen || chosen.canceled || !chosen.filePath) return { ok: false, reason: 'cancelled' };
  try {
    // One PDF page per sheet: the page size is the sheets' own (@page), no margin of the PDF's.
    const pdf = await contents.printToPDF({
      landscape: request.landscape,
      pageSize: request.paper || paperFor(locale),
      printBackground: false,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    const target = /\.pdf$/i.test(chosen.filePath) ? chosen.filePath : `${chosen.filePath}.pdf`;
    await fsp.writeFile(target, pdf);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

module.exports = { parsePrintRequest, paperFor, pdfName, pdfSaveOptions, printPage, listPrinters, savePagePdf, ORIENTATIONS, PAPERS, MAX_TITLE, MAX_COPIES };
