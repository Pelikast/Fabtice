// The folder for Logic Pro: names, the tracks all of one length from 0 (the
// tempo chosen included), the MIDI file read back by an independent reader,
// the read-me and its three gestures.

import { parseMidi } from 'midi-file';
import { describe, expect, it } from 'vitest';
import { pcmFromChannels, type PcmAudio } from '../../audio/pcm';
import { demoAnalysis, demoCorrections } from '../../demo/demoAnalysis';
import { demoTempoMap } from '../../demo/demoProject';
import type { Track } from '../../model/project';
import { MockRenderer } from '../../render/mock';
import { initialState, type AppState } from '../../store/store';
import type { FolderFile, FolderResult, FolderTarget } from '../folder';
import { fixedLengthWav, logicBarOfFirstBar, logicReadme, planLogicFolder, README_NAME, runLogicExport } from './index';

const SR = 48000;

function audioOf(seconds: number, channels: 1 | 2): PcmAudio {
  const n = Math.round(seconds * SR);
  const chans = Array.from({ length: channels }, (_, c) => Float32Array.from({ length: n }, (_, i) => 0.25 * Math.sin((i * (c + 1)) / 20)));
  return pcmFromChannels(chans, SR);
}

function state(patch: Partial<AppState['playback']> = {}): { s: AppState; audio: Map<string, PcmAudio> } {
  const map = demoTempoMap('variable');
  const audio = new Map<string, PcmAudio>([
    ['a1', audioOf(12, 2)],
    ['a2', audioOf(11.98, 1)],
    ['a3', audioOf(12, 2)],
  ]);
  const track = (id: string, name: string, audioId: string, extra: Partial<Track> = {}): Track => {
    const a = audio.get(audioId)!;
    return { id, name, role: 'morceau', mute: false, solo: false, volume: 1, audio: { id: audioId, origin: 'separated', sampleRate: SR, channels: a.channelCount, frames: a.frames }, ...extra };
  };
  const base = initialState();
  const s: AppState = {
    ...base,
    project: { id: 'p', title: 'Blues : du dimanche', source: { kind: 'file', fileName: 'x.wav' }, duration: 12, sampleRate: SR, createdAt: '' },
    tracks: [track('t1', 'Voix', 'a1', { volume: 0.3 }), track('t2', 'Basse', 'a2', { mute: true }), track('t3', 'Piano', 'a3', { solo: true })],
    tempoMap: map,
    analysis: demoAnalysis(map, 12),
    corrections: demoCorrections(map),
    playback: { ...base.playback, ...patch },
  };
  return { s, audio };
}

/** A folder target that keeps what it receives (the web's zip and the Mac's folder share this contract). */
function memoryTarget(): FolderTarget & { files: FolderFile[]; aborted: boolean } {
  const t = {
    kind: 'zip' as const,
    folderName: 'test',
    files: [] as FolderFile[],
    aborted: false,
    async add(f: FolderFile) {
      t.files.push(f);
    },
    async finish(): Promise<FolderResult> {
      throw new Error('not used');
    },
    async abort() {
      t.aborted = true;
    },
  };
  return t;
}

async function wavInfo(blob: Blob) {
  const v = new DataView(await blob.slice(0, 44).arrayBuffer());
  return { channels: v.getUint16(22, true), rate: v.getUint32(24, true), bits: v.getUint16(34, true), dataBytes: v.getUint32(40, true), size: blob.size };
}

