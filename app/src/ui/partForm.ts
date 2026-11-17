// The form of « Modifier la partie » / « Ajouter une partie » (C14), as pure
// functions (tested in partForm.test.ts): what the fields hold, what they
// mean, and what is changed (only what the user touched: the limits of a part
// are not rewritten when its bar numbers are left as they were).

import { limitsFromNumbers, partBarNumbers, type PartBars } from '../chart/structureDisplay';
import { PART_INSTRUMENT_PATTERN, PART_TYPES, PART_TYPES_BY_MODE, type PartType, type StructureMode, type StructurePart } from '../model/structure';
import type { Seconds } from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import type { PartFields } from '../store/structureActions';

/** What the fields of the window hold (text, as typed). */
export interface PartForm {
  type: PartType;
  /** '' = no number. */
  number: string;
  /** '' = no instrument. */
  instrument: string;
  /** Bar numbers as musicians count them. */
  first: string;
  last: string;
}

/** The kinds of part in the order the window offers them: those of the mode first, the others after. */
export function typesInOrder(mode: StructureMode): { first: readonly PartType[]; others: readonly PartType[] } {
  const first = PART_TYPES_BY_MODE[mode];
  return { first, others: PART_TYPES.filter((p) => !first.includes(p)) };
}

/** The most the number of a part can be (« Solo 12 » is already a lot). */
export const MAX_PART_NUMBER = 99;

/** The numbers offered in the list: 1 to 9, and the part's own when it is higher. */
export function numberChoices(current: string): number[] {
  const n = Number(current);
  const base = Array.from({ length: 9 }, (_, i) => i + 1);
  return Number.isInteger(n) && n > 9 && n <= MAX_PART_NUMBER ? [...base, n] : base;
}

/** The fields of a part. */
export function formOfPart(part: Pick<StructurePart, 'type' | 'number' | 'instrument'>, range: PartBars): PartForm {
  const numbers = partBarNumbers(range);
  return {
    type: part.type,
    number: part.number === null ? '' : String(part.number),
    instrument: part.instrument ?? '',
    first: String(numbers.first),
    last: String(numbers.last),
  };
}

/** The context the limits are read in. */
export interface FormContext {
  map: TempoMap;
  duration: Seconds;
  chart: { firstBar: number; lastBar: number };
}

/** The part the fields describe, or null when they do not (bar numbers out of the chart, reversed, not whole). */
export function readForm(form: PartForm, ctx: FormContext): PartFields | null {
  const number = form.number === '' ? null : Number(form.number);
  if (number !== null && !(Number.isInteger(number) && number >= 1 && number <= MAX_PART_NUMBER)) return null;
  if (!PART_TYPES.includes(form.type)) return null;
  const instrument = form.instrument === '' ? null : form.instrument;
  if (instrument !== null && !PART_INSTRUMENT_PATTERN.test(instrument)) return null;
  const limits = limitsFromNumbers(ctx.map, { first: wholeNumber(form.first), last: wholeNumber(form.last) }, ctx.chart, ctx.duration);
  if (!limits) return null;
  return { type: form.type, number, instrument, ...limits };
}

/** A whole number from what was typed; NaN for anything else (so that « 3x » or « » is not a bar). */
export function wholeNumber(text: string): number {
  return /^\s*\d{1,5}\s*$/.test(text) ? Number(text) : NaN;
}

/**
 * What to change in `old` so that it becomes `next`: only the fields that
 * differ; the limits only when the bar numbers differ from the part's own.
 * Empty when nothing changed.
 */
export function patchOf(old: StructurePart, oldRange: PartBars, form: PartForm, next: PartFields): Partial<PartFields> {
  const patch: Partial<PartFields> = {};
  if (next.type !== old.type) patch.type = next.type;
  if (next.number !== old.number) patch.number = next.number;
  if (next.instrument !== old.instrument) patch.instrument = next.instrument;
  const was = partBarNumbers(oldRange);
  if (wholeNumber(form.first) !== was.first || wholeNumber(form.last) !== was.last) {
    patch.start = next.start;
    patch.end = next.end;
  }
  return patch;
}
