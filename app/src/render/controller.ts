// « Appliquer »: the best render of the tracks for the current key and tempo,
// played as it is (CLAUDE.md, « Deux qualités de rendu »).
//
//   preview   any key or tempo different from the original is heard at once
//             with the light engine; the transport offers « Appliquer »;
//   rendering « Appliquer » renders every shown track with the offline
//             renderer, one after the other, behind a short waiting screen
//             (`components/ApplyRender.tsx`), cancellable; playback goes on
//             in preview meanwhile;
//   applied   the rendered audio is handed to the engine
//             (`AudioEngine.setRenderedTracks`), which plays it as it is while
//             the key and tempo stay the same; the transport says so quietly.
// Any change of key, tempo, formants or tracks makes the render stale: it is
// dropped from memory at once, the engine is back on the preview, and
// « Appliquer » is offered again.
//
// Kept with the piece (owner's decision of 15 November, document version 5):
// the LAST applied render is written on the device next to the separated
// instruments (`AppState.keptRender`, its samples as 16-bit blocks) and goes
// into the `.fab` file. One at a time: a new « Appliquer » replaces it, never
// the original nor the separations. Whenever the live key, tempo, formants
// and tracks are its target again (the piece reopened, or the settings set
// back), it is read back and heard as it is (`reviveKeptRender`), within the
// same memory budget as a new render.
//
// Memory: the rendered audio is held here (16-bit, shared with the engine),
// one copy per shown track at the played tempo; it is the only place it
// lives, and it is let go as soon as it is stale.

import { getEngine } from '../audio';
import type { PcmAudio } from '../audio/pcm';
import { getAudio } from '../audio/registry';
import { sameTarget, type KeptRender, type RenderErrorCode, type RenderStatus, type RenderTarget } from '../model/render';
import { getKeeper, getProjectStorage } from '../storage';
import { newId } from '../util/id';
import { easePlan } from '../settings/easeLoad';
import { currentLoadShare } from '../settings/easeLoadShare';
import { appStore, type AppState } from '../store/store';
import { appliedFits } from './budget';
import { getRenderer } from './index';
import { setApplyProgress, startApplyProgress } from './progress';
import { RenderError } from './types';

/** What a render of the current state would be made for. */
export function currentTarget(s: AppState): RenderTarget {
  return {
    semitones: s.playback.semitones,
    cents: s.playback.cents,
    tempoRatio: s.playback.tempoRatio,
    formants: s.settings.advanced.formants,
    audioKey: s.tracks.map((tr) => tr.audio.id).join('|'),
  };
}

/** True when key and tempo are the original ones: there is nothing to apply. */
export function isOriginal(s: AppState): boolean {
  return s.playback.semitones === 0 && s.playback.cents === 0 && s.playback.tempoRatio === 1;
}

/**
 * What the transport shows:
 *   `original`  nothing to apply;
 *   `preview`   key or tempo changed, heard in preview: « Appliquer » is offered;
 *   `rendering` the waiting screen;
 *   `applied`   the best render is what is heard.
 */
export type ApplyState = 'original' | 'preview' | 'rendering' | 'applied';

export function selectApplyState(s: AppState): ApplyState {
  const r = s.render;
  if (r.status === 'rendering') return 'rendering';
  if (isOriginal(s)) return 'original';
  if (r.status === 'applied' && sameTarget(r.target, currentTarget(s))) return 'applied';
  return 'preview';
}

/** The error of the last « Appliquer » for the current state, or null. */
export function selectApplyError(s: AppState): RenderErrorCode | null {
  return s.render.status === 'error' && sameTarget(s.render.target, currentTarget(s)) ? s.render.code : null;
}

let job: { abort: AbortController; target: RenderTarget } | null = null;
/** The audio the engine was given, by track id: the one copy, let go when stale. */
let rendered: Map<string, PcmAudio> | null = null;

const setRender = (render: RenderStatus) => appStore.setState({ render });

/** Bytes held by the applied render (memory checks). */
export function renderedBytes(): number {
  let n = 0;
  for (const p of rendered?.values() ?? []) n += p.bytes;
  return n;
}

function dropRendered(): void {
  if (!rendered) return;
  rendered = null;
  void getEngine()
    .setRenderedTracks(null)
    .catch(() => {});
}

