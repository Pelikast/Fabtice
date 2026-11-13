import { describe, expect, it } from 'vitest';
import { ENGINE_SAMPLE_RATE, type EngineState } from './AudioEngine';
import { MockEngine, type Clock } from './MockEngine';

/** Manual clock: time only moves with `advance()`, timers fire when due. */
function fakeClock() {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let next = 1;
  const clock: Clock = {
    now: () => now,
    setTimer: (fn, ms) => {
      const id = next++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimer: (h) => {
      timers = timers.filter((t) => t.id !== h);
    },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const due = timers[0];
      if (!due || due.at > end) break;
      timers.shift();
      now = due.at;
      due.fn();
    }
    now = end;
  };
  return { clock, advance };
}

const track = (id: string, seconds: number) => ({
  id,
  channels: [new Float32Array(Math.round(seconds * ENGINE_SAMPLE_RATE))],
  sampleRate: ENGINE_SAMPLE_RATE,
});
const mix = { mute: false, solo: false, volume: 1 };

async function loaded(seconds = 10) {
  const { clock, advance } = fakeClock();
  const engine = new MockEngine(clock);
  const states: EngineState[] = [];
  engine.on('state', (s) => states.push(s));
  await engine.loadTracks([track('a', seconds)], { a: mix });
  return { engine, advance, states };
}

describe('MockEngine', () => {
  it('loads tracks and reports the duration', async () => {
    const { engine, states } = await loaded(10);
    expect(engine.getState()).toBe('ready');
    expect(engine.getDuration()).toBe(10);
    expect(states).toEqual(['loading', 'ready']);
  });

  it('refuses tracks at the wrong sample rate', async () => {
    const engine = new MockEngine(fakeClock().clock);
    const errors: string[] = [];
    engine.on('error', (e) => errors.push(e.code));
    await expect(engine.loadTracks([{ ...track('a', 1), sampleRate: 44100 }], {})).rejects.toThrow();
    expect(engine.getState()).toBe('error');
    expect(errors).toEqual(['load']);
  });

  it('advances with the clock and the tempo ratio', async () => {
    const { engine, advance } = await loaded();
    await engine.play();
    advance(2000);
    expect(engine.getPosition()).toBeCloseTo(2);
    engine.setTempoRatio(0.5);
    advance(2000);
    expect(engine.getPosition()).toBeCloseTo(3);
    engine.pause();
    advance(5000);
    expect(engine.getPosition()).toBeCloseTo(3);
    expect(engine.getState()).toBe('ready');
  });

  it('seeks, clamped to the piece', async () => {
    const { engine } = await loaded();
    engine.seek(4.5);
    expect(engine.getPosition()).toBe(4.5);
    engine.seek(-3);
    expect(engine.getPosition()).toBe(0);
    engine.seek(99);
    expect(engine.getPosition()).toBe(10);
  });

  it('wraps inside the loop, and plays on once past its end', async () => {
    const { engine, advance } = await loaded();
    engine.setLoop({ start: 2, end: 4 });
    engine.seek(1);
    await engine.play();
    advance(3500); // 1 + 3.5 = 4.5 -> 2.5
    expect(engine.getPosition()).toBeCloseTo(2.5);
    advance(4000);
    expect(engine.getPosition()).toBeCloseTo(2.5);
    engine.seek(5);
    advance(1000);
    expect(engine.getPosition()).toBeCloseTo(6);
  });

  it('stops at the end, emits ended, and restarts from 0 on play', async () => {
    const { engine, advance } = await loaded(3);
    let ended = 0;
    engine.on('ended', () => ended++);
    await engine.play();
    advance(3500);
    expect(ended).toBe(1);
    expect(engine.getState()).toBe('ready');
    expect(engine.getPosition()).toBe(3);
    await engine.play();
    expect(engine.getPosition()).toBe(0);
  });

  it('does not end while the loop holds the playhead', async () => {
    const { engine, advance } = await loaded(3);
    let ended = 0;
    engine.on('ended', () => ended++);
    engine.setLoop({ start: 1, end: 2 });
    await engine.play();
    advance(10000);
    expect(ended).toBe(0);
    engine.setLoop(null);
    advance(5000);
    expect(ended).toBe(1);
  });

  it('keeps every setting it receives', async () => {
    const { engine } = await loaded();
    engine.setTransposition(-3, 12);
    engine.setTrackMix('a', { mute: true, solo: false, volume: 0.5 });
    engine.setMetronome(true);
    engine.setClickTrack({ times: new Float64Array([0, 0.5]), accents: new Uint8Array([1, 0]) });
    expect(engine.snapshot()).toMatchObject({
      semitones: -3,
      cents: 12,
      metronome: true,
      clicks: 2,
      tracks: [{ id: 'a', mix: { mute: true, volume: 0.5 } }],
    });
  });

  it('adds and removes tracks', async () => {
    const { engine } = await loaded(4);
    await engine.addTrack(track('b', 6), mix);
    expect(engine.getDuration()).toBe(6);
    engine.removeTrack('b');
    expect(engine.getDuration()).toBe(4);
    engine.removeTrack('a');
    expect(engine.getState()).toBe('empty');
  });
});
