// Running a plan: a file mixing the ticked tracks at their volumes, and the
// choices of the format reaching the encoder. At the original key and tempo
// nothing is rendered (the renderer is never asked).

import { describe, expect, it } from 'vitest';
import { pcmFromChannels, readPcm, type PcmAudio } from '../../audio/pcm';
import { runAudioExport } from './run';
import type { AudioEncoder, EncodeOptions, ExportPlan } from './types';

const SR = 48000;
const tone = (hz: number, amp: number) => Float32Array.from({ length: SR }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
const AUDIO = new Map<string, PcmAudio>([
  ['a1', pcmFromChannels([tone(220, 0.4), tone(220, 0.4)], SR)],
  ['a2', pcmFromChannels([tone(330, 0.3), tone(330, 0.3)], SR)],
]);
const renderer = {
  kind: 'test',
  supportsFormants: false,
  render: () => Promise.reject(new Error('not at the original key and tempo')),
} as never;

/** An encoder that keeps what it was given instead of making a file. */
function spy() {
  const calls: { audio: PcmAudio; options: EncodeOptions }[] = [];
  const encoder: AudioEncoder = {
    format: 'wav',
    extension: 'wav',
    mimeType: 'audio/wav',
    async encode(audio, options) {
      calls.push({ audio, options });
      return new Blob(['x']);
    },
  };
  return { calls, encoder };
}

const plan = (patch: Partial<ExportPlan>): ExportPlan => ({
  format: 'wav',
  range: { start: 0, end: 1 },
  semitones: 0,
  cents: 0,
  tempoRatio: 1,
  formants: false,
  files: [],
  archiveName: null,
  ...patch,
});
const sample = (a: PcmAudio, at: number) => {
  const buf = new Float32Array(1);
  readPcm(a, 0, at, buf);
  return buf[0]!;
};

describe('runAudioExport', () => {
  it('a file of several sources is their sum at their gains', async () => {
    const { calls, encoder } = spy();
    await runAudioExport(
      plan({ files: [{ name: 'x.wav', title: 'x', sources: [{ trackId: 't1', audioId: 'a1', gain: 0.5 }, { trackId: 't2', audioId: 'a2', gain: 1 }] }] }),
      { renderer, audioOf: (id) => AUDIO.get(id), encoderFor: () => encoder },
    );
    expect(calls).toHaveLength(1);
    const out = calls[0]!.audio;
    expect(out.frames).toBe(SR);
    for (const at of [100, 5000, 30000]) {
      const want = 0.5 * sample(AUDIO.get('a1')!, at) + sample(AUDIO.get('a2')!, at);
      expect(Math.abs(sample(out, at) - want)).toBeLessThan(2 / 32768);
    }
  });

  it('a track on its own, at gain 1, goes to the encoder as it is', async () => {
    const { calls, encoder } = spy();
    await runAudioExport(plan({ files: [{ name: 'x.wav', title: 'x', sources: [{ trackId: 't1', audioId: 'a1', gain: 1 }] }] }), { renderer, audioOf: (id) => AUDIO.get(id), encoderFor: () => encoder });
    expect(calls[0]!.audio).toBe(AUDIO.get('a1'));
  });

  it('hands the encoder the choices of the plan: rate, quantization, bit rate', async () => {
    const { calls, encoder } = spy();
    const files = [{ name: 'x.wav', title: 'T', sources: [{ trackId: 't1', audioId: 'a1', gain: 1 }] }];
    await runAudioExport(plan({ files, output: { sampleRate: 96000, bits: 24, kbps: 128 } }), { renderer, audioOf: (id) => AUDIO.get(id), encoderFor: () => encoder });
    expect(calls[0]!.options).toMatchObject({ sampleRate: 96000, bits: 24, kbps: 128, title: 'T' });
    // A plan of the first form of the contract (no `output`): 48 kHz as it is, 16 bits, 320 kbit/s.
    await runAudioExport(plan({ files }), { renderer, audioOf: (id) => AUDIO.get(id), encoderFor: () => encoder });
    expect(calls[1]!.options).toMatchObject({ sampleRate: undefined, bits: 16, kbps: 320 });
  });

  it('several files go in one archive', async () => {
    const { encoder } = spy();
    const files = ['a1', 'a2'].map((id, i) => ({ name: `f${i}.wav`, title: `f${i}`, sources: [{ trackId: `t${i}`, audioId: id, gain: 1 }] }));
    const out = await runAudioExport(plan({ files, archiveName: 'pistes.zip' }), { renderer, audioOf: (id) => AUDIO.get(id), encoderFor: () => encoder });
    expect(out.name).toBe('pistes.zip');
    const head = new Uint8Array(await out.blob.arrayBuffer());
    expect(String.fromCharCode(head[0]!, head[1]!)).toBe('PK');
  });
});
