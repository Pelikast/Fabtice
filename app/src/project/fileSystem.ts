// The File System Access API, as much as « Enregistrer » needs of it (Chromium
// on the web: Chrome, Edge, Opera). Safari and Firefox have none of it: there
// the project is saved as a download and opened from the file picker, as ever.
// The Mac app does not use these (its main process owns the file: `desktop/src/project-writer.js`).
//
// TypeScript's DOM library does not describe the pickers, nor the permission
// methods of a handle: the small shapes below are what is used.

import { FILE_EXTENSION, PROJECT_MIME } from './fileFormat';

export interface WritableFile {
  write(data: Uint8Array | Blob): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

export interface FileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<WritableFile>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface PickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
}

interface PickerWindow {
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FileHandle>;
  showOpenFilePicker?: (options?: PickerOptions) => Promise<FileHandle[]>;
}

const TYPES = [{ description: 'Projet Fabtice', accept: { [PROJECT_MIME]: [FILE_EXTENSION] } }];

const picker = (): PickerWindow => (typeof window === 'undefined' ? {} : (window as unknown as PickerWindow));

/** True when this browser can write a file it was given a handle to (so « Enregistrer » can overwrite). */
export function canSaveToFile(): boolean {
  return typeof picker().showSaveFilePicker === 'function';
}

/** True when this browser can give a handle to the file the user opens. */
export function canOpenWithHandle(): boolean {
  return typeof picker().showOpenFilePicker === 'function';
}

const cancelled = (e: unknown) => e instanceof DOMException && (e.name === 'AbortError' || e.name === 'NotAllowedError' && /cancel|abort/i.test(e.message));

/**
 * The system's save panel. Resolves the handle of the file chosen, or null when the user closed the panel.
 * Must be called from a user gesture, before anything is awaited.
 */
export async function pickSaveHandle(suggestedName: string): Promise<FileHandle | null> {
  try {
    return await picker().showSaveFilePicker!({ suggestedName, types: TYPES });
  } catch (e) {
    if (cancelled(e)) return null;
    throw e;
  }
}

/** The system's open panel for one project file. Null when the user closed it. */
export async function pickOpenHandle(): Promise<FileHandle | null> {
  try {
    const [handle] = await picker().showOpenFilePicker!({ types: TYPES, multiple: false });
    return handle ?? null;
  } catch (e) {
    if (cancelled(e)) return null;
    throw e;
  }
}

/**
 * Whether the page may write to `handle` (asking the user once if the browser needs to: that needs a user
 * gesture, which « Enregistrer » always comes from).
 */
export async function canWrite(handle: FileHandle): Promise<boolean> {
  try {
    if (!handle.queryPermission) return true;
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return handle.requestPermission ? (await handle.requestPermission({ mode: 'readwrite' })) === 'granted' : false;
  } catch {
    return false;
  }
}

/** The handle of a dragged file, when the browser gives one (call it during the drop event). */
export function handleOfDropped(item: DataTransferItem | undefined): Promise<FileHandle | null> {
  const get = (item as unknown as { getAsFileSystemHandle?: () => Promise<{ kind: string } | null> } | undefined)?.getAsFileSystemHandle;
  if (!item || typeof get !== 'function') return Promise.resolve(null);
  return get
    .call(item)
    .then((h) => (h && h.kind === 'file' ? (h as FileHandle) : null))
    .catch(() => null);
}
