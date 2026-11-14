// « Suivre la tête de lecture » on the chart: while playing, the sheet scrolls
// gently so that the line being played (and the next one) stays in view. It
// never fights the user: any scroll of their own (wheel, finger, keys, the
// scroll bar) pauses the following until the line being played is in view
// again by itself, or the playhead is moved from the chart, or playing starts.

import { useEffect, useRef, type RefObject } from 'react';
import { getEngine } from '../audio';
import { appStore } from '../store/store';
import { useFrame } from '../ui/frameLoop';
import { barProgress } from './layout';

/** Pure: where to scroll to so that a line at `top` (px from the top of the view) with height `height` is well placed, or null when it is fine. */
export function followTarget(input: { top: number; height: number; viewHeight: number; scrollTop: number; scrollMax: number }): number | null {
  const { top, height, viewHeight, scrollTop, scrollMax } = input;
  // The line and the one after it must fit in view.
  const tooLow = top + height * 2 + 8 > viewHeight;
  const tooHigh = top < 4;
  if (!tooLow && !tooHigh) return null;
  const target = Math.min(Math.max(0, scrollTop + top - viewHeight * 0.28), scrollMax);
  return Math.abs(target - scrollTop) < 4 ? null : target;
}

const GRACE_MS = 1200;
const GLIDE_MS = 380;

export interface FollowLine {
  /** The playhead was moved on purpose: follow again. */
  resume: () => void;
}

export function useFollowLine(scroller: RefObject<HTMLElement | null>, grid: RefObject<HTMLElement | null>): FollowLine {
  const s = useRef({
    suspended: false,
    lastUser: -1e9,
    playing: false,
    glide: null as null | { from: number; to: number; start: number },
    cell: null as null | { bar: number; el: HTMLElement },
  });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const user = () => {
      s.current.lastUser = performance.now();
      s.current.suspended = true;
      s.current.glide = null;
    };
    const onPointerDown = (e: PointerEvent) => {
      // A press on the scroll bar itself (not on the sheet's content) is the user scrolling.
      if (e.target === el) user();
    };
    const onKey = (e: KeyboardEvent) => {
      if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key) && e.target === el) user();
    };
    el.addEventListener('wheel', user, { passive: true });
    el.addEventListener('touchmove', user, { passive: true });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', user);
      el.removeEventListener('touchmove', user);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('keydown', onKey);
    };
  }, [scroller]);

  useFrame((now) => {
    const st = s.current;
    const sc = scroller.current;
    const host = grid.current;
    const app = appStore.getState();
    const playing = app.transport.engine === 'playing';
    if (playing && !st.playing) st.suspended = false; // a new start follows again
    st.playing = playing;
    if (!sc || !host || !playing || !app.view.follow || !app.project) {
      st.glide = null;
      return;
    }
    if (st.glide) {
      const k = Math.min(1, (now - st.glide.start) / GLIDE_MS);
      const eased = 1 - (1 - k) ** 3;
      sc.scrollTop = st.glide.from + (st.glide.to - st.glide.from) * eased;
      if (k >= 1) st.glide = null;
      return;
    }
    if (performance.now() - st.lastUser < GRACE_MS) return;
    const { bar } = barProgress(app.tempoMap, getEngine().getPosition());
    if (!st.cell || st.cell.bar !== bar || !st.cell.el.isConnected) {
      const el = host.querySelector<HTMLElement>(`[data-mesure="${bar}"]`);
      st.cell = el ? { bar, el } : null;
    }
    if (!st.cell) return;
    const top = st.cell.el.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    const height = st.cell.el.offsetHeight;
    const target = followTarget({ top, height, viewHeight: sc.clientHeight, scrollTop: sc.scrollTop, scrollMax: sc.scrollHeight - sc.clientHeight });
    if (target === null) {
      // The line is in view (the user scrolled back to it, or it came by itself): following resumes.
      st.suspended = false;
      return;
    }
    if (st.suspended) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) sc.scrollTop = target;
    else st.glide = { from: sc.scrollTop, to: target, start: now };
  });

  return { resume: () => { s.current.suspended = false; s.current.lastUser = -1e9; } };
}
