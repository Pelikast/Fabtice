// `?demo&piece=feuilles`: a made-up piece shaped like the owner's example of the simplified chart (C14, v1/CAHIER.md):
// Intro, Thème (AABC), Solo Piano (AABC), Solo Trompette (AA), Thème 2 (BC), 97 bars in B minor at 120 BPM, with the
// small variations of a real recording between the repeats (A13 for A7, F♯7♭9, a tritone substitute C7 for F♯7, Em9,
// Dmaj9). The audio is silence (the screens, the checks and the captures need the chart and the playing position, not the
// sound). Everything is real state: the chords are the analysis', the letters and the parts the detected structure, so
// `selectSimplifiedChart` writes the example from them.
//
// The same bars feed the unit tests (`autumnBars`), so what the browser shows and what the tests read cannot differ.

import { beatToTime, barStartTime, barToBeat, constantTempoMap } from '../grid/tempoMap';
import { beatGridOf } from '../grid/beats';
import { parseChord } from '../harmony/parse';
import { ANALYSIS_RESULT_VERSION, type AnalysedChord, type AnalysisResult } from '../model/analysis';
import type { DetectedStructure, PartInstrument, PartType, StructurePart } from '../model/structure';
import type { TempoMap } from '../model/tempoMap';
import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import type { NewProjectInput } from '../store/actions';

export const AUTUMN_BPM = 120;
export const AUTUMN_FIRST_DOWNBEAT = 0.5;

/** `-` is a bar where no chord starts: the one before goes on (written « % »). */
const cells = (text: string): string[][] => text.split('|').map((c) => (c.trim() === '-' ? [] : c.trim().split(/\s+/)));

const A1 = 'Em7 | A7 | Dmaj7 | Gmaj7 | C#m7b5 | F#7 | Bm | -';
const A2 = 'Em7 | A13 | Dmaj7 | Gmaj7 | C#m7b5 | F#7b9 | Bm | -';
/** The pianist's chorus: richer chords, and a tritone substitute for F♯7. */
const SA1 = 'Em9 | A7 | Dmaj9 | Gmaj7 | C#m7b5 | F#7#9 | Bm6 | -';
const SA2 = 'Em7 | A7 | Dmaj7 | Gmaj7 | C#m7b5 | C7 | Bm | -';
const B = 'C#m7b5 | F#7 | Bm | - | Em7 | A7 | Dmaj7 | Gmaj7';
const SB = 'C#m7b5 | F#7 | Bm | - | Em7 | A7 | Dmaj7 | Gmaj9';
const C = 'C#m7b5 | F#7 | Bm Bb7 | Am7 G#7 | C#m7b5 | F#7 | Bm | -';

/** The chords of every bar, as text (« Bm Bb7 »); an empty list is a bar that goes on with the chord before. 97 bars. */
export function autumnBars(): string[][] {
  return [
    ...cells('Bm'),
    // Thème Chant: A A B C
    ...cells([A1, A2, B, C].join(' | ')),
    // Solo Piano: A A B C
    ...cells([SA1, SA2, SB, C].join(' | ')),
    // Solo Trompette: A A
    ...cells([A1, A1].join(' | ')),
    // Thème Chant 2: B C
    ...cells([B, C].join(' | ')),
  ];
}

export const AUTUMN_BAR_COUNT = 97;

type Row = [type: PartType, number: number | null, instrument: PartInstrument | null, firstBar: number, endBar: number];

export const AUTUMN_PARTS: Row[] = [
  ['intro', null, null, 0, 1],
  ['theme', 1, null, 1, 33],
  ['solo', null, 'piano', 33, 65],
  ['solo', null, 'trumpet', 65, 81],
  ['theme', 2, null, 81, 97],
];

export const AUTUMN_LETTERS: [bar: number, label: string][] = [
  [1, 'A'], [9, 'A'], [17, 'B'], [25, 'C'],
  [33, 'A'], [41, 'A'], [49, 'B'], [57, 'C'],
  [65, 'A'], [73, 'A'],
  [81, 'B'], [89, 'C'],
];

/** The detected structure of the piece on the grid `map`. */
export function autumnStructure(map: TempoMap): DetectedStructure {
  const parts: StructurePart[] = AUTUMN_PARTS.map(([type, number, instrument, first, end], i) => ({
    id: `autumn-${i + 1}`,
    type,
    number,
    instrument,
    start: barStartTime(map, first),
    end: barStartTime(map, end),
  }));
  return { mode: 'jazz', form: 'AABC', sections: AUTUMN_LETTERS.map(([bar, label]) => ({ time: barStartTime(map, bar), label })), parts };
}

export function autumnTempoMap(): TempoMap {
  return constantTempoMap({ bpm: AUTUMN_BPM, firstDownbeat: AUTUMN_FIRST_DOWNBEAT, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
}

/** The piece ends with its last bar (no tail bar after it: the chart has 97 bars, not 98). */
export function autumnDuration(map: TempoMap): number {
  return barStartTime(map, AUTUMN_BAR_COUNT) - 0.02;
}

/** What « the analysis » finds in the piece: its chords (the bars above), the key, the structure. */
export function autumnAnalysis(map: TempoMap, duration: number): AnalysisResult {
  const grid = beatGridOf(map, duration);
  const chords: AnalysedChord[] = [];
  autumnBars().forEach((bar, i) => {
    const at = bar.length === 2 ? [0, 2] : bar.map((_, k) => k);
    bar.forEach((text, k) => {
      const parsed = parseChord(text);
      if (!parsed.ok) throw new Error(`autumn piece: cannot read ${text}`);
      chords.push({ time: beatToTime(map, barToBeat(map, i) + at[k]!), chord: parsed.chord, confidence: 0.7, doubtful: false, alternatives: [] });
    });
  });
  return {
    version: ANALYSIS_RESULT_VERSION,
    analyser: { id: 'mock', version: 'demo', models: [] },
    analysedAt: '2026-11-17T09:00:00.000Z',
    duration,
    beats: { times: grid.times, downbeat: grid.downbeat, meter: grid.meter, meterConfidence: 0.9 },
    key: { tonic: 11, mode: 'minor', confidence: 0.8, alternatives: [] },
    keyChanges: [],
    tuning: { cents: 0, confidence: 0.8 },
    chords,
    structure: autumnStructure(map),
  };
}

/** The piece as an import would give it: one silent track as long as the chart. */
export function autumnProject(): NewProjectInput {
  const map = autumnTempoMap();
  const duration = autumnDuration(map);
  return {
    title: 'Feuilles mortes',
    source: { kind: 'demo' },
    tempoMap: map,
    loop: null,
    tracks: [{ role: 'morceau', audio: { channels: [new Float32Array(Math.ceil(duration * ENGINE_SAMPLE_RATE))], sampleRate: ENGINE_SAMPLE_RATE } }],
    analysis: autumnAnalysis(map, duration),
  };
}
