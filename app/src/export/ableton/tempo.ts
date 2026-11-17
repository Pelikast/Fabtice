// The tempo curve as Live plays it, and the envelope that makes Live play ours.
//
// What Live does (ALS-FORMAT.md, « Courbe de tempo »):
//   - the tempo is the automation envelope of the main track's Tempo, in beats
//     (quarter notes); its first point sits at -63072000 and holds the value
//     in force before the first real point;
//   - between two points the value is interpolated linearly; two points at the
//     same beat make a vertical step (Live writes steps that way itself);
//   - Live's timeline reads the curve sixteenth note by sixteenth note: a
//     change between two sixteenths only takes effect at the next one (dawtool,
//     reverse-engineered and checked against Live);
//   - values are 32-bit floats, from 20 to 999 BPM.
//
// So the envelope written here is made of steps on sixteenth notes only: then
// the linear reading and the sixteenth-by-sixteenth reading agree exactly, and
// every sixteenth falls at the time of the input curve. A change of the input
// between two sixteenths (a beat of an x/32 bar) is averaged over its
// sixteenth. The float32 rounding of each value is compensated on the next
// segment, so it never accumulates (a few nanoseconds per segment at most).

import type { AbletonWarning, LiveTempoPoint, TempoSegmentInput } from './types';

export const LIVE_TEMPO_MIN = 20;
export const LIVE_TEMPO_MAX = 999;
/** Live's tempo resolution on the timeline: a sixteenth note, in quarters. */
export const SIXTEENTH = 0.25;
/** Time of the « before everything » point Live writes first in every envelope (beats). */
export const ENVELOPE_START = -63072000;

const EPS = 1e-9;

function onSixteenth(q: number): boolean {
  return Math.abs(q / SIXTEENTH - Math.round(q / SIXTEENTH)) < EPS;
}

/** Exact seconds at `q` of a piecewise-constant curve (segments sorted, first at 0). */
function exactTime(segments: readonly TempoSegmentInput[], q: number): number {
  let t = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    const end = i + 1 < segments.length ? segments[i + 1]!.quarters : Infinity;
    if (q <= s.quarters) break;
    t += ((Math.min(q, end) - s.quarters) * 60) / s.quarterBpm;
    if (q <= end) break;
  }
  return t;
}

/**
 * The tempo steps to write, from the input curve: on sixteenth notes only,
 * values in float32 within Live's range, the first at quarter 0.
 */
