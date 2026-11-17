import { describe, expect, it } from 'vitest';
import { MEASURE_DENOMINATORS, meterOfForm, parseNumerator, quarterLengthText, quartersPerBar, showsQuarterHint } from './meterForm';

describe('the top figure', () => {
  it('accepts whole numbers from 1 to 64', () => {
    expect(parseNumerator('1')).toBe(1);
    expect(parseNumerator(' 7 ')).toBe(7);
    expect(parseNumerator('64')).toBe(64);
    expect(parseNumerator('07')).toBe(7);
  });

  it('refuses anything else, without correcting it', () => {
    for (const text of ['', ' ', '0', '65', '100', '-3', '3,5', '3.5', 'a', '7a', '1e1', '000']) expect(parseNumerator(text), JSON.stringify(text)).toBeNull();
  });
});

describe('the signature of the boxes', () => {
  it('offers 4, 8, 16 and 32 below', () => {
    expect([...MEASURE_DENOMINATORS]).toEqual([4, 8, 16, 32]);
  });

  it('is null while the top figure is not valid, a signature otherwise', () => {
    expect(meterOfForm('7', 8)).toEqual({ numerator: 7, denominator: 8 });
    expect(meterOfForm('', 8)).toBeNull();
    expect(meterOfForm('65', 4)).toBeNull();
    expect(meterOfForm('7', 6)).toBeNull();
  });
});

describe('« la noire garde sa durée »', () => {
  it('counts the quarters of a bar', () => {
    expect(quartersPerBar({ numerator: 6, denominator: 8 })).toBe(3);
    expect(quartersPerBar({ numerator: 7, denominator: 8 })).toBe(3.5);
    expect(quartersPerBar({ numerator: 5, denominator: 4 })).toBe(5);
    expect(quartersPerBar({ numerator: 3, denominator: 16 })).toBe(0.75);
    expect(quartersPerBar({ numerator: 64, denominator: 4 })).toBe(64);
  });

  it('says it in words, as the owner wrote it', () => {
    expect(quarterLengthText(3)).toBe('trois noires');
    expect(quarterLengthText(1)).toBe('une noire');
    expect(quarterLengthText(1.5)).toBe('une noire et demie');
    expect(quarterLengthText(3.5)).toBe('trois noires et demie');
    expect(quarterLengthText(0.5)).toBe('une demi-noire');
    expect(quarterLengthText(0.75)).toBe('0,75 noire');
    expect(quarterLengthText(2.25)).toBe('2,25 noires');
    expect(quarterLengthText(64)).toBe('64 noires');
  });

  it('is shown only when the bottom figure differs from the first signature’s', () => {
    const first = { numerator: 4, denominator: 4 };
    expect(showsQuarterHint({ numerator: 6, denominator: 8 }, first)).toBe(true);
    expect(showsQuarterHint({ numerator: 7, denominator: 4 }, first)).toBe(false);
    expect(showsQuarterHint(null, first)).toBe(false);
  });
});
