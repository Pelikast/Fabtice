// The runner of the harmony pass (stage 5): it builds the pass's input from
// the state, runs the detectors (`index.ts`) and stores what they find in the
// DETECTED layer of the analysis (`analysis.keyChanges`, `analysis.structure`),
// never in the user's corrections.
//
// When: after any change of what the pass reads, debounced (`DEBOUNCE_MS`
// after the last one), off the critical path of typing a chord:
//   - the grid in force (`gridInForce`: a tempo correction by ear or tapped
//     once it is kept, never its preview; a signature change; a grid
//     correction) and the chords in force (a full analysis, a chord written,
//     confirmed or given back to the analysis, undo, redo);
//   - the main key in force (by hand or analysed) and the modulations by hand
//     (the structure is found with the keys in force);
//   - the separation (the audio evidence changes), the « Mode » of the
//     structure, the settings « Détecter les modulations », « Structure
//     automatique du morceau », « S'appuyer sur les grilles connues »;
//   - another project (an older document whose structure was never looked
//     for gets one), the library of standards downloaded or changed.
// Detection order: `detectKeyChanges` → the keys in force (the user's list
// wins) → `detectStructure(input, keysInForce)`. A run that finds what is
// already stored changes nothing (the same `analysis` object); otherwise only
// the derived fields of the analysis change, which the history treats as no
// step (`store/history.ts`). Detected parts keep their id across runs when
// they are « the same » (same type, overlapping), so that the display chosen
// in the structure column (`ui.chartDisplay`, a part id) stays on it.
//
// Async parts, each cached and cancellable: the known charts of the title
// (`analysis/knownCharts.ts`, its own timeout), per title; the audio evidence
// (`EvidenceGatherer`, injected: `structure/gather.ts` plugs in there), per
// audio and grid. A run whose inputs changed while it waited gives up: the
// change has scheduled the next one.
//
// A second, optional step (`EvidenceRefiner`, the wind instruments): once the
// structure is found, the refiner may add to the evidence what only that
// structure tells where to look (the recogniser on the « Autres » track of each
// wind solo). When it answers at once (every reading already known), the
// structure is found again with it before anything is stored; when it must
// wait, the first result is stored at once and the refined one replaces it
// when it comes (« Solo (Vents) » may become « Solo (Trompette) »), the parts
// keeping their ids. The run stays pending until then.

import { knownChartsFor } from '../analysis/knownCharts';
import { chartBars, resolveChords } from '../chart/layout';
import type { AnalysedKeyChange } from '../model/analysis';
import type { Key } from '../model/harmony';
import type { DetectedStructure, StructurePart } from '../model/structure';
import { areAnalysedKeyChanges, isDetectedStructure } from '../storage/documentFormat';
import { keyInForce } from '../store/chartSelectors';
import { harmonyBars } from '../store/simplifiedSelectors';
import { appStore, gridInForce, type AppState, type AppStore } from '../store/store';
import { detectKeyChanges as appDetectKeyChanges, detectStructure as appDetectStructure } from './index';
import { clearKnownStandards, setKnownStandards } from './knownCache';
import { setPageRecognizer } from './gather';
import type { HarmonyBar, HarmonyInput, InstrumentRecognizer, KeyChangeDetector, KnownStandard, StructureDetector, StructureEvidence } from './types';

/** Wait after the last change before the pass runs. */
export const DEBOUNCE_MS = 150;

/**
 * What the audio says about who plays, bar by bar (`StructureEvidence`), for the bars of the input
 * (`bars`, in order). Resolves to null when there is nothing to say (no audio in memory). Must give up
 * quickly when `signal` is aborted (a newer run replaces it). Its result is cached per audio and grid.
 */
export type EvidenceGatherer = (state: AppState, bars: readonly HarmonyBar[], signal: AbortSignal) => Promise<StructureEvidence | null>;

/**
 * The second step of the evidence (see the header): given the input of the run (its `evidence` from the
 * gatherer) and the keys in force, the evidence completed, or null when there is nothing to add. Answers
 * synchronously when it can (no wait: the refined structure is stored at once); otherwise a promise, which
 * must give up quickly when `signal` is aborted.
 */
export type EvidenceRefiner = (
  state: AppState,
  input: HarmonyInput,
  keysInForce: readonly { time: number; key: Key }[],
  signal: AbortSignal,
) => StructureEvidence | null | Promise<StructureEvidence | null>;

