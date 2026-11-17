// The MIDI file read back by an independent reader (the `midi-file` package,
// not our writer): every beat of the grid within a millisecond of its time in
// the exported audio, the signatures, the keys, the markers.

import { parseMidi, type MidiData } from 'midi-file';
import { describe, expect, it } from 'vitest';
import { demoAnalysis, demoCorrections } from '../../demo/demoAnalysis';
import { demoTempoMap } from '../../demo/demoProject';
import { tempoMapFromBeats } from '../../grid/beats';
import { withMeterForBar, withMeterFrom } from '../../grid/meters';
import { constantTempoMap } from '../../grid/tempoMap';
import { chord } from '../../harmony/chord';
import { emptyCorrections } from '../../model/corrections';
import type { Track } from '../../model/project';
import type { TempoMap } from '../../model/tempoMap';
import { initialState, type AppState } from '../../store/store';
import { buildSession, type Session } from '../session';
import { asciiText, chordNotes, clocksPerClick, keySignatureSharps, markerText, sessionToMidi } from './index';

const SR = 48000;

function state(map: TempoMap, patch: Partial<AppState> = {}, duration = 60): AppState {
  const s = initialState();
  const track = (id: string, name: string): Track => ({
    id,
    name,
    role: 'morceau',
    mute: false,
    solo: false,
    volume: 1,
    audio: { id: `a-${id}`, origin: 'original', sampleRate: SR, channels: 2, frames: Math.round(duration * SR) },
  });
  return {
    ...s,
    project: { id: 'p', title: 'Blues du dimanche', source: { kind: 'file', fileName: 'x.wav' }, duration, sampleRate: SR, createdAt: '' },
    tracks: [track('t1', 'Morceau')],
    tempoMap: map,
    ...patch,
  };
}

/** An independent reading: absolute ticks and seconds of every event, from the file's own tempo events. */
function read(bytes: Uint8Array) {
  const midi: MidiData = parseMidi(bytes);
  const ppq = midi.header.ticksPerBeat!;
  const tracks = midi.tracks.map((events) => {
    let tick = 0;
    return events.map((e) => ({ ...e, tick: (tick += e.deltaTime) }));
  });
  const tempos = tracks[0]!.filter((e) => e.type === 'setTempo') as unknown as { tick: number; microsecondsPerBeat: number }[];
  const seconds = (tick: number): number => {
    let t = 0;
    let at = 0;
    let us = 500000;
    for (const e of tempos) {
      if (e.tick > tick) break;
      t += ((e.tick - at) / ppq) * us * 1e-6;
      at = e.tick;
      us = e.microsecondsPerBeat;
    }
    return t + ((tick - at) / ppq) * us * 1e-6;
  };
  return { midi, ppq, tracks, tempos, seconds };
}

function expectBeatsWithinOneMs(session: Session, bytes: Uint8Array) {
  const r = read(bytes);
  let worst = 0;
  for (const b of session.beats) {
    const tick = b.quarters * r.ppq;
    expect(Number.isInteger(tick)).toBe(true);
    // The first bar line of a snapped start is early by `startError`, said in the session; every other beat is exact.
    if (b === session.beats[0] && session.startError !== 0) continue;
    worst = Math.max(worst, Math.abs(r.seconds(tick) - b.time));
  }
  expect(worst).toBeLessThan(0.001);
  return { worst, r };
}

