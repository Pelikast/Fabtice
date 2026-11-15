// The metronome panel (lot 4): volume, count-in, meter and its grouping,
// strong and weak beats, progressive acceleration. Settings go to the store
// (`AppState.metronome`, saved with the piece) and reach the engine through
// `audio/connect.ts`; « Recommencer » goes straight to the engine, like the
// transport commands.

import { getEngine } from '../audio';
import { withMeter } from '../grid/corrections';
import { clampAcceleration, isAllowedMeter, levelsFromGrouping, meterKey, nextLevel, patternFor } from '../grid/metronome';
import { ACCELERATION_LIMITS, COUNT_IN_BARS, METRONOME_VOLUME, type AccelerationPlan, type MeterPattern, type MetronomeSettings } from '../model/metronome';
import type { Meter } from '../model/tempoMap';
import { appStore, type AppState } from './store';

const get = () => appStore.getState();
const set = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => appStore.setState(patch);

function update(fn: (m: MetronomeSettings) => MetronomeSettings): void {
  set((s) => ({ metronome: fn(s.metronome) }));
}

export function setMetronomeVolume(volume: number): void {
  const v = Math.round(Math.min(METRONOME_VOLUME.max, Math.max(METRONOME_VOLUME.min, volume)) * 100) / 100;
  update((m) => (m.volume === v ? m : { ...m, volume: v }));
}

export function setCountInBars(bars: number): void {
  const n = COUNT_IN_BARS.includes(bars as never) ? (bars as 0 | 1 | 2) : 0;
  update((m) => (m.countInBars === n ? m : { ...m, countInBars: n }));
}

/**
 * The meter of the piece (a grid correction: the first downbeat stays, the
 * beat times never move; going between x/4 and x/8 renumbers the beats, see
 * `grid/corrections.ts#withMeter`). Its accent pattern is the one kept for
 * that meter, or the default.
 */
export function setMeter(meter: Meter): void {
  if (!get().project || !isAllowedMeter(meter)) return;
  set((s) => ({ tempoMap: withMeter(s.tempoMap, meter) }));
}

function setPattern(meter: Meter, pattern: MeterPattern | null): void {
  update((m) => {
    const patterns = { ...m.patterns };
    if (pattern) patterns[meterKey(meter)] = pattern;
    else delete patterns[meterKey(meter)];
    return { ...m, patterns };
  });
}

/** A grouping (« 2+2+3 »): its default strong and weak beats come with it. */
export function setGrouping(meter: Meter, grouping: number[]): void {
  if (grouping.reduce((a, b) => a + b, 0) !== meter.numerator) return;
  setPattern(meter, { grouping: [...grouping], levels: levelsFromGrouping(grouping) });
}

/** One beat's button: accent → normal → soft → silent → accent. */
export function cycleBeatLevel(meter: Meter, index: number): void {
  const p = patternFor(get().metronome.patterns, meter);
  if (index < 0 || index >= p.levels.length) return;
  const levels = p.levels.map((l, i) => (i === index ? nextLevel(l) : l));
  setPattern(meter, { grouping: [...p.grouping], levels });
}

/** « Rétablir » : the meter clicks as by default again. */
export function resetPattern(meter: Meter): void {
  setPattern(meter, null);
}

export function setAcceleration(patch: Partial<AccelerationPlan>): void {
  update((m) => ({ ...m, acceleration: clampAcceleration({ ...m.acceleration, ...patch }) }));
}

export function toggleAcceleration(): void {
  update((m) => ({ ...m, acceleration: { ...m.acceleration, enabled: !m.acceleration.enabled } }));
}

/** « Recommencer » : back to the first step (the engine counts the passes). */
export function restartAcceleration(): void {
  getEngine().restartAcceleration();
}

export { ACCELERATION_LIMITS };
