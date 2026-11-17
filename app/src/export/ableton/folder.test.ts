// « Projet Ableton Live… »: the session as the writer's input (every beat at
// its time on Live's timeline, the signatures over 32 rewritten, the markers
// of the MIDI file and the keys as locators), and the folder (names, the two
// sets naming files that are there, with their size and checksum, the MIDI
// file, the read-me).

import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { pcmFromChannels, type PcmAudio } from '../../audio/pcm';
import { demoAnalysis, demoCorrections } from '../../demo/demoAnalysis';
import { demoTempoMap } from '../../demo/demoProject';
import { withMeterForBar, withMeterFrom } from '../../grid/meters';
import { constantTempoMap } from '../../grid/tempoMap';
import type { Track } from '../../model/project';
import type { TempoMap } from '../../model/tempoMap';
import { MockRenderer } from '../../render/mock';
import { initialState, type AppState } from '../../store/store';
import type { FolderFile, FolderResult, FolderTarget } from '../folder';
import { sessionToMidi, MIDI_PPQ } from '../midi';
import { buildSession, type Session } from '../session';
import { liveFileCrc } from './crc';
import { ABLETON_README_NAME, LIVE_TEMPO_RANGE, planAbletonFolder, runAbletonExport } from './folder';
import { quartersMap, sessionToAbleton } from './fromSession';
import { buildLiveSet } from './liveSet';
import { liveTempoSteps, quartersToSeconds } from './tempo';

const SR = 48000;

function audioOf(seconds: number, channels: 1 | 2): PcmAudio {
  const n = Math.round(seconds * SR);
  const chans = Array.from({ length: channels }, (_, c) => Float32Array.from({ length: n }, (_, i) => 0.25 * Math.sin((i * (c + 1)) / 20)));
  return pcmFromChannels(chans, SR);
}

function demoState(patch: Partial<AppState['playback']> = {}): { s: AppState; audio: Map<string, PcmAudio> } {
  const map = demoTempoMap('variable');
  const audio = new Map<string, PcmAudio>([
    ['a1', audioOf(12, 2)],
    ['a2', audioOf(11.98, 1)],
  ]);
  const track = (id: string, name: string, audioId: string, extra: Partial<Track> = {}): Track => {
    const a = audio.get(audioId)!;
    return { id, name, role: 'morceau', mute: false, solo: false, volume: 1, audio: { id: audioId, origin: 'separated', sampleRate: SR, channels: a.channelCount, frames: a.frames }, ...extra };
  };
  const base = initialState();
  return {
    audio,
    s: {
      ...base,
      project: { id: 'p', title: 'Blues : du dimanche', source: { kind: 'file', fileName: 'x.wav' }, duration: 12, sampleRate: SR, createdAt: '' },
      tracks: [track('t1', 'Voix', 'a1', { volume: 0.3 }), track('t2', 'Basse', 'a2', { mute: true })],
      tempoMap: map,
      analysis: demoAnalysis(map, 12),
      corrections: demoCorrections(map),
      playback: { ...base.playback, ...patch },
    },
  };
}

function mapState(map: TempoMap, duration = 40): AppState {
  const s = initialState();
  const tr: Track = { id: 't1', name: 'Morceau', role: 'morceau', mute: false, solo: false, volume: 1, audio: { id: 'a1', origin: 'original', sampleRate: SR, channels: 2, frames: duration * SR } };
  return { ...s, project: { id: 'p', title: 'Essai', source: { kind: 'file', fileName: 'e.wav' }, duration, sampleRate: SR, createdAt: '' }, tracks: [tr], tempoMap: map };
}

/** Every beat of the session at its time on Live's timeline (the steps as written, float32 values). */
function worstBeat(session: Session): number {
  const { input } = sessionToAbleton(session);
  const steps = liveTempoSteps(input.tempo);
  const q = quartersMap(session);
  let worst = 0;
  for (const b of session.beats) worst = Math.max(worst, Math.abs(quartersToSeconds(steps, q(b.quarters)) - b.time));
  return worst;
}

function memoryTarget(fullPath: string | null = null): FolderTarget & { files: FolderFile[] } {
  const t = {
    kind: 'zip' as const,
    folderName: 'Blues du dimanche Project',
    fullPath,
    files: [] as FolderFile[],
    async add(f: FolderFile) {
      t.files.push(f);
    },
    async finish(): Promise<FolderResult> {
      throw new Error('not used');
    },
    async abort() {},
  };
  return t;
}

