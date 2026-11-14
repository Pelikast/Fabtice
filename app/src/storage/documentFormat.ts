// Reading a stored project document safely: version handling and shape checks.
//
// Two versions are in play:
//   - `STORAGE_SCHEMA`: the layout of what `indexedDb.ts` writes (the record
//     around the document, the object stores). An unknown one is ignored.
//   - `ProjectDocument.version` (`model/document.ts`): the document itself.
//     Older ones are brought up to date by `MIGRATIONS`; a newer one (a later
//     version of the app wrote it) is ignored, never overwritten blindly by
//     reading it — the next import simply replaces it.

import { isChordExtension, isChordQuality } from '../harmony/chord';
import { isPitchClass } from '../harmony/pitch';
import { ANALYSIS_RESULT_VERSION } from '../model/analysis';
import { AUDIO_FORMATS, defaultExportPreferences, EXPORT_RANGES, EXPORT_WHATS } from '../model/audioExport';
import { emptyCorrections } from '../model/corrections';
import { PROJECT_DOCUMENT_VERSION, type ProjectDocument } from '../model/document';
import { INSTRUMENTS } from '../model/harmony';
import { emptySeparation, isStemId } from '../model/separation';
import { TEMPO_ORIGINS } from '../model/tempoMap';
import { StorageError } from './ProjectStorage';

/** Layout of the stored record; bump with a reader for the old one. */
export const STORAGE_SCHEMA = 1;

/** `MIGRATIONS[n]` turns a version-n document (as stored) into a version n+1 one. */
export type Migrations = Record<number, (doc: Record<string, unknown>) => Record<string, unknown>>;
export const MIGRATIONS: Migrations = {
  // Lot 1 -> lot 2: not analysed yet, nothing corrected, chart for a concert-pitch instrument.
  // The lot 1 grid (default or manual) stays as it was.
  1: (doc) => ({
    ...doc,
    view: isRec(doc.view) ? { instrument: 'ut', ...doc.view } : doc.view,
    analysis: null,
    corrections: emptyCorrections(),
  }),
  // Lot 2 -> lot 3: never separated, the export dialog as it opens the first time.
  2: (doc) => ({
    ...doc,
    separation: emptySeparation(),
    exportPrefs: defaultExportPreferences(),
  }),
};

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

const ROLES = ['morceau', 'voix', 'batterie', 'basse', 'guitare', 'piano', 'vents', 'autres'];
const ORIGINS: readonly string[] = TEMPO_ORIGINS;

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

function checkTrack(tr: unknown): void {
  if (!isRec(tr) || !isStr(tr.id) || !isStr(tr.name) || !ROLES.includes(tr.role as string)) corrupt('track');
  if (typeof tr.mute !== 'boolean' || typeof tr.solo !== 'boolean' || !isNum(tr.volume)) corrupt('track mix');
  const a = tr.audio;
  if (!isRec(a) || !isStr(a.id) || !isNum(a.channels) || !isNum(a.sampleRate) || !isNum(a.frames)) corrupt('track audio');
  if (a.origin !== undefined && a.origin !== 'original' && a.origin !== 'separated') corrupt('track audio origin');
  // Version 3: a separated track says which part it holds; the whole piece does not.
  if (tr.stem !== undefined && !isStemId(tr.stem)) corrupt('track stem');
  if (a.origin === 'separated' && tr.stem === undefined) corrupt('separated track without its part');
}

