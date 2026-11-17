// « Alléger le travail pour l'appareil » in the separation pipeline: a rest after each segment, the next
// segment starting only after it, a cancellation during a rest, and nothing at all at full speed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSleeper, createThrottle, pauseAfterMs } from '../../settings/easeLoad';
import bundled from '../models.json';
import { separatePiece, type PipelineInput, type SegmentModel } from './pipeline';
import { parseConfig, type ToolConfig } from './plan';

const scnet = parseConfig(bundled.models.find((m) => m.id === 'scnet')!.config as Record<string, unknown>);
const cfg: ToolConfig = { ...scnet, segment: 44100 };
const N = 48000 * 7 + 123;
const l = Float32Array.from({ length: N }, (_, i) => 0.4 * Math.sin(i / 37));
const r = Float32Array.from({ length: N }, (_, i) => 0.3 * Math.sin(i / 91));
const input: PipelineInput = {
  frames: N,
  sampleRate: 48000,
  stereo: true,
  read: (ch, start, out) => {
    const x = ch === 1 ? r : l;
    for (let i = 0; i < out.length; i++) out[i] = x[start + i] ?? 0;
  },
};

/** A stand-in network that logs what happens to it, in order. */
function model(log: string[]): SegmentModel<[Float32Array, Float32Array], [Float32Array, Float32Array]> {
  let n = 0;
  return {
    prepare: (a, b) => [a, b],
    run: async (p) => {
      log.push(`run${n++}`);
      return p;
    },
    finish: (_p, [a, b]) => [0.5, 0.5].map((g) => [a.map((v) => v * g), b.map((v) => v * g)] as [Float32Array, Float32Array]),
  };
}

const collect = async (extra: Partial<Parameters<typeof separatePiece>[0]>, log: string[] = []) => {
  const out = [new Float32Array(N), new Float32Array(N)];
  const res = await separatePiece({
    cfg,
    stems: 2,
    input,
    model: model(log),
    emit: (offset, parts) => out.forEach((o, s) => o.set(parts[s]![0]!, offset)),
    ...extra,
  });
  return { res, out };
};

describe('a rest after each segment', () => {
  it('is taken after every segment but the last, the next segment starting only after it', async () => {
    const log: string[] = [];
    const throttle = { mark: () => log.push('mark'), pause: async () => void log.push('rest') };
    const { res } = await collect({ throttle }, log);
    expect(res.segments).toBeGreaterThan(3);
    expect(log.filter((e) => e === 'mark')).toHaveLength(1);
    expect(log.filter((e) => e === 'rest')).toHaveLength(res.segments - 1);
    // run0 rest run1 rest run2 …: a segment never starts before the rest that follows the one before.
    const steps = log.filter((e) => e !== 'mark');
    expect(steps.slice(0, 5)).toEqual(['run0', 'rest', 'run1', 'rest', 'run2']);
    expect(log[0]).toBe('mark');
  });

  it('changes nothing in the result', async () => {
    const plain = await collect({});
    const eased = await collect({ throttle: { mark: () => {}, pause: async () => {} } });
    expect(Array.from(eased.out[0]!.subarray(5000, 5100))).toEqual(Array.from(plain.out[0]!.subarray(5000, 5100)));
    expect(eased.res.segments).toBe(plain.res.segments);
  });

  it('is not taken at all at full speed (no throttle: the same calls, in the same order)', async () => {
    const log: string[] = [];
    await collect({}, log);
    expect(log.every((e) => e.startsWith('run'))).toBe(true);
  });

  it('lasts for the time each segment took, scaled by the share', async () => {
    let clock = 0;
    const slept: number[] = [];
    const throttle = createThrottle({
      share: 0.75,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    })!;
    // Each segment of the stand-in network takes 3 s of the fake clock.
    const slow: SegmentModel<[Float32Array, Float32Array], [Float32Array, Float32Array]> = {
      ...model([]),
      run: async (p) => {
        clock += 3000;
        return p;
      },
    };
    const { res } = await collect({ throttle, model: slow });
    expect(slept).toHaveLength(res.segments - 1);
    for (const ms of slept) expect(ms).toBeCloseTo(pauseAfterMs(3000, 0.75), 6);
    expect(slept[0]).toBeCloseTo(1000, 6);
  });
});

describe('cancelling during a rest', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is heard at once: the rest is woken, the next segment never starts', async () => {
    const sleeper = createSleeper();
    let cancelled = false;
    const log: string[] = [];
    const throttle = { mark: () => {}, pause: () => sleeper.sleep(60_000).then(() => 0) };
    const work = collect(
      {
        throttle,
        check: () => {
          if (cancelled) throw new Error('cancelled');
        },
      },
      log,
    );
    const outcome = work.then(
      () => 'done',
      (e: Error) => e.message,
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(log).toEqual(['run0']);
    // A minute of rest to go: the cancellation does not wait for it.
    cancelled = true;
    sleeper.wake();
    await vi.advanceTimersByTimeAsync(10);
    expect(await outcome).toBe('cancelled');
    expect(log).toEqual(['run0']);
    expect(vi.getTimerCount()).toBe(0);
  });
});
