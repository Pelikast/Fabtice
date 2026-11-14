// Keeps a floating panel (`.fenetre`) inside the window and above the transport
// bar: when its natural height does not fit between where it starts and the
// transport (or the top of the window for a panel that opens upwards), it gets
// a maximum height and scrolls inside. The placement itself stays in CSS; this
// only caps the height, after each render and when the window is resized.

import { useCallback, useEffect, useLayoutEffect, useRef, type Ref } from 'react';

/** Space kept between a panel and the edge of the window or the transport. */
const MARGIN = 8;
/** A panel never gets smaller than this, whatever the window. */
const MIN_HEIGHT = 120;

/** The lowest y a panel may reach: the top of the transport bar, else the bottom of the window. */
export function visibleBottom(): number {
  const bas = document.querySelector('.bas');
  const top = bas ? bas.getBoundingClientRect().top : window.innerHeight;
  return Math.min(top, window.innerHeight);
}

/**
 * Returns the ref to give to the panel (it also hands the element to `outer`,
 * the ref the parent uses). `up`: the panel opens upwards from its anchor
 * (bottom-anchored), so it is the top of the window that limits it.
 */
export function useFitPanel(outer?: Ref<HTMLDivElement>, up = false) {
  const el = useRef<HTMLDivElement | null>(null);
  const fit = useCallback(() => {
    const node = el.current;
    if (!node) return;
    const scroll = node.scrollTop;
    node.style.maxHeight = '';
    node.style.overflowY = '';
    // Measured without the opening animation's offset.
    const animation = node.style.animation;
    node.style.animation = 'none';
    const r = node.getBoundingClientRect();
    node.style.animation = animation;
    let max = Infinity;
    if (up) {
      if (r.top < MARGIN) max = r.bottom - MARGIN;
    } else {
      const bottom = visibleBottom() - MARGIN;
      if (r.bottom > bottom) max = bottom - r.top;
    }
    if (max < Infinity) {
      node.style.maxHeight = `${Math.max(MIN_HEIGHT, Math.floor(max))}px`;
      node.style.overflowY = 'auto';
      node.scrollTop = scroll;
    }
  }, [up]);

  useLayoutEffect(fit);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  return useCallback(
    (node: HTMLDivElement | null) => {
      el.current = node;
      if (typeof outer === 'function') outer(node);
      else if (outer) (outer as { current: HTMLDivElement | null }).current = node;
    },
    [outer],
  );
}
