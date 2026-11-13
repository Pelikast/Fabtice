// Everything that changes the app state. Components call these; they never
// call `setState` themselves. Transport commands go straight to the engine;
// settings go to the store and reach the engine through `audio/connect.ts`.

import { getEngine } from '../audio';
import { clearAudio, engineTrack, registerAudio, type DecodedAudio } from '../audio/registry';
import { clipRange } from '../grid/lines';
import { defaultTempoMap, withManualGrid, type ManualGridChange } from '../grid/tempoMap';
import type { ImportedPiece } from '../import/types';
import type {
  MinorNotation,
  Project,
  ProjectSource,
  Seconds,
  Subdivision,
  TimeRange,
  Track,
  TrackRole,
  ViewMode,
} from '../model/project';
import type { TempoMap } from '../model/tempoMap';
import { t } from '../i18n';
import { newId } from '../util/id';
import { clampScale, clampTrackHeight } from '../view/zoom';
import { clampCents, clampSemitones, originalBpm, steppedTempoRatio, TEMPO_RATIO } from './derived';
import { appStore, DEFAULT_PLAYBACK, type AppState, type ImportStatus, type PanelId } from './store';

const get = () => appStore.getState();
const set = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => appStore.setState(patch);

// ---------------------------------------------------------------- project

export interface NewTrackInput {
  name?: string;
  role: TrackRole;
  audio: DecodedAudio;
  origin?: 'original' | 'separated';
  volume?: number;
  mute?: boolean;
}

export interface NewProjectInput {
  title: string;
  source: ProjectSource;
  tracks: NewTrackInput[];
  /** A grid already known (demo, restored project); else the default one. */
  tempoMap?: TempoMap;
  loop?: TimeRange | null;
}

/**
 * Opens a piece: registers its audio, replaces the project in the store and
 * loads the tracks into the engine. Resolves once playable; rejects if the
 * engine refuses the audio (the store then shows the engine error).
 */
export async function openProject(input: NewProjectInput): Promise<void> {
  const engine = getEngine();
  engine.pause();
  clearAudio();
  const tracks: Track[] = input.tracks.map((tr) => {
    const audioId = newId();
    registerAudio(audioId, tr.audio);
    return {
      id: newId(),
      name: tr.name ?? t(`role.${tr.role}`),
      role: tr.role,
      mute: tr.mute ?? false,
      solo: false,
      volume: tr.volume ?? 1,
      audio: {
        id: audioId,
        origin: tr.origin ?? 'original',
        channels: tr.audio.channels.length,
        sampleRate: tr.audio.sampleRate,
        frames: tr.audio.channels[0]?.length ?? 0,
      },
    };
  });
  const duration = tracks.reduce((d, tr) => Math.max(d, tr.audio.frames / tr.audio.sampleRate), 0);
  const project: Project = {
    id: newId(),
    title: input.title,
    source: input.source,
    duration,
    sampleRate: engine.sampleRate,
    createdAt: new Date().toISOString(),
  };
  const region = input.loop ? clipRange(input.loop, duration) : null;
  set((s) => ({
    project,
    tracks,
    tempoMap: input.tempoMap ?? defaultTempoMap(),
    loop: { region, enabled: region !== null },
    playback: { ...DEFAULT_PLAYBACK },
    view: { ...s.view, mode: 'pistes' },
    ui: { ...s.ui, newPieceOpen: false, panel: 'none', import: { kind: 'idle' } },
  }));
  const mixes = Object.fromEntries(tracks.map((tr) => [tr.id, { mute: tr.mute, solo: tr.solo, volume: tr.volume }]));
  await engine.loadTracks(tracks.map((tr) => engineTrack(tr.id, tr.audio.id)), mixes);
}

/** Opens what an import produced: one track, the whole piece. */
export function openImportedPiece(piece: ImportedPiece): Promise<void> {
  return openProject({
    title: piece.title,
    source: piece.source,
    tracks: [{ role: 'morceau', audio: piece.audio }],
  });
}

// ---------------------------------------------------------------- transport

export function isPlaying(): boolean {
  return get().transport.engine === 'playing';
}

/** Must run inside the user's gesture (click, key): the engine may start its AudioContext. */
export function play(): void {
  void getEngine().play();
}

export function pause(): void {
  getEngine().pause();
}

export function togglePlay(): void {
  if (isPlaying()) pause();
  else play();
}

/** Moves the playhead. Snapping, when wanted, is the caller's job (`grid/lines.ts#snapTime`). */
export function seek(time: Seconds): void {
  getEngine().seek(time);
}

/** « Retour »: to the start of the loop when looping, else to the start of the piece. */
export function backToStart(): void {
  const { loop } = get();
  seek(loop.enabled && loop.region ? loop.region.start : 0);
}

// ---------------------------------------------------------------- loop

/** Sets the loop region (null clears it). A new region switches the loop on. */
export function setLoopRegion(region: TimeRange | null): void {
  const duration = get().project?.duration ?? 0;
  const clipped = region ? clipRange(region, duration) : null;
  set({ loop: { region: clipped, enabled: clipped !== null } });
}

export function toggleLoop(): void {
  set((s) => ({ loop: { ...s.loop, enabled: s.loop.region !== null && !s.loop.enabled } }));
}

// ---------------------------------------------------------------- key and tempo

