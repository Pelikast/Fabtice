// `buildSession()`: the session model (`./types.ts`) from the app's state.
// Pure, tested in Node (`session.test.ts`).

import { resolveChords, sectionBar } from '../../chart/layout';
import { barBeatToBeat, barStartTime, barToBeat, beatToBar, beatToTime, bpmAt, meterAtBar, sameMeter, timeToBar, timeToBeat } from '../../grid/tempoMap';
import { approachTargets, chordParts, chordText, NO_CHORD_TEXT, transposeChord } from '../../harmony/chord';
import { keyLabel, keyTonicName, NEUTRAL_KEY, transposeKey } from '../../harmony/key';
import type { NoteName } from '../../harmony/pitch';
import { t } from '../../i18n';
import type { ChordQuality, ChordSymbol, Key } from '../../model/harmony';
import type { Meter, TempoMap } from '../../model/tempoMap';
import type { StructurePart } from '../../model/structure';
import { partName } from '../../model/structureLabels';
import { keyPassages } from '../../store/keySelectors';
import { structureInForce } from '../../store/structureSelectors';
import type { AppState } from '../../store/store';
import { safeFileName } from '../audio/plan';
import type {
  LeadIn,
  OutputSeconds,
  Session,
  SessionBar,
  SessionBeat,
  SessionChord,
  SessionKey,
  SessionMeter,
  SessionOptions,
  SessionPart,
  SessionSection,
  SessionTrack,
  SessionWarning,
} from './types';

/**
 * Tempos every target accepts, quarter notes per minute: Logic Pro takes 5 to
 * 990, Ableton Live 20 to 999 (see `export/midi/LOGIC.md`).
 */
export const DEFAULT_TEMPO_RANGE = { min: 20, max: 990 } as const;

/** A first bar line this close to 0 (output seconds) is at 0: no lead-in. */
export const START_SNAP: OutputSeconds = 0.0005;

/** The smallest note value a lead-in bar may count (a 32nd), as for the signatures of a piece. */
const SMALLEST_UNIT = 32;

/** Quarter notes in one bar of `m`. */
export const meterQuarters = (m: Meter): number => (m.numerator * 4) / m.denominator;

/** The session is asked for without a piece or without a track. */
export class SessionError extends Error {
  constructor(readonly code: 'nothing') {
    super(code);
    this.name = 'SessionError';
  }
}

// ---------------------------------------------------------------- texts

const ACC = { [-1]: 'b', 0: '', 1: '#' } as const;
const asciiNote = (n: NoteName): string => `${n.letter}${ACC[n.accidental]}`;

const ASCII_QUALITY: Record<ChordQuality, string> = {
  maj: '',
  min: 'm',
  aug: '+',
  dim: 'dim',
  sus2: 'sus2',
  sus4: 'sus4',
  '7': '7',
  maj7: 'maj7',
  min7: 'm7',
  minmaj7: 'm(maj7)',
  maj6: '6',
  min6: 'm6',
  dim7: 'dim7',
  hdim7: 'm7b5',
  '7sus4': '7sus4',
  aug7: '+7',
};

/**
 * A chord in plain ASCII, spelled in `key` (already transposed): « Bbmaj7 », « G7(b9,#11)/F », « N.C. ».
 * `next`: the chord it goes to, transposed like it (`harmony/chord.ts#approachTargets`): « Bb7 » before Am7.
 */
export function asciiChord(c: ChordSymbol | null, key: Key | null, next: ChordSymbol | null = null): string {
  if (c === null) return NO_CHORD_TEXT;
  const p = chordParts(c, { key: key ?? NEUTRAL_KEY, next });
  const ext = c.extensions.length ? `(${c.extensions.join(',')})` : '';
  return `${asciiNote(p.root)}${ASCII_QUALITY[c.quality]}${ext}${p.bass ? `/${asciiNote(p.bass)}` : ''}`;
}

/** A key in plain ASCII: « Bb », « F#m ». */
export function asciiKey(key: Key): string {
  return `${asciiNote(keyTonicName(key))}${key.mode === 'minor' ? 'm' : ''}`;
}

