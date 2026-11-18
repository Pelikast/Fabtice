// « Place sur cet appareil » (lot 4, in the advanced settings): what Fabtice
// keeps on this device, with honest sizes, and « Libérer » for the tools it
// downloaded. Each family lives in its own store, so each can be freed alone:
//   - the piece kept (its original and its separated instruments): shown, not
//     freed here (that is « Oublier ce morceau », or a new piece);
//   - the analysis tools (beats, chords: about 13 MB), the detailed chord
//     model (68 MB) and SheetSage2 (1.0.2: 2.8 GB), in `fabtice-analysis-tools`;
//   - the separation tools (13 to 353 MB each), in their own database;
//   - the chord charts of standards (counted in tunes: their store does not
//     say its size).
// A tool freed is downloaded again the next time it is needed.

import { ANALYSIS_TOOLS_DB, openModelStore } from '../analysis/models/store';
import { getSeparator } from '../separation';
import { forgetStandards } from '../standards/offer';
import { standardsStatus } from '../standards/library';
import { getProjectStorage } from '../storage';

export interface DeviceUsage {
  /** The separated instruments kept with the piece (bytes). */
  instruments: number | null;
  /** Analysis tools, the detailed chord model excepted (bytes). */
  analysis: number | null;
  /** The detailed chord model (Tsumugi-Chords), when downloaded (bytes). */
  fineChords: number | null;
  /** SheetSage2 and its encoder (1.0.2), when downloaded (bytes). */
  sheetsage2: number | null;
  /** Separation tools (bytes). */
  separation: number | null;
  /** Tunes of the collections of standards kept. */
  standardsTunes: number | null;
  /** All Fabtice keeps on this device, as the browser counts it (the app's own files included). */
  total: number | null;
}

const isFine = (id: string) => id.startsWith('tsumugi');
const isSs2 = (id: string) => id === 'sheetsage2' || id === 'mert-v2-fullsong';
const familyOf = (id: string): 'analysis' | 'fineChords' | 'sheetsage2' => (isFine(id) ? 'fineChords' : isSs2(id) ? 'sheetsage2' : 'analysis');

async function analysisFiles(): Promise<{ id: string; bytes: number }[]> {
  return (await openModelStore(ANALYSIS_TOOLS_DB)).listFiles();
}

const settle = async <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

export async function deviceUsage(): Promise<DeviceUsage> {
  const [instruments, files, separation, standards, estimate] = await Promise.all([
    settle(getProjectStorage().trackAudioUsage().then((u) => u.bytes)),
    settle(analysisFiles()),
    settle(getSeparator().toolsUsage().then((u) => u.bytes)),
    settle(standardsStatus().then((s) => s.total)),
    settle(typeof navigator !== 'undefined' && navigator.storage?.estimate ? navigator.storage.estimate() : Promise.reject(new Error('no estimate'))),
  ]);
  const sum = (list: { bytes: number }[]) => list.reduce((n, f) => n + f.bytes, 0);
  return {
    instruments,
    analysis: files ? sum(files.filter((f) => familyOf(f.id) === 'analysis')) : null,
    fineChords: files ? sum(files.filter((f) => isFine(f.id))) : null,
    sheetsage2: files ? sum(files.filter((f) => isSs2(f.id))) : null,
    separation,
    standardsTunes: standards,
    total: estimate?.usage ?? null,
  };
}

export type FreeTarget = 'analysis' | 'fineChords' | 'sheetsage2' | 'separation' | 'standards';

/** Deletes what was downloaded for `target`; it comes again when needed. */
export async function freeDownloaded(target: FreeTarget): Promise<void> {
  if (target === 'separation') return getSeparator().forgetTools();
  if (target === 'standards') return forgetStandards();
  const store = await openModelStore(ANALYSIS_TOOLS_DB);
  for (const f of await store.listFiles()) {
    if (familyOf(f.id) === target) {
      await store.deleteFile(f.id);
      await store.clearParts(f.id);
    }
  }
}
