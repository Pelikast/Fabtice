import { describe, expect, it } from 'vitest';
import { constantTempoMap } from '../grid/tempoMap';
import type { StructurePart } from '../model/structure';
import { formOfPart, MAX_PART_NUMBER, numberChoices, patchOf, readForm, typesInOrder, wholeNumber, type FormContext, type PartForm } from './partForm';

const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
const ctx: FormContext = { map, duration: 48, chart: { firstBar: 0, lastBar: 23 } };
const old: StructurePart = { id: 'x', type: 'solo', number: null, instrument: 'guitar', start: 20, end: 28 };
const range = { first: 10, end: 14 };

describe('the fields of a part', () => {
  it('start from the part: type, number, instrument and its bars as musicians count them', () => {
    expect(formOfPart(old, range)).toEqual({ type: 'solo', number: '', instrument: 'guitar', first: '11', last: '14' });
    expect(formOfPart({ type: 'theme', number: 2, instrument: null }, { first: 0, end: 4 })).toEqual({ type: 'theme', number: '2', instrument: '', first: '1', last: '4' });
  });

  it('offer the kinds of the mode first, the others after', () => {
    expect(typesInOrder('jazz').first).toEqual(['intro', 'theme', 'solo', 'bridge', 'special', 'outro']);
    expect(typesInOrder('jazz').others).toEqual(['verse', 'chorus']);
    expect(typesInOrder('pop').first).toEqual(['intro', 'verse', 'chorus', 'bridge', 'solo', 'outro']);
    expect(typesInOrder('pop').others).toEqual(['theme', 'special']);
  });

  it('offer 1 to 9, and the number of the part when it is higher', () => {
    expect(numberChoices('')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(numberChoices('12')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 12]);
  });
});

describe('what the fields mean', () => {
  const form = (patch: Partial<PartForm> = {}): PartForm => ({ type: 'theme', number: '1', instrument: '', first: '3', last: '10', ...patch });

  it('reads a part, with the limits on the grid in force', () => {
    expect(readForm(form(), ctx)).toEqual({ type: 'theme', number: 1, instrument: null, start: 4, end: 20 });
    expect(readForm(form({ number: '', instrument: 'piano' }), ctx)).toMatchObject({ number: null, instrument: 'piano' });
  });

  it('refuses a number that is not 1 to 99', () => {
    for (const number of ['0', '-1', '1.5', 'x', String(MAX_PART_NUMBER + 1)]) expect(readForm(form({ number }), ctx)).toBeNull();
  });

  it('refuses bars out of the chart, reversed, or not whole', () => {
    for (const patch of [{ first: '0' }, { last: '25' }, { first: '5', last: '4' }, { first: '' }, { last: '3x' }, { first: '2.5' }]) expect(readForm(form(patch), ctx)).toBeNull();
  });

  it('reads whole numbers only', () => {
    expect(wholeNumber(' 12 ')).toBe(12);
    expect(Number.isNaN(wholeNumber(''))).toBe(true);
    expect(Number.isNaN(wholeNumber('1e3'))).toBe(true);
    expect(Number.isNaN(wholeNumber('-2'))).toBe(true);
  });
});

describe('what is changed', () => {
  const next = (patch: Partial<ReturnType<typeof readForm> & object> = {}) => ({ type: 'solo' as const, number: null, instrument: 'guitar', start: 20, end: 28, ...patch });
  const same = formOfPart(old, range);

  it('nothing when nothing was touched', () => {
    expect(patchOf(old, range, same, next())).toEqual({});
  });

  it('only the fields that differ', () => {
    expect(patchOf(old, range, same, next({ instrument: 'trumpet' }))).toEqual({ instrument: 'trumpet' });
    expect(patchOf(old, range, same, next({ type: 'bridge', number: 2 }))).toEqual({ type: 'bridge', number: 2 });
    expect(patchOf(old, range, same, next({ instrument: null }))).toEqual({ instrument: null });
  });

  it('the limits only when the bar numbers were changed', () => {
    expect(patchOf(old, range, { ...same, last: '16' }, next({ end: 32 }))).toEqual({ start: 20, end: 32 });
    expect(patchOf(old, range, { ...same, first: '12' }, next({ start: 22 }))).toEqual({ start: 22, end: 28 });
  });
});
