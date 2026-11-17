import { describe, expect, it } from 'vitest';
import { barSim, barSimShift, barTokens, DOM, familyOf, MAJ, MIN, NONE, rootOf, tokenOf, tokenSim, TokenVote } from './grid';
import { chartBars, chord } from './testCharts';

describe('structure grid: tokens', () => {
  it('keeps the root and a coarse family (extensions and sixths are the same token)', () => {
    expect(tokenOf(chord('G13'))).toBe(tokenOf(chord('G7(#5)')));
    expect(tokenOf(chord('D6'))).toBe(tokenOf(chord('Dmaj7')));
    expect(familyOf(tokenOf(chord('Bm7')))).toBe(MIN);
    expect(familyOf(tokenOf(chord('C7')))).toBe(DOM);
    expect(familyOf(tokenOf(chord('C')))).toBe(MAJ);
    expect(rootOf(tokenOf(chord('Bb7')))).toBe(10);
    expect(tokenOf(null)).toBe(NONE);
  });

  it('rates alike what a player hears alike', () => {
    const t = (s: string) => tokenOf(chord(s));
    expect(tokenSim(t('G7'), t('G9'))).toBe(1);
    expect(tokenSim(t('G7'), t('Db7'))).toBeGreaterThan(0.5); // tritone substitute
    expect(tokenSim(t('Cmaj7'), t('C7'))).toBe(0.5);
    expect(tokenSim(t('C'), t('Am'))).toBeGreaterThan(0); // relative
    expect(tokenSim(t('C'), t('F#'))).toBe(0);
  });

  it('reads the chord sounding on each beat, the carried one included', () => {
    const bars = chartBars('C | | F G7 | N.C.');
    const toks = barTokens(bars);
    expect(Array.from(toks[1]!.slots)).toEqual([tokenOf(chord('C')), tokenOf(chord('C')), tokenOf(chord('C')), tokenOf(chord('C'))]);
    expect(Array.from(toks[2]!.slots)).toEqual([tokenOf(chord('F')), tokenOf(chord('F')), tokenOf(chord('G7')), tokenOf(chord('G7'))]);
    expect(Array.from(toks[3]!.slots).every((x) => x === NONE)).toBe(true);
  });

  it('says nothing about a bar of N.C. (NaN), and compares bars of other lengths in proportion', () => {
    const [a, nc] = barTokens(chartBars('C | N.C.'));
    expect(Number.isNaN(barSim(a!, nc!))).toBe(true);
    const [four] = barTokens(chartBars('C F'));
    const [three] = barTokens(chartBars('C F', { beats: 3 }));
    expect(barSim(four!, three!)).toBeGreaterThan(0.6);
  });

  it('tolerates a bar read one beat late', () => {
    const [a, b] = barTokens(chartBars('C F | G'));
    const [late] = barTokens(chartBars('G C C F')); // the previous chord on the first beat
    expect(barSimShift(a!, late!)).toBeGreaterThan(barSim(a!, late!));
    expect(barSim(a!, b!)).toBe(0);
  });

  it('votes deterministically', () => {
    const v = new TokenVote();
    v.add(3, 1);
    v.add(1, 1);
    expect(v.best().token).toBe(1);
    v.add(3, 0.5);
    expect(v.best()).toEqual({ token: 3, share: 0.6 });
  });
});
