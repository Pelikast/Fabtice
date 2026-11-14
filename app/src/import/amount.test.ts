import { describe, expect, it } from 'vitest';
import { formatAmount } from './amount';

describe('formatAmount', () => {
  it('says ko, Mo, Go with a French decimal comma', () => {
    expect(formatAmount(512)).toBe('1 ko');
    expect(formatAmount(640_000)).toBe('640 ko');
    expect(formatAmount(12_400_000)).toBe('12,4 Mo');
    expect(formatAmount(3_100_000_000)).toBe('3,1 Go');
  });

  it('says nothing for what is not a size', () => {
    expect(formatAmount(Number.NaN)).toBe('');
    expect(formatAmount(-5)).toBe('');
  });
});