/** The known charts of a title, best first (empty when none). */
export type KnownProvider = (title: string) => Promise<KnownStandard[]>;

export interface HarmonyRefreshOptions {
  store?: AppStore;
  debounceMs?: number;
  /** Default: no evidence (the pass works from the chords alone). */
  gatherEvidence?: EvidenceGatherer;
  /** Default: none (no second step). */
  refineEvidence?: EvidenceRefiner | null;
  /** Default: the library of standards on the device (`knownChartsFor`). */
  knownFor?: KnownProvider;
  /** Called with a listener to run when the library of standards changes; returns its unsubscribe. Default: none. */
  onLibraryChange?: ((listener: () => void) => () => void) | null;
  /** The detectors (tests); default: `structure/index.ts`. */
  detectKeyChanges?: KeyChangeDetector;
  detectStructure?: StructureDetector;
}

const noEvidence: EvidenceGatherer = async () => null;

/** The library of standards, as the pass takes it. */
export const libraryKnownFor: KnownProvider = async (title) => {
  const found = await knownChartsFor(title);
  return found ? found.candidates.map((c) => ({ chart: c.chart, titleScore: c.titleScore })) : [];
};

/** What the input depends on, compared by reference (the derived fields of the analysis are not in it). */
function depsOf(s: AppState): readonly unknown[] {
  const c = s.corrections;
  return [
    s.project?.id ?? null,
    s.project?.title ?? null,
    s.project?.duration ?? 0,
    gridInForce(s),
    s.analysis !== null,
    s.analysis?.chords ?? null,
    s.analysis?.key ?? null,
    c.chords,
    c.handSpans,
    c.key,
    c.keyChanges,
    c.structure.mode,
    c.sections,
    c.structure.lettersByHand,
    s.settings.detectModulations,
    s.settings.autoStructure,
    s.settings.useKnownCharts,
    s.tracks,
    s.separation,
  ];
}

const sameDeps = (a: readonly unknown[] | null, b: readonly unknown[]) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);

/** Which audio the evidence is measured on: every track the project holds, by audio id. */
function audioKey(s: AppState): string {
  const ids = [...s.tracks, ...s.separation.aside, ...s.separation.others.flatMap((o) => o.tracks)].map((tr) => tr.audio.id);
  return ids.join('|');
}

/**
 * Bars read after the last bar where a chord starts: far more than any ending or silence of a real piece
 * (the detectors' work grows faster than the bars: a piece stretched to tens of thousands of empty bars
 * would block the page for minutes).
 */
export const BARS_AFTER_LAST_CHORD = 256;

/**
 * The bars of the chart in force, on the grid in force (never a tapped preview), as the pass reads them: up
 * to `BARS_AFTER_LAST_CHORD` bars after the last chord that starts.
 */
export function harmonyBarsOf(s: AppState): HarmonyBar[] {
  if (!s.project) return [];
  const map = gridInForce(s);
  const chords = resolveChords(map, s.analysis?.chords ?? null, s.corrections);
  const bars = harmonyBars(chartBars({ map, chords, sections: [], duration: s.project.duration }));
  let last = -1;
  bars.forEach((b, i) => {
    if (b.chords.length) last = i;
  });
  return last >= 0 && bars.length > last + 1 + BARS_AFTER_LAST_CHORD ? bars.slice(0, last + 1 + BARS_AFTER_LAST_CHORD) : bars;
}

/** Same content (small data: the modulations, the structure). */
const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Detected parts keep the id of the part they replace when it is « the same »: same type, the
 * largest overlap among the parts of the previous result not taken yet. Ids stay unique.
 */
export function withStableIds(previous: DetectedStructure | null, next: DetectedStructure | null): DetectedStructure | null {
  if (!next || !previous || !previous.parts.length) return next;
  const taken = new Set<string>();
  const parts: StructurePart[] = next.parts.map((p) => {
    let best: StructurePart | null = null;
    let bestOverlap = 0;
    for (const q of previous.parts) {
      if (taken.has(q.id) || q.type !== p.type) continue;
      const overlap = Math.min(p.end, q.end) - Math.max(p.start, q.start);
      if (overlap > bestOverlap + 1e-9) {
        bestOverlap = overlap;
        best = q;
      }
    }
    if (!best) return p;
    taken.add(best.id);
    return best.id === p.id ? p : { ...p, id: best.id };
  });
  // A part that kept its own id may now share it with one that took an old id: give it a new one.
  const seen = new Set<string>();
  const unique = parts.map((p) => {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      return p;
    }
    let n = 2;
    while (seen.has(`${p.id}-${n}`)) n++;
    const id = `${p.id}-${n}`;
    seen.add(id);
    return { ...p, id };
  });
  return { ...next, parts: unique };
}

