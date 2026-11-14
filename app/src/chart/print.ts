// « Imprimer la grille »: the chart, alone, on white paper. The print styles are
// in `styles/print.css` (only `.feuille` is left; four bars per line, page
// breaks between lines, no veil, no hairline, no doubtful styling).
//
// From the tracks view the chart is switched to first, and the view comes back
// once the printing dialog is done. Paper size is the browser's choice (A4 or
// US Letter): the page margins are in the style sheet and nothing depends on
// the size.

import { setViewMode } from '../store/actions';
import { appStore } from '../store/store';

/** Printing is written: the « Exporter » menu offers it. */
export const PRINT_READY = true;

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Waits for what must be on screen when the page is captured: the chart drawn, the fonts loaded. */
async function ready(): Promise<void> {
  await frame();
  await frame();
  try {
    await document.fonts.ready;
  } catch {
    /* no font loading API: the fonts are there or never will be */
  }
}

let printing = false;

export async function printChart(): Promise<void> {
  if (printing) return;
  printing = true;
  const before = appStore.getState().view.mode;
  const restore = () => {
    window.removeEventListener('afterprint', restore);
    printing = false;
    if (before !== 'grille') setViewMode(before);
  };
  try {
    if (before !== 'grille') setViewMode('grille');
    await ready();
    window.addEventListener('afterprint', restore);
    window.print();
  } catch (e) {
    restore();
    throw e;
  }
}
