// The MIDI file of a session (`export/session/`): what « Dossier pour Logic
// Pro… » writes, and the safe fallback of « Projet Ableton Live… ». Pure.
//
// Track 1, the tempo track (« conductor »):
//   - its name: the title;
//   - the signatures (the lead-in's first), at their bar lines;
//   - the key of each passage, transposed, minor mode kept;
//   - the tempo curve: one Set Tempo at each beat of the grid, so that every
//     beat falls at its time in the exported audio. Microseconds per quarter
//     are whole numbers: each value is chosen from the time the file has
//     REALLY reached at its tick (the earlier roundings included), so the
//     rounding never adds up (at most half a microsecond per quarter note,
//     whatever the length of the piece);
//   - the markers, one where a chord changes or a part or section starts:
//     « Theme 1 - [A] Bbmaj7 », « [B] Cm7 », « F7 » (see `markerText`).
// Track 2, « Accords »: the chords as block chords (a bass note and a close
//   voicing around middle C), from one chord to the next. Hearing them with
//   the audio checks the alignment by ear, and the region gives the project a
//   musical tempo reference (Logic's Smart Tempo then keeps the tempo of the
//   project when audio is added: `LOGIC.md`). `chordTrack: false` leaves it out.

import { QUALITY_INTERVALS } from '../../harmony/chord';
import { isCompound } from '../../grid/tempoMap';
import type { ChordSymbol, Key } from '../../model/harmony';
import type { Meter } from '../../model/tempoMap';
import type { Session, SessionChord } from '../session/types';
import { asciiText, MAX_MICROS_PER_QUARTER, writeSmf, type MidiEvent } from './smf';

/** Ticks per quarter note: 960 divides Logic's own 3840 and gives whole ticks down to the 32nd. */
export const MIDI_PPQ = 960;

export interface MidiOptions {
  /** Write the « Accords » track (default true). */
  chordTrack?: boolean;
  /** Its name (default « Accords »). */
  chordTrackName?: string;
}

export interface MidiFile {
  bytes: Uint8Array;
  ticksPerQuarter: number;
  /** Where the file's tempo curve REALLY puts each beat of the session, seconds (for checks and reports). */
  beatTimes: number[];
  /** Largest gap between a beat of the session and where the file puts it, seconds. */
  maxBeatError: number;
  markers: { tick: number; text: string }[];
}

/** Sharps (> 0) or flats (< 0) of a key signature, as players write it (`harmony/key.ts`). */
export function keySignatureSharps(key: Key): number {
  // The relative major of a minor key has the same signature.
  const major = key.mode === 'minor' ? (key.tonic + 3) % 12 : key.tonic % 12;
  // C, D♭, D, E♭, E, F, G♭, G, A♭, A, B♭, B
  return [0, -5, 2, -3, 4, -1, -6, 1, -4, 3, -2, 5][major]!;
}

/** MIDI clocks per metronome click: the dotted quarter in 6/8, 9/8, 12/8; else the beat of the signature. */
export function clocksPerClick(m: Meter): number {
  const beat = (24 * 4) / m.denominator;
  return Math.round(isCompound(m) ? beat * 3 : beat);
}

const tickOf = (quarters: number): number => {
  const t = quarters * MIDI_PPQ;
  const r = Math.round(t);
  if (Math.abs(t - r) > 1e-6) throw new RangeError(`not on a tick: ${quarters} quarters`);
  return r;
};
const nearTick = (quarters: number): number => Math.max(0, Math.round(quarters * MIDI_PPQ));

/** One marker: « Theme 1 - [A] Bbmaj7 »; parts of them can be missing. ASCII. */
export function markerText(parts: { part?: string | null; section?: string | null; chord?: string | null }): string {
  const head = [parts.part ? asciiText(parts.part) : null, parts.section ? `[${asciiText(parts.section)}]` : null].filter(Boolean).join(' - ');
  const chord = parts.chord ? asciiText(parts.chord) : '';
  return [head, chord].filter(Boolean).join(' ').trim();
}

function markers(session: Session): { tick: number; text: string }[] {
  type Slot = { part?: string; section?: string; chord?: SessionChord };
  const slots = new Map<number, Slot>();
  const slot = (tick: number) => {
    let s = slots.get(tick);
    if (!s) slots.set(tick, (s = {}));
    return s;
  };
  for (const p of session.parts) slot(nearTick(p.quarters)).part = p.label;
  for (const s of session.sections) slot(nearTick(s.quarters)).section = s.label;
  for (const c of session.chords) slot(nearTick(c.quarters)).chord = c;
  const out: { tick: number; text: string }[] = [];
  let going: string | null = null;
  for (const tick of [...slots.keys()].sort((a, b) => a - b)) {
    const s = slots.get(tick)!;
    const chordText = s.chord ? s.chord.text : null;
    const changed = chordText !== null && chordText !== going;
    if (!changed && !s.part && !s.section) continue;
    if (chordText !== null) going = chordText;
    out.push({ tick, text: markerText({ part: s.part, section: s.section, chord: going }) });
  }
  return out;
}

