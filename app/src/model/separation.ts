// Separation of the instruments (lot 3): what a separation produced and how
// the piece shows it. Plain, serialisable data (document version 3).
//
// The tracks of the store (`AppState.tracks`) are always the ones SHOWN and
// PLAYED. After a separation they are the instrument tracks, and the
// whole-piece track waits « aside » with its mix; « Revenir au morceau
// entier » swaps the two sets (nothing is computed again, nothing is lost),
// and « Revoir les instruments » swaps them back.

import type { Track, TrackRole } from './project';

/**
 * What a separated track holds. The first seven are the instruments of the
 * new-piece dialog (DESIGN.md hues); the others are detailed parts that a
 * listed tool may provide (a drum kit split, a saxophone…). The app only ever
 * offers what a tool of the current list provides (`separation/models.ts`).
 */
export type StemId =
  | 'vocals'
  | 'drums'
  | 'bass'
  | 'guitar'
  | 'piano'
  | 'winds'
  | 'other'
  // detailed parts
  | 'kick'
  | 'snare'
  | 'hihat'
  | 'toms'
  | 'cymbals'
  | 'saxophone'
  | 'brass';

export const STEM_IDS: readonly StemId[] = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'winds', 'other', 'kick', 'snare', 'hihat', 'toms', 'cymbals', 'saxophone', 'brass'];

/** The instruments offered in the new-piece dialog, in the order of the mockup. */
export const MAIN_STEMS: readonly StemId[] = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'winds', 'other'];

/** Hue of each part (DESIGN.md: the seven track tokens); detailed parts take their family's. */
export const STEM_ROLE: Record<StemId, Exclude<TrackRole, 'morceau'>> = {
  vocals: 'voix',
  drums: 'batterie',
  bass: 'basse',
  guitar: 'guitare',
  piano: 'piano',
  winds: 'vents',
  other: 'autres',
  kick: 'batterie',
  snare: 'batterie',
  hihat: 'batterie',
  toms: 'batterie',
  cymbals: 'batterie',
  saxophone: 'vents',
  brass: 'vents',
};

export function isStemId(v: unknown): v is StemId {
  return typeof v === 'string' && (STEM_IDS as readonly string[]).includes(v);
}

/** Where a separation was computed. `cpu` after a fallback keeps the SAME tool (quality first). */
export type SeparationBackend = 'gpu' | 'cpu';

/** What is kept of a finished separation (shown in its panel; kept in the document). */
export interface SeparationSummary {
  /** Random id; prefix of the stored audio ids of its tracks. */
  id: string;
  /** Tool used (`SeparationModelSpec.id` of the list) and its name as shown then. */
  modelId: string;
  modelName: string;
  /** SHA-256 of the weights used: says exactly which tool, even if the list changes later. */
  modelSha256: string;
  backend: SeparationBackend;
  /** The graphics path failed and the processor took over (same tool). */
  fellBack: boolean;
  /** What the tool gave, in its order. */
  stems: StemId[];
  /**
   * Instruments the user asked for, each made a track of its own; the tool's
   * other parts are summed into one « Autres » track. Every stem when the user
   * asked for all of them.
   */
  kept: StemId[];
  /** ISO dates. */
  startedAt: string;
  finishedAt: string;
  /** Wall-clock time of the computation, seconds (honest estimates next time). */
  computeSeconds: number;
  /** Duration of the piece that was separated, seconds. */
  pieceSeconds: number;
}

export type SeparationShowing = 'whole' | 'instruments';

export interface SeparationState {
  /** The last finished separation, or null (never separated, or freed). */
  result: SeparationSummary | null;
  /** Which set `AppState.tracks` holds. Always `whole` when `result` is null. */
  showing: SeparationShowing;
  /**
   * The set NOT shown, kept with its mix so that switching is instant: the
   * whole-piece track while the instruments are shown, the instrument tracks
   * while the whole piece is. Empty when `result` is null.
   */
  aside: Track[];
}

export function emptySeparation(): SeparationState {
  return { result: null, showing: 'whole', aside: [] };
}