/** « Appliquer ». Resolves when applied, failed or cancelled (never rejects). */
export async function applyRender(): Promise<void> {
  const s = appStore.getState();
  if (!s.project || isOriginal(s) || s.tracks.length === 0) return;
  cancelRender();
  dropRendered();
  const target = currentTarget(s);
  const abort = new AbortController();
  const mine = { abort, target };
  job = mine;
  const stillMine = () => job === mine && sameTarget(currentTarget(appStore.getState()), target);
  startApplyProgress();
  setRender({ status: 'rendering', target });
  try {
    const renderer = getRenderer();
    const out = new Map<string, PcmAudio>();
    const tracks = s.tracks;
    const sources = tracks.map((tr) => {
      const audio = getAudio(tr.audio.id);
      if (!audio) throw new RenderError('failed', `no audio for ${tr.id}`);
      return audio;
    });
    // A render this device could not hold is refused before any work is done (`./budget.ts`).
    if (!appliedFits(sources, target.tempoRatio)) throw new RenderError('memory', 'the applied render would not fit the device');
    // The longest tracks first, `renderer.parallel` at a time; the progress counts frames (the work is proportional).
    const order = tracks.map((_, i) => i).sort((a, b) => sources[b]!.frames - sources[a]!.frames);
    const totalFrames = sources.reduce((n, a) => n + a.frames, 0) || 1;
    const done = new Array<number>(tracks.length).fill(0);
    const report = () => setApplyProgress(done.reduce((n, f, i) => n + f * sources[i]!.frames, 0) / totalFrames);
    // « Alléger le travail pour l'appareil » (read now, for the whole render): fewer tracks at once, and each
    // one rests between its blocks for what the fewer lanes do not already take (`settings/easeLoad.ts#easePlan`).
    const ease = easePlan(Math.max(1, Math.min(renderer.parallel ?? 1, tracks.length)), currentLoadShare());
    let next = 0;
    let failure: unknown = null;
    const lane = async () => {
      while (failure === null && next < order.length) {
        const i = order[next++]!;
        try {
          const pcm = await renderer.render({
            audio: sources[i]!,
            semitones: target.semitones,
            cents: target.cents,
            tempoRatio: target.tempoRatio,
            formants: target.formants && renderer.supportsFormants,
            signal: abort.signal,
            ...(ease.duty < 1 ? { loadShare: ease.duty } : {}),
            onProgress: (f) => {
              done[i] = Math.max(done[i]!, Math.min(1, Math.max(0, f)));
              report();
            },
          });
          done[i] = 1;
          report();
          out.set(tracks[i]!.id, pcm);
        } catch (e) {
          // The first failure is the one reported; the other lanes are stopped.
          if (failure === null) failure = e;
          abort.abort();
        }
      }
    };
    const lanes = ease.units;
    await Promise.all(Array.from({ length: lanes }, lane));
    if (failure !== null) throw failure;
    if (!stillMine()) return;
    try {
      await getEngine().setRenderedTracks({
        semitones: target.semitones,
        cents: target.cents,
        tempoRatio: target.tempoRatio,
        tracks: tracks.map((tr) => ({ id: tr.id, pcm: out.get(tr.id)! })),
      });
    } catch (e) {
      throw new RenderError('unsupported', e instanceof Error ? e.message : String(e));
    }
    if (!stillMine()) {
      void getEngine().setRenderedTracks(null).catch(() => {});
      return;
    }
    rendered = out;
    setApplyProgress(1);
    setRender({ status: 'applied', target });
    void keepRender(target, tracks.map((tr) => tr.id), out);
  } catch (e) {
    if (job !== mine) return;
    const code = e instanceof RenderError ? e.code : 'failed';
    setRender(code === 'cancelled' ? { status: 'none' } : { status: 'error', target, code });
  } finally {
    if (job === mine) job = null;
  }
}

/** « Annuler » on the waiting screen: back to the preview. */
export function cancelRender(): void {
  if (!job) return;
  job.abort.abort();
  job = null;
  if (appStore.getState().render.status === 'rendering') setRender({ status: 'none' });
}

/**
 * Keeps the render honest: as soon as the key, the tempo, the formants or the
 * tracks change, a render in progress is cancelled and an applied one dropped
 * (back to the preview). Called once at start-up; returns the unsubscribe function.
 */
export function startRenderWatch(): () => void {
  return appStore.subscribe((s, prev) => {
    if (s.render.status === 'none') return;
    if (s.project?.id !== prev.project?.id || !s.project) {
      cancelRender();
      dropRendered();
      if (appStore.getState().render.status !== 'none') setRender({ status: 'none' });
      return;
    }
    if (
      s.playback === prev.playback &&
      s.tracks === prev.tracks &&
      s.settings.advanced.formants === prev.settings.advanced.formants
    ) {
      return;
    }
    const target = s.render.target;
    if (sameTarget(target, currentTarget(s))) return;
    if (s.render.status === 'rendering') cancelRender();
    dropRendered();
    if (appStore.getState().render.status !== 'none') setRender({ status: 'none' });
  });
}

/** Version 5: when the live settings come back to the kept render's target, it is heard again. Returns the unsubscribe function. */
export function startKeptRenderWatch(): () => void {
  return appStore.subscribe((s, prev) => {
    if (!s.keptRender || s.render.status !== 'none') return;
    // Only once the engine has the tracks (a piece being opened is not ready yet).
    if (s.transport.engine !== 'ready' && s.transport.engine !== 'playing') return;
    if (
      s.playback === prev.playback &&
      s.tracks === prev.tracks &&
      s.keptRender === prev.keptRender &&
      s.settings.advanced.formants === prev.settings.advanced.formants &&
      s.render === prev.render &&
      s.transport.engine === prev.transport.engine
    ) {
      return;
    }
    if (sameTarget(s.keptRender.target, currentTarget(s))) void reviveKeptRender();
  });
}

