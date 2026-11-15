// The advanced metronome (lot 4), kept with the piece (document version 4).
//
// What the metronome counts is the grid in force (`ProjectDocument.tempoMap`):
// one click per beat of the meter (a beat is one unit of the denominator, see
// `model/tempoMap.ts`), so a 7/8 bar clicks seven eighths and a 6/8 bar six.
// How each beat of the bar sounds is set here, per meter: the grouping
// (7/8 as 2+2+3 or 3+2+2…) and one level per beat (accent, normal, soft,
// silent). Only the meters the user changed are stored; the others use the
// defaults of `grid/metronome.ts#defaultPattern`.
//
// The on/off switch stays in `PlaybackSettings.metronome` (lot 1).

/** How one beat of the bar clicks. */
export type BeatLevel = 'accent' | 'normal' | 'soft' | 'silent';
export const BEAT_LEVELS: readonly BeatLevel[] = ['accent', 'normal', 'soft', 'silent'];

/** How the bars of one meter are counted. Invariants: `grouping` sums to the numerator, `levels.length` is the numerator. */
export interface MeterPattern {
  /** Groups of beats, in order (« 2+2+3 »). One group = the whole bar. */
  grouping: number[];
  /** One level per beat of the bar. */
  levels: BeatLevel[];
}

/**
 * « Accélération progressive » of the loop: the loop starts at `startPercent`
 * of the tempo set in the transport and gains `stepPercent` every
 * `everyRepeats` passes, until `targetPercent`, where it stays. Only acts while
 * the loop is on.
 */
export interface AccelerationPlan {
  enabled: boolean;
  /** 25…100, below the target. */
  startPercent: number;
  /** 1…25. */
  stepPercent: number;
  /** 1…16 passes of the loop per step. */
  everyRepeats: number;
  /** 30…150 (100 = the tempo set in the transport). */
  targetPercent: number;
}

export interface MetronomeSettings {
  /** Click level, 0…1 (linear gain on the click sound). */
  volume: number;
  /** « Décompte » before playback starts: 0 (none), 1 or 2 bars of clicks. */
  countInBars: 0 | 1 | 2;
  /** Patterns the user set, by meter key (« 7/8 »: `grid/metronome.ts#meterKey`). */
  patterns: Record<string, MeterPattern>;
  acceleration: AccelerationPlan;
}

export const METRONOME_VOLUME = { min: 0, max: 1, default: 0.7 } as const;
export const COUNT_IN_BARS: readonly (0 | 1 | 2)[] = [0, 1, 2];
export const ACCELERATION_LIMITS = {
  startPercent: { min: 25, max: 100 },
  stepPercent: { min: 1, max: 25 },
  everyRepeats: { min: 1, max: 16 },
  targetPercent: { min: 30, max: 150 },
} as const;

export function defaultAcceleration(): AccelerationPlan {
  return { enabled: false, startPercent: 70, stepPercent: 5, everyRepeats: 2, targetPercent: 100 };
}

export function defaultMetronome(): MetronomeSettings {
  return { volume: METRONOME_VOLUME.default, countInBars: 0, patterns: {}, acceleration: defaultAcceleration() };
}
