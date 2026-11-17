// Handing a folder of files to the user, for the sequencer exports (« Dossier
// pour Logic Pro… », « Projet Ableton Live… »).
//
//   const target = await openFolderTarget('Blues – Logic Pro');   // null: cancelled
//   await target.add({ name: '01 Morceau.wav', data: blob });       // one by one, as they are made
//   await target.add({ name: 'Samples/Imported/01 Morceau.wav', data: blob }); // or in sub-folders
//   const result = await target.finish();                          // or target.abort()
//
// Mac app: a REAL folder. `openFolderTarget` shows the system's save panel at
// once (the user names the folder and chooses where it goes), then each file
// is handed to the main process by chunks of `CHUNK_BYTES` as soon as it is
// made, so a long piece never sits whole in memory (`desktop/src/folder-writer.js`:
// a new folder, never over an existing one, names checked to stay inside;
// `abort` removes what was written). The result says the folder's name and
// where it is, and can show it in the Finder.
// Web app: a .zip archive whose entries are inside a folder of that name
// (`zipStore`, no compression), handed over as a link like the other exports
// (`export/audio/deliver.ts`); unpacking it gives the folder.

import { getDesktopBridge, type DesktopBridge } from '../../platform/desktopBridge';
import { deliverable, safeFileName, zipStore, type Delivered } from '../audio';

export interface FolderFile {
  /**
   * A plain file name, or a short path in sub-folders of the folder (« Samples/Imported/01 Morceau.wav »: at
   * most `MAX_FOLDER_DEPTH` folders, `/` between them); every part is cleaned again on the way (`safeFileName`).
   */
  name: string;
  data: Blob;
}

export type FolderResult =
  /** Web: the archive to save, by the link the dialog shows. */
  | { kind: 'zip'; file: Delivered; folderName: string }
  /** Mac app: the folder is written. `where`: its place, home as « ~ » (« ~/Downloads »). */
  | { kind: 'folder'; folderName: string; where: string; reveal: () => Promise<boolean> };

export type FolderErrorCode = 'cancelled' | 'failed' | 'too-large';

export class FolderError extends Error {
  constructor(
    readonly code: FolderErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'FolderError';
  }
}

export interface FolderTarget {
  readonly kind: 'zip' | 'folder';
  /** The folder's name (the Mac app may have made it « name 2 »: an existing folder is never replaced). */
  readonly folderName: string;
  /**
   * Mac app: the folder's full path, to write INSIDE a file that must name where its neighbours lie (the
   * Ableton Live set). Null on the web (where the archive will be unpacked is not known) and in a Mac app that
   * predates it.
   */
  readonly fullPath: string | null;
  /** Adds a file; `onProgress` 0…1 while it is written. */
  add(file: FolderFile, options?: { onProgress?: (fraction: number) => void; signal?: AbortSignal }): Promise<void>;
  finish(): Promise<FolderResult>;
  /** Gives up: nothing is left behind (the Mac app removes what it wrote). */
  abort(): Promise<void>;
}

/** Bytes handed to the Mac app per call. */
export const CHUNK_BYTES = 8 * 1024 * 1024;

/** Sub-folders a file name may go through (`desktop/src/folder-writer.js` checks the same). */
export const MAX_FOLDER_DEPTH = 3;

/** `name` with each part cleaned (`safeFileName`); throws `FolderError('failed')` when deeper than allowed. */
export function folderEntryName(name: string): string {
  const parts = name.split('/').filter((p) => p.trim() !== '');
  if (parts.length === 0) return safeFileName(name);
  if (parts.length > MAX_FOLDER_DEPTH + 1) throw new FolderError('failed', 'too deep');
  return parts.map((p) => safeFileName(p)).join('/');
}

type FolderBridge = Required<Pick<DesktopBridge, 'beginFolderExport' | 'writeFolderFile' | 'finishFolderExport' | 'abortFolderExport' | 'revealFolderExport'>>;

function folderBridge(): FolderBridge | null {
  const b = getDesktopBridge();
  return b && b.beginFolderExport && b.writeFolderFile && b.finishFolderExport && b.abortFolderExport && b.revealFolderExport ? (b as FolderBridge) : null;
}

/** True when the export writes a real folder (the Mac app), false when it hands an archive (the web). */
export function writesRealFolder(): boolean {
  return folderBridge() !== null;
}

function zipTarget(folderName: string): FolderTarget {
  const files: { name: string; data: Blob }[] = [];
  const used = new Set<string>();
  return {
    kind: 'zip',
    folderName,
    fullPath: null,
    async add(file, options) {
      if (options?.signal?.aborted) throw new FolderError('cancelled');
      let name = folderEntryName(file.name);
      const slash = name.lastIndexOf('/');
      const dir = slash >= 0 ? name.slice(0, slash + 1) : '';
      const base = name.slice(dir.length);
      for (let k = 2; used.has(name.toLowerCase()); k++) name = `${dir}${safeFileName(`${k} ${base}`)}`;
      used.add(name.toLowerCase());
      files.push({ name: `${folderName}/${name}`, data: file.data });
      options?.onProgress?.(1);
    },
    async finish() {
      const blob = await zipStore(files);
      files.length = 0;
      return { kind: 'zip', folderName, file: deliverable(blob, `${folderName}.zip`) };
    },
    async abort() {
      files.length = 0;
    },
  };
}

function realFolderTarget(bridge: FolderBridge, session: string, folderName: string, where: string, fullPath: string | null): FolderTarget {
  let closed = false;
  return {
    kind: 'folder',
    folderName,
    fullPath,
    async add(file, options) {
      if (closed) throw new FolderError('failed', 'closed');
      const name = folderEntryName(file.name);
      const size = file.data.size;
      // An empty file is created too.
      for (let at = 0; at < size || (at === 0 && size === 0); at += CHUNK_BYTES) {
        if (options?.signal?.aborted) throw new FolderError('cancelled');
        const bytes = new Uint8Array(await file.data.slice(at, Math.min(size, at + CHUNK_BYTES)).arrayBuffer());
        const r = await bridge.writeFolderFile(session, name, at, bytes);
        if (!r.ok) throw new FolderError(r.reason === 'too-large' ? 'too-large' : 'failed', r.reason);
        options?.onProgress?.(size ? Math.min(1, (at + bytes.length) / size) : 1);
        if (size === 0) break;
      }
    },
    async finish() {
      closed = true;
      const r = await bridge.finishFolderExport(session);
      if (!r.ok) throw new FolderError('failed', r.reason);
      return { kind: 'folder', folderName: r.name, where: r.where || where, reveal: () => bridge.revealFolderExport(session) };
    },
    async abort() {
      if (closed) return;
      closed = true;
      await bridge.abortFolderExport(session).catch(() => true);
    },
  };
}

/**
 * Where the files go: in the Mac app, the system's save panel first (null when the user cancels it); on the
 * web, an archive made at the end. `folderName` is cleaned (`safeFileName`).
 */
export async function openFolderTarget(folderName: string): Promise<FolderTarget | null> {
  const name = safeFileName(folderName);
  const bridge = folderBridge();
  if (!bridge) return zipTarget(name);
  const r = await bridge.beginFolderExport({ suggestedName: name });
  if (!r.ok) {
    if (r.reason === 'cancelled') return null;
    throw new FolderError('failed', r.reason);
  }
  return realFolderTarget(bridge, r.session, r.name, r.where, typeof r.path === 'string' && r.path.startsWith('/') ? r.path : null);
}