/** The MIDI notes of a chord: its bass (or root) around C3, its tones close above middle C. */
export function chordNotes(c: ChordSymbol): number[] {
  const bass = 48 + ((c.bass ?? c.root) % 12);
  const tones = QUALITY_INTERVALS[c.quality].map((i) => 60 + ((c.root + i) % 12));
  return [bass, ...[...new Set(tones)].sort((a, b) => a - b)];
}

/** The tempo track's events: signatures, keys, tempo curve, markers. */
function conductor(session: Session): { events: MidiEvent[]; beatTimes: number[]; maxBeatError: number; markers: { tick: number; text: string }[] } {
  const events: MidiEvent[] = [{ tick: 0, kind: 'trackName', text: session.title }];
  for (const m of session.meters) {
    events.push({ tick: tickOf(m.quarters), kind: 'timeSignature', numerator: m.meter.numerator, denominator: m.meter.denominator, clocksPerClick: clocksPerClick(m.meter) });
  }
  for (const k of session.keys) events.push({ tick: nearTick(k.quarters), kind: 'keySignature', sharps: keySignatureSharps(k.key), minor: k.key.mode === 'minor' });

  // The points the curve must reach: the start of the file, then every beat.
  const points: { tick: number; time: number; bpm: number }[] = [];
  if (session.leadIn) points.push({ tick: 0, time: 0, bpm: session.leadIn.quarterBpm });
  for (const b of session.beats) points.push({ tick: tickOf(b.quarters), time: b.time, bpm: b.quarterBpm });
  if (points.length === 0 || points[0]!.tick !== 0) points.unshift({ tick: 0, time: 0, bpm: points[0]?.bpm ?? session.startQuarterBpm });
  const beatTimes: number[] = [];
  let reached = 0; // seconds the file has really reached at points[i].tick
  let maxBeatError = 0;
  let last = -1;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const next = points[i + 1];
    let micros: number;
    if (next && next.tick > p.tick) {
      micros = Math.round(((next.time - reached) * 1e6 * MIDI_PPQ) / (next.tick - p.tick));
    } else {
      micros = Math.round(60e6 / p.bpm);
    }
    micros = Math.min(MAX_MICROS_PER_QUARTER, Math.max(1, micros));
    if (micros !== last) events.push({ tick: p.tick, kind: 'tempo', microsPerQuarter: micros });
    last = micros;
    if (next) {
      reached += ((next.tick - p.tick) * micros) / (MIDI_PPQ * 1e6);
    }
  }
  // Where each session beat really is, read back from the curve just written.
  {
    const tempos = events.filter((e): e is Extract<MidiEvent, { kind: 'tempo' }> => e.kind === 'tempo');
    let k = 0;
    let at = 0;
    let atTick = 0;
    for (const b of session.beats) {
      const tick = tickOf(b.quarters);
      while (k + 1 < tempos.length && tempos[k + 1]!.tick <= tick) {
        at += ((tempos[k + 1]!.tick - atTick) * tempos[k]!.microsPerQuarter) / (MIDI_PPQ * 1e6);
        atTick = tempos[k + 1]!.tick;
        k++;
      }
      const time = at + ((tick - atTick) * tempos[k]!.microsPerQuarter) / (MIDI_PPQ * 1e6);
      beatTimes.push(time);
      maxBeatError = Math.max(maxBeatError, Math.abs(time - b.time));
    }
  }
  const marks = markers(session);
  for (const m of marks) events.push({ tick: m.tick, kind: 'marker', text: m.text });
  return { events, beatTimes, maxBeatError, markers: marks };
}

function chordTrackEvents(session: Session, name: string): MidiEvent[] {
  const events: MidiEvent[] = [{ tick: 0, kind: 'trackName', text: name }];
  const endTick = nearTick(session.endQuarters);
  const chords = session.chords;
  for (let i = 0; i < chords.length; i++) {
    const c = chords[i]!;
    if (!c.chord) continue;
    const from = nearTick(c.quarters);
    const to = Math.min(endTick, nearTick(chords[i + 1]?.quarters ?? session.endQuarters));
    if (to - from < 2) continue;
    for (const note of chordNotes(c.chord)) {
      events.push({ tick: from, kind: 'noteOn', channel: 0, note, velocity: note < 60 ? 72 : 60 });
      events.push({ tick: to - 1, kind: 'noteOff', channel: 0, note });
    }
  }
  return events;
}

/** The file of a session. */
export function sessionToMidi(session: Session, options: MidiOptions = {}): MidiFile {
  const tempo = conductor(session);
  const endTick = Math.max(nearTick(session.endQuarters), ...tempo.events.map((e) => e.tick));
  const tracks = [{ events: tempo.events, endTick }];
  if (options.chordTrack !== false) tracks.push({ events: chordTrackEvents(session, options.chordTrackName ?? 'Accords'), endTick });
  return {
    bytes: writeSmf(tracks, MIDI_PPQ),
    ticksPerQuarter: MIDI_PPQ,
    beatTimes: tempo.beatTimes,
    maxBeatError: tempo.maxBeatError,
    markers: tempo.markers,
  };
}
