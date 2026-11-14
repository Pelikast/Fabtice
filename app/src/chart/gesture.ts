// The pointer gestures of the chart as a small state machine, pure so that it
// can be tested (gesture.test.ts). `useChartGestures` feeds it the DOM events
// and carries out the effects it returns.
//
// Mouse: a click on a chord opens its editor, a click anywhere else in a bar
// moves the playhead to the start of that bar; dragging across bars selects
// them as the loop (live, either direction, across lines).
//
// Touch: a tap does the same as a click and a drag scrolls the sheet (the
// browser's own scrolling: the machine lets go). Selecting is by PRESS AND
// HOLD, then drag: a finger resting on a bar for `HOLD_MS` selects that bar
// (a visible veil tells it worked), and moving on then extends the selection.
// A finger that moves before that is a scroll, so scrolling can never select
// by accident, and a tap is too short to be a hold.

export const DRAG_PX = 4;
export const TOUCH_SLOP_PX = 10;
export const HOLD_MS = 420;
export const TAP_MAX_MS = HOLD_MS;

/** What is under the pointer when it goes down. */
export type Hit =
  /** A chord (its rank in the bar), or the chord area of a bar without chords (-1). */
  | { target: 'chord'; bar: number; index: number }
  /** The section letter of a bar; `index` is the chord the editor opens on. */
  | { target: 'section'; bar: number; index: number }
  /** Anywhere else in a bar. */
  | { target: 'bar'; bar: number };

export type GestureState =
  | { kind: 'idle' }
  | { kind: 'press'; pointerId: number; touch: boolean; x: number; y: number; at: number; hit: Hit }
  | { kind: 'select'; pointerId: number; touch: boolean; anchor: number; last: number };

export type GestureEvent =
  | { type: 'down'; pointerId: number; touch: boolean; x: number; y: number; at: number; hit: Hit | null }
  /** `bar` is the bar under the pointer now (also past the edges of the chart), null if there is none. */
  | { type: 'move'; pointerId: number; x: number; y: number; bar: number | null }
  /** The hold timer of a finger fired. */
  | { type: 'hold'; pointerId: number }
  | { type: 'up'; pointerId: number; at: number }
  | { type: 'cancel'; pointerId: number };

export type Effect =
  | { type: 'seek'; bar: number }
  | { type: 'edit'; bar: number; index: number; focus: 'chord' | 'section' }
  | { type: 'select'; first: number; last: number }
  /** A selection is finished: the playhead goes into the loop. */
  | { type: 'commit' }
  /** A finger moved before holding: it scrolls the sheet, the gesture is over. */
  | { type: 'scroll' };

export interface Step {
  state: GestureState;
  effects: Effect[];
}

export const IDLE: GestureState = { kind: 'idle' };

const none = (state: GestureState): Step => ({ state, effects: [] });
const range = (a: number, b: number): Effect => ({ type: 'select', first: Math.min(a, b), last: Math.max(a, b) });

export function stepGesture(state: GestureState, e: GestureEvent): Step {
  if (e.type === 'down') {
    // A second finger (a pinch, a palm) never starts anything.
    if (state.kind !== 'idle' || !e.hit) return none(state);
    return none({ kind: 'press', pointerId: e.pointerId, touch: e.touch, x: e.x, y: e.y, at: e.at, hit: e.hit });
  }
  if (state.kind === 'idle' || state.pointerId !== e.pointerId) return none(state);

  switch (e.type) {
    case 'move': {
      if (state.kind === 'select') {
        if (e.bar === null || e.bar === state.last) return none(state);
        return { state: { ...state, last: e.bar }, effects: [range(state.anchor, e.bar)] };
      }
      const moved = Math.hypot(e.x - state.x, e.y - state.y);
      if (state.touch) {
        // Before the hold, any real movement is the finger scrolling.
        return moved >= TOUCH_SLOP_PX ? { state: IDLE, effects: [{ type: 'scroll' }] } : none(state);
      }
      if (moved < DRAG_PX) return none(state);
      const anchor = state.hit.bar;
      const last = e.bar ?? anchor;
      return { state: { kind: 'select', pointerId: state.pointerId, touch: false, anchor, last }, effects: [range(anchor, last)] };
    }
    case 'hold': {
      if (state.kind !== 'press' || !state.touch) return none(state);
      const anchor = state.hit.bar;
      return { state: { kind: 'select', pointerId: state.pointerId, touch: true, anchor, last: anchor }, effects: [range(anchor, anchor)] };
    }
    case 'up': {
      if (state.kind === 'select') return { state: IDLE, effects: [{ type: 'commit' }] };
      if (state.touch && e.at - state.at > TAP_MAX_MS) return none(IDLE);
      const hit = state.hit;
      const effect: Effect =
        hit.target === 'chord'
          ? { type: 'edit', bar: hit.bar, index: hit.index, focus: 'chord' }
          : hit.target === 'section'
            ? { type: 'edit', bar: hit.bar, index: hit.index, focus: 'section' }
            : { type: 'seek', bar: hit.bar };
      return { state: IDLE, effects: [effect] };
    }
    case 'cancel':
      // A selection already made stays (and is committed); a press that never became one is dropped.
      return state.kind === 'select' ? { state: IDLE, effects: [{ type: 'commit' }] } : none(IDLE);
  }
}
