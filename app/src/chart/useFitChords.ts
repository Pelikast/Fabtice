// Gives each bar of the chart the size its chords need so that none touches
// the next one or leaves the bar (`fit.ts` decides, here the screen is
// measured). The result is two attributes on the bar's cell, which the style
// sheets turn into a font size:
//   - `data-taille` and `data-rangs`: the step and the number of rows on screen
//     (absent: normal size, one row), for the bar as wide as it is now;
//   - `data-taille-p` and `data-rangs-p`: the same on paper, for the bar as the
//     printed chart draws it (`PRINT_GEOMETRY`: the page scales the same drawing to its width).
// Done before the first paint, again when the sheet changes width, when the
// fonts arrive, and whenever the chords change.

import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { fitLayout, PRINT_GEOMETRY, type FitChord } from './fit';

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Re-fits every bar of `root` that has chords. Exported for the tests of the page. */
export function fitChords(root: HTMLElement): void {
  const cells = [...root.querySelectorAll<HTMLElement>('.case[data-temps]')];
  // Everything is measured at the normal size.
  for (const cell of cells) {
    for (const name of ['data-taille', 'data-taille-p', 'data-rangs', 'data-rangs-p']) cell.removeAttribute(name);
  }
  const measured = cells.map((cell) => {
    const style = getComputedStyle(cell);
    const beats = Number(cell.dataset.temps) || 4;
    const base = px(style.fontSize);
    const chords: FitChord[] = [];
    for (const button of cell.querySelectorAll<HTMLElement>('.accord-case[data-debut]')) {
      const symbol = button.querySelector<HTMLElement>('.ch');
      if (!symbol || base <= 0) continue;
      chords.push({ frac: Number(button.dataset.debut) / beats, em: symbol.getBoundingClientRect().width / base });
    }
    return {
      chords,
      geometry: {
        width: cell.clientWidth,
        padLeft: px(style.getPropertyValue('--pg')),
        padRight: px(style.getPropertyValue('--pd')),
        base,
        room: cell.clientHeight - px(style.getPropertyValue('--haut')),
      },
    };
  });
  cells.forEach((cell, i) => {
    const { chords, geometry } = measured[i]!;
    if (!chords.length || geometry.width <= 0) return;
    const screen = fitLayout(chords, geometry);
    const paper = fitLayout(chords, PRINT_GEOMETRY);
    if (screen.step > 0) cell.dataset.taille = String(screen.step);
    if (screen.rows === 2) cell.dataset.rangs = '2';
    if (paper.step > 0) cell.dataset.tailleP = String(paper.step);
    if (paper.rows === 2) cell.dataset.rangsP = '2';
  });
}

/** Keeps the chords of the chart in `root` fitted; `deps` change when the chords or their spelling do. */
export function useFitChords(root: RefObject<HTMLElement | null>, deps: readonly unknown[]): void {
  // After every change of what is written: before the paint, so that nothing flashes.
  useLayoutEffect(() => {
    if (root.current) fitChords(root.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const run = () => fitChords(host);
    let last = host.clientWidth;
    const observer = new ResizeObserver(() => {
      // A new width only: the sizes we set never change the width of a bar.
      if (host.clientWidth === last) return;
      last = host.clientWidth;
      run();
    });
    observer.observe(host);
    let alive = true;
    // The symbols are wider or narrower once the real fonts are in.
    void document.fonts?.ready.then(() => alive && run());
    document.fonts?.addEventListener?.('loadingdone', run);
    return () => {
      alive = false;
      observer.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', run);
    };
  }, [root]);
}
