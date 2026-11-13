// Reading a stored project document safely: version handling and shape checks.
//
// Two versions are in play:
//   - `STORAGE_SCHEMA`: the layout of what `indexedDb.ts` writes (the record
//     around the document, the object stores). An unknown one is ignored.
//   - `ProjectDocument.version` (`model/document.ts`): the document itself.
//     Older ones are brought up to date by `MIGRATIONS`; a newer one (a later
//     version of the app wrote it) is ignored, never overwritten blindly by
//     reading it — the next import simply replaces it.

import { PROJECT_DOCUMENT_VERSION, type ProjectDocument } from '../model/document';
import { StorageError } from './ProjectStorage';

/** Layout of the stored record; bump with a reader for the old one. */
export const STORAGE_SCHEMA = 1;

/** `MIGRATIONS[n]` turns a version-n document (as stored) into a version n+1 one. */
export type Migrations = Record<number, (doc: Record<string, unknown>) => Record<string, unknown>>;
export const MIGRATIONS: Migrations = {};

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

const ROLES = ['morceau', 'voix', 'batterie', 'basse', 'guitare', 'piano', 'vents', 'autres'];
const ORIGINS = ['default', 'manual', 'analysis'];

function corrupt(what: string): never {
  throw new StorageError('corrupt', `stored project: ${what}`);
}

function checkProject(p: unknown): void {
  if (!isRec(p) || !isStr(p.id) || !isStr(p.title) || !isNum(p.duration) || p.duration < 0 || !isNum(p.sampleRate) || !isStr(p.createdAt)) {
    corrupt('project');
  }
  const source = (p as Rec).source;
  if (!isRec(source) || !['file', 'link', 'demo'].includes(source.kind as string)) corrupt('project source');
}

function checkTracks(tracks: unknown): void {
  if (!Array.isArray(tracks) || tracks.length === 0) corrupt('tracks');
  for (const tr of tracks as unknown[]) {
    if (!isRec(tr) || !isStr(tr.id) || !isStr(tr.name) || !ROLES.includes(tr.role as string)) corrupt('track');
    if (typeof tr.mute !== 'boolean' || typeof tr.solo !== 'boolean' || !isNum(tr.volume)) corrupt('track mix');
    const a = tr.audio;
    if (!isRec(a) || !isStr(a.id) || !isNum(a.channels) || !isNum(a.sampleRate) || !isNum(a.frames)) corrupt('track audio');
  }
}

function checkTempoMap(map: unknown): void {
  if (!isRec(map) || !ORIGINS.includes(map.origin as string)) corrupt('tempo map');
  const { segments, meters } = map as Rec;
  if (!Array.isArray(segments) || segments.length === 0 || !Array.isArray(meters) || meters.length === 0) corrupt('tempo map');
  for (const s of segments as unknown[]) {
    if (!isRec(s) || !isNum(s.time) || !isNum(s.beat) || !isNum(s.bpm) || s.bpm <= 0) corrupt('tempo segment');
  }
  for (const m of meters as unknown[]) {
    if (!isRec(m) || !isNum(m.bar) || !isNum(m.beat) || !isRec(m.meter) || !isNum(m.meter.numerator) || !isNum(m.meter.denominator)) {
      corrupt('meter');
    }
  }
}

function checkLoopAndPlayback(doc: Rec): void {
  const loop = doc.loop;
  if (!isRec(loop) || typeof loop.enabled !== 'boolean') corrupt('loop');
  const region = (loop as Rec).region;
  if (region !== null && (!isRec(region) || !isNum(region.start) || !isNum(region.end))) corrupt('loop region');
  const p = doc.playback;
  if (!isRec(p) || !isNum(p.semitones) || !isNum(p.cents) || !isNum(p.tempoRatio) || typeof p.metronome !== 'boolean') corrupt('playback');
  if (!isRec(doc.view)) corrupt('view');
}

/**
 * Turns what was read from the device into a current-version document.
 * Returns null for a version this app does not know (newer, or garbage
 * version numbers are `corrupt`); throws `StorageError('corrupt')` when the
 * shape is wrong.
 */
export function readDocument(raw: unknown, migrations: Migrations = MIGRATIONS, current: number = PROJECT_DOCUMENT_VERSION): ProjectDocument | null {
  if (!isRec(raw)) corrupt('not an object');
  let doc: Rec = raw;
  let version = doc.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) corrupt('version');
  if ((version as number) > current) return null;
  while ((version as number) < current) {
    const step = migrations[version as number];
    if (!step) corrupt(`no migration from version ${String(version)}`);
    doc = step(doc);
    version = (version as number) + 1;
    doc.version = version;
  }
  checkProject(doc.project);
  checkTracks(doc.tracks);
  checkTempoMap(doc.tempoMap);
  checkLoopAndPlayback(doc);
  return doc as unknown as ProjectDocument;
}
