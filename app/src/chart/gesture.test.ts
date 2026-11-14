import { describe, expect, it } from 'vitest';
import { HOLD_MS, IDLE, stepGesture, type Effect, type GestureEvent, type GestureState, type Hit } from './gesture';

/** Plays events one after the other; returns the final state and every effect, in order. */
function play(events: GestureEvent[], from: GestureState = IDLE): { state: GestureState; effects: Effect[] } {
  let state = from;
  const effects: Effect[] = [];
  for (const e of events) {
    const step = stepGesture(state, e);
    state = step.state;
    effects.push(...step.effects);
  }
  return { state, effects };
}

const onBar = (bar: number): Hit => ({ target: 'bar', bar });
const onChord = (bar: number, index = 0): Hit => ({ target: 'chord', bar, index });
const down = (hit: Hit | null, touch = false, at = 0, id = 1): GestureEvent => ({ type: 'down', pointerId: id, touch, x: 100, y: 100, at, hit });
const move = (bar: number | null, dx = 30, dy = 0, id = 1): GestureEvent => ({ type: 'move', pointerId: id, x: 100 + dx, y: 100 + dy, bar });
const up = (at = 50, id = 1): GestureEvent => ({ type: 'up', pointerId: id, at });

describe('mouse', () => {
  it('a click on a bar moves the playhead to the start of that bar', () => {
    expect(play([down(onBar(5)), up()]).effects).toEqual([{ type: 'seek', bar: 5 }]);
  });

  it('a click on a chord opens its editor, not the playhead', () => {
    expect(play([down(onChord(5, 1)), up()]).effects).toEqual([{ type: 'edit', bar: 5, index: 1, focus: 'chord' }]);
  });

  it('a click on a section letter opens the editor on the section field', () => {
    expect(play([down({ target: 'section', bar: 8, index: 0 }), up()]).effects).toEqual([{ type: 'edit', bar: 8, index: 0, focus: 'section' }]);
  });

  it('a few pixels of shake are still a click', () => {
    expect(play([down(onBar(2)), move(2, 2, 1), up()]).effects).toEqual([{ type: 'seek', bar: 2 }]);
  });

  it('a drag selects live, from the bar it started on, and commits on release', () => {
    const { effects, state } = play([down(onBar(2)), move(3), move(3), move(6), up()]);
    expect(effects).toEqual([
      { type: 'select', first: 2, last: 3 },
      { type: 'select', first: 2, last: 6 },
      { type: 'commit' },
    ]);
    expect(state).toBe(IDLE);
  });

  it('a drag may go back up, across lines, and start on a chord', () => {
    const { effects } = play([down(onChord(9)), move(8), move(5, 10, -90), move(1, 0, -200), up()]);
    expect(effects).toEqual([
      { type: 'select', first: 8, last: 9 },
      { type: 'select', first: 5, last: 9 },
      { type: 'select', first: 1, last: 9 },
      { type: 'commit' },
    ]);
  });

  it('a drag that ends on its own bar selects that bar', () => {
    expect(play([down(onBar(4)), move(4), up()]).effects).toEqual([{ type: 'select', first: 4, last: 4 }, { type: 'commit' }]);
  });

  it('leaving the chart keeps the last bar, coming back changes it', () => {
    const { effects } = play([down(onBar(3)), move(4), move(null), move(5), up()]);
    expect(effects).toEqual([{ type: 'select', first: 3, last: 4 }, { type: 'select', first: 3, last: 5 }, { type: 'commit' }]);
  });

  it('a press outside any bar starts nothing', () => {
    expect(play([down(null), move(1), up()])).toEqual({ state: IDLE, effects: [] });
  });

  it('a cancelled selection is kept and committed', () => {
    expect(play([down(onBar(1)), move(2), { type: 'cancel', pointerId: 1 }]).effects).toEqual([{ type: 'select', first: 1, last: 2 }, { type: 'commit' }]);
  });
});

describe('touch', () => {
  it('a tap does what a click does', () => {
    expect(play([down(onBar(5), true), up(120)]).effects).toEqual([{ type: 'seek', bar: 5 }]);
    expect(play([down(onChord(5), true), up(120)]).effects).toEqual([{ type: 'edit', bar: 5, index: 0, focus: 'chord' }]);
  });

  it('a finger that moves before holding scrolls the sheet: nothing is selected', () => {
    const r = play([down(onBar(5), true), move(6, 0, 40), move(7, 0, 90)]);
    expect(r.effects).toEqual([{ type: 'scroll' }]);
    expect(r.state).toBe(IDLE);
    // And its release does nothing.
    expect(stepGesture(r.state, up(300)).effects).toEqual([]);
  });

  it('press and hold selects the bar, moving on extends, lifting commits', () => {
    const { effects, state } = play([down(onBar(5), true), { type: 'hold', pointerId: 1 }, move(6, 20, 0), move(2, -300, -90), up(900)], IDLE);
    expect(effects).toEqual([
      { type: 'select', first: 5, last: 5 },
      { type: 'select', first: 5, last: 6 },
      { type: 'select', first: 2, last: 5 },
      { type: 'commit' },
    ]);
    expect(state).toBe(IDLE);
  });

  it('holding on a chord selects, it does not open the editor', () => {
    const { effects } = play([down(onChord(5), true), { type: 'hold', pointerId: 1 }, up(900)]);
    expect(effects).toEqual([{ type: 'select', first: 5, last: 5 }, { type: 'commit' }]);
  });

  it('a long press that the hold timer did not catch is neither a tap nor a selection', () => {
    expect(play([down(onBar(5), true, 0), up(HOLD_MS + 200)]).effects).toEqual([]);
  });

  it('a second finger starts nothing and does not disturb the first', () => {
    const r = play([down(onBar(5), true, 0, 1), down(onBar(7), true, 10, 2), up(60, 2), up(100, 1)]);
    expect(r.effects).toEqual([{ type: 'seek', bar: 5 }]);
  });

  it('a hold does nothing for a mouse', () => {
    expect(play([down(onBar(5)), { type: 'hold', pointerId: 1 }]).state.kind).toBe('press');
  });
});
