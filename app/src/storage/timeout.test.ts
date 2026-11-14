import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepTimeout, withTimeout } from './timeout';

afterEach(() => vi.useRealTimers());

describe('withTimeout', () => {
  it('passes the result through, and clears its timer', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve(3), 1000, 'x')).resolves.toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes a rejection through', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'x')).rejects.toThrow('boom');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with a StepTimeout naming the step when nothing answers in time', async () => {
    vi.useFakeTimers();
    const caught = withTimeout(new Promise<void>(() => {}), 500, 'read').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(499);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2);
    const error = await caught;
    expect(error).toBeInstanceOf(StepTimeout);
    expect(error).toMatchObject({ step: 'read', ms: 500 });
  });

  it('a late failure after the time-out stays silent (no unhandled rejection)', async () => {
    vi.useFakeTimers();
    let fail!: (e: Error) => void;
    const late = new Promise<void>((_, reject) => (fail = reject));
    const caught = withTimeout(late, 10, 'x').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20);
    expect(await caught).toBeInstanceOf(StepTimeout);
    fail(new Error('too late'));
    await vi.advanceTimersByTimeAsync(10);
  });
});
