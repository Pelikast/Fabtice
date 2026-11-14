// Runs the separation of the open piece and keeps the store informed.
//
//   - On demand: `startSeparation({ stems })` (the separation panel, or by
//     itself after an import when instruments were ticked in the new-piece
//     dialog: `startAutoSeparation`). In the background: the piece stays
//     playable; progress and remaining time go to `separation/progress.ts`,
//     the coarse state to `AppState.separationRun`; `cancelSeparation()`.
//   - The tool: the advanced setting, else the automatic choice for this
//     device (`separation/device.ts`). A graphics failure keeps the tool.
//   - When it ends: the asked instruments become tracks; the tool's other
//     parts are summed into one « Autres » track; each track's samples are
//     kept on the device BEFORE the document refers to them (a launch in
//     between finds the whole piece, never a hole); then the instruments
//     replace the whole piece (`store/separationActions.ts#applySeparation`).
//   - « Libérer la place » (`freeSeparatedTracks`): back to the whole piece,
//     the kept instruments deleted.
//   - A new piece cancels the separation of the previous one.

import { pcmBytes, sumPcm, type PcmAudio } from '../audio/pcm';
import { getAudio, registerAudio } from '../audio/registry';
import type { SeparationSummary, StemId } from '../model/separation';
import { getKeeper, getProjectStorage } from '../storage';
import { applySeparation, dropSeparation, setImportStems, setSeparationNotice, setSeparationRun, wholeTracks } from '../store/separationActions';
import { setStorageNotice } from '../store/actions';
import { appStore, type AppState } from '../store/store';
import { newId } from '../util/id';
import { getDevice, knownDevice, resolveModel } from './device';
import { getModelList } from './models';
import { setSeparationProgress, separationProgressStore } from './progress';
import { keepSeparationReport } from './report';
import { getSeparator } from './index';
import { SeparationError, type ModelChoice, type SeparatedTrack, type SeparationProgress, type ToolsUsage } from './types';

let running: { projectId: string; abort: AbortController } | null = null;

export function isSeparating(): boolean {
  return running !== null;
}

/** The tool that would be used now (advanced setting or automatic), or null when the list has none. */
export function currentChoice(s: AppState = appStore.getState()): ModelChoice | null {
  return resolveModel(getModelList().list.models, knownDevice(), s.settings.advanced.separationModel);
}

/** Stops the separation in progress, if any (its result, if it still comes, is dropped). */
export function cancelSeparation(): void {
  if (!running) return;
  running.abort.abort();
  running = null;
  if (appStore.getState().separationRun.status === 'running') setSeparationRun({ status: 'idle' });
}

export interface StartOptions {
  /** Instruments wanted as tracks of their own; the tool's other parts go to « Autres ». Empty or absent: every part. */
  stems?: readonly StemId[];
}

/** The tracks to make from the tool's output: the asked parts, and the rest summed into « Autres ». */
export function gatherParts(output: readonly SeparatedTrack[], wanted: readonly StemId[]): { stem: StemId; audio: PcmAudio }[] {
  const asked = new Set(wanted.length ? wanted : output.map((t) => t.stem));
  const kept = output.filter((t) => asked.has(t.stem) && t.stem !== 'other');
  const rest = output.filter((t) => !asked.has(t.stem) || t.stem === 'other');
  const parts = kept.map((t) => ({ stem: t.stem, audio: t.audio }));
  if (rest.length === 1) parts.push({ stem: 'other', audio: rest[0]!.audio });
  else if (rest.length > 1) parts.push({ stem: 'other', audio: sumPcm(rest.map((t) => t.audio)) });
  return parts;
}

/**
 * Separates the open piece. Resolves when done, failed or cancelled (never
 * rejects): the outcome is in the store.
 */
