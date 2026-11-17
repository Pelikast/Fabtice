// The junction of the audio evidence (`evidence.ts`) with the runner of the
// harmony pass (`refresh.ts`): which audio of the project is measured, and the
// second step, the wind instruments.
//
//   `gatherStructureEvidence`  the runner's `EvidenceGatherer`: the whole piece
//       and the separated tracks of the CURRENT separation that are in memory
//       (`AppState.tracks` and `separation.aside`; the other separations, whose
//       samples stay on the device, are not read), measured in slices by
//       `buildStructureEvidence` (cached per audio ids and bar grid).
//   `createWindsRefiner`  the runner's `EvidenceRefiner`: only with separated
//       tracks in memory and « Structure automatique » on, the stretches a wind
//       track leads (`windsExcerpts`), each read at 16 kHz and given to the
//       recogniser of the page. Each reading is kept (per audio, excerpt): a
//       run whose excerpts were all read before answers at once, so a chord
//       typed by hand never brings « Solo (Vents) » back for a moment. A
//       recogniser that fails says null: the part stays « Solo (Vents) ».
//   `installStructureEvidence`  what `main.tsx` passes to `startHarmonyRefresh`.
//
// Memory: the tracks are read through the registry block by block, never
// copied; an excerpt (one chorus of a solo) is read at 16 kHz, about 4 MB a
// minute, and handed to the recogniser's worker. The recogniser (and its
// model, downloaded on its first use) is created only when a separation is
// there to read.

import { currentLoadShare } from '../settings/easeLoadShare';
import { getAudio } from '../audio/registry';
import type { StemId } from '../model/separation';
import type { AppState } from '../store/store';
import { buildStructureEvidence, EXCERPT_RATE, pcmSource, readExcerpt, windsExcerpts, windsFromGuesses, type EvidenceSources, type WindsExcerpt } from './evidence';
import type { EvidenceGatherer, EvidenceRefiner } from './refresh';
import type { HarmonyBar, InstrumentGuess, InstrumentRecognizer, StructureEvidence } from './types';

/** The audio of the project in memory that the evidence reads; null when none of it is. */
export function evidenceSourcesOf(s: AppState): EvidenceSources | null {
  const tracks = [...s.tracks, ...s.separation.aside];
  let mix: string | null = null;
  const stems: Partial<Record<StemId, string>> = {};
  for (const tr of tracks) {
    if (!getAudio(tr.audio.id)) continue;
    if (tr.stem) {
      if (!stems[tr.stem]) stems[tr.stem] = tr.audio.id;
    } else if (tr.role === 'morceau' && mix === null) mix = tr.audio.id;
  }
  if (mix === null && !Object.keys(stems).length) return null;
  return { mix, stems };
}

/** The runner's gatherer: the evidence of the audio in memory, or null. */
export const gatherStructureEvidence: EvidenceGatherer = async (state: AppState, bars: readonly HarmonyBar[], signal: AbortSignal): Promise<StructureEvidence | null> => {
  const sources = evidenceSourcesOf(state);
  if (!sources || !bars.length) return null;
  return buildStructureEvidence(sources, bars, { signal });
};

// ---------------------------------------------------------------- step 2: the wind instruments

/** A reading kept: the recogniser's answer for one excerpt of one audio. */
interface Reading {
  guess: InstrumentGuess | null;
  /** When it was read (a null answer is asked again after `RETRY_NULL_MS`: the model may have come since). */
  at: number;
}

/** Readings kept (a few pieces' worth of solos). */
const READINGS_KEPT = 256;
/** A null answer (nothing heard, or the recogniser unusable: offline…) is asked again after this long. */
export const RETRY_NULL_MS = 10 * 60_000;

export interface WindsRefinerOptions {
  /** The recogniser of the page, created on first use (null: none on this device). */
  recognizer: () => InstrumentRecognizer | null;
  /** Clock (tests). */
  now?: () => number;
}

/** The excerpt's key in the readings: its audio and its limits to the millisecond. */
const readingKey = (audioId: string, ex: WindsExcerpt) => `${audioId}|${Math.round(ex.start * 1000)}|${Math.round(ex.end * 1000)}`;

export interface WindsRefiner extends EvidenceRefiner {
  /** Forgets the readings (tests). */
  clear(): void;
  /** How many times the recogniser was asked (tests, diagnostics). */
  asked(): number;
}

