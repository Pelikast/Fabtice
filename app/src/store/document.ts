// Store <-> project document (what `ProjectStorage` keeps on the device).

import { PROJECT_DOCUMENT_VERSION, type ProjectDocument } from '../model/document';
import type { AppState } from './store';

/** The document of the open project, or null when none is open. */
export function toProjectDocument(s: AppState, now = new Date()): ProjectDocument | null {
  if (!s.project) return null;
  const { mode: _mode, ...view } = s.view;
  return {
    version: PROJECT_DOCUMENT_VERSION,
    project: s.project,
    tracks: s.tracks,
    tempoMap: s.tempoMap,
    loop: s.loop,
    playback: s.playback,
    view,
    savedAt: now.toISOString(),
  };
}

/**
 * The part of the state a stored document restores. The caller still has to
 * decode the stored audio, register it under the same `AudioRef.id`s and load
 * the engine. Throws on an unknown version.
 */
export function fromProjectDocument(doc: ProjectDocument, current: AppState): Partial<AppState> {
  if (doc.version !== PROJECT_DOCUMENT_VERSION) throw new Error(`unknown project document version ${String(doc.version)}`);
  return {
    project: doc.project,
    tracks: doc.tracks,
    tempoMap: doc.tempoMap,
    loop: doc.loop,
    playback: doc.playback,
    view: { ...doc.view, mode: current.view.mode },
  };
}