describe('the MIDI file of a session, read back by an independent reader', () => {
  it('format 1, 960 ticks per quarter, a tempo track then the chords', () => {
    const map = demoTempoMap('variable');
    const s = state(map, { analysis: demoAnalysis(map, 54), corrections: demoCorrections(map) }, 54);
    const file = sessionToMidi(buildSession(s));
    const r = read(file.bytes);
    expect(r.midi.header).toMatchObject({ format: 1, numTracks: 2, ticksPerBeat: 960 });
    expect(r.tracks[0]!.find((e) => e.type === 'trackName')).toMatchObject({ text: 'Blues du dimanche' });
    expect(r.tracks[1]!.find((e) => e.type === 'trackName')).toMatchObject({ text: 'Accords' });
    expect(r.tracks.every((t) => t.at(-1)!.type === 'endOfTrack')).toBe(true);
    expect(sessionToMidi(buildSession(s), { chordTrack: false }).bytes.length).toBeLessThan(file.bytes.length);
  });

  it('variable tempo, tempo changed in the transport, first downbeat after 0: every beat within a millisecond', () => {
    const map = demoTempoMap('variable');
    const base = state(map, {}, 54);
    for (const tempoRatio of [1, 0.73, 1.37]) {
      const session = buildSession({ ...base, playback: { ...base.playback, tempoRatio } });
      expect(session.leadIn).not.toBeNull();
      const file = sessionToMidi(session);
      const { worst } = expectBeatsWithinOneMs(session, file.bytes);
      expect(worst).toBeLessThan(1e-5);
      expect(file.maxBeatError).toBeLessThan(1e-5);
      // The lead-in lasts exactly the silence before the first bar line.
      const r = read(file.bytes);
      expect(r.seconds(session.start.quarters * 960)).toBeCloseTo(session.start.time, 5);
    }
  });

  it('no drift over a long piece with a tempo that changes at every beat', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const times: number[] = [];
    let t = 0.417;
    while (t < 1250) {
      times.push(t);
      t += 60 / (60 + 140 * rnd());
    }
    const map = tempoMapFromBeats(times, 0, { numerator: 4, denominator: 4 }, 'analysis');
    const session = buildSession(state(map, {}, 1250));
    expect(session.beats.length).toBeGreaterThan(2000);
    const { worst } = expectBeatsWithinOneMs(session, sessionToMidi(session).bytes);
    // Half a microsecond per quarter at most, never added up.
    expect(worst).toBeLessThan(2e-6);
  });

  it('signatures: the lead-in, a 6/8 bar in 4/4 (six eighths of three quarters), a 7/8 from bar 6', () => {
    let map = constantTempoMap({ bpm: 96, firstDownbeat: 0.9, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    map = withMeterForBar(map, 2, { numerator: 6, denominator: 8 });
    map = withMeterFrom(map, 5, { numerator: 7, denominator: 8 });
    const session = buildSession(state(map, {}, 30));
    const file = sessionToMidi(session);
    const { r } = expectBeatsWithinOneMs(session, file.bytes);
    const sigs = r.tracks[0]!.filter((e) => e.type === 'timeSignature') as unknown as { tick: number; numerator: number; denominator: number; metronome: number }[];
    const lead = session.leadIn!;
    const q0 = session.start.quarters;
    expect(sigs.map((x) => [x.tick / 960, `${x.numerator}/${x.denominator}`, x.metronome])).toEqual([
      [0, `${lead.meter.numerator}/${lead.meter.denominator}`, clocksPerClick(lead.meter)],
      [q0, '4/4', 24],
      [q0 + 8, '6/8', 36],
      [q0 + 11, '4/4', 24],
      [q0 + 19, '7/8', 12],
    ]);
    // Each bar line of the grid falls on a bar line of the file's signatures.
    const barTicks = new Set<number>();
    let tick = 0;
    for (let i = 0; i < sigs.length; i++) {
      const s = sigs[i]!;
      const end = sigs[i + 1]?.tick ?? 30 * 960 * 4;
      for (tick = s.tick; tick < end; tick += (s.numerator * 4 * 960) / s.denominator) barTicks.add(tick);
    }
    for (const b of session.bars) expect(barTicks.has(b.quarters * 960)).toBe(true);
  });

  it('keys: one per passage, transposed, minor kept', () => {
    const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    const corrections = { ...emptyCorrections(), key: { tonic: 3, mode: 'major' as const }, keyChanges: [{ time: 16, key: { tonic: 0, mode: 'minor' as const } }] };
    const base = state(map, { corrections });
    const session = buildSession({ ...base, playback: { ...base.playback, semitones: 2 } });
    const r = read(sessionToMidi(session).bytes);
    const keys = r.tracks[0]!.filter((e) => e.type === 'keySignature') as unknown as { tick: number; key: number; scale: number }[];
    // E♭ + 2 = F major (one flat); C minor + 2 = D minor (one flat).
    expect(keys.map((k) => [k.tick / 960, k.key, k.scale])).toEqual([
      [0, -1, 0],
      [32, -1, 1],
    ]);
  });

  it('markers: a part, a section and the chord at their places, a chord written again only when it changes', () => {
    const map = demoTempoMap('fixed');
    const base = state(map, { analysis: demoAnalysis(map, 54), corrections: demoCorrections(map) }, 54);
    const session = buildSession(base);
    const file = sessionToMidi(session);
    const r = read(file.bytes);
    const marks = r.tracks[0]!.filter((e) => e.type === 'marker') as unknown as { tick: number; text: string }[];
    expect(marks.length).toBeGreaterThan(5);
    expect(marks.map((m) => ({ tick: m.tick, text: m.text }))).toEqual(file.markers);
    expect(marks[0]!.text).toMatch(/^\[A\] /);
    for (const m of marks) expect(m.text).toMatch(/^[\x20-\x7e]+$/);
    for (let i = 1; i < marks.length; i++) {
      const prev = marks[i - 1]!.text.replace(/^.*\] /, '');
      if (!marks[i]!.text.includes('[')) expect(marks[i]!.text).not.toBe(prev);
    }
    // Each chord marker sits on the beat of its chord.
    for (const c of session.chords) expect(marks.some((m) => m.tick === c.quarters * 960) || session.chords.some((d) => d !== c && d.text === c.text)).toBe(true);
    // The chord track plays each chord until the next one.
    const ons = r.tracks[1]!.filter((e) => e.type === 'noteOn');
    expect(ons.length).toBeGreaterThan(session.chords.length * 3);
  });

  it('texts and numbers', () => {
    expect(asciiText('Thème 1 – Solo (Flûte) B♭△ « x »')).toBe('Theme 1 - Solo (Flute) Bbmaj7 " x "');
    expect(markerText({ part: 'Spécial', section: 'C', chord: 'F#m7b5' })).toBe('Special - [C] F#m7b5');
    expect(markerText({ section: 'B', chord: null })).toBe('[B]');
    expect(keySignatureSharps({ tonic: 6, mode: 'major' })).toBe(-6);
    expect(keySignatureSharps({ tonic: 1, mode: 'minor' })).toBe(4);
    expect(keySignatureSharps({ tonic: 10, mode: 'minor' })).toBe(-5);
    expect(clocksPerClick({ numerator: 6, denominator: 8 })).toBe(36);
    expect(clocksPerClick({ numerator: 3, denominator: 4 })).toBe(24);
    expect(clocksPerClick({ numerator: 5, denominator: 16 })).toBe(6);
    expect(chordNotes(chord(7, '7', [], 11))).toEqual([59, 62, 65, 67, 71]);
  });
});
