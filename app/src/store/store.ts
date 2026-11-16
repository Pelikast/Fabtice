// The app state: one zustand store, plain data only. Changes go through the
// functions of `store/actions.ts`; the engine follows the store through
// `audio/connect.ts`.
//
// Not in the store, on purpose:
//   - the playhead position: read `getEngine().getPosition()` inside
//     requestAnimationFrame (`ui/frameLoop.ts`), never through React state;
//   - decoded audio: `audio/registry.ts`;
//   - the timeline's horizontal scroll offset: owned by `timeline/`;
//   - the fine progress of the analysis, the separation and the render
//     (several times per second): `analysis/progress.ts`,
//     `separation/progress.ts`, `render/progress.ts`;
//   - the rendered (« Appliquer ») audio: `render/controller.ts`.

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AnalysisErrorCode, AnalysisStep } from '../analysis/types';
import type { EngineError, EngineState } from '../audio/AudioEngine';
import { defaultTempoMap } from '../grid/tempoMap';
import type { ImportProgress } from '../import/types';
import type { AnalysisResult } from '../model/analysis';
import { defaultExportPreferences, type ExportPreferences } from '../model/audioExport';
import type { KeptRender, RenderStatus } from '../model/render';
import { emptySeparation, type SeparationBackend, type SeparationState, type StemId } from '../model/separation';
import type { SeparationErrorCode, SeparationStep } from '../separation/types';
import { emptyCorrections, type Corrections } from '../model/corrections';
import { emptyMarkers, type Markers } from '../model/markers';
import { defaultMetronome, type MetronomeSettings } from '../model/metronome';
import {
  DEFAULT_SUBDIVISION,
  defaultAppSettings,
  type AppSettings,
  type LoopState,
  type PlaybackSettings,
  type Project,
  type Track,
  type ViewSettings,
} from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { isPhoneLayout } from '../util/media';
import { PX_PER_SECOND, TRACK_HEIGHT } from '../view/zoom';

/** State of the import shown in the new-piece dialog. */
export type ImportStatus =
  | { kind: 'idle' }
  | { kind: 'busy'; progress: ImportProgress }
  /** `message` is the French text to show; `detail` an optional second line (Mac app text). */
  | { kind: 'error'; message: string; detail: string | null };

export interface ReopenOffer {
  title: string | null;
}

/** Small floating panels; only one is open at a time. */
export type PanelId = 'none' | 'grid' | 'tuning' | 'analysis' | 'separation' | 'metronome' | 'markers';

/**
 * The analysis of the open piece, as the interface shows it (never saved).
 * « Done » is not a state of its own: `AppState.analysis` holds the result.
 */
export type AnalysisRun =
  | { status: 'idle' }
  | {
      status: 'running';
      /** The project being analysed (a result for another one is dropped). */
      projectId: string;
      /** Changes a few times per analysis; the fine progress is in `analysis/progress.ts`. */
      step: AnalysisStep;
      /** A manual tempo action from this bar (index in the grid in force) is being computed. */
      tempoBar?: number;
    }
  | { status: 'error'; projectId: string; code: AnalysisErrorCode };

/**
 * The separation of the open piece, as the interface shows it (never saved).
 * « Done » is not a state of its own: `AppState.separation.result` holds it.
 */
export type SeparationRun =
  | { status: 'idle' }
  | {
      status: 'running';
      projectId: string;
      /** The tool in use (`SeparationModelSpec.id`). */
      modelId: string;
      /** Changes a few times per run; fraction and remaining time are in `separation/progress.ts`. */
      step: SeparationStep;
      /** Where it computes (null before it knows). */
      backend: SeparationBackend | null;
      /** The graphics path failed: the processor continues with the same tool (a calm notice says it takes longer). */
      fellBack: boolean;
    }
  | { status: 'error'; projectId: string; code: SeparationErrorCode };

/** Why the piece will not be kept on this device (shown as a calm notice). */
/** `renderFull` (retours du 15 novembre): the piece is kept, but the render just applied could not be (no room left). */
export type StorageNotice = 'unavailable' | 'full' | 'renderFull';