const plainKey = (k: Key): Key => ({ tonic: k.tonic, mode: k.mode });

export class HarmonyRefresh {
  private readonly store: AppStore;
  private readonly debounceMs: number;
  private gatherEvidence: EvidenceGatherer;
  private refineEvidence: EvidenceRefiner | null;
  private readonly knownFor: KnownProvider;
  private readonly onLibraryChange: ((listener: () => void) => () => void) | null;
  private readonly detectKeyChanges: KeyChangeDetector;
  private readonly detectStructure: StructureDetector;
  private lastDeps: readonly unknown[] | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private running = 0;
  private current: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private knownPending = new Map<string, Promise<KnownStandard[]>>();
  private evidenceCache: { key: string; grid: unknown; value: StructureEvidence | null } | null = null;
  private input: HarmonyInput | null = null;
  private suspended = false;
  private offs: (() => void)[] = [];
  /** How many runs stored something (tests, diagnostics). */
  writes = 0;

  constructor(options: HarmonyRefreshOptions = {}) {
    this.store = options.store ?? appStore;
    this.debounceMs = options.debounceMs ?? DEBOUNCE_MS;
    this.gatherEvidence = options.gatherEvidence ?? noEvidence;
    this.refineEvidence = options.refineEvidence ?? null;
    this.knownFor = options.knownFor ?? libraryKnownFor;
    this.onLibraryChange = options.onLibraryChange ?? null;
    this.detectKeyChanges = options.detectKeyChanges ?? appDetectKeyChanges;
    this.detectStructure = options.detectStructure ?? appDetectStructure;
  }

  /** Starts following the store (and the library); a first run is scheduled for the piece open, if any. Returns the stop function. */
  start(): () => void {
    this.stop();
    this.offs.push(this.store.subscribe((s) => this.onChange(s)));
    if (this.onLibraryChange) this.offs.push(this.onLibraryChange(() => this.libraryChanged()));
    this.lastDeps = depsOf(this.store.getState());
    if (this.store.getState().project) this.schedule();
    return () => this.stop();
  }

  stop(): void {
    for (const off of this.offs.splice(0)) off();
    this.cancel();
  }

  /** Plugs in (or, with null, removes) the builder of the audio evidence; the pass runs again with it. */
  setEvidenceGatherer(gather: EvidenceGatherer | null): void {
    this.gatherEvidence = gather ?? noEvidence;
    this.evidenceCache = null;
    if (!this.suspended && this.store.getState().project) this.schedule();
  }

  /** Plugs in (or, with null, removes) the second step of the evidence; the pass runs again with it. */
  setEvidenceRefiner(refine: EvidenceRefiner | null): void {
    this.refineEvidence = refine;
    if (!this.suspended && this.store.getState().project) this.schedule();
  }

  /** The automatic runs stop (a test standing in for the detection); `refreshNow` still runs. */
  suspend(): void {
    this.suspended = true;
    this.cancel();
  }

  resume(): void {
    this.suspended = false;
    this.lastDeps = null;
    this.onChange(this.store.getState());
  }

  isSuspended(): boolean {
    return this.suspended;
  }

  /** Runs the pass now (the debounce skipped). Resolves once it stored its result, or gave up. */
  refreshNow(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    return this.launch();
  }

  /** A run is waiting for its debounce or running. */
  pending(): boolean {
    return this.timer !== null || this.running > 0;
  }

  /** Resolves when nothing is pending any more (tests). */
  async settled(): Promise<void> {
    while (this.pending()) {
      if (this.timer !== null) await this.refreshNow();
      else await this.current;
    }
  }

  /** The input of the last run that reached the detectors (tests, diagnostics). */
  lastInput(): HarmonyInput | null {
    return this.input;
  }

