// The advanced metronome as pure functions (lot 4): meters and their
// groupings, the level of each beat, the click track the engine plays, the
// count-in before playback, the steps of the progressive acceleration.
// All times are source seconds (see `model/tempoMap.ts`).

import type { ClickTrack } from '../audio/AudioEngine';
import { ACCELERATION_LIMITS, type AccelerationPlan, type BeatLevel, type MeterPattern } from '../model/metronome';
import type { Seconds } from '../model/project';
import type { Meter, TempoMap } from '../model/tempoMap';
import { BEAT_EPSILON, barToBeat, beatToBar, beatToTime, clamp, meterAtBar, timeToBar, timeToBeat } from './tempoMap';

/** Codes of `ClickTrack.accents`: what the engine plays for each level (a silent beat has no click at all). */
export const CLICK_NORMAL = 0;
export const CLICK_ACCENT = 1;
export const CLICK_SOFT = 2;

const LEVEL_CODE: Record<Exclude<BeatLevel, 'silent'>, number> = { accent: CLICK_ACCENT, normal: CLICK_NORMAL, soft: CLICK_SOFT };

/** Meters offered by the metronome panel, in the order shown. */
export const COMMON_METERS: readonly Meter[] = [
  { numerator: 2, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 4, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 6, denominator: 4 },
  { numerator: 7, denominator: 4 },
  { numerator: 5, denominator: 8 },
  { numerator: 6, denominator: 8 },
  { numerator: 7, denominator: 8 },
  { numerator: 9, denominator: 8 },
  { numerator: 12, denominator: 8 },
];

/** Numerators and denominators a meter may have. */
export const METER_NUMERATOR = { min: 2, max: 12 } as const;
export const METER_DENOMINATORS: readonly number[] = [4, 8];

export function meterKey(m: Meter): string {
  return `${m.numerator}/${m.denominator}`;
}

export function isAllowedMeter(m: Meter): boolean {
  return Number.isInteger(m.numerator) && m.numerator >= METER_NUMERATOR.min && m.numerator <= METER_NUMERATOR.max && METER_DENOMINATORS.includes(m.denominator);
}

/** 6/8, 9/8, 12/8: the beat felt is a dotted quarter (three eighths). */
export function isCompound(m: Meter): boolean {
  return m.denominator === 8 && m.numerator >= 6 && m.numerator % 3 === 0;
}

/**
 * Grid beats per beat a musician counts (and a beat tracker finds): 1 in x/4,
 * 3 in 6/8, 9/8, 12/8 (dotted quarter), 2 in the other x/8 (a quarter). The
 * tempo is shown and typed per felt beat (`store/derived.ts`), and changing
 * the meter renumbers the beats so that the felt beat stays on the music
 * (`grid/corrections.ts#withMeter`).
 */
export function feltUnits(m: Meter): number {
  if (m.denominator !== 8) return 1;
  return isCompound(m) ? 3 : 2;
}

/** Ordered splits of `n` into parts of 2 and 3. */
function compositions(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  for (const p of [2, 3]) if (n - p >= 0) for (const rest of compositions(n - p)) out.push([p, ...rest]);
  return out;
}

/** How a bar of this meter is grouped unless the user says otherwise. */
export function defaultGrouping(m: Meter): number[] {
  const n = m.numerator;
  if (isCompound(m)) return Array.from({ length: n / 3 }, () => 3);
  if (m.denominator === 4) {
    if (n <= 4) return [n];
    if (n === 5) return [3, 2];
    if (n === 6) return [3, 3];
    if (n === 7) return [4, 3];
  }
  if (n <= 4) return [n];
  if (n === 5) return [3, 2];
  if (n === 7) return [2, 2, 3];
  if (n === 8) return [3, 3, 2];
  // longer bars: threes, then twos at the end
  const g: number[] = [];
  let left = n;
  while (left > 0) {
    const p = left === 4 || left === 2 ? 2 : 3;
    g.push(p);
    left -= p;
  }
  return g;
}

/**
 * The groupings offered for a meter: none below five beats (one group), else
 * the default first, then the other splits into twos and threes, at most six.
 */
