// « Changer la signature rythmique » (C13): what the window's boxes mean, as pure functions (the window is
// `components/MeterDialog.tsx`). The commands and their rules are `store/meterActions.ts` and `grid/meters.ts`.

import { METER_DENOMINATORS, METER_NUMERATOR, isValidMeter, type Meter } from '../model/tempoMap';
import { removeMeterChange, setMeterForBar, setMeterFrom } from '../store/meterActions';

export type MeterScope = 'from' | 'bar';

export const MEASURE_DENOMINATORS = METER_DENOMINATORS;

/**
 * The top figure as typed: a whole number from 1 to 64 (spaces around it are ignored), else null: empty, 0,
 * 65, a decimal, a sign, a letter. The box is calm about what it accepts, it never corrects silently.
 */
export function parseNumerator(text: string): number | null {
  const s = text.trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= METER_NUMERATOR.min && n <= METER_NUMERATOR.max ? n : null;
}

/** The signature the boxes spell, or null while the top figure is not valid. */
export function meterOfForm(numeratorText: string, denominator: number): Meter | null {
  const numerator = parseNumerator(numeratorText);
  if (numerator === null) return null;
  const meter = { numerator, denominator };
  return isValidMeter(meter) ? meter : null;
}

/** How many quarter notes a bar of `meter` lasts (« la noire reste la noire »): 6/8 is 3, 7/8 is 3.5, 5/4 is 5. */
export function quartersPerBar(meter: Meter): number {
  return (meter.numerator * 4) / meter.denominator;
}

const WORDS = ['', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];

/** The length of a bar in quarters, as it reads in a sentence: « trois noires », « trois noires et demie », « une demi-noire », « 0,75 noire », « 21 noires ». */
export function quarterLengthText(quarters: number): string {
  const unit = quarters >= 2 ? 'noires' : 'noire';
  const whole = Math.floor(quarters);
  if (quarters === 0.5) return 'une demi-noire';
  if (Number.isInteger(quarters) && quarters >= 1 && quarters <= 16) return `${WORDS[quarters]} ${unit}`;
  if (quarters - whole === 0.5 && whole >= 1 && whole <= 16) return `${WORDS[whole]} ${unit} et demie`;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3, useGrouping: false }).format(quarters)} ${unit}`;
}

/** The hint about the rule is shown only when the bottom figure is not the first signature's. */
export function showsQuarterHint(chosen: Meter | null, first: Meter): boolean {
  return chosen !== null && chosen.denominator !== first.denominator;
}

/**
 * Applies what the window asks, as one undo step (`history.what.meter`). Returns whether the grid changed: a
 * signature already in force changes nothing (and makes no undo step).
 */
export function applyMeter(bar: number, meter: Meter, scope: MeterScope): boolean {
  return scope === 'bar' ? setMeterForBar(bar, meter) : setMeterFrom(bar, meter);
}

export { removeMeterChange };