/** « Intro », « Thème 1 », « Solo (Guitare) », « Solo 2 (Vents) »: the one naming of the parts, shared with the structure column. */
export function partLabel(p: Pick<StructurePart, 'type' | 'number' | 'instrument'>): string {
  return partName(p, t);
}

/** « 01 Morceau », « 02 Voix »: numbered in order, safe, unique. */
export function trackFileStems(names: readonly string[]): string[] {
  const used = new Set<string>();
  const width = Math.max(2, String(names.length).length);
  return names.map((name, i) => {
    const n = String(i + 1).padStart(width, '0');
    let stem = safeFileName(`${n} ${name}`);
    for (let k = 2; used.has(stem.toLowerCase()); k++) stem = safeFileName(`${n} ${name} ${k}`);
    used.add(stem.toLowerCase());
    return stem;
  });
}

// ---------------------------------------------------------------- the lead-in

/**
 * The lead-in bars that last exactly `gap` seconds. Their unit is the beat of
 * the signature before the start (a pick-up's), or a half, a quarter… of it
 * down to a 32nd; their count is what the natural tempo gives. The longest
 * unit whose tempo is inside `range` and within a factor of two of the natural
 * one; failing that, the one closest to it inside `range`. Null when even one
 * 32nd would be too fast.
 */
export function leadInFor(gap: OutputSeconds, before: Meter, naturalQuarterBpm: number, range: { min: number; max: number }): LeadIn | null {
  if (!(gap > 0)) return null;
  let best: { lead: LeadIn; distance: number } | null = null;
  for (let unit = before.denominator; unit <= SMALLEST_UNIT; unit *= 2) {
    const unitQuarters = 4 / unit;
    const natural = (unitQuarters * 60) / naturalQuarterBpm;
    let count = Math.max(1, Math.round(gap / natural));
    const tempoOf = (n: number) => (n * unitQuarters * 60) / gap;
    while (tempoOf(count) < range.min) count++;
    // More than 64 units (a very slow tempo over a long gap): several equal bars.
    const bars = Math.ceil(count / 64);
    const perBar = Math.ceil(count / bars);
    const quarterBpm = tempoOf(perBar * bars);
    if (quarterBpm > range.max) continue;
    const distance = Math.abs(Math.log(quarterBpm / naturalQuarterBpm));
    if (distance <= Math.LN2 + 1e-9) return { duration: gap, meter: { numerator: perBar, denominator: unit }, bars, quarterBpm };
    if (!best || distance < best.distance - 1e-9) best = { lead: { duration: gap, meter: { numerator: perBar, denominator: unit }, bars, quarterBpm }, distance };
  }
  return best?.lead ?? null;
}

// ---------------------------------------------------------------- the session

