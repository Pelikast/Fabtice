// The session model (`export/session/`) as the writer's input (`types.ts`).
// Pure.
//
// Both count quarter notes from the first sample, so most of it goes across
// as it is: the tempo of every beat (the lead-in's first), the signatures, the
// markers of the MIDI file (same ASCII text: « Theme 1 - [A] Bbmaj7 »), the
// key changes, the tracks in « Samples/Imported/ ».
//
// One thing Live cannot write: a signature over 32 (Live offers 1, 2, 4, 8 and
// 16; Fabtice allows 32). Such a passage is written over 16, keeping every bar
// line at its time:
//   - n/32 with n even: (n/2)/16, the same length, nothing else changes;
//   - n/32 with n odd: n/16, twice as long in quarters, with the tempo doubled
//     there, so that every bar line and every beat stays at its time; when the
//     doubled tempo would pass 999, the nearest bar Live can play at that tempo,
//     k/16 with k = n/2 rounded down (the bar lines stay at their time, the
//     beats inside move a little: reported, and said in the read-me).
// Positions after such a passage move on Live's timeline (a bar of 3/32 takes
// 1.5 quarters as 3/16 instead of 0.75): every position is carried through
// `quartersMap`. The MIDI file keeps the original signatures.

import type { Meter } from '../../model/tempoMap';
import { sessionToMidi, MIDI_PPQ } from '../midi';
import type { Session } from '../session';
import { LIVE_TEMPO_MAX } from './tempo';
import type { AbletonSetInput, AbletonTarget, AbletonTrackInput, LocatorInput, MeterInput, TempoSegmentInput } from './types';

/** Where the audio files go in the folder, as Live puts imported files in a project. */
export const SAMPLES_FOLDER = 'Samples/Imported';

/** What was changed for Live, to be said (window and read-me). */
export type AbletonNote =
  /** n/32 written (n/2)/16: nothing moves. */
  | { kind: 'meter-32-even'; bar: number | null; from: Meter; to: Meter }
  /** n/32 written n/16 with the tempo doubled: nothing moves in time. */
  | { kind: 'meter-32-doubled'; bar: number | null; from: Meter; to: Meter }
  /** n/32 written k/16: the bar lines at their time, the beats inside approximate. */
  | { kind: 'meter-32-approx'; bar: number | null; from: Meter; to: Meter };

export interface AbletonFileFacts {
  fileSize?: number;
  crc?: number;
  absolutePath?: string;
  lastModified?: number;
}

export interface SessionToAbletonOptions {
  target?: AbletonTarget;
  /** What is known of each track's file, by track id (size, checksum, full path in the Mac app). */
  files?: Record<string, AbletonFileFacts>;
}

interface Span {
  /** Session quarters where it starts. */
  start: number;
  /** Live quarters where it starts. */
  liveStart: number;
  scale: number;
  meter: Meter;
  liveMeter: Meter;
  bar: number | null;
}

/** The signatures' passages, each with how it is written for Live. */
function spans(session: Session, notes: AbletonNote[]): Span[] {
  const out: Span[] = [];
  const meters = session.meters;
  for (let i = 0; i < meters.length; i++) {
    const m = meters[i]!;
    const end = i + 1 < meters.length ? meters[i + 1]!.quarters : Infinity;
    let scale = 1;
    let liveMeter: Meter = { ...m.meter };
    if (m.meter.denominator > 16) {
      const n = m.meter.numerator;
      if (m.meter.denominator !== 32) throw new RangeError(`signature ${n}/${m.meter.denominator}`);
      if (n % 2 === 0) {
        liveMeter = { numerator: n / 2, denominator: 16 };
        notes.push({ kind: 'meter-32-even', bar: m.bar, from: { ...m.meter }, to: liveMeter });
      } else {
        // The fastest tempo of the passage (the lead-in has its own, constant).
        let fastest = m.bar === null ? (session.leadIn?.quarterBpm ?? 0) : 0;
        for (const b of session.beats) if (b.quarters >= m.quarters - 1e-9 && b.quarters < end - 1e-9) fastest = Math.max(fastest, b.quarterBpm);
        if (fastest * 2 <= LIVE_TEMPO_MAX) {
          scale = 2;
          liveMeter = { numerator: n, denominator: 16 };
          notes.push({ kind: 'meter-32-doubled', bar: m.bar, from: { ...m.meter }, to: liveMeter });
        } else {
          const k = Math.max(1, Math.floor(n / 2));
          scale = (2 * k) / n;
          liveMeter = { numerator: k, denominator: 16 };
          notes.push({ kind: 'meter-32-approx', bar: m.bar, from: { ...m.meter }, to: liveMeter });
        }
      }
    }
    const prev = out[out.length - 1];
    const liveStart = prev ? prev.liveStart + (m.quarters - prev.start) * prev.scale : m.quarters;
    out.push({ start: m.quarters, liveStart, scale, meter: m.meter, liveMeter, bar: m.bar });
  }
  return out;
}