/** The applied audio of a track, when the render in place matches the current state (the export reuses it). */
export function appliedAudioFor(s: AppState, trackId: string): PcmAudio | null {
  if (selectApplyState(s) !== 'applied') return null;
  return rendered?.get(trackId) ?? null;
}

// ---------------------------------------------------------------- the render kept with the piece (version 5)

/** The samples of the kept render, by track id: in memory while applied, else on the device. */
export function keptRenderAudio(): Map<string, PcmAudio> | null {
  return rendered;
}

/**
 * Keeps the render just applied with the piece: in the document (`keptRender`)
 * and, for a piece kept on the device, its samples next to it; the previous
 * kept render's samples are deleted once the new ones are written.
 */
async function keepRender(target: RenderTarget, trackIds: readonly string[], out: Map<string, PcmAudio>): Promise<void> {
  const s = appStore.getState();
  const project = s.project;
  if (!project) return;
  const stamp = newId();
  const kept: KeptRender = {
    target,
    renderedAt: new Date().toISOString(),
    tracks: trackIds.map((trackId, i) => {
      const pcm = out.get(trackId)!;
      return { trackId, audioId: `${stamp}-rendu-${i}`, frames: pcm.frames, channels: pcm.channelCount };
    }),
  };
  const previous = s.keptRender;
  const keeper = getKeeper();
  await keeper.settled();
  if (appStore.getState().project?.id !== project.id) return;
  if (keeper.attachedProject === project.id) {
    const storage = getProjectStorage();
    try {
      for (const t of kept.tracks) await storage.saveTrackAudio(t.audioId, out.get(t.trackId)!);
    } catch (e) {
      // Not kept on the device: it plays now, and will be offered again after a relaunch. A full device is
      // said calmly (the piece itself stays kept); the partial copy is dropped.
      if ((e as { code?: string } | null)?.code === 'quota') appStore.setState((st) => ({ ui: { ...st.ui, storageNotice: 'renderFull' } }));
      await storage.deleteTrackAudio(kept.tracks.map((t) => t.audioId)).catch(() => {});
      return;
    }
    if (previous) void storage.deleteTrackAudio(previous.tracks.map((t) => t.audioId)).catch(() => {});
  }
  if (appStore.getState().project?.id !== project.id) return;
  appStore.setState({ keptRender: kept });
}

let reviving: Promise<boolean> | null = null;

/**
 * Hears the kept render again when the live settings are its target: read
 * back from `source` (an opened `.fab` file) or the device, within the memory
 * budget of a new render. Does nothing otherwise; never rejects. One attempt
 * at a time: a call made meanwhile waits for it, then tries in turn.
 */
export async function reviveKeptRender(source?: ReadonlyMap<string, PcmAudio>): Promise<boolean> {
  while (reviving) await reviving;
  const attempt = reviveOnce(source);
  reviving = attempt;
  try {
    return await attempt;
  } finally {
    if (reviving === attempt) reviving = null;
  }
}

async function reviveOnce(source?: ReadonlyMap<string, PcmAudio>): Promise<boolean> {
  const s = appStore.getState();
  const kept = s.keptRender;
  if (!kept || s.render.status !== 'none' || isOriginal(s) || !sameTarget(kept.target, currentTarget(s))) return false;
  const projectId = s.project?.id;
  try {
    const sources = s.tracks.map((tr) => getAudio(tr.audio.id));
    if (sources.some((a) => !a) || !appliedFits(sources as PcmAudio[], kept.target.tempoRatio)) return false;
    const out = new Map<string, PcmAudio>();
    for (const t of kept.tracks) {
      const pcm = source?.get(t.audioId) ?? (await getProjectStorage().loadTrackAudio(t.audioId));
      if (!pcm) return false;
      out.set(t.trackId, pcm);
    }
    const now = appStore.getState();
    if (now.project?.id !== projectId || now.render.status !== 'none' || !sameTarget(kept.target, currentTarget(now))) return false;
    await getEngine().setRenderedTracks({
      semitones: kept.target.semitones,
      cents: kept.target.cents,
      tempoRatio: kept.target.tempoRatio,
      tracks: now.tracks.map((tr) => ({ id: tr.id, pcm: out.get(tr.id)! })),
    });
    rendered = out;
    setRender({ status: 'applied', target: kept.target });
    return true;
  } catch {
    return false;
  }
}

/** « Libérer » the kept render (« Place sur cet appareil »): forgotten, memory and device; the original stays. */
export async function forgetKeptRender(): Promise<void> {
  const kept = appStore.getState().keptRender;
  if (!kept) return;
  if (appStore.getState().render.status === 'applied') {
    dropRendered();
    setRender({ status: 'none' });
  }
  appStore.setState({ keptRender: null });
  try {
    await getProjectStorage().deleteTrackAudio(kept.tracks.map((t) => t.audioId));
  } catch {
    // swept at the next launch
  }
}
