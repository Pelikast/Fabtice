// « Projet Ableton Live… » (C15.5): the content of the folder.
//
//   <titre>.als                     the set for Live 11 and 12 (`live11`);
//   <titre> (Live 10).als           the same set for Live 10 (`live10`);
//   Samples/Imported/01 Morceau.wav every track shown (`export/sequencer/`, as
//                                   for Logic: unity gain, key and tempo chosen,
//                                   Wave 48 kHz 16 bits, all one length, from 0),
//                                   where Live puts the files of a project;
//   <titre>.mid                     the session's MIDI file (the safe fallback);
//   Lisez-moi.txt                   which set for which Live, missing files, fallback.
//
// The folder is named « <titre> Project » (with the key and tempo changes), as
// Live names the folder of a project: nothing shows that Live needs it, but it
// is the shape a Live user knows. No « Ableton Project Info » folder: its file
// is Live's own binary format, which is not written here (ALS-FORMAT.md).
//
// `planAbletonFolder()` is pure; `runAbletonExport()` renders the tracks,
// then writes the two sets with each file's size and checksum (and, in the Mac
// app, its full path), then the MIDI file and the read-me.

import type { AppState } from '../../store/store';
import { changesSuffix, ExportError, safeFileName } from '../audio';
import type { FolderTarget } from '../folder';
import { sessionToMidi } from '../midi';
import { planSequencerTracks, renderSequencerTracks, type SequencerRenderDeps, type SequencerTrackFile } from '../sequencer';
import { buildSession, type Session } from '../session';
import { LIVE_CRC_BYTES, liveFileCrc } from './crc';
import { SAMPLES_FOLDER, sessionToAbleton, type AbletonFileFacts, type AbletonNote } from './fromSession';
import { gzipLive } from './gzip';
import { buildLiveSet } from './liveSet';
import { abletonReadme } from './readme';
import { LIVE_TEMPO_MAX, LIVE_TEMPO_MIN } from './tempo';
import type { AbletonWarning } from './types';

export const ABLETON_README_NAME = 'Lisez-moi.txt';
/** The tempos Live accepts: the session's lead-in stays inside. */
export const LIVE_TEMPO_RANGE = { min: LIVE_TEMPO_MIN, max: LIVE_TEMPO_MAX } as const;

export interface AbletonFolderPlan {
  session: Session;
  folderName: string;
  /** « Titre.als », for Live 11 and 12. */
  setName: string;
  /** « Titre (Live 10).als ». */
  set10Name: string;
  midiName: string;
  tracks: SequencerTrackFile[];
  /** « (+2 demi-tons, tempo 90 %) » or ''. */
  changes: string;
  /** What is written differently for Live (signatures over 32). */
  notes: AbletonNote[];
  /** What the writer reports (tempo clamped…), from a first build without the files' facts. */
  warnings: AbletonWarning[];
}

/** What the folder will hold. Throws `ExportError('nothing')` without a piece or a track. */
export function planAbletonFolder(s: AppState): AbletonFolderPlan {
  if (!s.project || s.tracks.length === 0) throw new ExportError('nothing', 'no piece');
  const session = buildSession(s, { tempoRange: LIVE_TEMPO_RANGE });
  const { semitones, cents, tempoRatio } = s.playback;
  const changes = changesSuffix(semitones, cents, tempoRatio);
  const title = safeFileName(s.project.title);
  const { input, notes } = sessionToAbleton(session);
  const { warnings } = buildLiveSet(input);
  return {
    session,
    folderName: safeFileName(`${title}${changes} Project`),
    setName: `${title}.als`,
    set10Name: `${title} (Live 10).als`,
    midiName: `${title}.mid`,
    tracks: planSequencerTracks(s, session, SAMPLES_FOLDER),
    changes,
    notes,
    warnings,
  };
}

/** The two sets, with what is known of each file (`facts`, by track id). */
export async function abletonSetFiles(plan: AbletonFolderPlan, facts: Record<string, AbletonFileFacts> = {}): Promise<{ name: string; data: Blob }[]> {
  const out: { name: string; data: Blob }[] = [];
  for (const [target, name] of [['live11', plan.setName], ['live10', plan.set10Name]] as const) {
    const { input } = sessionToAbleton(plan.session, { target, files: facts });
    const bytes = await gzipLive(new TextEncoder().encode(buildLiveSet(input).xml));
    out.push({ name, data: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }) });
  }
  return out;
}

/** The small files: the MIDI file and the read-me. */
export function abletonTextFiles(plan: AbletonFolderPlan, folderName = plan.folderName): { name: string; data: Blob }[] {
  const midi = sessionToMidi(plan.session);
  const readme = abletonReadme(
    plan.session,
    {
      set: plan.setName,
      set10: plan.set10Name,
      midi: plan.midiName,
      tracks: plan.tracks.map((tr) => tr.name.slice(SAMPLES_FOLDER.length + 1)),
      samples: SAMPLES_FOLDER,
      folder: folderName,
      changes: plan.changes,
    },
    plan.notes,
    plan.warnings,
  );
  return [
    { name: plan.midiName, data: new Blob([midi.bytes as Uint8Array<ArrayBuffer>], { type: 'audio/midi' }) },
    // UTF-8 with its mark: TextEdit and Quick Look then never guess another encoding.
    { name: ABLETON_README_NAME, data: new Blob(['﻿', readme], { type: 'text/plain;charset=utf-8' }) },
  ];
}

/** What a set says of a file just made: its size, Live's checksum, its full path when the folder has one. */
export async function fileFacts(blob: Blob, relative: string, folderPath: string | null, now = Date.now()): Promise<AbletonFileFacts> {
  const head = new Uint8Array(await blob.slice(0, LIVE_CRC_BYTES).arrayBuffer());
  return {
    fileSize: blob.size,
    crc: liveFileCrc(head),
    // Written now: the file's date, to the second (the web's archive dates its entries the same way).
    lastModified: Math.floor(now / 1000),
    ...(folderPath ? { absolutePath: `${folderPath.replace(/\/+$/, '')}/${relative}` } : {}),
  };
}

/**
 * Renders the tracks one by one into `Samples/Imported/`, then adds the two sets, the MIDI file and the read-me.
 * Progress 0…1. Rejects with `ExportError` (`cancelled` on abort); the caller aborts the target then.
 */
export async function runAbletonExport(plan: AbletonFolderPlan, target: FolderTarget, deps: SequencerRenderDeps): Promise<void> {
  const facts: Record<string, AbletonFileFacts> = {};
  await renderSequencerTracks(plan.tracks, plan.session.frames, target, deps, {
    share: 0.98,
    onFile: async (tr, blob) => {
      facts[tr.trackId] = await fileFacts(blob, tr.name, target.fullPath);
    },
  });
  if (deps.signal?.aborted) throw new ExportError('cancelled');
  for (const f of await abletonSetFiles(plan, facts)) await target.add(f, { signal: deps.signal });
  deps.onProgress?.(0.99);
  for (const f of abletonTextFiles(plan, target.folderName)) await target.add(f, { signal: deps.signal });
  deps.onProgress?.(1);
}
