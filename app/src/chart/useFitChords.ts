// Gives the chart ONE size for its chords and, where a bar needs it, two rows
// and a push back from the end bar line (`fit.ts` decides, here the screen is
// measured). The result is attributes the style sheets turn into sizes:
//   - `data-taille` on every bar (absent: normal size): the same step everywhere;
//     `data-rangs` on the bars that need two rows;
//   - `--pousse` on a chord (px): how far a chord is moved from its beat
//     (a late one is pushed back to stay inside its bar).
// The printed sheets do the same for themselves (`PrintSheets.tsx#fitPrintSheets`).
// Done before the first paint, again when the sheet changes width, when the
// fonts arrive, and whenever the chords change.

import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { fitChart, type ChartBar, type FitChord } from './fit';

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Re-fits the whole chart in `root`: one size for every bar. Exported for the tests of the page. */
export function fitChords(root: HTMLElement): void {
  const cells = [...root.querySelectorAll<HTMLElement>('.case[data-temps]')];
  // Everything is measured at the normal size, unpushed.
  for (const cell of cells) {
    for (const name of ['data-taille', 'data-rangs']) cell.removeAttribute(name);
    for (const button of cell.querySelectorAll<HTMLElement>('.accord-case[data-debut]')) {
      button.style.removeProperty('--pousse');
    }
  }
  const screen: ChartBar[] = [];
  const buttons: HTMLElement[][] = [];
  for (const cell of cells) {
    const style = getComputedStyle(cell);
    const beats = Number(cell.dataset.temps) || 4;
    const base = px(style.fontSize);
    const chords: FitChord[] = [];
    const mine: HTMLElement[] = [];
    for (const button of cell.querySelectorAll<HTMLElement>('.accord-case[data-debut]')) {
      const symbol = button.querySelector<HTMLElement>('.ch');
      if (!symbol || base <= 0) continue;
      chords.push({ frac: Number(button.dataset.debut) / beats, em: symbol.getBoundingClientRect().width / base });
      mine.push(button);
    }
    buttons.push(mine);
    screen.push({
      chords,
      geometry: {
        width: cell.clientWidth,
        padLeft: px(style.getPropertyValue('--pg')),
        padRight: px(style.getPropertyValue('--pd')),
        base,
        room: cell.clientHeight - px(style.getPropertyValue('--haut')),
      },
    });
  }
  const onScreen = fitChart(screen.map((b) => (b.geometry.width > 0 ? b : { ...b, chords: [] })));
  cells.forEach((cell, i) => {
    if (!screen[i]!.chords.length) return;
    if (onScreen.step > 0) cell.dataset.taille = String(onScreen.step);
    if (onScreen.bars[i]!.rows === 2) cell.dataset.rangs = '2';
    buttons[i]!.forEach((button, k) => {
      const a = onScreen.bars[i]!.push[k]!;
      if (Math.abs(a) > 0.01) button.style.setProperty('--pousse', `${a.toFixed(2)}px`);
    });
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
