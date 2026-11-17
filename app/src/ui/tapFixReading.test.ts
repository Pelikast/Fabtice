import { describe, expect, it } from 'vitest';
import { tapsReadingText } from './tapFixReading';

const r = (offset: number, filled = 0, dropped = 0) => ({ offset, filled, dropped });

describe('what the check step says about the taps', () => {
  it('says nothing when the taps were close to the beats and none was added or set aside', () => {
    expect(tapsReadingText(r(0.012))).toBeNull();
    expect(tapsReadingText(r(-0.029))).toBeNull();
  });

  it('a delay of 30 ms or more: « après », compensated', () => {
    expect(tapsReadingText(r(0.04))).toBe('Vous tapez en moyenne 40 ms après le temps : c’est compensé.');
  });

  it('an advance: « avant »', () => {
    expect(tapsReadingText(r(-0.0526))).toBe('Vous tapez en moyenne 53 ms avant le temps : c’est compensé.');
  });

  it('beats added and taps set aside, singular and plural right', () => {
    expect(tapsReadingText(r(0, 2, 1))).toBe('2 temps oubliés ont été ajoutés, 1 tape en trop a été écartée.');
    expect(tapsReadingText(r(0, 1, 0))).toBe('1 temps oublié a été ajouté.');
    expect(tapsReadingText(r(0, 0, 3))).toBe('3 tapes en trop ont été écartées.');
  });

  it('both, in one line', () => {
    expect(tapsReadingText(r(0.05, 1, 2))).toBe('Vous tapez en moyenne 50 ms après le temps : c’est compensé. 1 temps oublié a été ajouté, 2 tapes en trop ont été écartées.');
  });
});
