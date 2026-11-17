// What the sequencer folders share (« Dossier pour Logic Pro… » C15.4,
// « Projet Ableton Live… » C15.5): the tracks, each one a Wave file.
//
//   - every track shown, at unity gain (volume, mute and solo do not apply),
//     in the key and tempo chosen (best engine, or the applied render when it
//     matches), Wave 48 kHz 16 bits whatever the « Audio… » window was left on,
//     all exactly `session.frames` long, from 0;
//   - rendered one at a time and handed to the folder as soon as each is made.
//
// `planSequencerTracks()` is pure; `renderSequencerTracks()` drives the
// offline renderer (`export/audio/`).

import { defaultExportPreferences } from '../../model/audioExport';
import type { PcmAudio } from '../../audio/pcm';
import type { OfflineRenderer } from '../../render/types';
import type { AppState } from '../../store/store';
import { ExportError, planAudioExport, runAudioExport, type ExportPlan } from '../audio';
import type { FolderTarget } from '../folder';
import { fixedLengthWav } from '../logic/wavFixed';
import type { Session } from '../session';

export interface SequencerTrackFile {
  trackId: string;
  /** Its name in the folder: « 01 Morceau.wav », or « Samples/Imported/01 Morceau.wav » with a sub-folder. */
  name: string;
  /** The audio export plan of this one file (unity gain, whole piece, wav). */
  plan: ExportPlan;
}

/** One Wave file per track of the session, in `folder` (« Samples/Imported », or '' for the folder itself). */
export function planSequencerTracks(s: AppState, session: Session, folder = ''): SequencerTrackFile[] {
  // The whole piece, one track a file, wav at the app's own rate and depth (48 kHz, 16 bits) whatever the
  // « Audio… » window was left on: the audio export's own plan, then its file named as the session says.
  const prefs = { ...defaultExportPreferences(), format: 'wav' as const, what: 'tracks' as const, range: 'whole' as const };
  return session.tracks.map((tr) => {
    const plan = planAudioExport(s, prefs, [tr.id]);
    const file = `${tr.fileStem}.wav`;
    const name = folder ? `${folder}/${file}` : file;
    return { trackId: tr.id, name, plan: { ...plan, archiveName: null, files: [{ name: file, title: tr.fileStem, sources: [{ trackId: tr.id, audioId: tr.audioId, gain: 1 }] }] } };
  });
}

export interface SequencerRenderDeps {
  renderer: OfflineRenderer;
  audioOf: (audioId: string) => PcmAudio | undefined;
  appliedOf?: (trackId: string) => PcmAudio | null;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Renders the tracks one by one, each exactly `frames` long, and adds each file to `target`. Progress 0…`share`
 * (the rest is the caller's small files). `onFile` sees each file before it is handed over (its size, its first
 * bytes). Rejects with `ExportError` (`cancelled` on abort).
 */
export async function renderSequencerTracks(
  tracks: readonly SequencerTrackFile[],
  frames: number,
  target: FolderTarget,
  deps: SequencerRenderDeps,
  options: { share?: number; onFile?: (track: SequencerTrackFile, blob: Blob) => void | Promise<void> } = {},
): Promise<void> {
  const n = tracks.length;
  const share = options.share ?? 0.99;
  const report = (f: number) => deps.onProgress?.(Math.min(1, Math.max(0, f)));
  const encoder = fixedLengthWav(frames);
  for (let i = 0; i < n; i++) {
    if (deps.signal?.aborted) throw new ExportError('cancelled');
    const tr = tracks[i]!;
    const file = await runAudioExport(tr.plan, {
      renderer: deps.renderer,
      audioOf: deps.audioOf,
      appliedOf: deps.appliedOf,
      encoderFor: () => encoder,
      signal: deps.signal,
      onProgress: (f) => report(((i + 0.95 * f) / n) * share),
    });
    if (deps.signal?.aborted) throw new ExportError('cancelled');
    await options.onFile?.(tr, file.blob);
    await target.add({ name: tr.name, data: file.blob }, { signal: deps.signal, onProgress: (f) => report(((i + 0.95 + 0.05 * f) / n) * share) });
  }
}