function checkTracks(tracks: unknown): void {
  if (!Array.isArray(tracks) || tracks.length === 0) corrupt('tracks');
  for (const tr of tracks as unknown[]) checkTrack(tr);
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

// ---------------------------------------------------------------- version 2: harmony

const isKey = (k: unknown): boolean => isRec(k) && isPitchClass(k.tonic) && (k.mode === 'major' || k.mode === 'minor');

function isChordSymbol(c: unknown): boolean {
  if (!isRec(c) || !isPitchClass(c.root) || !isChordQuality(c.quality)) return false;
  if (!Array.isArray(c.extensions) || !c.extensions.every(isChordExtension)) return false;
  return c.bass === null || isPitchClass(c.bass);
}

const isChordOrNone = (c: unknown): boolean => c === null || isChordSymbol(c);

/**
 * An analysis result can always be computed again: a damaged or outdated one
 * is dropped (the piece is analysed again when opened), never a reason to
 * lose the piece.
 */
function readAnalysis(a: unknown): unknown {
  if (a === null || !isRec(a) || a.version !== ANALYSIS_RESULT_VERSION) return null;
  const beats = a.beats;
  if (!isRec(beats) || !Array.isArray(beats.times) || beats.times.length < 2 || !beats.times.every(isNum)) return null;
  if (!isNum(beats.downbeat) || !isRec(beats.meter) || !isNum(beats.meter.numerator) || !isNum(beats.meter.denominator)) return null;
  if (a.key !== null && !isKey(a.key)) return null;
  if (a.tuning !== null && !(isRec(a.tuning) && isNum(a.tuning.cents))) return null;
  if (!Array.isArray(a.chords)) return null;
  for (const c of a.chords as unknown[]) {
    if (!isRec(c) || !isNum(c.time) || !isChordOrNone(c.chord) || !isNum(c.confidence) || typeof c.doubtful !== 'boolean') return null;
    if (!Array.isArray(c.alternatives) || !c.alternatives.every(isChordSymbol)) return null;
  }
  return a;
}

/** What the user did by hand must be read exactly, or the document is `corrupt`. */
function checkCorrections(c: unknown): void {
  if (!isRec(c)) corrupt('corrections');
  const k = c as Rec;
  if (k.key !== null && !isKey(k.key)) corrupt('corrected key');
  if (k.tuningCents !== null && !isNum(k.tuningCents)) corrupt('corrected tuning');
  if (typeof k.tuningOfferDismissed !== 'boolean') corrupt('tuning offer');
  if (!Array.isArray(k.chords) || !k.chords.every((x: unknown) => isRec(x) && isNum(x.time) && isChordOrNone(x.chord))) corrupt('hand chords');
  if (!Array.isArray(k.handSpans) || !k.handSpans.every((x: unknown) => isRec(x) && isNum(x.start) && isNum(x.end) && x.end > x.start)) corrupt('hand spans');
  if (!Array.isArray(k.sections) || !k.sections.every((x: unknown) => isRec(x) && isNum(x.time) && isStr(x.label))) corrupt('sections');
}

// ---------------------------------------------------------------- version 3: separation, export

/**
 * The separation and the set of tracks it shows are read exactly (they say
 * which tracks exist), or the document is `corrupt`. Invariants: without a
 * result, the whole piece is shown and nothing is aside; with one, exactly
 * one of the two sets (shown, aside) is the whole piece.
 */
function checkSeparation(doc: Rec): void {
  const sep = doc.separation;
  if (!isRec(sep) || (sep.showing !== 'whole' && sep.showing !== 'instruments') || !Array.isArray(sep.aside)) corrupt('separation');
  for (const tr of sep.aside as unknown[]) checkTrack(tr);
  const tracks = doc.tracks as Rec[];
  const aside = sep.aside as Rec[];
  const isWhole = (list: Rec[]) => list.every((tr) => (tr.audio as Rec).origin !== 'separated');
  const r = sep.result;
  if (r === null) {
    if (sep.showing !== 'whole' || aside.length > 0) corrupt('separation without a result');
    return;
  }
  if (!isRec(r) || !isStr(r.id) || !isStr(r.modelId) || !isStr(r.modelName) || !isStr(r.modelSha256)) corrupt('separation result');
  if ((r.backend !== 'gpu' && r.backend !== 'cpu') || typeof r.fellBack !== 'boolean') corrupt('separation backend');
  if (!Array.isArray(r.stems) || !r.stems.every(isStemId) || !Array.isArray(r.kept) || !r.kept.every(isStemId)) corrupt('separation stems');
  if (!isStr(r.startedAt) || !isStr(r.finishedAt) || !isNum(r.computeSeconds) || !isNum(r.pieceSeconds)) corrupt('separation dates');
  if (aside.length === 0) corrupt('separation: nothing aside');
  const [shown, other] = sep.showing === 'instruments' ? [tracks, aside] : [aside, tracks];
  if (!isWhole(other) || !shown.every((tr) => (tr.audio as Rec).origin === 'separated')) corrupt('separation: sets mixed up');
}

/** Export preferences only shape a dialog: anything unreadable becomes the default (never a lost piece). */
function readExportPrefs(p: unknown): unknown {
  const d = defaultExportPreferences();
  if (!isRec(p)) return d;
  return {
    what: EXPORT_WHATS.includes(p.what as never) ? p.what : d.what,
    range: EXPORT_RANGES.includes(p.range as never) ? p.range : d.range,
    format: AUDIO_FORMATS.includes(p.format as never) ? p.format : d.format,
  };
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
  checkCorrections(doc.corrections);
  checkSeparation(doc);
  doc = { ...doc, analysis: readAnalysis(doc.analysis), exportPrefs: readExportPrefs(doc.exportPrefs) };
  const view = doc.view as Rec;
  if (!INSTRUMENTS.includes(view.instrument as never)) doc = { ...doc, view: { ...view, instrument: 'ut' } };
  return doc as unknown as ProjectDocument;
}
