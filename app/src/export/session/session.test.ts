import { describe, expect, it } from 'vitest';
import { demoAnalysis, demoCorrections } from '../../demo/demoAnalysis';
import { demoTempoMap } from '../../demo/demoProject';
import { withMeterForBar, withMeterFrom } from '../../grid/meters';
import { barToBeat as barBeat, beatToTime, constantTempoMap, variableTempoMap } from '../../grid/tempoMap';
import { chord } from '../../harmony/chord';
import { emptyCorrections } from '../../model/corrections';
import type { Track } from '../../model/project';
import type { TempoMap } from '../../model/tempoMap';
import { initialState, type AppState } from '../../store/store';
import { asciiChord, buildSession, leadInFor, meterQuarters, partLabel, trackFileStems, type Session } from './index';

const SR = 48000;

function track(id: string, name: string, seconds: number, role: Track['role'] = 'morceau'): Track {
  return { id, name, role, mute: false, solo: false, volume: 1, audio: { id: `a-${id}`, origin: 'original', sampleRate: SR, channels: 2, frames: Math.round(seconds * SR) } };
}

function state(map: TempoMap, patch: Partial<AppState> = {}, duration = 60): AppState {
  const s = initialState();
  return {
    ...s,
    project: { id: 'p', title: 'Essai', source: { kind: 'file', fileName: 'essai.wav' }, duration, sampleRate: SR, createdAt: '' },
    tracks: [track('t1', 'Morceau', duration), track('t2', 'Voix', duration - 1, 'voix')],
    tempoMap: map,
    ...patch,
  };
}

const playback = (s: AppState, p: Partial<AppState['playback']>): Partial<AppState> => ({ playback: { ...s.playback, ...p } });

/** Every beat is where the map puts it, in output time; quarters go up by the bar's own beat. */
function expectBeatsOnMap(session: Session, map: TempoMap, ratio: number) {
  for (const b of session.beats) {
    const bar = session.bars.find((x) => x.bar === b.bar)!;
    const unit = 4 / bar.meter.denominator;
    expect(b.quarters).toBeCloseTo(bar.quarters + b.beatInBar * unit, 9);
  }
  for (let i = 0; i + 1 < session.beats.length; i++) {
    const a = session.beats[i]!;
    const c = session.beats[i + 1]!;
    // The tempo takes each beat exactly to the next.
    expect(a.time + ((c.quarters - a.quarters) * 60) / a.quarterBpm).toBeCloseTo(c.time, 9);
  }
  const first = session.beats[0]!;
  expect(first.time * ratio).toBeCloseTo(beatToTime(map, session.bars[0]!.quarters === first.quarters ? barBeat(map, first.bar) : 0), 9);
}

