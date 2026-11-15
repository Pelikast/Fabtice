// « Ouvrir un projet… »: a `.fab` file replaces the open piece exactly as an
// import does.
//
//   - Everything is checked BEFORE the open piece is touched: the manifest and
//     the document (migrated if older, refused if too recent), the CRC of every
//     entry (the whole file is read once by slices), the original audio
//     (decoded), the current separation's instruments (decoded from FLAC
//     straight into 16-bit blocks). A damaged file ends on a calm sentence; the
//     piece open and the one kept on the device stay as they were.
//   - Then the project is restored as it was saved, under its ids: grid, key,
//     corrections, chords, loops and markers, metronome, view, instruments.
//     The analysis does not run again (it only runs for a piece that has none).
//   - Then it becomes the piece kept on the device (`keeper.keepNewProject`):
//     the current instruments are written next to it, then each other
//     separation is decoded, written and let go (one at a time: memory), then
//     the kept render, which is heard at once when the key and tempo are its own.
//   - Instruments that cannot be read: the piece opens whole and one sentence
//     says so, as at launch.

import { yieldToMain, type PcmAudio } from '../audio/pcm';
import { dropAudio, registerAudio, toPcm, type DecodedAudio } from '../audio/registry';
import { t } from '../i18n';
import { decodeAudioBytes } from '../import/decode';
import { ImportError, type ImportProgress } from '../import/types';
import type { ProjectDocument } from '../model/document';
import type { Track } from '../model/project';
import { reviveKeptRender } from '../render/controller';
import { getKeeper, getProjectStorage } from '../storage';
import type { StoredAudio } from '../storage/ProjectStorage';
import { wholePieceOf } from '../storage/restore';
import { restoreProject, setStorageNotice } from '../store/actions';
import { dropOtherSeparation, setImportStems, setSeparationNotice } from '../store/separationActions';
import { appStore } from '../store/store';
import { FILE_EXTENSION, MIMETYPE_ENTRY, openProjectFile, PROJECT_MIME, ProjectFileError, type OpenedProjectFile } from './fileFormat';
import type { ByteSource } from './zip';

/** True for a name that says « Fabtice project ». */
export function isProjectFileName(name: string): boolean {
  return name.toLowerCase().endsWith(FILE_EXTENSION);
}

/** True when the first bytes are those of a `.fab` file (a project renamed, or dropped without its extension). */
export async function looksLikeProjectFile(source: ByteSource): Promise<boolean> {
  const sig = MIMETYPE_ENTRY + PROJECT_MIME;
  if (source.size < 30 + sig.length) return false;
  try {
    const head = await source.read(0, 30 + sig.length);
    return head[0] === 0x50 && head[1] === 0x4b && new TextDecoder('latin1').decode(head.subarray(30)) === sig;
  } catch {
    return false;
  }
}

export interface OpenDeps {
  /** Replaces the real decoder (tests). */
  decode?: (stored: StoredAudio, onFraction: (fraction: number | null) => void) => Promise<DecodedAudio>;
}

function fileError(e: unknown): never {
  if (e instanceof ProjectFileError) {
    if (e.code === 'too-recent') throw new ImportError('project-too-recent', e.message);
    if (e.code === 'not-project') throw new ImportError('project-not-project', e.message);
    throw new ImportError('project-damaged', e.message);
  }
  throw e;
}

const separatedOf = (tracks: readonly Track[]) => tracks.filter((tr) => tr.audio.origin === 'separated');

/**
 * Opens the project file `source` (named `name`) in place of the open piece.
 * Progress goes to `onProgress` (phase `opening`); rejects with an
 * `ImportError` (`project-damaged`, `project-too-recent`, `project-not-project`,
 * `decode-failed`, `prepare-failed`, `cancelled`…) without having touched the
 * open piece, except for `prepare-failed` (the engine refused the new piece:
 * as for an import, nothing is open then, and the kept piece is untouched).
 */
