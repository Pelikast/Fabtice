import { describe, expect, it } from 'vitest';
import { constantTempoMap } from '../grid/tempoMap';
import type { Key, KeyChange } from '../model/harmony';
import { checkModulation, keyBefore, modulationBarRange, type ModulationEnv } from './modulationForm';

// 120 BPM, 4/4, first downbeat 0: bar n starts at 2n s. 24 bars.
const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
const k = (tonic: number, mode: Key['mode'] = 'major'): Key => ({ tonic, mode });
const change = (bar: number, key: Key): KeyChange => ({ time: bar * 2, key });
const env = (list: KeyChange[] = [], main: Key | null = k(8)): ModulationEnv => ({ map, duration: 48, chart: { firstBar: 0, lastBar: 23 }, main, list });

describe('the key before a bar', () => {
  it('is the main key until a modulation, then the key of the last one before the bar', () => {
    const list = [change(8, k(4)), change(16, k(8))];
    expect(keyBefore(map, k(8), list, 4)).toEqual(k(8));
    expect(keyBefore(map, k(8), list, 8)).toEqual(k(8));
    expect(keyBefore(map, k(8), list, 9)).toEqual(k(4));
    expect(keyBefore(map, k(8), list, 20)).toEqual(k(8));
    expect(keyBefore(map, null, [], 5)).toBeNull();
  });
});

describe('the bars a modulation may start at', () => {
  it('from the second bar to the last (numbers as musicians read them)', () => {
    expect(modulationBarRange({ firstBar: 0, lastBar: 23 })).toEqual({ min: 2, max: 24 });
    expect(modulationBarRange({ firstBar: -1, lastBar: 5 })).toEqual({ min: 1, max: 6 });
    expect(modulationBarRange({ firstBar: 0, lastBar: 0 })).toBeNull();
  });
});

describe('what the fields make', () => {
  it('a new modulation: the bar line of the bar number, in the key chosen', () => {
    expect(checkModulation(env(), { barText: '9', key: k(4), editing: null })).toEqual({ ok: true, bar: 8, time: 16 });
    expect(checkModulation(env(), { barText: ' 24 ', key: k(4, 'minor'), editing: null })).toEqual({ ok: true, bar: 23, time: 46 });
  });

  it('refuses a bar that is not one a modulation can start at', () => {
    for (const barText of ['1', '0', '25', '', 'x', '9.5', '-3']) expect(checkModulation(env(), { barText, key: k(4), editing: null })).toEqual({ ok: false, problem: 'bar' });
  });

  it('says calmly that the key is already the one of the passage before, and creates nothing', () => {
    expect(checkModulation(env(), { barText: '9', key: k(8), editing: null })).toEqual({ ok: false, problem: 'same' });
    // The passage before may itself be a modulation.
    const list = [change(8, k(4))];
    expect(checkModulation(env(list), { barText: '17', key: k(4), editing: null })).toEqual({ ok: false, problem: 'same' });
    expect(checkModulation(env(list), { barText: '17', key: k(8), editing: null })).toMatchObject({ ok: true });
    // Minor and major of the same tonic are not the same key.
    expect(checkModulation(env(), { barText: '9', key: k(8, 'minor'), editing: null })).toMatchObject({ ok: true });
  });

  it('with no main key known, any key is a change', () => {
    expect(checkModulation(env([], null), { barText: '9', key: k(8), editing: null })).toMatchObject({ ok: true });
  });

  it('refuses a bar where another modulation already is', () => {
    const list = [change(8, k(4))];
    expect(checkModulation(env(list), { barText: '9', key: k(2), editing: null })).toEqual({ ok: false, problem: 'taken' });
  });

  it('editing one: its own bar is free, its own key is not « the key before »', () => {
    const list = [change(8, k(4)), change(16, k(9))];
    expect(checkModulation(env(list), { barText: '9', key: k(2), editing: 16 })).toMatchObject({ ok: true, bar: 8 });
    // Moved onto the other one: taken.
    expect(checkModulation(env(list), { barText: '17', key: k(2), editing: 16 })).toEqual({ ok: false, problem: 'taken' });
    // Moved earlier than the one before it: the key before is the main key, not the modulation it passes.
    expect(checkModulation(env(list), { barText: '5', key: k(8), editing: 16 })).toEqual({ ok: false, problem: 'same' });
    // Its key set to the key before it (the main key's, once it is the only modulation): same.
    expect(checkModulation(env([change(8, k(4))]), { barText: '9', key: k(8), editing: 16 })).toEqual({ ok: false, problem: 'same' });
  });
});