/** Session quarters → Live quarters (the identity unless a passage over 32 was rewritten). */
export function quartersMap(session: Session): (quarters: number) => number {
  const s = spans(session, []);
  return (q) => {
    let span = s[0];
    for (const x of s) if (x.start <= q + 1e-9) span = x;
    if (!span) return q;
    return span.liveStart + (q - span.start) * span.scale;
  };
}

export function sessionToAbleton(session: Session, options: SessionToAbletonOptions = {}): { input: AbletonSetInput; notes: AbletonNote[] } {
  const notes: AbletonNote[] = [];
  const passages = spans(session, notes);
  const spanAt = (q: number): Span => {
    let span = passages[0]!;
    for (const x of passages) if (x.start <= q + 1e-9) span = x;
    return span;
  };
  const map = (q: number) => {
    const span = spanAt(q);
    return span.liveStart + (q - span.start) * span.scale;
  };

  // The tempo: the lead-in's (constant), then the tempo of each beat, to the next one.
  const tempo: TempoSegmentInput[] = [];
  const push = (q: number, bpm: number) => {
    const last = tempo[tempo.length - 1];
    if (last && q <= last.quarters + 1e-9) {
      if (Math.abs(q - last.quarters) <= 1e-9) last.quarterBpm = bpm;
      return;
    }
    tempo.push({ quarters: tempo.length === 0 ? 0 : q, quarterBpm: bpm });
  };
  if (session.leadIn) push(0, session.leadIn.quarterBpm * spanAt(0).scale);
  for (const b of session.beats) push(map(b.quarters), b.quarterBpm * spanAt(b.quarters).scale);
  if (tempo.length === 0) push(0, session.startQuarterBpm);

  const meters: MeterInput[] = passages.map((p) => ({ quarters: map(p.start), numerator: p.liveMeter.numerator, denominator: p.liveMeter.denominator }));
  if (meters.length === 0) meters.push({ quarters: 0, numerator: 4, denominator: 4 });
  meters[0]!.quarters = 0;

  // The markers of the MIDI file (sections, parts, chords: the same text), and the keys.
  const midi = sessionToMidi(session, { chordTrack: false });
  const locators: LocatorInput[] = midi.markers.map((m) => ({ quarters: map(m.tick / MIDI_PPQ), name: m.text }));
  // The key of each passage, where the MIDI file has its key signature (the first one at 0).
  for (const k of session.keys) locators.push({ quarters: map(k.quarters), name: `Tonalité ${k.text}` });

  const tracks: AbletonTrackInput[] = session.tracks.map((tr) => {
    const facts = options.files?.[tr.id] ?? {};
    return { name: tr.name, file: `${SAMPLES_FOLDER}/${tr.fileStem}.wav`, frames: session.frames, ...facts };
  });

  return {
    input: { target: options.target ?? 'live11', title: session.title, sampleRate: session.sampleRate, tracks, tempo, meters, locators },
    notes,
  };
}
