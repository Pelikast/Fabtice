// `?demo`: a synthetic piece generated in code (no audio file), so the shell
// can be driven, tested and screenshotted without importing anything. A slow
// swing in A♭ around 110 BPM, 24 bars, four tracks, a little sharp
// (+18 cents, like many old records); deterministic.
//
// Two variants of the same music:
//   - `variable` (default): the tempo moves a little from bar 5 on, as when
//     people play; the piece opens analysed (`demo/demoAnalysis.ts`).
//   - `fixed` (`?demo&analyse=aucune`): exactly 110 BPM, the grid entered by
//     hand as in lot 1, no analysis (the timeline checks rely on it).

import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import type { DecodedAudio } from '../audio/registry';
import { tempoMapFromBeats } from '../grid/beats';
import { loopFromBars } from '../grid/lines';
import { barStartTime, beatToTime, constantTempoMap } from '../grid/tempoMap';
import { chord, QUALITY_INTERVALS } from '../harmony/chord';
import type { ChordSymbol } from '../model/harmony';
import type { TempoMap } from '../model/tempoMap';
import type { NewProjectInput } from '../store/actions';

export const DEMO_BPM = 110;
export const DEMO_BARS = 24;
export const DEMO_FIRST_DOWNBEAT = 0.55;
/** How far the demo recording is from A = 440 Hz. */
export const DEMO_TUNING_CENTS = 18;
const TAIL = 1.5;
const SR = ENGINE_SAMPLE_RATE;

/** One chord of the demo chart: where it starts in the bar (beats) and the chord. */
export interface DemoChord {
  beat: number;
  chord: ChordSymbol;
}

/**
 * The mockup's chart (web/maquette/app.js, `CHART`), sixteen bars; bars 17 to
 * 24 play the first eight again. The extensions are what the analysis
 * suggests; bar 12's D♭m6 is the chord it is unsure of.
 */
export const DEMO_CHART: DemoChord[][] = [
  [{ beat: 0, chord: chord(8, 'maj7') }], [{ beat: 0, chord: chord(5, 'min7') }], [{ beat: 0, chord: chord(10, 'min7') }], [{ beat: 0, chord: chord(3, '7') }],
  [{ beat: 0, chord: chord(0, 'min7') }], [{ beat: 0, chord: chord(5, '7') }], [{ beat: 0, chord: chord(10, 'min7') }], [{ beat: 0, chord: chord(3, '7', ['13']) }],
  [{ beat: 0, chord: chord(8, 'maj7') }], [{ beat: 0, chord: chord(8, '7') }], [{ beat: 0, chord: chord(1, 'maj7') }], [{ beat: 0, chord: chord(1, 'min6') }],
  [{ beat: 0, chord: chord(0, 'min7') }], [{ beat: 0, chord: chord(5, '7', ['b9']) }], [{ beat: 0, chord: chord(10, 'min7') }, { beat: 2, chord: chord(3, '7') }], [{ beat: 0, chord: chord(8, 'maj6') }],
];

export const demoChartBar = (bar: number): DemoChord[] => DEMO_CHART[bar % DEMO_CHART.length]!;

/** Tempo of each bar in the `variable` variant (the first four at 110, so the loop starts where it always did). */
const TEMPO_CURVE = [110, 110, 110, 110, 108, 109, 111, 112, 111, 110, 109, 110, 112, 113, 111, 108, 107, 109, 110, 111, 110, 109, 108, 110];

export type DemoTempo = 'variable' | 'fixed';

/** The grid of the demo: one beat of pick-up, then 24 bars and the tail. */
export function demoTempoMap(tempo: DemoTempo): TempoMap {
  if (tempo === 'fixed') {
    return constantTempoMap({ bpm: DEMO_BPM, firstDownbeat: DEMO_FIRST_DOWNBEAT, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
  }
  const times = [DEMO_FIRST_DOWNBEAT - 60 / DEMO_BPM];
  let t = DEMO_FIRST_DOWNBEAT;
  for (let bar = 0; bar < DEMO_BARS + 2; bar++) {
    const bpm = TEMPO_CURVE[Math.min(bar, TEMPO_CURVE.length - 1)]!;
    for (let b = 0; b < 4; b++) {
      times.push(t);
      t += 60 / bpm;
    }
  }
  return tempoMapFromBeats(times, 1, { numerator: 4, denominator: 4 }, 'analysis');
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69 + DEMO_TUNING_CENTS / 100) / 12);

/** Adds a decaying tone (fundamental plus two soft harmonics) at time `t`. */
function tone(out: Float32Array, t: number, midi: number, amp: number, decay: number, length: number, vibrato = 0, attack = 240): void {
  const start = Math.round(t * SR);
  const n = Math.min(out.length - start, Math.round(length * SR));
  const w = (2 * Math.PI * hz(midi)) / SR;
  for (let i = 0; i < n; i++) {
    const s = i / SR;
    const env = Math.min(1, i / attack) * Math.exp(-s * decay) * Math.min(1, (n - i) / 480);
    const ph = w * i + (vibrato ? vibrato * Math.sin(2 * Math.PI * 5.2 * s) * Math.min(1, s * 2) : 0);
    out[start + i]! += amp * env * (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph));
  }
}

