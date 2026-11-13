// Values computed from the state, and the stepping rules of the transport
// buttons. Pure functions, tested in `derived.test.ts`.

import { clamp, nominalBpm } from '../grid/tempoMap';
import type { TempoMap } from '../model/tempoMap';
import type { AppState } from './store';

export const SEMITONES = { min: -12, max: 12 } as const;
export const CENTS = { min: -50, max: 50 } as const;
/** Live tempo ratio range (the light engine handles 0.25…2 cleanly). */
export const TEMPO_RATIO = { min: 0.25, max: 2 } as const;
/** One press of − or + on the tempo: 5 BPM, or 5 % while the tempo is unknown. */
export const TEMPO_STEP_BPM = 5;
export const TEMPO_STEP_PERCENT = 5;

/** True once a tempo was entered (or analysed): the transport then speaks in BPM. */
export function isTempoKnown(map: TempoMap): boolean {
  return map.origin !== 'default';
}

/** The tempo of the piece as recorded, or null while unknown. */
export function originalBpm(state: Pick<AppState, 'tempoMap' | 'project'>): number | null {
  if (!isTempoKnown(state.tempoMap)) return null;
  return nominalBpm(state.tempoMap, state.project?.duration);
}

/** The tempo being played: original × ratio, or null while the original is unknown. */
export function targetBpm(state: Pick<AppState, 'tempoMap' | 'project' | 'playback'>): number | null {
  const bpm = originalBpm(state);
  return bpm === null ? null : bpm * state.playback.tempoRatio;
}

/**
 * Ratio after one press of − (direction −1) or + (+1).
 * With a known tempo: ±5 BPM from the rounded current tempo, stopping on the
 * original tempo when reaching it (or landing within half a step of it), so
 * the user can always come back to it.
 * Without: ±5 % of the original speed, on multiples of 5 %.
 */
export function steppedTempoRatio(ratio: number, direction: 1 | -1, original: number | null): number {
  if (original === null || !(original > 0)) {
    const percent = Math.round(ratio * 100);
    const next = direction > 0
      ? Math.floor(percent / TEMPO_STEP_PERCENT) * TEMPO_STEP_PERCENT + TEMPO_STEP_PERCENT
      : Math.ceil(percent / TEMPO_STEP_PERCENT) * TEMPO_STEP_PERCENT - TEMPO_STEP_PERCENT;
    return clamp(next / 100, TEMPO_RATIO.min, TEMPO_RATIO.max);
  }
  const current = original * ratio;
  let next = Math.round(current) + direction * TEMPO_STEP_BPM;
  // Reaching or passing the original (or landing within half a step of it) stops on it.
  const half = TEMPO_STEP_BPM / 2;
  const reaches = direction > 0
    ? current < original - 1e-9 && next > original - half
    : current > original + 1e-9 && next < original + half;
  if (reaches) next = original;
  return clamp(next / original, TEMPO_RATIO.min, TEMPO_RATIO.max);
}

export function clampSemitones(n: number): number {
  return Math.round(clamp(n, SEMITONES.min, SEMITONES.max));
}

export function clampCents(n: number): number {
  return Math.round(clamp(n, CENTS.min, CENTS.max));
}

/** Total transposition in semitones, as the engine's pitch shifters take it. */
export function totalTransposition(semitones: number, cents: number): number {
  return semitones + cents / 100;
}