export function stepSemitones(direction: 1 | -1): void {
  set((s) => ({ playback: { ...s.playback, semitones: clampSemitones(s.playback.semitones + direction) } }));
}

export function setCents(cents: number): void {
  set((s) => ({ playback: { ...s.playback, cents: clampCents(cents) } }));
}

export function resetTransposition(): void {
  set((s) => ({ playback: { ...s.playback, semitones: 0, cents: 0 } }));
}

export function stepTempo(direction: 1 | -1): void {
  set((s) => ({ playback: { ...s.playback, tempoRatio: steppedTempoRatio(s.playback.tempoRatio, direction, originalBpm(s)) } }));
}

export function setTempoRatio(ratio: number): void {
  const r = Math.min(TEMPO_RATIO.max, Math.max(TEMPO_RATIO.min, ratio));
  set((s) => ({ playback: { ...s.playback, tempoRatio: r } }));
}

export function resetTempo(): void {
  setTempoRatio(1);
}

export function toggleMetronome(): void {
  set((s) => ({ playback: { ...s.playback, metronome: !s.playback.metronome } }));
}

// ---------------------------------------------------------------- grid (manual entry, lot 1)

export function setManualGrid(change: ManualGridChange): void {
  set((s) => ({ tempoMap: withManualGrid(s.tempoMap, change) }));
}

/** « Premier temps ici »: the first downbeat goes where the playhead is heard. */
export function setDownbeatAtPlayhead(): void {
  setManualGrid({ firstDownbeat: getEngine().getPosition() });
}

// ---------------------------------------------------------------- tracks

function updateTrack(id: string, patch: Partial<Pick<Track, 'mute' | 'solo' | 'volume'>>): void {
  set((s) => ({ tracks: s.tracks.map((tr) => (tr.id === id ? { ...tr, ...patch } : tr)) }));
}

export function toggleMute(id: string): void {
  const tr = get().tracks.find((x) => x.id === id);
  if (tr) updateTrack(id, { mute: !tr.mute });
}

export function toggleSolo(id: string): void {
  const tr = get().tracks.find((x) => x.id === id);
  if (tr) updateTrack(id, { solo: !tr.solo });
}

export function setTrackVolume(id: string, volume: number): void {
  updateTrack(id, { volume: Math.min(1, Math.max(0, volume)) });
}

// ---------------------------------------------------------------- view

export function setViewMode(mode: ViewMode): void {
  set((s) => ({ view: { ...s.view, mode }, ui: { ...s.ui, panel: 'none' } }));
}

export function setSubdivision(subdivision: Subdivision): void {
  set((s) => ({ view: { ...s.view, subdivision } }));
}

export function toggleTriplets(): void {
  set((s) => ({ view: { ...s.view, triplets: !s.view.triplets } }));
}

export function toggleSnap(): void {
  set((s) => ({ view: { ...s.view, snap: !s.view.snap } }));
}

export function setFollow(follow: boolean): void {
  set((s) => ({ view: { ...s.view, follow } }));
}

/** Horizontal zoom by hand: leaves « Auto ». */
export function setZoom(pxPerSecond: number): void {
  set((s) => ({ view: { ...s.view, pxPerSecond: clampScale(pxPerSecond), auto: false } }));
}

/** Vertical zoom by hand: leaves « Auto ». */
export function setTrackHeight(height: number): void {
  set((s) => ({ view: { ...s.view, trackHeight: clampTrackHeight(height), auto: false } }));
}

export function setAuto(auto: boolean): void {
  set((s) => ({ view: { ...s.view, auto } }));
}

/** Used by the timeline while « Auto » is on: stores the fitted scale without leaving Auto. */
export function applyAutoFit(pxPerSecond: number, trackHeight: number): void {
  set((s) => ({ view: { ...s.view, pxPerSecond: clampScale(pxPerSecond), trackHeight: clampTrackHeight(trackHeight) } }));
}

// ---------------------------------------------------------------- settings and panels

export function setMinorNotation(minorNotation: MinorNotation): void {
  set((s) => ({ settings: { ...s.settings, minorNotation } }));
}

export function openPanel(panel: PanelId): void {
  set((s) => ({ ui: { ...s.ui, panel } }));
}

export function togglePanel(panel: Exclude<PanelId, 'none'>): void {
  set((s) => ({ ui: { ...s.ui, panel: s.ui.panel === panel ? 'none' : panel } }));
}

export function closePanel(): void {
  if (get().ui.panel !== 'none') set((s) => ({ ui: { ...s.ui, panel: 'none' } }));
}

export function openNewPiece(): void {
  set((s) => ({ ui: { ...s.ui, newPieceOpen: true, panel: 'none' } }));
}

/** Closes the dialog, unless there is nothing behind it (no project) or an import is running. */
export function closeNewPiece(): void {
  const s = get();
  if (!s.project || s.ui.import.kind === 'busy') return;
  set({ ui: { ...s.ui, newPieceOpen: false, import: { kind: 'idle' } } });
}

export function setImportStatus(status: ImportStatus): void {
  set((s) => ({ ui: { ...s.ui, import: status } }));
}

/** Escape: closes the open panel first, then the dialog. */
export function escape(): void {
  const s = get();
  if (s.ui.panel !== 'none') closePanel();
  else if (s.ui.newPieceOpen) closeNewPiece();
}
