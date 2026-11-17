// The junction of the audio evidence with the runner (`gather.ts`, the two-step `refresh.ts`), on a
// made-up piece in memory: AABA three times, the voice on the first and last choruses, the « Autres »
// track leading the middle one; which tracks are read, the cache, cancellation, the winds reading that
// refines the stored structure later, and a recogniser that fails.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replaceEngine } from '../audio';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { pcmFromChannels } from '../audio/pcm';
import { clearAudio, registerAudio } from '../audio/registry';
import { constantTempoMap } from '../grid/tempoMap';
import { ANALYSIS_RESULT_VERSION, type AnalysedChord, type AnalysisResult } from '../model/analysis';
import type { Track } from '../model/project';
import type { StemId } from '../model/separation';
import type { DetectedStructure } from '../model/structure';
import * as actions from '../store/actions';
import { appStore, initialState, type AppState } from '../store/store';
import { clearEvidenceCache, evidenceKey } from './evidence';
import { createWindsRefiner, evidenceSourcesOf, gatherStructureEvidence } from './gather';
import { HarmonyRefresh } from './refresh';
import { AABA, chartBars, repeat } from './testCharts';
import type { InstrumentGuess, InstrumentRecognizer } from './types';

const SR = 48000;
const BAR = 1; // seconds (4 beats at 240 BPM)
const get = () => appStore.getState();

/** Who leads each chorus of the made-up piece (AABA, 32 bars a chorus). */
type Lead = 'voice' | 'other' | 'piano';

/** A track of `amp(bar)` amplitude whose pitch follows `pitch(bar, slot)` (8 slots a bar), with `harmonics` overtones. */
function tone(seconds: number, amp: (bar: number) => number, pitch: (bar: number, slot: number) => number, harmonics = 1): Float32Array {
  const out = new Float32Array(seconds * SR);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const bar = Math.floor(t / BAR);
    const slot = Math.floor(((t / BAR) % 1) * 8);
    phase += (2 * Math.PI * pitch(bar, slot)) / SR;
    const a = amp(bar);
    if (!a) continue;
    let x = 0;
    for (let h = 1; h <= harmonics; h++) x += Math.sin(h * phase) / h;
    out[i] = a * x;
  }
  return out;
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
// the theme: the same tune at each A; a solo: notes that do not come back
const tune = (bar: number, slot: number) => hz(67 + ((bar % 8) * 3 + slot * 5) % 12);
const improvised = (bar: number, slot: number) => hz(60 + ((bar * 37 + slot * 11) * 7919) % 17);

/** The piece: its bars, its separated tracks (a bright horn on « Autres », a piano that steps up for its solo). */
function piece(plan: readonly Lead[]) {
  const bars = chartBars(repeat(AABA, plan.length), { secondsPerBar: BAR });
  const duration = bars.length * BAR;
  const lead = (b: number) => plan[Math.floor(b / 32)];
  const stems: Partial<Record<StemId, Float32Array>> = {
    vocals: tone(duration, (b) => (lead(b) === 'voice' ? 0.25 : 0), tune),
    other: tone(duration, (b) => (lead(b) === 'other' ? 0.22 : 0.003), improvised, 6),
    piano: tone(duration, (b) => (lead(b) === 'piano' ? 0.3 : 0.06), (b, k) => (lead(b) === 'piano' ? hz(72 + ((b * 29 + k * 7) % 13)) : hz(55)), 3),
    bass: tone(duration, () => 0.08, () => hz(40)),
  };
  return { bars, duration, stems, n: bars.length };
}

let P = piece(['voice', 'other', 'voice']);
let BARS = P.bars;
let N = P.n;
let DURATION = P.duration;
let STEMS = P.stems;

function usePiece(plan: readonly Lead[]) {
  P = piece(plan);
  BARS = P.bars;
  N = P.n;
  DURATION = P.duration;
  STEMS = P.stems;
}

function mixOf(): Float32Array {
  const out = new Float32Array(DURATION * SR);
  for (const x of Object.values(STEMS)) for (let i = 0; i < out.length; i++) out[i] = out[i]! + x![i]!;
  return out;
}

