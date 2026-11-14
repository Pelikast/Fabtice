import { describe, expect, it } from 'vitest';
import { CHUNK, isShared, pcmFromChannels, pcmFromChunks, pcmToChannels, pcmToMono, PcmWriter, readPcm, sumPcm } from './pcm';
import { engineTrack, getAudio, registerAudio, registryBytes, clearAudio } from './registry';

const SR = 48000;
const ramp = (n: number, k = 1) => Float32Array.from({ length: n }, (_, i) => (((i * k) % 2000) / 2000 - 0.5) * 0.9);

describe('the one in-memory form of decoded audio', () => {
  it('holds 16-bit samples in shared memory, stereo twice, equal channels once', () => {
    const l = ramp(CHUNK * 2 + 77);
    const stereo = pcmFromChannels([l, l.map((v) => -v)], SR);
    expect(stereo.mono).toBe(false);
    expect(stereo.channelCount).toBe(2);
    expect(stereo.chunks).toHaveLength(3);
    expect(stereo.bytes).toBe(3 * CHUNK * 2 * 2);
    expect(isShared(stereo)).toBe(true);
    const twin = pcmFromChannels([l, l.slice()], SR);
    expect(twin.mono).toBe(true);
    expect(twin.channelCount).toBe(2);
    expect(twin.bytes).toBe(3 * CHUNK * 2);
  });

  it('reads back any range within one 16-bit step, zeros outside', () => {
    const l = ramp(CHUNK + 500, 3);
    const r = ramp(CHUNK + 500, 7);
    const pcm = pcmFromChannels([l, r], SR);
    const out = new Float32Array(1200);
    readPcm(pcm, 1, CHUNK - 600, out);
    for (let i = 0; i < 1100; i++) expect(Math.abs(out[i]! - r[CHUNK - 600 + i]!)).toBeLessThanOrEqual(1 / 32768);
    expect(out[1199]).toBe(0);
    const before = new Float32Array(10);
    readPcm(pcm, 0, -5, before);
    expect(before[0]).toBe(0);
    expect(Math.abs(before[5]! - l[0]!)).toBeLessThanOrEqual(1 / 32768);
  });

  it('gives transient Float32 copies and the analysis mix (l + r) / 2', () => {
    const l = ramp(5000);
    const r = ramp(5000, 2);
    const pcm = pcmFromChannels([l, r], SR);
    const [cl, cr] = pcmToChannels(pcm);
    expect(cl!.length).toBe(5000);
    expect(Math.abs(cr![10]! - r[10]!)).toBeLessThanOrEqual(1 / 32768);
    const mono = pcmToMono(pcm);
    expect(Math.abs(mono[123]! - (l[123]! + r[123]!) / 2)).toBeLessThanOrEqual(1 / 32768);
    const one = pcmFromChannels([l], SR);
    expect(pcmToChannels(one)).toHaveLength(1);
    expect(pcmToChannels(pcmFromChannels([l, l], SR), { bothChannels: true })).toHaveLength(2);
  });

  it('is written progressively; a stereo writer whose channels stay equal stores one', () => {
    const w = new PcmWriter(CHUNK * 2, SR, 2);
    const block = ramp(1000);
    for (let at = 0; at < CHUNK * 2; at += 1000) w.write(at, block);
    const pcm = w.finish();
    expect(pcm.mono).toBe(true);
    expect(pcm.channelCount).toBe(2);
    expect(() => w.write(0, block)).toThrow();
    const w2 = new PcmWriter(3000, SR, 2);
    w2.write(0, ramp(3000), ramp(3000).map((v) => v / 2));
    expect(w2.finish().mono).toBe(false);
  });

  it('sums parts (the parts gathered in « Autres »)', () => {
    const a = pcmFromChannels([new Float32Array(4000).fill(0.25)], SR);
    const b = pcmFromChannels([new Float32Array(4000).fill(0.125), new Float32Array(4000).fill(-0.125)], SR);
    const s = sumPcm([a, b]);
    const out = new Float32Array(1);
    readPcm(s, 0, 100, out);
    expect(out[0]).toBeCloseTo(0.375, 4);
    readPcm(s, 1, 100, out);
    expect(out[0]).toBeCloseTo(0.125, 4);
  });

  it('refuses chunks that do not match their frames', () => {
    const pcm = pcmFromChannels([ramp(CHUNK + 1)], SR);
    expect(() => pcmFromChunks(pcm.chunks.slice(0, 1), CHUNK + 1, SR, 1)).toThrow();
  });

  it('the registry keeps the converted form only, and hands the engine the same chunks (no copy)', () => {
    clearAudio();
    const pcm = registerAudio('a', { channels: [ramp(CHUNK)], sampleRate: SR });
    expect(getAudio('a')).toBe(pcm);
    expect(registryBytes()).toBe(CHUNK * 2);
    const t = engineTrack('track', 'a');
    expect(t.pcm).toBe(pcm);
    expect(t.channels).toBeUndefined();
    clearAudio();
  });
});