  // ------------------------------------------------------------ internals

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.seq++;
    this.abort?.abort();
    this.abort = null;
  }

  private onChange(s: AppState): void {
    const deps = depsOf(s);
    if (sameDeps(this.lastDeps, deps)) return;
    const projectChanged = !this.lastDeps || this.lastDeps[0] !== deps[0];
    this.lastDeps = deps;
    if (projectChanged) {
      this.evidenceCache = null;
      this.input = null;
      this.cancel();
    }
    if (this.suspended || !s.project) return;
    this.schedule();
  }

  private libraryChanged(): void {
    clearKnownStandards();
    this.knownPending.clear();
    if (!this.suspended && this.store.getState().project) this.schedule();
  }

  private schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.launch();
    }, this.debounceMs);
  }

  private launch(): Promise<void> {
    const token = ++this.seq;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    this.running++;
    const run = this.run(token, abort.signal).finally(() => {
      this.running--;
      if (this.abort === abort) this.abort = null;
    });
    this.current = run;
    return run;
  }

  private known(title: string): Promise<KnownStandard[]> {
    let p = this.knownPending.get(title);
    if (!p) {
      p = this.knownFor(title).catch(() => [] as KnownStandard[]);
      this.knownPending.set(title, p);
      void p.then((list) => {
        // The simplified chart reads the same charts: tell the store's readers when they change.
        if (this.knownPending.get(title) === p && setKnownStandards(title, list)) this.store.setState({});
      });
    }
    return p;
  }

  private async evidence(s: AppState, bars: HarmonyBar[], signal: AbortSignal): Promise<StructureEvidence | null> {
    const key = audioKey(s);
    const grid = gridInForce(s);
    const c = this.evidenceCache;
    if (c && c.key === key && c.grid === grid) return c.value;
    let value: StructureEvidence | null = null;
    try {
      value = await this.gatherEvidence(s, bars, signal);
    } catch {
      value = null;
    }
    if (!signal.aborted) this.evidenceCache = { key, grid, value };
    return value;
  }

  private async run(token: number, signal: AbortSignal): Promise<void> {
    const stale = () => token !== this.seq || signal.aborted;
    const start = this.store.getState();
    if (!start.project || !start.analysis) return;
    const deps = depsOf(start);
    const { detectModulations, autoStructure, useKnownCharts } = start.settings;
    const detecting = detectModulations || autoStructure;
    const bars = harmonyBarsOf(start);
    let known: KnownStandard[] = [];
    let evidence: StructureEvidence | null = null;
    if (detecting) {
      const title = start.project.title;
      if (useKnownCharts && title.trim()) known = await this.known(title);
      if (stale()) return;
      if (autoStructure) evidence = await this.evidence(start, bars, signal);
      if (stale()) return;
    }
    const s = this.store.getState();
    // The inputs changed while it waited: that change scheduled the next run.
    if (!sameDeps(depsOf(s), deps) || !s.analysis || !s.project) return;
    const main = keyInForce(s);
    const input: HarmonyInput = {
      bars,
      duration: s.project.duration,
      key: main.key ? plainKey(main.key) : null,
      keyConfidence: main.origin === 'manual' ? 1 : (main.confidence ?? 0),
      known: useKnownCharts ? known : [],
      evidence,
      mode: s.corrections.structure.mode,
      // The letters written by hand (1.0.1): fixed points of the form.
      handSections: s.corrections.structure.lettersByHand || s.corrections.sections.length ? s.corrections.sections : [],
    };
    if (detecting) this.input = input;
    let keyChanges: AnalysedKeyChange[] = [];
    let structure: DetectedStructure | null = null;
    let keysInForce: { time: number; key: Key }[] = [];
    try {
      if (detectModulations && bars.length) keyChanges = this.detectKeyChanges(input);
      // The structure is found with the keys in force: the user's list wins over what was just detected.
      keysInForce = s.corrections.keyChanges ?? keyChanges.map((k) => ({ time: k.time, key: plainKey(k.key) }));
      if (autoStructure && bars.length) structure = withStableIds(s.analysis.structure, this.detectStructure(input, keysInForce));
    } catch {
      // A detector that throws leaves what is stored as it is.
      return;
    }
    // The second step: at once when it can answer at once, else after the first result is stored.
    let later: Promise<StructureEvidence | null> | null = null;
    if (structure && evidence && this.refineEvidence) {
      let refined: StructureEvidence | null | Promise<StructureEvidence | null> = null;
      try {
        refined = this.refineEvidence(s, input, keysInForce, signal);
      } catch {
        refined = null;
      }
      if (refined instanceof Promise) later = refined;
      else if (refined) structure = this.refined(s.analysis.structure, structure, input, refined, keysInForce);
    }
    // Never store what the document reader would drop (with the whole analysis): an invalid answer is no answer.
    if (!areAnalysedKeyChanges(keyChanges)) keyChanges = [];
    if (structure !== null && !isDetectedStructure(structure)) structure = null;
    this.store1(s, keyChanges, structure);
    if (!later) return;
    let more: StructureEvidence | null = null;
    try {
      more = await later;
    } catch {
      more = null;
    }
    const now = this.store.getState();
    if (!more || stale() || !sameDeps(depsOf(now), deps) || !now.analysis) return;
    const next = this.refined(now.analysis.structure, structure, input, more, keysInForce);
    if (next !== structure && next !== null && isDetectedStructure(next)) this.store1(now, now.analysis.keyChanges, next);
  }

  /** The structure found again with the refined evidence (`previous` keeps the ids); `fallback` when it fails. */
  private refined(
    previous: DetectedStructure | null,
    fallback: DetectedStructure | null,
    input: HarmonyInput,
    evidence: StructureEvidence,
    keysInForce: readonly { time: number; key: Key }[],
  ): DetectedStructure | null {
    const refinedInput: HarmonyInput = { ...input, evidence };
    try {
      const found = this.detectStructure(refinedInput, keysInForce);
      if (!found) return fallback;
      this.input = refinedInput;
      return withStableIds(previous, found);
    } catch {
      return fallback;
    }
  }

  /** Stores what was found, when it differs from what is stored (the same `analysis` object otherwise). */
  private store1(s: AppState, keyChanges: AnalysedKeyChange[], structure: DetectedStructure | null): void {
    const a = s.analysis;
    if (!a) return;
    const sameKeys = sameJson(a.keyChanges, keyChanges);
    const sameStructure = sameJson(a.structure, structure);
    if (sameKeys && sameStructure) return;
    this.writes++;
    this.store.setState({ analysis: { ...a, keyChanges: sameKeys ? a.keyChanges : keyChanges, structure: sameStructure ? a.structure : structure } });
  }
}

