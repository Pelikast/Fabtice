// The serialisable form of the open project: what project storage keeps on
// the device and what the `.fabtice` format will build on (lot 4). Audio
// bytes are stored next to it, never inside.
//
// Version history (migrations in `storage/documentFormat.ts`):
//   1  lot 1: project, tracks, tempo map, loop, playback, view.
//   2  lot 2: + `analysis` (the result as it came out) and `corrections`
//      (what the user changed by hand); tempo map origin `corrected`;
//      `view.instrument`.
//   3  lot 3: + `separation` (the last separation's summary, which set of
//      tracks is shown, the other set kept aside with its mix; separated
//      tracks carry `stem`), `exportPrefs` (« Exporter le son »). The
//      separated tracks' samples are stored next to the document
//      (`ProjectStorage.saveTrackAudio`), never inside.

import type { AnalysisResult } from './analysis';
import type { ExportPreferences } from './audioExport';
import type { Corrections } from './corrections';
import type { AppSettings, LoopState, PlaybackSettings, Project, Track, ViewSettings } from './project';
import type { SeparationState } from './separation';
import type { TempoMap } from './tempoMap';

export const PROJECT_DOCUMENT_VERSION = 3;

export interface ProjectDocument {
  /** Format version, bumped on incompatible changes. */
  version: typeof PROJECT_DOCUMENT_VERSION;
  project: Project;
  /** The tracks shown and played (the whole piece, or the separated instruments). */
  tracks: Track[];
  /** The grid in force (its `origin` says who made it). */
  tempoMap: TempoMap;
  loop: LoopState;
  playback: PlaybackSettings;
  /** View settings worth restoring with the piece (zoom, sub-grid, magnet, instrument…). */
  view: Omit<ViewSettings, 'mode'>;
  /** The last analysis, as it came out; null until one has finished. */
  analysis: AnalysisResult | null;
  /** What the user changed or added by hand (key, tuning, chords, sections). */
  corrections: Corrections;
  /** Separation of the instruments: last result, what is shown, the other set aside. */
  separation: SeparationState;
  /** Last choices of « Exporter le son ». */
  exportPrefs: ExportPreferences;
  /** ISO date of the last save. */
  savedAt: string;
}

/** App-wide preferences are not part of a project; kept here for reference by storage. */
export type { AppSettings };