export function groupingChoices(m: Meter): number[][] {
  if (m.numerator < 5) return [];
  const def = defaultGrouping(m);
  const all = compositions(m.numerator).sort((a, b) => a.length - b.length);
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const rest = all.filter((g) => !same(g, def));
  const out = [def, ...rest].slice(0, 6);
  // 7/4 as 4+3 is a grouping of its own (not twos and threes): offer 3+4 as well
  if (m.numerator === 7 && m.denominator === 4) return [[4, 3], [3, 4], [2, 2, 3], [3, 2, 2], [2, 3, 2]];
  return out;
}

export function groupingText(grouping: readonly number[]): string {
  return grouping.join('+');
}

/**
 * Default levels for a grouping: the first beat of the bar accented; with
 * one group every other beat normal; with several, the first beat of each
 * group normal and the beats inside a group soft (so the grouping is heard).
 */
export function levelsFromGrouping(grouping: readonly number[]): BeatLevel[] {
  const out: BeatLevel[] = [];
  const several = grouping.length > 1;
  grouping.forEach((size, gi) => {
    for (let k = 0; k < size; k++) {
      if (gi === 0 && k === 0) out.push('accent');
      else if (k === 0 || !several) out.push('normal');
      else out.push('soft');
    }
  });
  return out;
}

export function defaultPattern(m: Meter): MeterPattern {
  const grouping = defaultGrouping(m);
  return { grouping, levels: levelsFromGrouping(grouping) };
}

/** True when the pattern fits the meter (the groups add up, one level per beat). */
export function isValidPattern(p: unknown, m: Meter): p is MeterPattern {
  if (typeof p !== 'object' || p === null) return false;
  const q = p as MeterPattern;
  if (!Array.isArray(q.grouping) || !Array.isArray(q.levels)) return false;
  if (!q.grouping.every((g) => Number.isInteger(g) && g >= 1)) return false;
  if (q.grouping.reduce((s, g) => s + g, 0) !== m.numerator || q.levels.length !== m.numerator) return false;
  return q.levels.every((l) => l === 'accent' || l === 'normal' || l === 'soft' || l === 'silent');
}

/** Parses a meter key (« 7/8 »); null when it is not one. */
export function parseMeterKey(key: string): Meter | null {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(key);
  if (!m) return null;
  return { numerator: Number(m[1]), denominator: Number(m[2]) };
}

/** The pattern in force for a meter: the user's when it fits, else the default. */
export function patternFor(patterns: Readonly<Record<string, MeterPattern>>, m: Meter): MeterPattern {
  const p = patterns[meterKey(m)];
  return p && isValidPattern(p, m) ? p : defaultPattern(m);
}

/** Next level when a beat's button is pressed: accent → normal → soft → silent → accent. */
export function nextLevel(l: BeatLevel): BeatLevel {
  return l === 'accent' ? 'normal' : l === 'normal' ? 'soft' : l === 'soft' ? 'silent' : 'accent';
}

/**
 * The click track of the whole piece: one click per beat of the grid in
 * [from, to), each at the level its place in the bar has in the pattern of
 * the bar's meter; silent beats have no click.
 */
export function metronomeClickTrack(map: TempoMap, from: Seconds, to: Seconds, patterns: Readonly<Record<string, MeterPattern>>): ClickTrack {
  const times: number[] = [];
  const levels: number[] = [];
  const cache = new Map<string, MeterPattern>();
  const levelOf = (meter: Meter, index: number): BeatLevel => {
    const key = meterKey(meter);
    let p = cache.get(key);
    if (!p) cache.set(key, (p = patternFor(patterns, meter)));
    return p.levels[index] ?? 'normal';
  };
  let beat = Math.ceil(timeToBeat(map, from) - BEAT_EPSILON);
  for (let t = beatToTime(map, beat); t < to && times.length < 1_000_000; t = beatToTime(map, ++beat)) {
    if (t < from) continue;
    const pos = beatToBar(map, beat);
    const index = Math.round(pos.beatInBar);
    const level = levelOf(pos.meter, index >= pos.meter.numerator ? 0 : index);
    if (level === 'silent') continue;
    times.push(t);
    levels.push(LEVEL_CODE[level]);
  }
  return { times: Float64Array.from(times), accents: Uint8Array.from(levels) };
}

/** Count-in clicks, as the engine takes them (see `AudioEngine.PlayOptions`). */
export interface CountIn {
  /** Source seconds BEFORE the start position, one per click (largest first). */
  offsets: Float64Array;
  /** `CLICK_*` codes, same length. */
  levels: Uint8Array;
}