/** The runner's refiner of the wind instruments (see the header). */
export function createWindsRefiner(options: WindsRefinerOptions): WindsRefiner {
  const now = options.now ?? (() => Date.now());
  const readings = new Map<string, Reading>();
  let asked = 0;
  const known = (key: string): Reading | null => {
    const r = readings.get(key);
    if (!r) return null;
    if (r.guess === null && now() - r.at > RETRY_NULL_MS) return null;
    return r;
  };
  const keep = (key: string, guess: InstrumentGuess | null) => {
    readings.delete(key);
    readings.set(key, { guess, at: now() });
    while (readings.size > READINGS_KEPT) readings.delete(readings.keys().next().value!);
  };

  const refine = ((state, input, keysInForce, signal) => {
    if (!state.settings.autoStructure) return null;
    const evidence = input.evidence;
    if (!evidence?.stems) return null;
    const sources = evidenceSourcesOf(state);
    if (!sources) return null;
    const excerpts = windsExcerpts(input, keysInForce).filter((ex) => sources.stems[ex.stem]);
    if (!excerpts.length) return null;
    const keys = excerpts.map((ex) => readingKey(sources.stems[ex.stem]!, ex));
    const n = input.bars.length;
    const have = keys.map(known);
    if (have.every((r) => r !== null)) return windsFromGuesses(evidence, n, excerpts, have.map((r) => r!.guess));
    return (async () => {
      const guesses: (InstrumentGuess | null)[] = [];
      let recognizer: InstrumentRecognizer | null = null;
      for (let k = 0; k < excerpts.length; k++) {
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        const r = known(keys[k]!);
        if (r) {
          guesses.push(r.guess);
          continue;
        }
        recognizer ??= options.recognizer();
        if (!recognizer) return null;
        const ex = excerpts[k]!;
        const pcm = getAudio(sources.stems[ex.stem]!);
        const mono = pcm ? await readExcerpt(pcmSource(pcm), ex.start, ex.end, signal) : null;
        let guess: InstrumentGuess | null = null;
        if (mono) {
          asked++;
          try {
            guess = await recognizer.recognise(mono, EXCERPT_RATE, signal);
          } catch {
            guess = null;
          }
        }
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        keep(keys[k]!, guess);
        guesses.push(guess);
      }
      return windsFromGuesses(evidence, n, excerpts, guesses);
    })();
  }) as WindsRefiner;
  refine.clear = () => readings.clear();
  refine.asked = () => asked;
  return refine;
}

// ---------------------------------------------------------------- the page's

let pageRecognizer: InstrumentRecognizer | null = null;
let recognizerFactory: (() => InstrumentRecognizer | null) | null = null;

/**
 * The recogniser of the page: `createInstrumentRecognizer()`, made on its first use (with a separation
 * there to read), loaded on demand so that its code waits too. A test puts its own with `setPageRecognizer`.
 */
async function loadPageRecognizer(): Promise<InstrumentRecognizer | null> {
  if (pageRecognizer) return pageRecognizer;
  if (recognizerFactory) return (pageRecognizer = recognizerFactory());
  try {
    const m = await import('./instruments');
    pageRecognizer ??= m.createInstrumentRecognizer({ loadShare: currentLoadShare });
  } catch {
    return null;
  }
  return pageRecognizer;
}

/** Puts in a stand-in recogniser (browser checks: `window.__fabtice.harmony.setRecognizer`); null goes back to the real one. */
export function setPageRecognizer(recognizer: InstrumentRecognizer | null): void {
  recognizerFactory = recognizer ? () => recognizer : null;
  pageRecognizer = recognizer;
  pageRefiner.clear();
}

/** The page's recogniser as the refiner wants it: a proxy that loads the real one on its first excerpt. */
const lazyRecognizer: InstrumentRecognizer = {
  async recognise(mono, sampleRate, signal) {
    const r = await loadPageRecognizer();
    return r ? r.recognise(mono, sampleRate, signal) : null;
  },
};

/** The refiner of the page (one for the page, like its recogniser). */
export const pageRefiner: WindsRefiner = createWindsRefiner({ recognizer: () => lazyRecognizer });

/** What `main.tsx` gives `startHarmonyRefresh`: the gatherer and the refiner of the page. */
export function installStructureEvidence(): { gatherEvidence: EvidenceGatherer; refineEvidence: EvidenceRefiner } {
  return { gatherEvidence: gatherStructureEvidence, refineEvidence: pageRefiner };
}
