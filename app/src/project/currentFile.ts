// Where the open project is saved (C5): the `.fab` file it was opened from or
// last saved to. « Enregistrer » overwrites it; without one, « Enregistrer »
// asks where (« Enregistrer sous… »).
//
// Not part of the document (the file says nothing of where it lives), kept
// here for the page's life:
//   - Mac app: the path stays in the main process (`desktop/src/project-writer.js`),
//     which only ever writes that file; the page holds its name and the id of the
//     project it belongs to. Restored with the piece after a relaunch (the main
//     process remembers the file of each project, `recallDesktopFile`);
//   - web, Chromium: the `FileSystemFileHandle` the browser gave when the file was
//     opened or chosen to save to. Not kept across a reload (a handle would need
//     the user's permission again): after a relaunch « Enregistrer » asks where;
//   - web, Safari and Firefox: none (they have no handles): « Enregistrer » downloads.
//
// A file belongs to a project (its id): another project in the store has none,
// so a new project or another opened one never overwrites it by mistake.

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { getDesktopBridge } from '../platform/desktopBridge';
import { appStore, useApp } from '../store/store';
import { FILE_EXTENSION } from './fileFormat';
import type { FileHandle } from './fileSystem';

export type FileRef = { kind: 'handle'; handle: FileHandle } | { kind: 'desktop' };

export interface CurrentFile {
  /** `ProjectInfo.id` of the project the file belongs to. */
  projectId: string;
  /** The file's name, with its extension (« Blues du dimanche.fab »). */
  name: string;
  ref: FileRef;
}

const store = createStore<{ file: CurrentFile | null }>()(() => ({ file: null }));

/** The file of the open project, or null (never saved here, or another project is open now). */
export function getCurrentFile(): CurrentFile | null {
  const file = store.getState().file;
  return file && appStore.getState().project?.id === file.projectId ? file : null;
}

/** The open project has this file (opened from it, or saved to it). */
export function setCurrentFile(file: CurrentFile): void {
  store.setState({ file });
}

/** The open project has no file. Also tells the Mac app. */
export function clearCurrentFile(): void {
  if (store.getState().file) store.setState({ file: null });
  void getDesktopBridge()?.forgetProjectFile?.().catch(() => {});
}

export function subscribeCurrentFile(listener: (file: CurrentFile | null) => void): () => void {
  return store.subscribe(() => listener(getCurrentFile()));
}

/** React hook: the file of the open project, or null. */
export function useCurrentFile(): CurrentFile | null {
  const file = useStore(store, (s) => s.file);
  const id = useApp((s) => s.project?.id ?? null);
  return file && id === file.projectId ? file : null;
}

/** « Blues du dimanche.fab » -> « Blues du dimanche ». */
export function displayName(fileName: string): string {
  return fileName.toLowerCase().endsWith(FILE_EXTENSION) ? fileName.slice(0, -FILE_EXTENSION.length) : fileName;
}

/**
 * Mac app: the piece was restored from the page's autosave; its file of a former launch is found again if the
 * main process remembers one that is still on the disk. Resolves true when the project has a file (found now, or
 * given meanwhile by an opening or a save). Never throws.
 */
export async function recallDesktopFile(projectId: string): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.recallProjectFile) return false;
  try {
    const found = await bridge.recallProjectFile(projectId);
    if (appStore.getState().project?.id !== projectId) return false;
    // Only if nothing else (an opening, a save) gave the project a file meanwhile.
    if (found && !getCurrentFile()) setCurrentFile({ projectId, name: found.name, ref: { kind: 'desktop' } });
    return getCurrentFile() !== null;
  } catch {
    // no file remembered: « Enregistrer » asks where
    return false;
  }
}
