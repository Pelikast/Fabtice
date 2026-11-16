// Hand corrections of a beat grid (analysed or entered by hand): tempo
// doubled or halved, first downbeat moved by whole beats, meter changed. Pure
// functions; the beat TIMES never move, only their numbering does, so the
// grid stays on the music.
//
// Signature changes further in the piece (C13, `grid/meters.ts`) keep their
// place in the music through every one of them: they go to the bar line of
// the corrected grid nearest to where they were.

import type { Seconds } from '../model/project';
import type { Meter, TempoMap } from '../model/tempoMap';
import { correctedOrigin, placeMeters } from './meters';
import { isAllowedMeter } from './metronome';
import { BPM_MAX, BPM_MIN, clamp, feltUnits, NUMERATOR_MAX, NUMERATOR_MIN, nominalBpm, sameMeter, timeToBeat } from './tempoMap';

export { correctedOrigin };

/**
 * Renumbers the beats: new beat = factor × old beat + offset (tempo × factor).
 * Meter changes keep their place in the music (the nearest bar line of the
 * new numbering); those before the new first downbeat are dropped, and the
 * first meter in force starts at bar 0, beat 0.
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
  const meters = placeMeters({ ...moved[firstIdx]!.meter }, [], moved.slice(firstIdx + 1));
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

/** The later signature changes of a map, to place again by their position (map beats × `factor`). */
function laterChanges(map: TempoMap, factor = 1) {
  return map.meters.slice(1).map((m) => ({ beat: m.beat * factor, meter: m.meter, bar: m.bar }));
}

/**
 * Beats per bar (2…7) of the first signature, from the first downbeat on.
 * Later signature changes keep their place in the music.
 */
export function withNumerator(map: TempoMap, numerator: number): TempoMap {
  const n = Math.round(clamp(numerator, NUMERATOR_MIN, NUMERATOR_MAX));
  const meter = { numerator: n, denominator: map.meters[0]!.meter.denominator };
  return { origin: correctedOrigin(map.origin), segments: map.segments.map((s) => ({ ...s })), meters: placeMeters(meter, [], laterChanges(map)) };
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

/**
 * The meter of the piece from the metronome panel (lot 4: 5/4, 7/8, 6/8,
 * 12/8…): the first signature, from the first downbeat on. A beat is one
 * unit of the denominator, so going from x/4 to x/8 renumbers the beats: the
 * beat a musician counts (a quarter in 4/4 and 7/8, a dotted quarter in 6/8)
 * stays on the same music (`feltUnits`); the beat times never move. This is
 * the panel's rule for the whole piece; « Changer la signature rythmique »
 * keeps the quarter instead (`grid/meters.ts`). Later signature changes keep
 * their place in the music. An unchanged meter returns the map itself.
 */
export function withMeter(map: TempoMap, meter: Meter): TempoMap {
  if (!isAllowedMeter(meter)) throw new RangeError(`meter ${meter.numerator}/${meter.denominator} not offered`);
  const old = map.meters[0]!.meter;
  if (map.meters.length === 1 && sameMeter(old, meter)) return map;
  const factor = feltUnits(meter) / feltUnits(old);
  const segments = map.segments.map((s) => (factor === 1 ? { ...s } : { time: s.time, beat: s.beat * factor, bpm: s.bpm * factor }));
  const meters = placeMeters({ ...meter }, [], laterChanges(map, factor));
  if (factor === 1 && sameMeter(old, meter) && meters.length === map.meters.length && meters.every((m, i) => m.bar === map.meters[i]!.bar)) return map;
  return { origin: correctedOrigin(map.origin), segments, meters };
}
