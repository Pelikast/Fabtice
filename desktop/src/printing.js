'use strict';

// Printing the chord chart from the Mac app. `window.print()` is no use inside
// Electron (it has no print window of its own: the page just stops answering),
// so the interface asks the main process, which prints the page itself:
//
//   - « Imprimer… »: `webContents.print` opens the system's print dialog, with
//     the orientation the interface's dialog chose;
//   - « Enregistrer en PDF… »: the system's save panel (French, in the Downloads
//     folder, named after the piece), then `webContents.printToPDF` and the file
//     is written here.
//
// The interface has already put the page in its printed form (the chart alone,
// the choices applied: app/src/chart/print.ts) and gives it back when this
// returns. What the page may ask for is checked here: two orientations and a
// title, nothing else.

const path = require('node:path');
const fsp = require('node:fs/promises');
const { saveName } = require('./downloads');

const ORIENTATIONS = ['portrait', 'landscape'];
const MAX_TITLE = 300;

/**
 * What the page asked for, checked.
 * @param {unknown} options
 * @returns {{ ok: true, landscape: boolean, title: string } | { ok: false }}
 */
function parsePrintRequest(options) {
  if (!options || typeof options !== 'object') return { ok: false };
  const { orientation, title } = /** @type {Record<string, unknown>} */ (options);
  if (typeof orientation !== 'string' || !ORIENTATIONS.includes(orientation)) return { ok: false };
  if (title !== undefined && (typeof title !== 'string' || title.length > MAX_TITLE)) return { ok: false };
  return { ok: true, landscape: orientation === 'landscape', title: typeof title === 'string' ? title : '' };
}

/** US Letter where the region uses it (United States, Canada, Mexico…), A4 elsewhere. */
function paperFor(locale) {
  const region = /[-_]([A-Za-z]{2})\b/.exec(String(locale || ''));
  return region && ['US', 'CA', 'MX', 'CL', 'CO', 'PH', 'VE'].includes(region[1].toUpperCase()) ? 'Letter' : 'A4';
}

/** The PDF's file name: the piece's title, cleaned, plus « .pdf » (« Grille » when there is no title). */
function pdfName(title) {
  const base = saveName(title && title.trim() ? title : 'Grille').replace(/\.pdf$/i, '');
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
 * The system's print dialog for the page.
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'cancelled' | 'failed' }>}
 */
function printPage(contents, { landscape }) {
  return new Promise((resolve) => {
    try {
      contents.print({ silent: false, printBackground: false, landscape, usePrinterDefaultPageSize: true }, (success, reason) => {
        if (success) resolve({ ok: true });
        else resolve({ ok: false, reason: /cancel/i.test(String(reason)) ? 'cancelled' : 'failed' });
      });
    } catch {
      resolve({ ok: false, reason: 'failed' });
    }
  });
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
    const pdf = await contents.printToPDF({ landscape: request.landscape, pageSize: paperFor(locale), printBackground: false, preferCSSPageSize: false });
    const target = /\.pdf$/i.test(chosen.filePath) ? chosen.filePath : `${chosen.filePath}.pdf`;
    await fsp.writeFile(target, pdf);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

module.exports = { parsePrintRequest, paperFor, pdfName, pdfSaveOptions, printPage, savePagePdf, ORIENTATIONS, MAX_TITLE };