// ---------------------------------------------------------------- the app's runner

let app: HarmonyRefresh | null = null;

/** Starts the runner of the app (`main.tsx`, tests). Returns the stop function. */
export function startHarmonyRefresh(options: HarmonyRefreshOptions = {}): () => void {
  app?.stop();
  const r = new HarmonyRefresh(options);
  app = r;
  const stop = r.start();
  return () => {
    stop();
    if (app === r) app = null;
  };
}

export function harmonyRefresh(): HarmonyRefresh | null {
  return app;
}

/**
 * Plugs the builder of the audio evidence into the app's runner (`structure/evidence.ts` at merge
 * time: `setHarmonyEvidenceGatherer((state, bars, signal) => …)`); null removes it.
 */
export function setHarmonyEvidenceGatherer(gather: EvidenceGatherer | null): void {
  app?.setEvidenceGatherer(gather);
}

/** Plugs the second step of the evidence (the wind instruments, `structure/gather.ts`) into the app's runner; null removes it. */
export function setHarmonyEvidenceRefiner(refine: EvidenceRefiner | null): void {
  app?.setEvidenceRefiner(refine);
}

/** Runs the pass now; resolves at once without a runner. */
export function refreshHarmonyNow(): Promise<void> {
  return app?.refreshNow() ?? Promise.resolve();
}

/** A run is pending (debounce or running). */
export function harmonyRefreshPending(): boolean {
  return app?.pending() ?? false;
}

/** The automatic runs stop until `resumeHarmonyRefresh` (a detection stood in for by a test or the demo). */
export function suspendHarmonyRefresh(): void {
  app?.suspend();
}

export function resumeHarmonyRefresh(): void {
  app?.resume();
}

/** The browser checks' handle (`window.__fabtice.harmony`). */
export const harmonyHandle = {
  refreshNow: (): Promise<void> => refreshHarmonyNow(),
  lastInput: (): HarmonyInput | null => app?.lastInput() ?? null,
  pending: (): boolean => harmonyRefreshPending(),
  settled: (): Promise<void> => app?.settled() ?? Promise.resolve(),
  suspend: (): void => suspendHarmonyRefresh(),
  resume: (): void => resumeHarmonyRefresh(),
  suspended: (): boolean => app?.isSuspended() ?? false,
  writes: (): number => app?.writes ?? 0,
  /** A stand-in for the page's instrument recogniser (null: the real one again); its readings are forgotten. */
  setRecognizer: (recognizer: InstrumentRecognizer | null): void => setPageRecognizer(recognizer),
};
