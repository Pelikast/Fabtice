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
import type { RenderStatus } from '../model/render';
import { emptySeparation, type SeparationBackend, type SeparationState, type StemId } from '../model/separation';
import type { SeparationErrorCode, SeparationStep } from '../separation/types';
import { emptyCorrections, type Corrections } from '../model/corrections';
import {
  DEFAULT_ADVANCED,
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
export type PanelId = 'none' | 'settings' | 'grid' | 'tuning' | 'export' | 'analysis' | 'separation';

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
export type StorageNotice = 'unavailable' | 'full';

export interface UiState {
  /** The new-piece dialog. Opened at launch when no project is loaded. */
  newPieceOpen: boolean;
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
  /** The « Appliquer » render (interface only, never saved: the applied files are temporary). */
  render: RenderStatus;
  /** Last choices of « Exporter le son » (saved with the piece). */
  exportPrefs: ExportPreferences;
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
    subdivision: 2,
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
    exportPrefs: defaultExportPreferences(),
    loop: { region: null, enabled: false },
    playback: { ...DEFAULT_PLAYBACK },
    view: defaultView(),
    settings: { minorNotation: 'm', advanced: { ...DEFAULT_ADVANCED } },
    transport: { engine: 'empty', error: null },
    ui: {
      newPieceOpen: true,
      panel: 'none',
      import: { kind: 'idle' },
      notice: null,
      reopenOffer: null,
      toolUpdate: false,
      storageNotice: null,
      importStems: [],
      separationNotice: null,
      exportAudioOpen: false,
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
