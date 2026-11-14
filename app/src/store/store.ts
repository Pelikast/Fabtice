// The app state: one zustand store, plain data only. Changes go through the
// functions of `store/actions.ts`; the engine follows the store through
// `audio/connect.ts`.
//
// Not in the store, on purpose:
//   - the playhead position: read `getEngine().getPosition()` inside
//     requestAnimationFrame (`ui/frameLoop.ts`), never through React state;
//   - decoded audio: `audio/registry.ts`;
//   - the timeline's horizontal scroll offset: owned by `timeline/`.

import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AnalysisErrorCode, AnalysisStep } from '../analysis/types';
import type { EngineError, EngineState } from '../audio/AudioEngine';
import { defaultTempoMap } from '../grid/tempoMap';
import type { ImportProgress } from '../import/types';
import type { AnalysisResult } from '../model/analysis';
import { emptyCorrections, type Corrections } from '../model/corrections';
import type {
  AppSettings,
  LoopState,
  PlaybackSettings,
  Project,
  Track,
  ViewSettings,
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

/** Small floating panels; only one is open at a time. */
export type PanelId = 'none' | 'settings' | 'grid' | 'tuning' | 'export' | 'analysis';

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

/** Why the piece will not be kept on this device (shown as a calm notice). */
export type StorageNotice = 'unavailable' | 'full';

export interface UiState {
  /** The new-piece dialog. Opened at launch when no project is loaded. */
  newPieceOpen: boolean;
  panel: PanelId;
  import: ImportStatus;
  /** A calm sentence shown in the dialog above the choices (e.g. the last piece could not be reopened). */
  notice: string | null;
  /** Mac app: a newer version of the import tool exists (proposed, never imposed, in the dialog). */
  toolUpdate: boolean;
  /** Set when saving to the device fails; the piece stays usable in memory. */
  storageNotice: StorageNotice | null;
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
    loop: { region: null, enabled: false },
    playback: { ...DEFAULT_PLAYBACK },
    view: defaultView(),
    settings: { minorNotation: 'm' },
    transport: { engine: 'empty', error: null },
    ui: { newPieceOpen: true, panel: 'none', import: { kind: 'idle' }, notice: null, toolUpdate: false, storageNotice: null },
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
