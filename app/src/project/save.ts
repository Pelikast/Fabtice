// « Enregistrer le projet… »: the open piece as a `.fab` file, handed over as
// a link (`export/audio/deliver.ts`): a download in a browser, the macOS save
// panel in the Mac app (`desktop/src/downloads.js`).
//
// What goes in (owner's decisions of 15 November): the document as it is now,
// the original audio as it was imported (read back from the device, where the
// keeper wrote it), EVERY separation of the piece and the kept render, these
// in lossless FLAC (libFLAC, the export's encoder, in workers). Tracks that are
// not in memory (the other separations, a render not heard now) are read from
// the device when their turn comes. The bytes are gathered in a `Blob` made of
// `Blob`s: the browser may keep them on disk.

import { yieldToMain, type PcmAudio } from '../audio/pcm';
import { getAudio } from '../audio/registry';
import { getEncoder } from '../export/audio/encoders';
import { keptRenderAudio } from '../render/controller';
import { getKeeper, getProjectStorage } from '../storage';
import type { StoredAudio } from '../storage/ProjectStorage';
import { toProjectDocument } from '../store/document';
import { appStore, type AppState } from '../store/store';
import { PROJECT_MIME, ProjectFileError, projectFileName, trackEntries, writeProjectFile, type FlacEncode, type LazyOriginal, type ProjectFileInput, type ProjectManifest } from './fileFormat';
import type { ByteSink } from './zip';

export type SaveRefusal =
  /** No piece open. */
  | 'no-project'
  /** The demonstration piece is never kept, nor saved. */
  | 'demo'
  /** The piece is not (yet) kept on the device: its original audio is not there to be read back. */
  | 'not-kept';

export class ProjectSaveError extends Error {
  constructor(
    readonly code: SaveRefusal | 'too-large' | 'failed' | 'cancelled' | 'no-file',
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

/** What the file will hold, for the dialog: the separations (tool names) and whether a render is kept. */
export function projectContents(s: AppState = appStore.getState()): { separations: string[]; render: boolean } {
  const sep = s.separation;
  return { separations: [...(sep.result ? [sep.result.modelName] : []), ...sep.others.map((o) => o.result.modelName)], render: s.keptRender !== null };
}

/** The samples of a track the file names: from memory when there, else from the device. */
function readerFor(audioId: string, inMemory: () => PcmAudio | undefined): () => Promise<PcmAudio> {
  return async () => {
    const pcm = inMemory() ?? (await getProjectStorage().loadTrackAudio(audioId));
    if (!pcm) throw new ProjectSaveError('failed', `track ${audioId} neither in memory nor on the device`);
    return pcm;
  };
}

/**
 * What the file will hold: the document, the originals read from the device, a reader per FLAC track.
 * `earlier` is the manifest of an earlier file of the project: the originals it already holds are not read from
 * the device unless the writer finds it cannot copy them (they are `LazyOriginal`s).
 */
export async function gatherProject(s: AppState = appStore.getState(), earlier: ProjectManifest | null = null): Promise<ProjectFileInput> {
  const refusal = saveRefusal(s);
  if (refusal) throw new ProjectSaveError(refusal);
  const document = toProjectDocument(s)!;
  const originals = new Map<string, StoredAudio | LazyOriginal>();
  const load = async (id: string): Promise<StoredAudio> => {
    const stored = await getProjectStorage().loadAudio(id);
    if (!stored) throw new ProjectSaveError('not-kept', `no stored audio ${id}`);
    return stored;
  };
  for (const tr of [...document.tracks, ...document.separation.aside]) {
    if (tr.audio.origin === 'separated' || originals.has(tr.audio.id)) continue;
    const id = tr.audio.id;
    const old = earlier?.audio.find((a) => a.id === id);
    originals.set(id, old ? { fileName: old.fileName, mimeType: old.mimeType, byteLength: old.bytes, load: () => load(id) } : await load(id));
  }
  const renderTrack = new Map((document.keptRender?.tracks ?? []).map((t) => [t.audioId, t.trackId]));
  const tracks = new Map<string, () => Promise<PcmAudio>>();
  for (const p of trackEntries(document)) {
    const trackId = renderTrack.get(p.id);
    tracks.set(p.id, readerFor(p.id, () => (p.kind === 'render' && trackId ? keptRenderAudio()?.get(trackId) : getAudio(p.id))));
  }
  return { document, originals, tracks };
}

/** Hands the bytes on in pieces of about `size`: many small writes (the headers of a ZIP) become few large ones. */
export function bufferedSink(inner: ByteSink, size = 4 * 1024 * 1024): ByteSink & { flush(): Promise<void>; reset(): void } {
  let pending: Uint8Array<ArrayBuffer>[] = [];
  let pendingBytes = 0;
  const flush = async () => {
    if (!pendingBytes) return;
    const out = new Uint8Array(pendingBytes);
    let at = 0;
    for (const p of pending) {
      out.set(p, at);
      at += p.length;
    }
    pending = [];
    pendingBytes = 0;
    await inner.write(out);
  };
  return {
    async write(chunk) {
      pending.push(chunk);
      pendingBytes += chunk.length;
      if (pendingBytes >= size) await flush();
    },
    flush,
    /** Forgets what was not handed on yet (the file is written again from its start). */
    reset() {
      pending = [];
      pendingBytes = 0;
    },
  };
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

/** libFLAC in a worker (the export's encoder), at its usual level. */
export const appEncoder: FlacEncode = (pcm, { onProgress, signal }) => {
  const encoder = getEncoder('flac');
  if (!encoder) return Promise.reject(new ProjectSaveError('failed', 'no FLAC encoder'));
  return encoder.encode(pcm, { onProgress, signal });
};

/** How many tracks are encoded at once: one worker each, leaving a core for the page and the sound. */
export function parallelism(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(3, cores - 1));
}

export interface SaveOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Replaces libFLAC (tests). */
  encode?: FlacEncode;
}

/** The open piece as a `.fab` file. Rejects with a `ProjectSaveError`. */
export async function buildProjectFile(options: SaveOptions = {}): Promise<{ blob: Blob; name: string }> {
  const input = await gatherProject();
  const sink = blobSink();
  try {
    await writeProjectFile(input, sink, {
      encode: options.encode ?? appEncoder,
      onProgress: options.onProgress,
      signal: options.signal,
      tick: yieldToMain,
      parallel: parallelism(),
    });
  } catch (e) {
    if (options.signal?.aborted) throw new ProjectSaveError('cancelled');
    if (e instanceof ProjectSaveError) throw e;
    throw new ProjectSaveError(e instanceof ProjectFileError && e.code === 'too-large' ? 'too-large' : 'failed', e instanceof Error ? e.message : String(e));
  }
  return { blob: sink.blob(), name: projectFileName(input.document.project.title) };
}
