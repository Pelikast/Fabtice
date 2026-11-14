import { describe, expect, it } from 'vitest';
import { BASE_BLOCK, PeakBuilder, buildPeaks, columnPeaks, levelFor } from './peaks';
import { pcmFromChannels } from '../audio/pcm';

const SR = 48000;

function sine(seconds: number, amp: number, hz = 440): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR);
  return out;
}

describe('peak pyramid', () => {
  it('stores the peak and the energy of each base bin', () => {
    const data = new Float32Array(BASE_BLOCK * 4);
    data[BASE_BLOCK + 3] = -0.5; // bin 1
    data.fill(0.25, BASE_BLOCK * 2, BASE_BLOCK * 3); // bin 2
    const py = buildPeaks(pcmFromChannels([data], SR));
    const l0 = py.levels[0]!;
    expect(l0.peak.length).toBe(4);
    expect(l0.peak[0]).toBe(0);
    expect(l0.peak[1]).toBeCloseTo(0.5);
    expect(l0.ms[1]).toBeCloseTo(0.25 / BASE_BLOCK);
    expect(l0.peak[2]).toBeCloseTo(0.25);
    expect(l0.ms[2]).toBeCloseTo(0.0625);
    expect(py.maxPeak).toBeCloseTo(0.5);
    expect(py.ready).toBe(true);
  });

  it('takes the loudest channel for the peak and the mean energy of all channels', () => {
    const left = new Float32Array(BASE_BLOCK).fill(0.8);
    const right = new Float32Array(BASE_BLOCK).fill(0.2);
    const py = buildPeaks(pcmFromChannels([left, right], SR));
    expect(py.levels[0]!.peak[0]).toBeCloseTo(0.8);
    expect(py.levels[0]!.ms[0]).toBeCloseTo((0.64 + 0.04) / 2);
  });

  it('merges levels exactly: upper peaks are maxima, energies are means', () => {
    const py = buildPeaks(pcmFromChannels([sine(20, 0.7)], SR));
    expect(py.levels.length).toBeGreaterThan(3);
    for (let k = 1; k < py.levels.length; k++) {
      const lo = py.levels[k - 1]!;
      const hi = py.levels[k]!;
      expect(hi.block).toBe(lo.block * 4);
      const i = Math.floor(hi.peak.length / 2);
      const kids = [0, 1, 2, 3].map((j) => lo.peak[i * 4 + j]!).filter((v) => v !== undefined);
      expect(hi.peak[i]).toBeCloseTo(Math.max(...kids), 6);
    }
    // A sine of amplitude a has RMS a / sqrt(2) at every level.
    const top = py.levels[py.levels.length - 1]!;
    expect(Math.sqrt(top.ms[0]!)).toBeCloseTo(0.7 / Math.SQRT2, 1);
  });

  it('is computed in slices that report progress and give the same result', () => {
    const audio = pcmFromChannels([sine(10, 0.5)], SR);
    const builder = new PeakBuilder(audio);
    let slices = 0;
    let last = 0;
    // A fake clock that advances 1 ms per reading, so a 2 ms budget stops after a few chunks.
    let clock = 0;
    while (!builder.step(2, () => clock++)) {
      slices++;
      expect(builder.pyramid.computedBins).toBeGreaterThan(last);
      last = builder.pyramid.computedBins;
      expect(builder.pyramid.ready).toBe(false);
      if (slices > 100000) throw new Error('does not finish');
    }
    expect(slices).toBeGreaterThan(5);
    const whole = buildPeaks(audio);
    expect(builder.pyramid.levels.length).toBe(whole.levels.length);
    expect(Array.from(builder.pyramid.levels[0]!.peak.slice(0, 50))).toEqual(Array.from(whole.levels[0]!.peak.slice(0, 50)));
  });

  it('handles empty audio', () => {
    const py = buildPeaks(pcmFromChannels([new Float32Array(0)], SR));
    expect(py.ready).toBe(true);
    expect(py.levels[0]!.peak.length).toBe(0);
  });

  it('computes ten minutes of stereo audio within a sane time', () => {
    const n = SR * 600;
    const ch = [new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i += 97) ch[0]![i] = ch[1]![i] = Math.sin(i) * 0.3;
    const t = performance.now();
    const py = buildPeaks(pcmFromChannels(ch, SR));
    const ms = performance.now() - t;
    expect(py.ready).toBe(true);
    expect(py.levels[0]!.peak.length).toBe(Math.ceil(n / BASE_BLOCK));
    expect(ms).toBeLessThan(5000);
  });
});

describe('levelFor and columnPeaks', () => {
  const py = buildPeaks(pcmFromChannels([sine(30, 0.5)], SR));

  it('picks the coarsest level whose bins fit in a pixel', () => {
    expect(levelFor(py, 10).block).toBe(BASE_BLOCK);
    expect(levelFor(py, 120).block).toBe(BASE_BLOCK);
    expect(levelFor(py, 300).block).toBe(BASE_BLOCK * 4);
    expect(levelFor(py, 48000).block).toBeLessThanOrEqual(48000);
    expect(levelFor(py, 48000).block).toBeGreaterThan(48000 / 4);
  });

  it('reports peak and RMS per column and -1 outside the audio', () => {
    const peak = new Float32Array(100);
    const rms = new Float32Array(100);
    // 100 columns of 0.1 s starting at 25 s: the audio ends at 30 s.
    columnPeaks(py, 25, 0.1, 100, peak, rms);
    expect(peak[0]).toBeGreaterThan(0.49);
    expect(rms[0]).toBeCloseTo(0.5 / Math.SQRT2, 1);
    expect(peak[49]).toBeGreaterThan(0.49);
    expect(peak[60]).toBe(-1);
    expect(rms[99]).toBe(-1);
    columnPeaks(py, -5, 0.1, 10, peak, rms);
    expect(peak[0]).toBe(-1);
  });

  it('only reads the bins computed so far while building', () => {
    const builder = new PeakBuilder(pcmFromChannels([sine(10, 0.5)], SR));
    builder.step(1, (() => { let c = 0; return () => c++; })());
    const done = builder.pyramid.computedBins;
    expect(done).toBeGreaterThan(0);
    expect(builder.pyramid.ready).toBe(false);
    const secondsDone = (done * BASE_BLOCK) / SR;
    const peak = new Float32Array(3);
    const rms = new Float32Array(3);
    columnPeaks(builder.pyramid, secondsDone + 1, 0.5, 3, peak, rms);
    expect(Array.from(peak)).toEqual([-1, -1, -1]);
  });
});
