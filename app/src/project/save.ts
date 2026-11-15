// « Enregistrer le projet… »: the open piece as a `.fabtice` file, handed over
// as a link (`export/audio/deliver.ts`): a download in a browser, the macOS
// save panel in the Mac app (`desktop/src/downloads.js`).
//
// What goes in: the document as it is now, the original audio as it was
// imported (read back from the device, where the keeper wrote it), and, when
// asked, the separated instruments as they are in memory. The bytes are
// produced piece by piece and gathered in a `Blob` made of `Blob`s: the
// browser may keep them on disk, and no copy of the whole file is ever made
// in the page.

import { yieldToMain, type PcmAudio } from '../audio/pcm';
import { getAudio } from '../audio/registry';
import type { ProjectDocument } from '../model/document';
import { getKeeper, getProjectStorage } from '../storage';
import type { StoredAudio } from '../storage/ProjectStorage';
import { wholePieceOf } from '../storage/restore';
import { toProjectDocument } from '../store/document';
import { appStore, type AppState } from '../store/store';
import { instrumentsFileBytes, PROJECT_MIME, projectFileName, projectFileSize, writeProjectFile, type ProjectFileInput } from './fileFormat';
import { ZIP_LIMIT, type ByteSink } from './zip';

export type SaveRefusal =
  /** No piece open. */
  | 'no-project'
  /** The demonstration piece is never kept, nor saved. */
  | 'demo'
  /** The piece is not (yet) kept on the device: its original audio is not there to be read back. */
  | 'not-kept';

export class ProjectSaveError extends Error {
  constructor(
    readonly code: SaveRefusal | 'too-large' | 'failed' | 'cancelled',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ProjectSaveError';
  }
}

/** Why the open piece cannot be saved, or null when it can. */
export function saveRefusal(s: AppState = appStore.getState(), attached: string | null = getKeeper().attachedProject): SaveRefusal | null {
  if (!s.project) return 'no-project';
  if (s.project.source.kind === 'demo') return 'demo';
  if (attached !== s.project.id) return 'not-kept';
  return null;
}

const separatedOf = (doc: ProjectDocument) => [...doc.tracks, ...doc.separation.aside].filter((tr) => tr.audio.origin === 'separated');

/** The instruments of the open piece, in memory (empty when it is not separated). */
export function openInstruments(s: AppState = appStore.getState()): PcmAudio[] {
  return [...s.tracks, ...s.separation.aside]
    .filter((tr) => tr.audio.origin === 'separated')
    .map((tr) => getAudio(tr.audio.id))
    .filter((a): a is PcmAudio => !!a);
}

/** Bytes « avec les instruments séparés » adds to the file. */
export function instrumentsBytes(s: AppState = appStore.getState()): number {
  return instrumentsFileBytes(openInstruments(s));
}

/** What the file will hold: the document (whole piece only, without the instruments), the originals read from the device. */
export async function gatherProject(withInstruments: boolean, s: AppState = appStore.getState()): Promise<ProjectFileInput> {
  const refusal = saveRefusal(s);
  if (refusal) throw new ProjectSaveError(refusal);
  let document = toProjectDocument(s)!;
  const instruments = new Map<string, PcmAudio>();
  if (withInstruments) {
    for (const tr of separatedOf(document)) {
      const pcm = getAudio(tr.audio.id);
      if (!pcm) throw new ProjectSaveError('failed', `instrument ${tr.audio.id} not in memory`);
      instruments.set(tr.audio.id, pcm);
    }
  }
  if (instruments.size === 0) document = wholePieceOf(document);
  const originals = new Map<string, StoredAudio>();
  for (const tr of [...document.tracks, ...document.separation.aside]) {
    if (tr.audio.origin === 'separated' || originals.has(tr.audio.id)) continue;
    const stored = await getProjectStorage().loadAudio(tr.audio.id);
    if (!stored) throw new ProjectSaveError('not-kept', `no stored audio ${tr.audio.id}`);
    originals.set(tr.audio.id, stored);
  }
  return { document, originals, instruments };
}

/** A sink that gathers the bytes in small `Blob`s (8 MB each), then one `Blob` of them. */
export function blobSink(type = PROJECT_MIME): ByteSink & { blob(): Blob } {
  const parts: Blob[] = [];
  let pending: Uint8Array<ArrayBuffer>[] = [];
  let pendingBytes = 0;
  const flush = () => {
    if (pending.length) parts.push(new Blob(pending));
    pending = [];
    pendingBytes = 0;
  };
  return {
    write(chunk) {
      pending.push(chunk);
      pendingBytes += chunk.length;
      if (pendingBytes >= 8 * 1024 * 1024) flush();
    },
    blob() {
      flush();
      return new Blob(parts, { type });
    },
  };
}

export interface SaveOptions {
  withInstruments: boolean;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** The open piece as a `.fabtice` file. Rejects with a `ProjectSaveError`. */
export async function buildProjectFile(options: SaveOptions): Promise<{ blob: Blob; name: string }> {
  const input = await gatherProject(options.withInstruments);
  if (projectFileSize(input) > ZIP_LIMIT) throw new ProjectSaveError('too-large');
  const sink = blobSink();
  try {
    await writeProjectFile(input, sink, { onProgress: options.onProgress, signal: options.signal, tick: yieldToMain });
  } catch (e) {
    if (options.signal?.aborted) throw new ProjectSaveError('cancelled');
    throw new ProjectSaveError((e as { code?: string }).code === 'too-large' ? 'too-large' : 'failed', e instanceof Error ? e.message : String(e));
  }
  return { blob: sink.blob(), name: projectFileName(input.document.project.title) };
}

/** Size of the file without and with the instruments (null: nothing separated), for the dialog. Reads the originals once. */
export async function plannedSizes(s: AppState = appStore.getState()): Promise<{ whole: number; withInstruments: number | null }> {
  const full = await gatherProject(true, s);
  const whole = projectFileSize({ document: wholePieceOf(full.document), originals: full.originals, instruments: new Map() });
  return { whole, withInstruments: full.instruments.size ? projectFileSize(full) : null };
}
