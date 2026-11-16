// Whether the piece kept on the device is the one last saved to its `.fab`
// file (C5), so that a piece reopened at launch reads « modified » only when
// it really is.
//
// Kept beside the autosave, not in the document (the document format does not
// change): one small record in localStorage, `{ projectId, modified }`, that
// always describes the document the device holds:
//   - each time the keeper writes the document, the record takes the
//     « modified » state of the state it wrote (`ProjectKeeper`);
//   - each time the « modified » state changes while the device already holds
//     the document as it is (a save, an undo back to the save point), the
//     record follows at once; a change to « modified » is written at once in
//     any case (it can only make the next launch more careful, never less).
// A record that is missing, unreadable or for another project counts as
// « modified ». Harmless when storage is blocked (private window).

export interface SavedStateRecord {
  /** `ProjectInfo.id` of the piece kept on the device. */
  projectId: string;
  /** That piece has changes its `.fab` file does not have (or it never had a file). */
  modified: boolean;
}

export interface SavedStateStore {
  read(): SavedStateRecord | null;
  write(record: SavedStateRecord): void;
}

const KEY = 'fabtice.etatEnregistre';

/** Reads a record, or null when it is not one. */
export function parseSavedState(text: string | null): SavedStateRecord | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object') return null;
    const { projectId, modified } = value as Record<string, unknown>;
    if (typeof projectId !== 'string' || !projectId || typeof modified !== 'boolean') return null;
    return { projectId, modified };
  } catch {
    return null;
  }
}

/** The record in localStorage. */
export const localSavedState: SavedStateStore = {
  read() {
    try {
      return parseSavedState(window.localStorage.getItem(KEY));
    } catch {
      return null;
    }
  },
  write(record) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ projectId: record.projectId, modified: record.modified }));
    } catch {
      // not kept: the piece will read « modified » at the next launch, as before
    }
  },
};

/** A store in memory (tests). */
export function memorySavedState(initial: SavedStateRecord | null = null): SavedStateStore & { record: SavedStateRecord | null } {
  const store = {
    record: initial,
    read: () => store.record,
    write: (record: SavedStateRecord) => {
      store.record = { ...record };
    },
  };
  return store;
}
