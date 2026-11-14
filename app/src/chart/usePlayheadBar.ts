// The current-bar hairline of the chart: the bar under the playhead gets the
// class `jouee` and its ember rule fills with `--avance` (0…1), as in the
// mockup (`.case.jouee::after`). Driven by the app's frame loop, straight in
// the DOM: the position never goes through React.

import { useRef, type RefObject } from 'react';
import { getEngine } from '../audio';
import { appStore } from '../store/store';
import { useFrame } from '../ui/frameLoop';
import { barProgress } from './layout';

/** Marks, inside `root`, the `[data-mesure]` cell of the bar being played. */
export function usePlayheadBar(root: RefObject<HTMLElement | null>): void {
  const current = useRef<{ el: HTMLElement | null; bar: number; progress: number }>({ el: null, bar: NaN, progress: -1 });
  useFrame(() => {
    const host = root.current;
    if (!host) return;
    const { tempoMap, project } = appStore.getState();
    if (!project) return;
    const { bar, progress } = barProgress(tempoMap, getEngine().getPosition());
    const c = current.current;
    // The cell may have been re-rendered: look it up again when the bar changes or it left the DOM.
    if (bar !== c.bar || !c.el || !c.el.isConnected) {
      c.el?.classList.remove('jouee');
      c.el = host.querySelector<HTMLElement>(`[data-mesure="${bar}"]`);
      c.el?.classList.add('jouee');
      c.bar = bar;
      c.progress = -1;
    } else if (c.el && !c.el.classList.contains('jouee')) {
      // React rewrote the cell's classes (loop changed): put the mark back.
      c.el.classList.add('jouee');
    }
    if (c.el && Math.abs(progress - c.progress) >= 0.002) {
      c.el.style.setProperty('--avance', progress.toFixed(3));
      c.progress = progress;
    }
  });
}