export async function openProjectSource(
  source: ByteSource,
  name: string,
  options: { onProgress?: (p: ImportProgress) => void; signal?: AbortSignal } = {},
  deps: OpenDeps = {},
): Promise<void> {
  const { onProgress, signal } = options;
  let title = name.replace(/\.fab$/i, '');
  const show = (step: 'reading' | 'decoding' | 'instruments' | 'preparing', fraction: number | null) => onProgress?.({ phase: 'opening', fraction, title, step });
  const aborted = () => {
    if (signal?.aborted) throw new ImportError('cancelled');
  };
  show('reading', null);
  let file: OpenedProjectFile;
  try {
    file = await openProjectFile(source);
    title = file.document.project.title;
    // Every entry checked once, before anything is replaced: the steps after this one cannot meet damage.
    await file.verify((f) => show('reading', f));
  } catch (e) {
    fileError(e);
  }
  let doc: ProjectDocument = file.document;
  aborted();

  // The original audio: read, decoded (as a kept piece is at launch).
  const audio = new Map<string, PcmAudio | DecodedAudio>();
  const originals = new Map<string, StoredAudio>();
  const decode =
    deps.decode ??
    ((stored: StoredAudio, onFraction: (fraction: number | null) => void) => decodeAudioBytes(stored.bytes, { signal, onProgress: (p) => onFraction(p.fraction) }));
  for (const track of [...doc.tracks, ...doc.separation.aside].filter((tr) => tr.audio.origin !== 'separated')) {
    if (originals.has(track.audio.id)) continue;
    let stored: StoredAudio;
    try {
      stored = await file.readOriginal(track.audio.id);
    } catch (e) {
      fileError(e);
    }
    aborted();
    show('decoding', null);
    const decoded = await decode(stored, (fraction) => show('decoding', fraction));
    aborted();
    audio.set(track.audio.id, toPcm(decoded));
    originals.set(track.audio.id, stored);
  }

  // The current separation's instruments. One that cannot be read: the piece opens whole.
  const current = separatedOf([...doc.tracks, ...doc.separation.aside]);
  let instrumentsLost = false;
  try {
    for (const [i, track] of current.entries()) {
      show('instruments', i / Math.max(1, current.length));
      audio.set(track.audio.id, await file.readTrack(track.audio.id, (f) => show('instruments', (i + f) / current.length)));
      aborted();
      await yieldToMain();
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    instrumentsLost = true;
    for (const tr of current) audio.delete(tr.audio.id);
    doc = wholePieceOf(doc);
  }
  aborted();

  // From here on, the open piece is replaced.
  show('preparing', null);
  const keeper = getKeeper();
  keeper.detach();
  // Instruments ticked in the dialog are for an import: the project comes with its own.
  setImportStems([]);
  try {
    await restoreProject(doc, audio);
  } catch (e) {
    throw new ImportError('prepare-failed', e instanceof Error ? e.message : String(e));
  }
  if (instrumentsLost) setSeparationNotice(t('project.instrumentsLost'));

  // Kept on the device, as an import is; then its tracks, as a separation and « Appliquer » write them.
  const id = doc.project.id;
  await keeper.keepNewProject(originals);
  const kept = keeper.attachedProject === id;
  const storage = getProjectStorage();
  const still = () => appStore.getState().project?.id === id;
  let deviceFailed = false;
  const store = async (audioId: string, pcm: PcmAudio): Promise<boolean> => {
    if (!kept || deviceFailed) return false;
    try {
      await storage.saveTrackAudio(audioId, pcm);
      return true;
    } catch (e) {
      deviceFailed = true;
      setStorageNotice(e instanceof Error && (e as { code?: string }).code === 'quota' ? 'full' : 'unavailable');
      return false;
    }
  };
  if (!instrumentsLost) for (const tr of current) await store(tr.audio.id, audio.get(tr.audio.id) as PcmAudio);

  // The other separations: decoded one at a time, written on the device, let go (kept in memory if the device refuses).
  for (const other of doc.separation.others) {
    if (!still()) return;
    try {
      for (const tr of other.tracks) {
        const pcm = await file.readTrack(tr.audio.id);
        const onDevice = await store(tr.audio.id, pcm);
        if (!onDevice) registerAudio(tr.audio.id, pcm);
        await yieldToMain();
      }
    } catch {
      for (const tr of other.tracks) dropAudio(tr.audio.id);
      const gone = dropOtherSeparation(other.result.id);
      void storage.deleteTrackAudio(gone).catch(() => {});
    }
  }

  // The kept render: written on the device, and heard now if the key and tempo are its own.
  const render = doc.keptRender;
  if (render && still()) {
    const renderAudio = new Map<string, PcmAudio>();
    try {
      for (const r of render.tracks) {
        const pcm = await file.readTrack(r.audioId);
        renderAudio.set(r.audioId, pcm);
        await store(r.audioId, pcm);
      }
      await reviveKeptRender(renderAudio);
    } catch {
      appStore.setState({ keptRender: null });
    }
  }
}
