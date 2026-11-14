// Separation of the instruments, as the store sees it (lot 3): the choices of
// the new-piece dialog, the advanced settings, putting a finished separation
// in place, and switching between the whole piece and the instruments. The
// run itself is `separation/runner.ts`.
//
// Switching never reloads the engine: the tracks of the other set are added
// (aligned at 0) and the shown ones removed, so the position is kept and
// playback goes on.

import { getEngine } from '../audio';
import { dropAudio, engineTrack } from '../audio/registry';
import { t } from '../i18n';
import type { Track } from '../model/project';
import { emptySeparation, STEM_ROLE, type SeparationSummary, type StemId } from '../model/separation';
import { appStore, type AppState, type SeparationRun } from './store';

const get = () => appStore.getState();
const set = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => appStore.setState(patch);

// ---------------------------------------------------------------- choices

/** « Instruments à séparer » in the new-piece dialog. */
export function toggleImportStem(stem: StemId): void {
  set((s) => {
    const has = s.ui.importStems.includes(stem);
    return { ui: { ...s.ui, importStems: has ? s.ui.importStems.filter((x) => x !== stem) : [...s.ui.importStems, stem] } };
  });
}

export function setImportStems(importStems: StemId[]): void {
  set((s) => ({ ui: { ...s.ui, importStems } }));
}

export function setSeparationNotice(separationNotice: string | null): void {
  set((s) => (s.ui.separationNotice === separationNotice ? {} : { ui: { ...s.ui, separationNotice } }));
}

export function setSeparationRun(separationRun: SeparationRun): void {
  set({ separationRun });
}

/** Advanced setting: `auto` or a tool id of the list. */
export function setSeparationModel(id: 'auto' | string): void {
  set((s) => ({ settings: { ...s.settings, advanced: { ...s.settings.advanced, separationModel: id } } }));
}

/** Advanced setting: keep the timbre (formants) in the applied render and the export. */
export function setFormants(formants: boolean): void {
  set((s) => ({ settings: { ...s.settings, advanced: { ...s.settings.advanced, formants } } }));
}

// ---------------------------------------------------------------- the engine follows the shown set

const mixOf = (tr: Track) => ({ mute: tr.mute, solo: tr.solo, volume: tr.volume });

/** Adds the new set to the engine, then removes the old one: position and playback are kept. */
async function swapEngineTracks(from: readonly Track[], to: readonly Track[]): Promise<void> {
  const engine = getEngine();
  for (const tr of to) await engine.addTrack(engineTrack(tr.id, tr.audio.id), mixOf(tr));
  for (const tr of from) engine.removeTrack(tr.id);
}

// ---------------------------------------------------------------- results

export interface SeparatedTrackInput {
  stem: StemId;
  /** Registered audio id (`audio/registry.ts`); its samples are kept on the device by the runner. */
  audioId: string;
  channels: number;
  frames: number;
  sampleRate: number;
}

/** The French name of a part (« Voix », « Grosse caisse »…). */
export function stemName(stem: StemId): string {
  return t(`stem.${stem}`);
}

/**
 * Puts a finished separation in place: the instrument tracks replace the
 * whole piece (which waits aside, with its mix), in the order of the
 * mockup. A previous separation's instruments are dropped from memory (the
 * runner deletes them from the device). Resolves once the engine plays them.
 */
export async function applySeparation(summary: SeparationSummary, parts: readonly SeparatedTrackInput[]): Promise<void> {
  const s = get();
  if (!s.project) return;
  const order: StemId[] = ['vocals', 'drums', 'kick', 'snare', 'hihat', 'toms', 'cymbals', 'bass', 'guitar', 'piano', 'winds', 'saxophone', 'brass', 'other'];
  const sorted = [...parts].sort((a, b) => order.indexOf(a.stem) - order.indexOf(b.stem));
  const instruments: Track[] = sorted.map((p, i) => ({
    id: `${summary.id}-${i}`,
    name: stemName(p.stem),
    role: STEM_ROLE[p.stem],
    mute: false,
    solo: false,
    volume: 1,
    audio: { id: p.audioId, origin: 'separated', channels: p.channels, sampleRate: p.sampleRate, frames: p.frames },
    stem: p.stem,
  }));
  const whole = wholeTracks(s);
  const previous = [...s.tracks, ...s.separation.aside].filter((tr) => tr.audio.origin === 'separated');
  const shown = s.tracks;
  set({ tracks: instruments, separation: { result: summary, showing: 'instruments', aside: whole } });
  await swapEngineTracks(shown, instruments);
  for (const tr of previous) dropAudio(tr.audio.id);
}

/** The whole-piece set, wherever it is. */
export function wholeTracks(s: AppState): Track[] {
  return s.separation.showing === 'whole' ? s.tracks : s.separation.aside;
}

/** The instrument tracks, wherever they are (empty when not separated). */
export function instrumentTracks(s: AppState): Track[] {
  if (!s.separation.result) return [];
  return s.separation.showing === 'instruments' ? s.tracks : s.separation.aside;
}

/** « Revenir au morceau entier »: the instruments wait aside, nothing is lost. */
export async function showWholePiece(): Promise<void> {
  const s = get();
  if (!s.separation.result || s.separation.showing === 'whole') return;
  const shown = s.tracks;
  const whole = s.separation.aside;
  set({ tracks: whole, separation: { ...s.separation, showing: 'whole', aside: shown } });
  await swapEngineTracks(shown, whole);
}

/** « Revoir les instruments ». */
export async function showInstruments(): Promise<void> {
  const s = get();
  if (!s.separation.result || s.separation.showing === 'instruments') return;
  const shown = s.tracks;
  const instruments = s.separation.aside;
  set({ tracks: instruments, separation: { ...s.separation, showing: 'instruments', aside: shown } });
  await swapEngineTracks(shown, instruments);
}

/**
 * Forgets the separation (« Libérer la place »): back to the whole piece,
 * instruments dropped from memory. Returns the audio ids to delete from the
 * device (the caller does it, `separation/runner.ts#freeSeparatedTracks`).
 */
export async function dropSeparation(): Promise<string[]> {
  await showWholePiece();
  const s = get();
  const gone = instrumentTracks(s).map((tr) => tr.audio.id);
  set({ separation: emptySeparation() });
  for (const id of gone) dropAudio(id);
  return gone;
}
