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
// is made (`export/folder/`). The tracks are those of every sequencer folder
// (`export/sequencer/`, shared with « Projet Ableton Live… »).

import { t } from '../../i18n';
import type { AppState } from '../../store/store';
import { changesSuffix, ExportError, safeFileName } from '../audio';
import type { FolderTarget } from '../folder';
import { sessionToMidi } from '../midi';
import { planSequencerTracks, renderSequencerTracks, type SequencerRenderDeps, type SequencerTrackFile } from '../sequencer';
import { buildSession, type Session } from '../session';
import { logicReadme } from './readme';

export { logicGestures, logicReadme, logicBarOfFirstBar } from './readme';
export { fixedLengthWav } from './wavFixed';

export const README_NAME = 'Lisez-moi.txt';

export type LogicTrackFile = SequencerTrackFile;

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
  return { session, folderName, midiName, tracks: planSequencerTracks(s, session), changes };
}

export type LogicExportDeps = SequencerRenderDeps;

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
  await renderSequencerTracks(plan.tracks, plan.session.frames, target, deps, { share: 0.99 });
  for (const f of logicTextFiles(plan)) await target.add(f, { signal: deps.signal });
  deps.onProgress?.(1);
}