/** The tabs of « Réglages » (C7), in their order. */
export const SETTINGS_TABS = ['general', 'instruments', 'tempo', 'chords', 'metronome', 'display', 'advanced'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** What « Nouveau projet ▸ » was asked from: « À partir d'un lien YouTube », « À partir d'un fichier audio », or neither. */
export type NewPieceFrom = 'link' | 'file' | null;

export interface UiState {
  /**
   * « Réglages » (C7): a wide window with tabs; `tab` is kept while the app stays open. `direct`: it was
   * opened on a named tab (a « Tous les réglages… » link), so the phone form goes straight to that tab
   * instead of showing the list of the seven first.
   */
  settings: { open: boolean; tab: SettingsTab; direct: boolean };
  /** The new-piece dialog. Opened at launch when no project is loaded. */
  newPieceOpen: boolean;
  /**
   * Where « Nouveau projet ▸ » started from (C6): a YouTube link, an audio file, or null for the whole opening
   * screen (at launch, « Ouvrir… », a project being opened).
   */
  newPieceFrom: NewPieceFrom;
  panel: PanelId;
  import: ImportStatus;
  /** A calm sentence shown in the dialog above the choices (e.g. the last piece could not be reopened). */
  notice: string | null;
  /**
   * A piece is kept on the device but could not be opened (failure, time-out, or
   * a launch that was cut short): the dialog offers to open it again, or to
   * forget it. `title` is null when the stored record could not even be read.
   */
  reopenOffer: ReopenOffer | null;
  /** Mac app: a newer version of the import tool exists (proposed, never imposed, in the dialog). */
  toolUpdate: boolean;
  /** Set when saving to the device fails; the piece stays usable in memory. */
  storageNotice: StorageNotice | null;
  /**
   * « Instruments à séparer » in the new-piece dialog: the instruments ticked
   * (none by default). Not empty: the separation starts by itself once the
   * imported piece can play.
   */
  importStems: StemId[];
  /** A calm sentence about the separation (e.g. the kept instruments could not be read back); null when none. */
  separationNotice: string | null;
  /** « Exporter le son » (a dialog). */
  exportAudioOpen: boolean;
  /** « Imprimer la grille » (a dialog: orientation, size, print or save as PDF). */
  printOpen: boolean;
  /** Lot 4: « Enregistrer le projet » (a dialog: with or without the instruments, then the file). */
  saveProjectOpen: boolean;
}

export interface TransportState {
  /** Mirrors the engine's state; `playing` drives the play button. */
  engine: EngineState;
  error: EngineError | null;
}

export interface AppState {
  project: Project | null;
  tracks: Track[];
  /** The grid in force; its `origin` says who made it (see `model/tempoMap.ts`). */
  tempoMap: TempoMap;
  /** The last analysis of the open piece, as it came out; null until one has finished. */
  analysis: AnalysisResult | null;
  /** What the user changed or added by hand (see `model/corrections.ts`). */
  corrections: Corrections;
  /** Progress or failure of the analysis (interface only, not saved). */
  analysisRun: AnalysisRun;
  /** Separation of the instruments: last result, set shown, set aside (saved with the piece). */
  separation: SeparationState;
  /** Progress or failure of a separation (interface only, not saved). */
  separationRun: SeparationRun;
  /** The « Appliquer » render in progress or in place (interface state). */
  render: RenderStatus;
  /** The last applied render kept with the piece (version 5, saved; its samples are on the device). */
  keptRender: KeptRender | null;
  /** Last choices of « Exporter le son » (saved with the piece). */
  exportPrefs: ExportPreferences;
  /** Lot 4: the metronome beyond on/off (volume, count-in, patterns, acceleration), saved with the piece. */
  metronome: MetronomeSettings;
  /** Lot 4: named loops (repères), saved with the piece. Sections are `corrections.sections`. */
  markers: Markers;
  loop: LoopState;
  playback: PlaybackSettings;
  view: ViewSettings;
  settings: AppSettings;
  transport: TransportState;
  ui: UiState;
}

export const DEFAULT_PLAYBACK: PlaybackSettings = { semitones: 0, cents: 0, tempoRatio: 1, metronome: false };

export function defaultView(): ViewSettings {
  return {
    mode: 'pistes',
    pxPerSecond: PX_PER_SECOND.default,
    trackHeight: TRACK_HEIGHT.default,
    // On a phone the lanes scroll at a fixed bar width instead (DESIGN.md).
    auto: !isPhoneLayout(),
    subdivision: DEFAULT_SUBDIVISION,
    triplets: false,
    snap: true,
    follow: true,
    instrument: 'ut',
  };
}

export function initialState(): AppState {
  return {
    project: null,
    tracks: [],
    tempoMap: defaultTempoMap(),
    analysis: null,
    corrections: emptyCorrections(),
    analysisRun: { status: 'idle' },
    separation: emptySeparation(),
    separationRun: { status: 'idle' },
    render: { status: 'none' },
    keptRender: null,
    exportPrefs: defaultExportPreferences(),
    metronome: defaultMetronome(),
    markers: emptyMarkers(),
    loop: { region: null, enabled: false },
    playback: { ...DEFAULT_PLAYBACK },
    view: defaultView(),
    settings: defaultAppSettings(),
    transport: { engine: 'empty', error: null },
    ui: {
      settings: { open: false, tab: 'general', direct: false },
      newPieceOpen: true,
      newPieceFrom: null,
      panel: 'none',
      import: { kind: 'idle' },
      notice: null,
      reopenOffer: null,
      toolUpdate: false,
      storageNotice: null,
      importStems: [],
      separationNotice: null,
      exportAudioOpen: false,
      printOpen: false,
      saveProjectOpen: false,
    },
  };
}

export type AppStore = StoreApi<AppState>;

export function createAppStore(state: AppState = initialState()): AppStore {
  return createStore<AppState>()(() => state);
}

/** The app-wide store. */
export const appStore: AppStore = createAppStore();

/** React hook: subscribes a component to a slice of the store. Keep selectors narrow. */
export function useApp<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}
