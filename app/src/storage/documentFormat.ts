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
import { AUDIO_FORMATS, defaultExportPreferences, EXPORT_RANGES, EXPORT_WHATS, MP3_KBPS, WAVE_BITS, WAVE_RATES } from '../model/audioExport';
import { emptyCorrections, TEMPO_FIX_KINDS } from '../model/corrections';
import { PROJECT_DOCUMENT_VERSION, type ProjectDocument } from '../model/document';
import { INSTRUMENTS } from '../model/harmony';
import { isValidPattern, parseMeterKey } from '../grid/metronome';
import { MARKER_NAME_MAX, emptyMarkers } from '../model/markers';
import { COUNT_IN_BARS, defaultMetronome, METRONOME_VOLUME } from '../model/metronome';
import { emptySeparation, isStemId } from '../model/separation';
import {
  emptyStructureCorrections,
  FORM_PATTERN,
  PART_INSTRUMENT_PATTERN,
  PART_TYPES,
  STRUCTURE_MODE_CHOICES,
  STRUCTURE_MODES,
} from '../model/structure';
import { isValidMeter, TEMPO_ORIGINS } from '../model/tempoMap';
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
  // Lot 3 -> lot 4: the metronome as it was (on/off stays in `playback`; default volume, no count-in, the default
  // accents, no acceleration), no named loop. The sections were already the chart's letters (`corrections.sections`).
  3: (doc) => ({
    ...doc,
    metronome: defaultMetronome(),
    markers: emptyMarkers(),
  }),
  // Version 4 -> 5: the one separation stays the current one, no other; no render kept (it never was).
  4: (doc) => ({
    ...doc,
    separation: isRec(doc.separation) ? { ...doc.separation, others: [] } : doc.separation,
    keptRender: null,
  }),
  // Version 5 -> 6: one key for the whole piece (no modulation by hand: the analysed ones, none yet), the structure
  // not corrected (mode « auto »). The section letters stay the user's, as they were: being there, they are the
  // letters in force (`model/structure.ts`). The analysis result is brought up to date by `readAnalysis` (its
  // version 1 -> 2), not dropped. Meters and tempo fixes need nothing: what version 5 could hold is legal in 6.
  5: (doc) => ({
    ...doc,
    corrections: isRec(doc.corrections) ? { ...doc.corrections, keyChanges: null, structure: emptyStructureCorrections() } : doc.corrections,
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
  // Version 6: any numerator 1…64 over 4, 8, 16 or 32 (what versions 1 to 5 held is inside).
  for (const m of meters as unknown[]) {
    if (!isRec(m) || !isNum(m.bar) || !isNum(m.beat) || !isValidMeter(m.meter)) corrupt('meter');
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

/** Ascending by `time`, each strictly after 0 and after the one before (a list of key changes). */
const isAscendingAfterZero = (list: unknown[]): boolean => list.every((x, i) => isRec(x) && isNum(x.time) && x.time > (i === 0 ? 0 : ((list[i - 1] as Rec).time as number)));

const isAnalysedKey = (k: unknown): boolean => isKey(k) && isNum((k as Rec).confidence) && Array.isArray((k as Rec).alternatives) && ((k as Rec).alternatives as unknown[]).every(isKey);

// ---------------------------------------------------------------- version 6: structure

const isSectionMark = (x: unknown): boolean => isRec(x) && isNum(x.time) && isStr(x.label);

function isPart(p: unknown): boolean {
  if (!isRec(p) || !isStr(p.id) || p.id.length === 0 || !PART_TYPES.includes(p.type as never)) return false;
  if (p.number !== null && !(Number.isInteger(p.number) && (p.number as number) >= 1)) return false;
  if (p.instrument !== null && !(isStr(p.instrument) && PART_INSTRUMENT_PATTERN.test(p.instrument))) return false;
  return isNum(p.start) && isNum(p.end) && p.end > p.start;
}

/** Valid parts, ascending by start, never overlapping, ids unique. */
function arePartsValid(parts: unknown): boolean {
  if (!Array.isArray(parts) || !parts.every(isPart)) return false;
  const list = parts as Rec[];
  if (new Set(list.map((p) => p.id)).size !== list.length) return false;
  return list.every((p, i) => i === 0 || (p.start as number) >= (list[i - 1]!.end as number));
}

/** Valid ranges, ascending, never overlapping. */
const areSpansValid = (spans: unknown): boolean =>
  Array.isArray(spans) &&
  spans.every((x: unknown, i: number) => isRec(x) && isNum(x.start) && isNum(x.end) && x.end > x.start && (i === 0 || x.start >= ((spans[i - 1] as Rec).end as number)));

function isDetectedStructure(st: unknown): boolean {
  if (!isRec(st) || !STRUCTURE_MODES.includes(st.mode as never) || !isStr(st.form) || !FORM_PATTERN.test(st.form)) return false;
  return Array.isArray(st.sections) && st.sections.every(isSectionMark) && arePartsValid(st.parts);
}

/** The structure corrected by hand: read exactly, or the document is `corrupt`. */
function checkStructureCorrections(st: unknown): void {
  if (!isRec(st) || !STRUCTURE_MODE_CHOICES.includes(st.mode as never) || typeof st.lettersByHand !== 'boolean') corrupt('structure');
  if (!arePartsValid((st as Rec).parts)) corrupt('structure parts');
  if (!areSpansValid((st as Rec).spans)) corrupt('structure spans');
}

/** Version 1 results (lots 2 to 5) gain the version-2 fields, as « no modulation found, structure not looked for ». */
function upgradeAnalysis(a: Rec): Rec {
  if (a.version === 1) return { ...a, version: 2, keyChanges: [], structure: null };
  return a;
}

/**
 * An analysis result can always be computed again: a damaged one, or one of a
 * version this app cannot bring up to date, is dropped (the piece is analysed
 * again when opened), never a reason to lose the piece. A version-1 result
 * (documents up to version 5) is brought up to date, never dropped for its age.
 */
function readAnalysis(raw: unknown): unknown {
  if (raw === null || !isRec(raw)) return null;
  const a = upgradeAnalysis(raw);
  if (a.version !== ANALYSIS_RESULT_VERSION) return null;
  const beats = a.beats;
  if (!isRec(beats) || !Array.isArray(beats.times) || beats.times.length < 2 || !beats.times.every(isNum)) return null;
  if (!isNum(beats.downbeat) || !isValidMeter(beats.meter)) return null;
  if (a.key !== null && !isKey(a.key)) return null;
  // Version 2: modulations and structure, as the analysis found them.
  if (!Array.isArray(a.keyChanges) || !isAscendingAfterZero(a.keyChanges) || !a.keyChanges.every((x: unknown) => isAnalysedKey((x as Rec).key))) return null;
  if (a.structure !== null && !isDetectedStructure(a.structure)) return null;
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
  if (!Array.isArray(k.sections) || !k.sections.every(isSectionMark)) corrupt('sections');
  // Version 5, added before it was published: absent means none.
  if (k.tempoFixes !== undefined) {
    if (!Array.isArray(k.tempoFixes)) corrupt('tempo fixes');
    for (const f of k.tempoFixes as unknown[]) {
      if (!isRec(f) || !isNum(f.time) || !TEMPO_FIX_KINDS.includes(f.kind as never)) corrupt('tempo fix');
      // Version 6: a tapped passage keeps its taps (ascending) and where it ends.
      if (f.kind === 'tapped') {
        const taps = f.taps;
        if (!Array.isArray(taps) || taps.length === 0 || !taps.every((t: unknown, i: number) => isNum(t) && (i === 0 || t >= (taps[i - 1] as number)))) corrupt('tapped tempo fix');
        if (!isNum(f.end) || !(f.end > (f.time as number))) corrupt('tapped tempo fix end');
      }
      checkTempoMap((f as Rec).previous);
    }
  }
  // Version 6: modulations by hand (null = the analysed ones) and the structure corrected by hand.
  if (k.keyChanges !== null && !(Array.isArray(k.keyChanges) && isAscendingAfterZero(k.keyChanges) && k.keyChanges.every((x: unknown) => isKey((x as Rec).key)))) {
    corrupt('key changes');
  }
  checkStructureCorrections(k.structure);
}

// ---------------------------------------------------------------- version 3: separation, export

/**
 * The separation and the set of tracks it shows are read exactly (they say
 * which tracks exist), or the document is `corrupt`. Invariants: without a
 * result, the whole piece is shown and nothing is aside; with one, exactly
 * one of the two sets (shown, aside) is the whole piece.
 */
function checkSummary(r: unknown): void {
  if (!isRec(r) || !isStr(r.id) || !isStr(r.modelId) || !isStr(r.modelName) || !isStr(r.modelSha256)) corrupt('separation result');
  if ((r.backend !== 'gpu' && r.backend !== 'cpu') || typeof r.fellBack !== 'boolean') corrupt('separation backend');
  if (!Array.isArray(r.stems) || !r.stems.every(isStemId) || !Array.isArray(r.kept) || !r.kept.every(isStemId)) corrupt('separation stems');
  if (!isStr(r.startedAt) || !isStr(r.finishedAt) || !isNum(r.computeSeconds) || !isNum(r.pieceSeconds)) corrupt('separation dates');
}

/** Version 5: the other separations, one per tool, each with its own instrument tracks. Read exactly. */
function checkOthers(sep: Rec): void {
  if (!Array.isArray(sep.others)) corrupt('other separations');
  const tools = new Set<string>();
  if (isRec(sep.result)) tools.add(sep.result.modelId as string);
  for (const o of sep.others as unknown[]) {
    if (!isRec(o) || !Array.isArray(o.tracks) || o.tracks.length === 0) corrupt('other separation');
    checkSummary(o.result);
    const tool = (o.result as Rec).modelId as string;
    if (tools.has(tool)) corrupt('two separations with one tool');
    tools.add(tool);
    for (const tr of o.tracks as unknown[]) {
      checkTrack(tr);
      if (((tr as Rec).audio as Rec).origin !== 'separated') corrupt('other separation: a track that is not an instrument');
    }
  }
}

function checkSeparation(doc: Rec): void {
  const sep = doc.separation;
  if (!isRec(sep) || (sep.showing !== 'whole' && sep.showing !== 'instruments') || !Array.isArray(sep.aside)) corrupt('separation');
  checkOthers(sep);
  for (const tr of sep.aside as unknown[]) checkTrack(tr);
  const tracks = doc.tracks as Rec[];
  const aside = sep.aside as Rec[];
  const isWhole = (list: Rec[]) => list.every((tr) => (tr.audio as Rec).origin !== 'separated');
  const r = sep.result;
  if (r === null) {
    if (sep.showing !== 'whole' || aside.length > 0) corrupt('separation without a result');
    return;
  }
  checkSummary(r);
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
    // Added in 1.0.0 (« Audio… »): a document written before has none of them, each reads as its default.
    waveRate: WAVE_RATES.includes(p.waveRate as never) ? p.waveRate : d.waveRate,
    waveBits: WAVE_BITS.includes(p.waveBits as never) ? p.waveBits : d.waveBits,
    mp3Kbps: MP3_KBPS.includes(p.mp3Kbps as never) ? p.mp3Kbps : d.mp3Kbps,
    separate: typeof p.separate === 'boolean' ? p.separate : d.separate,
  };
}

// ---------------------------------------------------------------- version 4: metronome, markers

/**
 * The metronome only shapes the clicks: anything unreadable goes back to its
 * default, field by field (a pattern that does not fit its meter is dropped,
 * the meter then clicks as by default). Never a lost piece.
 */
function readMetronome(m: unknown): unknown {
  const d = defaultMetronome();
  if (!isRec(m)) return d;
  const volume = isNum(m.volume) ? Math.min(METRONOME_VOLUME.max, Math.max(METRONOME_VOLUME.min, m.volume)) : d.volume;
  const countInBars = COUNT_IN_BARS.includes(m.countInBars as never) ? m.countInBars : d.countInBars;
  const patterns: Rec = {};
  if (isRec(m.patterns)) {
    for (const [key, p] of Object.entries(m.patterns)) {
      const meter = parseMeterKey(key);
      if (meter && isValidPattern(p, meter)) patterns[key] = p;
    }
  }
  const a = isRec(m.acceleration) ? m.acceleration : {};
  const da = d.acceleration;
  const num = (v: unknown, dv: number) => (isNum(v) ? v : dv);
  const acceleration = {
    enabled: typeof a.enabled === 'boolean' ? a.enabled : da.enabled,
    startPercent: num(a.startPercent, da.startPercent),
    stepPercent: num(a.stepPercent, da.stepPercent),
    everyRepeats: num(a.everyRepeats, da.everyRepeats),
    targetPercent: num(a.targetPercent, da.targetPercent),
  };
  return { volume, countInBars, patterns, acceleration };
}

/** Named loops are made by hand: read exactly, or the document is `corrupt` (as the corrections). */
function checkMarkers(m: unknown): void {
  if (!isRec(m) || !Array.isArray(m.loops)) corrupt('markers');
  const ids = new Set<string>();
  for (const l of m.loops as unknown[]) {
    if (!isRec(l) || !isStr(l.id) || !isStr(l.name) || l.name.length === 0 || l.name.length > MARKER_NAME_MAX) corrupt('named loop');
    const r = (l as Rec).region;
    if (!isRec(r) || !isNum(r.start) || !isNum(r.end) || !(r.end > r.start)) corrupt('named loop region');
    if (ids.has(l.id as string)) corrupt('named loop id twice');
    ids.add(l.id as string);
  }
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
  checkMarkers(doc.markers);
  const corrections = doc.corrections as Rec;
  if (corrections.tempoFixes === undefined) doc = { ...doc, corrections: { ...corrections, tempoFixes: [] } };
  doc = { ...doc, analysis: readAnalysis(doc.analysis), exportPrefs: readExportPrefs(doc.exportPrefs), metronome: readMetronome(doc.metronome), keptRender: readKeptRender(doc.keptRender) };
  const view = doc.view as Rec;
  if (!INSTRUMENTS.includes(view.instrument as never)) doc = { ...doc, view: { ...view, instrument: 'ut' } };
  return doc as unknown as ProjectDocument;
}

// ---------------------------------------------------------------- version 5: the render kept

/** The kept render is a convenience (it can be made again): anything unreadable is simply dropped. */
function readKeptRender(r: unknown): unknown {
  if (!isRec(r) || !isStr(r.renderedAt) || !Array.isArray(r.tracks) || r.tracks.length === 0) return null;
  const t = r.target;
  if (!isRec(t) || !isNum(t.semitones) || !isNum(t.cents) || !isNum(t.tempoRatio) || typeof t.formants !== 'boolean' || !isStr(t.audioKey)) return null;
  const ok = (r.tracks as unknown[]).every((x) => isRec(x) && isStr(x.trackId) && isStr(x.audioId) && isNum(x.frames) && isNum(x.channels));
  return ok ? r : null;
}