export function liveTempoSteps(input: readonly TempoSegmentInput[], warnings: AbletonWarning[] = []): LiveTempoPoint[] {
  if (input.length === 0) throw new RangeError('tempo: at least one segment');
  if (Math.abs(input[0]!.quarters) > EPS) throw new RangeError('tempo: the first segment must start at quarter 0');
  for (let i = 0; i < input.length; i++) {
    const s = input[i]!;
    if (!Number.isFinite(s.quarters) || !Number.isFinite(s.quarterBpm) || s.quarterBpm <= 0) {
      throw new RangeError(`tempo: invalid segment ${i}`);
    }
    if (i > 0 && s.quarters <= input[i - 1]!.quarters) throw new RangeError('tempo: segments must be sorted, without duplicates');
  }

  // 1. Clamp to Live's range (reported), merge equal neighbours.
  const segs: TempoSegmentInput[] = [];
  for (const s of input) {
    const bpm = Math.min(LIVE_TEMPO_MAX, Math.max(LIVE_TEMPO_MIN, s.quarterBpm));
    if (bpm !== s.quarterBpm) warnings.push({ kind: 'tempo-clamped', quarters: s.quarters, quarterBpm: s.quarterBpm, written: bpm });
    const q = segs.length === 0 ? 0 : s.quarters;
    if (segs.length > 0 && segs[segs.length - 1]!.quarterBpm === bpm) continue;
    segs.push({ quarters: q, quarterBpm: bpm });
  }

  // 2. Breakpoints on sixteenths: an unaligned change gives the two sixteenths around it.
  const marks = new Set<number>([0]);
  const unaligned = new Map<number, number[]>();
  for (const s of segs.slice(1)) {
    if (onSixteenth(s.quarters)) {
      marks.add(Math.round(s.quarters / SIXTEENTH) * SIXTEENTH);
    } else {
      const a = Math.floor(s.quarters / SIXTEENTH) * SIXTEENTH;
      marks.add(a);
      marks.add(a + SIXTEENTH);
      unaligned.set(a, [...(unaligned.get(a) ?? []), s.quarters]);
    }
  }
  for (const [a, inner] of unaligned) {
    const ta = exactTime(segs, a);
    const tb = exactTime(segs, a + SIXTEENTH);
    let error = 0;
    for (const q of inner) error = Math.max(error, Math.abs(exactTime(segs, q) - (ta + ((q - a) / SIXTEENTH) * (tb - ta))));
    warnings.push({ kind: 'tempo-unaligned', quarters: inner[0]!, error });
  }
  const points = [...marks].sort((x, y) => x - y);

  // 3. One value per interval: the one that takes it exactly from one mark to the next.
  const raw: LiveTempoPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    let bpm: number;
    if (i + 1 < points.length) {
      const q = points[i + 1]!;
      bpm = (60 * (q - p)) / (exactTime(segs, q) - exactTime(segs, p));
    } else {
      bpm = segs[segs.length - 1]!.quarterBpm;
    }
    const last = raw[raw.length - 1];
    if (last && Math.abs(last.quarterBpm - bpm) <= 1e-12 * bpm) continue;
    raw.push({ quarters: p, quarterBpm: bpm });
  }

  // 4. float32 values, each one correcting the rounding of the ones before.
  const out: LiveTempoPoint[] = [];
  let t = 0;
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i]!.quarters;
    let bpm: number;
    if (i + 1 < raw.length) {
      const q = raw[i + 1]!.quarters;
      bpm = Math.fround((60 * (q - p)) / (exactTime(segs, q) - t));
      bpm = Math.fround(Math.min(LIVE_TEMPO_MAX, Math.max(LIVE_TEMPO_MIN, bpm)));
      t += ((q - p) * 60) / bpm;
    } else {
      bpm = Math.fround(raw[i]!.quarterBpm);
    }
    out.push({ quarters: p, quarterBpm: bpm });
  }
  return out;
}

/** Seconds at quarter `q` of the steps as Live plays them. */
export function quartersToSeconds(steps: readonly LiveTempoPoint[], q: number): number {
  if (q <= 0) return (q * 60) / steps[0]!.quarterBpm;
  let t = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    const end = i + 1 < steps.length ? steps[i + 1]!.quarters : Infinity;
    t += ((Math.min(q, end) - s.quarters) * 60) / s.quarterBpm;
    if (q <= end) break;
  }
  return t;
}

/** Quarter at `seconds` of the steps as Live plays them. */
export function secondsToQuarters(steps: readonly LiveTempoPoint[], seconds: number): number {
  if (seconds <= 0) return (seconds * steps[0]!.quarterBpm) / 60;
  let t = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    const end = i + 1 < steps.length ? steps[i + 1]!.quarters : Infinity;
    const dt = ((end - s.quarters) * 60) / s.quarterBpm;
    if (seconds <= t + dt) return s.quarters + ((seconds - t) * s.quarterBpm) / 60;
    t += dt;
  }
  return Infinity;
}

/** The envelope's events: Live's first point, then two points (old, new value) at each step. */
export function tempoEvents(steps: readonly LiveTempoPoint[]): { time: number; value: number }[] {
  const events = [{ time: ENVELOPE_START, value: steps[0]!.quarterBpm }];
  for (let i = 1; i < steps.length; i++) {
    events.push({ time: steps[i]!.quarters, value: steps[i - 1]!.quarterBpm });
    events.push({ time: steps[i]!.quarters, value: steps[i]!.quarterBpm });
  }
  return events;
}

/** Live's code of a time signature: numerator − 1 + 99 × log2(denominator) (4/4 = 201, 6/8 = 302). */
export function timeSignatureCode(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || numerator < 1 || numerator > 99) throw new RangeError(`time signature numerator out of Live's range (1-99): ${numerator}`);
  const log = [1, 2, 4, 8, 16].indexOf(denominator);
  if (log < 0) throw new RangeError(`time signature denominator not offered by Live (1, 2, 4, 8, 16): ${denominator}`);
  return numerator - 1 + 99 * log;
}

/** The reverse of `timeSignatureCode`. */
export function decodeTimeSignature(code: number): { numerator: number; denominator: number } {
  return { numerator: (code % 99) + 1, denominator: 2 ** Math.floor(code / 99) };
}