/** The session of the open piece. Throws `SessionError('nothing')` without a piece or a track. */
export function buildSession(s: AppState, options: SessionOptions = {}): Session {
  const project = s.project;
  if (!project || s.tracks.length === 0) throw new SessionError('nothing');
  const range = options.tempoRange ?? DEFAULT_TEMPO_RANGE;
  const map: TempoMap = s.tempoMap;
  const { semitones, cents, tempoRatio: ratio } = s.playback;
  const sampleRate = s.tracks[0]!.audio.sampleRate || project.sampleRate;
  const sourceFrames = Math.max(...s.tracks.map((tr) => Math.round((tr.audio.frames * sampleRate) / (tr.audio.sampleRate || sampleRate))));
  const frames = Math.round(sourceFrames / ratio);
  const duration = frames / sampleRate;
  const d0 = map.meters[0]!.meter.denominator;
  const qPerBeat = 4 / d0;
  const out = (sourceTime: number): OutputSeconds => sourceTime / ratio;

  // The first bar line at (or within START_SNAP before) output time 0.
  let startBar = timeToBar(map, 0).bar;
  if (out(barStartTime(map, startBar)) < -START_SNAP) startBar++;
  while (out(barStartTime(map, startBar - 1)) >= -START_SNAP) startBar--;
  const startBeat = barToBeat(map, startBar);
  const gap = out(beatToTime(map, startBeat));
  // The tempo the grid has over the gap (its beats between 0 and the start bar line, per minute).
  const naturalQuarterBpm =
    gap > START_SNAP ? ((startBeat - timeToBeat(map, 0)) * qPerBeat * 60) / gap : bpmAt(map, 0) * qPerBeat * ratio;
  const warnings: SessionWarning[] = [];
  let leadIn: LeadIn | null = null;
  let startError = 0;
  if (Math.abs(gap) > START_SNAP) {
    leadIn = leadInFor(gap, meterAtBar(map, startBar - 1), naturalQuarterBpm, range);
    if (!leadIn) {
      startError = gap;
      warnings.push({ kind: 'start-snapped', error: gap });
    }
  } else {
    startError = gap;
  }
  const q0 = leadIn ? leadIn.bars * meterQuarters(leadIn.meter) : 0;
  const startTime = leadIn ? leadIn.duration : 0;

  /** Quarters of a map beat at or after the start bar line. */
  const quartersOfBeat = (beat: number) => q0 + (beat - startBeat) * qPerBeat;
  /** Quarters of any output time (linear in the lead-in). */
  const quartersAt = (time: OutputSeconds): number => {
    if (leadIn && time < startTime) return Math.max(0, (time / startTime) * q0);
    return Math.max(leadIn ? q0 : 0, quartersOfBeat(timeToBeat(map, time * ratio)));
  };
  const clampTime = (time: OutputSeconds) => Math.max(0, time);

  // Bars and beats, from the start bar line to the end of the audio.
  const bars: SessionBar[] = [];
  const beats: SessionBeat[] = [];
  const END_EPS = 1e-9;
  for (let bar = startBar; bars.length < 100_000; bar++) {
    const meter = meterAtBar(map, bar);
    const barTime = out(barStartTime(map, bar));
    if (barTime >= duration - END_EPS) break;
    bars.push({ bar, number: bar + 1, time: barTime, quarters: quartersOfBeat(barToBeat(map, bar)), meter: { ...meter } });
    for (let k = 0; k < meter.numerator; k++) {
      const beat = barBeatToBeat(map, bar, k);
      const time = out(beatToTime(map, beat));
      if (time >= duration - END_EPS) break;
      beats.push({ time, quarters: quartersOfBeat(beat), bar, beatInBar: k, quarterBpm: 0 });
    }
  }
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i]!;
    const next = beats[i + 1];
    b.quarterBpm = next ? ((next.quarters - b.quarters) * 60) / (next.time - b.time) : bpmAt(map, b.time * ratio) * qPerBeat * ratio;
    if (b.quarterBpm < range.min || b.quarterBpm > range.max) warnings.push({ kind: 'tempo-out-of-range', time: b.time, quarterBpm: b.quarterBpm });
  }

  // Signatures.
  const meters: SessionMeter[] = [];
  if (leadIn) meters.push({ bar: null, time: 0, quarters: 0, meter: { ...leadIn.meter } });
  const startMeter = meterAtBar(map, startBar);
  meters.push({ bar: startBar, time: startTime, quarters: q0, meter: { ...startMeter } });
  for (const m of map.meters) {
    if (m.bar <= startBar) continue;
    const time = out(beatToTime(map, m.beat));
    if (time >= duration) break;
    const prev = meters[meters.length - 1]!;
    if (sameMeter(prev.meter, m.meter)) continue;
    meters.push({ bar: m.bar, time, quarters: quartersOfBeat(m.beat), meter: { ...m.meter } });
  }

  // Keys, one per passage, transposed; a modulation at its nearest bar line.
  const keys: SessionKey[] = [];
  const passages = keyPassages(s);
  for (const p of passages) {
    if (!p.key) continue;
    const key = transposeKey(p.key, semitones);
    let entry: SessionKey;
    if (keys.length === 0) entry = { time: 0, quarters: 0, bar: null, key, text: asciiKey(key), name: keyLabel(key) };
    else {
      const bar = Math.max(startBar, sectionBar(map, p.time));
      const time = out(barStartTime(map, bar));
      if (time >= duration) continue;
      entry = { time, quarters: quartersOfBeat(barToBeat(map, bar)), bar, key, text: asciiKey(key), name: keyLabel(key) };
    }
    const last = keys[keys.length - 1];
    if (last && last.key.tonic === key.tonic && last.key.mode === key.mode) continue;
    if (last && Math.abs(last.quarters - entry.quarters) < 1e-9) keys[keys.length - 1] = entry;
    else keys.push(entry);
  }
  /** The transposed key in force at an output time (spells the chords). */
  const keyAtOutput = (time: OutputSeconds): Key | null => {
    let found: Key | null = null;
    for (const k of keys) {
      if (k.time <= time + 1e-9) found = k.key;
      else break;
    }
    return found;
  };

  // Chords, transposed, at the beat the chart writes them on.
  const chords: SessionChord[] = [];
  const resolved = resolveChords(map, s.analysis?.chords ?? null, s.corrections);
  const targets = approachTargets(resolved.map((c) => c.chord));
  for (const [i, c] of resolved.entries()) {
    const time = out(beatToTime(map, c.beat));
    if (time >= duration) continue;
    const pos = beatToBar(map, c.beat);
    const chord = c.chord ? transposeChord(c.chord, semitones) : null;
    const target = targets[i];
    const next = target ? transposeChord(target, semitones) : null;
    const key = keyAtOutput(time);
    chords.push({
      time: clampTime(time),
      quarters: time < startTime ? quartersAt(clampTime(time)) : quartersOfBeat(c.beat),
      bar: pos.bar,
      beatInBar: Math.round(pos.beatInBar * 2) / 2,
      chord,
      text: asciiChord(chord, key, next),
      display: chordText(chord, { key: key ?? NEUTRAL_KEY, next }),
      doubtful: c.doubtful,
    });
  }

  // Sections and parts of the structure, at their bar lines.
  const structure = structureInForce(s);
  const atBar = (bar: number) => {
    const b = Math.max(startBar, bar);
    return { bar: b, time: out(barStartTime(map, b)), quarters: quartersOfBeat(barToBeat(map, b)) };
  };
  const sections: SessionSection[] = structure.sections
    .map((m) => ({ ...atBar(sectionBar(map, m.time)), label: m.label }))
    .filter((m) => m.time < duration)
    .sort((a, b) => a.quarters - b.quarters);
  const parts: SessionPart[] = structure.parts
    .map((p) => {
      const from = atBar(sectionBar(map, p.start));
      const to = atBar(sectionBar(map, p.end));
      const end = Math.min(duration, to.time);
      return {
        ...from,
        end,
        endQuarters: end < to.time ? quartersAt(end) : to.quarters,
        type: p.type,
        number: p.number,
        instrument: p.instrument,
        label: partLabel(p),
        letters: [...p.letters],
      };
    })
    .filter((p) => p.time < duration && p.endQuarters > p.quarters);

  const tracks: SessionTrack[] = (() => {
    const stems = trackFileStems(s.tracks.map((tr) => tr.name));
    return s.tracks.map((tr, i) => ({ id: tr.id, name: tr.name, role: tr.role, stem: tr.stem ?? null, audioId: tr.audio.id, fileStem: stems[i]! }));
  })();

  return {
    title: project.title,
    semitones,
    cents,
    tempoRatio: ratio,
    sampleRate,
    frames,
    duration,
    endQuarters: quartersAt(duration),
    tracks,
    leadIn,
    start: { bar: startBar, time: gap, quarters: q0 },
    startError,
    startQuarterBpm: beats[0]?.quarterBpm ?? naturalQuarterBpm,
    bars,
    beats,
    meters,
    keys,
    chords,
    sections,
    parts,
    mode: structure.mode,
    form: structure.form,
    warnings,
  };
}