function analysisOf(): AnalysisResult {
  const chords: AnalysedChord[] = [];
  for (const b of BARS) for (const c of b.chords) chords.push({ time: b.start + (c.beat * BAR) / 4, chord: c.chord, confidence: 0.8, doubtful: false, alternatives: [] });
  return {
    version: ANALYSIS_RESULT_VERSION,
    analyser: { id: 'mock', version: 'test', models: [] },
    analysedAt: '2026-11-17T09:00:00.000Z',
    duration: DURATION,
    beats: { times: Array.from({ length: N * 4 + 1 }, (_, i) => (i * BAR) / 4), downbeat: 0, meter: { numerator: 4, denominator: 4 }, meterConfidence: 0.9 },
    key: { tonic: 0, mode: 'major', confidence: 0.8, alternatives: [] },
    keyChanges: [],
    tuning: null,
    chords,
    structure: null,
  };
}

const track = (id: string, audioId: string, stem?: StemId): Track => ({
  id,
  name: stem ?? 'Morceau',
  role: stem ? (stem === 'vocals' ? 'voix' : stem === 'bass' ? 'basse' : stem === 'piano' ? 'piano' : 'autres') : 'morceau',
  mute: false,
  solo: false,
  volume: 1,
  audio: { id: audioId, origin: stem ? 'separated' : 'original', channels: 1, sampleRate: SR, frames: DURATION * SR },
  ...(stem ? { stem } : {}),
});

