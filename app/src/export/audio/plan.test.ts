// The plan of « Audio… »: what files the choices of the window make. Pure: a
// state is built by hand, nothing is rendered.

import { describe, expect, it } from 'vitest';
import { defaultExportPreferences, type ExportPreferences } from '../../model/audioExport';
import type { Track } from '../../model/project';
import { initialState, type AppState } from '../../store/store';
import { planAudioExport } from './plan';
import { ExportError } from './types';

const track = (n: number, name: string, extra: Partial<Track> = {}): Track =>
  ({ id: `t${n}`, name, role: 'autres', mute: false, solo: false, volume: 1, audio: { id: `a${n}` }, ...extra }) as Track;

function state(tracks: Track[], extra: Partial<AppState> = {}): AppState {
  const base = initialState();
  return {
    ...base,
    project: { id: 'p', title: 'Blues du dimanche', source: { kind: 'demo' }, duration: 12, sampleRate: 48000, createdAt: '2026-11-17T00:00:00Z' },
    tracks,
    ...extra,
  } as AppState;
}

const prefs = (patch: Partial<ExportPreferences>): ExportPreferences => ({ ...defaultExportPreferences(), ...patch });
const THREE = [track(1, 'Basse', { volume: 0.5 }), track(2, 'Piano'), track(3, 'Voix', { mute: true })];
const names = (p: ReturnType<typeof planAudioExport>) => p.files.map((f) => f.name);

describe('the mix', () => {
  it('is one file, as heard: the muted track out, the volumes in', () => {
    const p = planAudioExport(state(THREE), prefs({ what: 'mix' }));
    expect(names(p)).toEqual(['Blues du dimanche – mélange.wav']);
    expect(p.archiveName).toBeNull();
    expect(p.files[0]!.sources).toEqual([
      { trackId: 't1', audioId: 'a1', gain: 0.5 },
      { trackId: 't2', audioId: 'a2', gain: 1 },
    ]);
  });
  it('a soloed track is heard alone, even muted', () => {
    const s = state([track(1, 'Basse'), track(2, 'Voix', { mute: true, solo: true })]);
    expect(planAudioExport(s, prefs({ what: 'mix' })).files[0]!.sources.map((x) => x.trackId)).toEqual(['t2']);
  });
  it('the « un fichier par piste » box is of no concern to it', () => {
    const a = planAudioExport(state(THREE), prefs({ what: 'mix', separate: true }));
    const b = planAudioExport(state(THREE), prefs({ what: 'mix', separate: false }));
    expect(b.files).toEqual(a.files);
  });
  it('refuses when every track is muted', () => {
    expect(() => planAudioExport(state([track(1, 'Basse', { mute: true })]), prefs({ what: 'mix' }))).toThrow(ExportError);
  });
});

