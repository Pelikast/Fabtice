// The serialisable form of the open project: what project storage keeps on
// the device (lot 1) and what the `.fabtice` format will build on (lot 4).
// Audio bytes are stored next to it, never inside.

import type { AppSettings, LoopState, PlaybackSettings, Project, Track, ViewSettings } from './project';
import type { TempoMap } from './tempoMap';

export const PROJECT_DOCUMENT_VERSION = 1;

export interface ProjectDocument {
  /** Format version, bumped on incompatible changes. */
  version: typeof PROJECT_DOCUMENT_VERSION;
  project: Project;
  tracks: Track[];
  tempoMap: TempoMap;
  loop: LoopState;
  playback: PlaybackSettings;
  /** View settings worth restoring with the piece (zoom, sub-grid, magnet…). */
  view: Omit<ViewSettings, 'mode'>;
  /** ISO date of the last save. */
  savedAt: string;
}

/** App-wide preferences are not part of a project; kept here for reference by storage. */
export type { AppSettings };