/** Opens the piece; `separated`: its separated tracks are registered and shown (the whole piece aside). */
async function openPiece(separated: boolean) {
  await actions.openProject({
    title: 'Essai',
    source: { kind: 'file', fileName: 'essai.wav' },
    tracks: [{ role: 'morceau', audio: { channels: [mixOf()], sampleRate: SR } }],
    tempoMap: constantTempoMap({ bpm: 240, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' }),
    analysis: analysisOf(),
  });
  if (!separated) return;
  const stems: Track[] = [];
  for (const [stem, x] of Object.entries(STEMS) as [StemId, Float32Array][]) {
    registerAudio(`sep-${stem}`, pcmFromChannels([x], SR));
    stems.push(track(`t-${stem}`, `sep-${stem}`, stem));
  }
  appStore.setState((s) => ({
    tracks: stems,
    separation: { result: { ...fakeSummary, stems: Object.keys(STEMS) as StemId[] }, showing: 'instruments', aside: s.tracks, others: [] },
  }));
}

const fakeSummary = {
  id: 'sep',
  modelId: 'test',
  modelName: 'Test',
  modelSha256: '0',
  backend: 'cpu',
  fellBack: false,
  stems: [],
  kept: [],
  startedAt: '2026-11-17T09:00:00.000Z',
  finishedAt: '2026-11-17T09:01:00.000Z',
  computeSeconds: 60,
  pieceSeconds: 1,
} as NonNullable<AppState['separation']['result']>;

/** A recogniser that answers `answer` after `release()` (or at once when `wait` is false). */
function fakeRecognizer(answer: () => InstrumentGuess | null | Promise<InstrumentGuess | null>, wait = false) {
  const calls: { seconds: number; rate: number }[] = [];
  let open: () => void = () => {};
  let gate = wait ? new Promise<void>((r) => (open = r)) : Promise.resolve();
  const recognizer: InstrumentRecognizer = {
    async recognise(mono, rate) {
      calls.push({ seconds: mono.length / rate, rate });
      await gate;
      return answer();
    },
  };
  return {
    recognizer,
    calls,
    release() {
      open();
      gate = Promise.resolve();
    },
  };
}

const solos = (s: DetectedStructure | null) => (s?.parts ?? []).filter((p) => p.type === 'solo');

let runner: HarmonyRefresh | null = null;

beforeEach(() => {
  usePiece(['voice', 'other', 'voice']);
  replaceEngine(new MockEngine());
  connectEngine(appStore, new MockEngine());
  appStore.setState(initialState());
});

afterEach(() => {
  runner?.stop();
  runner = null;
  clearAudio();
  clearEvidenceCache();
});

describe('the audio the evidence reads', () => {
  it('reads the whole piece and the separated tracks of the current separation in memory, never the others', async () => {
    await openPiece(true);
    const s = get();
    const mixId = s.separation.aside[0]!.audio.id;
    // another separation, not in memory: not read
    appStore.setState((st) => ({ separation: { ...st.separation, others: [{ result: fakeSummary, tracks: [track('o1', 'other-sep-drums', 'drums')] }] } }));
    // a track whose samples are not in memory any more: not read
    appStore.setState((st) => ({ tracks: [...st.tracks, track('t-gone', 'gone', 'guitar')] }));
    expect(evidenceSourcesOf(get())).toEqual({ mix: mixId, stems: { vocals: 'sep-vocals', other: 'sep-other', piano: 'sep-piano', bass: 'sep-bass' } });
    // the whole piece shown, the instruments aside: the same
    appStore.setState((st) => ({ tracks: st.separation.aside, separation: { ...st.separation, showing: 'whole', aside: st.tracks } }));
    expect(evidenceSourcesOf(get())?.stems.other).toBe('sep-other');
    expect(evidenceSourcesOf(get())?.mix).toBe(mixId);
  });

  it('without separation: the whole piece only; nothing in memory: null', async () => {
    await openPiece(false);
    const sources = evidenceSourcesOf(get())!;
    expect(sources.stems).toEqual({});
    expect(sources.mix).toBe(get().tracks[0]!.audio.id);
    clearAudio();
    expect(evidenceSourcesOf(get())).toBeNull();
    expect(await gatherStructureEvidence(get(), BARS, new AbortController().signal)).toBeNull();
  });

  it('measures once per audio and grid (the cache), and gives up when aborted', async () => {
    await openPiece(true);
    const signal = new AbortController().signal;
    const a = await gatherStructureEvidence(get(), BARS, signal);
    expect(a?.stems?.other?.length).toBe(N);
    expect(a?.melody?.stems.vocals).toBeDefined();
    expect(await gatherStructureEvidence(get(), BARS, signal)).toBe(a);
    const shifted = BARS.map((b) => ({ ...b, start: b.start + 0.01, end: b.end + 0.01 }));
    const sources = evidenceSourcesOf(get())!;
    expect(evidenceKey(sources, shifted)).not.toBe(evidenceKey(sources, BARS));
    clearEvidenceCache();
    const abort = new AbortController();
    const p = gatherStructureEvidence(get(), BARS, abort.signal);
    abort.abort();
    await expect(p).rejects.toThrow(/abort/i);
  });
});

describe('the two steps in the runner', () => {
  function start(recognizer: InstrumentRecognizer | null) {
    const refine = createWindsRefiner({ recognizer: () => recognizer });
    runner = new HarmonyRefresh({ debounceMs: 0, gatherEvidence: gatherStructureEvidence, refineEvidence: refine, knownFor: async () => [] });
    runner.start();
    return refine;
  }

  it('stores « Solo (Vents) » at once, then the instrument the recogniser names, with the same part id', async () => {
    await openPiece(true);
    const fake = fakeRecognizer(() => ({ instrument: 'trumpet', confidence: 0.9 }), true);
    const refine = start(fake.recognizer);
    const first = runner!.refreshNow();
    // the first result is stored while the recogniser listens
    for (let i = 0; i < 400 && !get().analysis?.structure; i++) await new Promise((r) => setTimeout(r, 5));
    const before = get().analysis!.structure!;
    expect(solos(before).map((p) => p.instrument)).toEqual(['winds']);
    expect(runner!.pending()).toBe(true);
    fake.release();
    await first;
    await runner!.settled();
    const after = get().analysis!.structure!;
    expect(solos(after).map((p) => p.instrument)).toEqual(['trumpet']);
    expect(solos(after)[0]!.id).toBe(solos(before)[0]!.id);
    // one excerpt, the chorus the « Autres » track leads, read at 16 kHz
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.rate).toBe(16000);
    expect(fake.calls[0]!.seconds).toBeGreaterThan(30);
    expect(fake.calls[0]!.seconds).toBeLessThan(34);
    expect(refine.asked()).toBe(1);
    // the themes name the voice; nothing else is named a soloist
    expect(after.parts.filter((p) => p.type === 'theme').every((p) => p.instrument === 'voice')).toBe(true);
    // a later run reads the kept reading at once: never « Vents » again, the recogniser not asked again
    const writes = runner!.writes;
    appStore.setState((s) => ({ settings: { ...s.settings, useKnownCharts: !s.settings.useKnownCharts } }));
    await runner!.settled();
    expect(refine.asked()).toBe(1);
    expect(runner!.writes).toBe(writes);
    expect(solos(get().analysis!.structure).map((p) => p.instrument)).toEqual(['trumpet']);
  });

  it('a recogniser that fails or knows nothing: « Solo (Vents) » stays', async () => {
    await openPiece(true);
    start({
      async recognise() {
        throw new Error('no model');
      },
    });
    await runner!.refreshNow();
    await runner!.settled();
    expect(solos(get().analysis!.structure).map((p) => p.instrument)).toEqual(['winds']);
    runner!.stop();
    clearEvidenceCache();
    appStore.setState((s) => ({ analysis: s.analysis ? { ...s.analysis, structure: null } : null }));
    start(null);
    await runner!.refreshNow();
    await runner!.settled();
    expect(solos(get().analysis!.structure).map((p) => p.instrument)).toEqual(['winds']);
  });

  it('without separation: the solo is found by the timbre, no instrument named, the recogniser never asked', async () => {
    await openPiece(false);
    const fake = fakeRecognizer(() => ({ instrument: 'trumpet', confidence: 0.9 }));
    start(fake.recognizer);
    await runner!.refreshNow();
    await runner!.settled();
    const s = get().analysis!.structure!;
    expect(s.parts.every((p) => p.instrument === null)).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });

  it('« Structure automatique » off: no reading; another piece opened while it listens: nothing stored there', async () => {
    await openPiece(true);
    appStore.setState((s) => ({ settings: { ...s.settings, autoStructure: false } }));
    const fake = fakeRecognizer(() => ({ instrument: 'trumpet', confidence: 0.9 }), true);
    start(fake.recognizer);
    await runner!.refreshNow();
    expect(fake.calls).toHaveLength(0);
    appStore.setState((s) => ({ settings: { ...s.settings, autoStructure: true } }));
    const run = runner!.refreshNow();
    for (let i = 0; i < 400 && !fake.calls.length; i++) await new Promise((r) => setTimeout(r, 5));
    expect(fake.calls).toHaveLength(1);
    // another piece (no separation) while the recogniser listens
    await openPiece(false);
    fake.release();
    await run;
    await runner!.settled();
    expect(get().analysis!.structure?.parts.every((p) => p.instrument === null) ?? true).toBe(true);
  });

  it('two solos in a row: named with separation (trumpet, then piano), « Solo 1, Solo 2 » without', async () => {
    usePiece(['voice', 'other', 'piano', 'voice']);
    await openPiece(true);
    const fake = fakeRecognizer(() => ({ instrument: 'trumpet', confidence: 0.9 }));
    start(fake.recognizer);
    await runner!.refreshNow();
    await runner!.settled();
    const named = solos(get().analysis!.structure);
    expect(named.map((p) => [p.instrument, p.number])).toEqual([
      ['trumpet', null],
      ['piano', null],
    ]);
    runner!.stop();
    clearEvidenceCache();
    await openPiece(false);
    start(fake.recognizer);
    await runner!.refreshNow();
    await runner!.settled();
    expect(solos(get().analysis!.structure).map((p) => [p.instrument, p.number])).toEqual([
      [null, 1],
      [null, 2],
    ]);
  });
});

