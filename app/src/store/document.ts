// Store <-> project document (what `ProjectStorage` keeps on the device).

import { emptyCorrections } from '../model/corrections';
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
    analysis: s.analysis,
    corrections: s.corrections,
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
    // Fields a stored document lacks (added since it was written) keep their current value.
    view: { ...current.view, ...doc.view, mode: current.view.mode },
    analysis: doc.analysis ?? null,
    corrections: { ...emptyCorrections(), ...doc.corrections },
    analysisRun: { status: 'idle' },
  };
}

/**
 * True when what the document is made of changed between two states. The
 * autosave (`storage/keeper.ts`) must use this list: `analysis` and
 * `corrections` are part of the document since version 2. `view.mode` is not.
 */
export function documentChanged(a: AppState, b: AppState): boolean {
  if (
    a.project !== b.project || a.tracks !== b.tracks || a.tempoMap !== b.tempoMap || a.loop !== b.loop ||
    a.playback !== b.playback || a.analysis !== b.analysis || a.corrections !== b.corrections
  ) {
    return true;
  }
  if (a.view === b.view) return false;
  for (const key of Object.keys(a.view) as (keyof AppState['view'])[]) {
    if (key !== 'mode' && a.view[key] !== b.view[key]) return true;
  }
  return false;
}