/**
 * « Décompte »: `bars` bars of clicks before `start`, in the rhythm of the
 * grid there, so the music (and the metronome, when it is on) comes in on
 * the beat. The tempo is the grid's over the bar that follows `start` (the
 * loop's own tempo when playback starts at a loop); the engine plays it at
 * the live tempo. Every beat clicks, at least softly (a silent beat of the
 * pattern still has to be counted). Null for no count-in.
 */
export function countInClicks(map: TempoMap, start: Seconds, bars: number, patterns: Readonly<Record<string, MeterPattern>>): CountIn | null {
  if (!(bars >= 1)) return null;
  const startBeat = timeToBeat(map, start);
  const pos = timeToBar(map, start);
  const meter = pos.meter;
  const n = meter.numerator;
  const spb = (beatToTime(map, startBeat + n) - start) / n;
  if (!(spb > 0)) return null;
  const pattern = patternFor(patterns, meter);
  const barStart = barToBeat(map, pos.bar);
  const total = bars * n;
  const offsets: number[] = [];
  const levels: number[] = [];
  const first = Math.ceil(startBeat - total - BEAT_EPSILON * 10);
  for (let j = first; j < startBeat - BEAT_EPSILON * 10; j++) {
    const index = ((Math.round(j - barStart) % n) + n) % n;
    const level = pattern.levels[index] ?? 'normal';
    offsets.push((startBeat - j) * spb);
    levels.push(level === 'silent' ? CLICK_SOFT : LEVEL_CODE[level]);
  }
  // A start between two beats: the count still has a whole number of bars of beats before it.
  if (offsets.length === 0) return null;
  return { offsets: Float64Array.from(offsets), levels: Uint8Array.from(levels) };
}

// ---------------------------------------------------------------- progressive acceleration

/** The plan with every number in its range and the start below the target. */
export function clampAcceleration(p: AccelerationPlan): AccelerationPlan {
  const L = ACCELERATION_LIMITS;
  const target = Math.round(clamp(p.targetPercent, L.targetPercent.min, L.targetPercent.max));
  const start = Math.round(clamp(p.startPercent, L.startPercent.min, Math.min(L.startPercent.max, target - 1)));
  return {
    enabled: p.enabled,
    startPercent: start,
    stepPercent: Math.round(clamp(p.stepPercent, L.stepPercent.min, L.stepPercent.max)),
    everyRepeats: Math.round(clamp(p.everyRepeats, L.everyRepeats.min, L.everyRepeats.max)),
    targetPercent: target,
  };
}

/** The percentages the loop goes through, start to target (the last one is the target). */
export function accelerationSteps(plan: AccelerationPlan): number[] {
  const p = clampAcceleration(plan);
  const out: number[] = [];
  for (let v = p.startPercent; v < p.targetPercent - 1e-9 && out.length < 200; v += p.stepPercent) out.push(v);
  out.push(p.targetPercent);
  return out;
}

/** Tempo factor (of the transport's tempo) at step `step` (0 = the start); the last step stays. */
export function accelerationFactor(plan: AccelerationPlan, step: number): number {
  const steps = accelerationSteps(plan);
  return steps[Math.max(0, Math.min(steps.length - 1, Math.floor(step)))]! / 100;
}

export interface AccelerationStatus {
  /** 0-based step, and how many there are. */
  step: number;
  steps: number;
  percent: number;
  atTarget: boolean;
}

export function accelerationStatus(plan: AccelerationPlan, step: number): AccelerationStatus {
  const steps = accelerationSteps(plan);
  const k = Math.max(0, Math.min(steps.length - 1, Math.floor(step)));
  return { step: k, steps: steps.length, percent: steps[k]!, atTarget: k === steps.length - 1 };
}

/**
 * What the engine does on each pass, as a pure schedule (the engine's own
 * counting is checked against it): the step heard during pass `pass`
 * (0 = the first pass after the plan starts).
 */
export function stepOfPass(plan: AccelerationPlan, pass: number): number {
  const p = clampAcceleration(plan);
  const last = accelerationSteps(p).length - 1;
  return Math.min(last, Math.floor(Math.max(0, pass) / p.everyRepeats));
}

/** The meter of the first bar, which the panel shows and changes. */
export function firstMeter(map: TempoMap): Meter {
  return meterAtBar(map, 0);
}