/** Adds a burst of filtered noise (cymbal, brush, kick body when `low`). */
function hit(out: Float32Array, t: number, amp: number, decay: number, rand: () => number, low = false): void {
  const start = Math.round(t * SR);
  const n = Math.min(out.length - start, Math.round(0.6 * SR));
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const s = i / SR;
    const env = Math.exp(-s * decay);
    const noise = rand() * 2 - 1;
    lp += (noise - lp) * (low ? 0.02 : 0.6);
    const v = low ? Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-s * 30)) * s) * 0.9 + lp * 2 : noise - lp;
    out[start + i]! += amp * env * v;
  }
}

function buffer(seconds: number): Float32Array {
  return new Float32Array(Math.ceil(seconds * SR));
}

/** The chord sounding at beat `b` (0-based) of `bar`. */
function chordAt(bar: number, b: number): ChordSymbol {
  let c = demoChartBar(bar)[0]!.chord;
  for (const x of demoChartBar(bar)) if (x.beat <= b) c = x.chord;
  return c;
}

const tones = (c: ChordSymbol) => QUALITY_INTERVALS[c.quality];

export function demoProject(tempo: DemoTempo = 'variable'): NewProjectInput {
  const map = demoTempoMap(tempo);
  const duration = barStartTime(map, DEMO_BARS) + TAIL;
  const beat = 60 / DEMO_BPM;
  const at = (bar: number, b: number) => beatToTime(map, bar * 4 + b);
  const swing = (2 / 3) * beat; // the swung upbeat

  const drums = buffer(duration);
  const bass = buffer(duration);
  const piano = buffer(duration);
  const horns = buffer(duration);
  const rand = seeded(1959);

  for (let bar = 0; bar < DEMO_BARS; bar++) {
    const fill = bar % 8 === 7;

    // Drums: ride « ding, ding-da, ding, ding-da », feathered kick, hi-hat on 2 and 4.
    for (let b = 0; b < 4; b++) {
      hit(drums, at(bar, b), b % 2 ? 0.16 : 0.12, 9, rand);
      if (b % 2) hit(drums, at(bar, b) + swing, 0.08, 12, rand);
      hit(drums, at(bar, b), 0.12, 6, rand, true);
      if (b % 2) hit(drums, at(bar, b), 0.1, 40, rand);
    }
    if (fill) for (let k = 0; k < 6; k++) hit(drums, at(bar, 2) + (k * beat) / 3, 0.12 + k * 0.02, 22, rand);

    // Walking bass: the root when a chord starts, then chord tones, the last beat a half-step approach.
    const next = demoChartBar(bar + 1)[0]!.chord.root;
    for (let b = 0; b < 4; b++) {
      const c = chordAt(bar, b);
      const starts = demoChartBar(bar).some((x) => x.beat === b);
      const iv = tones(c);
      const m = b === 3 ? 36 + next + (rand() < 0.5 ? 1 : -1) : 36 + c.root + (starts ? 0 : iv[b % 2 ? 1 : 2]!);
      tone(bass, at(bar, b), m, 0.36, 3.2, beat * 0.95);
    }

    // Piano comping: on 1 and on the « and » of 2 (Charleston), rootless voicing; on 3 as well when the chord changes there.
    const hits = [0, 1 + swing / beat, ...demoChartBar(bar).filter((x) => x.beat > 0).map((x) => x.beat)];
    for (const h of hits) {
      const c = chordAt(bar, h);
      const iv = tones(c);
      for (const x of [iv[1]!, iv[3] ?? iv[2]! + 5, iv[2]! + 12, 14]) tone(piano, at(bar, h), 60 + ((c.root + x) % 12), 0.07, 2.4, beat * 1.4);
    }

    // Horns: two-bar phrases from bar 5 to bar 20, rests in between.
    if (bar >= 4 && bar < 20 && bar % 2 === 0) {
      const c = chordAt(bar, 0);
      const iv = tones(c);
      const notes = [iv[3] ?? iv[2]!, iv[2]!, iv[1]!, 9, iv[2]!];
      notes.forEach((x, k) => {
        const t = at(bar, k * 1.25);
        // Soft attack and a slow fade, each note a little different: swelling phrases, not blocks.
        const velocity = 0.7 + 0.5 * rand();
        tone(horns, t, 67 + ((c.root + x) % 12) - 12 * (x > 9 ? 1 : 0), 0.13 * velocity, 1.5 + rand(), beat * (k === notes.length - 1 ? 2.8 : 1.2), 0.012, Math.round(SR * 0.06));
      });
    }
  }

  const mono = (channel: Float32Array): DecodedAudio => ({ channels: [channel], sampleRate: SR });
  return {
    title: 'Blues du dimanche',
    source: { kind: 'demo' },
    tempoMap: map,
    loop: loopFromBars(map, 4, 7),
    tracks: [
      { role: 'batterie', audio: mono(drums), volume: 0.62 },
      { role: 'basse', audio: mono(bass), volume: 0.78 },
      { role: 'piano', audio: mono(piano), volume: 0.78 },
      { role: 'vents', audio: mono(horns), volume: 0.78 },
    ],
  };
}