describe('the session as an Ableton Live set', () => {
  it('the demo: every beat at its time (lead-in, moving tempo), the signatures, the markers of the MIDI file and the keys', () => {
    const { s } = demoState({ semitones: 2, tempoRatio: 0.9 });
    const session = buildSession(s, { tempoRange: LIVE_TEMPO_RANGE });
    const { input, notes } = sessionToAbleton(session);
    expect(notes).toEqual([]);
    expect(worstBeat(session)).toBeLessThan(1e-6);
    expect(input.meters).toEqual(session.meters.map((m) => ({ quarters: m.quarters, numerator: m.meter.numerator, denominator: m.meter.denominator })));
    const markers = sessionToMidi(session, { chordTrack: false }).markers;
    for (const m of markers) expect(input.locators).toContainEqual({ quarters: m.tick / MIDI_PPQ, name: m.text });
    expect(input.locators.filter((l) => l.name.startsWith('Tonalité '))).toEqual(session.keys.map((k) => ({ quarters: k.quarters, name: `Tonalité ${k.text}` })));
    expect(input.locators.some((l) => l.name.startsWith('[A]') || l.name.includes(' - [A]'))).toBe(true);
    expect(input.tracks.map((t) => t.file)).toEqual(['Samples/Imported/01 Voix.wav', 'Samples/Imported/02 Basse.wav']);
    expect(input.tracks.every((t) => t.frames === session.frames)).toBe(true);
    // The writer takes it as it is: no tempo clamped, the clips end at the end of the audio.
    const r = buildLiveSet(input);
    expect(r.warnings.filter((w) => w.kind !== 'locators-merged')).toEqual([]);
    for (const end of r.clipEnds) expect(quartersToSeconds(r.tempo, end)).toBeCloseTo(session.duration, 6);
  });

  it('n/32 with n even: (n/2)/16, nothing moves', () => {
    let map = constantTempoMap({ bpm: 100, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    map = withMeterForBar(map, 2, { numerator: 6, denominator: 32 });
    const session = buildSession(mapState(map), { tempoRange: LIVE_TEMPO_RANGE });
    const { input, notes } = sessionToAbleton(session);
    expect(notes.map((n) => [n.kind, n.bar, `${n.to.numerator}/${n.to.denominator}`])).toEqual([['meter-32-even', 2, '3/16']]);
    expect(input.meters.map((m) => [m.quarters, `${m.numerator}/${m.denominator}`])).toEqual([[0, '4/4'], [8, '3/16'], [8.75, '4/4']]);
    const q = quartersMap(session);
    for (const b of session.beats) expect(q(b.quarters)).toBe(b.quarters);
    expect(worstBeat(session)).toBeLessThan(1e-6);
  });

  it('n/32 with n odd: n/16 with the tempo doubled, every beat at its time, the positions after it moved', () => {
    let map = constantTempoMap({ bpm: 100, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    map = withMeterForBar(map, 2, { numerator: 7, denominator: 32 });
    const session = buildSession(mapState(map), { tempoRange: LIVE_TEMPO_RANGE });
    const { input, notes } = sessionToAbleton(session);
    expect(notes.map((n) => [n.kind, `${n.to.numerator}/${n.to.denominator}`])).toEqual([['meter-32-doubled', '7/16']]);
    // 7/32 is 0.875 quarter; 7/16 is 1.75: the bars after it start 0.875 later on Live's timeline.
    expect(input.meters.map((m) => [m.quarters, `${m.numerator}/${m.denominator}`])).toEqual([[0, '4/4'], [8, '7/16'], [9.75, '4/4']]);
    const inBar = input.tempo.filter((t) => t.quarters >= 8 && t.quarters < 9.75);
    expect(inBar.every((t) => Math.abs(t.quarterBpm - 200) < 1e-9)).toBe(true);
    expect(worstBeat(session)).toBeLessThan(1e-6);
    const r = buildLiveSet(input);
    expect(r.warnings).toEqual([]);
    for (const end of r.clipEnds) expect(quartersToSeconds(r.tempo, end)).toBeCloseTo(session.duration, 6);
    // The markers after it follow.
    const q = quartersMap(session);
    expect(q(8.875)).toBeCloseTo(9.75, 12);
    expect(q(9)).toBeCloseTo(9.875, 12);
    expect(q(8.5)).toBeCloseTo(9, 12);
  });

  it('n/32 with n odd at a fast tempo: k/16 (k = n/2 rounded down), bar lines at their time, said', () => {
    let map = constantTempoMap({ bpm: 600, firstDownbeat: 0, meter: { numerator: 4, denominator: 4 }, origin: 'manual' });
    map = withMeterFrom(map, 4, { numerator: 5, denominator: 32 });
    const session = buildSession(mapState(map, 20), { tempoRange: LIVE_TEMPO_RANGE });
    const { input, notes } = sessionToAbleton(session);
    expect(notes.map((n) => [n.kind, `${n.to.numerator}/${n.to.denominator}`])).toEqual([['meter-32-approx', '2/16']]);
    const steps = liveTempoSteps(input.tempo);
    const q = quartersMap(session);
    for (const bar of session.bars) expect(Math.abs(quartersToSeconds(steps, q(bar.quarters)) - bar.time)).toBeLessThan(1e-6);
    expect(Math.max(...steps.map((x) => x.quarterBpm))).toBeLessThanOrEqual(999);
  });
});

describe('the folder for Ableton Live', () => {
  it('names: « Titre (changes) Project », the two sets, the tracks in Samples/Imported, the MIDI file', () => {
    const { s } = demoState({ semitones: 2, tempoRatio: 0.9 });
    const plan = planAbletonFolder(s);
    expect(plan.folderName).toBe('Blues du dimanche (+2 demi-tons, tempo 90 %) Project');
    expect([plan.setName, plan.set10Name, plan.midiName]).toEqual(['Blues du dimanche.als', 'Blues du dimanche (Live 10).als', 'Blues du dimanche.mid']);
    expect(plan.tracks.map((t) => t.name)).toEqual(['Samples/Imported/01 Voix.wav', 'Samples/Imported/02 Basse.wav']);
    for (const t of plan.tracks) expect(t.plan).toMatchObject({ format: 'wav', semitones: 2, tempoRatio: 0.9, archiveName: null });
  });

  for (const fullPath of [null, '/Users/x/Musique/Blues du dimanche Project']) {
    it(`the files, in order; the sets name each wav with its size and checksum${fullPath ? ' and its full path (Mac app)' : ''}`, async () => {
      const { s, audio } = demoState({ tempoRatio: 0.8 });
      const plan = planAbletonFolder(s);
      const target = memoryTarget(fullPath);
      const progress: number[] = [];
      await runAbletonExport(plan, target, { renderer: new MockRenderer(), audioOf: (id) => audio.get(id), onProgress: (f) => progress.push(f) });
      expect(target.files.map((f) => f.name)).toEqual([
        'Samples/Imported/01 Voix.wav',
        'Samples/Imported/02 Basse.wav',
        'Blues du dimanche.als',
        'Blues du dimanche (Live 10).als',
        'Blues du dimanche.mid',
        ABLETON_README_NAME,
      ]);
      expect(progress.every((p, i) => i === 0 || p >= progress[i - 1]!)).toBe(true);
      expect(progress.at(-1)).toBe(1);
      const wavs = target.files.slice(0, 2);
      for (const w of wavs) expect(w.data.size).toBe(44 + plan.session.frames * (w.name.includes('Basse') ? 2 : 4));
      const xml11 = gunzipSync(new Uint8Array(await target.files[2]!.data.arrayBuffer())).toString('utf8');
      const xml10 = gunzipSync(new Uint8Array(await target.files[3]!.data.arrayBuffer())).toString('utf8');
      expect(xml11).toContain('MinorVersion="11.0_433"');
      expect(xml10).toContain('MinorVersion="10.0_377"');
      for (const w of wavs) {
        const crc = liveFileCrc(new Uint8Array(await w.data.slice(0, 16384).arrayBuffer()));
        expect(xml11).toContain(`<RelativePath Value="${w.name}" />`);
        expect(xml11).toContain(`<OriginalFileSize Value="${w.data.size}" />`);
        expect(xml11).toContain(`<OriginalCrc Value="${crc}" />`);
        expect(xml10).toContain(`<Name Value="${w.name.split('/').pop()}" />`);
        expect(xml10).toContain(`<FileSize Value="${w.data.size}" />`);
        expect(xml10).toContain(`<Crc Value="${crc}" />`);
        expect(xml11).toContain(`<Path Value="${fullPath ? `${fullPath}/${w.name}` : ''}" />`);
      }
      expect(xml11).toMatch(/<LastModDate Value="\d{10}" \/>/);
      const readme = await target.files[5]!.data.text();
      expect([...new Uint8Array(await target.files[5]!.data.slice(0, 3).arrayBuffer())]).toEqual([0xef, 0xbb, 0xbf]);
      expect(readme).toContain('À L’ESSAI');
      expect(readme).toContain('« Blues du dimanche.als »');
      expect(readme).toContain('« Blues du dimanche (Live 10).als »');
      expect(readme).toContain('fichiers manquants');
      expect(readme).toContain('\u00a0Blues du dimanche Project\u00a0');
      expect(readme).toContain('01 Voix.wav');
      expect(readme).toContain('Warp');
    });
  }

  it('a cancelled export stops at once', async () => {
    const { s, audio } = demoState();
    const abort = new AbortController();
    abort.abort();
    await expect(runAbletonExport(planAbletonFolder(s), memoryTarget(), { renderer: new MockRenderer(), audioOf: (id) => audio.get(id), signal: abort.signal })).rejects.toThrow('cancelled');
  });
});
