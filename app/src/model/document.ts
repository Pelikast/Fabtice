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
//   4  lot 4: + `metronome` (volume, count-in, accent pattern per meter,
//      progressive acceleration: `model/metronome.ts`) and `markers` (named
//      loops: `model/markers.ts`; sections stay the chart's letters in
//      `corrections.sections`). Meters may now be 2 to 12 beats over 4 or 8.
//   5  + `separation.others` (every separation kept, one per tool, each with
//      its tracks and mix; their samples on the device, not in memory) and
//      `keptRender` (the last « Appliquer » render, kept with the piece).

import type { AnalysisResult } from './analysis';
import type { ExportPreferences } from './audioExport';
import type { Corrections } from './corrections';
import type { Markers } from './markers';
import type { MetronomeSettings } from './metronome';
import type { AppSettings, LoopState, PlaybackSettings, Project, Track, ViewSettings } from './project';
import type { SeparationState } from './separation';
import type { KeptRender } from './render';
import type { TempoMap } from './tempoMap';

export const PROJECT_DOCUMENT_VERSION = 5;

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
  /** The metronome beyond on/off (which stays in `playback`): volume, count-in, patterns, acceleration. */
  metronome: MetronomeSettings;
  /** Named loops (repères); the sections are `corrections.sections`. */
  markers: Markers;
  /** The last « Appliquer » render kept with the piece (version 5), or null. */
  keptRender: KeptRender | null;
  /** ISO date of the last save. */
  savedAt: string;
}

/** App-wide preferences are not part of a project; kept here for reference by storage. */
export type { AppSettings };
