import { describe, expect, it } from 'vitest';
import { fineExtensions, labelExtensions } from './tsumugiExtensions';
import { TSUMUGI_LABELS, TSUMUGI_TO_APP } from './tsumugiVocab';

describe('the fine model\'s extensions', () => {
  it('reads them from the labels', () => {
    expect(labelExtensions('C:7(b9,13)')).toEqual(['b9', '13']);
    expect(labelExtensions('C:7(*5,b5)')).toEqual(['b5']);
    expect(labelExtensions('C:maj7')).toEqual([]);
  });

  it('takes the best class among those folding onto the chord, none when it is barely heard', () => {
    const detail = new Float64Array(745);
    const g7 = TSUMUGI_LABELS.indexOf('G:7');
    const g713 = TSUMUGI_LABELS.indexOf('G:7(9,13)');
    detail[g7] = 0.2;
    detail[g713] = 0.5;
    expect(fineExtensions(detail, TSUMUGI_TO_APP[g7]!)).toEqual(['9', '13']);
    expect(fineExtensions(new Float64Array(745), TSUMUGI_TO_APP[g7]!)).toBeNull();
  });
});
