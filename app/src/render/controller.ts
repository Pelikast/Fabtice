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
// dropped at once (memory), the engine is back on the preview, and
// « Appliquer » is offered again. Nothing of it is saved: a relaunch starts
// in preview.
//
// Memory: the rendered audio is held here (16-bit, shared with the engine),
// one copy per shown track at the played tempo; it is the only place it
// lives, and it is let go as soon as it is stale.

import { getEngine } from '../audio';
import type { PcmAudio } from '../audio/pcm';
import { getAudio } from '../audio/registry';
import { sameTarget, type RenderErrorCode, type RenderStatus, type RenderTarget } from '../model/render';
import { appStore, type AppState } from '../store/store';
import { appliedFits } from './budget';
import { getRenderer } from './index';
import { setApplyProgress } from './progress';
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
  setApplyProgress(0);
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
    const lanes = Math.max(1, Math.min(renderer.parallel ?? 1, tracks.length));
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

/** The applied audio of a track, when the render in place matches the current state (the export reuses it). */
export function appliedAudioFor(s: AppState, trackId: string): PcmAudio | null {
  if (selectApplyState(s) !== 'applied') return null;
  return rendered?.get(trackId) ?? null;
}