describe('the session model of the sequencer exports', () => {
  it('fixed tempo, first downbeat at 0: no lead-in, one beat every half second', () => {
    const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    const s = buildSession(state(map));
    expect(s.leadIn).toBeNull();
    expect(s.startError).toBe(0);
    expect(s.start).toEqual({ bar: 0, time: 0, quarters: 0 });
    expect(s.frames).toBe(60 * SR);
    expect(s.duration).toBe(60);
    expect(s.beats).toHaveLength(120);
    s.beats.forEach((b, i) => {
      expect(b.time).toBeCloseTo(i * 0.5, 12);
      expect(b.quarters).toBe(i);
      expect(b.quarterBpm).toBeCloseTo(120, 9);
    });
    expect(s.bars).toHaveLength(30);
    expect(s.meters).toEqual([{ bar: 0, time: 0, quarters: 0, meter: { numerator: 4, denominator: 4 } }]);
    expect(s.endQuarters).toBeCloseTo(120, 9);
    expect(s.tracks.map((t) => t.fileStem)).toEqual(['01 Morceau', '02 Voix']);
    expect(s.warnings).toEqual([]);
  });

  it('first downbeat later than 0: a lead-in that lasts exactly the gap, at a tempo close to the piece', () => {
    const map = constantTempoMap({ bpm: 120, firstDownbeat: 1.3, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    const s = buildSession(state(map));
    // Bar −1 (the pick-up bar « 0 ») would start at −0.7: the first bar line at or after 0 is « mesure 1 ».
    expect(s.start.bar).toBe(0);
    expect(s.leadIn).toMatchObject({ meter: { numerator: 3, denominator: 4 }, bars: 1 });
    expect(s.leadIn!.duration).toBeCloseTo(1.3, 12);
    expect(s.leadIn!.quarterBpm).toBeCloseTo((3 * 60) / 1.3, 9);
    expect(s.start.quarters).toBe(3);
    expect(s.beats[0]).toMatchObject({ bar: 0, beatInBar: 0, quarters: 3 });
    expect(s.beats[0]!.time).toBeCloseTo(1.3, 12);
    expect(s.meters[0]).toEqual({ bar: null, time: 0, quarters: 0, meter: { numerator: 3, denominator: 4 } });
    expect(s.meters[1]).toMatchObject({ bar: 0, quarters: 3, meter: { numerator: 4, denominator: 4 } });
  });

  it('a pick-up bar that starts after 0 is the first bar represented', () => {
    // Downbeat at 2.2 s, 120 BPM: bar −1 (« 0 ») starts at 0.2 s.
    const map = constantTempoMap({ bpm: 120, firstDownbeat: 2.2, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    const s = buildSession(state(map));
    expect(s.start.bar).toBe(-1);
    expect(s.bars[0]).toMatchObject({ bar: -1, number: 0 });
    // 0.2 s at 120 BPM is less than half a quarter: one eighth at 150 BPM.
    expect(s.leadIn).toMatchObject({ meter: { numerator: 1, denominator: 8 }, bars: 1 });
    expect(s.leadIn!.quarterBpm).toBeCloseTo((0.5 * 60) / 0.2, 9);
  });

  it('a first bar line a few milliseconds after 0: no lead-in bar can be that short, it is put at 0 and said', () => {
    const map = constantTempoMap({ bpm: 120, firstDownbeat: 0.003, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    const s = buildSession(state(map));
    expect(s.leadIn).toBeNull();
    expect(s.startError).toBeCloseTo(0.003, 12);
    expect(s.warnings).toEqual([{ kind: 'start-snapped', error: s.startError }]);
    expect(s.beats[1]!.time).toBeCloseTo(0.503, 12);
    expect(s.beats[1]!.quarters).toBe(1);
    // Within START_SNAP: nothing to say.
    const close = buildSession(state(constantTempoMap({ bpm: 120, firstDownbeat: 0.0002, meter: { numerator: 4, denominator: 4 }, origin: 'manual' })));
    expect(close.leadIn).toBeNull();
    expect(close.warnings).toEqual([]);
  });

  it('lead-in bars: within the tempo range, shorter units for short gaps, none below a 32nd at the fastest tempo', () => {
    const range = { min: 20, max: 990 };
    const q = { numerator: 4, denominator: 4 };
    expect(leadInFor(2, q, 120, range)).toMatchObject({ meter: { numerator: 4, denominator: 4 }, bars: 1, quarterBpm: 120 });
    expect(leadInFor(0.05, q, 120, range)).toMatchObject({ meter: { numerator: 1, denominator: 32 }, quarterBpm: 150 });
    expect(leadInFor(0.3, q, 120, range)).toMatchObject({ meter: { numerator: 1, denominator: 4 }, quarterBpm: 200 });
    expect(leadInFor(0.2, q, 120, range)).toMatchObject({ meter: { numerator: 1, denominator: 8 }, quarterBpm: 150 });
    expect(leadInFor(0.01, q, 120, range)).toMatchObject({ meter: { numerator: 1, denominator: 32 } });
    expect(leadInFor(0.005, q, 120, range)).toBeNull();
    // A very slow tempo over a long gap: enough units to stay above the minimum, in equal bars of 64 at most.
    const slow = leadInFor(30, q, 10, range)!;
    expect(slow.quarterBpm).toBeGreaterThanOrEqual(20);
    expect(slow.meter.numerator).toBeLessThanOrEqual(64);
    expect((slow.bars * meterQuarters(slow.meter) * 60) / slow.quarterBpm).toBeCloseTo(30, 9);
    for (const gap of [0.008, 0.03, 0.2, 0.7, 1.3, 1.99, 3.9]) {
      const l = leadInFor(gap, q, 120, range)!;
      expect(l.quarterBpm).toBeGreaterThanOrEqual(range.min);
      expect(l.quarterBpm).toBeLessThanOrEqual(range.max);
      expect((l.bars * meterQuarters(l.meter) * 60) / l.quarterBpm).toBeCloseTo(gap, 12);
    }
  });

  it('the tempo chosen in the transport: output time is source time over the ratio, tempos times the ratio', () => {
    const map = constantTempoMap({ bpm: 100, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    const base = state(map);
    const s = buildSession({ ...base, ...playback(base, { tempoRatio: 0.8 }) });
    expect(s.frames).toBe(Math.round((60 * SR) / 0.8));
    expect(s.duration).toBeCloseTo(75, 9);
    expect(s.beats[1]!.time).toBeCloseTo(0.6 / 0.8, 12);
    expect(s.beats[0]!.quarterBpm).toBeCloseTo(80, 9);
    expect(s.tempoRatio).toBe(0.8);
  });

  it('variable tempo (the analysed demo map): every beat at its time in the output, the tempo reaching it exactly', () => {
    const map = demoTempoMap('variable');
    const base = state(map, {}, 54);
    const s = buildSession({ ...base, ...playback(base, { tempoRatio: 1.25 }) });
    expectBeatsOnMap(s, map, 1.25);
    for (const b of s.beats) {
      const mapBeat = b.bar * 4 + b.beatInBar;
      expect(b.time).toBeCloseTo(beatToTime(map, mapBeat) / 1.25, 12);
    }
    expect(new Set(s.beats.map((b) => Math.round(b.quarterBpm))).size).toBeGreaterThan(3);
  });

  it('a 6/8 bar in a 4/4 piece: six eighths that last three quarters, and the signatures where they change', () => {
    let map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    map = withMeterForBar(map, 2, { numerator: 6, denominator: 8 });
    map = withMeterFrom(map, 5, { numerator: 7, denominator: 8 });
    const s = buildSession(state(map, {}, 20));
    const bar2 = s.beats.filter((b) => b.bar === 2);
    expect(bar2.map((b) => b.quarters)).toEqual([8, 8.5, 9, 9.5, 10, 10.5]);
    expect(bar2[1]!.time - bar2[0]!.time).toBeCloseTo(0.25, 12);
    expect(s.bars.find((b) => b.bar === 3)!.quarters).toBe(11);
    expect(s.bars.find((b) => b.bar === 6)!.quarters).toBe(11 + 4 + 4 + 3.5);
    expect(s.meters.map((m) => [m.bar, m.quarters, `${m.meter.numerator}/${m.meter.denominator}`])).toEqual([
      [0, 0, '4/4'],
      [2, 8, '6/8'],
      [3, 11, '4/4'],
      [5, 19, '7/8'],
    ]);
    expectBeatsOnMap(s, map, 1);
  });

  it('a piece that starts in 6/8: the beats of the map are eighths, quarters stay quarters', () => {
    const map = constantTempoMap({ bpm: 180, firstDownbeat: 0, meter: { numerator: 6, denominator: 8 }, origin: 'manual' });
    const s = buildSession(state(map, {}, 10));
    expect(s.beats[1]!.quarters).toBe(0.5);
    expect(s.beats[0]!.quarterBpm).toBeCloseTo(90, 9);
    expect(s.bars[1]!.quarters).toBe(3);
  });

  it('chords and keys transposed by the semitones, in ASCII spelled in the key of their passage', () => {
    const map = demoTempoMap('fixed');
    const base = state(map, { analysis: demoAnalysis(map, 54), corrections: demoCorrections(map) }, 54);
    const plain = buildSession(base);
    const up = buildSession({ ...base, ...playback(base, { semitones: 2, cents: 30 }) });
    expect(plain.keys[0]).toMatchObject({ time: 0, quarters: 0, bar: null, text: 'Ab', name: 'A♭' });
    expect(up.keys[0]).toMatchObject({ text: 'Bb', name: 'B♭' });
    expect(up.chords.length).toBe(plain.chords.length);
    plain.chords.forEach((c, i) => {
      const u = up.chords[i]!;
      expect(u.quarters).toBe(c.quarters);
      if (c.chord && u.chord) expect(u.chord.root).toBe((c.chord.root + 2) % 12);
    });
    expect(plain.chords.some((c) => c.text === 'Bbm7')).toBe(true);
    expect(up.chords.some((c) => c.text === 'Cm7')).toBe(true);
    for (const c of up.chords) expect(c.text).toMatch(/^[\x20-\x7e]+$/);
    // Every chord sits on a beat of the session.
    const beatQuarters = new Set(up.beats.map((b) => b.quarters));
    for (const c of up.chords) expect(beatQuarters.has(c.quarters)).toBe(true);
  });

  it('a modulation: a key per passage, at its nearest bar line, transposed, minor mode kept', () => {
    const map = constantTempoMap({ bpm: 120, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    const corrections = { ...emptyCorrections(), key: { tonic: 0, mode: 'major' as const }, keyChanges: [{ time: 16.1, key: { tonic: 9, mode: 'minor' as const } }] };
    const base = state(map, { corrections });
    const s = buildSession({ ...base, ...playback(base, { semitones: -3 }) });
    expect(s.keys.map((k) => [k.bar, k.quarters, k.text])).toEqual([
      [null, 0, 'A'],
      [8, 32, 'F#m'],
    ]);
  });

  it('sections and parts of the structure at their bar lines, with French labels', () => {
    const map = constantTempoMap({ bpm: 120, firstDownbeat: 1, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    const corrections = {
      ...emptyCorrections(),
      sections: [
        { time: 1.02, label: 'A' },
        { time: 17, label: 'B' },
      ],
      structure: {
        mode: 'jazz' as const,
        parts: [
          { id: 'p1', type: 'theme' as const, number: 1, instrument: null, start: 1, end: 17 },
          { id: 'p2', type: 'solo' as const, number: null, instrument: 'winds', start: 17, end: 33 },
        ],
        spans: [{ start: 0, end: 60 }],
        lettersByHand: true,
      },
    };
    const s = buildSession(state(map, { corrections }));
    // Downbeat at 1 s, bar −1 at −1 s: the lead-in is half a bar (two quarters at 120).
    expect(s.leadIn).toMatchObject({ meter: { numerator: 2, denominator: 4 }, quarterBpm: 120 });
    expect(s.sections.map((x) => [x.bar, x.quarters, x.label])).toEqual([
      [0, 2, 'A'],
      [8, 34, 'B'],
    ]);
    expect(s.parts.map((p) => [p.label, p.quarters, p.endQuarters, p.letters.join('')])).toEqual([
      ['Thème 1', 2, 34, 'A'],
      ['Solo (Vents)', 34, 66, 'B'],
    ]);
  });

  it('texts: ASCII chords, part labels, numbered file names', () => {
    expect(asciiChord(chord(10, 'maj7'), { tonic: 3, mode: 'major' })).toBe('Bbmaj7');
    expect(asciiChord(chord(6, 'hdim7'), { tonic: 4, mode: 'minor' })).toBe('F#m7b5');
    expect(asciiChord(chord(7, '7', ['b9', '#11'], 5), { tonic: 0, mode: 'major' })).toBe('G7(b9,#11)/F');
    expect(asciiChord(null, null)).toBe('N.C.');
    expect(partLabel({ type: 'solo', number: 2, instrument: 'piano' })).toBe('Solo 2 (Piano)');
    expect(partLabel({ type: 'intro', number: null, instrument: 'unknown-thing' })).toBe('Intro');
    expect(trackFileStems(['Morceau', 'Voix', 'Voix', 'a/b:c'])).toEqual(['01 Morceau', '02 Voix', '03 Voix', '04 a b c']);
  });

  it('a tempo outside the range is reported, not changed', () => {
    const map = variableTempoMap(
      [
        { time: 0, bpm: 120 },
        { time: 2, bpm: 1200 },
        { time: 2.2, bpm: 120 },
      ],
      [{ bar: 0, meter: { numerator: 4, denominator: 4 } }],
      'analysis',
    );
    const s = buildSession(state(map, {}, 10));
    expect(s.warnings.some((w) => w.kind === 'tempo-out-of-range')).toBe(true);
  });

  it('nothing to export without a piece or a track', () => {
    expect(() => buildSession(initialState())).toThrow('nothing');
  });
});
