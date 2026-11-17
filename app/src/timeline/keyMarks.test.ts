import { describe, expect, it } from 'vitest';
import { KEY_MARK_END_GAP, KEY_MARK_PAD_X, describeKeyMarks, indexKeyMarks, layoutKeyMark } from './keyMarks';

describe('the pill of a modulation on the ruler', () => {
  it('starts where it is given and is as wide as its text and its padding', () => {
    expect(layoutKeyMark(40, 300, 22)).toEqual({ x: 40, width: 22 + 2 * KEY_MARK_PAD_X });
  });

  it('is left out, not squeezed, when it would not end before the next bar line with its gap', () => {
    const width = 22 + 2 * KEY_MARK_PAD_X;
    expect(layoutKeyMark(40, 40 + width + KEY_MARK_END_GAP, 22)).not.toBeNull();
    expect(layoutKeyMark(40, 40 + width + KEY_MARK_END_GAP - 0.5, 22)).toBeNull();
    expect(layoutKeyMark(40, 60, 22)).toBeNull();
  });

  it('is described for the browser checks with bars as shown (1-based)', () => {
    expect(describeKeyMarks([])).toBe('');
    expect(describeKeyMarks([{ bar: 8, text: 'F♯m' }, { bar: 16, text: 'A♭' }])).toBe('9:F♯m 17:A♭');
  });

  it('is found by bar', () => {
    const map = indexKeyMarks([{ bar: 8, time: 16, text: 'E', byHand: false }]);
    expect(map.get(8)?.text).toBe('E');
    expect(map.get(9)).toBeUndefined();
  });
});