export async function startSeparation(options: StartOptions = {}): Promise<void> {
  const store = appStore;
  const s = store.getState();
  const project = s.project;
  const whole = wholeTracks(s)[0];
  const audio = whole ? getAudio(whole.audio.id) : undefined;
  if (!project || !whole || !audio) return;
  cancelSeparation();
  await getDevice();
  const choice = currentChoice(store.getState());
  if (!choice) {
    setSeparationRun({ status: 'error', projectId: project.id, code: 'unknown-model' });
    return;
  }
  const abort = new AbortController();
  const mine = { projectId: project.id, abort };
  running = mine;
  const stillMine = () => running === mine && store.getState().project?.id === project.id;
  const startedAt = new Date().toISOString();
  setSeparationNotice(null);
  setSeparationProgress({ fraction: 0, remainingSeconds: null, download: null });
  setSeparationRun({ status: 'running', projectId: project.id, modelId: choice.model.id, step: 'prepare', backend: null, fellBack: false });

  let coarse = { step: 'prepare', backend: null as SeparationProgress['backend'], fellBack: false };
  const onProgress = (p: SeparationProgress) => {
    if (!stillMine()) return;
    if (p.step !== coarse.step || p.backend !== coarse.backend || p.fellBack !== coarse.fellBack) {
      coarse = { step: p.step, backend: p.backend, fellBack: p.fellBack };
      setSeparationRun({ status: 'running', projectId: project.id, modelId: choice.model.id, step: p.step, backend: p.backend, fellBack: p.fellBack });
    }
    const prev = separationProgressStore.getState();
    const fraction = Math.min(1, Math.max(prev.fraction, p.fraction));
    setSeparationProgress({ fraction, remainingSeconds: p.remainingSeconds, download: p.download ?? null });
  };

  try {
    const out = await getSeparator().separate({
      audio,
      model: choice.model,
      backend: choice.backend === 'gpu' ? 'auto' : 'cpu',
      onProgress,
      signal: abort.signal,
    });
    if (!stillMine()) return;
    const parts = gatherParts(out.tracks, options.stems ?? []);
    const id = newId();
    const registered = parts.map((p) => {
      const audioId = `${id}-${p.stem}`;
      registerAudio(audioId, p.audio);
      return { stem: p.stem, audioId, channels: p.audio.channelCount, frames: p.audio.frames, sampleRate: p.audio.sampleRate };
    });
    // Kept on the device first; the document refers to them only afterwards.
    await keepOnDevice(project.id, registered.map((r) => [r.audioId, getAudio(r.audioId)!] as const));
    if (!stillMine()) return;
    const summary: SeparationSummary = {
      id,
      modelId: choice.model.id,
      modelName: choice.model.name,
      modelSha256: choice.model.file.sha256,
      backend: out.backend,
      fellBack: out.fellBack,
      stems: out.tracks.map((t) => t.stem),
      kept: parts.map((p) => p.stem),
      startedAt,
      finishedAt: new Date().toISOString(),
      computeSeconds: out.computeSeconds,
      pieceSeconds: audio.frames / audio.sampleRate,
    };
    const before = [...store.getState().tracks, ...store.getState().separation.aside].filter((tr) => tr.audio.origin === 'separated').map((tr) => tr.audio.id);
    await applySeparation(summary, registered);
    // A real separation leaves its measurement report (« Copier le rapport », the Mac app's diagnostics).
    if (out.report) keepSeparationReport(id, out.report);
    setSeparationProgress({ fraction: 1, remainingSeconds: 0, download: null });
    setSeparationRun({ status: 'idle' });
    if (before.length) void getProjectStorage().deleteTrackAudio(before).catch(() => {});
  } catch (e) {
    if (!stillMine()) return;
    const code = e instanceof SeparationError ? e.code : 'failed';
    setSeparationRun(code === 'cancelled' ? { status: 'idle' } : { status: 'error', projectId: project.id, code });
  } finally {
    if (running === mine) running = null;
  }
}

/** Writes the instruments of a piece that is kept on the device (never the demo, never a piece not yet kept). */
async function keepOnDevice(projectId: string, tracks: readonly (readonly [string, PcmAudio])[]): Promise<void> {
  const keeper = getKeeper();
  await keeper.settled();
  if (keeper.attachedProject !== projectId) return;
  const storage = getProjectStorage();
  try {
    for (const [audioId, pcm] of tracks) await storage.saveTrackAudio(audioId, pcm);
  } catch (e) {
    // Not kept: the instruments stay usable now; the next launch opens the whole piece and says so.
    setStorageNotice(e instanceof Error && e.name === 'StorageError' && (e as { code?: string }).code === 'quota' ? 'full' : 'unavailable');
    await storage.deleteTrackAudio(tracks.map(([id]) => id)).catch(() => {});
  }
}

/** « Libérer la place »: back to the whole piece; the kept instruments are deleted from the device. */
export async function freeSeparatedTracks(): Promise<void> {
  cancelSeparation();
  const ids = await dropSeparation();
  try {
    await getProjectStorage().deleteTrackAudio(ids);
  } catch {
    // Left-overs are swept at the next launch (`pruneTrackAudio`).
  }
}

/** Room the separation takes on this device: the kept instruments and the downloaded tools. */
export interface SeparationUsage {
  /** Samples of the kept instruments (bytes), null when the device does not say. */
  instruments: number | null;
  /** The same instruments in memory now (bytes). */
  inMemory: number;
  tools: ToolsUsage | null;
}

export async function separationUsage(): Promise<SeparationUsage> {
  const s = appStore.getState();
  const mem = pcmBytes(
    [...s.tracks, ...s.separation.aside]
      .filter((tr) => tr.audio.origin === 'separated')
      .map((tr) => getAudio(tr.audio.id))
      .filter((a): a is PcmAudio => !!a),
  );
  let instruments: number | null = null;
  try {
    instruments = (await getProjectStorage().trackAudioUsage()).bytes;
  } catch {
    instruments = null;
  }
  let tools: ToolsUsage | null = null;
  try {
    tools = await getSeparator().toolsUsage();
  } catch {
    tools = null;
  }
  return { instruments, inMemory: mem, tools };
}

/**
 * Starts the separation asked in the new-piece dialog: once the imported
 * piece can play, with the ticked instruments (then cleared: the list is off
 * by default for the next piece). Returns the unsubscribe function.
 */
export function startAutoSeparation(): () => void {
  const store = appStore;
  let previousProject: string | null = store.getState().project?.id ?? null;
  let triedFor: string | null = null;
  const check = (s: AppState) => {
    const id = s.project?.id ?? null;
    if (id !== previousProject) {
      previousProject = id;
      if (running && running.projectId !== id) cancelSeparation();
    }
    if (!id || triedFor === id || s.ui.importStems.length === 0 || s.ui.newPieceOpen) return;
    if (s.transport.engine !== 'ready' && s.transport.engine !== 'playing') return;
    if (s.separation.result || s.separationRun.status !== 'idle') return;
    triedFor = id;
    const stems = [...s.ui.importStems];
    setImportStems([]);
    void startSeparation({ stems });
  };
  check(store.getState());
  return store.subscribe(check);
}
