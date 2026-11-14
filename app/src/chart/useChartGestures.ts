// Mouse and touch on the chart: carries the pointer events to the state machine
// of `chart/gesture.ts` and does what it asks, the way the tracks' timeline
// does (`timeline/controller.ts`): a click moves the playhead, a drag selects
// bars as the loop live, and on release `enterLoop()` brings the playhead into
// it. See gesture.ts for the touch rules (tap, scroll, press and hold).

import { useEffect, useRef, type RefObject } from 'react';
import { loopFromBars } from '../grid/lines';
import { barStartTime } from '../grid/tempoMap';
import { enterLoop, seek, setLoopRegion } from '../store/actions';
import { appStore } from '../store/store';
import { onFrame } from '../ui/frameLoop';
import { barAtPoint, type CellBox } from './hit';
import { HOLD_MS, IDLE, stepGesture, type Effect, type GestureEvent, type GestureState, type Hit } from './gesture';
import type { OpenedBy } from './editor';

/** Distance from the top or bottom edge of the sheet where a drag scrolls it, and the fastest scroll (px per frame). */
const EDGE_ZONE_PX = 56;
const EDGE_MAX_SPEED = 16;

export interface GestureOptions {
  /** The `.grille` element (bars are looked up in it). */
  grid: RefObject<HTMLElement | null>;
  /** The element that scrolls. */
  scroller: RefObject<HTMLElement | null>;
  /** A click or tap on a chord or a section letter. */
  onEdit: (bar: number, index: number, focus: 'chord' | 'section', by: OpenedBy) => void;
  /** The playhead was moved by a click on the chart (the sheet may follow it again). */
  onSeek?: () => void;
  /** A selection starts: nothing to do with the editor, so it closes. */
  onSelect?: () => void;
}

/** What is under the pointer, read from the markup (`data-mesure`, `.accord-case`, `.section`). */
function hitOf(grid: HTMLElement, target: EventTarget | null): Hit | null {
  if (!(target instanceof Element)) return null;
  const cell = target.closest<HTMLElement>('[data-mesure]');
  if (!cell || !grid.contains(cell)) return null;
  const bar = Number(cell.dataset.mesure);
  const chord = target.closest<HTMLElement>('.accord-case');
  if (chord && cell.contains(chord)) return { target: 'chord', bar, index: Number(chord.dataset.accord) };
  if (target.closest('.section')) {
    const first = cell.querySelector<HTMLElement>('.accord-case');
    return { target: 'section', bar, index: first ? Number(first.dataset.accord) : -1 };
  }
  return { target: 'bar', bar };
}

