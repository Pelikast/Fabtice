import { describe, expect, it } from 'vitest';
import { isMono, storeTrack } from './storage';
import { TrackData, readTrack } from './worklet/core';
import { CHUNK } from './worklet/protocol';

describe('track storage', () => {
  it('stores a mono track once, a stereo track twice, in 16 bits', () => {
    const n = CHUNK * 2 + 100;
    const l = new Float32Array(n).map((_, i) => Math.sin(i / 50) * 0.5);
    const mono = storeTrack([l, l.slice()]);
    expect(mono.mono).toBe(true);
    expect(mono.bytes).toBe(3 * CHUNK * 2);
    expect(mono.chunks.every((c) => c.r === null)).toBe(true);
    const r = l.map((v) => -v);
    const stereo = storeTrack([l, r]);
    expect(stereo.mono).toBe(false);
    expect(stereo.bytes).toBe(2 * 3 * CHUNK * 2);
  });

  it('uses shared memory, so the audio thread reads it without a copy', () => {
    const s = storeTrack([new Float32Array(1000).fill(0.25)]);
    expect(s.chunks[0]!.l.buffer instanceof SharedArrayBuffer).toBe(true);
  });

  it('reads back within one 16-bit step, clipping out-of-range values', () => {
    const l = Float32Array.from([0, 0.5, -0.5, 1.5, -1.5, 0.123456]);
    const s = storeTrack([l]);
    const track = new TrackData(s.frames, s.mono, s.chunks);
    const dl = new Float32Array(8);
    const dr = new Float32Array(8);
    readTrack(track, 0, 6, dl, dr, 0);
    expect(Math.abs(dl[1]! - 0.5)).toBeLessThan(1 / 32768);
    expect(Math.abs(dl[5]! - 0.123456)).toBeLessThan(1 / 32768);
    expect(dl[3]).toBeCloseTo(32767 / 32768, 6);
    expect(dl[4]).toBe(-1);
    expect(Array.from(dr.subarray(0, 6))).toEqual(Array.from(dl.subarray(0, 6)));
  });

  it('reads zeros outside the material and across chunk boundaries', () => {
    const n = CHUNK + 10;
    const l = new Float32Array(n).fill(0.5);
    const s = storeTrack([l]);
    const track = new TrackData(s.frames, s.mono, s.chunks);
    const dl = new Float32Array(40);
    const dr = new Float32Array(40);
    readTrack(track, CHUNK - 20, 40, dl, dr, 0);
    expect(dl[0]).toBeCloseTo(0.5, 4);
    expect(dl[29]).toBeCloseTo(0.5, 4);
    expect(dl[30]).toBe(0);
    readTrack(track, -10, 20, dl, dr, 0);
    expect(dl[9]).toBe(0);
    expect(dl[10]).toBeCloseTo(0.5, 4);
    expect(track.missing).toBe(0);
  });

  it('tells a nearly identical right channel from a different one', () => {
    const l = new Float32Array(100).fill(0.3);
    expect(isMono(l, undefined)).toBe(true);
    expect(isMono(l, l.map((v) => v + 1e-5))).toBe(true);
    expect(isMono(l, l.map((v) => v + 0.01))).toBe(false);
  });
});