describe('the folder for Logic Pro', () => {
  it('names: the folder after the title and the changes, tracks numbered in order, the MIDI file, the read-me', () => {
    const { s } = state({ semitones: 2, tempoRatio: 0.9 });
    const plan = planLogicFolder(s);
    expect(plan.folderName).toBe('Blues du dimanche – Logic Pro (+2 demi-tons, tempo 90 %)');
    expect(plan.midiName).toBe('Blues du dimanche.mid');
    expect(plan.tracks.map((t) => t.name)).toEqual(['01 Voix.wav', '02 Basse.wav', '03 Piano.wav']);
    // Unity gain whatever the mixer says, the whole piece, wav, the transport's key and tempo.
    for (const t of plan.tracks) {
      expect(t.plan.files).toHaveLength(1);
      expect(t.plan.files[0]!.sources).toEqual([{ trackId: t.trackId, audioId: expect.any(String), gain: 1 }]);
      expect(t.plan).toMatchObject({ format: 'wav', range: { start: 0, end: 12 }, semitones: 2, tempoRatio: 0.9, archiveName: null });
    }
  });

  it('every track rendered at the tempo chosen, all exactly the same length from 0, Wave 48 kHz 16 bits; the MIDI file and the read-me', async () => {
    const { s, audio } = state({ tempoRatio: 0.8, semitones: -1 });
    const plan = planLogicFolder(s);
    const target = memoryTarget();
    const progress: number[] = [];
    await runLogicExport(plan, target, { renderer: new MockRenderer(), audioOf: (id) => audio.get(id), onProgress: (f) => progress.push(f) });
    expect(target.files.map((f) => f.name)).toEqual(['01 Voix.wav', '02 Basse.wav', '03 Piano.wav', 'Blues du dimanche.mid', README_NAME]);
    const frames = Math.round((12 * SR) / 0.8);
    expect(plan.session.frames).toBe(frames);
    for (const f of target.files.slice(0, 3)) {
      const info = await wavInfo(f.data);
      expect(info.rate).toBe(48000);
      expect(info.bits).toBe(16);
      expect(info.dataBytes).toBe(frames * info.channels * 2);
      expect(info.size).toBe(44 + info.dataBytes);
    }
    expect((await wavInfo(target.files[1]!.data)).channels).toBe(1);
    // Progress never goes back and ends at 1.
    expect(progress.every((p, i) => i === 0 || p >= progress[i - 1]!)).toBe(true);
    expect(progress.at(-1)).toBe(1);
    const midi = parseMidi(new Uint8Array(await target.files[3]!.data.arrayBuffer()));
    expect(midi.header).toMatchObject({ format: 1, ticksPerBeat: 960 });
    expect(midi.tracks[0]!.some((e) => e.type === 'marker')).toBe(true);
    const readme = await target.files[4]!.data.text();
    expect(readme).toContain('Fichier > Ouvrir');
    expect(readme).toContain('« Blues du dimanche.mid »');
    expect(readme).toContain('01 Voix.wav');
    expect(readme).toMatch(/1\. .*\n {2}2\. .*\n {2}3\. /);
  });

  it('a cancelled export stops at once', async () => {
    const { s, audio } = state({ tempoRatio: 0.8 });
    const abort = new AbortController();
    abort.abort();
    await expect(runLogicExport(planLogicFolder(s), memoryTarget(), { renderer: new MockRenderer(), audioOf: (id) => audio.get(id), signal: abort.signal })).rejects.toThrow('cancelled');
  });

  it('the fixed-length Wave: cut or completed with silence to the frame', async () => {
    const a = audioOf(1, 2);
    const long = await fixedLengthWav(a.frames + 1000).encode(a, {});
    const short = await fixedLengthWav(a.frames - 7).encode(a, {});
    expect((await wavInfo(long)).dataBytes).toBe((a.frames + 1000) * 4);
    expect((await wavInfo(short)).dataBytes).toBe((a.frames - 7) * 4);
    const tail = new Int16Array(await long.slice(long.size - 4000).arrayBuffer());
    expect(tail.every((v) => v === 0)).toBe(true);
  });

  it('the read-me says where Fabtice’s « mesure 1 » is in Logic when a lead-in comes first', () => {
    const { s } = state();
    const plan = planLogicFolder(s);
    const bar = logicBarOfFirstBar(plan.session);
    const text = logicReadme(plan.session, { tracks: ['01 Voix.wav'], midi: 'x.mid', changes: '' });
    if (plan.session.leadIn) {
      expect(bar).toBe(1 + plan.session.leadIn.bars - plan.session.start.bar);
      expect(text).toContain('mesure d’attente');
    }
    if (bar !== null && bar !== 1) expect(text).toContain(`la mesure ${bar} de Logic`);
  });
});