describe('tracks', () => {
  it('several ticked, one file each: every one at its full level, mute, solo and volume ignored, in a .zip', () => {
    const p = planAudioExport(state(THREE), prefs({ what: 'tracks', separate: true }), ['t1', 't3']);
    expect(names(p)).toEqual(['Blues du dimanche – Basse.wav', 'Blues du dimanche – Voix.wav']);
    expect(p.files.map((f) => f.sources)).toEqual([[{ trackId: 't1', audioId: 'a1', gain: 1 }], [{ trackId: 't3', audioId: 'a3', gain: 1 }]]);
    expect(p.archiveName).toBe('Blues du dimanche – pistes.zip');
  });
  it('several ticked, one file: mixed at their volumes, mute and solo ignored, no archive', () => {
    const p = planAudioExport(state(THREE), prefs({ what: 'tracks', separate: false }), ['t1', 't3']);
    expect(p.files).toHaveLength(1);
    expect(p.files[0]!.name).toBe('Blues du dimanche – Basse + Voix.wav');
    expect(p.files[0]!.sources).toEqual([
      { trackId: 't1', audioId: 'a1', gain: 0.5 },
      { trackId: 't3', audioId: 'a3', gain: 1 },
    ]);
    expect(p.archiveName).toBeNull();
  });
  it('a long list of names is « mélange de N pistes »', () => {
    const many = ['Voix', 'Batterie', 'Basse', 'Guitare', 'Piano', 'Vents', 'Autres'].map((n, i) => track(i + 1, n));
    const p = planAudioExport(state(many), prefs({ what: 'tracks', separate: false }));
    expect(p.files).toHaveLength(1);
    expect(p.files[0]!.name).toBe('Blues du dimanche – mélange de 7 pistes.wav');
  });
  it('one ticked: one file at full level, the box changes nothing', () => {
    const a = planAudioExport(state(THREE), prefs({ what: 'tracks', separate: true }), ['t1']);
    const b = planAudioExport(state(THREE), prefs({ what: 'tracks', separate: false }), ['t1']);
    expect(b.files).toEqual(a.files);
    expect(a.files).toHaveLength(1);
    expect(a.files[0]!.sources).toEqual([{ trackId: 't1', audioId: 'a1', gain: 1 }]);
    expect(a.archiveName).toBeNull();
  });
  it('every track when none is named', () => {
    expect(planAudioExport(state(THREE), prefs({ what: 'tracks' })).files).toHaveLength(3);
  });
  it('refuses when none is ticked, or when the ones mixed are all at volume 0', () => {
    expect(() => planAudioExport(state(THREE), prefs({ what: 'tracks' }), [])).toThrow(ExportError);
    const silent = [track(1, 'Basse', { volume: 0 }), track(2, 'Piano', { volume: 0 })];
    expect(() => planAudioExport(state(silent), prefs({ what: 'tracks', separate: false }))).toThrow(ExportError);
  });
  it('two tracks of the same name get numbered files', () => {
    const p = planAudioExport(state([track(1, 'Voix'), track(2, 'Voix')]), prefs({ what: 'tracks', separate: true }));
    expect(names(p)).toEqual(['Blues du dimanche – Voix.wav', 'Blues du dimanche – Voix 2.wav']);
  });
});

describe('range, key and tempo', () => {
  it('the loop only, when there is one; the whole piece when the loop is asked and there is none', () => {
    const s = state(THREE, { loop: { region: { start: 2, end: 4.5 }, enabled: true } });
    expect(planAudioExport(s, prefs({ range: 'loop' })).range).toEqual({ start: 2, end: 4.5 });
    expect(planAudioExport(s, prefs({ range: 'whole' })).range).toEqual({ start: 0, end: 12 });
    expect(planAudioExport(state(THREE), prefs({ range: 'loop' })).range).toEqual({ start: 0, end: 12 });
    expect(planAudioExport(s, prefs({ range: 'loop' })).files[0]!.name).toContain(' – boucle ');
  });
  it('carries the key and tempo of the transport, and says so in the names', () => {
    const s = state(THREE, { playback: { ...initialState().playback, semitones: 2, cents: -10, tempoRatio: 0.9 } });
    const p = planAudioExport(s, prefs({}));
    expect([p.semitones, p.cents, p.tempoRatio]).toEqual([2, -10, 0.9]);
    expect(p.files[0]!.name).toContain('(+2 demi-tons, −10 cents, tempo 90 %)');
  });
});

describe('the format choices', () => {
  it('Wave: the rate and the quantization asked', () => {
    const p = planAudioExport(state(THREE), prefs({ format: 'wav', waveRate: 96000, waveBits: 24 }));
    expect(p.output).toMatchObject({ sampleRate: 96000, bits: 24 });
    expect(p.format).toBe('wav');
  });
  it('mp3: the constant rate asked, 320 by default; flac and mp3 keep the audio’s own rate', () => {
    expect(planAudioExport(state(THREE), prefs({ format: 'mp3' })).output).toMatchObject({ sampleRate: null, kbps: 320 });
    const p = planAudioExport(state(THREE), prefs({ format: 'mp3', mp3Kbps: 128, waveRate: 96000 }));
    expect(p.output).toMatchObject({ sampleRate: null, kbps: 128 });
    expect(p.files[0]!.name.endsWith('.mp3')).toBe(true);
    expect(planAudioExport(state(THREE), prefs({ format: 'flac' })).files[0]!.name.endsWith('.flac')).toBe(true);
  });
  it('a request without the choices added in 1.0.0 takes their defaults (what another part of the app may send)', () => {
    const p = planAudioExport(state(THREE), { what: 'tracks', range: 'whole', format: 'wav' }, ['t1', 't2']);
    expect(p.files).toHaveLength(2);
    expect(p.archiveName).not.toBeNull();
    expect(p.output).toEqual({ sampleRate: 48000, bits: 16, kbps: 320 });
  });
});
