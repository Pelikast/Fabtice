// « Dossier pour Logic Pro… » (C15.4): the content of the folder.
//
//   01 Morceau.wav, 02 Voix.wav…   every track shown, at unity gain (volume,
//                                   mute and solo do not apply), in the key and
//                                   tempo chosen (best engine, or the applied
//                                   render when it matches), Wave 48 kHz 16 bits,
//                                   all exactly `session.frames` long, from 0;
//   <title>.mid                     the session's MIDI file (`export/midi/`);
//   Lisez-moi.txt                   the three gestures (`readme.ts`).
//
// `planLogicFolder()` is pure (tested in Node); `runLogicExport()` renders the
// tracks one at a time and hands each file to the folder target as soon as it
// is made (`export/folder/`).

import { t } from '../../i18n';
import type { PcmAudio } from '../../audio/pcm';
import type { OfflineRenderer } from '../../render/types';
import type { AppState } from '../../store/store';
import { changesSuffix, ExportError, planAudioExport, runAudioExport, safeFileName, type ExportPlan } from '../audio';
import type { FolderTarget } from '../folder';
import { sessionToMidi } from '../midi';
import { buildSession, type Session } from '../session';
import { logicReadme } from './readme';
import { fixedLengthWav } from './wavFixed';

export { logicGestures, logicReadme, logicBarOfFirstBar } from './readme';
export { fixedLengthWav } from './wavFixed';

export const README_NAME = 'Lisez-moi.txt';

export interface LogicTrackFile {
  trackId: string;
  name: string;
  /** The audio export plan of this one file (unity gain, whole piece, wav). */
  plan: ExportPlan;
}

export interface LogicFolderPlan {
  session: Session;
  folderName: string;
  midiName: string;
  tracks: LogicTrackFile[];
  /** « (+2 demi-tons, tempo 90 %) » or ''. */
  changes: string;
}

/** What the folder will hold. Throws `ExportError('nothing')` without a piece or a track. */
export function planLogicFolder(s: AppState): LogicFolderPlan {
  if (!s.project || s.tracks.length === 0) throw new ExportError('nothing', 'no piece');
  const session = buildSession(s);
  const { semitones, cents, tempoRatio } = s.playback;
  const changes = changesSuffix(semitones, cents, tempoRatio);
  const title = safeFileName(s.project.title);
  const folderName = safeFileName(`${title} – ${t('exportLogic.folderSuffix')}${changes}`);
  const midiName = `${safeFileName(title)}.mid`;
  // The whole piece, one track a file, wav: the audio export's own plan, then its file named as the session says.
  const prefs = { ...s.exportPrefs, format: 'wav' as const, what: 'tracks' as const, range: 'whole' as const };
  const tracks = session.tracks.map((tr) => {
    const plan = planAudioExport(s, prefs, [tr.id]);
    const name = `${tr.fileStem}.wav`;
    return { trackId: tr.id, name, plan: { ...plan, archiveName: null, files: [{ name, title: tr.fileStem, sources: [{ trackId: tr.id, audioId: tr.audioId, gain: 1 }] }] } };
  });
  return { session, folderName, midiName, tracks, changes };
}

export interface LogicExportDeps {
  renderer: OfflineRenderer;
  audioOf: (audioId: string) => PcmAudio | undefined;
  appliedOf?: (trackId: string) => PcmAudio | null;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** The small files of the folder: the MIDI file and the read-me. */
export function logicTextFiles(plan: LogicFolderPlan): { name: string; data: Blob }[] {
  const midi = sessionToMidi(plan.session);
  const readme = logicReadme(plan.session, { tracks: plan.tracks.map((tr) => tr.name), midi: plan.midiName, changes: plan.changes });
  return [
    { name: plan.midiName, data: new Blob([midi.bytes as Uint8Array<ArrayBuffer>], { type: 'audio/midi' }) },
    // UTF-8 with its mark: TextEdit and Quick Look then never guess another encoding.
    { name: README_NAME, data: new Blob(['﻿', readme], { type: 'text/plain;charset=utf-8' }) },
  ];
}

/**
 * Renders the tracks one by one and adds each file to `target`, then the MIDI file and the read-me. Progress
 * 0…1 (rendering is nearly all of it). Rejects with `ExportError` (`cancelled` on abort); the caller aborts
 * the target then.
 */
export async function runLogicExport(plan: LogicFolderPlan, target: FolderTarget, deps: LogicExportDeps): Promise<void> {
  const n = plan.tracks.length;
  const report = (f: number) => deps.onProgress?.(Math.min(1, Math.max(0, f)));
  const encoder = fixedLengthWav(plan.session.frames);
  for (let i = 0; i < n; i++) {
    if (deps.signal?.aborted) throw new ExportError('cancelled');
    const tr = plan.tracks[i]!;
    const file = await runAudioExport(tr.plan, {
      renderer: deps.renderer,
      audioOf: deps.audioOf,
      appliedOf: deps.appliedOf,
      encoderFor: () => encoder,
      signal: deps.signal,
      onProgress: (f) => report(((i + 0.95 * f) / n) * 0.99),
    });
    if (deps.signal?.aborted) throw new ExportError('cancelled');
    await target.add({ name: tr.name, data: file.blob }, { signal: deps.signal, onProgress: (f) => report(((i + 0.95 + 0.05 * f) / n) * 0.99) });
  }
  for (const f of logicTextFiles(plan)) await target.add(f, { signal: deps.signal });
  report(1);
}
