// Hand corrections of a beat grid (analysed or entered by hand): tempo
// doubled or halved, first downbeat moved by whole beats, meter changed. Pure
// functions; the beat TIMES never move, only their numbering does, so the
// grid stays on the music.

import type { Seconds } from '../model/project';
import type { MeterChange, TempoMap, TempoOrigin } from '../model/tempoMap';
import { BPM_MAX, BPM_MIN, clamp, NUMERATOR_MAX, NUMERATOR_MIN, nominalBpm, timeToBeat } from './tempoMap';

/** Who made the grid once corrected by hand: analysed beats become `corrected`, anything else `manual`. */
export function correctedOrigin(origin: TempoOrigin): TempoOrigin {
  return origin === 'analysis' || origin === 'corrected' ? 'corrected' : 'manual';
}

/**
 * Renumbers the beats: new beat = factor × old beat + offset (tempo × factor).
 * Meter changes keep their place in the music; those before the new first
 * downbeat are dropped, and the first meter in force starts at bar 0, beat 0.
 */
export function renumberBeats(map: TempoMap, factor: number, offset: number): TempoMap {
  if (!(factor > 0)) throw new RangeError(`invalid factor ${factor}`);
  const segments = map.segments.map((s) => ({ time: s.time, beat: s.beat * factor + offset, bpm: s.bpm * factor }));
  // The meter in force at the new beat 0, then the later changes, snapped to whole bars.
  const moved = map.meters.map((m) => ({ beat: m.beat * factor + offset, meter: m.meter }));
  let firstIdx = 0;
  moved.forEach((m, i) => {
    if (m.beat <= 1e-9) firstIdx = i;
  });
  const meters: MeterChange[] = [{ bar: 0, beat: 0, meter: { ...moved[firstIdx]!.meter } }];
  for (const m of moved.slice(firstIdx + 1)) {
    const prev = meters[meters.length - 1]!;
    const bars = Math.max(1, Math.round((m.beat - prev.beat) / prev.meter.numerator));
    meters.push({ bar: prev.bar + bars, beat: prev.beat + bars * prev.meter.numerator, meter: { ...m.meter } });
  }
  return { origin: correctedOrigin(map.origin), segments, meters };
}

/** « Tempo × 2 »: twice as many beats (each beat halved), the first downbeat stays. */
export function doubleTempo(map: TempoMap): TempoMap {
  return renumberBeats(map, 2, 0);
}

/** « Tempo ÷ 2 »: every other beat, keeping the current downbeats. */
export function halveTempo(map: TempoMap): TempoMap {
  return renumberBeats(map, 0.5, 0);
}

/** Moves the first downbeat by `beats` whole beats (+1 = one beat later). Bar lines move with it. */
export function shiftDownbeat(map: TempoMap, beats: number): TempoMap {
  return renumberBeats(map, 1, -Math.round(beats));
}

/** « Premier temps ici » on an analysed grid: the beat nearest `time` becomes the first downbeat. */
export function downbeatNear(map: TempoMap, time: Seconds): TempoMap {
  return shiftDownbeat(map, Math.round(timeToBeat(map, time)));
}

/** Beats per bar (2…7), from the first downbeat on. Meter changes further on are dropped. */
export function withNumerator(map: TempoMap, numerator: number): TempoMap {
  const n = Math.round(clamp(numerator, NUMERATOR_MIN, NUMERATOR_MAX));
  const meter = { numerator: n, denominator: map.meters[0]!.meter.denominator };
  return { origin: correctedOrigin(map.origin), segments: map.segments.map((s) => ({ ...s })), meters: [{ bar: 0, beat: 0, meter }] };
}

/** The tempo ×2 correction stays within the tempo range a piece can have. */
export function canDoubleTempo(map: TempoMap, duration?: Seconds): boolean {
  return nominalBpm(map, duration) * 2 <= BPM_MAX;
}

export function canHalveTempo(map: TempoMap, duration?: Seconds): boolean {
  return nominalBpm(map, duration) / 2 >= BPM_MIN;
}

/** True for a grid made of analysed beats (one segment per beat), corrected or not. */
export function isBeatGrid(map: TempoMap): boolean {
  return map.origin === 'analysis' || map.origin === 'corrected';
}
