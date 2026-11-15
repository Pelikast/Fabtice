// What the chord analysis needs from the on-device library of standards (CLAUDE.md, analysis,
// means 3), as plain data to post to the analysis worker: the charts whose title matches the
// piece's (`candidates`), and the reference charts of OTHER tunes the fit check compares them with
// (`references`, see `analysis/engine/knownChart.ts`). The engine never sees the library: it gets
// these two arrays (structured-clonable: plain objects, arrays, strings, numbers, null).
//
// Nothing is built when there is no title, no library or no candidate (`null`: nothing to send).
// The references are drawn from the raw songs of the library (cheap to list), spread evenly, and
// only those are read; they are kept per library state, so repeated analyses reuse them.

import { referenceBeats, type ReferenceBeats } from '../analysis/engine/knownChart';
import { displayTitle, extractIRealLinks, readIRealSong, splitIRealLink, type RawIRealSong, type StandardChart } from './irealRead';
import { findStandard } from './library';
import { openCollectionStore, type CollectionStore, type StoredCollection } from './libraryStore';
import { normalizeTitle } from './match';

/** A chart whose title matches, as the analysis takes it (`ChartCandidate` of `knownChart.ts`, plus where it comes from). */
export interface AnalysisChartCandidate {
  chart: StandardChart;
  /** Title match score in [0, 1]. */
  titleScore: number;
  collectionId: string;
  /** For display (« Jazz 1460 »). */
  collectionName: string;
}

export interface ChartsForAnalysis {
  /** The title searched. */
  title: string;
  candidates: AnalysisChartCandidate[];
  /** Other tunes for the fit check, beat by beat (60 by default; fewer in a small library). */
  references: ReferenceBeats[];
}

export interface ChartsForAnalysisOptions {
  store?: CollectionStore;
  /** Number of reference charts (default 60, as measured on the bench). */
  references?: number;
  /** At most this many candidates (default 6). */
  maxCandidates?: number;
}

export const REFERENCE_COUNT = 60;

const titleKey = (raw: string) => normalizeTitle(displayTitle(raw));

interface RawLibrary {
  signature: string;
  raws: RawIRealSong[];
  read: Map<number, StandardChart | null>;
  /** Last answer, by excluded titles. */
  last: { key: string; refs: ReferenceBeats[] } | null;
}

let cache: { store: CollectionStore; lib: RawLibrary } | null = null;

/** For tests. */
export function resetChartsForAnalysisCache(): void {
  cache = null;
}

const signatureOf = (records: readonly StoredCollection[]) =>
  records.map((r) => `${r.id}\u0000${r.date}\u0000${r.tunes}\u0000${r.links.length}`).sort().join('\u0001');

function rawLibrary(store: CollectionStore, records: readonly StoredCollection[]): RawLibrary {
  const signature = signatureOf(records);
  if (cache && cache.store === store && cache.lib.signature === signature) return cache.lib;
  const raws: RawIRealSong[] = [];
  for (const r of [...records].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const link of extractIRealLinks(r.links)) {
      try {
        for (const s of splitIRealLink(link).songs) raws.push({ ...s, index: raws.length });
      } catch {
        // an unreadable link gives no song
      }
    }
  }
  const lib: RawLibrary = { signature, raws, read: new Map(), last: null };
  cache = { store, lib };
  return lib;
}

function read(lib: RawLibrary, i: number): StandardChart | null {
  if (!lib.read.has(i)) {
    let chart: StandardChart | null = null;
    try {
      chart = readIRealSong(lib.raws[i]!);
    } catch {
      chart = null;
    }
    lib.read.set(i, chart);
  }
  return lib.read.get(i)!;
}

/** `n` other tunes (as `ReferenceBeats`), spread evenly over the library (deterministic), at least 8 bars each. */
function references(lib: RawLibrary, n: number, exclude: ReadonlySet<string>): ReferenceBeats[] {
  const key = `${n}\u0000${[...exclude].sort().join('\u0001')}`;
  if (lib.last?.key === key) return lib.last.refs;
  const pool = lib.raws.map((_, i) => i).filter((i) => !exclude.has(titleKey(lib.raws[i]!.title)));
  const out: ReferenceBeats[] = [];
  const used = new Set<number>();
  // evenly spaced picks; an unreadable or too short chart is replaced by the next one
  for (let k = 0; k < n && used.size < pool.length; k++) {
    let j = Math.floor(((k + 0.5) * pool.length) / n);
    while (j < pool.length && used.has(j)) j++;
    for (; j < pool.length; j++) {
      used.add(j);
      const c = read(lib, pool[j]!);
      if (c && c.bars.length >= 8) {
        out.push(referenceBeats(c));
        break;
      }
    }
  }
  lib.last = { key, refs: out };
  return out;
}

/**
 * The charts the analysis needs for `title`, or null when there is nothing to send (no title, no
 * library, or no chart of that title).
 */
export async function chartsForAnalysis(title: string | null | undefined, opts: ChartsForAnalysisOptions = {}): Promise<ChartsForAnalysis | null> {
  const t = title?.trim();
  if (!t) return null;
  const store = opts.store ?? (await openCollectionStore());
  let records: StoredCollection[] = [];
  try {
    records = await store.list();
  } catch {
    return null;
  }
  if (!records.length) return null;
  const found = await findStandard(t, { store, max: opts.maxCandidates ?? 6 });
  if (!found.length) return null;
  const candidates: AnalysisChartCandidate[] = found.map((c) => ({ chart: c.chart, titleScore: c.score, collectionId: c.collectionId, collectionName: c.collectionName }));
  const exclude = new Set(candidates.map((c) => titleKey(c.chart.rawTitle)));
  const lib = rawLibrary(store, records);
  return { title: t, candidates, references: references(lib, opts.references ?? REFERENCE_COUNT, exclude) };
}