export function useChartGestures(opts: GestureOptions): void {
  const latest = useRef(opts);
  latest.current = opts;

  useEffect(() => {
    const grid = opts.grid.current;
    if (!grid) return;
    let state: GestureState = IDLE;
    let by: OpenedBy = 'mouse';
    let holdTimer = 0;
    let boxes: CellBox[] | null = null;
    let last = { x: 0, y: 0 };
    let stopAuto: (() => void) | null = null;

    const measure = (): CellBox[] => {
      const origin = grid.getBoundingClientRect();
      return [...grid.querySelectorAll<HTMLElement>('[data-mesure]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { bar: Number(el.dataset.mesure), x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
      });
    };
    /** The bar under a viewport point; the boxes are in the grid's own coordinates, so scrolling does not matter. */
    const barAt = (clientX: number, clientY: number): number | null => {
      boxes ??= measure();
      const origin = grid.getBoundingClientRect();
      return barAtPoint(boxes, clientX - origin.left, clientY - origin.top);
    };

    const run = (effects: Effect[]) => {
      const { onEdit, onSeek, onSelect } = latest.current;
      for (const e of effects) {
        const { tempoMap } = appStore.getState();
        switch (e.type) {
          case 'seek':
            seek(Math.max(0, barStartTime(tempoMap, e.bar)));
            onSeek?.();
            break;
          case 'edit':
            onEdit(e.bar, e.index, e.focus, by);
            break;
          case 'select':
            onSelect?.();
            setLoopRegion(loopFromBars(tempoMap, e.first, e.last));
            break;
          case 'commit':
            onSeek?.();
            enterLoop();
            break;
          case 'scroll':
            break;
        }
      }
    };

    const stopAll = () => {
      window.clearTimeout(holdTimer);
      holdTimer = 0;
      stopAuto?.();
      stopAuto = null;
      boxes = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };

    const feed = (e: GestureEvent) => {
      const step = stepGesture(state, e);
      state = step.state;
      run(step.effects);
      if (state.kind === 'select' && !stopAuto) stopAuto = startAutoScroll();
      if (state.kind === 'idle') stopAll();
    };

    /** While a selection is dragged to the top or bottom edge of the sheet, the sheet scrolls under the pointer. */
    const startAutoScroll = (): (() => void) => {
      const scroller = latest.current.scroller.current;
      if (!scroller) return () => {};
      return onFrame(() => {
        if (state.kind !== 'select') return;
        const r = scroller.getBoundingClientRect();
        const fromTop = EDGE_ZONE_PX - (last.y - r.top);
        const fromBottom = EDGE_ZONE_PX - (r.bottom - last.y);
        const speed = fromTop > 0 ? -Math.min(1, fromTop / EDGE_ZONE_PX) : fromBottom > 0 ? Math.min(1, fromBottom / EDGE_ZONE_PX) : 0;
        if (!speed) return;
        const before = scroller.scrollTop;
        scroller.scrollTop += speed * EDGE_MAX_SPEED;
        if (scroller.scrollTop !== before) feed({ type: 'move', pointerId: state.kind === 'select' ? state.pointerId : -1, x: last.x, y: last.y, bar: barAt(last.x, last.y) });
      });
    };

    function onMove(e: PointerEvent): void {
      last = { x: e.clientX, y: e.clientY };
      if (state.kind === 'idle' || e.pointerId !== state.pointerId) return;
      // Bars are only needed once a drag may start or goes on.
      const needsBar = state.kind === 'select' || !state.touch;
      feed({ type: 'move', pointerId: e.pointerId, x: e.clientX, y: e.clientY, bar: needsBar ? barAt(e.clientX, e.clientY) : null });
    }
    function onUp(e: PointerEvent): void {
      feed({ type: 'up', pointerId: e.pointerId, at: e.timeStamp });
    }
    function onCancel(e: PointerEvent): void {
      feed({ type: 'cancel', pointerId: e.pointerId });
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (state.kind !== 'idle') return;
      const touch = e.pointerType === 'touch';
      by = touch ? 'touch' : 'mouse';
      last = { x: e.clientX, y: e.clientY };
      boxes = null;
      feed({ type: 'down', pointerId: e.pointerId, touch, x: e.clientX, y: e.clientY, at: e.timeStamp, hit: hitOf(grid, e.target) });
      if ((state as GestureState).kind !== 'press') return;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      if (touch) {
        const pointerId = e.pointerId;
        holdTimer = window.setTimeout(() => feed({ type: 'hold', pointerId }), HOLD_MS);
      }
    };

    // Once a finger holds and selects, the sheet must not scroll under it.
    const onTouchMove = (e: TouchEvent) => {
      if (state.kind === 'select' && e.cancelable) e.preventDefault();
    };
    // A long press must not open the system menu or select text.
    const onContextMenu = (e: Event) => {
      if (state.kind !== 'idle') e.preventDefault();
    };

    grid.addEventListener('pointerdown', onDown);
    grid.addEventListener('touchmove', onTouchMove, { passive: false });
    grid.addEventListener('contextmenu', onContextMenu);
    return () => {
      grid.removeEventListener('pointerdown', onDown);
      grid.removeEventListener('touchmove', onTouchMove);
      grid.removeEventListener('contextmenu', onContextMenu);
      stopAll();
    };
    // The handlers read the latest options through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.grid]);
}
